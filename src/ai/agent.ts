import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFS, runTool, toolLabel } from "../tools";

const MAX_STEPS = 6;
const MAX_TOOL_CHARS = 12000;

type Msg = { role: "user" | "assistant"; content: any };

function systemPrompt(): string {
  return SYSTEM_PROMPT + "\n\nCurrent UTC time: " + new Date().toISOString();
}

/** Resolve which Anthropic-compatible endpoint and credentials to use. */
function endpoint(): { url: string; headers: Record<string, string>; model: string } {
  if (config.aiProvider === "anthropic") {
    const { apiKey, baseUrl, model } = config.anthropic;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env");
    return {
      url: `${baseUrl.replace(/\/$/, "")}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      model,
    };
  }

  const { apiKey, baseUrl, anthropicModel } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");
  return {
    url: `${baseUrl}/v1/messages`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
    },
    model: anthropicModel,
  };
}

function explain(status: number, body: string): string {
  if (status === 401 && /unauthorized_client|unauthorized client/i.test(body)) {
    return (
      "AgentRouter rejected this client (401 unauthorized_client). Their free tier only " +
      "accepts approved coding clients, not custom apps.\n" +
      "Options:\n" +
      "  1. AI_PROVIDER=claude and route the claude CLI through AgentRouter " +
      "(their documented path; realtime tools unavailable).\n" +
      "  2. AI_PROVIDER=anthropic with your own ANTHROPIC_API_KEY " +
      "(or any Anthropic-compatible endpoint via ANTHROPIC_BASE_URL); tools work.\n" +
      "  3. Ask AgentRouter support whether custom clients can be approved."
    );
  }
  if (status === 401) return "401 unauthorized - check the API key.";
  if (status === 429) return "429 rate limited or out of quota.";
  return `${status}: ${body.slice(0, 300)}`;
}

async function callModel(messages: Msg[], withTools: boolean): Promise<any> {
  const ep = endpoint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.agentRouter.idleMs * 3);
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: ep.headers,
      body: JSON.stringify({
        model: ep.model,
        max_tokens: config.agentRouter.maxTokens,
        system: systemPrompt(),
        ...(withTools ? { tools: TOOL_DEFS } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(explain(res.status, await res.text()));
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Agentic loop: the model may call tools (web search, prices, token scan)
 * before answering.
 */
export async function runAgent(
  userPrompt: string,
  onProgress: (label: string) => void,
  onText: (text: string) => void,
): Promise<string> {
  const messages: Msg[] = [{ role: "user", content: userPrompt }];
  let toolsEnabled = true;

  for (let step = 0; step < MAX_STEPS; step++) {
    let data: any;
    try {
      data = await callModel(messages, toolsEnabled);
    } catch (e: any) {
      if (toolsEnabled && /tool/i.test(e?.message ?? "") && !/unauthorized/i.test(e?.message ?? "")) {
        console.warn("[agent] tools rejected upstream, retrying without tools");
        toolsEnabled = false;
        data = await callModel(messages, false);
      } else {
        throw e;
      }
    }

    const blocks: any[] = data.content ?? [];
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const toolUses = blocks.filter((b) => b.type === "tool_use");

    if (!toolUses.length) {
      if (text) onText(text);
      return text;
    }

    if (text) onProgress(text);
    messages.push({ role: "assistant", content: blocks });

    const results: any[] = [];
    for (const t of toolUses) {
      onProgress(toolLabel(t.name, t.input ?? {}));
      const out = await runTool(t.name, t.input ?? {});
      console.log("[tool] " + t.name + " -> " + out.length + " chars");
      results.push({
        type: "tool_result",
        tool_use_id: t.id,
        content: out.slice(0, MAX_TOOL_CHARS),
      });
    }
    messages.push({ role: "user", content: results });
  }

  const msg = "Stopped after too many tool calls without a final answer.";
  onText(msg);
  return msg;
}
