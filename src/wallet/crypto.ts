import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { config } from "../config";

const ALGO = "aes-256-gcm";

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(config.walletEncryptionKey, salt, 32);
}

/** Encrypt a string -> "salt:iv:tag:ciphertext" (all hex). */
export function encrypt(plain: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [salt, iv, tag, enc].map((b) => b.toString("hex")).join(":");
}

/** Decrypt a payload produced by encrypt(). */
export function decrypt(payload: string): string {
  const [saltHex, ivHex, tagHex, encHex] = payload.split(":");
  const key = deriveKey(Buffer.from(saltHex, "hex"));
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
