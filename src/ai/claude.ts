import { spawn } from "node:child_process";
import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * Ask the local Claude Code CLI a question in headless/print mode.
 * Equivalent to running: `claude -p "<prompt>"`
 */
export async function askClaude(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  // The CLI has no separate system-prompt input we can rely on across versions,
  // so we prepend it to the prompt.
  const full = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;
  const args = [...config.claudeArgs, full];

  return new Promise<string>((resolve, reject) => {
    const child = spawn(config.claudeCmd, args, { env: process.env });
    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Claude Code timed out"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `claude exited with code ${code}`));
    });
  });
}
