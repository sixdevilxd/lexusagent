import { config } from "../config";
import { streamAgentRouter } from "./agentrouter";
import { runAgent } from "./agent";

/**
 * Streaming AI entry point. Always runs on the AgentRouter API key.
 *
 * - agentrouter-claude (default): full agent loop with realtime tools
 *   (web search, social search, DexScreener prices, token safety scan).
 * - agentrouter: plain OpenAI-compatible streaming, no tools.
 *
 * onDelta receives progress lines first, then the final answer.
 */
export async function askStream(
  prompt: string,
  onDelta: (text: string) => void,
  opts?: { idleMs?: number },
): Promise<string> {
  if (config.aiProvider === "agentrouter") {
    return streamAgentRouter(prompt, onDelta, opts);
  }

  let sawProgress = false;
  return runAgent(
    prompt,
    (label) => {
      sawProgress = true;
      onDelta(label + "\n");
    },
    (text) => {
      onDelta(sawProgress ? "\n" + text : text);
    },
  );
}

/** Non-streaming convenience wrapper (used by the mint page reader). */
export async function ask(
  prompt: string,
  opts?: { idleMs?: number },
): Promise<string> {
  return askStream(prompt, () => {}, opts);
}
