import { webSearch, socialSearch } from "./web";
import { tokenPrice, marketOverview, trendingPairs } from "./market";
import { scanToken } from "./security";

/** Anthropic tool definitions exposed to the model on every message. */
export const TOOL_DEFS = [
  {
    name: "web_search",
    description:
      "Search the live web. Use for any question about current events, news, docs, or anything you are not certain about. Always prefer this over guessing.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "social_search",
    description:
      "Search social platforms (X/Twitter, Threads, TikTok, Reddit, YouTube) for sentiment, alpha, or what people are saying right now. Uses search-engine indexing, so posts newer than ~1 hour may be missing.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        platforms: {
          type: "array",
          items: { type: "string", enum: ["x", "threads", "tiktok", "reddit", "youtube"] },
          description: "Defaults to x, threads, tiktok, reddit",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "token_price",
    description:
      "Realtime price, liquidity, volume, market cap, 5m/1h/6h/24h change and buy/sell counts for ANY token or meme coin. Accepts a symbol, name or contract address. Source: DexScreener. Use this for every price question — never state a price from memory.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Symbol, name or 0x contract address" },
      },
      required: ["query"],
    },
  },
  {
    name: "market_overview",
    description:
      "Current USD price, 24h change and market cap for major coins via CoinGecko. Pass comma-separated CoinGecko ids (e.g. bitcoin,ethereum,solana).",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "string", description: "CoinGecko ids, comma separated" },
      },
      required: [],
    },
  },
  {
    name: "trending_pairs",
    description:
      "Highest-volume trading pairs on a chain right now. Use for degen/meme hunting. chain examples: base, solana, ethereum, bsc, arbitrum.",
    input_schema: {
      type: "object",
      properties: {
        chain: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "scan_token",
    description:
      "Safety scan a token contract before buying: honeypot check, buy/sell tax, mintable, pausable, hidden owner, holder distribution, LP status. Sources: gmgn.ai + GoPlus. ALWAYS run this before recommending or executing a buy on an unknown token.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Token contract address" },
        chain: {
          type: "string",
          description: "base, ethereum, bsc, solana, arbitrum, polygon, optimism, avalanche",
        },
      },
      required: ["address"],
    },
  },
] as const;

/** Execute a tool call by name. Never throws — errors come back as text. */
export async function runTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "web_search":
        return await webSearch(String(input.query));
      case "social_search":
        return await socialSearch(String(input.query), input.platforms);
      case "token_price":
        return await tokenPrice(String(input.query));
      case "market_overview":
        return await marketOverview(input.ids ? String(input.ids) : undefined);
      case "trending_pairs":
        return await trendingPairs(input.chain ?? "base", input.limit ?? 8);
      case "scan_token":
        return await scanToken(String(input.address), input.chain ?? "base");
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `Tool "${name}" failed: ${e?.message ?? e}`;
  }
}

/** Short label shown to the user while a tool runs. */
export function toolLabel(name: string, input: any): string {
  switch (name) {
    case "web_search":
      return `🔍 searching: ${input.query}`;
    case "social_search":
      return `💬 social: ${input.query}`;
    case "token_price":
      return `💹 price: ${input.query}`;
    case "market_overview":
      return `📊 market overview`;
    case "trending_pairs":
      return `🔥 trending on ${input.chain ?? "base"}`;
    case "scan_token":
      return `🛡️ scanning ${String(input.address).slice(0, 10)}…`;
    default:
      return `⚙️ ${name}`;
  }
}
