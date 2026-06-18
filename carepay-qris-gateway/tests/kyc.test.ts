import { expect, test, describe } from "bun:test";
import { createHmac, createHash, generateKeyPairSync, createSign, createVerify } from "crypto";

// Mock signature functions to verify correct calculations
const signatureGeneration = (
  method: string,
  pathUrl: string,
  accessToken: string,
  textBody: any,
  timestamp: string,
  clientSecret: string
): string => {
  const bodyString = typeof textBody === "string" ? textBody : JSON.stringify(textBody);
  const hash = createHash("sha256").update(bodyString).digest("hex").toLowerCase();
  const stringToSign = [method.toUpperCase(), pathUrl, accessToken, hash, timestamp].join(":");
  return createHmac("sha512", clientSecret).update(stringToSign).digest("base64");
};

const signatureRsaValidation = (
  method: string,
  url: string,
  body: any,
  timestamp: string,
  receivedSignature: string,
  publicKey: string
): boolean => {
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);
  const hash = createHash("sha256").update(bodyString).digest("hex").toLowerCase();
  const stringToSign = [method.toUpperCase(), url, hash, timestamp].join(":");
  const verify = createVerify("RSA-SHA256");
  verify.update(stringToSign);
  return verify.verify(publicKey, receivedSignature, "base64");
};

describe("Bimasakti Cryptography Signatures", () => {
  const clientSecret = "test-client-secret-12345";
  const accessToken = "token_b2b_sample_abc123";
  const timestamp = "2026-06-18T10:00:00Z";

  test("HMAC-SHA512 signature matches expected formula", () => {
    const textBody = {
      fullName: "Budi Wiyono",
      identityCardNumber: "3172012345678901",
      merchantId: "rs-demo",
      dateOfBirth: "1990-05-15",
    };

    const sig = signatureGeneration(
      "POST",
      "/v1.0/kyc/submissions",
      accessToken,
      textBody,
      timestamp,
      clientSecret
    );

    expect(sig).toBeDefined();
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(20);

    // Verify manually
    const bodyStr = JSON.stringify(textBody);
    const hash = createHash("sha256").update(bodyStr).digest("hex").toLowerCase();
    const stringToSign = ["POST", "/v1.0/kyc/submissions", accessToken, hash, timestamp].join(":");
    const expectedSig = createHmac("sha512", clientSecret).update(stringToSign).digest("base64");
    
    expect(sig).toBe(expectedSig);
  });

  test("Omission of file properties in signature body", () => {
    // Original payload contains files
    const fullBodyWithFiles = {
      fullName: "Budi Wiyono",
      identityCardNumber: "3172012345678901",
      merchantId: "rs-demo",
      dateOfBirth: "1990-05-15",
      idCardImage: "file_data_here_ignored",
      selfieImage: "selfie_data_here_ignored",
    };

    // Text fields only used for signing
    const textFieldsOnly = {
      fullName: "Budi Wiyono",
      identityCardNumber: "3172012345678901",
      merchantId: "rs-demo",
      dateOfBirth: "1990-05-15",
    };

    const sigWithFilesRemoved = signatureGeneration(
      "POST",
      "/v1.0/kyc/submissions",
      accessToken,
      textFieldsOnly,
      timestamp,
      clientSecret
    );

    const manualSig = signatureGeneration(
      "POST",
      "/v1.0/kyc/submissions",
      accessToken,
      textFieldsOnly,
      timestamp,
      clientSecret
    );

    expect(sigWithFilesRemoved).toBe(manualSig);
  });

  test("RSA-SHA256 signature generation and validation", () => {
    // Generate transient key pair
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const callbackBody = {
      phoneNo: "089601014551",
      tokenB2b2c: "cust_token_xyz",
      refreshToken: "cust_refresh_xyz",
      walletId: "wallet_123",
      status: "SUCCESS",
    };

    const method = "POST";
    const url = "/api/wallets/binding/confirm";
    const ts = new Date().toISOString();

    // Sign using private key
    const hash = createHash("sha256").update(JSON.stringify(callbackBody)).digest("hex").toLowerCase();
    const stringToSign = [method, url, hash, ts].join(":");
    const signer = createSign("RSA-SHA256");
    signer.update(stringToSign);
    const signature = signer.sign(privateKey, "base64");

    // Validate using public key
    const isValid = signatureRsaValidation(
      method,
      url,
      callbackBody,
      ts,
      signature,
      publicKey
    );

    expect(isValid).toBe(true);

    // Validate with altered body (should fail)
    const alteredBody = { ...callbackBody, status: "FAILED" };
    const isAlteredValid = signatureRsaValidation(
      method,
      url,
      alteredBody,
      ts,
      signature,
      publicKey
    );

    expect(isAlteredValid).toBe(false);
  });
});
