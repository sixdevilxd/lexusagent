import { config } from "../config";
import { streamAgentRouter, streamAgentRouterAnthropic } from "./agentrouter";

/**
 * Streaming AI entry point. Always runs on the AgentRouter API key.
 * `onDelta` is called with each text fragment as it arrives.
 * Returns the complete answer.
 */
export async function askStream(
  prompt: string,
  onDelta: (text: string) => void,
  opts?: { idleMs?: number },
): Promise<string> {
  return config.aiProvider === "agentrouter"
    ? streamAgentRouter(prompt, onDelta, opts)
    : streamAgentRouterAnthropic(prompt, onDelta, opts);
}

/** Non-streaming convenience wrapper (used by the mint page reader). */
export async function ask(
  prompt: string,
  opts?: { idleMs?: number },
): Promise<string> {
  return askStream(prompt, () => {}, opts);
}
