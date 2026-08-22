import "dotenv/config";
import type { Chain } from "viem";
import {
  base,
  baseSepolia,
  mainnet,
  sepolia,
  arbitrum,
  optimism,
  polygon,
} from "viem/chains";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const CHAINS: Record<string, Chain> = {
  mainnet,
  sepolia,
  base,
  "base-sepolia": baseSepolia,
  arbitrum,
  optimism,
  polygon,
};

const EXPLORERS: Record<string, string> = {
  mainnet: "https://etherscan.io/tx/",
  sepolia: "https://sepolia.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  "base-sepolia": "https://sepolia.basescan.org/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  polygon: "https://polygonscan.com/tx/",
};

const chainKey = process.env.CHAIN ?? "base-sepolia";
const chain = CHAINS[chainKey];
if (!chain) throw new Error(`Unsupported CHAIN: ${chainKey}`);

// AgentRouter base URL — exactly this, nothing appended.
const AGENTROUTER_BASE_URL = "https://agentrouter.org";

// Full-access GitHub OAuth scopes.
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

  // ---- AI provider selection ----
  // agentrouter-claude | agentrouter | claude
  aiProvider: (process.env.AI_PROVIDER ?? "agentrouter-claude") as
    | "claude"
    | "agentrouter"
    | "agentrouter-claude",

  claudeCmd: process.env.CLAUDE_CMD ?? "claude",
  claudeArgs: (process.env.CLAUDE_ARGS ?? "-p").split(" ").filter(Boolean),

  // AgentRouter. Base URL is fixed — endpoint paths are added per request.
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
    scopes: process.env.GITHUB_SCOPES ?? GITHUB_FULL_SCOPES,
  },

  // ---- Chain / RPC ----
  chainKey,
  chain,
  explorerTx: EXPLORERS[chainKey] ?? "",
  rpcUrl: req("RPC_URL"),

  // ---- ZeroDev (API v3: one RPC serves bundler + paymaster) ----
  zerodev: {
    projectId: process.env.ZERODEV_PROJECT_ID ?? "",
    rpc: process.env.ZERODEV_RPC ?? "",
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
