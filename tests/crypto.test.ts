import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../packages/core/src/crypto";

describe("password hashing", () => {
  it("verifies the original password and rejects a different value", async () => {
    const hash = await hashPassword("a-production-grade-password");

    await expect(verifyPassword("a-production-grade-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("another-password", hash)).resolves.toBe(false);
  });
});
