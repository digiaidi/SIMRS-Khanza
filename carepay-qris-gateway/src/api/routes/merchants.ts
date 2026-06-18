import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { Effect } from "effect";
import { KYCService } from "../../services/KYCService.ts";
import { SqlClient } from "../../services/SqlClient.ts";
import { writeAuditLog } from "../../services/PaymentRepository.ts";
import { nanoid } from "nanoid";

export function createMerchantRoutes(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();

  // POST /onboard - Submit Merchant KYC documents
  app.post("/onboard", async (c) => {
    try {
      const body = await c.req.parseBody();
      
      const facilityId = (body.facilityId || body.facility_id) as string;
      const merchantId = (body.merchantId || body.merchant_id) as string;
      const ownerName = (body.ownerName || body.owner_name) as string;
      const ownerKtp = (body.ownerKtp || body.owner_ktp) as string;
      const img = (body.img || body.ktp_image || body.image) as File;

      if (!facilityId || !merchantId || !ownerName || !ownerKtp || !img) {
        return c.json({ error: "Missing required onboarding fields or file" }, 400);
      }

      const imgBuffer = Buffer.from(await img.arrayBuffer());

      const effect = Effect.gen(function* () {
        const kycService = yield* KYCService;
        const sql = yield* SqlClient;

        // Check if there is already an onboarding record
        const check = yield* sql.query(
          "SELECT * FROM carepay_merchant_onboarding WHERE facility_id = ?",
          [facilityId]
        );

        if (check.rows.length > 0) {
          yield* sql.execute(
            `UPDATE carepay_merchant_onboarding 
             SET merchant_id = ?, owner_name = ?, owner_ktp = ?, onboarding_status = 'SUBMITTED' 
             WHERE facility_id = ?`,
            [merchantId, ownerName, ownerKtp, facilityId]
          );
        } else {
          yield* sql.execute(
            `INSERT INTO carepay_merchant_onboarding 
             (facility_id, merchant_id, owner_name, owner_ktp, onboarding_status) 
             VALUES (?, ?, ?, ?, 'SUBMITTED')`,
            [facilityId, merchantId, ownerName, ownerKtp]
          );
        }

        // Send to Bimasakti
        const response = yield* kycService.submitMerchantKYC(
          facilityId,
          merchantId,
          ownerName,
          ownerKtp,
          imgBuffer
        );

        const submissionId = `sub_${nanoid(12)}`;
        yield* sql.execute(
          "INSERT INTO carepay_kyc_submissions (submission_id, entity_type, entity_id, status) VALUES (?, 'MERCHANT', ?, ?)",
          [submissionId, facilityId, response.responseMessage || "SUBMITTED"]
        );

        yield* Effect.promise(() =>
          writeAuditLog(db, "merchant_onboarding", facilityId, "MERCHANT_KYC_SUBMITTED", { submissionId, response })
        );

        return response;
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Merchant Onboarding] Error submitting onboarding:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // GET /:facilityId/status - Check Merchant onboarding status
  app.get("/:facilityId/status", async (c) => {
    try {
      const facilityId = c.req.param("facilityId");

      const effect = Effect.gen(function* () {
        const kycService = yield* KYCService;
        const sql = yield* SqlClient;

        // Fetch local onboarding record
        const onboardingRes = yield* sql.query(
          "SELECT * FROM carepay_merchant_onboarding WHERE facility_id = ?",
          [facilityId]
        );

        if (onboardingRes.rows.length === 0) {
          return yield* Effect.fail(new Error("Onboarding record not found for this facility"));
        }

        const merchant = onboardingRes.rows[0];
        const statusRes = yield* kycService.checkMerchantKYCStatus(merchant.merchant_id);

        // Map status based on documentation (responseCode 2000000 means successful status check, check response body docs)
        let mappedStatus = "SUBMITTED";
        if (statusRes.responseCode === "2000000" && statusRes.documents) {
          // Check if KTP document is verified in SpeedCash
          const isKtpApproved = statusRes.documents.some(
            (doc: any) => doc.type === "ktp" && doc.status === "APPROVED"
          );
          const isKtpRejected = statusRes.documents.some(
            (doc: any) => doc.type === "ktp" && doc.status === "REJECTED"
          );

          if (isKtpApproved) {
            mappedStatus = "APPROVED";
          } else if (isKtpRejected) {
            mappedStatus = "REJECTED";
          }
        }

        yield* sql.execute(
          "UPDATE carepay_merchant_onboarding SET onboarding_status = ? WHERE facility_id = ?",
          [mappedStatus, facilityId]
        );

        yield* Effect.promise(() =>
          writeAuditLog(db, "merchant_onboarding", facilityId, "MERCHANT_KYC_STATUS_UPDATED", { mappedStatus })
        );

        return {
          facilityId,
          merchantId: merchant.merchant_id,
          onboardingStatus: mappedStatus,
          raw: statusRes,
        };
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Merchant Onboarding Status] Error checking status:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
