import assert from "node:assert/strict";
import test from "node:test";

import { base32Decode, base32Encode, codeAt, verifyCode } from "./totp.ts";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("matches RFC 6238 SHA-1 vectors (last 6 digits)", () => {
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(codeAt(RFC_SECRET, Math.floor(seconds / 30)), expected);
  }
});

test("base32 round-trips", () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test("accepts one step of drift and rejects malformed codes", () => {
  const now = 1_700_000_000_000;
  const counter = Math.floor(now / 30_000);
  assert.equal(verifyCode(RFC_SECRET, codeAt(RFC_SECRET, counter - 1), now), counter - 1);
  assert.equal(verifyCode(RFC_SECRET, codeAt(RFC_SECRET, counter + 2), now), null);
  assert.equal(verifyCode(RFC_SECRET, "12345", now), null);
  assert.equal(verifyCode(RFC_SECRET, "abcdef", now), null);
});
