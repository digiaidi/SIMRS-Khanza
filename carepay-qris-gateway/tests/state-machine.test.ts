import { expect, test, describe } from "bun:test";
import { canTransition, validateTransition, isTerminal } from "../src/services/PaymentStateMachine.ts";

describe("Payment State Machine", () => {
  test("valid transitions", () => {
    expect(canTransition("DRAFT", "PENDING")).toBe(true);
    expect(canTransition("PENDING", "PAID")).toBe(true);
    expect(canTransition("PENDING", "EXPIRED")).toBe(true);
    expect(canTransition("PENDING", "FAILED")).toBe(true);
    expect(canTransition("PAID", "RECONCILING")).toBe(true);
    expect(canTransition("RECONCILING", "RECONCILED")).toBe(true);
    expect(canTransition("RECONCILING", "RECONCILE_FAILED")).toBe(true);
    expect(canTransition("RECONCILE_FAILED", "RECONCILING")).toBe(true);
  });

  test("invalid transitions", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("RECONCILED", "PENDING")).toBe(false);
    expect(canTransition("EXPIRED", "PENDING")).toBe(false);
    expect(() => validateTransition("DRAFT", "PAID")).toThrow();
  });

  test("terminal states", () => {
    expect(isTerminal("RECONCILED")).toBe(true);
    expect(isTerminal("EXPIRED")).toBe(true);
    expect(isTerminal("PENDING")).toBe(false);
  });
});
