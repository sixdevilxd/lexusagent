import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { encrypt, decrypt } from "../wallet/crypto";

const FILE = join(process.cwd(), "data", "github.json");

type Rec = { encToken: string; login: string; connectedAt: string };
type DB = Record<string, Rec>;

function load(): DB {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
}
function save(db: DB): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2), { mode: 0o600 });
}

/** Tokens are encrypted at rest with WALLET_ENCRYPTION_KEY. */
export function saveToken(userId: number, token: string, login: string): void {
  const db = load();
  db[String(userId)] = {
    encToken: encrypt(token),
    login,
    connectedAt: new Date().toISOString(),
  };
  save(db);
}

export function getToken(userId: number): string | null {
  const rec = load()[String(userId)];
  if (!rec) return null;
  try {
    return decrypt(rec.encToken);
  } catch {
    return null;
  }
}

export function getLogin(userId: number): string | null {
  return load()[String(userId)]?.login ?? null;
}

export function clearToken(userId: number): void {
  const db = load();
  delete db[String(userId)];
  save(db);
}
