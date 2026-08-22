import { config } from "../config";
import { askClaude } from "./claude";
import { askAgentRouter, askAgentRouterAnthropic } from "./agentrouter";

/**
 * Unified AI entry point. Routes to the provider selected via AI_PROVIDER:
 *   - "claude"             -> local Claude Code CLI (default)
 *   - "agentrouter"        -> AgentRouter, OpenAI-compatible  (gpt-5.5 / glm-5.2)
 *   - "agentrouter-claude" -> AgentRouter, Anthropic protocol (claude-opus-4-6)
 */
export async function ask(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<string> {
  switch (config.aiProvider) {
    case "agentrouter":
      return askAgentRouter(prompt, opts);
    case "agentrouter-claude":
      return askAgentRouterAnthropic(prompt, opts);
    default:
      return askClaude(prompt, opts);
  }
}
