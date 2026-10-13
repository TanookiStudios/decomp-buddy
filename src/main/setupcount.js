// "+1 for this game" on tanookistudios.com when a new game finishes setting up - only if the user said
// yes (settings.countSetups === true; asked once, changeable in Settings). Sends the repo and the
// game's title, nothing else: no id, no computer details. The site counts only catalog games, so a
// private repo someone installs is never recorded. Fire and forget: offline just means not counted.
import { loadSettings } from "./core.js";
import { parseRepoUrl } from "../github.js";
import { canonRepo } from "../renames.js";

const BASE = () => (process.env.DECOMP_SUGGEST_BASE || "https://tanookistudios.com").replace(/\/$/, "");

export function countSetups(items) {
  if (process.env.DECOMP_HEADLESS || loadSettings().countSetups !== true) return; // tests never count
  for (const it of items) {
    let ref; try { ref = parseRepoUrl(it.url); } catch { continue; }
    const repo = `${ref.host}:${canonRepo(`${ref.owner}/${ref.repo}`)}`.toLowerCase();
    fetch(`${BASE()}/api/decomp-setup`, { method: "POST", headers: { "content-type": "application/json", "User-Agent": "decomp-buddy" },
      body: JSON.stringify({ repo, title: it.plan?.game_title || "" }), signal: AbortSignal.timeout(10_000) }).catch(() => {});
  }
}
