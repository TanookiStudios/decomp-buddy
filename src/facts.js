// Plan facts: things about a project that aren't "how to install it" but decide whether you want it
// and how to live with it - is it finished, does it run on a Deck, where are saves, which config file.
// One small structured call per repo at plan-generation time (kept out of the Plan grammar, which is
// already near Anthropic's compiled-grammar size limit). Health comes from GitHub, not the model.

import { z } from "zod";
import { askStructured } from "./plan.js";

export const FACTS_VERSION = 1;
const Keys = z.object({
  fullscreen: z.string().nullable().describe("Config key that toggles fullscreen, exactly as written in the file, or null"),
  resolution: z.string().nullable().describe("Config key for resolution / window size, or null"),
  ultrawide: z.string().nullable().describe("Config key for widescreen / aspect ratio / ultrawide, or null"),
  vsync: z.string().nullable().describe("Config key for vsync, or null"),
});
export const Facts = z.object({
  completeness: z.enum(["playable", "mostly", "partial", "wip", "unknown"]).describe("playable = can be finished start to end; mostly = finishable with known bugs; partial = some levels/modes; wip = not playable yet; unknown = README doesn't say"),
  completeness_quote: z.string().describe("The README sentence that states how complete/playable the game is, copied verbatim, max 200 chars. It must be about completeness (playable, finished, work in progress...). Empty and completeness=unknown if no such sentence exists"),
  steam_deck: z.enum(["verified", "works", "mentioned", "none"]).describe("verified = README explicitly says it was tested or verified on Steam Deck; works = README says it runs on Deck or explains how to run it there; mentioned = Deck mentioned without a claim; none"),
  deck_quote: z.string().describe("The README sentence about Steam Deck, verbatim, max 200 chars; empty if none"),
  save_paths: z.array(z.object({ platform: z.enum(["windows", "macos", "linux", "any"]), path: z.string().describe("Save folder exactly as documented, e.g. %APPDATA%/Zelda64Recomp/saves or ./saves") })).describe("Where the port keeps save files, only if the README/docs say so"),
  config: z.object({
    file: z.string().nullable().describe("Settings file name exactly as written in the README/docs, or null if the text never names one"),
    format: z.enum(["toml", "json", "ini", "yaml", "cfg", "unknown"]),
    keys: Keys,
  }),
  controller_notes: z.array(z.string()).describe("Up to 3 short verbatim lines from the README about controllers, mapping, or gamepad quirks"),
});

export const SYSTEM = `You read the README and docs of a game decompilation, recompilation, or PC port and extract a few facts exactly as documented. Never guess: when the text doesn't say, use unknown / none / null / empty. Quotes must be copied from the text, not paraphrased.`;

export function renderFactsContext(ctx) {
  const docs = (ctx.docs || []).map((d) => `## ${d.path}\n${d.text}`).join("\n\n");
  return [`# ${ctx.fullName}`, ctx.description && `Description: ${ctx.description}`, "## README", ctx.readme || "(none)", docs].filter(Boolean).join("\n\n").slice(0, 60_000);
}

// Repo health straight from the host: archived, last push, takedown language.
const DMCA = /\b(DMCA|takedown|take-down|cease[- ]and[- ]desist|removed (at|by) the request|legal notice)\b/i;
export function healthOf(ctx) {
  return { archived: !!ctx.archived, pushedAt: ctx.pushedAt || "", dmca: DMCA.test(`${ctx.description || ""}\n${ctx.readme || ""}`) };
}

// The model is told not to guess, and does anyway. Every claim has to be backed by text that is
// actually in the README/docs; anything that isn't is dropped back to unknown / none / null.
// Markdown quote blocks start every line with ">"; a quote copied out of one drops them, so the text does too.
const squash = (t) => String(t || "").replace(/(^|\n)[ \t]*>+[ \t]?/g, "$1").toLowerCase().replace(/[\\/]+/g, "/").replace(/[“”"'`*_]/g, "").replace(/\s+/g, " ").trim();
const COMPLETE_WORDS = /playable|complete|finish|beat(en|able)?|start to|end to end|100 ?%|work[- ]in[- ]progress|still (in|under) (active )?development|under (active )?development|early development|\bwip\b|not (yet )?playable|early|partial|in progress|unfinished|crash|whole game|full game|entire game|all (\w+ )?endings|beginning to end/i;
// A key that exists but is about something else ("gfxbackend" offered as the fullscreen key) is still wrong.
const KEY_LOOKS = { fullscreen: /full|screen|window|borderless/i, resolution: /res|width|height|size|window|scale/i, ultrawide: /wide|aspect|ratio|stretch|hud/i, vsync: /sync|swap|interval|frame/i };
export function groundFacts(f, text) {
  const hay = squash(text);
  const has = (q) => !!q && hay.includes(squash(q));
  const out = structuredClone(f);
  if (!has(out.completeness_quote) || !COMPLETE_WORDS.test(out.completeness_quote)) { out.completeness = "unknown"; out.completeness_quote = ""; }
  if (!has(out.deck_quote) || !/steam ?deck/i.test(out.deck_quote)) { out.steam_deck = "none"; out.deck_quote = ""; }
  else if (out.steam_deck === "verified" && !/verif|tested/i.test(out.deck_quote)) out.steam_deck = "works";
  out.save_paths = (out.save_paths || []).filter((p) => has(p.path));
  if (!has(out.config?.file)) out.config = { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } };
  else for (const k of Object.keys(out.config.keys || {})) if (out.config.keys[k] && (!has(out.config.keys[k]) || !KEY_LOOKS[k]?.test(out.config.keys[k]))) out.config.keys[k] = null;
  out.controller_notes = (out.controller_notes || []).filter(has).slice(0, 3);
  for (const k of ["completeness_quote", "deck_quote"]) out[k] = out[k].slice(0, 240);
  return out;
}

export async function extractFacts(ctx, { provider, log = () => {}, ask = askStructured } = {}) {
  const text = renderFactsContext(ctx);
  // Now and then the model's answer doesn't fit the schema; a second try almost always does.
  const once = () => ask(provider, { system: SYSTEM, user: text, schema: Facts, name: "facts", maxTokens: 2000, log });
  let f;
  try { f = await once(); }
  catch (err) { if (!/Failed to parse structured output/i.test(err.message)) throw err; log("  facts: the answer didn't fit, asking once more"); f = await once(); }
  return { ...groundFacts(f, text), health: healthOf(ctx), version: FACTS_VERSION };
}
