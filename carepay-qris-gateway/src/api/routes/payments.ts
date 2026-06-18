// CarePay - Payment API Routes
import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import { PaymentRepository, writeAuditLog, savePaymentEvent } from "../../services/PaymentRepository.ts";
import { generateIdempotencyKey } from "../../services/IdempotencyService.ts";
import { HyperswitchClient } from "../../services/HyperswitchClient.ts";
import QRCode from "qrcode";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { Effect, Exit } from "effect";
import { TaskQueue, WorkflowEngine } from "../../services/WorkflowEngine.ts";
import { paymentSettledDeferred, processPaymentWorkflow } from "../../services/PaymentWorkflow.ts";

export function createPaymentRoutes(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();
  const repo = new PaymentRepository(db);
  const hsClient = new HyperswitchClient(config);

  // POST /api/payments/qris — Create QRIS payment from Khanza billing
  app.post("/qris", async (c) => {
    try {
      const body = await c.req.json();

      // Validate required fields
      const { billing_id, amount, facility_id, no_rawat, no_rkm_medis, patient_name, description } = body;
      if (!billing_id || !amount) {
        return c.json({ error: "billing_id and amount are required" }, 400);
      }
      if (amount <= 0) {
        return c.json({ error: "amount must be positive" }, 400);
      }

      // Generate idempotency key
      const idempotencyKey = generateIdempotencyKey(
        facility_id || config.facility.id,
        billing_id,
        amount,
        "QRIS"
      );

      // Check for existing payment with same idempotency key
      const existing = await repo.findByIdempotencyKey(idempotencyKey);
      if (existing && existing.status !== "EXPIRED" && existing.status !== "FAILED") {
        // Return existing payment (idempotent response)
        return c.json({
          payment_request_id: existing.payment_request_id,
          status: existing.status,
          amount: existing.amount,
          currency: existing.currency,
          qris_payload: existing.qris_payload,
          qris_url: existing.qris_url,
          expires_at: existing.expires_at,
          idempotent: true,
        });
      }

      // Create payment request
      const payment = await repo.create({
        khanza_billing_id: billing_id,
        no_rawat: no_rawat,
        no_rkm_medis: no_rkm_medis,
        patient_name: patient_name,
        amount: amount,
        facility_id: facility_id || config.facility.id,
        idempotency_key: idempotencyKey,
      });

      await writeAuditLog(db, "payment", payment.payment_request_id, "CREATED", {
        billing_id,
        amount,
        idempotency_key: idempotencyKey,
      });

      // Try creating payment in Hyperswitch
      let qrisString = "";
      let qrDataUrl = "";
      let hsPaymentId: string | null = null;

      try {
        const hsResponse = await hsClient.createPayment({
          amount: amount,
          currency: "IDR",
          description: description || `CarePay QRIS Billing ${billing_id}`,
          billingId: billing_id,
        });

        hsPaymentId = hsResponse.payment_id;
        qrisString = hsResponse.next_action?.qr_code_url || hsResponse.next_action?.image_data_url || "";
        qrDataUrl = hsResponse.next_action?.qr_code_url || "";
      } catch (hsErr: any) {
        console.warn("[Payment] Hyperswitch call failed, falling back to mock QRIS:", hsErr.message);
        // Fallback mock
        qrisString = `00020101021226580016COM.CAREPAY.QRIS0136${payment.payment_request_id}5204541253033605802ID5913${(patient_name || "PASIEN").substring(0, 13)}6007JAKARTA6105101106304`;
        qrDataUrl = await QRCode.toDataURL(qrisString, {
          width: 400,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
      }

      // Transition to PENDING
      const updated = await repo.updateStatus(payment.payment_request_id, "PENDING", {
        hyperswitch_payment_id: hsPaymentId,
        qris_payload: qrisString,
        qris_url: qrDataUrl,
      });

      await writeAuditLog(db, "payment", payment.payment_request_id, "QRIS_GENERATED", {
        qris_length: qrisString.length,
      });

      // Enqueue to the Effect Workflow task queue
      runtime.runPromise(
        Effect.gen(function* () {
          const taskQueue = yield* TaskQueue;
          yield* taskQueue.enqueueTask("process_payment", { paymentRequestId: payment.payment_request_id });
        })
      ).catch((err) => {
        console.error("[Payment] Failed to enqueue workflow task:", err);
      });

      console.log(
        `[Payment] ✅ QRIS created: ${payment.payment_request_id} | ${billing_id} | Rp ${amount.toLocaleString("id-ID")}`
      );

      return c.json({
        payment_request_id: updated.payment_request_id,
        status: updated.status,
        amount: updated.amount,
        currency: updated.currency,
        qris_payload: updated.qris_payload,
        qris_url: updated.qris_url,
        expires_at: updated.expires_at,
      }, 201);
    } catch (err: any) {
      console.error("[Payment] Create QRIS error:", err.message);
      return c.json({ error: err.message }, 500);
    }
  });

  // GET /api/payments/:id — Get payment status
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const payment = await repo.findById(id);
    if (!payment) {
      return c.json({ error: "Payment not found" }, 404);
    }
    return c.json(payment);
  });

  // GET /api/payments — List payments with filters
  app.get("/", async (c) => {
    const status = c.req.query("status") as any;
    const facility_id = c.req.query("facility_id");
    const from_date = c.req.query("from_date");
    const to_date = c.req.query("to_date");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const result = await repo.listPayments({
      status,
      facility_id,
      from_date,
      to_date,
      limit,
      offset,
    });

    return c.json(result);
  });

  // POST /api/payments/:id/simulate-paid — Simulate webhook PAID (for testing)
  app.post("/:id/simulate-paid", async (c) => {
    try {
      const id = c.req.param("id");
      const payment = await repo.findById(id);
      if (!payment) return c.json({ error: "Payment not found" }, 404);
      if (payment.status !== "PENDING") {
        return c.json({ error: `Cannot pay: current status is ${payment.status}` }, 400);
      }

      // Save event
      await savePaymentEvent(db, id, "PAYMENT_SUCCESS", {
        source: "simulate",
        timestamp: new Date().toISOString(),
      }, "simulate", true);

      // Transition to PAID
      await repo.updateStatus(id, "PAID", { paid_at: new Date() });
      await writeAuditLog(db, "payment", id, "PAID", { source: "simulate" });

      // Signal/Resume the workflow via Effect
      runtime.runPromise(
        Effect.gen(function* () {
          const engine = yield* WorkflowEngine;
          const executionId = yield* processPaymentWorkflow.executionId({
            paymentRequestId: id
          });
          yield* engine.deferredDone(
            paymentSettledDeferred,
            {
              workflowName: "process_payment",
              executionId: executionId,
              deferredName: "payment_settled",
              exit: Exit.void
            }
          );
        })
      ).catch((err) => {
        console.error("[Simulation] Failed to signal workflow:", err);
      });

      const updated = await repo.findById(id);
      return c.json(updated);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
