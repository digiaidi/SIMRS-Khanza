// CarePay - Reconciliation API Routes
import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import { ReconciliationEngine } from "../../services/ReconciliationEngine.ts";
import { getReconciliationJobs } from "../../services/PaymentRepository.ts";
import type * as ManagedRuntime from "effect/ManagedRuntime";

export function createReconciliationRoutes(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();
  const reconEngine = new ReconciliationEngine(db, runtime);

  // GET /api/reconciliation/jobs — List reconciliation jobs
  app.get("/jobs", async (c) => {
    const status = c.req.query("status");
    const jobs = await getReconciliationJobs(db, status);
    return c.json({ data: jobs, total: jobs.length });
  });

  // POST /api/reconciliation/retry/:id — Retry a failed job
  app.post("/retry/:id", async (c) => {
    try {
      const jobId = c.req.param("id");
      await reconEngine.retryReconciliation(jobId);
      return c.json({ status: "retried", job_id: jobId });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
