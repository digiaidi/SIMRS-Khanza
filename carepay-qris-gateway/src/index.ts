// CarePay QRIS Gateway - Entry Point
import { loadConfig, maskSecret } from "./config/AppConfig.ts";
import { createDatabase, runMigrations } from "./services/Database.ts";
import { createServer } from "./api/server.ts";
import { SqlClientLive } from "./services/SqlClient.ts";
import { WorkflowEngineLive, TaskQueueLive } from "./services/WorkflowEngine.ts";
import { runPaymentWorker, processPaymentLayer } from "./services/PaymentWorkflow.ts";
import { SpeedCashLinkageServiceLive, SpeedCashLinkageServiceMock } from "./services/SpeedCashLinkageService.ts";
import { KYCServiceLive, KYCServiceMock } from "./services/KYCService.ts";
import { Layer, ManagedRuntime } from "effect";

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║         CarePay QRIS Gateway v1.0.0              ║
║    Aplikasi Satelit Payment System Khanza        ║
║         Powered by Effect TS & Workflow          ║
╚══════════════════════════════════════════════════╝
  `);

  // Load config
  const config = loadConfig();
  console.log(`[Config] Facility: ${config.facility.name} (${config.facility.id})`);
  console.log(`[Config] DB: ${config.db.host}:${config.db.port}/${config.db.name}`);
  console.log(`[Config] Hyperswitch: ${config.hyperswitch.baseUrl}`);
  console.log(`[Config] API Port: ${config.carepay.apiPort}`);
  console.log(`[Config] API Key: ${maskSecret(config.carepay.apiKey)}`);

  const isMock = process.env.SPEEDCASH_MOCK === "true";
  console.log(`[Config] SpeedCash Mode: ${isMock ? "MOCK (Simulator)" : "LIVE"}`);

  // Connect to database & run migrations
  const db = createDatabase(config);
  console.log("[DB] Connecting to Khanza database...");
  
  try {
    await runMigrations(db);
  } catch (e: any) {
    if (e.message.includes("already exists") || e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("[DB] ✅ Tables already exist, skipping migration");
    } else {
      console.error("[DB] ❌ Migration failed:", e.message);
      // Continue anyway - tables might already exist
    }
  }

  // Compose the Layer dependency injection graph using dynamic Mock / Live layers
  const linkageLayer = isMock ? SpeedCashLinkageServiceMock : SpeedCashLinkageServiceLive;
  const kycLayer = isMock ? KYCServiceMock : KYCServiceLive.pipe(Layer.provide(linkageLayer));

  const MainLayer = Layer.mergeAll(
    WorkflowEngineLive,
    TaskQueueLive,
    processPaymentLayer.pipe(Layer.provide(WorkflowEngineLive)),
    linkageLayer,
    kycLayer
  ).pipe(
    Layer.provideMerge(SqlClientLive)
  );

  // Create the managed runtime to bridge Hono with Effect environment
  const runtime = ManagedRuntime.make(MainLayer);

  // Start the background payment worker
  const workerPromise = runtime.runPromise(runPaymentWorker);
  workerPromise.catch((err) => {
    console.error("[CarePay] ❌ Worker loop crashed:", err);
  });

  // Create and start Hono HTTP server
  const app = createServer(db, config, runtime);

  console.log(`\n[CarePay] 🚀 Server starting on port ${config.carepay.apiPort}`);
  console.log(`[CarePay] 📊 Dashboard: http://localhost:${config.carepay.apiPort}/`);
  console.log(`[CarePay] 🔗 API: http://localhost:${config.carepay.apiPort}/api/`);
  console.log(`[CarePay] 💚 Health: http://localhost:${config.carepay.apiPort}/api/health\n`);

  const server = Bun.serve({
    port: config.carepay.apiPort,
    fetch: app.fetch,
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[CarePay] Shutting down...");
    await runtime.dispose();
    server.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[CarePay] ❌ Fatal error:", err);
  process.exit(1);
});
