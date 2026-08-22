import { spawn } from "node:child_process";
import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";

const HINT =
  "The `claude` CLI did not respond — it is often waiting for an interactive login. " +
  "Fix: set AI_PROVIDER=agentrouter-claude in .env (uses the API directly, no CLI needed), " +
  "or run `claude -p \"hi\"` in your shell to check it works.";

/**
 * Ask the local Claude Code CLI a question in headless/print mode.
 * Equivalent to running: `claude -p "<prompt>"`
 */
export async function askClaude(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  // Shorter default so users aren't left waiting two minutes on a hung CLI.
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const full = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;
  const args = [...config.claudeArgs, full];

  return new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = spawn(config.claudeCmd, args, { env: process.env });
    } catch (e: any) {
      reject(new Error(`Cannot start "${config.claudeCmd}": ${e.message}. ${HINT}`));
      return;
    }

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Claude Code timed out after ${timeoutMs / 1000}s. ${HINT}`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e: any) => {
      clearTimeout(timer);
      if (e.code === "ENOENT") {
        reject(new Error(`"${config.claudeCmd}" not found in PATH. ${HINT}`));
      } else {
        reject(new Error(`${e.message}. ${HINT}`));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `claude exited with code ${code}. ${HINT}`));
    });
  });
}
