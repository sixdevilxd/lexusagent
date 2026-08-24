import type { MintPlan } from "./analyze";

export type Eligibility = {
  checked: boolean;
  eligible: boolean;
  phase?: string;
  proof?: string[];
  signature?: string;
  maxMint?: number;
  endpoint?: string;
  raw?: string;
};

const PROOF_KEYS = ["proof", "merkleproof", "hexproof", "merkle_proof", "proofs"];
const SIG_KEYS = ["signature", "sig", "voucher", "signedmessage"];
const FLAG_KEYS = ["eligible", "allowlisted", "iswhitelisted", "whitelisted", "canmint", "isallowed"];
const MAX_KEYS = ["maxmint", "maxamount", "limit", "allowance", "quantity", "maxperwallet"];

function walk(obj: any, keys: string[]): any {
  if (obj == null || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k.toLowerCase().replace(/[^a-z]/g, ""))) return v;
  }
  for (const v of Object.values(obj)) {
    const hit = walk(v, keys);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function buildUrl(endpoint: string, address: string): string {
  if (/\{address\}|\{wallet\}|\{account\}/i.test(endpoint)) {
    return endpoint.replace(/\{address\}|\{wallet\}|\{account\}/gi, address);
  }
  // No placeholder - append or replace any existing 0x address in the URL.
  if (/0x[a-fA-F0-9]{40}/.test(endpoint)) {
    return endpoint.replace(/0x[a-fA-F0-9]{40}/, address);
  }
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}address=${address}`;
}

/**
 * Hit the allowlist/proof endpoint discovered during recon using OUR smart
 * account address, and work out whether we are GTD / FCFS / WL / not eligible.
 */
export async function checkEligibility(
  plan: MintPlan,
  address: string,
): Promise<Eligibility> {
  if (!plan.proofEndpoint) {
    return { checked: false, eligible: false };
  }

  const url = buildUrl(plan.proofEndpoint, address);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const raw = (await res.text()).slice(0, 2000);
    if (!res.ok) {
      return { checked: true, eligible: false, endpoint: url, raw: `HTTP ${res.status}: ${raw}` };
    }

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return { checked: true, eligible: false, endpoint: url, raw };
    }

    const proofRaw = walk(json, PROOF_KEYS);
    const proof = Array.isArray(proofRaw)
      ? proofRaw.filter((p) => typeof p === "string")
      : undefined;
    const signature = walk(json, SIG_KEYS);
    const flag = walk(json, FLAG_KEYS);
    const maxRaw = walk(json, MAX_KEYS);

    const eligible =
      (Array.isArray(proof) && proof.length > 0) ||
      typeof signature === "string" ||
      flag === true ||
      flag === "true";

    return {
      checked: true,
      eligible,
      proof,
      signature: typeof signature === "string" ? signature : undefined,
      maxMint: maxRaw != null && !isNaN(Number(maxRaw)) ? Number(maxRaw) : undefined,
      endpoint: url,
      raw: raw.slice(0, 600),
    };
  } catch (e: any) {
    return { checked: true, eligible: false, endpoint: url, raw: `fetch failed: ${e?.message ?? e}` };
  }
}
