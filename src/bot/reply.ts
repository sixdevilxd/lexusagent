import type { Context } from "grammy";

const TELEGRAM_LIMIT = 3800; // real limit is 4096; leave room for fences

/**
 * Split a long answer into Telegram-sized chunks without breaking code fences.
 * If a chunk ends inside a ``` block, the fence is closed and reopened.
 */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    if (cur.length + line.length + 1 > limit) {
      if (cur) chunks.push(cur);
      cur = line;
      while (cur.length > limit) {
        chunks.push(cur.slice(0, limit));
        cur = cur.slice(limit);
      }
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  if (!chunks.length) return ["(no output)"];

  let open = false;
  return chunks.map((c) => {
    const prefix = open ? "```\n" : "";
    const fences = (c.match(/```/g) ?? []).length;
    const nowOpen = ((open ? 1 : 0) + fences) % 2 === 1;
    const suffix = nowOpen ? "\n```" : "";
    open = nowOpen;
    return prefix + c + suffix;
  });
}

/**
 * Send a possibly-long reply. Tries Markdown first and falls back to plain text
 * so a malformed code block never results in a silent failure.
 */
export async function replyLong(ctx: Context, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await ctx.reply(chunk, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.reply(chunk, { link_preview_options: { is_disabled: true } });
    }
  }
}
