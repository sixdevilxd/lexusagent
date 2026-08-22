import "dotenv/config";
import * as viemChains from "viem/chains";
import type { Chain } from "viem";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Friendly .env aliases -> viem chain export names.
// Any viem chain export name also works directly (e.g. CHAIN=berachain),
// as does a raw chain id (e.g. CHAIN=8453).
const CHAIN_ALIASES: Record<string, string> = {
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
  opbnb: "opBNB",
  "avalanche-fuji": "avalancheFuji",
  fuji: "avalancheFuji",
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
};

function resolveChain(key: string): Chain | undefined {
  const all = viemChains as unknown as Record<string, Chain>;
  const isChain = (c: any): c is Chain =>
    c && typeof c === "object" && typeof c.id === "number";

  // Numeric chain id, e.g. CHAIN=8453
  if (/^\d+$/.test(key)) {
    const id = Number(key);
    return Object.values(all).find((c) => isChain(c) && c.id === id);
  }

  const name = CHAIN_ALIASES[key.toLowerCase()] ?? key;
  const direct = all[name];
  if (isChain(direct)) return direct;

  // Last resort: case-insensitive match on the export name
  const found = Object.entries(all).find(
    ([k, v]) => k.toLowerCase() === name.toLowerCase() && isChain(v),
  );
  return found?.[1];
}

const chainKey = (process.env.CHAIN ?? "base-sepolia").trim();
const chain = resolveChain(chainKey);
if (!chain) {
  throw new Error(
    `Unsupported CHAIN: "${chainKey}".\n` +
      `Use a viem chain name (base, arbitrum, polygon, bsc, avalanche, linea, scroll, ...),\n` +
      `an alias (base-sepolia, arbitrum-sepolia, ...), or a numeric chain id (e.g. 8453).`,
  );
}

// Derived from the chain definition — works for every supported network.
const explorerBase = chain.blockExplorers?.default?.url ?? "";
const explorerTx = explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/` : "";

// RPC_URL is optional — fall back to the chain's public RPC.
const rpcUrl = process.env.RPC_URL || chain.rpcUrls.default.http[0];

// ZeroDev API v3 RPC is built automatically from the project id + chain id,
// which prevents "chain mismatch" mistakes. An explicit ZERODEV_RPC wins.
const zerodevProjectId = process.env.ZERODEV_PROJECT_ID ?? "";
const zerodevRpc =
  process.env.ZERODEV_RPC ||
  (zerodevProjectId
    ? `https://rpc.zerodev.app/api/v3/${zerodevProjectId}/chain/${chain.id}`
    : "");

// AgentRouter base URL — exactly this, nothing appended.
const AGENTROUTER_BASE_URL = "https://agentrouter.org";

// The AI always runs on the AgentRouter API key.
const rawProvider = (process.env.AI_PROVIDER ?? "agentrouter-claude").trim();
const aiProvider: "agentrouter-claude" | "agentrouter" =
  rawProvider === "agentrouter" ? "agentrouter" : "agentrouter-claude";
if (rawProvider !== aiProvider) {
  console.warn(
    `[config] AI_PROVIDER="${rawProvider}" is no longer supported — using "${aiProvider}" (AgentRouter API).`,
  );
}

const GITHUB_FULL_SCOPES = [
  "repo",
  "workflow",
  "write:packages",
  "delete:packages",
  "admin:org",
  "admin:public_key",
  "admin:repo_hook",
  "admin:org_hook",
  "gist",
  "notifications",
  "user",
  "delete_repo",
  "write:discussion",
  "admin:gpg_key",
  "admin:ssh_signing_key",
  "project",
  "codespace",
].join(",");

export const config = {
  telegramToken: req("TELEGRAM_BOT_TOKEN"),
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),

  // ---- AI (AgentRouter only) ----
  aiProvider,
  agentRouter: {
    apiKey: process.env.AGENTROUTER_API_KEY ?? "",
    baseUrl: AGENTROUTER_BASE_URL,
    model: process.env.AGENTROUTER_MODEL ?? "gpt-5.5",
    anthropicModel: process.env.AGENTROUTER_CLAUDE_MODEL ?? "claude-opus-5",
    maxTokens: Number(process.env.AGENTROUTER_MAX_TOKENS ?? "8192"),
  },

  // ---- GitHub OAuth (Device Flow) ----
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    scopes: process.env.GITHUB_SCOPES || GITHUB_FULL_SCOPES,
  },

  // ---- Chain / RPC ----
  chainKey,
  chain,
  chainId: chain.id,
  chainName: chain.name,
  isTestnet: Boolean((chain as any).testnet),
  explorerTx,
  rpcUrl,

  // ---- ZeroDev (API v3: one RPC serves bundler + paymaster) ----
  zerodev: {
    projectId: zerodevProjectId,
    rpc: zerodevRpc,
    bundlerRpc: process.env.ZERODEV_BUNDLER_RPC ?? "",
    paymasterRpc: process.env.ZERODEV_PAYMASTER_RPC ?? "",
  },

  // ---- Security ----
  walletEncryptionKey: req("WALLET_ENCRYPTION_KEY"),

  // ---- Trading ----
  dexRouter: (process.env.DEX_ROUTER ?? "") as `0x${string}`,
  wethAddress: (process.env.WETH_ADDRESS ?? "") as `0x${string}`,
  slippageBps: Number(process.env.DEFAULT_SLIPPAGE_BPS ?? "100"),

  // ---- Token Mint / Launchpad ----
  mint: {
    factory: (process.env.TOKEN_FACTORY_ADDRESS ?? "") as `0x${string}`,
    creationFeeEth: process.env.MINT_CREATION_FEE_ETH ?? "",
  },
} as const;
