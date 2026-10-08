#!/usr/bin/env node
// Machine-translate renderer/i18n/en.json into the other languages with the configured model.
// Every translation must keep its {0}-style placeholders; any that doesn't stays English.
//   ANTHROPIC_API_KEY=… node scripts/i18n-translate.mjs [pt-BR es fr de ja]
import fs from "node:fs";
import { z } from "zod";
import { askStructured } from "../src/plan.js";
import { resolveProvider } from "../src/providers.js";

const NAMES = { "pt-BR": "Brazilian Portuguese", es: "Spanish (neutral Latin American)", fr: "French", de: "German", ja: "Japanese" };
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(NAMES);
const provider = resolveProvider(process.env.DECOMP_PROVIDER || "claude", { model: process.env.DECOMP_MODEL || "claude-haiku-5-5" });
const en = Object.keys(JSON.parse(fs.readFileSync("renderer/i18n/en.json", "utf8")).strings);
const ph = (s) => [...s.matchAll(/\{\d\}/g)].map((m) => m[0]).sort().join(",");
const SYSTEM = (lang) => `You translate the interface of Decomp Buddy, a desktop app that sets up fan-made PC ports of classic console games, into ${lang}. Rules: keep every {0}, {1}... placeholder exactly; keep product and brand names as they are (Decomp Buddy, Steam, Steam Deck, GitHub, GitLab, BIOS, ROM, DAT, No-Intro, Redump, Maddie, Tanooki Studios, macOS, Windows, Linux); keep symbols like ·, →, …, ★ and leading/trailing punctuation; match the tone - friendly, plain, short, like a good app. Translate button labels as buttons. Return exactly one translation per input line, in order.`;

// One batch; if the model can't return the right number of lines, halve it and try again.
async function translate(code, batch) {
  const Schema = z.object({ translations: z.array(z.string()).describe(`Exactly ${batch.length} translations, same order as the input lines`) });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await askStructured(provider, { system: SYSTEM(NAMES[code]), user: batch.map((s, j) => `${j + 1}. ${s}`).join("\n"), schema: Schema, name: "translations", maxTokens: 16000 });
    if (r.translations.length === batch.length) return r.translations;
  }
  if (batch.length === 1) return [batch[0]];
  const mid = Math.ceil(batch.length / 2);
  return [...(await translate(code, batch.slice(0, mid))), ...(await translate(code, batch.slice(mid)))];
}

// Incremental: strings already translated are kept (and hand corrections survive); only new ones are sent.
for (const code of langs) {
  const file = `renderer/i18n/${code}.json`;
  const prev = (() => { try { return JSON.parse(fs.readFileSync(file, "utf8")).strings; } catch { return {}; } })();
  const out = {}; let kept = 0;
  for (const s of en) if (prev[s] && prev[s] !== s) out[s] = prev[s];
  const todo = en.filter((s) => !(s in out));
  console.log(`${code}: ${todo.length} new string(s) to translate`);
  for (let i = 0; i < todo.length; i += 120) {
    const batch = todo.slice(i, i + 120);
    const got = await translate(code, batch);
    batch.forEach((s, j) => { let t = String(got[j] || "").replace(/^\d+\.\s*/, ""); if (!t || ph(t) !== ph(s)) { t = s; kept++; } out[s] = t; });
    process.stdout.write(`${code} ${Math.min(i + 120, todo.length)}/${todo.length}\r`);
  }
  fs.writeFileSync(file, JSON.stringify({ _meta: { language: NAMES[code], machineTranslated: true, model: provider.model, generatedAt: new Date().toISOString(), keptEnglish: kept, note: "Machine translated. Corrections welcome on GitHub." }, strings: out }, null, 1));
  console.log(`${code}: ${en.length} strings, ${kept} kept in English (placeholders didn't survive)`);
}
