// BIOS vault: verified console system files kept once, filled in automatically.

import fs from "node:fs";
import path from "node:path";
import { checkBios } from "./verify.js";

const index = (dir) => path.join(dir, "vault.json");
export const readVault = (dir) => { try { return JSON.parse(fs.readFileSync(index(dir), "utf8")); } catch { return []; } };
const writeVault = (dir, v) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(index(dir), JSON.stringify(v, null, 2)); };

// Store a file only if verification says it's a known system file. Returns the entry.
export async function addToVault(dir, file) {
  const r = await checkBios(file, { label: path.basename(file), description: "", expected_size: null }, () => {});
  if (r.status !== "match" || !r.detected?.title) throw new Error(`Not a recognised system file: ${r.summary}`);
  const identity = r.detected.title; // e.g. "PlayStation BIOS SCPH-1001, ... (v2.2 12-04-95 A) (NTSC_U)" or "Game Boy Advance BIOS"
  const id = identity.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const dest = path.join(dir, `${id}${path.extname(file).toLowerCase() || ".bin"}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(file, dest);
  const v = readVault(dir).filter((e) => e.id !== id);
  v.push({ id, identity, file: path.basename(dest), size: fs.statSync(dest).size, addedAt: new Date().toISOString() });
  writeVault(dir, v);
  return v.find((e) => e.id === id);
}

export function removeFromVault(dir, id) {
  const v = readVault(dir);
  const e = v.find((x) => x.id === id);
  if (e) fs.rmSync(path.join(dir, e.file), { force: true });
  writeVault(dir, v.filter((x) => x.id !== id));
}

// Which vault entry satisfies a plan game_file of kind "bios"? Match SCPH model numbers, or GBA.
export function vaultMatch(dir, gameFile) {
  const text = `${gameFile.label} ${gameFile.description} ${gameFile.expected_filename || ""} ${gameFile.notes || ""}`;
  const models = [...text.matchAll(/SCPH-?(\d{4,5})/gi)].map((m) => m[1]);
  const wantsGba = /gba|game ?boy ?advance/i.test(text);
  const wantsPs1 = /playstation|ps1|psx|scph/i.test(text) && !/playstation ?2|ps2/i.test(text);
  for (const e of readVault(dir)) {
    if (wantsGba && /Game Boy Advance/i.test(e.identity)) return { ...e, path: path.join(dir, e.file) };
    if (wantsPs1 && /PlayStation BIOS/i.test(e.identity)) {
      if (!models.length || models.some((m) => e.identity.includes(m))) return { ...e, path: path.join(dir, e.file) };
    }
  }
  return null;
}
