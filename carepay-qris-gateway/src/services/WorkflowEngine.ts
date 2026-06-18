import { Effect, Context, Layer } from "effect";
import { WorkflowEngine as WorkflowEngineNamespace, Workflow } from "@effect/workflow";
import * as FiberMap from "effect/FiberMap";
import * as Scope from "effect/Scope";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { SqlClient } from "./SqlClient.ts";

// Helper for safe JSON parsing across different SQL client drivers
const parseJson = (value: any) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
};

// Extract the types and namespaces correctly to match @effect/workflow layout
const WorkflowInstance = WorkflowEngineNamespace.WorkflowInstance;
type WorkflowInstance = WorkflowEngineNamespace.WorkflowInstance;

export const WorkflowEngine = WorkflowEngineNamespace.WorkflowEngine;
export type WorkflowEngine = WorkflowEngineNamespace.WorkflowEngine;

const resultSchema = Workflow.Result({ success: Schema.Any, error: Schema.Any });
const encodeResult = Schema.encodeSync(resultSchema);
const decodeResult = Schema.decodeSync(resultSchema);

const exitSchema = Schema.Exit({ success: Schema.Any, failure: Schema.Any, defect: Schema.Any });
const encodeExit = Schema.encodeSync(exitSchema);
const decodeExit = Schema.decodeSync(exitSchema);

export type DbTask = {
  readonly id: string;
  readonly task_type: string;
  readonly payload: any;
  readonly attempts: number;
};

// --- TASK QUEUE SERVICE (Outbox Pattern management) ---
export interface TaskQueue {
  readonly enqueueTask: (
    taskType: string,
    payload: any,
    runAfterDelaySeconds?: number
  ) => Effect.Effect<void, Error>;

  readonly pollNextTask: (runnerId: string) => Effect.Effect<DbTask | null, Error>;

  readonly completeTask: (taskId: string) => Effect.Effect<void, Error>;

  readonly failTask: (
    taskId: string,
    runAfterDelaySeconds: number
  ) => Effect.Effect<void, Error>;
}

export const TaskQueue = Context.GenericTag<TaskQueue>("TaskQueue");

export const TaskQueueLive = Layer.effect(
  TaskQueue,
  Effect.gen(function* () {
    const sql = yield* SqlClient;

    return {
      enqueueTask: (taskType, payload, runAfterDelaySeconds = 0) =>
        Effect.gen(function* () {
          const runAfter = new Date(Date.now() + runAfterDelaySeconds * 1000);
          yield* sql.execute(
            "INSERT INTO carepay_task_queue (task_type, payload, run_after) VALUES (?, ?, ?)",
            [taskType, JSON.stringify(payload), runAfter]
          );
        }),

      pollNextTask: (runnerId) =>
        Effect.gen(function* () {
          const now = new Date();
          const lockTimeout = new Date(Date.now() + 5 * 60 * 1000); // Lock for 5 minutes

          const pollRes = yield* sql.query(
            `SELECT id, task_type, payload, attempts FROM carepay_task_queue 
             WHERE (locked_by IS NULL OR locked_until < ?) 
               AND run_after <= ? 
             ORDER BY run_after ASC 
             LIMIT 1`,
            [now, now]
          );

          if (pollRes.rows.length === 0) {
            return null;
          }

          const taskRow = pollRes.rows[0];
          const taskId = taskRow.id;

          yield* sql.execute(
            `UPDATE carepay_task_queue 
             SET locked_by = ?, locked_until = ?, attempts = attempts + 1 
             WHERE id = ? AND (locked_by IS NULL OR locked_until < ?)`,
            [runnerId, lockTimeout, taskId, now]
          );

          return {
            id: String(taskId),
            task_type: taskRow.task_type,
            payload: parseJson(taskRow.payload),
            attempts: Number(taskRow.attempts) + 1,
          } satisfies DbTask;
        }),

      completeTask: (taskId) =>
        sql.execute("DELETE FROM carepay_task_queue WHERE id = ?", [taskId]).pipe(Effect.asVoid),

      failTask: (taskId, runAfterDelaySeconds) =>
        Effect.gen(function* () {
          const runAfter = new Date(Date.now() + runAfterDelaySeconds * 1000);
          yield* sql.execute(
            `UPDATE carepay_task_queue 
             SET locked_by = NULL, locked_until = NULL, run_after = ? 
             WHERE id = ?`,
            [runAfter, taskId]
          );
        }),
    } satisfies TaskQueue;
  })
);

// --- @EFFECT/WORKFLOW MYSQL PERSISTENCE ENGINE ---
export const WorkflowEngineMysql = Layer.scoped(
  WorkflowEngine,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const scope = yield* Effect.scope;

    const registeredWorkflows = new Map<
      string,
      {
        workflow: Workflow.Any;
        execute: (payload: any, executionId: string) => Effect.Effect<any, any, any>;
        scope: Scope.Scope;
      }
    >();

    const activeExecutions = new Map<
      string,
      {
        fiber: Fiber.RuntimeFiber<Workflow.Result<unknown, unknown>, never>;
        instance: WorkflowInstance["Type"];
        payload: any;
        parent?: string;
        execute: (payload: any, executionId: string) => Effect.Effect<any, any, WorkflowInstance | WorkflowEngine>;
      }
    >();

    const clocks = yield* FiberMap.make();

    const resume: (executionId: string) => Effect.Effect<void, never, never> = Effect.fnUntraced(function* (executionId: string) {
      const state = activeExecutions.get(executionId);
      if (!state) return;

      const exit = state.fiber?.unsafePoll();
      if (exit && exit._tag === "Success" && exit.value._tag === "Complete") {
        return;
      } else if (state.fiber && !exit) {
        return;
      }

      const entry = registeredWorkflows.get(state.instance.workflow.name);
      if (!entry) return;

      const instance = WorkflowInstance.initial(state.instance.workflow, state.instance.executionId);
      instance.interrupted = state.instance.interrupted;
      state.instance = instance;

      state.fiber = yield* state.execute(state.payload, state.instance.executionId).pipe(
        Workflow.intoResult,
        Effect.onExit((exitValue) => {
          return Effect.gen(function* () {
            if (instance.interrupted) {
              instance.suspended = false;
              yield* sql.execute(
                "UPDATE carepay_workflow_execution SET status = 'interrupted', interrupted = 1 WHERE id = ?",
                [executionId]
              ).pipe(Effect.catchAll(() => Effect.void));
              yield* Effect.withFiberRuntime((fiber) => Effect.interruptible(Fiber.interrupt(fiber)));
              return;
            }

             if (exitValue._tag === "Success") {
              const resultObj = exitValue.value;
              if (resultObj._tag === "Complete") {
                const innerExit = resultObj.exit;
                if (innerExit._tag === "Success") {
                  yield* sql.execute(
                    "UPDATE carepay_workflow_execution SET status = 'completed', result = ?, error_details = NULL WHERE id = ?",
                    [JSON.stringify(encodeResult(resultObj)), executionId]
                  ).pipe(Effect.catchAll(() => Effect.void));
                } else {
                  yield* sql.execute(
                    "UPDATE carepay_workflow_execution SET status = 'failed', result = ?, error_details = ? WHERE id = ?",
                    [JSON.stringify(encodeResult(resultObj)), Cause.pretty(innerExit.cause), executionId]
                  ).pipe(Effect.catchAll(() => Effect.void));
                }
              } else if (resultObj._tag === "Suspended") {
                yield* sql.execute(
                  "UPDATE carepay_workflow_execution SET status = 'suspended', result = ?, error_details = ? WHERE id = ?",
                  [JSON.stringify(encodeResult(resultObj)), resultObj.cause ? Cause.pretty(resultObj.cause) : null, executionId]
                ).pipe(Effect.catchAll(() => Effect.void));
              }
            } else {
              yield* sql.execute(
                "UPDATE carepay_workflow_execution SET status = 'failed', error_details = ? WHERE id = ?",
                [Cause.pretty(exitValue.cause), executionId]
              ).pipe(Effect.catchAll(() => Effect.void));
            }
          });
        }),
        Effect.provideService(WorkflowInstance, instance),
        Effect.provideService(WorkflowEngine, engine),
        Effect.tap((result) => {
          if (!state.parent || result._tag !== "Complete") {
            return Effect.void;
          }
          return Effect.forkIn(resume(state.parent), scope);
        }),
        Effect.forkIn(entry.scope)
      );
    });

    const engine = WorkflowEngineNamespace.makeUnsafe({
      register: Effect.fnUntraced(function* (workflow, execute) {
        registeredWorkflows.set(workflow.name, {
          workflow,
          execute,
          scope: yield* Effect.scope
        });
      }),

      execute: Effect.fnUntraced(function* (workflow, options) {
        const entry = registeredWorkflows.get(workflow.name);
        if (!entry) {
          return yield* Effect.die(`Workflow ${workflow.name} is not registered`);
        }

        let state = activeExecutions.get(options.executionId);
        if (!state) {
          const selectRes = yield* sql.query(
            "SELECT status, interrupted, payload, result FROM carepay_workflow_execution WHERE id = ?",
            [options.executionId]
          ).pipe(Effect.orDie);

          let isInterrupted = false;
          let loadedPayload = options.payload;

          if (selectRes.rows.length === 0) {
            yield* sql.execute(
              `INSERT INTO carepay_workflow_execution (id, workflow_type, status, payload, interrupted) 
               VALUES (?, ?, 'running', ?, 0) 
               ON DUPLICATE KEY UPDATE status = 'running', payload = VALUES(payload), interrupted = 0`,
              [options.executionId, workflow.name, JSON.stringify(options.payload)]
            ).pipe(Effect.orDie);
          } else {
            const dbRow = selectRes.rows[0];
            isInterrupted = Boolean(dbRow.interrupted);
            loadedPayload = parseJson(dbRow.payload);
            
            if (dbRow.status === "completed" && dbRow.result) {
              if (options.discard) return;
              return decodeResult(parseJson(dbRow.result)) as any;
            }
          }

          const instance = WorkflowInstance.initial(workflow, options.executionId);
          instance.interrupted = isInterrupted;

          state = {
            payload: loadedPayload,
            execute: entry.execute,
            instance,
            fiber: undefined as any,
            parent: options.parent?.executionId
          };

          activeExecutions.set(options.executionId, state);
          yield* resume(options.executionId);
        }

        if (options.discard) return;
        return yield* Fiber.join(state.fiber);
      }),

      interrupt: Effect.fnUntraced(function* (_workflow, executionId) {
        const state = activeExecutions.get(executionId);
        yield* sql.execute(
          "UPDATE carepay_workflow_execution SET interrupted = 1 WHERE id = ?",
          [executionId]
        ).pipe(Effect.orDie);
        if (!state) return;
        state.instance.interrupted = true;
        yield* resume(executionId);
      }),

      resume: (_workflow, executionId) => resume(executionId),

      activityExecute: Effect.fnUntraced(function* (activity, attempt) {
        const instance = yield* WorkflowInstance;
        const activityId = `${instance.executionId}:${activity.name}:${attempt}`;

        const checkRes = yield* sql.query(
          "SELECT status, output_data FROM carepay_activity_execution WHERE id = ?",
          [activityId]
        ).pipe(Effect.orDie);

        if (checkRes.rows.length > 0) {
          const dbRow = checkRes.rows[0];
          if (dbRow.status === "success" || dbRow.status === "failed") {
            return decodeResult(parseJson(dbRow.output_data));
          }
        }

        yield* sql.execute(
          `INSERT INTO carepay_activity_execution (id, workflow_id, activity_name, status, retry_count) 
           VALUES (?, ?, ?, 'running', ?) 
           ON DUPLICATE KEY UPDATE status = 'running', retry_count = VALUES(retry_count)`,
          [activityId, instance.executionId, activity.name, attempt]
        ).pipe(Effect.orDie);

        const activityInstance = WorkflowInstance.initial(instance.workflow, instance.executionId);
        activityInstance.interrupted = instance.interrupted;

        const result = yield* activity.executeEncoded.pipe(
          Workflow.intoResult,
          Effect.provideService(WorkflowInstance, activityInstance),
          Effect.onExit((exit) => {
            return Effect.gen(function* () {
              if (exit._tag === "Success") {
                const resObj = exit.value;
                const statusStr = resObj._tag === "Complete" && resObj.exit._tag === "Success" ? "success" : "failed";
                yield* sql.execute(
                  "UPDATE carepay_activity_execution SET status = ?, output_data = ? WHERE id = ?",
                  [statusStr, JSON.stringify(encodeResult(resObj)), activityId]
                ).pipe(Effect.catchAll(() => Effect.void));
              } else {
                yield* sql.execute(
                  "UPDATE carepay_activity_execution SET status = 'failed', error_details = ? WHERE id = ?",
                  [Cause.pretty(exit.cause), activityId]
                ).pipe(Effect.catchAll(() => Effect.void));
              }
            });
          })
        );

        return result;
      }),

      poll: (_workflow, executionId) =>
        Effect.gen(function* () {
          const selectRes = yield* sql.query(
            "SELECT status, result FROM carepay_workflow_execution WHERE id = ?",
            [executionId]
          ).pipe(Effect.orDie);

          if (selectRes.rows.length > 0) {
            const dbRow = selectRes.rows[0];
            if (dbRow.status === "completed" && dbRow.result) {
              return decodeResult(parseJson(dbRow.result));
            }
          }

          const state = activeExecutions.get(executionId);
          if (!state) return undefined;
          const exit = state.fiber?.unsafePoll();
          return exit && Exit.isSuccess(exit) ? exit.value : undefined;
        }),

      deferredResult: Effect.fnUntraced(function* (deferred) {
        const instance = yield* WorkflowInstance;
        const id = `${instance.executionId}:${deferred.name}`;

        const selectRes = yield* sql.query(
          "SELECT exit_data FROM carepay_deferred_result WHERE id = ?",
          [id]
        ).pipe(Effect.orDie);

        if (selectRes.rows.length > 0) {
          return decodeExit(parseJson(selectRes.rows[0].exit_data));
        }
        return undefined;
      }),

      deferredDone: (options) =>
        Effect.gen(function* () {
          const id = `${options.executionId}:${options.deferredName}`;

          yield* sql.execute(
            `INSERT INTO carepay_deferred_result (id, workflow_id, deferred_name, exit_data) 
             VALUES (?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE exit_data = VALUES(exit_data)`,
            [id, options.executionId, options.deferredName, JSON.stringify(encodeExit(options.exit))]
          ).pipe(Effect.orDie);

          yield* resume(options.executionId);
        }),

      scheduleClock: (workflow, options) =>
        engine.deferredDone(options.clock.deferred, {
          workflowName: workflow.name,
          executionId: options.executionId,
          deferredName: options.clock.deferred.name,
          exit: Exit.void
        }).pipe(
          Effect.delay(options.clock.duration),
          FiberMap.run(clocks, `${options.executionId}/${options.clock.name}`, {
            onlyIfMissing: true
          }),
          Effect.asVoid
        )
    });

    return engine;
  })
);

export const WorkflowEngineLive = WorkflowEngineMysql;
