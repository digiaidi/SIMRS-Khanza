// CarePay - Health & Metrics Routes
import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import { checkDatabaseHealth } from "../../services/Database.ts";
import { HyperswitchClient } from "../../services/HyperswitchClient.ts";
import { maskSecret } from "../../config/AppConfig.ts";

const startTime = Date.now();

export function createHealthRoutes(db: mysql.Pool, config: AppConfig): Hono {
  const app = new Hono();
  const hsClient = new HyperswitchClient(config);

  // GET /api/health — Deep health check
  app.get("/", async (c) => {
    const dbHealth = await checkDatabaseHealth();
    const hsHealth = await hsClient.checkHealth();

    const healthy = dbHealth.ok; // Hyperswitch may not be running in dev
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return c.json({
      status: healthy ? "healthy" : "degraded",
      uptime_seconds: uptimeSeconds,
      version: "1.0.0",
      facility: { id: config.facility.id, name: config.facility.name },
      checks: {
        database: dbHealth,
        hyperswitch: hsHealth,
        credentials_loaded: {
          speedcash_client_key: !!config.speedcash.clientKey,
          hyperswitch_api_key: !!config.hyperswitch.merchantApiKey,
        },
      },
      timestamp: new Date().toISOString(),
    }, healthy ? 200 : 503);
  });

  // GET /api/metrics — Basic metrics
  app.get("/metrics", async (c) => {
    try {
      const [statusCounts] = await db.query(
        `SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount 
         FROM carepay_payment_requests GROUP BY status`
      );
      const [todayCounts] = await db.query(
        `SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount 
         FROM carepay_payment_requests WHERE DATE(created_at) = CURDATE() GROUP BY status`
      );
      const [reconCounts] = await db.query(
        `SELECT status, COUNT(*) as count FROM carepay_reconciliation_jobs GROUP BY status`
      );

      return c.json({
        all_time: statusCounts,
        today: todayCounts,
        reconciliation: reconCounts,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  return app;
}
