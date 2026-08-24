import * as viemChains from "viem/chains";
import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { DEX_PRESETS, type DexPreset } from "./wallet/presets";

/** Friendly .env / user aliases -> viem chain export names. */
export const CHAIN_ALIASES: Record<string, string> = {
  eth: "mainnet",
  ethereum: "mainnet",
  "base-sepolia": "baseSepolia",
  "arbitrum-one": "arbitrum",
  "arbitrum-nova": "arbitrumNova",
  "arbitrum-sepolia": "arbitrumSepolia",
  "optimism-sepolia": "optimismSepolia",
  "op-sepolia": "optimismSepolia",
  "polygon-amoy": "polygonAmoy",
  bnb: "bsc",
  binance: "bsc",
  bsc: "bsc",
  opbnb: "opBNB",
  "avalanche-fuji": "avalancheFuji",
  fuji: "avalancheFuji",
  avax: "avalanche",
  "linea-sepolia": "lineaSepolia",
  "scroll-sepolia": "scrollSepolia",
  "mantle-sepolia": "mantleSepoliaTestnet",
  "mode-testnet": "modeTestnet",
  "blast-sepolia": "blastSepolia",
  "celo-alfajores": "celoAlfajores",
  "gnosis-chiado": "gnosisChiado",
  "unichain-sepolia": "unichainSepolia",
  "ink-sepolia": "inkSepolia",
  "monad-testnet": "monadTestnet",
  zksync: "zksync",
  "zksync-era": "zksync",
};

/** Chains DexScreener reports that are NOT EVM - we cannot touch these. */
export const NON_EVM = new Set([
  "solana",
  "sui",
  "aptos",
  "ton",
  "tron",
  "near",
  "cardano",
  "osmosis",
  "injective",
  "starknet",
  "hedera",
  "icp",
]);

/** DexScreener chainId string -> viem chain export name. */
const DEXSCREENER_MAP: Record<string, string> = {
  ethereum: "mainnet",
  bsc: "bsc",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  avalanche: "avalanche",
  linea: "linea",
  scroll: "scroll",
  blast: "blast",
  mantle: "mantle",
  celo: "celo",
  gnosis: "gnosis",
  mode: "mode",
  zksync: "zksync",
  unichain: "unichain",
  berachain: "berachain",
  sonic: "sonic",
  ink: "ink",
  opbnb: "opBNB",
  degen: "degen",
  cyber: "cyber",
  aurora: "aurora",
  fantom: "fantom",
  moonbeam: "moonbeam",
  moonriver: "moonriver",
  cronos: "cronos",
  metis: "metis",
  boba: "boba",
  kava: "kava",
  fraxtal: "fraxtal",
  taiko: "taiko",
  zora: "zora",
  worldchain: "worldchain",
  apechain: "apeChain",
  abstract: "abstract",
};

const isChain = (c: any): c is Chain =>
  c && typeof c === "object" && typeof c.id === "number";

/** Resolve by viem export name, alias, or numeric chain id. */
export function resolveChain(key: string): Chain | undefined {
  const all = viemChains as unknown as Record<string, Chain>;
  const k = String(key ?? "").trim();
  if (!k) return undefined;

  if (/^\d+$/.test(k)) {
    const id = Number(k);
    return Object.values(all).find((c) => isChain(c) && c.id === id);
  }

  const name = CHAIN_ALIASES[k.toLowerCase()] ?? k;
  const direct = all[name];
  if (isChain(direct)) return direct;

  const found = Object.entries(all).find(
    ([n, v]) => n.toLowerCase() === name.toLowerCase() && isChain(v),
  );
  return found?.[1];
}

export function chainById(id: number): Chain | undefined {
  const all = viemChains as unknown as Record<string, Chain>;
  return Object.values(all).find((c) => isChain(c) && c.id === id);
}

/** Map a DexScreener chainId string to a viem chain. */
export function chainFromDexScreener(id: string): Chain | undefined {
  const key = String(id ?? "").toLowerCase();
  if (NON_EVM.has(key)) return undefined;
  const name = DEXSCREENER_MAP[key];
  return resolveChain(name ?? key);
}

// ---------------------------------------------------------------- context

export type ChainCtx = {
  chain: Chain;
  chainId: number;
  name: string;
  isTestnet: boolean;
  rpcUrl: string;
  explorerTx: string;
  preset?: DexPreset;
  publicClient: PublicClient;
};

const ctxCache = new Map<number, ChainCtx>();

/**
 * ZeroDev API v3 exposes one RPC per chain, derived from the project id.
 * Any chain enabled on the project works without extra config.
 */
export function zerodevRpcFor(chainId: number): string {
  const explicit = process.env.ZERODEV_RPC;
  const pid = process.env.ZERODEV_PROJECT_ID ?? "";
  if (explicit && String(chainId) === String(process.env.CHAIN_ID_OF_EXPLICIT_RPC ?? "")) {
    return explicit;
  }
  return pid ? `https://rpc.zerodev.app/api/v3/${pid}/chain/${chainId}` : "";
}

/**
 * Build (and cache) everything needed to talk to a chain.
 * Reads go through the ZeroDev RPC when available because public endpoints
 * strip revert data, which breaks smart-account address derivation.
 */
export function chainCtx(chain: Chain): ChainCtx {
  const cached = ctxCache.get(chain.id);
  if (cached) return cached;

  const aaRpc = zerodevRpcFor(chain.id);
  const rpcUrl = aaRpc || chain.rpcUrls.default.http[0];
  const explorerBase = chain.blockExplorers?.default?.url ?? "";

  const ctx: ChainCtx = {
    chain,
    chainId: chain.id,
    name: chain.name,
    isTestnet: Boolean((chain as any).testnet),
    rpcUrl,
    explorerTx: explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/` : "",
    preset: DEX_PRESETS[chain.id],
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient,
  };

  ctxCache.set(chain.id, ctx);
  return ctx;
}

// ------------------------------------------------------- auto-detection

export type TokenChainHit = {
  chain: Chain;
  dexChainId: string;
  symbol: string;
  priceUsd?: string;
  liquidityUsd?: number;
};

/**
 * Find which EVM chain a token actually trades on, by deepest liquidity.
 * Returns undefined when the token only exists on non-EVM chains.
 */
export async function detectChainForToken(
  address: string,
): Promise<{ hit?: TokenChainHit; nonEvmOnly?: string[] }> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return {};
  const data: any = await res.json();
  const pairs: any[] = data?.pairs ?? [];
  if (!pairs.length) return {};

  const sorted = [...pairs].sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  );

  const nonEvm: string[] = [];
  for (const p of sorted) {
    const dexChainId = String(p.chainId ?? "").toLowerCase();
    if (NON_EVM.has(dexChainId)) {
      if (!nonEvm.includes(dexChainId)) nonEvm.push(dexChainId);
      continue;
    }
    const chain = chainFromDexScreener(dexChainId);
    if (!chain) continue;
    return {
      hit: {
        chain,
        dexChainId,
        symbol: p.baseToken?.symbol ?? "?",
        priceUsd: p.priceUsd,
        liquidityUsd: p.liquidity?.usd,
      },
    };
  }

  return { nonEvmOnly: nonEvm.length ? nonEvm : undefined };
}
