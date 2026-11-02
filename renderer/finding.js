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
// Trending This Week (main process, from the site): loaded once per session, then the page redraws with it.
let trendingIds = null;
async function loadTrending() { trendingIds = await window.buddy.trendingGet().catch(() => []); if (catalog.games.length) renderNewGames(); }
function renderNewGames() {
  if (catalogLoading && !catalog.games.length) { $("newList").innerHTML = loadingGames(); return; }
  if (trendingIds === null) { trendingIds = []; loadTrending(); }
  const trending = trendingIds.map((id) => catalog.games.find((g) => g.id === id)).filter(Boolean);
  const all = catalog.games.filter(addedOn).sort((a, b) => addedOn(b).localeCompare(addedOn(a)) || a.title.localeCompare(b.title));
  const age = (g) => (Date.now() - Date.parse(addedOn(g))) / DAY;
  const recent = all.filter((g) => age(g) <= 30).slice(0, 100); // a big batch (60 games in a day) shouldn't turn this into the whole catalog
  $("newList").innerHTML = recent.length
    ? groupedCards([["Trending This Week", trending], ["This Week", recent.filter((g) => age(g) <= 7)], ["Last Week", recent.filter((g) => age(g) > 7 && age(g) <= 14)], ["Earlier This Month", recent.filter((g) => age(g) > 14)]])
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
  if (catalogLoading && !catalog.games.length) { $("forYouList").innerHTML = loadingGames(); return; }
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


// ---- Coming Soon: waiting.json - decomps and ports with no computer download yet (kept out of the catalog)
let soon = null;
async function loadSoon(fresh = false) {
  $("soonMeta").textContent = "Loading the list…";
  try { soon = await window.buddy.comingSoon(fresh); }
  catch (err) { soon = null; $("soonMeta").textContent = err.message.replace(/^.*Error: /, ""); $("soonList").innerHTML = ""; return; }
  const consoles = [...new Set(soon.games.map((g) => g.console || "Unknown"))].sort((a, b) => a.localeCompare(b));
  const pick = $("soonConsole").value;
  $("soonConsole").innerHTML = `<option value="">All Consoles</option>` + consoles.map((c) => `<option value="${esc(c)}"${c === pick ? " selected" : ""}>${esc(c)}</option>`).join("");
  renderSoon();
}
const repoPage = (g) => ({ gitlab: "https://gitlab.com/", codeberg: "https://codeberg.org/" }[g.host] || "https://github.com/") + g.repo;
function renderSoon() {
  if (!soon) return;
  const q = $("soonSearch").value.trim().toLowerCase(), con = $("soonConsole").value;
  const list = soon.games.filter((g) => (!con || (g.console || "Unknown") === con) && (!q || `${g.title} ${g.repo}`.toLowerCase().includes(q)));
  $("soonMeta").textContent = `${list.length} of ${soon.games.length} game(s)${soon.stale ? ` - couldn't reach the website, showing the list from ${fmtDate(soon.at)}` : soon.from === "built-in" ? ` - the list built into the app, from ${fmtDate(soon.at)}` : ""}.`;
  $("soonList").innerHTML = list.map((g) => `<div class="srcRow two">${g.boxartUrl ? `<img class="soonArt" src="${esc(g.boxartUrl)}" alt="${esc(`${g.title} box art`)}" loading="lazy" width="40" height="40">` : "<span></span>"}<div><div class="lab" translate="no">${esc(g.title)}</div><div class="u wrap"><span translate="no">${esc(g.console || "Unknown")} · ${esc(g.repo)}</span>${g.notes ? ` - <span translate="no">${esc(g.notes)}</span>` : ""}</div></div>${(() => { const k = soonKey(g), on = watching.has(k); return `<button class="small${on ? " primary" : ""}" type="button" data-watch="${esc(k)}" data-title="${esc(g.title)}" aria-pressed="${on}" aria-label="${esc(on ? `Stop notifying me about ${g.title}` : `Notify me when ${g.title} is playable`)}">${on ? "Notifying You" : "Notify Me"}</button>`; })()}<button class="small" type="button" data-soon="${esc(repoPage(g))}" aria-label="${esc(`Open ${g.title} on GitHub`)}">Open</button></div>`).join("")
    || `<p class="sub">Nothing matches.</p>`;
  $("soonList").querySelectorAll("[data-soon]").forEach((b) => (b.onclick = () => window.buddy.openExternal(b.dataset.soon)));
  $("soonList").querySelectorAll("[data-watch]").forEach((b) => (b.onclick = async () => { showWatch(await window.buddy.watchToggle(b.dataset.watch, b.dataset.title)); const again = $("soonList").querySelector(`[data-watch="${CSS.escape(b.dataset.watch)}"]`); again?.focus(); }));
}

// ---- Tell Me When It's Playable (src/watch.js): the bell, and Now Playable once a watched game can be played.
const soonKey = (g) => `${g.host || "github"}:${g.repo}`.toLowerCase();
let watching = new Set();
function showWatch(st) {
  watching = new Set(st.watching);
  $("soonBadge").hidden = !st.ready.length; $("soonBadge").textContent = st.ready.length;
  $("nowPlayable").hidden = !st.ready.length;
  $("nowPlayableList").innerHTML = st.ready.map((r) => `<div class="srcRow two"><span></span><div><div class="lab" translate="no">${esc(r.title)}</div></div><button class="small primary" type="button" data-ready="${esc(r.id)}">Set It Up</button><button class="small" type="button" data-done="${esc(r.key)}" aria-label="${esc(`Dismiss ${r.title}`)}">Dismiss</button></div>`).join("");
  $("nowPlayableList").querySelectorAll("[data-ready]").forEach((b) => (b.onclick = () => openPlayable(b.dataset.ready)));
  $("nowPlayableList").querySelectorAll("[data-done]").forEach((b) => (b.onclick = async () => showWatch(await window.buddy.watchDismiss(b.dataset.done))));
  if (soon) renderSoon();
}
async function openPlayable(id) {
  // The check that found it just refreshed the catalog on disk, so the cached copy already has it.
  if (!catalog.games.some((g) => g.id === id)) await loadCatalog({ refresh: false }).catch(() => {});
  const g = catalog.games.find((x) => x.id === id); if (g) showDetail(g);
}
window.buddy.onWatchChanged(showWatch);
window.buddy.onWatchOpen(openPlayable);
window.buddy.watchGet().then(showWatch);
$("soonSearch").oninput = renderSoon;
$("soonConsole").onchange = renderSoon;
$("soonRefresh").onclick = () => loadSoon(true);
document.querySelector('nav.side button[data-nav="soon"]')?.addEventListener("click", () => { if (!soon) loadSoon(); });

// ---- What Should I Play? Three answers, three games (src/pick.js in the main process); Pick Again shuffles.
function openPick() {
  const counts = new Map(); for (const g of catalog.games) counts.set(g.console, (counts.get(g.console) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => c).sort((a, b) => a.localeCompare(b));
  const keep = $("pickConsole").value;
  $("pickConsole").innerHTML = `<option value="">Any Console</option>` + top.map((c) => `<option value="${esc(c)}"${c === keep ? " selected" : ""}>${esc(c)}</option>`).join("");
  for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = true;
  $("pickDlg").hidden = false; $("pickConsole").focus();
}
async function runPick() {
  if (!catalog.games.length) await loadCatalog({ refresh: false }).catch(() => {});
  const r = await window.buddy.pickGames({ console: $("pickConsole").value, how: $("pickHow").value, matters: $("pickMatters").value });
  const picks = r.ids.map((id) => catalog.games.find((g) => g.id === id)).filter(Boolean);
  $("pickNote").textContent = !picks.length ? "Nothing fits yet. Try another console." : r.relaxed ? "Nothing fits all three, so these fit most of it." : "";
  $("pickOut").innerHTML = picks.map((g) => `<div class="srcRow"><span></span><div><div class="lab" translate="no">${esc(g.title)}</div><div class="u">${g.console === "Unknown" ? "" : esc(g.console)}</div></div><button class="small" type="button" data-pick="${esc(g.id)}">See It</button></div>`).join("");
  $("pickOut").querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { closePick(); showDetail(catalog.games.find((g) => g.id === b.dataset.pick)); }));
  $("pickGo").textContent = picks.length ? "Pick Again" : "Show Me";
}
function closePick() { $("pickDlg").hidden = true; for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = false; $("pickBtn").focus(); }
$("pickBtn").onclick = openPick;
$("pickGo").onclick = runPick;
$("pickClose").onclick = closePick;
$("pickDlg").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closePick(); } });
