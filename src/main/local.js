// Local model (Ollama) settings: detect, download a model through Ollama, prove it, switch it on.
import { ipcMain } from "electron";
import { detect, pull, testModel, SUGGESTED } from "../localmodel.js";
import { logTo, safeSend, loadSettings, saveSettings } from "./core.js";

ipcMain.handle("local:status", async () => ({ ...(await detect()), suggested: SUGGESTED, setting: loadSettings().localModel || null }));
let pulling = null;
ipcMain.handle("local:pull", async (e, { model }) => {
  if (pulling) throw new Error("Already downloading a model.");
  pulling = new AbortController();
  try { await pull(model, { signal: pulling.signal, onProgress: (p) => safeSend(e.sender, "local:progress", p) }); logTo(e.sender, `Ollama: ${model} ready.`); return true; }
  finally { pulling = null; }
});
ipcMain.handle("local:cancel", () => { pulling?.abort(); return true; });
ipcMain.handle("local:test", async (e, { model }) => {
  logTo(e.sender, `Testing ${model} on a small sample repo…`);
  const r = await testModel(model).catch((err) => ({ ok: false, why: err.message }));
  const s = loadSettings(); s.localModel = { ...(s.localModel || {}), model, tested: r.ok, testedAt: new Date().toISOString(), enabled: r.ok ? (s.localModel?.enabled ?? true) : false }; saveSettings(s);
  return r;
});
ipcMain.handle("local:enable", (_e, { enabled }) => {
  const s = loadSettings(); if (enabled && !s.localModel?.tested) throw new Error("Test the model first - it has to plan the sample repo correctly.");
  s.localModel = { ...(s.localModel || {}), enabled: !!enabled }; saveSettings(s); return s.localModel;
});
