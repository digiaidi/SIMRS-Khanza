import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import mysql from "mysql2/promise";
import { spawn } from "child_process";

const GATEWAY_PORT = 3205; // Use a different port to avoid conflicts
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const GATEWAY_API_KEY = "carepay_dev_key_change_me";

// Database credentials
const dbConfig = {
  host: "127.0.0.1",
  port: 3306,
  database: "sik",
  user: "sync_user",
  password: "sync_pass",
};

describe("CarePay Satelit Gateway - E2E Layer DI Test", () => {
  let dbConnection: mysql.Connection;
  let gatewayProcess: any;

  beforeAll(async () => {
    // 1. Connect and clean database
    dbConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    await dbConnection.execute("DELETE FROM carepay_customer_wallets WHERE patient_id = '000123'");
    await dbConnection.execute("DELETE FROM carepay_merchant_onboarding WHERE facility_id = 'rs-demo'");
    await dbConnection.execute("DELETE FROM carepay_kyc_submissions WHERE entity_id IN ('000123', 'rs-demo')");

    // 2. Spawn CarePay Gateway in MOCK mode
    gatewayProcess = spawn("bun", ["run", "src/index.ts"], {
      env: {
        ...process.env,
        SPEEDCASH_MOCK: "true", // Enable Mock Layer DI!
        CAREPAY_API_PORT: GATEWAY_PORT.toString(),
        CAREPAY_API_KEY: GATEWAY_API_KEY,
        DB_HOST: dbConfig.host,
        DB_PORT: dbConfig.port.toString(),
        DB_NAME: dbConfig.database,
        DB_USER: dbConfig.user,
        DB_PASS: dbConfig.password,
      },
    });

    // Pipe outputs to terminal for visibility
    gatewayProcess.stdout.on("data", (data: any) => {
      console.log(`[Server] ${data.toString().trim()}`);
    });
    gatewayProcess.stderr.on("data", (data: any) => {
      console.error(`[Server Error] ${data.toString().trim()}`);
    });

    // Poll health check until ready
    let isReady = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const res = await fetch(`${GATEWAY_URL}/api/health`);
        if (res.status === 200) {
          isReady = true;
          break;
        }
      } catch (_) {}
    }

    if (!isReady) {
      throw new Error("Gateway failed to start in mock mode.");
    }
  });

  afterAll(async () => {
    if (dbConnection) await dbConnection.end();
    if (gatewayProcess) gatewayProcess.kill("SIGINT");
  });

  test("1. Merchant Onboarding via eKYC", async () => {
    const form = new FormData();
    form.append("facility_id", "rs-demo");
    form.append("merchant_id", "merch-rs-demo");
    form.append("owner_name", "RS Demo Owner");
    form.append("owner_ktp", "3172019900000001");
    form.append("ktp_image", new Blob(["mock-ktp"], { type: "image/jpeg" }), "ktp.jpg");

    const res = await fetch(`${GATEWAY_URL}/api/merchants/onboard`, {
      method: "POST",
      headers: { "x-api-key": GATEWAY_API_KEY },
      body: form,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_merchant_onboarding WHERE facility_id = 'rs-demo'"
    ) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].onboarding_status).toBe("SUBMITTED");
  });

  test("2. Merchant Status Polling", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/merchants/rs-demo/status`, {
      headers: { "x-api-key": GATEWAY_API_KEY },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.onboardingStatus).toBe("APPROVED");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_merchant_onboarding WHERE facility_id = 'rs-demo'"
    ) as any[];
    expect(rows[0].onboarding_status).toBe("APPROVED");
  });

  test("3. Wallet OTP Binding Request", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/wallets/binding/request`, {
      method: "POST",
      headers: {
        "x-api-key": GATEWAY_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "000123",
        msisdn: "089601014551",
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_customer_wallets WHERE patient_id = '000123'"
    ) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].binding_status).toBe("PENDING_OTP");
  });

  test("4. Webhook Callback Confirmation (OTP verification)", async () => {
    const webhookBody = {
      phoneNo: "089601014551",
      tokenB2b2c: "token_b2b2c_mock_12345",
      refreshToken: "refresh_token_mock_12345",
      walletId: "sc_wallet_000123",
      status: "SUCCESS",
    };

    const res = await fetch(`${GATEWAY_URL}/api/wallets/binding/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": new Date().toISOString(),
        "x-signature": "dummy-signature-accepted-by-mock-layer",
      },
      body: JSON.stringify(webhookBody),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_customer_wallets WHERE patient_id = '000123'"
    ) as any[];
    expect(rows[0].binding_status).toBe("BOUND");
    expect(rows[0].token_b2b2c).toBe("token_b2b2c_mock_12345");
  });

  test("5. Wallet Balance Inquiry", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/wallets/000123/balance`, {
      headers: { "x-api-key": GATEWAY_API_KEY },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");
    expect(json.accountInfos.balanceInfos[0].availableBalance).toBe("850000.00");
  });

  test("6. Direct Debit Payment", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/wallets/000123/debit`, {
      method: "POST",
      headers: {
        "x-api-key": GATEWAY_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: 350000,
        billingId: "BILL-20260618-0001",
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");
    expect(json.transferId).toBe("trx_debit_mock_888");
  });

  test("7. Customer eKYC submission", async () => {
    const form = new FormData();
    form.append("idCardNumber", "3172019900000002");
    form.append("fullName", "Budi Wiyono");
    form.append("dateOfBirth", "1990-05-15");
    form.append("idCardImage", new Blob(["ktp"], { type: "image/jpeg" }), "ktp.jpg");
    form.append("selfieImage", new Blob(["selfie"], { type: "image/jpeg" }), "selfie.jpg");

    const res = await fetch(`${GATEWAY_URL}/api/wallets/000123/kyc`, {
      method: "POST",
      headers: { "x-api-key": GATEWAY_API_KEY },
      body: form,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.responseCode).toBe("2000000");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_customer_wallets WHERE patient_id = '000123'"
    ) as any[];
    expect(rows[0].kyc_status).toBe("IN_PROGRESS");
  });

  test("8. Customer eKYC Status Polling", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/wallets/000123/kyc/status`, {
      headers: { "x-api-key": GATEWAY_API_KEY },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.kycStatus).toBe("VERIFIED");

    // Verify DB Row
    const [rows] = await dbConnection.execute(
      "SELECT * FROM carepay_customer_wallets WHERE patient_id = '000123'"
    ) as any[];
    expect(rows[0].kyc_status).toBe("VERIFIED");
  });
});
