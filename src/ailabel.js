// Did a project use AI to make its port? Only what its own README says, quoted - never a guess. This finds the
// README sentences that mention AI at all; scripts/ailabel.mjs has an agent decide what they say (a regex alone
// mislabeled warnings like "AI-generated misinformation"). Labels: facts.ai_use none|assisted|generated + ai_quote.

const AI = String.raw`(?:\bai\b|a\.i\.|artificial intelligence|claude(?: code)?|chat ?gpt|\bgpt-?\d|openai|codex|copilot|gemini|llms?\b|large language models?)`;
// The README sentence that says it (trimmed to one sentence, up to 220 characters).
function sentenceAround(text, index) {
  // A period only ends a sentence when a space or the end follows ("v0.9" and "claude.ai" don't).
  const stop = (from, back) => { const re = /\.(?=\s|$)|\n/g; let last = -1; if (back) { for (const m of text.slice(0, from).matchAll(re)) last = m.index; return last; } re.lastIndex = from; const m = re.exec(text); return m ? m.index : -1; };
  const start = stop(index, true) + 1;
  const ends = [stop(index, false)].filter((n) => n >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
}

// Every sentence of a README that mentions AI at all (the broad net; a person or an agent decides what it means).
const MENTION = new RegExp(AI + "|vibe[- ]?cod", "gi");
export function aiMentions(readme, { max = 8 } = {}) {
  const text = String(readme || "").replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, ""), out = [];
  for (const m of text.matchAll(MENTION)) { const q = sentenceAround(text, m.index); if (q && !out.includes(q)) out.push(q); if (out.length >= max) break; }
  return out;
}
