/** Realtime crypto market data — DexScreener + CoinGecko (both free, no key). */

const n = (v: any) => (v == null ? null : Number(v));
const usd = (v: any) =>
  v == null ? "?" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
const pct = (v: any) => (v == null ? "?" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`);

type Pair = {
  chainId: string;
  dexId: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  txns?: Record<string, { buys: number; sells: number }>;
};

function fmtPair(p: Pair): string {
  const age = p.pairCreatedAt
    ? `${Math.floor((Date.now() - p.pairCreatedAt) / 3_600_000)}h old`
    : "?";
  const h24 = p.txns?.h24;
  return [
    `${p.baseToken.symbol}/${p.quoteToken.symbol} on ${p.chainId} (${p.dexId})`,
    `  price      ${usd(p.priceUsd)}`,
    `  change     5m ${pct(p.priceChange?.m5)} | 1h ${pct(p.priceChange?.h1)} | 6h ${pct(p.priceChange?.h6)} | 24h ${pct(p.priceChange?.h24)}`,
    `  liquidity  ${usd(p.liquidity?.usd)}`,
    `  volume 24h ${usd(p.volume?.h24)}`,
    `  mcap/fdv   ${usd(p.marketCap ?? p.fdv)}`,
    h24 ? `  txns 24h   ${h24.buys} buys / ${h24.sells} sells` : "",
    `  age        ${age}`,
    `  token      ${p.baseToken.address}`,
    `  chart      ${p.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function dexScreener(path: string): Promise<any> {
  const res = await fetch(`https://api.dexscreener.com${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`dexscreener ${res.status}`);
  return res.json();
}

/** Search any token by symbol, name, pair or contract address. */
export async function tokenPrice(query: string, limit = 3): Promise<string> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(query.trim());
  const data = isAddress
    ? await dexScreener(`/latest/dex/tokens/${query.trim()}`)
    : await dexScreener(`/latest/dex/search?q=${encodeURIComponent(query)}`);

  const pairs: Pair[] = (data.pairs ?? [])
    .filter((p: Pair) => n(p.liquidity?.usd) !== null)
    .sort((a: Pair, b: Pair) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, limit);

  if (!pairs.length) return `No market data found for "${query}".`;
  return pairs.map(fmtPair).join("\n\n");
}

/** Majors / broad market via CoinGecko. */
export async function marketOverview(ids = "bitcoin,ethereum,solana"): Promise<string> {
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}` +
    "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data: any = await res.json();

  const lines = Object.entries(data).map(([id, v]: [string, any]) =>
    `${id.padEnd(10)} ${usd(v.usd).padEnd(14)} 24h ${pct(v.usd_24h_change)}  mcap ${usd(v.usd_market_cap)}`,
  );
  if (!lines.length) return `No data for ids: ${ids}`;
  return lines.join("\n") + `\n\n(as of ${new Date().toISOString()})`;
}

/** Newest pairs on a chain — useful for degen/meme hunting. */
export async function trendingPairs(chain = "base", limit = 8): Promise<string> {
  const data = await dexScreener(`/latest/dex/search?q=${encodeURIComponent(chain)}`);
  const pairs: Pair[] = (data.pairs ?? [])
    .filter((p: Pair) => p.chainId === chain)
    .sort((a: Pair, b: Pair) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, limit);
  if (!pairs.length) return `No pairs found on ${chain}.`;
  return pairs
    .map(
      (p) =>
        `${p.baseToken.symbol.padEnd(12)} ${usd(p.priceUsd).padEnd(14)} 24h ${pct(p.priceChange?.h24).padEnd(9)} vol ${usd(p.volume?.h24).padEnd(12)} liq ${usd(p.liquidity?.usd)}\n  ${p.baseToken.address}`,
    )
    .join("\n");
}
