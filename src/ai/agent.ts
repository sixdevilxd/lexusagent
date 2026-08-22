import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFS, runTool, toolLabel } from "../tools";

const MAX_STEPS = 6;
const MAX_TOOL_CHARS = 12000;

type Msg = { role: "user" | "assistant"; content: any };

function systemPrompt(): string {
  return SYSTEM_PROMPT + "\n\nCurrent UTC time: " + new Date().toISOString();
}

async function callModel(messages: Msg[], withTools: boolean): Promise<any> {
  const { apiKey, baseUrl, anthropicModel, maxTokens, idleMs } = config.agentRouter;
  if (!apiKey) throw new Error("AGENTROUTER_API_KEY not set in .env");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), idleMs * 3);
  try {
    const res = await fetch(baseUrl + "/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: systemPrompt(),
        ...(withTools ? { tools: TOOL_DEFS } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error("AgentRouter " + res.status + ": " + body);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Agentic loop: the model may call tools (web search, prices, token scan)
 * before answering. onProgress reports each tool call, onText receives the
 * final answer. Returns the final answer.
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
      // Upstream may not support the tools parameter - degrade gracefully.
      if (toolsEnabled && /tool/i.test(e?.message ?? "")) {
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
