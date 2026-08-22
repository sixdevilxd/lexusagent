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

// AgentRouter base URL is FIXED to agentrouter.org by project requirement.
// Do not point this at any other host.
const AGENTROUTER_BASE_URL = "https://agentrouter.org/v1";

export const config = {
  telegramToken: req("TELEGRAM_BOT_TOKEN"),
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),

  // ---- AI provider selection ----
  aiProvider: (process.env.AI_PROVIDER ?? "claude") as "claude" | "agentrouter",

  // Claude Code CLI
  claudeCmd: process.env.CLAUDE_CMD ?? "claude",
  claudeArgs: (process.env.CLAUDE_ARGS ?? "-p").split(" ").filter(Boolean),

  // AgentRouter (OpenAI-compatible). baseUrl is intentionally hardcoded.
  agentRouter: {
    apiKey: process.env.AGENTROUTER_API_KEY ?? "",
    baseUrl: AGENTROUTER_BASE_URL,
    model: process.env.AGENTROUTER_MODEL ?? "gpt-5",
  },

  // ---- Chain / RPC ----
  chainKey,
  chain,
  explorerTx: EXPLORERS[chainKey] ?? "",
  rpcUrl: req("RPC_URL"),

  // ---- ZeroDev ----
  zerodev: {
    projectId: process.env.ZERODEV_PROJECT_ID ?? "",
    bundlerRpc: process.env.ZERODEV_BUNDLER_RPC ?? "",
    paymasterRpc: process.env.ZERODEV_PAYMASTER_RPC ?? "",
  },

  // ---- Security ----
  walletEncryptionKey: req("WALLET_ENCRYPTION_KEY"),

  // ---- Trading ----
  dexRouter: (process.env.DEX_ROUTER ?? "") as `0x${string}`,
  wethAddress: (process.env.WETH_ADDRESS ?? "") as `0x${string}`,
  slippageBps: Number(process.env.DEFAULT_SLIPPAGE_BPS ?? "100"),
} as const;
