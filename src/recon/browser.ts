import { chromium, type Browser, type Page } from "playwright-core";

export type ApiCall = {
  url: string;
  method: string;
  status: number;
  body: string;
};

export type ReconResult = {
  url: string;
  title: string;
  text: string;
  addresses: string[];
  apiCalls: ApiCall[];
  scripts: string[];
};

const NOISE =
  /google|gstatic|doubleclick|facebook|segment|sentry|analytics|amplitude|mixpanel|hotjar|intercom|cloudflareinsights|datadog|clarity\.ms|posthog/i;

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;

function chromiumPath(): string | undefined {
  return process.env.CHROMIUM_PATH || undefined;
}

async function launch(): Promise<Browser> {
  const executablePath = chromiumPath();
  try {
    return await chromium.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });
  } catch (e: any) {
    throw new Error(
      "Cannot launch Chromium. Run: bash scripts/setup-browser.sh  " +
        "(or set CHROMIUM_PATH in .env). Original: " +
        (e?.message ?? e),
    );
  }
}

/**
 * Render a target mint page and capture everything useful:
 *  - visible text (phases, prices, rules)
 *  - every JSON XHR/fetch the site makes (this is where allowlist / merkle
 *    proof endpoints live)
 *  - contract addresses seen anywhere
 */
export async function reconSite(
  url: string,
  opts: { waitMs?: number; walletAddress?: string } = {},
): Promise<ReconResult> {
  const browser = await launch();
  const apiCalls: ApiCall[] = [];
  const scripts: string[] = [];

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });
    const page: Page = await context.newPage();

    page.on("response", async (res) => {
      try {
        const rUrl = res.url();
        if (NOISE.test(rUrl)) return;
        const ct = res.headers()["content-type"] ?? "";
        if (!/json|text\/plain/.test(ct)) return;
        if (apiCalls.length >= 40) return;
        const body = (await res.text()).slice(0, 3000);
        if (!body.trim()) return;
        apiCalls.push({
          url: rUrl,
          method: res.request().method(),
          status: res.status(),
          body,
        });
      } catch {
        /* body already consumed or stream closed */
      }
    });

    page.on("request", (req) => {
      const u = req.url();
      if (/\.js($|\?)/.test(u) && !NOISE.test(u) && scripts.length < 20) {
        scripts.push(u);
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 20000 });
    } catch {
      /* some mint sites poll forever - keep going */
    }

    // Trigger lazy sections and any "connect" UI that reveals phase info.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(opts.waitMs ?? 3000);

    const title = await page.title();
    const text = (
      await page.evaluate(() => document.body?.innerText ?? "")
    )
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, 12000);

    const html = (await page.content()).slice(0, 200000);

    const found = new Set<string>();
    for (const src of [text, html, ...apiCalls.map((a) => a.body)]) {
      for (const m of src.match(ADDRESS_RE) ?? []) found.add(m.toLowerCase());
    }

    return {
      url,
      title,
      text,
      addresses: [...found].slice(0, 30),
      apiCalls,
      scripts,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
