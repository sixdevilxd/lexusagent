import { config } from "../config";
import { streamAgentRouter } from "./agentrouter";
import { askClaude } from "./claude";
import { runAgent } from "./agent";

/**
 * AI entry point.
 *
 *   agentrouter-claude : AgentRouter Anthropic endpoint + realtime tools
 *   anthropic          : your own Anthropic-compatible endpoint + realtime tools
 *   agentrouter        : AgentRouter OpenAI-compatible streaming, no tools
 *   claude             : local Claude Code CLI, no tools
 */
export async function askStream(
  prompt: string,
  onDelta: (text: string) => void,
  opts?: { idleMs?: number },
): Promise<string> {
  if (config.aiProvider === "claude") {
    const out = await askClaude(prompt);
    onDelta(out);
    return out;
  }

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

/** Non-streaming convenience wrapper. */
export async function ask(
  prompt: string,
  opts?: { idleMs?: number },
): Promise<string> {
  return askStream(prompt, () => {}, opts);
}
