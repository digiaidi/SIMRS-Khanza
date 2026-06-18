// CarePay - Hono HTTP Server
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../config/AppConfig.ts";
import { createPaymentRoutes } from "./routes/payments.ts";
import { createWebhookRoutes } from "./routes/webhooks.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createReconciliationRoutes } from "./routes/reconciliation.ts";
import { createWalletRoutes } from "./routes/wallets.ts";
import { createMerchantRoutes } from "./routes/merchants.ts";
import { nanoid } from "nanoid";
import type * as ManagedRuntime from "effect/ManagedRuntime";

export function createServer(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();

  // Middleware
  app.use("*", cors());
  app.use("*", logger());

  // Correlation ID
  app.use("*", async (c, next) => {
    const correlationId = c.req.header("x-correlation-id") || `cid_${nanoid(12)}`;
    c.header("x-correlation-id", correlationId);
    return await next();
  });

  // API Key auth for /api/* (except health, webhooks, and binding confirm)
  app.use("/api/payments/*", async (c, next) => {
    const apiKey = c.req.header("x-api-key") || c.req.header("api-key");
    if (apiKey !== config.carepay.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return await next();
  });

  app.use("/api/reconciliation/*", async (c, next) => {
    const apiKey = c.req.header("x-api-key") || c.req.header("api-key");
    if (apiKey !== config.carepay.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return await next();
  });

  app.use("/api/wallets/*", async (c, next) => {
    if (c.req.path === "/api/wallets/binding/confirm") {
      return await next();
    }
    const apiKey = c.req.header("x-api-key") || c.req.header("api-key");
    if (apiKey !== config.carepay.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return await next();
  });

  app.use("/api/merchants/*", async (c, next) => {
    const apiKey = c.req.header("x-api-key") || c.req.header("api-key");
    if (apiKey !== config.carepay.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return await next();
  });

  // Mount routes
  app.route("/api/payments", createPaymentRoutes(db, config, runtime));
  app.route("/api/webhooks", createWebhookRoutes(db, config, runtime));
  app.route("/api/health", createHealthRoutes(db, config));
  app.route("/api/reconciliation", createReconciliationRoutes(db, config, runtime));
  app.route("/api/wallets", createWalletRoutes(db, config, runtime));
  app.route("/api/merchants", createMerchantRoutes(db, config, runtime));

  // Serve dashboard - static files
  app.get("/", async (c) => {
    const html = await Bun.file(
      new URL("../../dashboard/index.html", import.meta.url).pathname
    ).text();
    return c.html(html);
  });

  app.get("/dashboard/*", async (c) => {
    const path = c.req.path.replace("/dashboard/", "");
    try {
      const file = Bun.file(
        new URL(`../../dashboard/${path}`, import.meta.url).pathname
      );
      const content = await file.text();
      const ext = path.split(".").pop();
      const contentType = ext === "css" ? "text/css" : ext === "js" ? "application/javascript" : "text/html";
      return new Response(content, { headers: { "Content-Type": contentType } });
    } catch {
      return c.json({ error: "Not found" }, 404);
    }
  });

  return app;
}
