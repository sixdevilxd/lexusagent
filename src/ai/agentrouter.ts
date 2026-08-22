import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * AgentRouter — base URL is ALWAYS exactly:  https://agentrouter.org
 * Endpoint paths are added per request:
 *   Anthropic protocol -> /v1/messages
 *   OpenAI-compatible  -> /v1/chat/completions
 *
 * Streaming is used everywhere: the first token arrives in ~1s and the
 * connection stays alive, so long answers never hit a request timeout.
 * Only a *stall* (no bytes for `idleMs`) aborts the request.
 */

type StreamOpts = { idleMs?: number };

function idleGuard(idleMs: number) {
  const controller = new AbortController();
  let timer: NodeJS.Timeout = setTimeout(() => controller.abort(), idleMs);
  return {
    signal: controller.signal,
    kick() {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), idleMs);
    },
    done() {
      clearTimeout(timer);
    },
  };
}

async function* sseLines(res: Response, guard: ReturnType<typeof idleGuard>) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    guard.kick();
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) yield line.trim();
  }
  if (buf.trim()) yield buf.trim();
}

/** Anthropic protocol streaming — Claude Opus 5. */
export async function streamAgentRouterAnthropic(
  prompt: string,
  onDelta: (text: string) => void,
  opts: StreamOpts = {},
): Promise<string> {
  const { apiKey, baseUrl, anthropicModel, maxTokens } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const guard = idleGuard(opts.idleMs ?? config.agentRouter.idleMs);
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: guard.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`AgentRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    let full = "";
    for await (const line of sseLines(res, guard)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          full += evt.delta.text;
          onDelta(evt.delta.text);
        } else if (evt.type === "error") {
          throw new Error(evt.error?.message ?? "stream error");
        }
      } catch {
        /* ignore keep-alive / partial frames */
      }
    }
    return full.trim();
  } finally {
    guard.done();
  }
}

/** OpenAI-compatible streaming — gpt-5.5 / glm-5.2. */
export async function streamAgentRouter(
  prompt: string,
  onDelta: (text: string) => void,
  opts: StreamOpts = {},
): Promise<string> {
  const { apiKey, baseUrl, model } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const guard = idleGuard(opts.idleMs ?? config.agentRouter.idleMs);
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: guard.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`AgentRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    let full = "";
    for await (const line of sseLines(res, guard)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* ignore */
      }
    }
    return full.trim();
  } finally {
    guard.done();
  }
}
