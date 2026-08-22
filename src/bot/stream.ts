import type { Context } from "grammy";

const MAX_LEN = 3500; // Telegram hard limit is 4096
const EDIT_EVERY_MS = 1400; // avoid hitting Telegram rate limits

/** Close an unterminated ``` block so Markdown stays valid mid-stream. */
function balanceFences(text: string): string {
  const fences = (text.match(/```/g) ?? []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

/**
 * A Telegram message that is progressively edited as tokens stream in,
 * automatically rolling over to a new message when it gets too long.
 */
export class StreamingMessage {
  private msgId: number | null = null;
  private current = "";
  private lastEdit = 0;
  private lastRendered = "";

  constructor(private ctx: Context) {}

  async init(): Promise<void> {
    const m = await this.ctx.reply("▍");
    this.msgId = m.message_id;
  }

  async push(delta: string): Promise<void> {
    if (this.current.length + delta.length > MAX_LEN) {
      await this.render(true);
      const m = await this.ctx.reply("▍");
      this.msgId = m.message_id;
      this.current = "";
      this.lastRendered = "";
    }
    this.current += delta;
    if (Date.now() - this.lastEdit >= EDIT_EVERY_MS) await this.render(false);
  }

  async finish(fallback = "(no output)"): Promise<void> {
    if (!this.current.trim()) this.current = fallback;
    await this.render(true);
  }

  async fail(message: string): Promise<void> {
    this.current = this.current.trim()
      ? `${this.current}\n\n❌ ${message}`
      : `❌ ${message}`;
    await this.render(true);
  }

  private async render(final: boolean): Promise<void> {
    if (this.msgId === null) return;
    const body = balanceFences(this.current.trim());
    const text = final ? body : `${body} ▍`;
    if (!text || text === this.lastRendered) return;
    this.lastEdit = Date.now();
    this.lastRendered = text;

    const chatId = this.ctx.chat!.id;
    try {
      await this.ctx.api.editMessageText(chatId, this.msgId, text, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // Markdown can be temporarily invalid mid-stream — fall back to plain text.
      try {
        await this.ctx.api.editMessageText(chatId, this.msgId, text, {
          link_preview_options: { is_disabled: true },
        });
      } catch {
        /* message unchanged or rate limited — next tick will retry */
      }
    }
  }
}

/** Keep the "typing..." indicator alive (Telegram clears it after ~5s). */
export function keepTyping(ctx: Context): () => void {
  const send = () => void ctx.replyWithChatAction("typing").catch(() => {});
  send();
  const id = setInterval(send, 4000);
  return () => clearInterval(id);
}
