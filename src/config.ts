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

export const config = {
  telegramToken: req("TELEGRAM_BOT_TOKEN"),
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  claudeCmd: process.env.CLAUDE_CMD ?? "claude",
  claudeArgs: (process.env.CLAUDE_ARGS ?? "-p").split(" ").filter(Boolean),
  chainKey,
  chain,
  explorerTx: EXPLORERS[chainKey] ?? "",
  rpcUrl: req("RPC_URL"),
  zerodev: {
    projectId: process.env.ZERODEV_PROJECT_ID ?? "",
    bundlerRpc: process.env.ZERODEV_BUNDLER_RPC ?? "",
    paymasterRpc: process.env.ZERODEV_PAYMASTER_RPC ?? "",
  },
  walletEncryptionKey: req("WALLET_ENCRYPTION_KEY"),
  dexRouter: (process.env.DEX_ROUTER ?? "") as `0x${string}`,
  wethAddress: (process.env.WETH_ADDRESS ?? "") as `0x${string}`,
  slippageBps: Number(process.env.DEFAULT_SLIPPAGE_BPS ?? "100"),
} as const;
