import { Effect, Context, Layer } from "effect";
import { SpeedCashLinkageService } from "./SpeedCashLinkageService.ts";
import { createHash, createHmac } from "crypto";

export interface KYCService {
  readonly submitMerchantKYC: (
    facilityId: string,
    merchantId: string,
    ownerName: string,
    ownerKtp: string,
    ktpImageBuffer: Buffer
  ) => Effect.Effect<any, Error>;

  readonly checkMerchantKYCStatus: (
    merchantId: string
  ) => Effect.Effect<any, Error>;

  readonly submitCustomerKYC: (
    patientId: string,
    idCardNumber: string,
    fullName: string,
    dob: string,
    ktpImageBuffer: Buffer,
    selfieImageBuffer: Buffer,
    tokenB2b2c: string
  ) => Effect.Effect<any, Error>;

  readonly checkCustomerKYCStatus: (
    merchantId: string,
    tokenB2b2c: string
  ) => Effect.Effect<any, Error>;
}

export const KYCService = Context.GenericTag<KYCService>("KYCService");

export const KYCServiceLive = Layer.effect(
  KYCService,
  Effect.gen(function* () {
    const { loadConfig } = yield* Effect.promise(() => import("../config/AppConfig.ts"));
    const config = loadConfig();
    const linkageService = yield* SpeedCashLinkageService;

    const signatureGeneration = (
      method: string,
      pathUrl: string,
      accessToken: string,
      textBody: any,
      timestamp: string
    ): string => {
      const bodyString = typeof textBody === "string" ? textBody : JSON.stringify(textBody);
      const hash = createHash("sha256").update(bodyString).digest("hex").toLowerCase();
      const stringToSign = [method.toUpperCase(), pathUrl, accessToken, hash, timestamp].join(":");
      return createHmac("sha512", config.speedcash.clientKey).update(stringToSign).digest("base64");
    };

    const getTimestamp = (): string => new Date().toISOString().split(".")[0] + "Z";


    return {
      submitMerchantKYC: (facilityId: string, merchantId: string, ownerName: string, ownerKtp: string, ktpImageBuffer: Buffer) =>
        Effect.gen(function* () {
          const { accessToken } = yield* linkageService.getB2bToken();
          const path = "/merchant/upload";
          const timestamp = getTimestamp();


          // ONLY text fields are included in signature calculation
          const textFields = {
            merchantId: merchantId,
            type: "ktp",
            no_ktp: ownerKtp,
          };

          const signature = signatureGeneration("POST", path, accessToken, textFields, timestamp);

          const headers: Record<string, string> = {
            "Authorization": `Bearer ${accessToken}`,
            "X-PARTNER-ID": config.speedcash.partnerId,
            "X-EXTERNAL-ID": `ext_merch_${Date.now()}`,
            "X-TIMESTAMP": timestamp,
            "X-SIGNATURE": signature,
            "CHANNEL-ID": config.speedcash.channelId,
          };

          const formData = new FormData();
          formData.append("merchantId", merchantId);
          formData.append("type", "ktp");
          formData.append("no_ktp", ownerKtp);
          
          const ktpBlob = new Blob([ktpImageBuffer], { type: "image/jpeg" });
          formData.append("img", ktpBlob, "merchant_ktp.jpg");

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${config.speedcash.baseUrl}${path}`, {
                method: "POST",
                headers,
                body: formData,
              }),
            catch: (err: any) => new Error(`Merchant KYC upload failed: ${err.message}`),
          });

          return yield* Effect.promise(() => response.json());
        }),

      checkMerchantKYCStatus: (merchantId: string) =>
        Effect.gen(function* () {
          const { accessToken } = yield* linkageService.getB2bToken();
          const path = "/merchant/documents";
          const timestamp = getTimestamp();

          const body = { merchantId };

          const signature = signatureGeneration("POST", path, accessToken, body, timestamp);

          const headers: Record<string, string> = {
            "Authorization": `Bearer ${accessToken}`,
            "X-PARTNER-ID": config.speedcash.partnerId,
            "X-EXTERNAL-ID": `ext_merch_${Date.now()}`,
            "X-TIMESTAMP": timestamp,
            "X-SIGNATURE": signature,
            "CHANNEL-ID": config.speedcash.channelId,
            "Content-Type": "application/json",
          };

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${config.speedcash.baseUrl}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
              }),
            catch: (err: any) => new Error(`Merchant documents check failed: ${err.message}`),
          });

          return yield* Effect.promise(() => response.json());
        }),

      submitCustomerKYC: (patientId: string, idCardNumber: string, fullName: string, dob: string, ktpImageBuffer: Buffer, selfieImageBuffer: Buffer, tokenB2b2c: string) =>
        Effect.gen(function* () {
          const { accessToken: tokenB2b } = yield* linkageService.getB2bToken();
          const path = "/v1.0/kyc/submissions";
          const timestamp = getTimestamp();


          // ONLY text fields are included in signature calculation
          const textFields = {
            fullName,
            identityCardNumber: idCardNumber,
            merchantId: config.facility.id,
            dateOfBirth: dob,
          };

          const signature = signatureGeneration("POST", path, tokenB2b2c, textFields, timestamp);

          const headers: Record<string, string> = {
            "Authorization": `Bearer ${tokenB2b}`,
            "authorization-customer": `Bearer ${tokenB2b2c}`,
            "x-timestamp": timestamp,
            "x-signature": signature,
            "x-partner-id": config.speedcash.partnerId,
            "channel-id": config.speedcash.channelId,
            "x-external-id": `ext_kyc_${Date.now()}`,
          };

          const formData = new FormData();
          formData.append("fullName", fullName);
          formData.append("identityCardNumber", idCardNumber);
          formData.append("merchantId", config.facility.id);
          formData.append("dateOfBirth", dob);

          const ktpBlob = new Blob([ktpImageBuffer], { type: "image/jpeg" });
          formData.append("idCardImage", ktpBlob, "patient_ktp.jpg");

          const selfieBlob = new Blob([selfieImageBuffer], { type: "image/jpeg" });
          formData.append("selfieImage", selfieBlob, "patient_selfie.jpg");

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${config.speedcash.linkageUrl}${path}`, {
                method: "POST",
                headers,
                body: formData,
              }),
            catch: (err: any) => new Error(`Customer KYC upload failed: ${err.message}`),
          });

          return yield* Effect.promise(() => response.json());
        }),

      checkCustomerKYCStatus: (merchantId: string, tokenB2b2c: string) =>
        Effect.gen(function* () {
          const { accessToken: tokenB2b } = yield* linkageService.getB2bToken();
          const path = "/v1.0/kyc/state";
          const timestamp = getTimestamp();

          const body = { merchantId };

          const signature = signatureGeneration("POST", path, tokenB2b2c, body, timestamp);

          const headers: Record<string, string> = {
            "Authorization": `Bearer ${tokenB2b}`,
            "authorization-customer": `Bearer ${tokenB2b2c}`,
            "x-timestamp": timestamp,
            "x-signature": signature,
            "x-partner-id": config.speedcash.partnerId,
            "channel-id": config.speedcash.channelId,
            "x-external-id": `ext_kyc_${Date.now()}`,
            "Content-Type": "application/json",
          };

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${config.speedcash.linkageUrl}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
              }),
            catch: (err: any) => new Error(`Customer KYC check failed: ${err.message}`),
          });

          return yield* Effect.promise(() => response.json());
        }),
    } satisfies KYCService;
  })
);

export const KYCServiceMock = Layer.succeed(
  KYCService,
  {
    submitMerchantKYC: (facilityId: string, merchantId: string, ownerName: string, ownerKtp: string, ktpImageBuffer: Buffer) =>
      Effect.succeed({
        responseCode: "2000000",
        responseMessage: "Uploaded Successfully",
      }),

    checkMerchantKYCStatus: (merchantId: string) =>
      Effect.succeed({
        responseCode: "2000000",
        responseMessage: "Approved",
        onboarding_status: "APPROVED",
        documents: [
          { type: "ktp", status: "APPROVED" }
        ]
      }),

    submitCustomerKYC: (patientId: string, idCardNumber: string, fullName: string, dob: string, ktpImageBuffer: Buffer, selfieImageBuffer: Buffer, tokenB2b2c: string) =>
      Effect.succeed({
        responseCode: "2000000",
        responseMessage: "Submitted successfully",
      }),

    checkCustomerKYCStatus: (merchantId: string, tokenB2b2c: string) =>
      Effect.succeed({
        responseCode: "2000000",
        responseMessage: "Successfully",
        additionalInfo: {
          status: 1, // 1 = VERIFIED
          account_desc: "Verified eKYC Limit Upgraded",
        },
      }),
  } satisfies KYCService
);
