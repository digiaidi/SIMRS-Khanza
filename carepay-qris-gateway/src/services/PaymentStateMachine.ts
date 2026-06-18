// CarePay - Payment State Machine (ATR-008 compliant)
// States: DRAFT → PENDING → PAID → RECONCILING → RECONCILED
//         PENDING → EXPIRED | FAILED
//         RECONCILING → RECONCILE_FAILED → RECONCILING (retry)

export type PaymentStatus =
  | "DRAFT"
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "FAILED"
  | "RECONCILING"
  | "RECONCILED"
  | "RECONCILE_FAILED";

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["PAID", "EXPIRED", "FAILED"],
  PAID: ["RECONCILING"],
  EXPIRED: [],
  FAILED: ["PENDING"], // retry with new version
  RECONCILING: ["RECONCILED", "RECONCILE_FAILED"],
  RECONCILED: [],
  RECONCILE_FAILED: ["RECONCILING"], // retry
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid payment state transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: PaymentStatus): boolean {
  return status === "RECONCILED" || status === "EXPIRED";
}

export function isPending(status: PaymentStatus): boolean {
  return status === "PENDING";
}

export function needsReconciliation(status: PaymentStatus): boolean {
  return status === "PAID";
}
