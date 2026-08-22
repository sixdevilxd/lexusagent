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

// AgentRouter base URLs are FIXED to agentrouter.org by project requirement.
// OpenAI-compatible uses /v1; Anthropic-compatible does NOT. Never mix them.
const AGENTROUTER_OPENAI_BASE_URL = "https://agentrouter.org/v1";
const AGENTROUTER_ANTHROPIC_BASE_URL = "https://agentrouter.org";

export const config = {
  telegramToken: req("TELEGRAM_BOT_TOKEN"),
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),

  // ---- AI provider selection ----
  // claude | agentrouter | agentrouter-claude
  aiProvider: (process.env.AI_PROVIDER ?? "claude") as
    | "claude"
    | "agentrouter"
    | "agentrouter-claude",

  // Claude Code CLI
  claudeCmd: process.env.CLAUDE_CMD ?? "claude",
  claudeArgs: (process.env.CLAUDE_ARGS ?? "-p").split(" ").filter(Boolean),

  // AgentRouter. Base URLs are intentionally hardcoded.
  agentRouter: {
    apiKey: process.env.AGENTROUTER_API_KEY ?? "",
    baseUrl: AGENTROUTER_OPENAI_BASE_URL,
    anthropicBaseUrl: AGENTROUTER_ANTHROPIC_BASE_URL,
    model: process.env.AGENTROUTER_MODEL ?? "gpt-5.5",
    anthropicModel: process.env.AGENTROUTER_CLAUDE_MODEL ?? "claude-opus-5",
    maxTokens: Number(process.env.AGENTROUTER_MAX_TOKENS ?? "8192"),
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
    // Optional overrides; fall back to `rpc` when empty.
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
