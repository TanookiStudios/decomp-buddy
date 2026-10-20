#!/usr/bin/env node
// The merged, deduped catalog as one public JSON - what Browse shows, for the website and anyone
// else who wants it. Reads every source the app reads (built-in catalogs, Individual Finds, shared
// sources), folds in published plans (collections become one entry per game, plus facts), writes
// <site>/public/decomp-buddy/catalog.json.
//   node scripts/build-catalog.mjs [--site <TanookiStudios-Site path>] [--recheck]   (--recheck: check Coming Soon for downloads now, not every 6 hours)
import { execFileSync } from "node:child_process";
import { buildCatalog } from "../src/publiccatalog.js";

const i = process.argv.indexOf("--site");
// SteamGridDB covers when Maddie's key is in the Keychain (item "steamgriddb"); without it the build just skips them.
let steamGridKey = process.env.STEAMGRIDDB_KEY || null;
if (!steamGridKey && process.platform === "darwin") { try { steamGridKey = execFileSync("security", ["find-generic-password", "-s", "steamgriddb", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch {} }
buildCatalog({ ...(i > 0 ? { site: process.argv[i + 1] } : {}), recheck: process.argv.includes("--recheck"), steamGridKey }).catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
