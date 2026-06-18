// CarePay - Hyperswitch Client Service
// Communicates with Hyperswitch API for payment orchestration
import type { AppConfig } from "../config/AppConfig.ts";
import { maskSecret } from "../config/AppConfig.ts";

export interface HyperswitchPaymentResponse {
  payment_id: string;
  status: string;
  amount: number;
  currency: string;
  connector?: string;
  error_message?: string;
  next_action?: {
    type: string;
    qr_code_url?: string;
    image_data_url?: string;
  };
}

export class HyperswitchClient {
  private baseUrl: string;
  private apiKey: string;
  private adminApiKey: string;

  constructor(config: AppConfig) {
    this.baseUrl = config.hyperswitch.baseUrl;
    this.apiKey = config.hyperswitch.merchantApiKey;
    this.adminApiKey = config.hyperswitch.adminApiKey;
    console.log(`[Hyperswitch] Client initialized: ${this.baseUrl} (key: ${maskSecret(this.apiKey)})`);
  }

  async createPayment(params: {
    amount: number;
    currency: string;
    description: string;
    billingId: string;
    profileId?: string;
  }): Promise<HyperswitchPaymentResponse> {
    const payload = {
      amount: params.amount,
      currency: params.currency,
      confirm: true,
      payment_method: "bank_transfer",
      payment_method_type: "bca_bank_transfer",
      payment_method_data: {
        bank_transfer: { bca_bank_transfer: {} },
      },
      routing: { type: "single", data: "bimasakti" },
      description: params.description,
      return_url: "https://simrs.local/success",
      metadata: { khanza_billing_id: params.billingId },
      ...(params.profileId ? { profile_id: params.profileId } : {}),
    };

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as HyperswitchPaymentResponse;
  }

  async getPaymentStatus(paymentId: string): Promise<HyperswitchPaymentResponse> {
    const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
      headers: {
        "api-key": this.apiKey,
        Accept: "application/json",
      },
    });
    return (await response.json()) as HyperswitchPaymentResponse;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return { ok: response.ok };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
