#!/usr/bin/env node
// The merged, deduped catalog as one public JSON - what Browse shows, for the website and anyone
// else who wants it. Reads every source the app reads (built-in catalogs, Individual Finds, shared
// sources), folds in published plans (collections become one entry per game, plus facts), writes
// <site>/public/decomp-buddy/catalog.json.
//   node scripts/build-catalog.mjs [--site <TanookiStudios-Site path>]
import { buildCatalog } from "../src/publiccatalog.js";

const i = process.argv.indexOf("--site");
buildCatalog(i > 0 ? { site: process.argv[i + 1] } : {}).catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
