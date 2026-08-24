import type { Bot, Context } from "grammy";
import type { Address } from "viem";
import { config } from "../config";
import { setPending, confirmKeyboard } from "../bot/confirm";
import { getKernelClient } from "../wallet/zerodev";
import { createWallet, hasWallet } from "../wallet/store";
import { reconSite } from "./browser";
import { analyzeMintSite, type MintPlan } from "./analyze";
import { checkEligibility, type Eligibility } from "./eligibility";
import { mintNft } from "../nft/degen";

const txLink = (h: string) => (config.explorerTx ? config.explorerTx + h : h);

const PHASE_ICON: Record<string, string> = {
  gtd: "🟢",
  fcfs: "🟡",
  wl: "🔵",
  public: "⚪",
  unknown: "❔",
};

function fmtWhen(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return iso;
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const rel = diff > 0 ? `in ${h}h ${m}m` : `${h}h ${m}m ago`;
  return `${new Date(t).toISOString().replace("T", " ").slice(0, 16)}Z (${rel})`;
}

/** Earliest phase we are actually allowed to mint in. */
function pickPhase(plan: MintPlan, elig: Eligibility) {
  const allowed = plan.phases.filter((p) => {
    if (p.type === "public") return true;
    return elig.eligible;
  });
  const withTime = allowed
    .map((p) => ({ p, t: p.startsAt ? Date.parse(p.startsAt) : 0 }))
    .filter((x) => !isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  return withTime[0]?.p ?? allowed[0] ?? plan.phases[0];
}

function planSummary(plan: MintPlan, elig: Eligibility, addr: string): string {
  const lines: string[] = [
    `🎯 *${plan.collection ?? "Mint target"}*`,
    "",
    `Contract: \`${plan.contract ?? "NOT FOUND"}\``,
    `Chain: ${plan.chain ?? config.chainName}`,
    plan.supply ? `Supply: ${plan.supply}` : "",
    plan.priceEach ? `Price: ${plan.priceEach}` : "",
    `Confidence: ${plan.confidence ?? "low"}`,
    "",
    "*Phases*",
  ];

  if (!plan.phases.length) lines.push("_none detected_");
  for (const p of plan.phases) {
    const icon = PHASE_ICON[p.type] ?? "❔";
    const bits = [
      `${icon} *${p.name}* (${p.type})`,
      p.startsAt ? `   starts ${fmtWhen(p.startsAt)}` : "",
      p.price ? `   price ${p.price}` : "",
      p.maxPerWallet ? `   max ${p.maxPerWallet}/wallet` : "",
    ].filter(Boolean);
    lines.push(bits.join("\n"));
  }

  lines.push("", "*Eligibility*", `Wallet: \`${addr}\``);
  if (!elig.checked) {
    lines.push("No allowlist endpoint found - public mint only.");
  } else if (elig.eligible) {
    lines.push(
      `✅ ELIGIBLE${elig.proof ? ` — merkle proof (${elig.proof.length} nodes)` : ""}${elig.signature ? " — signature voucher" : ""}`,
    );
    if (elig.maxMint) lines.push(`Allowance: ${elig.maxMint}`);
  } else {
    lines.push("❌ Not on the allowlist for this wallet.");
    if (elig.raw) lines.push(`\`${elig.raw.slice(0, 160)}\``);
  }

  if (plan.notes) lines.push("", `_${plan.notes}_`);
  return lines.filter((l) => l !== "").join("\n");
}

export function registerTarget(bot: Bot): void {
  bot.command("target", async (ctx: Context) => {
    const parts = ((ctx as any).match || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      await ctx.reply(
        "/target <mintPageUrl> [qty]\n" +
          "Example: /target https://opensea.io/collection/xyz/overview 2\n\n" +
          "Renders the page, captures its API calls, works out the phases (GTD/FCFS/WL/public), checks your wallet against the allowlist, then asks you to confirm.",
      );
      return;
    }

    const url = parts[0];
    const qty = Number(parts[1] ?? 1);
    const uid = ctx.from!.id;

    if (!hasWallet(uid)) createWallet(uid);
    const { smartAddress } = await getKernelClient(uid);

    const status = await ctx.reply(`🔎 Rendering ${url} ...`, {
      link_preview_options: { is_disabled: true },
    });
    const edit = (t: string) =>
      ctx.api
        .editMessageText(ctx.chat!.id, status.message_id, t, {
          link_preview_options: { is_disabled: true },
        })
        .catch(() => {});

    try {
      const recon = await reconSite(url, { walletAddress: smartAddress });
      await edit(
        `🔎 Read "${recon.title}"\n` +
          `• ${recon.apiCalls.length} API calls captured\n` +
          `• ${recon.addresses.length} addresses found\n\n🧠 Analysing...`,
      );

      const plan = await analyzeMintSite(recon);
      if (!plan.contract) {
        await edit(
          `⚠️ Could not identify the mint contract on that page.\n\n` +
            (plan.notes ? plan.notes + "\n\n" : "") +
            `Addresses seen:\n${recon.addresses.slice(0, 8).join("\n") || "(none)"}\n\n` +
            `Pass one directly: /degen <contract> ${qty} <price>`,
        );
        return;
      }

      await edit(`🧠 Plan built. Checking allowlist for your wallet...`);
      const elig = await checkEligibility(plan, smartAddress);

      const phase = pickPhase(plan, elig);
      const price = phase?.price ?? plan.priceEach ?? "0";
      const startsAt = phase?.startsAt ? Date.parse(phase.startsAt) : NaN;
      const delay = !isNaN(startsAt) ? startsAt - Date.now() : 0;

      setPending(uid, {
        title: delay > 0 ? "Arming mint" : "Minting",
        run: async () => {
          const fire = async () => {
            const r = await mintNft(uid, plan.contract as Address, qty, price, {
              proof: elig.proof,
              signature: elig.signature,
            });
            return `✅ Minted ${r.quantity}x via ${r.signature}\n${txLink(r.txHash)}`;
          };

          // Future phase: arm a timer instead of blocking.
          if (delay > 5000 && delay < 24 * 3600 * 1000) {
            setTimeout(async () => {
              try {
                const msg = await fire();
                await ctx.reply(msg, { link_preview_options: { is_disabled: true } });
              } catch (e: any) {
                await ctx.reply(`❌ Timed mint failed: ${e.message}`);
              }
            }, delay);
            return (
              `⏰ Armed for *${phase?.name ?? "phase"}*\n` +
              `Fires ${fmtWhen(phase?.startsAt)}\n` +
              `Keep the bot running.`
            );
          }
          return fire();
        },
      });

      await edit(`✅ Recon complete.`);
      await ctx.reply(
        planSummary(plan, elig, smartAddress) +
          `\n\n*Execution*\nQty: ${qty}  •  Price each: ${price}\n` +
          (delay > 5000
            ? `Will arm and fire at phase start.`
            : `Will mint immediately on confirm.`),
        { parse_mode: "Markdown", reply_markup: confirmKeyboard() },
      );
    } catch (e: any) {
      console.error("[target]", e);
      await edit(`❌ Recon failed: ${e.message}`);
    }
  });
}
