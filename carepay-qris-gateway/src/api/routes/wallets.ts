import { Hono } from "hono";
import type mysql from "mysql2/promise";
import type { AppConfig } from "../../config/AppConfig.ts";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { Effect } from "effect";
import { SpeedCashLinkageService } from "../../services/SpeedCashLinkageService.ts";
import { KYCService } from "../../services/KYCService.ts";
import { SqlClient } from "../../services/SqlClient.ts";
import { writeAuditLog } from "../../services/PaymentRepository.ts";
import { nanoid } from "nanoid";

export function createWalletRoutes(
  db: mysql.Pool,
  config: AppConfig,
  runtime: ManagedRuntime.ManagedRuntime<any, any>
): Hono {
  const app = new Hono();

  // POST /binding/request - Request OTP binding
  app.post("/binding/request", async (c) => {
    try {
      const body = await c.req.json();
      const { patientId, msisdn } = body;

      if (!patientId || !msisdn) {
        return c.json({ error: "patientId and msisdn are required" }, 400);
      }

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const sql = yield* SqlClient;

        // Check if there is an existing binding
        const check = yield* sql.query(
          "SELECT * FROM carepay_customer_wallets WHERE patient_id = ?",
          [patientId]
        );

        if (check.rows.length > 0) {
          const row = check.rows[0];
          if (row.binding_status === "BOUND") {
            return { status: "ALREADY_BOUND", message: "Account is already linked" };
          }
          // Update MSISDN
          yield* sql.execute(
            "UPDATE carepay_customer_wallets SET msisdn = ?, binding_status = 'PENDING_OTP' WHERE patient_id = ?",
            [msisdn, patientId]
          );
        } else {
          yield* sql.execute(
            "INSERT INTO carepay_customer_wallets (patient_id, msisdn, binding_status, kyc_status) VALUES (?, ?, 'PENDING_OTP', 'UNVERIFIED')",
            [patientId, msisdn]
          );
        }

        const response = yield* linkageService.requestAccountBinding(msisdn, config.facility.id);
        
        yield* Effect.promise(() =>
          writeAuditLog(db, "wallet", patientId, "BINDING_REQUESTED", { msisdn, response })
        );

        return response;
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet Binding] Error requesting binding:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /binding/confirm - Inbound Callback webhook from SpeedCash on OTP verification
  app.post("/binding/confirm", async (c) => {
    try {
      const body = await c.req.json();
      const timestamp = c.req.header("x-timestamp") || c.req.header("X-TIMESTAMP") || "";
      const signature = c.req.header("x-signature") || c.req.header("X-SIGNATURE") || "";

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const sql = yield* SqlClient;

        // Verify callback signature
        const isSignatureValid = yield* linkageService.verifyCallbackSignature(
          "POST",
          "/api/wallets/binding/confirm",
          body,
          timestamp,
          signature
        );

        if (!isSignatureValid) {
          return yield* Effect.fail(new Error("Invalid signature in callback"));
        }

        const { phoneNo, tokenB2b2c, refreshToken, walletId, status } = body;

        if (status === "SUCCESS" || status === "BOUND") {
          yield* sql.execute(
            `UPDATE carepay_customer_wallets 
             SET token_b2b2c = ?, refresh_token = ?, wallet_id = ?, binding_status = 'BOUND'
             WHERE msisdn = ?`,
            [tokenB2b2c, refreshToken, walletId, phoneNo]
          );

          yield* Effect.promise(() =>
            writeAuditLog(db, "wallet", phoneNo, "BINDING_CONFIRMED", { walletId })
          );
        }

        return { responseCode: "2000000", responseMessage: "Success" };
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet Callback] Error confirming binding:", err);
      return c.json({ responseCode: "5000000", responseMessage: err.message }, 500);
    }
  });

  // GET /:patientId/balance - Query balance
  app.get("/:patientId/balance", async (c) => {
    try {
      const patientId = c.req.param("patientId");

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const sql = yield* SqlClient;

        // Fetch wallet details
        const walletRes = yield* sql.query(
          "SELECT * FROM carepay_customer_wallets WHERE patient_id = ?",
          [patientId]
        );

        if (walletRes.rows.length === 0) {
          return yield* Effect.fail(new Error("Wallet binding not found for patient"));
        }

        const wallet = walletRes.rows[0];
        if (wallet.binding_status !== "BOUND") {
          return yield* Effect.fail(new Error(`Account binding status is ${wallet.binding_status}`));
        }

        const { accessToken: tokenB2b } = yield* linkageService.getB2bToken();
        let tokenB2b2c = wallet.token_b2b2c;

        // Try using B2B2C token to fetch balance
        let balanceRes = yield* linkageService.getBalance(tokenB2b, tokenB2b2c, config.facility.id);

        // If unauthorized/token expired, try to refresh B2B2C token
        if (
          balanceRes.responseCode === "4019802" ||
          balanceRes.responseCode === "4010001" ||
          balanceRes.responseCode === "4011102" ||
          balanceRes.error_code === "401"
        ) {
          console.log("[Wallet] B2B2C token expired. Refreshing...");
          const refreshRes = yield* linkageService.getB2b2cToken(wallet.refresh_token);
          
          tokenB2b2c = refreshRes.accessToken;
          yield* sql.execute(
            "UPDATE carepay_customer_wallets SET token_b2b2c = ?, refresh_token = ? WHERE patient_id = ?",
            [refreshRes.accessToken, refreshRes.refreshToken, patientId]
          );

          // Retry balance inquiry
          balanceRes = yield* linkageService.getBalance(tokenB2b, tokenB2b2c, config.facility.id);
        }

        return balanceRes;
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet Balance] Error fetching balance:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /:patientId/debit - Perform direct debit
  app.post("/:patientId/debit", async (c) => {
    try {
      const patientId = c.req.param("patientId");
      const body = await c.req.json();
      const { amount, billingId } = body;

      if (!amount || !billingId) {
        return c.json({ error: "amount and billingId are required" }, 400);
      }

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const sql = yield* SqlClient;

        // Fetch wallet details
        const walletRes = yield* sql.query(
          "SELECT * FROM carepay_customer_wallets WHERE patient_id = ?",
          [patientId]
        );

        if (walletRes.rows.length === 0) {
          return yield* Effect.fail(new Error("Wallet binding not found for patient"));
        }

        const wallet = walletRes.rows[0];
        if (wallet.binding_status !== "BOUND") {
          return yield* Effect.fail(new Error("Wallet must be bound before payment"));
        }

        const { accessToken: tokenB2b } = yield* linkageService.getB2bToken();
        let tokenB2b2c = wallet.token_b2b2c;

        // Perform direct debit
        let debitRes = yield* linkageService.directDebit(
          tokenB2b,
          tokenB2b2c,
          config.facility.id,
          amount,
          billingId
        );

        // Retry on expired token
        if (
          debitRes.responseCode === "4019802" ||
          debitRes.responseCode === "4011102" ||
          debitRes.error_code === "401"
        ) {
          const refreshRes = yield* linkageService.getB2b2cToken(wallet.refresh_token);
          tokenB2b2c = refreshRes.accessToken;
          yield* sql.execute(
            "UPDATE carepay_customer_wallets SET token_b2b2c = ?, refresh_token = ? WHERE patient_id = ?",
            [refreshRes.accessToken, refreshRes.refreshToken, patientId]
          );

          debitRes = yield* linkageService.directDebit(
            tokenB2b,
            tokenB2b2c,
            config.facility.id,
            amount,
            billingId
          );
        }

        if (debitRes.responseCode === "2000000" || debitRes.responseMessage === "Successfully" || debitRes.responseCode === "2005600" || debitRes.responseCode === "200") {
          yield* Effect.promise(() =>
            writeAuditLog(db, "wallet_debit", patientId, "DEBIT_SUCCESS", { billingId, amount, debitRes })
          );
        }

        return debitRes;
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet Debit] Error executing debit:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /:patientId/kyc - Upload patient KTP + Selfie
  app.post("/:patientId/kyc", async (c) => {
    try {
      const patientId = c.req.param("patientId");
      const body = await c.req.parseBody();

      const idCardNumber = body.idCardNumber as string;
      const fullName = body.fullName as string;
      const dob = body.dateOfBirth as string; // YYYY-MM-DD
      const idCardImage = body.idCardImage as File;
      const selfieImage = body.selfieImage as File;

      if (!idCardNumber || !fullName || !dob || !idCardImage || !selfieImage) {
        return c.json({ error: "Missing required KYC fields or files" }, 400);
      }

      const idCardBuffer = Buffer.from(await idCardImage.arrayBuffer());
      const selfieBuffer = Buffer.from(await selfieImage.arrayBuffer());

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const kycService = yield* KYCService;
        const sql = yield* SqlClient;

        // Fetch wallet details
        const walletRes = yield* sql.query(
          "SELECT * FROM carepay_customer_wallets WHERE patient_id = ?",
          [patientId]
        );

        if (walletRes.rows.length === 0) {
          return yield* Effect.fail(new Error("Wallet binding not found for patient"));
        }

        const wallet = walletRes.rows[0];
        if (wallet.binding_status !== "BOUND") {
          return yield* Effect.fail(new Error("Account must be bound before doing KYC"));
        }

        let tokenB2b2c = wallet.token_b2b2c;

        // Submit KYC to SpeedCash
        let kycRes = yield* kycService.submitCustomerKYC(
          patientId,
          idCardNumber,
          fullName,
          dob,
          idCardBuffer,
          selfieBuffer,
          tokenB2b2c
        );

        // Handle token expiration retry
        if (
          kycRes.responseCode === "4019702" ||
          kycRes.responseCode === "4011102" ||
          kycRes.error_code === "401"
        ) {
          console.log("[Wallet KYC] B2B2C token expired during KYC. Refreshing...");
          const refreshRes = yield* linkageService.getB2b2cToken(wallet.refresh_token);
          
          tokenB2b2c = refreshRes.accessToken;
          yield* sql.execute(
            "UPDATE carepay_customer_wallets SET token_b2b2c = ?, refresh_token = ? WHERE patient_id = ?",
            [refreshRes.accessToken, refreshRes.refreshToken, patientId]
          );

          kycRes = yield* kycService.submitCustomerKYC(
            patientId,
            idCardNumber,
            fullName,
            dob,
            idCardBuffer,
            selfieBuffer,
            tokenB2b2c
          );
        }

        const submissionId = `sub_${nanoid(12)}`;
        yield* sql.execute(
          "INSERT INTO carepay_kyc_submissions (submission_id, entity_type, entity_id, status) VALUES (?, 'CUSTOMER', ?, ?)",
          [submissionId, patientId, kycRes.responseMessage || "SUBMITTED"]
        );

        yield* sql.execute(
          "UPDATE carepay_customer_wallets SET kyc_status = 'IN_PROGRESS' WHERE patient_id = ?",
          [patientId]
        );

        yield* Effect.promise(() =>
          writeAuditLog(db, "wallet_kyc", patientId, "CUSTOMER_KYC_SUBMITTED", { submissionId })
        );

        return kycRes;
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet KYC] Error submitting KYC:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // GET /:patientId/kyc/status - Check customer KYC status
  app.get("/:patientId/kyc/status", async (c) => {
    try {
      const patientId = c.req.param("patientId");

      const effect = Effect.gen(function* () {
        const linkageService = yield* SpeedCashLinkageService;
        const kycService = yield* KYCService;
        const sql = yield* SqlClient;

        // Fetch wallet details
        const walletRes = yield* sql.query(
          "SELECT * FROM carepay_customer_wallets WHERE patient_id = ?",
          [patientId]
        );

        if (walletRes.rows.length === 0) {
          return yield* Effect.fail(new Error("Wallet binding not found for patient"));
        }

        const wallet = walletRes.rows[0];
        let tokenB2b2c = wallet.token_b2b2c;

        let kycStatusRes = yield* kycService.checkCustomerKYCStatus(config.facility.id, tokenB2b2c);

        if (
          kycStatusRes.responseCode === "4019802" ||
          kycStatusRes.responseCode === "4011102" ||
          kycStatusRes.error_code === "401"
        ) {
          console.log("[Wallet KYC Status] B2B2C token expired. Refreshing...");
          const refreshRes = yield* linkageService.getB2b2cToken(wallet.refresh_token);
          
          tokenB2b2c = refreshRes.accessToken;
          yield* sql.execute(
            "UPDATE carepay_customer_wallets SET token_b2b2c = ?, refresh_token = ? WHERE patient_id = ?",
            [refreshRes.accessToken, refreshRes.refreshToken, patientId]
          );

          kycStatusRes = yield* kycService.checkCustomerKYCStatus(config.facility.id, tokenB2b2c);
        }

        // Map status: 0=UNVERIFIED, 1=VERIFIED, 2=REJECTED, 3=IN_PROGRESS
        const statusMap: Record<number, string> = {
          0: "UNVERIFIED",
          1: "VERIFIED",
          2: "REJECTED",
          3: "IN_PROGRESS",
        };
        const statusInt = kycStatusRes.additionalInfo?.status ?? 0;
        const mappedStatus = statusMap[statusInt] || "UNVERIFIED";

        yield* sql.execute(
          "UPDATE carepay_customer_wallets SET kyc_status = ? WHERE patient_id = ?",
          [mappedStatus, patientId]
        );

        yield* Effect.promise(() =>
          writeAuditLog(db, "wallet_kyc", patientId, "CUSTOMER_KYC_STATUS_UPDATED", { mappedStatus })
        );

        return {
          patientId,
          kycStatus: mappedStatus,
          details: kycStatusRes.additionalInfo?.account_desc || "",
          raw: kycStatusRes,
        };
      });

      const res = await runtime.runPromise(effect);
      return c.json(res);
    } catch (err: any) {
      console.error("[Wallet KYC Status] Error checking status:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
