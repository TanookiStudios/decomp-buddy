// Local model via Ollama: the last fallback after published plans and your own key. Nothing is
// bundled - Ollama is a separate install, and the model (a few GB) downloads through it on request.
// Before it's switched on, a canned repo is planned with it to prove it can follow the schema.

import { planFromContext } from "./plan.js";
import { resolveProvider } from "./providers.js";

export const OLLAMA = "http://localhost:11434";
export const SUGGESTED = "qwen2.5:7b-instruct"; // ~4.7 GB; follows JSON schemas better than smaller models

export async function detect({ base = OLLAMA, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false };
    return { running: true, models: ((await res.json()).models || []).map((m) => ({ name: m.name, size: m.size })) };
  } catch { return { running: false }; }
}

// Streams Ollama's NDJSON progress: { status, completed, total }.
export async function pull(model, { base = OLLAMA, onProgress = () => {}, fetchImpl = fetch, signal } = {}) {
  const res = await fetchImpl(`${base}/api/pull`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true }), signal });
  if (!res.ok || !res.body) throw new Error(`Ollama said ${res.status} pulling ${model}.`);
  const dec = new TextDecoder(); let buf = "", last = null;
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      const j = JSON.parse(line); if (j.error) throw new Error(`Ollama: ${j.error}`);
      last = j; onProgress({ status: j.status, pct: j.total ? Math.round((j.completed || 0) / j.total * 100) : null });
    }
  }
  if (last?.status !== "success") throw new Error("Ollama stopped before the model finished downloading.");
  return true;
}

// A tiny, fixed repo with one obvious right answer.
export const TEST_CTX = {
  fullName: "decomp-buddy/test-port", url: "https://github.com/decomp-buddy/test-port", description: "A native PC port of Test Game (Nintendo 64).", homepage: "",
  defaultBranch: "main", releases: [{ tag: "v1.0.0", name: "v1.0.0", publishedAt: "2026-01-01", assets: [{ name: "TestPort-Windows.zip", size: 10_000_000 }, { name: "TestPort-Linux.tar.gz", size: 10_000_000 }] }],
  tree: ["README.md", "src/main.c"], treeTruncated: false, docs: [],
  readme: "# Test Port\nA native PC port of Test Game for the Nintendo 64.\n\n## Setup\nDownload TestPort-Windows.zip from Releases, extract it, and put your US ROM named `baserom.z64` next to `testport.exe`. Then run testport.exe.",
};
export async function testModel(model, { base = OLLAMA, planner = planFromContext } = {}) {
  const provider = resolveProvider("ollama", { model, baseUrl: `${base}/v1` });
  const t = Date.now();
  const out = await planner(TEST_CTX, { provider, target: "windows" });
  const g = (out.games || [out])[0];
  const ok = g?.build?.release_asset === "TestPort-Windows.zip" && (g.game_files || []).length >= 1;
  return { ok, seconds: Math.round((Date.now() - t) / 1000), got: { asset: g?.build?.release_asset, files: (g?.game_files || []).length }, why: ok ? "" : "It answered, but picked the wrong download or no game file - try a bigger model." };
}
