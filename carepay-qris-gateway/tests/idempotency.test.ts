import { expect, test, describe } from "bun:test";
import { generateIdempotencyKey } from "../src/services/IdempotencyService.ts";

describe("Idempotency Service", () => {
  test("generates consistent keys", () => {
    const key1 = generateIdempotencyKey("rs-demo", "BILL-123", 50000, "QRIS");
    const key2 = generateIdempotencyKey("rs-demo", "BILL-123", 50000, "QRIS");
    expect(key1).toBe(key2);
  });

  test("generates different keys for different inputs", () => {
    const key1 = generateIdempotencyKey("rs-demo", "BILL-123", 50000, "QRIS");
    const key2 = generateIdempotencyKey("rs-demo", "BILL-123", 100000, "QRIS");
    const key3 = generateIdempotencyKey("rs-demo", "BILL-456", 50000, "QRIS");
    const key4 = generateIdempotencyKey("rs-demo", "BILL-123", 50000, "QRIS", 2);

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
  });
});
