import { createHash, randomBytes } from "node:crypto";

/** A fresh seat token for the extension (sent once; only its hash is stored). */
export function newSeatToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSeatToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A 6-digit lab session code (PLAN.md §4). */
export function randomSessionCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/** Reads `Authorization: Bearer <token>`. */
export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/);
  return m ? m[1]! : null;
}
