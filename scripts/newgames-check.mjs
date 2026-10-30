#!/usr/bin/env node
// A game sorted playable in the last 3 days but missing from the catalog is waiting for its steps or scan - or was
// lost on the way (29 Oct 2026: 29 were, silently). The daily publish prints this so it can't go unnoticed.
//   node scripts/newgames-check.mjs --site <TanookiStudios-Site>
import fs from "node:fs";
import path from "node:path";

const i = process.argv.indexOf("--site");
const dir = path.join(i > 0 ? process.argv[i + 1] : path.join(process.env.HOME, "Documents/GitHub/TanookiStudios-Site"), "public", "decomp-buddy");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const listed = new Set(read("catalog.json").games.filter((g) => g.repo).map((g) => g.repo.toLowerCase()));
const since = new Date(Date.now() - 3 * 86400e3).toISOString();
const missing = read("finds.json").games.filter((g) => !g.host && (g.addedAt || "") >= since && !listed.has(g.repo.toLowerCase())).map((g) => g.repo);
console.log(missing.length ? `✗ new games: ${missing.length} sorted playable but not in the catalog (waiting for steps or the scan, or lost): ${missing.slice(0, 10).join(", ")}` : "new games: all in the catalog");
