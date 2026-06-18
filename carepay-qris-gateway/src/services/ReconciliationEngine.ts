// CarePay - Reconciliation Engine
// Auto-reconciles PAID payments to Khanza database
import type mysql from "mysql2/promise";
import { PaymentRepository, writeAuditLog, createReconciliationJob } from "./PaymentRepository.ts";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { Effect } from "effect";
import { WorkflowEngine } from "./WorkflowEngine.ts";
import { processPaymentWorkflow } from "./PaymentWorkflow.ts";

export class ReconciliationEngine {
  private repo: PaymentRepository;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: mysql.Pool,
    private runtime?: ManagedRuntime.ManagedRuntime<any, any>
  ) {
    this.repo = new PaymentRepository(db);
  }

  /** Process a single PAID payment through reconciliation */
  async reconcilePayment(paymentRequestId: string): Promise<void> {
    const payment = await this.repo.findById(paymentRequestId);
    if (!payment) throw new Error(`Payment ${paymentRequestId} not found`);
    if (payment.status !== "PAID") {
      throw new Error(`Payment ${paymentRequestId} is ${payment.status}, not PAID`);
    }

    // Transition to RECONCILING
    await this.repo.updateStatus(paymentRequestId, "RECONCILING");
    await writeAuditLog(this.db, "payment", paymentRequestId, "RECONCILING", {
      billing_id: payment.khanza_billing_id,
    });

    try {
      // TODO: When Khanza billing table is mapped, update status lunas here
      // For now, simulate reconciliation to billing mock
      // Example: UPDATE piutang_pasien SET status = 'Lunas' WHERE no_rawat = ?
      console.log(
        `[Reconciliation] ✅ Mock reconciled: ${payment.khanza_billing_id} = Rp ${payment.amount.toLocaleString("id-ID")}`
      );

      await this.repo.updateStatus(paymentRequestId, "RECONCILED");
      await writeAuditLog(this.db, "payment", paymentRequestId, "RECONCILED", {
        billing_id: payment.khanza_billing_id,
        amount: payment.amount,
      });
    } catch (err: any) {
      console.error(`[Reconciliation] ❌ Failed: ${paymentRequestId}`, err.message);
      await this.repo.updateStatus(paymentRequestId, "RECONCILE_FAILED");
      
      // Update reconciliation job with error
      await this.db.query(
        `UPDATE carepay_reconciliation_jobs SET status = 'FAILED', last_error = ?, retry_count = retry_count + 1,
         next_retry_at = DATE_ADD(NOW(), INTERVAL POWER(2, retry_count) * 30 SECOND)
         WHERE payment_request_id = ? AND status IN ('PENDING', 'RUNNING')`,
        [err.message, paymentRequestId]
      );

      await writeAuditLog(this.db, "payment", paymentRequestId, "RECONCILE_FAILED", {
        error: err.message,
      });
    }
  }

  /** Retry a failed reconciliation job */
  async retryReconciliation(jobId: string): Promise<void> {
    const [rows] = await this.db.query(
      "SELECT * FROM carepay_reconciliation_jobs WHERE job_id = ?",
      [jobId]
    );
    const job = (rows as any[])[0];
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.retry_count >= job.max_retries) {
      await this.db.query(
        "UPDATE carepay_reconciliation_jobs SET status = 'DLQ' WHERE job_id = ?",
        [jobId]
      );
      throw new Error(`Job ${jobId} exceeded max retries, moved to DLQ`);
    }

    // Reset payment status to PAID for re-reconciliation
    const payment = await this.repo.findById(job.payment_request_id);
    if (payment && payment.status === "RECONCILE_FAILED") {
      // Transition back: RECONCILE_FAILED → RECONCILING
      await this.db.query(
        "UPDATE carepay_payment_requests SET status = 'PAID' WHERE payment_request_id = ?",
        [job.payment_request_id]
      );
    }

    await this.db.query(
      "UPDATE carepay_reconciliation_jobs SET status = 'PENDING' WHERE job_id = ?",
      [jobId]
    );

    if (this.runtime) {
      // If we have an Effect runtime, trigger resumption of workflow!
      const db = this.db;
      await this.runtime.runPromise(
        Effect.gen(function* () {
          const engine = yield* WorkflowEngine;
          const executionId = yield* processPaymentWorkflow.executionId({
            paymentRequestId: job.payment_request_id
          });
          // Set workflow state back to running in DB
          yield* Effect.promise(() => db.query(
            "UPDATE carepay_workflow_execution SET status = 'running', error_details = NULL WHERE id = ?",
            [executionId]
          ));
          yield* engine.resume(processPaymentWorkflow, executionId);
        })
      );
    } else {
      await this.reconcilePayment(job.payment_request_id);
    }
  }

  /** Run periodic check for pending reconciliation jobs */
  startPeriodicCheck(intervalMs: number = 30000): void {
    console.log(`[Reconciliation] Periodic check started (every ${intervalMs / 1000}s)`);
    this.timer = setInterval(async () => {
      try {
        const [rows] = await this.db.query(
          `SELECT * FROM carepay_reconciliation_jobs 
           WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           LIMIT 10`
        );
        const jobs = rows as any[];
        for (const job of jobs) {
          await this.db.query(
            "UPDATE carepay_reconciliation_jobs SET status = 'RUNNING' WHERE job_id = ?",
            [job.job_id]
          );
          await this.reconcilePayment(job.payment_request_id);
          await this.db.query(
            "UPDATE carepay_reconciliation_jobs SET status = 'SUCCESS', completed_at = NOW() WHERE job_id = ?",
            [job.job_id]
          );
        }
      } catch (e: any) {
        console.error("[Reconciliation] Periodic check error:", e.message);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

/** Expiration checker - marks expired PENDING payments */
export class ExpirationChecker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private db: mysql.Pool) {}

  start(intervalMs: number = 30000): void {
    console.log(`[Expiration] Checker started (every ${intervalMs / 1000}s)`);
    this.timer = setInterval(async () => {
      try {
        const repo = new PaymentRepository(this.db);
        const expired = await repo.findExpiredPending();
        for (const payment of expired) {
          await repo.updateStatus(payment.payment_request_id, "EXPIRED");
          await writeAuditLog(this.db, "payment", payment.payment_request_id, "EXPIRED", {
            billing_id: payment.khanza_billing_id,
            expired_at: payment.expires_at,
          });
          console.log(`[Expiration] ⏰ ${payment.payment_request_id} expired`);
        }
      } catch (e: any) {
        console.error("[Expiration] Check error:", e.message);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
