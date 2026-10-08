// "Suggest A Decomp" -> Maddie's queue on tanookistudios.com. Offline or site down: kept locally and
// sent on the next launch. Admin reads the queue with a key she sets as a site secret.
import { ipcMain } from "electron";
import { logTo, loadSettings, saveSettings, encrypt, decrypt } from "./core.js";

const BASE = () => (process.env.DECOMP_SUGGEST_BASE || "https://tanookistudios.com").replace(/\/$/, "");
const post = (path, body, headers = {}) => fetch(`${BASE()}${path}`, { method: "POST", headers: { "content-type": "application/json", "User-Agent": "decomp-buddy", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });

async function send(repo, note) {
  const res = await post("/api/decomp-suggest", { repo, note });
  const j = await res.json().catch(() => ({}));
  if (res.status === 400) throw Object.assign(new Error("That doesn't look like a GitHub or GitLab repository link."), { final: true });
  if (!res.ok || !j.ok) throw new Error(`the site said ${res.status}`);
  return j;
}
ipcMain.handle("suggest:send", async (e, { repo, note }) => {
  try { await send(repo, note); logTo(e.sender, `Suggested ${repo} to Maddie.`); return { sent: true }; }
  catch (err) {
    if (err.final) throw err;
    const s = loadSettings(); s.queuedSuggestions = [...(s.queuedSuggestions || []).filter((q) => q.repo !== repo), { repo, note, at: new Date().toISOString() }]; saveSettings(s);
    logTo(e.sender, `Couldn't reach the site (${err.message}) - ${repo} will be sent next time.`);
    return { sent: false, queued: true };
  }
});
export async function flushSuggestions(sender) {
  const s = loadSettings(); if (!(s.queuedSuggestions || []).length) return 0;
  const left = []; let sent = 0;
  for (const q of s.queuedSuggestions) { try { await send(q.repo, q.note); sent++; } catch (err) { if (!err.final) left.push(q); } }
  const cur = loadSettings(); cur.queuedSuggestions = left; saveSettings(cur);
  if (sent) logTo(sender, `Sent ${sent} queued suggestion(s).`);
  return sent;
}
ipcMain.handle("suggest:flush", (e) => flushSuggestions(e.sender));

// ---- Admin queue
const adminKey = () => { const s = loadSettings(); return s.suggestKey ? decrypt(s.suggestKey) : ""; };
ipcMain.handle("suggest:setKey", (_e, { key }) => { const s = loadSettings(); if (key) s.suggestKey = encrypt(key); else delete s.suggestKey; saveSettings(s); return true; });
ipcMain.handle("suggest:queue", async () => {
  const key = adminKey(); if (!key) return { hasKey: false, suggestions: [] };
  const res = await fetch(`${BASE()}/api/decomp-suggestions`, { headers: { authorization: `Bearer ${key}`, "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 403) throw new Error("The site refused that key - check it matches DECOMP_ADMIN_TOKEN.");
  if (res.status === 503) throw new Error("The site has no DECOMP_ADMIN_TOKEN set yet, so the queue is locked.");
  if (!res.ok) throw new Error(`The site said ${res.status}.`);
  return { hasKey: true, suggestions: (await res.json()).suggestions || [] };
});
ipcMain.handle("suggest:mark", async (_e, { id, status }) => {
  const res = await post("/api/decomp-suggestions", { id, status }, { authorization: `Bearer ${adminKey()}` });
  if (!res.ok) throw new Error(`The site said ${res.status}.`);
  return true;
});
