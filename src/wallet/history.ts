import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = join(process.cwd(), "data", "tx.json");

export type Tx = {
  type: "buy" | "sell" | "mint" | "lp" | "nft";
  token: string;
  amount: string;
  txHash: string;
  at: string;
};
type DB = Record<string, Tx[]>;

function load(): DB {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
}
function save(db: DB): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export function recordTx(userId: number, tx: Omit<Tx, "at">): void {
  const db = load();
  const list = db[String(userId)] ?? [];
  list.unshift({ ...tx, at: new Date().toISOString() });
  db[String(userId)] = list.slice(0, 50);
  save(db);
}

export function getTxs(userId: number, limit = 10): Tx[] {
  return (load()[String(userId)] ?? []).slice(0, limit);
}
