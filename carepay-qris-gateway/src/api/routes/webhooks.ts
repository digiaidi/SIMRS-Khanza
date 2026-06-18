// CarePay - Webhook Routes
import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import { PaymentRepository, writeAuditLog, savePaymentEvent } from "../../services/PaymentRepository.ts";
import crypto from "crypto";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { Effect, Exit } from "effect";
import { WorkflowEngine } from "../../services/WorkflowEngine.ts";
import { paymentSettledDeferred, processPaymentWorkflow } from "../../services/PaymentWorkflow.ts";

export function createWebhookRoutes(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();
  const repo = new PaymentRepository(db);

  // POST /api/webhooks/hyperswitch — Receive payment webhook
  app.post("/hyperswitch", async (c) => {
    try {
      const rawBody = await c.req.text();
      const body = JSON.parse(rawBody);

      // Verify signature
      const signature = c.req.header("x-webhook-signature") || c.req.header("x-signature") || "";
      const signatureValid = verifyWebhookSignature(rawBody, signature, config.carepay.webhookSecret);

      console.log(`[Webhook] Received: type=${body.event_type || body.type || "unknown"} sig_valid=${signatureValid}`);

      // Extract payment ID from webhook payload
      const paymentId = body.content?.object?.payment_id || body.payment_id || body.data?.payment_id;
      const eventType = body.event_type || body.type || "UNKNOWN";

      if (!paymentId) {
        // Still save the event for audit
        await writeAuditLog(db, "webhook", "unknown", "WEBHOOK_NO_PAYMENT_ID", { body });
        return c.json({ status: "ignored", reason: "no payment_id" });
      }

      // Find matching payment by hyperswitch_payment_id or speedcash_trx_id
      const [rows] = await db.query(
        `SELECT * FROM carepay_payment_requests 
         WHERE hyperswitch_payment_id = ? OR speedcash_trx_id = ? OR payment_request_id = ?
         LIMIT 1`,
        [paymentId, paymentId, paymentId]
      );
      const payments = rows as any[];

      if (payments.length === 0) {
        await writeAuditLog(db, "webhook", paymentId, "WEBHOOK_PAYMENT_NOT_FOUND", { body });
        return c.json({ status: "ignored", reason: "payment not found" });
      }

      const payment = payments[0];

      // Save raw event
      const eventId = await savePaymentEvent(db, payment.payment_request_id, eventType, body, "webhook", signatureValid);

      // Process based on event type
      if (eventType.includes("SUCCESS") || eventType.includes("PAID") || eventType === "payment_succeeded") {
        if (payment.status === "PENDING") {
          await repo.updateStatus(payment.payment_request_id, "PAID", {
            paid_at: new Date(),
          });
          await writeAuditLog(db, "payment", payment.payment_request_id, "PAID", {
            event_id: eventId,
            source: "webhook",
          });

          // Resume/Signal the workflow
          runtime.runPromise(
            Effect.gen(function* () {
              const engine = yield* WorkflowEngine;
              const executionId = yield* processPaymentWorkflow.executionId({
                paymentRequestId: payment.payment_request_id
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
          ).catch((err) => console.error("[Webhook] Failed to signal workflow:", err));

          console.log(`[Webhook] ✅ Payment PAID & Signalled: ${payment.payment_request_id}`);
        }
      } else if (eventType.includes("FAILED") || eventType === "payment_failed") {
        if (payment.status === "PENDING") {
          await repo.updateStatus(payment.payment_request_id, "FAILED");
          await writeAuditLog(db, "payment", payment.payment_request_id, "FAILED", {
            event_id: eventId,
            source: "webhook",
          });
        }
      }

      return c.json({ status: "processed", event_id: eventId });
    } catch (err: any) {
      console.error("[Webhook] Error:", err.message);
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
