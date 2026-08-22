import { config } from "../config";

/**
 * AgentRouter — base URL is ALWAYS exactly:
 *
 *     https://agentrouter.org
 *
 * Nothing is appended to it in config. The endpoint path is added per request:
 *   Anthropic protocol   -> /v1/messages          (claude-opus-5)
 *   OpenAI-compatible    -> /v1/chat/completions  (gpt-5.5, glm-5.2)
 */

function withTimeout(timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Anthropic protocol (default) — Claude Opus 5. */
export async function askAgentRouterAnthropic(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { apiKey, baseUrl, anthropicModel, maxTokens } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const t = withTimeout(opts.timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
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

/** OpenAI-compatible protocol — gpt-5.5 / glm-5.2. */
export async function askAgentRouter(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { apiKey, baseUrl, model } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const t = withTimeout(opts.timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
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
