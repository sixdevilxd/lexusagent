import { ask } from "../ai";
import type { ReconResult } from "./browser";

export type MintPhase = {
  name: string;
  type: "gtd" | "fcfs" | "wl" | "public" | "unknown";
  startsAt?: string;
  endsAt?: string;
  price?: string;
  maxPerWallet?: number;
};

export type MintPlan = {
  contract?: string;
  chain?: string;
  collection?: string;
  phases: MintPhase[];
  proofEndpoint?: string;
  mintFunction?: string;
  priceEach?: string;
  supply?: string;
  confidence?: "high" | "medium" | "low";
  notes?: string;
};

const EMPTY: MintPlan = { phases: [], confidence: "low" };

function extractJson(s: string): any | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Turn raw recon output into a structured mint plan.
 * The captured API calls matter most: allowlist and merkle-proof endpoints
 * are what decide GTD / FCFS / WL eligibility.
 */
export async function analyzeMintSite(recon: ReconResult): Promise<MintPlan> {
  const api = recon.apiCalls
    .map(
      (a, i) =>
        `[${i}] ${a.method} ${a.status} ${a.url}\n${a.body.slice(0, 700)}`,
    )
    .join("\n\n")
    .slice(0, 9000);

  const prompt = [
    "You are analysing an NFT mint page to build an execution plan.",
    "",
    "Return ONLY minified JSON, no prose, matching this shape:",
    '{"contract":"0x..","chain":"base|ethereum|..","collection":"name",',
    '"phases":[{"name":"GTD","type":"gtd|fcfs|wl|public|unknown","startsAt":"ISO8601","endsAt":"ISO8601","price":"0.01","maxPerWallet":2}],',
    '"proofEndpoint":"https://api.site/allowlist?address={address}",',
    '"mintFunction":"mint(uint256,bytes32[])","priceEach":"0.01","supply":"5000",',
    '"confidence":"high|medium|low","notes":"anything important"}',
    "",
    "Rules:",
    "- contract must be the NFT/mint contract, not a router, token or zero address.",
    "- If an API call returns allowlist / merkle proof / signature data, put its URL in proofEndpoint and replace the wallet address with the {address} placeholder.",
    "- Map phase names: guaranteed/GTD -> gtd, FCFS/raffle/waitlist -> fcfs, allowlist/whitelist/OG -> wl, public/open -> public.",
    "- Use ISO8601 UTC for times. Omit fields you cannot determine. Never guess an address.",
    "- Set confidence low if the contract address is not clearly identifiable.",
    "",
    `PAGE: ${recon.title}`,
    `URL: ${recon.url}`,
    "",
    "VISIBLE TEXT:",
    recon.text.slice(0, 6000),
    "",
    "ADDRESSES SEEN:",
    recon.addresses.join(", "),
    "",
    "CAPTURED API CALLS:",
    api || "(none)",
  ].join("\n");

  const out = await ask(prompt);
  const parsed = extractJson(out);
  if (!parsed) return { ...EMPTY, notes: "Could not parse a plan from the page." };

  return {
    ...EMPTY,
    ...parsed,
    phases: Array.isArray(parsed.phases) ? parsed.phases : [],
  };
}
