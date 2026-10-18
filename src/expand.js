// Pure catalog shaping shared by the app and the website build: collections become one card per
// game, and each card carries the published facts for its repo.
import { planKey } from "./plans.js";
import { canonConsole } from "./renames.js";
import { scanSummary } from "./scan.js";
import { PLATFORM_OF_TARGET } from "./targets.js";
import { hostOf } from "./hosts.js";

export const slug = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A repo that ships several games (a "10 PSX games" collection) is one repo but ten games: once its
// published plan exists, Browse shows one card per game, each addable on its own.
// A plan's artwork_url is often a path inside the repo ("docs/screenshots/firered.png"): make it the raw
// file's address so the app and the website load it, instead of a broken relative link.
export function artworkUrl(u, g) {
  if (!u) return null;
  const s = String(u).trim();
  const blob = s.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
  if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}`;
  if (/^https?:\/\//i.test(s)) return s;
  if (!g.owner || s.startsWith("/") || s.includes("..")) return null;
  const p = s.replace(/^\.?\//, "").split("/").map(encodeURIComponent).join("/");
  return hostOf(g.repoHost).raw(g.owner, g.repo, p);
}

export function expandMultiGame(games, pub) {
  if (!pub?.plans) return games;
  return games.flatMap((g) => {
    if (!g.owner) return [g];
    const entry = pub.plans[planKey(g.repoHost || "github", g.owner, g.repo)];
    const plan = entry && Object.values(entry.targets || {}).find((t) => (t.games || []).length > 1);
    if (!plan) return [g];
    // The repo's box art is the wrong game for each card: boxartUrl is looked up again per title.
    // Ids come from the title, not the position, so wishlist stars survive a re-plan in another order.
    return plan.games.map((pg) => ({ ...g, id: `${g.id}#${slug(pg.game_title)}`, title: pg.game_title, console: canonConsole(pg.console) || g.console, gameTitle: pg.game_title, gameOf: g.id, repoGames: plan.games.length,
      iconUrl: artworkUrl(pg.artwork_url, g) || g.iconUrl, boxartUrl: undefined, version: pg.build?.release_tag || g.version, repoVersion: g.version }));
  });
}



// Facts from the published plan, plus every computer it has install steps for: a list site saying
// "Windows" goes stale the day a Linux build ships, and the plan is what the app actually installs.
// The release tag a repo's published plan installs (the one most of its builds use), or null.
export function publishedTag(entry) {
  const n = new Map();
  for (const t of Object.values(entry?.targets || {})) for (const gm of t?.games || []) if (gm.build?.method === "release" && gm.build.release_tag) n.set(gm.build.release_tag, (n.get(gm.build.release_tag) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
export function attachFacts(games, pub) {
  for (const g of games) {
    const entry = g.owner && pub?.plans?.[planKey(g.repoHost || "github", g.owner, g.repo)];
    g.facts = entry?.facts || null;
    g.scan = entry ? scanSummary(entry) : null;
    // The version Decomp Buddy installs is the published one; a newer release waits its 48 hours and scan
    // (scripts/follow.mjs) before it shows as an update. Collections already carry their own per-game tag.
    const tag = !g.repoGames && publishedTag(entry);
    if (tag) g.publishedTag = tag;
    if (tag && tag !== g.version) { g.latestVersion = g.version; g.version = tag; }
    const planned = Object.keys(entry?.targets || {}).map((t) => PLATFORM_OF_TARGET[t]).filter(Boolean);
    if (planned.length) g.platforms = [...new Set([...(g.platforms || []), ...planned])];
  }
  return games;
}
