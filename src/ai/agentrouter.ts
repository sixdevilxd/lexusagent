import { config } from "../config";

/**
 * AgentRouter (https://agentrouter.org) supports two protocols:
 *
 *   1. OpenAI Compatible  -> base https://agentrouter.org/v1   (gpt-5.5, glm-5.2)
 *   2. Anthropic Messages -> base https://agentrouter.org       (claude-opus-4-6/4-7/4-8)
 *
 * Both base URLs are hardcoded to agentrouter.org by project requirement.
 * Do NOT mix the two (see AgentRouter docs).
 */

function withTimeout(timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** OpenAI-compatible: POST https://agentrouter.org/v1/chat/completions */
export async function askAgentRouter(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { apiKey, baseUrl, model } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const t = withTimeout(opts.timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: t.signal,
    });

    if (!res.ok) throw new Error(`AgentRouter ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "(no output)";
  } finally {
    t.done();
  }
}

/** Anthropic-compatible: POST https://agentrouter.org/v1/messages (Bearer auth). */
export async function askAgentRouterAnthropic(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { apiKey, anthropicBaseUrl, anthropicModel, maxTokens } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const t = withTimeout(opts.timeoutMs);
  try {
    const res = await fetch(`${anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // AgentRouter expects the key as a Bearer token (same as Claude Code's
        // ANTHROPIC_AUTH_TOKEN behaviour).
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: t.signal,
    });

    if (!res.ok) throw new Error(`AgentRouter ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.map((c: any) => c?.text ?? "").join("").trim()
      : "";
    return text || "(no output)";
  } finally {
    t.done();
  }
}
