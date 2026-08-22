/** Free web + social search via DuckDuckGo (no API key). */

const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchHit = { title: string; url: string; snippet: string };

async function ddg(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const html = await res.text();

  const hits: SearchHit[] = [];
  const blocks = html.split('class="result__body"').slice(1);
  for (const b of blocks) {
    const linkM = b.match(/href="([^"]+)"[^>]*class="result__a"/) ??
      b.match(/class="result__a"[^>]*href="([^"]+)"/);
    const titleM = b.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snipM = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;

    let url = linkM?.[1] ?? "";
    // DDG wraps links: /l/?uddg=<encoded>
    const wrapped = url.match(/uddg=([^&]+)/);
    if (wrapped) url = decodeURIComponent(wrapped[1]);

    hits.push({
      title: stripTags(titleM[1]),
      url,
      snippet: snipM ? stripTags(snipM[1]) : "",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function webSearch(query: string, limit = 6): Promise<string> {
  const hits = await ddg(query, limit);
  if (!hits.length) return `No results for "${query}".`;
  return hits
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
    .join("\n");
}

/**
 * Social search across X / Threads / TikTok / Reddit.
 * Note: no free realtime firehose exists — this uses search-engine indexing,
 * so very fresh posts (< ~1h) may be missing.
 */
export async function socialSearch(
  query: string,
  platforms: string[] = ["x", "threads", "tiktok", "reddit"],
): Promise<string> {
  const siteMap: Record<string, string> = {
    x: "site:x.com OR site:twitter.com OR site:nitter.net",
    threads: "site:threads.net",
    tiktok: "site:tiktok.com",
    reddit: "site:reddit.com",
    youtube: "site:youtube.com",
  };

  const out: string[] = [];
  for (const p of platforms) {
    const filter = siteMap[p.toLowerCase()];
    if (!filter) continue;
    try {
      const hits = await ddg(`(${filter}) ${query}`, 4);
      if (hits.length) {
        out.push(
          `## ${p.toUpperCase()}\n` +
            hits.map((h) => `- ${h.title}\n  ${h.url}\n  ${h.snippet}`).join("\n"),
        );
      }
    } catch {
      /* skip platform on failure */
    }
  }
  return out.length ? out.join("\n\n") : `No social results for "${query}".`;
}
