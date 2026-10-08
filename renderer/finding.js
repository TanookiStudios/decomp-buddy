// Finding games: the New Games and Games You May Like pages, the weekly What's New, and Support
// This Project on a game's page.
// Shares app.js's globals ($, esc, settings, catalog, installedFor, isWished, portCard, showDetail, fmtDate, toast).

const DAY = 86400e3;
// A list page: cards under plain headings (no collapsing - these lists are short).
const groupedCards = (groups) => groups.filter(([, list]) => list.length).map(([title, list]) => `<h2 class="group-head">${esc(title)}<span class="n">${list.length}</span></h2><div class="tiles">${list.map(portCard).join("")}</div>`).join("");

// ---- New Games: the date a game joined the catalog (Maddie's list stamps it; for the other sources,
// the first time this computer saw it - never on the very first load, when everything is "new").
// The newest 100 from the last 30 days; nothing that recent, the newest 40 whenever they were added.
const addedOn = (g) => g.addedAt || (Date.parse(g.firstSeen || 0) > DAY ? g.firstSeen : "");
function renderNewGames() {
  const all = catalog.games.filter(addedOn).sort((a, b) => addedOn(b).localeCompare(addedOn(a)) || a.title.localeCompare(b.title));
  const age = (g) => (Date.now() - Date.parse(addedOn(g))) / DAY;
  const recent = all.filter((g) => age(g) <= 30).slice(0, 100); // a big batch (60 games in a day) shouldn't turn this into the whole catalog
  $("newList").innerHTML = recent.length
    ? groupedCards([["This Week", recent.filter((g) => age(g) <= 7)], ["Last Week", recent.filter((g) => age(g) > 7 && age(g) <= 14)], ["Earlier This Month", recent.filter((g) => age(g) > 14)]])
    : all.length ? groupedCards([["Most Recent", all.slice(0, 40)]])
    : `<p class="muted">${catalog.games.length ? "Nothing new has been added lately." : "Loading the catalog…"}</p>`;
}

// ---- Games You May Like: same maker, same console's recomps, playable ones first - grouped by the
// game of yours that suggested it. Nothing installed or wishlisted yet: complete games with a fresh release.
const RECOMPISH = /recomp|decomp|port|native/i;
function becausePicks() {
  const seeds = catalog.games.filter((g) => g.owner && installedFor(g));
  const from = seeds.length ? seeds : catalog.games.filter((g) => g.owner && isWished(g));
  if (!from.length) return [];
  const seedKeys = new Set(from.map((g) => g.id));
  const scored = [];
  for (const c of catalog.games) {
    if (!c.repoUrl || seedKeys.has(c.id) || installedFor(c)) continue;
    let best = 0, by = null;
    for (const s of from) {
      if (s.owner && c.owner && `${s.owner}/${s.repo}`.toLowerCase() === `${c.owner}/${c.repo}`.toLowerCase()) continue; // same repo: siblings show elsewhere
      let n = 0;
      if (s.owner && c.owner && s.owner.toLowerCase() === c.owner.toLowerCase()) n += 3;
      if (s.console && s.console === c.console) n += 1;
      if (s.console === c.console && RECOMPISH.test(s.repo || "") && RECOMPISH.test(c.repo || "")) n += 1;
      if (n > best) { best = n; by = s; }
    }
    if (best && ["playable", "mostly"].includes(c.facts?.completeness)) best += 1;
    if (best >= 2) scored.push({ c, best, by });
  }
  scored.sort((a, b) => b.best - a.best || (b.c.updatedAt || "").localeCompare(a.c.updatedAt || ""));
  return scored.slice(0, 60);
}
function renderForYou() {
  const picks = becausePicks();
  if (picks.length) {
    const bySeed = new Map();
    for (const p of picks) bySeed.set(p.by, [...(bySeed.get(p.by) || []), p.c]);
    $("forYouMeta").textContent = "Picked from the games you've set up and the ones on your wishlist: same makers, same consoles.";
    $("forYouList").innerHTML = groupedCards([...bySeed].sort((a, b) => b[1].length - a[1].length).map(([seed, list]) => [`Because You Have ${seed.title}`, list]));
    return;
  }
  const ready = catalog.games.filter((g) => g.repoUrl && !installedFor(g) && g.status === "latest" && ["playable", "mostly"].includes(g.facts?.completeness))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 24);
  $("forYouMeta").textContent = "Set up a game, or star one ☆ for your wishlist, and this page fills with games like it. Until then, here are complete games with a fresh release.";
  $("forYouList").innerHTML = ready.length ? groupedCards([["Ready To Play", ready]]) : `<p class="muted">${catalog.games.length ? "Nothing to suggest yet." : "Loading the catalog…"}</p>`;
}
for (const id of ["newList", "forYouList"]) $(id).onclick = (e) => $("catalogList").onclick(e);

// ---- What's New This Week: once a week, which of your games and wishlist got a new release.
const WEEK = 7 * 86400e3;
async function digestCheck() {
  const watched = catalog.games.filter((g) => g.version && (installedFor(g) || isWished(g)));
  const seenNow = Object.fromEntries(watched.map((g) => [g.id, g.version]));
  const d = settings.digest;
  if (!d) { settings.digest = { at: new Date().toISOString(), seen: seenNow, items: [] }; await window.buddy.setSettings({ digest: settings.digest }); return; }
  if (Date.now() - Date.parse(d.at) < WEEK) return;
  const items = watched.filter((g) => d.seen?.[g.id] && d.seen[g.id] !== g.version).map((g) => ({ id: g.id, title: g.title, from: d.seen[g.id], to: g.version, at: g.updatedAt || null, installed: !!installedFor(g) }));
  settings.digest = { at: new Date().toISOString(), seen: { ...(d.seen || {}), ...seenNow }, items };
  await window.buddy.setSettings({ digest: settings.digest });
  if (items.length) toast(`What's new this week: ${items.length} of your game${items.length === 1 ? "" : "s"} got a new release - see Installed Games`);
}
function renderDigest() {
  const items = settings.digest?.items || [];
  $("digestPanel").hidden = !items.length;
  if (!items.length) return;
  $("digestPanel").innerHTML = `<div class="row"><strong style="flex:1">What's New This Week</strong><button id="digestDone" type="button">Got It</button></div>
    <div class="srcList" style="margin-top:6px">${items.map((x) => `<div class="srcRow"><span></span><div><div class="lab" translate="no">${esc(x.title)}</div><div class="u">${esc(x.from)} → ${esc(x.to)}${x.at ? ` · ${esc(fmtDate(x.at))}` : ""}${x.installed ? "" : " · on your wishlist"}</div></div><button class="small" type="button" data-digest="${esc(x.id)}">${x.installed ? "See What Changed" : "Details"}</button></div>`).join("")}</div>`;
  $("digestDone").onclick = async () => { settings.digest = { ...settings.digest, items: [] }; await window.buddy.setSettings({ digest: settings.digest }); renderDigest(); };
  $("digestPanel").querySelectorAll("[data-digest]").forEach((b) => (b.onclick = () => showDetail(catalog.games.find((g) => g.id === b.dataset.digest))));
}

// ---- Support This Project (the repo's FUNDING.yml)
async function renderFunding(g) {
  const el = $("detailFunding"); el.innerHTML = "";
  if (!g?.owner) return;
  const r = await window.buddy.gameFunding(g.owner, g.repo, g.repoHost).catch(() => ({ links: [] }));
  if (detailGame !== g || !r.links.length) return;
  el.innerHTML = `<h3 style="margin:16px 0 6px">Support This Project</h3><p class="sub">The people who made this take support directly${r.from && !r.from.endsWith(`/${g.repo}`) ? ` (links from ${esc(r.from)})` : ""}. Decomp Buddy takes no cut.</p>
    <div class="actions">${r.links.map((l) => `<button type="button" data-fund="${esc(l.url)}" title="${esc(l.url)}">${esc(l.label)}</button>`).join("")}</div>`;
  el.querySelectorAll("[data-fund]").forEach((b) => (b.onclick = () => window.buddy.openExternal(b.dataset.fund)));
}

