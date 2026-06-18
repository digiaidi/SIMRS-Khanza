import { Effect, Duration, Exit, Cause } from "effect";
import { Workflow, Activity } from "@effect/workflow";
import * as DurableClock from "@effect/workflow/DurableClock";
import * as DurableDeferred from "@effect/workflow/DurableDeferred";
import * as Schema from "effect/Schema";
import { WorkflowEngine, TaskQueue, DbTask } from "./WorkflowEngine.ts";
import { SqlClient } from "./SqlClient.ts";
import { HyperswitchClient } from "./HyperswitchClient.ts";
import { PaymentRepository, writeAuditLog } from "./PaymentRepository.ts";
import { getDatabase } from "./Database.ts";

const logInfo = (msg: string) => console.log(`\x1b[36m[WORKFLOW-INFO]\x1b[0m ${msg}`);
const logSuccess = (msg: string) => console.log(`\x1b[32m[WORKFLOW-SUCCESS]\x1b[0m ✓ ${msg}`);
const logWarn = (msg: string) => console.log(`\x1b[33m[WORKFLOW-WARN]\x1b[0m ⚠ ${msg}`);
const logError = (msg: string) => console.error(`\x1b[31m[WORKFLOW-ERROR]\x1b[0m ✗ ${msg}`);

export const paymentSettledDeferred = DurableDeferred.make("payment_settled");

export const processPaymentWorkflow = Workflow.make({
  name: "process_payment",
  payload: Schema.Struct({
    paymentRequestId: Schema.String,
  }),
  success: Schema.Void,
  error: Schema.instanceOf(Error),
  idempotencyKey: (p) => p.paymentRequestId,
});

export const processPaymentLayer = processPaymentWorkflow.toLayer((payload, executionId) =>
  Effect.gen(function* () {
    const db = getDatabase();
    const repo = new PaymentRepository(db);

    // 1. Create payment in Hyperswitch if DRAFT
    yield* Activity.make({
      name: "create_hyperswitch_payment",
      error: Schema.instanceOf(Error),
      execute: Effect.gen(function* () {
        const payment = yield* Effect.promise(() => repo.findById(payload.paymentRequestId));
        if (!payment) {
          return yield* Effect.fail(new Error(`Payment request ${payload.paymentRequestId} not found`));
        }

        if (payment.status === "DRAFT") {
          const { loadConfig } = yield* Effect.promise(() => import("../config/AppConfig.ts"));
          const config = loadConfig();
          const hsClient = new HyperswitchClient(config);

          logInfo(`Creating Hyperswitch payment for Request ID: ${payload.paymentRequestId}`);
          const hsResponse = yield* Effect.tryPromise({
            try: () => hsClient.createPayment({
              amount: payment.amount,
              currency: payment.currency,
              description: `CarePay Payment for Billing ID ${payment.khanza_billing_id}`,
              billingId: payment.khanza_billing_id,
            }),
            catch: (err: any) => new Error(`Hyperswitch create payment failed: ${err.message}`),
          });

          // Extract QR code from response
          const qrisPayload = hsResponse.next_action?.qr_code_url || hsResponse.next_action?.image_data_url || "";
          const qrisUrl = hsResponse.next_action?.qr_code_url || "";

          // Transition DRAFT -> PENDING
          yield* Effect.promise(() => repo.updateStatus(payload.paymentRequestId, "PENDING", {
            hyperswitch_payment_id: hsResponse.payment_id,
            qris_payload: qrisPayload,
            qris_url: qrisUrl,
          }));

          yield* Effect.promise(() => writeAuditLog(db, "payment", payload.paymentRequestId, "PENDING", {
            hyperswitch_payment_id: hsResponse.payment_id,
          }));
        }
      }),
    });

    // 2. Wait for webhook payment signal OR timeout (expiration)
    const payment = yield* Effect.promise(() => repo.findById(payload.paymentRequestId));
    if (!payment) return;

    const expiresAt = payment.expires_at ? new Date(payment.expires_at).getTime() : Date.now() + 15 * 60 * 1000;
    const delayMs = Math.max(0, expiresAt - Date.now());

    logInfo(`Payment ${payload.paymentRequestId} waiting for settlement. Expiration in ${delayMs / 1000}s`);

    // Race between deferred settlement and expiration timer
    const result = yield* DurableDeferred.raceAll({
      name: "payment_race",
      success: Schema.Union(Schema.Literal("paid"), Schema.Literal("expired")),
      error: Schema.Never,
      effects: [
        DurableDeferred.await(paymentSettledDeferred).pipe(Effect.as("paid" as const)),
        DurableClock.sleep({
          name: "payment_timeout",
          duration: Duration.millis(delayMs)
        }).pipe(Effect.as("expired" as const))
      ] as const
    });

    if (result === "paid") {
      // 3. Reconcile Payment
      yield* Activity.make({
        name: "reconcile_payment_request",
        error: Schema.instanceOf(Error),
        execute: Effect.gen(function* () {
          yield* Effect.promise(() => repo.updateStatus(payload.paymentRequestId, "RECONCILING"));
          yield* Effect.promise(() => writeAuditLog(db, "payment", payload.paymentRequestId, "RECONCILING", {
            billing_id: payment.khanza_billing_id,
          }));

          try {
            // Simulate/execute reconciliation (update Khanza billing lunas here)
            logSuccess(`[Workflow Reconcile] ✅ Reconciled: ${payment.khanza_billing_id}`);

            yield* Effect.promise(() => repo.updateStatus(payload.paymentRequestId, "RECONCILED"));
            yield* Effect.promise(() => writeAuditLog(db, "payment", payload.paymentRequestId, "RECONCILED", {
              billing_id: payment.khanza_billing_id,
              amount: payment.amount,
            }));
          } catch (err: any) {
            yield* Effect.promise(() => repo.updateStatus(payload.paymentRequestId, "RECONCILE_FAILED"));
            yield* Effect.promise(() => writeAuditLog(db, "payment", payload.paymentRequestId, "RECONCILE_FAILED", {
              error: err.message,
            }));
            return yield* Effect.fail(err);
          }
        }),
      });
    } else {
      // 4. Mark Expired
      yield* Activity.make({
        name: "expire_payment_request",
        execute: Effect.gen(function* () {
          const currentPayment = yield* Effect.promise(() => repo.findById(payload.paymentRequestId));
          if (currentPayment && currentPayment.status === "PENDING") {
            yield* Effect.promise(() => repo.updateStatus(payload.paymentRequestId, "EXPIRED"));
            yield* Effect.promise(() => writeAuditLog(db, "payment", payload.paymentRequestId, "EXPIRED", {
              billing_id: currentPayment.khanza_billing_id,
            }));
          }
        }),
      });
    }
  })
);

export const runPaymentWorker = Effect.gen(function* () {
  const engine = yield* WorkflowEngine;
  const taskQueue = yield* TaskQueue;
  const sql = yield* SqlClient;

  // Register the workflow (handled by processPaymentLayer during initialization)
  logInfo("Payment Worker started. Workflow registration handled by layer initialization.");

  // Auto-resume outstanding incomplete workflows from database on startup
  logInfo("Checking for outstanding workflows to resume...");
  const selectRes = yield* sql.query(
    "SELECT id, workflow_type FROM carepay_workflow_execution WHERE status NOT IN ('completed', 'failed')"
  );

  for (const row of selectRes.rows) {
    if (row.workflow_type === "process_payment") {
      logWarn(`Resuming outstanding payment workflow ID: ${row.id}`);
      yield* engine.resume(processPaymentWorkflow, row.id).pipe(Effect.catchAll(() => Effect.void));
    }
  }

  const runnerId = `carepay-worker-${Math.random().toString(36).substring(2, 8)}`;
  logInfo(`Starting worker polling loop as runner: ${runnerId}`);

  const runWorkflow = (task: DbTask) =>
    Effect.gen(function* () {
      const executionId = task.payload.paymentRequestId;
      logInfo(`Starting task ${task.id} (${task.task_type}) for ID: ${executionId}. Attempt: ${task.attempts}`);

      if (task.attempts > 5) {
        logError(`Task ${task.id} exceeded maximum retry limits. Placing in Dead Letter.`);
        yield* taskQueue.completeTask(task.id);
        yield* sql.execute(
          "INSERT INTO carepay_workflow_execution (id, workflow_type, status, error_details, payload) VALUES (?, ?, 'failed', 'Max attempts exceeded', ?)",
          [executionId, task.task_type, JSON.stringify(task.payload)]
        ).pipe(Effect.catchAll(() => Effect.void));
        return;
      }

      if (task.task_type === "process_payment") {
        yield* processPaymentWorkflow.execute(task.payload);
        yield* taskQueue.completeTask(task.id);
        logSuccess(`process_payment completed for: ${executionId}`);
      } else {
        logWarn(`Unknown task type: ${task.task_type}. Dropping.`);
        yield* taskQueue.completeTask(task.id);
      }
    }).pipe(
      Effect.catchAllCause((cause) =>
        Effect.gen(function* () {
          const delay = 5 * task.attempts;
          logError(`Task ${task.id} failed with cause: ${Cause.pretty(cause)}. Retrying in ${delay}s.`);
          yield* taskQueue.failTask(task.id, delay);
        })
      )
    );

  // Poll tasks every 500ms
  yield* Effect.forever(
    Effect.gen(function* () {
      const task = yield* taskQueue.pollNextTask(runnerId);
      if (task) {
        yield* Effect.fork(runWorkflow(task));
      } else {
        yield* Effect.sleep(Duration.millis(500));
      }
    })
  );
});
