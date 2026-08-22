import { config } from "../config";
import { askAgentRouter, askAgentRouterAnthropic } from "./agentrouter";

/**
 * Unified AI entry point. The brain always runs on the AgentRouter API key.
 *   agentrouter-claude -> Anthropic protocol  (claude-opus-5)   [default]
 *   agentrouter        -> OpenAI-compatible   (gpt-5.5 / glm-5.2)
 */
export async function ask(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<string> {
  return config.aiProvider === "agentrouter"
    ? askAgentRouter(prompt, opts)
    : askAgentRouterAnthropic(prompt, opts);
}
