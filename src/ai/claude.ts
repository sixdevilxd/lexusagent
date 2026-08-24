import { spawn } from "node:child_process";
import { config } from "../config";
import { SYSTEM_PROMPT } from "./prompt";

const HINT =
  "The claude CLI did not respond. Check it works: claude -p \"hi\". " +
  "If you are routing it through AgentRouter, export ANTHROPIC_AUTH_TOKEN, " +
  "ANTHROPIC_BASE_URL=https://agentrouter.org and ANTHROPIC_MODEL first.";

/**
 * Local Claude Code CLI provider (headless / print mode).
 *
 * This is the route AgentRouter documents for their key: point Claude Code at
 * their base URL and let the CLI make the call. Custom tool definitions are not
 * supported here, so the realtime tools are unavailable on this provider.
 */
export async function askClaude(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
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
      reject(new Error(`claude timed out after ${timeoutMs / 1000}s. ${HINT}`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e: any) => {
      clearTimeout(timer);
      reject(
        new Error(
          e.code === "ENOENT"
            ? `"${config.claudeCmd}" not found in PATH. ${HINT}`
            : `${e.message}. ${HINT}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `claude exited with code ${code}. ${HINT}`));
    });
  });
}
