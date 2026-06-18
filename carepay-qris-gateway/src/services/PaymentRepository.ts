// CarePay - Payment Repository (CRUD for payment requests)
import type mysql from "mysql2/promise";
import type { PaymentStatus } from "./PaymentStateMachine.ts";
import { validateTransition } from "./PaymentStateMachine.ts";
import { nanoid } from "nanoid";

export interface PaymentRequest {
  payment_request_id: string;
  khanza_billing_id: string;
  no_rawat: string | null;
  no_rkm_medis: string | null;
  patient_name: string | null;
  amount: number;
  currency: string;
  channel: string;
  status: PaymentStatus;
  hyperswitch_payment_id: string | null;
  speedcash_trx_id: string | null;
  qris_payload: string | null;
  qris_url: string | null;
  idempotency_key: string;
  facility_id: string;
  expires_at: Date | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentInput {
  khanza_billing_id: string;
  no_rawat?: string;
  no_rkm_medis?: string;
  patient_name?: string;
  amount: number;
  currency?: string;
  channel?: string;
  facility_id: string;
  idempotency_key: string;
}

export class PaymentRepository {
  constructor(private db: mysql.Pool) {}

  async findByIdempotencyKey(key: string): Promise<PaymentRequest | null> {
    const [rows] = await this.db.query(
      "SELECT * FROM carepay_payment_requests WHERE idempotency_key = ?",
      [key]
    );
    const results = rows as PaymentRequest[];
    return results[0] ?? null;
  }

  async findById(id: string): Promise<PaymentRequest | null> {
    const [rows] = await this.db.query(
      "SELECT * FROM carepay_payment_requests WHERE payment_request_id = ?",
      [id]
    );
    const results = rows as PaymentRequest[];
    return results[0] ?? null;
  }

  async create(input: CreatePaymentInput): Promise<PaymentRequest> {
    const id = `payreq_${nanoid(16)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.db.query(
      `INSERT INTO carepay_payment_requests 
       (payment_request_id, khanza_billing_id, no_rawat, no_rkm_medis, patient_name,
        amount, currency, channel, status, idempotency_key, facility_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [
        id,
        input.khanza_billing_id,
        input.no_rawat ?? null,
        input.no_rkm_medis ?? null,
        input.patient_name ?? null,
        input.amount,
        input.currency ?? "IDR",
        input.channel ?? "QRIS",
        input.idempotency_key,
        input.facility_id,
        expiresAt,
      ]
    );

    return (await this.findById(id))!;
  }

  async updateStatus(
    id: string,
    newStatus: PaymentStatus,
    extra?: Partial<Pick<PaymentRequest, "hyperswitch_payment_id" | "speedcash_trx_id" | "qris_payload" | "qris_url" | "paid_at">>
  ): Promise<PaymentRequest> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Payment ${id} not found`);
    
    validateTransition(current.status, newStatus);

    const updates: string[] = ["status = ?"];
    const values: any[] = [newStatus];

    if (extra?.hyperswitch_payment_id) {
      updates.push("hyperswitch_payment_id = ?");
      values.push(extra.hyperswitch_payment_id);
    }
    if (extra?.speedcash_trx_id) {
      updates.push("speedcash_trx_id = ?");
      values.push(extra.speedcash_trx_id);
    }
    if (extra?.qris_payload) {
      updates.push("qris_payload = ?");
      values.push(extra.qris_payload);
    }
    if (extra?.qris_url) {
      updates.push("qris_url = ?");
      values.push(extra.qris_url);
    }
    if (extra?.paid_at) {
      updates.push("paid_at = ?");
      values.push(extra.paid_at);
    }

    values.push(id);
    await this.db.query(
      `UPDATE carepay_payment_requests SET ${updates.join(", ")} WHERE payment_request_id = ?`,
      values
    );

    return (await this.findById(id))!;
  }

  async listPayments(filters?: {
    status?: PaymentStatus;
    facility_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: PaymentRequest[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.facility_id) {
      conditions.push("facility_id = ?");
      values.push(filters.facility_id);
    }
    if (filters?.from_date) {
      conditions.push("created_at >= ?");
      values.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push("created_at <= ?");
      values.push(filters.to_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const [countRows] = await this.db.query(
      `SELECT COUNT(*) as total FROM carepay_payment_requests ${where}`,
      values
    );
    const total = (countRows as any[])[0].total;

    const [rows] = await this.db.query(
      `SELECT * FROM carepay_payment_requests ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return { data: rows as PaymentRequest[], total };
  }

  async findExpiredPending(): Promise<PaymentRequest[]> {
    const [rows] = await this.db.query(
      `SELECT * FROM carepay_payment_requests WHERE status = 'PENDING' AND expires_at < NOW()`
    );
    return rows as PaymentRequest[];
  }
}

// === Audit Log ===
export async function writeAuditLog(
  db: mysql.Pool,
  entityType: string,
  entityId: string,
  action: string,
  detail: any,
  actor: string = "system"
): Promise<void> {
  await db.query(
    `INSERT INTO carepay_audit_logs (entity_type, entity_id, action, actor, detail_json) VALUES (?, ?, ?, ?, ?)`,
    [entityType, entityId, action, actor, JSON.stringify(detail)]
  );
}

// === Payment Events ===
export async function savePaymentEvent(
  db: mysql.Pool,
  paymentRequestId: string,
  eventType: string,
  rawPayload: any,
  source: string = "webhook",
  signatureValid?: boolean
): Promise<string> {
  const eventId = `evt_${nanoid(16)}`;
  await db.query(
    `INSERT INTO carepay_payment_events (event_id, payment_request_id, event_type, source, raw_payload, signature_valid) VALUES (?, ?, ?, ?, ?, ?)`,
    [eventId, paymentRequestId, eventType, source, JSON.stringify(rawPayload), signatureValid ?? null]
  );
  return eventId;
}

// === Reconciliation Jobs ===
export async function createReconciliationJob(db: mysql.Pool, paymentRequestId: string): Promise<string> {
  const jobId = `recon_${nanoid(16)}`;
  await db.query(
    `INSERT INTO carepay_reconciliation_jobs (job_id, payment_request_id, status) VALUES (?, ?, 'PENDING')`,
    [jobId, paymentRequestId]
  );
  return jobId;
}

export async function getReconciliationJobs(db: mysql.Pool, status?: string): Promise<any[]> {
  const where = status ? "WHERE status = ?" : "";
  const [rows] = await db.query(
    `SELECT j.*, p.khanza_billing_id, p.amount, p.patient_name 
     FROM carepay_reconciliation_jobs j 
     JOIN carepay_payment_requests p ON j.payment_request_id = p.payment_request_id 
     ${where} ORDER BY j.created_at DESC LIMIT 100`,
    status ? [status] : []
  );
  return rows as any[];
}
