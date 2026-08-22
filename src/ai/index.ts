import { config } from "../config";
import { askClaude } from "./claude";
import { askAgentRouter } from "./agentrouter";

/**
 * Unified AI entry point. Routes to the provider selected via AI_PROVIDER:
 *   - "claude"      -> local Claude Code CLI (default)
 *   - "agentrouter" -> AgentRouter OpenAI-compatible API
 */
export async function ask(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<string> {
  if (config.aiProvider === "agentrouter") return askAgentRouter(prompt, opts);
  return askClaude(prompt, opts);
}
