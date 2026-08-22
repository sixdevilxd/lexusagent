import { config } from "../config";

/**
 * Ask AgentRouter (https://agentrouter.org) via its OpenAI-compatible API.
 * Base URL is fixed to https://agentrouter.org/v1 by project requirement.
 */
export async function askAgentRouter(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { apiKey, baseUrl, model } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

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
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AgentRouter ${res.status}: ${text}`);
    }

    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "(no output)";
  } finally {
    clearTimeout(timer);
  }
}
