import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Small encrypted, signed values for httpOnly cookies (AES-256-GCM). S25 keeps
 * a teacher's short-lived Google Classroom access token this way instead of
 * storing it: it never reaches the database or the browser's JavaScript, and
 * it is bound to the SafeSight user it was issued for.
 */

function key(secret: string) {
  return createHash("sha256").update(`safesight-integrations:${secret}`).digest();
}

export function seal(value: object, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function unseal<T>(sealed: string | undefined, secret: string): T | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
