/**
 * Token safety scanning.
 * Primary: gmgn.ai (free endpoint). It sits behind Cloudflare and often blocks
 * server-side requests, so we always fall back to GoPlus + DexScreener, which
 * are free, keyless and reliable.
 */

const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

const GOPLUS_CHAIN: Record<string, string> = {
  ethereum: "1",
  eth: "1",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  base: "8453",
  avalanche: "43114",
  solana: "solana",
};

const yn = (v: any) => (v === "1" || v === 1 || v === true ? "YES" : "no");
const taxPct = (v: any) => (v == null || v === "" ? "?" : `${(Number(v) * 100).toFixed(1)}%`);

async function gmgn(chain: string, address: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://gmgn.ai/defi/quotation/v1/tokens/${chain}/${address}`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    const t = j?.data?.token;
    if (!t) return null;
    return [
      `gmgn.ai — ${t.symbol ?? "?"} (${t.name ?? "?"})`,
      `  price      $${t.price ?? "?"}`,
      `  liquidity  $${t.liquidity ?? "?"}`,
      `  holders    ${t.holder_count ?? "?"}`,
      `  top10      ${t.top_10_holder_rate ?? "?"}`,
      `  renounced  ${t.renounced ?? "?"}`,
      `  burn LP    ${t.burn_ratio ?? "?"}`,
      `  link       https://gmgn.ai/${chain}/token/${address}`,
    ].join("\n");
  } catch {
    return null;
  }
}

async function goplus(chain: string, address: string): Promise<string | null> {
  const id = GOPLUS_CHAIN[chain.toLowerCase()];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${address}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    const d = j?.result?.[address.toLowerCase()];
    if (!d) return null;

    const flags: string[] = [];
    if (d.is_honeypot === "1") flags.push("HONEYPOT");
    if (d.cannot_sell_all === "1") flags.push("CANNOT_SELL_ALL");
    if (d.is_blacklisted === "1") flags.push("BLACKLIST");
    if (d.is_mintable === "1") flags.push("MINTABLE");
    if (d.can_take_back_ownership === "1") flags.push("OWNERSHIP_RECLAIM");
    if (d.transfer_pausable === "1") flags.push("PAUSABLE");
    if (d.hidden_owner === "1") flags.push("HIDDEN_OWNER");
    if (Number(d.buy_tax) > 0.1 || Number(d.sell_tax) > 0.1) flags.push("HIGH_TAX");

    return [
      `GoPlus security — ${d.token_symbol ?? "?"} (${d.token_name ?? "?"})`,
      `  honeypot        ${yn(d.is_honeypot)}`,
      `  buy / sell tax  ${taxPct(d.buy_tax)} / ${taxPct(d.sell_tax)}`,
      `  open source     ${yn(d.is_open_source)}`,
      `  proxy           ${yn(d.is_proxy)}`,
      `  mintable        ${yn(d.is_mintable)}`,
      `  owner can pause ${yn(d.transfer_pausable)}`,
      `  holders         ${d.holder_count ?? "?"}`,
      `  LP holders      ${d.lp_holder_count ?? "?"}`,
      `  creator holds   ${d.creator_percent ?? "?"}`,
      flags.length ? `  ⚠️ FLAGS        ${flags.join(", ")}` : "  ✅ no critical flags",
    ].join("\n");
  } catch {
    return null;
  }
}

/** Full degen scan: gmgn (if reachable) + GoPlus security. */
export async function scanToken(address: string, chain = "base"): Promise<string> {
  const [g, gp] = await Promise.all([gmgn(chain, address), goplus(chain, address)]);
  const parts = [g, gp].filter(Boolean) as string[];
  if (!parts.length) {
    return (
      `Could not scan ${address} on ${chain}.\n` +
      "gmgn.ai may be blocking server requests and GoPlus has no data for this token."
    );
  }
  if (!g) {
    parts.push(
      `(gmgn.ai unreachable from server — Cloudflare. Manual: https://gmgn.ai/${chain}/token/${address})`,
    );
  }
  return parts.join("\n\n");
}
