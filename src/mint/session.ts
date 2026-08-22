import type { MintParams } from "./launchpad";

export type MintDraft = Partial<MintParams> & {
  url?: string;
  awaiting?: keyof MintParams | null;
  stage?: "collect" | "confirm";
};

// In-memory per-user mint drafts. (Resets on restart — fine for a wizard.)
const sessions = new Map<number, MintDraft>();

export function getDraft(userId: number): MintDraft | undefined {
  return sessions.get(userId);
}
export function setDraft(userId: number, d: MintDraft): void {
  sessions.set(userId, d);
}
export function clearDraft(userId: number): void {
  sessions.delete(userId);
}
