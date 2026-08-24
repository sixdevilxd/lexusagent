import "dotenv/config";
import { resolveChain } from "./chains";
import { DEX_PRESETS } from "./wallet/presets";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const chainKey = (process.env.CHAIN ?? "base").trim();
const chain = resolveChain(chainKey);
if (!chain) {
  throw new Error(
    `Unsupported CHAIN: "${chainKey}". Use a viem chain name, an alias, or a numeric chain id.`,
  );
}

const explorerBase = chain.blockExplorers?.default?.url ?? "";
const explorerTx = explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/` : "";
const rpcUrl = process.env.RPC_URL || chain.rpcUrls.default.http[0];

const zerodevProjectId = process.env.ZERODEV_PROJECT_ID ?? "";
const zerodevRpc =
  process.env.ZERODEV_RPC ||
  (zerodevProjectId
    ? `https://rpc.zerodev.app/api/v3/${zerodevProjectId}/chain/${chain.id}`
    : "");

const preset = DEX_PRESETS[chain.id];

// AgentRouter base URL - exactly this, nothing appended.
const AGENTROUTER_BASE_URL = "https://agentrouter.org";

type Provider = "agentrouter-claude" | "agentrouter" | "anthropic" | "claude";
const VALID: Provider[] = ["agentrouter-claude", "agentrouter", "anthropic", "claude"];

const rawProvider = (process.env.AI_PROVIDER ?? "agentrouter-claude").trim() as Provider;
const aiProvider: Provider = VALID.includes(rawProvider)
  ? rawProvider
  : "agentrouter-claude";
if (rawProvider !== aiProvider) {
  console.warn(
    `[config] Unknown AI_PROVIDER="${rawProvider}" - falling back to "${aiProvider}". ` +
      `Valid: ${VALID.join(", ")}`,
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

  // ---- AI ----
  aiProvider,

  // AgentRouter (their free tier only accepts approved coding clients)
  agentRouter: {
    apiKey: process.env.AGENTROUTER_API_KEY ?? "",
    baseUrl: AGENTROUTER_BASE_URL,
    model: process.env.AGENTROUTER_MODEL ?? "gpt-5.5",
    anthropicModel: process.env.AGENTROUTER_CLAUDE_MODEL ?? "claude-opus-5",
    maxTokens: Number(process.env.AGENTROUTER_MAX_TOKENS ?? "4096"),
    idleMs: Number(process.env.AI_IDLE_TIMEOUT_MS ?? "60000"),
  },

  // Your own Anthropic-compatible endpoint (direct API, OpenRouter, gateway...)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  },

  // Local Claude Code CLI
  claudeCmd: process.env.CLAUDE_CMD ?? "claude",
  claudeArgs: (process.env.CLAUDE_ARGS ?? "-p").split(" ").filter(Boolean),

  // ---- GitHub OAuth (Device Flow) ----
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    scopes: process.env.GITHUB_SCOPES || GITHUB_FULL_SCOPES,
  },

  // ---- Default chain (auto-switch overrides this per operation) ----
  chainKey,
  chain,
  chainId: chain.id,
  chainName: chain.name,
  isTestnet: Boolean((chain as any).testnet),
  explorerTx,
  rpcUrl,

  zerodev: {
    projectId: zerodevProjectId,
    rpc: zerodevRpc,
    bundlerRpc: process.env.ZERODEV_BUNDLER_RPC ?? "",
    paymasterRpc: process.env.ZERODEV_PAYMASTER_RPC ?? "",
  },

  walletEncryptionKey: req("WALLET_ENCRYPTION_KEY"),

  // Uniswap V3 for the DEFAULT chain; per-chain presets live in chains.ts
  dexRouter: (process.env.DEX_ROUTER || preset?.router || "") as `0x${string}`,
  quoter: (process.env.QUOTER_ADDRESS || preset?.quoter || "") as `0x${string}`,
  factory: (process.env.UNISWAP_FACTORY || preset?.factory || "") as `0x${string}`,
  positionManager: (process.env.POSITION_MANAGER ||
    preset?.positionManager ||
    "") as `0x${string}`,
  wethAddress: (process.env.WETH_ADDRESS || preset?.weth || "") as `0x${string}`,
  slippageBps: Number(process.env.DEFAULT_SLIPPAGE_BPS ?? "100"),

  mint: {
    factory: (process.env.TOKEN_FACTORY_ADDRESS ?? "") as `0x${string}`,
    creationFeeEth: process.env.MINT_CREATION_FEE_ETH ?? "",
  },
} as const;
