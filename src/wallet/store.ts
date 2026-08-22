import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encrypt, decrypt } from "./crypto";

const WALLETS_FILE = join(process.cwd(), "data", "wallets.json");

type WalletRecord = {
  encPrivateKey: string;
  eoaAddress: string;
  createdAt: string;
};
type WalletDB = Record<string, WalletRecord>;

function load(): WalletDB {
  if (!existsSync(WALLETS_FILE)) return {};
  return JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
}

function save(db: WalletDB): void {
  mkdirSync(dirname(WALLETS_FILE), { recursive: true });
  writeFileSync(WALLETS_FILE, JSON.stringify(db, null, 2), { mode: 0o600 });
}

export function hasWallet(userId: number): boolean {
  return Boolean(load()[String(userId)]);
}

export function createWallet(userId: number): { eoaAddress: string } {
  const db = load();
  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);
  db[String(userId)] = {
    encPrivateKey: encrypt(pk),
    eoaAddress: acct.address,
    createdAt: new Date().toISOString(),
  };
  save(db);
  return { eoaAddress: acct.address };
}

export function getPrivateKey(userId: number): `0x${string}` {
  const rec = load()[String(userId)];
  if (!rec) throw new Error("No wallet found. Use /wallet to create one.");
  return decrypt(rec.encPrivateKey) as `0x${string}`;
}

export function getEoaAddress(userId: number): string | null {
  return load()[String(userId)]?.eoaAddress ?? null;
}
