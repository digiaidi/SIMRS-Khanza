// CarePay - Idempotency Service
// Prevents duplicate QRIS generation for same billing
import crypto from "crypto";

/**
 * Generate idempotency key per ATR-008:
 * facility_id + billing_id + amount + channel + version
 */
export function generateIdempotencyKey(
  facilityId: string,
  billingId: string,
  amount: number,
  channel: string,
  version: number = 1
): string {
  const raw = `${facilityId}|${billingId}|${amount}|${channel}|${version}`;
  return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 48);
}
