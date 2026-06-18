// CarePay QRIS Gateway - Application Configuration

export interface AppConfig {
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    pass: string;
  };
  hyperswitch: {
    baseUrl: string;
    adminApiKey: string;
    merchantApiKey: string;
  };
  speedcash: {
    baseUrl: string;
    linkageUrl: string;
    clientKey: string;
    partnerId: string;
    channelId: string;
    privateKeyPath: string;
    cbPrivateKeyPath: string;
    cbPublicKeyPath: string;
  };
  carepay: {
    apiPort: number;
    apiKey: string;
    webhookSecret: string;
  };
  facility: {
    id: string;
    name: string;
  };
}

export function loadConfig(): AppConfig {
  return {
    db: {
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306"),
      name: process.env.DB_NAME || "sik",
      user: process.env.DB_USER || "root",
      pass: process.env.DB_PASS || "",
    },
    hyperswitch: {
      baseUrl: process.env.HYPERSWITCH_BASE_URL || "http://127.0.0.1:8080",
      adminApiKey: process.env.HYPERSWITCH_ADMIN_API_KEY || "test_admin",
      merchantApiKey: process.env.HYPERSWITCH_MERCHANT_API_KEY || "",
    },
    speedcash: {
      baseUrl: process.env.SPEEDCASH_BASE_URL || "https://api-docs.speedcash.co.id",
      linkageUrl: process.env.SPEEDCASH_LINKAGE_URL || "https://devel.speedcash.co.id",
      clientKey: process.env.SPEEDCASH_CLIENT_KEY || "",
      partnerId: process.env.SPEEDCASH_PARTNER_ID || "",
      channelId: process.env.SPEEDCASH_CHANNEL_ID || "00001",
      privateKeyPath: process.env.SPEEDCASH_PRIVATE_KEY_PATH || "./private_key.pem",
      cbPrivateKeyPath: process.env.SPEEDCASH_CB_PRIVATE_KEY_PATH || "./cb_private_key.pem",
      cbPublicKeyPath: process.env.SPEEDCASH_CB_PUBLIC_KEY_PATH || "./cb_public_key.pem",
    },
    carepay: {
      apiPort: parseInt(process.env.CAREPAY_API_PORT || "3200"),
      apiKey: process.env.CAREPAY_API_KEY || "carepay_dev_key",
      webhookSecret: process.env.CAREPAY_WEBHOOK_SECRET || "webhook_secret",
    },
    facility: {
      id: process.env.FACILITY_ID || "rs-demo",
      name: process.env.FACILITY_NAME || "RS Demo Khanza",
    },
  };
}

/** Mask sensitive values for logging */
export function maskSecret(val: string): string {
  if (!val || val.length < 6) return "***";
  return val.substring(0, 4) + "***" + val.substring(val.length - 2);
}
