import type { Context } from "grammy";

const MAX_LEN = 3500; // Telegram hard limit is 4096

/** Close an unterminated ``` block so Markdown stays valid mid-stream. */
function balanceFences(text: string): string {
  const fences = (text.match(/```/g) ?? []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

/**
 * A Telegram message progressively edited as tokens stream in.
 * Rolls over to a new message when it gets too long.
 *
 * Usage: init() once, append() from the stream callback (sync, cheap),
 * flush() on a timer, finish() at the end.
 */
export class StreamingMessage {
  private msgId: number | null = null;
  private current = "";
  private pending = "";
  private lastRendered = "";
  private busy = false;

  constructor(private ctx: Context) {}

  async init(): Promise<void> {
    const m = await this.ctx.reply("▍");
    this.msgId = m.message_id;
  }

  /** Cheap, synchronous — safe to call for every token. */
  append(delta: string): void {
    this.pending += delta;
  }

  async flush(final = false): Promise<void> {
    if (this.busy) return;
    if (!this.pending && !final) return;
    this.busy = true;
    try {
      while (this.pending) {
        const room = MAX_LEN - this.current.length;
        if (room <= 0) {
          await this.render(true);
          const m = await this.ctx.reply("▍");
          this.msgId = m.message_id;
          this.current = "";
          this.lastRendered = "";
          continue;
        }
        const take = this.pending.slice(0, room);
        this.current += take;
        this.pending = this.pending.slice(take.length);
      }
      await this.render(final);
    } finally {
      this.busy = false;
    }
  }

  async finish(fallback = "(no output)"): Promise<void> {
    if (!this.current.trim() && !this.pending.trim()) this.current = fallback;
    this.busy = false;
    await this.flush(true);
  }

  async fail(message: string): Promise<void> {
    this.busy = false;
    this.pending += this.current.trim() ? `\n\n❌ ${message}` : `❌ ${message}`;
    await this.flush(true);
  }

  private async render(final: boolean): Promise<void> {
    if (this.msgId === null) return;
    const body = balanceFences(this.current.trim());
    const text = final ? body : `${body} ▍`;
    if (!text || text === this.lastRendered) return;
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
        /* unchanged or rate limited — the next tick retries */
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
