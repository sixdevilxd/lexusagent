import { ask } from "../ai";

export type ExtractedMint = {
  name?: string;
  symbol?: string;
  supply?: string;
  logo?: string;
  contract?: string;
  notes?: string;
};

/**
 * Fetch a target launchpad/mint page and use the AI to extract any
 * token-creation form fields it can infer from the page content.
 */
export async function readTarget(
  url: string,
): Promise<{ extracted: ExtractedMint }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "lexusagent/0.1 (+https://github.com/sixdevilxd/lexusagent)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const raw = await res.text();

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 8000);

  const prompt =
    "You are reading a token mint / launchpad web page. " +
    "Extract any token-creation form fields you can infer. " +
    "Return ONLY minified JSON with keys: name, symbol, supply, logo, contract, notes. " +
    "Use an empty string when unknown.\n\nPAGE TEXT:\n" +
    text;

  let extracted: ExtractedMint = {};
  try {
    const out = await ask(prompt);
    const jsonStr = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    extracted = JSON.parse(jsonStr);
  } catch {
    // best-effort: leave empty so the user fills fields manually
  }
  return { extracted };
}
