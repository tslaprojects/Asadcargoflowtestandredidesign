import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (>= 32 chars)");
  return s;
}

export function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifyHmac(value: string, signature: string): boolean {
  const expected = Buffer.from(hmac(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
