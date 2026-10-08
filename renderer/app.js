const $ = (id) => document.getElementById(id);
const log = (m) => { $("log").textContent += m + "\n"; $("log").scrollTop = $("log").scrollHeight; };
const status = (m, cls = "") => { $("status").textContent = m; $("status").className = `status ${cls}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let hasKey = false;

function showView(name) {
  document.querySelectorAll("main > section.view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
  document.querySelectorAll("nav.side button[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
  if (["browse", "new", "foryou"].includes(name) && !catalog.games.length) loadCatalog();
  if (name === "admin") { renderPublished(); renderDead(); renderStats(); renderSuggestions(); if (catalog.games.length) plansStatus(); else loadCatalog({ refresh: false }).then(plansStatus); }
  if (name === "library") { renderLibrary(); renderPad(); }
  if (name === "settings") { renderRomLibrary(); renderLocal(); }
}
document.querySelectorAll("nav.side button[data-nav]").forEach((b) => (b.onclick = () => showView(b.dataset.nav)));
document.getElementById("supportLink").onclick = (e) => { e.preventDefault(); window.buddy.openExternal("https://tanookistudios.com/SupportMe"); };
let games = [];          // from analyze: [{ id, url, ok, game_title, console, method, game_files, error }]
const picks = new Map(); // id -> { [fileIndex]: path }
const verifications = new Map(); // `${id}:${i}` -> result | { pending: true }
const skipped = new Set();       // game ids the user chose to skip

let presets = {};
let settings = {};

function providerUI() {
  const id = $("provider").value;
  const p = presets[id] || {};
  $("keyRow").hidden = !!p.noKey;
  $("baseUrlRow").hidden = !p.custom;
  if (!p.custom) $("baseUrl").value = p.baseUrl || "";
}

async function refresh() {
  settings = await window.buddy.getSettings();
  presets = settings.presets;
  hasKey = settings.hasKey || !!presets[settings.provider]?.noKey;
  $("outDir").value = settings.outDir;
  $("outDirWhy").textContent = settings.targetIsHost ? "Runs on this computer - Install Folder." : "For another OS - Transfer Folder.";
  $("installDir").value = settings.installDir; $("transferDir").value = settings.transferDir;
  $("moveFiles").checked = settings.moveFiles;
  $("provider").innerHTML = Object.entries(presets).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("");
  $("provider").value = settings.provider;
  $("baseUrl").value = settings.baseUrl;
  $("model").value = settings.model;
  $("modelSelect").hidden = true; $("model").hidden = false;
  $("keyState").textContent = settings.hasKey ? "Key saved." : "No key saved yet - paste one and hit Save.";
  $("ghToken").placeholder = settings.hasGithubToken ? "Token saved - paste a new one to replace it" : "Optional - paste a token"; $("clearGhToken").hidden = !settings.hasGithubToken;
  $("modelState").textContent = settings.model ? `Using ${settings.model}` : "No model chosen yet.";
  $("appVersion").textContent = settings.version ? `Version ${settings.version}` : "";
  $("theme").value = settings.theme || "system";
  $("preferBoxart").checked = !!settings.preferBoxart;
  $("startCouch").checked = !!settings.startCouch;
  $("lang").innerHTML = `<option value="system">Follow The System</option>` + Object.entries(settings.langs || {}).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("lang").value = settings.lang || "system";
  applyLang();
  document.documentElement.dataset.theme = settings.theme && settings.theme !== "system" ? settings.theme : "";
  $("legal").hidden = !!settings.sawLegal;
  renderVault();
  renderLibFolders();
  renderSources();
  renderFinds();
  renderSharedAdmin();
  discoverSchedule();
  $("discSubs").value = (settings.discoverSubs || []).join(", "); $("discChannels").value = (settings.discoverChannels || []).join(", ");
  // Named catalogs as links; everything hand-added is one phrase, not a wall of repos.
  const named = (settings.sources?.builtin || []).filter((x) => x.enabled && x.id !== "finds");
  const extras = (settings.sources?.custom || []).filter((c) => c.enabled !== false).length || (settings.sources?.builtin || []).some((x) => x.id === "finds" && x.enabled);
  $("aboutSources").innerHTML = named.map((x) => `<a href="#" data-url="${esc(x.url)}">${esc(x.label)}</a>`).join(", ")
    + (extras ? `${named.length ? ", and " : ""}various individual GitHub links.` : ".");
  $("target").innerHTML = Object.entries(settings.targets).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
  $("target").value = settings.target;
  targetPlatformLabel();
  $("clean").hidden = settings.platform === "win32";
  providerUI();
}

$("provider").onchange = async () => {
  await window.buddy.setSettings({ provider: $("provider").value });
  await refresh();
};
$("baseUrl").onchange = () => window.buddy.setSettings({ baseUrl: $("baseUrl").value.trim() });
$("model").onchange = async () => { await window.buddy.setSettings({ model: $("model").value.trim() }); await refresh(); };
$("modelSelect").onchange = async () => { $("model").value = $("modelSelect").value; await window.buddy.setSettings({ model: $("model").value }); await refresh(); };

$("loadModels").onclick = async () => {
  $("loadModels").disabled = true; $("modelState").textContent = "Asking the provider…";
  try {
    const ids = await window.buddy.listModels({ apiKey: $("apiKey").value.trim() || undefined, baseUrl: $("baseUrl").value.trim() || undefined });
    $("modelSelect").innerHTML = ids.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
    $("modelSelect").value = ids.includes($("model").value) ? $("model").value : ids[0];
    $("modelSelect").hidden = false; $("model").hidden = true;
    $("modelState").textContent = `Found ${ids.length} model(s) - pick one.`;
    if (!ids.includes($("model").value)) { $("model").value = ids[0]; await window.buddy.setSettings({ model: ids[0] }); }
  } catch (err) {
    $("modelState").textContent = err.message.replace(/^.*Error: /, "");
  } finally { $("loadModels").disabled = false; }
};

const METHOD = { release: "Windows build available", source: "No Windows build - must be built on the PC", web_only: "Browser-only, nothing to install", unsupported: "No Windows path found" };

const overrides = new Map(); // game id -> { asset, folder } edited in Review
const autoFrom = new Map();  // `${id}:${i}` -> "from your vault …" / "from your library …"
const reviewOpen = new Set();
const mb = (n) => (n ? `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB` : "");
function reviewPanel(g) {
  const r = g.review; if (!r) return "";
  const o = overrides.get(g.id) || {};
  const asset = o.asset || r.asset, folder = o.folder ?? r.folder;
  const sep = r.outDir.includes("\\") ? "\\" : "/";
  return `<div class="review" id="review-${g.id}">
    <div class="row"><label for="rv-asset-${g.id}" style="min-width:110px;margin:0">Download</label>
      ${r.assets.length > 1 ? `<select id="rv-asset-${g.id}" data-rv="asset" data-id="${g.id}">${r.assets.map((a) => `<option value="${esc(a.name)}" ${a.name === asset ? "selected" : ""}>${esc(a.name)}${a.size ? ` (${mb(a.size)})` : ""}${a.name === r.asset ? " - the plan's pick" : ""}</option>`).join("")}</select>`
        : `<span id="rv-asset-${g.id}">${esc(asset || "nothing - this project has no download for your target")}</span>`}</div>
    <div class="row"><span style="min-width:110px">From release</span><span>${esc(r.tag || "-")}</span></div>
    <div class="row"><label for="rv-folder-${g.id}" style="min-width:110px;margin:0">Folder</label><input id="rv-folder-${g.id}" data-rv="folder" data-id="${g.id}" type="text" value="${esc(folder)}" spellcheck="false"></div>
    <div class="hint">Everything lands in ${esc(r.outDir + sep + folder)}${r.executable ? ` · the game runs from ${esc(r.executable)}` : ""}</div>
    ${g.game_files.map((f) => `<div class="hint">${esc(f.label)} → ${esc(f.drop_into || "the game folder")}${f.expected_filename ? ` as ${esc(f.expected_filename)}` : ""}</div>`).join("")}
    <div class="hint">Changes apply to this set-up only.</div>
  </div>`;
}
$("games").addEventListener("change", (e) => { const t = e.target.closest("[data-rv]"); if (!t) return; const o = overrides.get(t.dataset.id) || {}; o[t.dataset.rv] = t.value; overrides.set(t.dataset.id, o); });
$("games").addEventListener("input", (e) => { const t = e.target.closest("[data-rv=folder]"); if (!t) return; const o = overrides.get(t.dataset.id) || {}; o.folder = t.value; overrides.set(t.dataset.id, o); });
// Drag a file or archive onto a game-file row: same as Choose….
$("games").addEventListener("dragover", (e) => { const row = e.target.closest(".file[data-id]"); if (!row) return; e.preventDefault(); row.classList.add("drop"); });
$("games").addEventListener("dragleave", (e) => { e.target.closest(".file")?.classList.remove("drop"); });
$("games").addEventListener("drop", (e) => {
  const row = e.target.closest(".file[data-id]"); if (!row) return; e.preventDefault(); row.classList.remove("drop");
  const file = e.dataTransfer.files?.[0]; if (!file) return;
  const p = window.buddy.pathForFile(file); if (!p) return status("Couldn't read that file's location.", "bad");
  const g = games.find((x) => x.id === row.dataset.id); if (g) usePick(g, Number(row.dataset.i), p);
});
async function usePick(g, i, chosen) {
  const p = picks.get(g.id) || {}, key = `${g.id}:${i}`, f = g.game_files[i];
  p[i] = chosen; picks.set(g.id, p);
  verifications.set(key, { pending: true });
  renderGames();
  try {
    const v = await window.buddy.verify({ path: chosen, gameFile: f, outDir: $("outDir").value.trim() });
    verifications.set(key, v);
    if (v.resolvedPath) { p[i] = v.resolvedPath; picks.set(g.id, p); }
  } catch (err) { verifications.set(key, { status: "unverified", summary: `Couldn't use that file: ${err.message.replace(/^.*Error: /, "")}` }); }
  renderGames();
}
function renderGames() {
  $("games").className = "";
  $("games").innerHTML = games.map((g) => {
    if (!g.ok) return `<section class="game"><h2>${esc(g.url)}</h2><p class="err">${esc(g.error)}</p></section>`;
    const p = picks.get(g.id) || {};
    const files = g.game_files.map((f, i) => {
      const v = verifications.get(`${g.id}:${i}`);
      const need = [f.kind === "bios" && "System file", f.expected_region && !["any", "unknown"].includes(f.expected_region) && `${f.expected_region} version`, f.required_version, f.expected_hashes?.length && "hash published"].filter(Boolean).join(" · ");
      const badge = !v ? "" : v.pending ? `<div class="verify muted">Checking…</div>`
        : `<div class="verify ${v.status === "match" ? "ok" : v.status === "mismatch" ? "bad" : "muted"}">${v.status === "match" ? "✓ " : v.status === "mismatch" ? "⚠ " : ""}${esc(v.summary)}</div>`;
      return `
      <div class="file" data-id="${g.id}" data-i="${i}" title="Drop a file here, or Choose…">
        <div class="what"><strong>${esc(f.label)}${need ? ` <span class="hint">(${esc(need)})</span>` : ""}</strong>${esc(f.description)}
          <div class="hint">${esc(f.accepted_formats.join(", ") || "any format")}${f.expected_filename ? ` · will be named ${esc(f.expected_filename)}` : ""}${f.how_provided === "in_app_picker" ? " · the game asks for it again on first run" : ""}</div>
          ${autoFrom.has(`${g.id}:${i}`) && p[i] ? `<div class="verify muted">Filled in ${esc(autoFrom.get(`${g.id}:${i}`))}</div>` : ""}
          ${badge}
        </div>
        <div class="pick"><span class="chosen" title="${esc(p[i] || "")}">${esc(p[i] ? p[i].split(/[\\/]/).pop() : "")}</span>
          <button class="small" type="button" data-id="${g.id}" data-i="${i}" data-act="pick">Choose…</button>
          ${drives.length && ["cd-raw", "dvd-iso"].includes(g.rip?.kind) && f.kind !== "bios" ? `<button class="small" type="button" data-id="${g.id}" data-i="${i}" data-act="rip" title="Rip it from the disc in ${esc(drives[0].drive)} (experimental)">Rip From Disc</button>` : ""}
          ${p[i] && f.kind !== "bios" ? `<button class="small" type="button" data-id="${g.id}" data-i="${i}" data-act="patch" title="Apply an IPS, BPS, UPS or xdelta patch to this file (your file isn't changed)">Patch…</button>` : ""}
          <button class="small" type="button" data-id="${g.id}" data-i="${i}" data-act="clear" ${p[i] ? "" : "hidden"} aria-label="Clear choice">×</button>
        </div>
      </div>`; }).join("");
    const isSkipped = skipped.has(g.id);
    return `<section class="game${isSkipped ? " skipped" : ""}">
      <div class="head"><h2><span translate="no">${esc(g.game_title)}</span> <span class="console">· ${esc(g.console)}</span></h2>
        <div class="actions">${g.game_files.filter((f) => f.kind !== "bios").length > 1 ? `<button class="small" type="button" data-id="${g.id}" data-act="discs" title="Choose the folder with all the discs; each goes to the right row">Pick A Folder</button>` : ""}${g.review ? `<button class="small" type="button" data-id="${g.id}" data-act="review" aria-expanded="${reviewOpen.has(g.id)}" aria-controls="review-${g.id}">Review</button>` : ""}<button class="small" type="button" data-id="${g.id}" data-act="skip">${isSkipped ? "Unskip" : "Skip"}</button></div></div>
      ${g.rip?.kind === "impossible" && drives.length ? `<div class="hint">${esc(g.rip.why)}</div>` : ""}
      <div class="method">${esc(METHOD[g.method] || g.method)}${g.planSource === "published" ? " · plan from Maddie's catalog (no AI used)" : g.planSource === "published-stale" ? " · older published plan - the repo has a newer release" : ""}</div>
      ${reviewOpen.has(g.id) ? reviewPanel(g) : ""}
      ${g.method === "unsupported" || g.method === "web_only" ? "" : files || `<div class="hint">The docs list no game files to supply.</div>`}
    </section>`;
  }).join("");
  $("setup").disabled = !games.some((g) => g.ok && !skipped.has(g.id));
}

$("games").onclick = async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const g = games.find((x) => x.id === b.dataset.id);
  if (b.dataset.act === "skip") { skipped.has(g.id) ? skipped.delete(g.id) : skipped.add(g.id); return renderGames(); }
  if (b.dataset.act === "review") { reviewOpen.has(g.id) ? reviewOpen.delete(g.id) : reviewOpen.add(g.id); renderGames(); return document.querySelector(`[data-act=review][data-id="${g.id}"]`)?.focus(); }
  if (b.dataset.act === "discs") {
    const r = await window.buddy.sortDiscs(g.id).catch((err) => ({ err: err.message.replace(/^.*Error: /, "") }));
    if (!r) return; if (r.err) return status(r.err, "bad");
    const n = Object.keys(r.assignments).length;
    status(`${r.found} disc image(s) found, ${n} placed${r.unmatched.length ? `; not used: ${r.unmatched.map((p) => p.split(/[\\/]/).pop()).join(", ")}` : ""}.`, n ? "ok" : "bad");
    for (const [i, p] of Object.entries(r.assignments)) await usePick(g, Number(i), p);
    return;
  }
  const i = Number(b.dataset.i);
  const p = picks.get(g.id) || {};
  if (b.dataset.act === "patch") {
    const key = `${g.id}:${i}`;
    try {
      const v = await window.buddy.patchPick({ path: p[i], gameFile: g.game_files[i], outDir: $("outDir").value.trim() }); if (!v) return;
      verifications.set(key, v); p[i] = v.resolvedPath; picks.set(g.id, p);
    } catch (err) { status(err.message.replace(/^.*Error: /, ""), "bad"); }
    return renderGames();
  }
  const key = `${g.id}:${i}`;
  if (b.dataset.act === "clear") { delete p[i]; verifications.delete(key); autoFrom.delete(key); }
  else if (b.dataset.act === "rip") {
    status("Ripping the disc - this takes a while. macOS may ask for your password to read the drive.");
    try { const out = await window.buddy.dumpRip(g.id, i); status("Disc ripped - checking it.", "ok"); return usePick(g, i, out); }
    catch (err) { return status(err.message.replace(/^.*Error: /, ""), "bad"); }
  }
  else {
    const f = g.game_files[i];
    const chosen = await window.buddy.pickFile({ label: f.label, formats: f.accepted_formats });
    if (!chosen) return;
    return usePick(g, i, chosen);
  }
  picks.set(g.id, p);
  renderGames();
};

$("urls").oninput = () => { if (games.length) { $("games").className = "stale"; $("setup").disabled = true; } };

$("chooseInstall").onclick = async () => { const dir = await window.buddy.chooseFolder(); if (dir) { await window.buddy.setSettings({ installDir: dir }); await refresh(); } };
$("chooseTransfer").onclick = async () => { const dir = await window.buddy.chooseFolder(); if (dir) { await window.buddy.setSettings({ transferDir: dir }); await refresh(); } };

$("saveKey").onclick = async () => {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) return status("Paste a key first.", "bad");
  await window.buddy.setSettings({ apiKey });
  $("apiKey").value = "";
  await refresh();
  status("Key saved.", "ok");
};

$("saveGhToken").onclick = async () => {
  const githubToken = $("ghToken").value.trim(); if (!githubToken) return status("Paste a token first.", "bad");
  const r = await window.buddy.setSettings({ githubToken }).catch((e) => ({ err: e.message.replace(/^.*Error: /, "") }));
  $("ghToken").value = ""; await refresh(); status(r?.err || "GitHub token saved.", r?.err ? "bad" : "ok");
};
$("clearGhToken").onclick = async () => { await window.buddy.setSettings({ githubToken: "" }); await refresh(); status("GitHub token removed.", "ok"); };
$("moveFiles").onchange = () => window.buddy.setSettings({ moveFiles: $("moveFiles").checked });
// Language: the setting, or the OS language when we have that translation, else English.
let appliedLang = "en";
function wantedLang() {
  const langs = settings.langs || {}; const pick = settings.lang && settings.lang !== "system" ? settings.lang : settings.osLang || "en";
  return langs[pick] ? pick : Object.keys(langs).find((k) => k.split("-")[0] === pick.split("-")[0]) || "en";
}
async function applyLang() { const w = wantedLang(); if (w !== appliedLang) appliedLang = await window.I18N.use(w); }
$("lang").onchange = async () => { await window.buddy.setSettings({ lang: $("lang").value }); await refresh(); };
$("theme").onchange = async () => { await window.buddy.setSettings({ theme: $("theme").value }); await refresh(); };
// Cards, the detail page, Library and folder icons all ask again for the picture they should show.
$("preferBoxart").onchange = async () => { await window.buddy.setSettings({ preferBoxart: $("preferBoxart").checked }); iconCache.clear(); iconPaths.clear(); await refresh(); if (catalog.games.length) renderCatalog(); };
$("legalOk").onclick = async () => { await window.buddy.setSettings({ sawLegal: true }); $("legal").hidden = true; };

// ---------- Library ----------
let library = [];
async function renderLibrary() {
  library = await window.buddy.libraryList();
  const wished = catalog.games.filter(isWished);
  const shelfOf = (items, title, tile) => items.length ? `<div class="shelf"><div class="shelf-title">${esc(title)}</div><div class="books">${items.map(tile).join("")}</div></div>` : "";
  const book = (g) => {
    const upd = g.repo && updateAvailable(catalog.games.find((c) => c.owner && `${c.owner}/${c.repo}`.toLowerCase() === g.repo.toLowerCase()) || {}, [{ tag: g.tag }]);
    const chips = [g.tag || (g.adopted ? "version unknown" : ""), TARGET_LABEL[g.target] || g.target, g.filesNeeded ? `${g.filesNeeded} file(s) needed` : "", upd ? "update available" : ""].filter(Boolean).join(" · ");
    return `<div class="book" data-key="${esc(g.key)}">
      <div class="cover">${g.art ? `<img src="${g.art}" alt="${esc(g.title)} artwork">` : `<div class="nocover" translate="no">${esc(g.title)}</div>`}
        <div class="acts">
          ${playButton(g, `data-lib="play"`)}
          <button type="button" data-lib="more">More…</button>
          <button type="button" data-lib="steam" ${g.runsHere && g.exe && settings.steamAvailable ? "" : "disabled"} title="${!settings.steamAvailable ? "Steam isn't on this computer" : !g.runsHere ? "Do this from the PC copy after transferring" : ""}">${g.steamAppId ? "In Steam ✓" : "Install To Steam"}</button>
          ${upd ? `<button type="button" data-lib="update">Update</button>` : ""}
          ${g.canBuild ? `<button class="primary" type="button" data-lib="build">Build Here</button>` : ""}
          <button type="button" data-lib="mods">${g.modsSupported ? "Mods" : "Mods (none listed)"}</button>
          <button type="button" data-lib="saves">Saves</button>
          <button type="button" data-lib="versions">Versions</button>
          <button type="button" data-lib="config">Settings</button>
          <button type="button" data-lib="open">Open Folder</button>
          ${g.repo ? `<button type="button" data-lib="detail">Details</button>` : ""}
        </div>
      </div>
      <div class="title" translate="no">${esc(g.title)}</div><div class="chips">${esc(chips)}${padNotes(g) ? ` · <a href="#" data-lib="detail" title="${esc(padNotes(g))}">Controller Notes</a>` : ""}</div>
    </div>`;
  };
  const wishTile = (g) => `<div class="book" data-wish="${esc(g.id)}"><div class="cover">${iconCache.get(g.id) && iconCache.get(g.id) !== "pending" ? `<img src="${iconCache.get(g.id)}" alt="">` : `<div class="nocover">${esc(g.title)}</div>`}<div class="acts"><button class="primary" type="button" data-lib="addwish">Add To Links</button><button type="button" data-lib="detailwish">Details</button></div></div><div class="title">★ ${esc(g.title)}</div><div class="chips">${esc([g.console, g.version].filter(Boolean).join(" · "))}</div></div>`;
  const recent = library.filter((g) => g.lastPlayed).slice(1, 9); // the newest one is the Continue Playing card
  renderContinue(library.find((g) => g.lastPlayed));
  renderSyncBanner();
  renderDigest();
  renderPackUpdates();
  $("shelves").innerHTML = [shelfOf(recent, "Recently Played", book), shelfOf(library, "All Games", book), shelfOf(wished, "Wishlist", wishTile)].join("") || `<p class="sub">Nothing set up yet. Browse Games → pick some → Set Up Games, and they'll appear here.</p>`;
  const upds = library.filter((g) => g.repo && updateAvailable(catalog.games.find((c) => c.owner && `${c.owner}/${c.repo}`.toLowerCase() === g.repo.toLowerCase()) || {}, [{ tag: g.tag }])).length;
  $("libUpdateAll").hidden = !upds; $("libUpdateAll").textContent = `Update All (${upds})`;
  $("libMeta").textContent = `${library.length} game(s) set up${upds ? ` · ${upds} with updates` : ""}.`;
  for (const g of wished) if (iconCache.get(g.id) === undefined) portCard(g);
}
const TARGET_LABEL = { windows: "Windows PC", "macos-arm64": "Mac (Apple Silicon)", "macos-x64": "Mac (Intel)", linux: "Linux" };
$("libRefresh").onclick = renderLibrary;
// ---- Build from source
async function startBuild(g) {
  $("buildPanel").hidden = false; $("buildTitle").textContent = `Build From Source - ${g.title}`; $("buildLog").textContent = ""; $("buildState").textContent = "";
  $("buildSteps").innerHTML = (g.buildSteps || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>None given.</li>";
  const tools = await window.buddy.buildTools();
  $("buildTools").innerHTML = tools.map((t) => `<span class="${t.ok ? "ok" : t.optional ? "muted" : "bad"}">${t.ok ? "✓" : "✗"} ${esc(t.name)}${!t.ok ? ` <code>${esc(t.install)}</code>` : ""}</span>`).join(" · ");
  if (tools.some((t) => !t.ok && !t.optional)) { $("buildState").textContent = "Install the missing tools first (commands above), then Build Here again."; $("buildState").className = "status bad"; return; }
  const onLog = (l) => { $("buildLog").textContent += l + "\n"; $("buildLog").scrollTop = $("buildLog").scrollHeight; };
  window.buddy.onLog(onLog);
  $("buildState").textContent = "Building… this can take a while."; $("buildState").className = "status";
  try { const r = await window.buddy.buildRun(g.folder); $("buildState").textContent = `Built: ${r.executable}. Play is ready.`; $("buildState").className = "status ok"; renderLibrary(); }
  catch (err) { $("buildState").textContent = err.message.replace(/^.*Error: /, ""); $("buildState").className = "status bad"; }
}
$("buildCancel").onclick = () => window.buddy.buildCancel();
// ---- Mods panel
let modsGame = null;
const METHOD_TEXT = { folder: (m) => `This port reads mods from its <code>${esc(m.folder || "mods")}</code> folder. Enable/disable below copies files in and out of it.`, in_app: () => "This port installs mods from inside the game (an Install Mods button or mod menu). Files you add here sit in <code>Decomp Buddy Mods</code> - point the game's installer at them.", drag_onto_window: () => "This port takes mods by dragging the files onto the game window. Files you add here sit in <code>Decomp Buddy Mods</code> - drag them from there.", unknown: () => "The project's docs don't say how mods are installed; files you add are kept in <code>Decomp Buddy Mods</code> for you to place by hand." };
// ---- Versions (roll back) + CI builds, and per-game settings: one shared panel
let panelGame = null;
const panelState = (m, cls = "") => { $("gamePanelState").textContent = m; $("gamePanelState").className = `status ${cls}`; };
$("gamePanelClose").onclick = () => { $("gamePanel").hidden = true; };
async function openVersions(g) {
  panelGame = g; $("gamePanel").hidden = false; $("gamePanelTitle").textContent = `Versions - ${g.title}`; panelState("");
  const v = await window.buddy.versionsList(g.folder);
  $("gamePanelBody").innerHTML = `<p class="sub">You have ${esc(v.current || "an untracked version")}${v.channel === "nightly" ? " (a CI build)" : ""}. The builds you replaced are kept here (two at most) - your game files, saves and mods are never part of the swap, and saves are backed up first.</p>
    <div class="srcList">${v.versions.length ? v.versions.map((x) => `<div class="srcRow"><span></span><div><div class="lab">${esc(x.tag)}</div><div class="u">kept ${esc(fmtDate(x.keptAt))}</div></div><button class="small" type="button" data-rollback="${esc(x.tag)}">Roll Back</button></div>`).join("") : `<p class="sub">Nothing kept yet - the next update keeps this version.</p>`}</div>
    <h4 style="margin:14px 0 6px">Latest CI Build</h4><div id="ciList"><p class="sub">Looking for CI builds…</p></div>`;
  $("gamePanelTitle").focus?.();
  try {
    const r = await window.buddy.nightlyList(g.folder);
    $("ciList").innerHTML = r.artifacts.length ? `${r.hasToken ? "" : `<p class="sub">Installing a CI build needs a GitHub token (Settings → GitHub Token) - GitHub doesn't hand them out anonymously.</p>`}<p class="sub">Built by the project's own CI from the latest code - newer than any release, and less tested.</p>` + r.artifacts.map((a) => `<div class="srcRow"><span></span><div><div class="lab">${esc(a.name)}</div><div class="u">${esc([a.branch && `branch ${a.branch}`, fmtDate(a.createdAt), mb(a.size), a.debug && "debug build", a.flatpak && "Flatpak - install with flatpak, not here"].filter(Boolean).join(" · "))}</div></div><button class="small" type="button" data-ci="${a.id}" data-ciname="${esc(a.name)}" data-cirun="${a.runId || ""}" ${r.hasToken && !a.flatpak ? "" : "disabled"} title="${r.hasToken ? (a.flatpak ? "Flatpaks install through flatpak" : "") : "Needs a GitHub token (Settings)"}">Install</button></div>`).join("")
      : `<p class="sub">This project publishes no CI builds for this platform.</p>`;
  } catch (err) { $("ciList").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
}
$("gamePanelBody").addEventListener("click", async (e) => {
  const rb = e.target.closest("[data-rollback]"), ci = e.target.closest("[data-ci]"), save = e.target.closest("#cfgSave"), pre = e.target.closest("[data-preset]");
  try {
    if (pre) {
      const r = await window.buddy.configPreset(panelGame.folder, pre.dataset.preset);
      for (const [k, v] of Object.entries(r.values)) { const el = $("gamePanelBody").querySelector(`[data-cfg="${k}"]`); if (!el) continue; if (el.type === "checkbox") el.checked = /^(true|1|yes|on)$/i.test(String(v)); else el.value = Array.isArray(v) ? v.join(",") : v; }
      panelState(`${pre.textContent} filled in${r.skipped.length ? ` (left alone: ${r.skipped.map((k) => CFG_LABEL[k] || k).join(", ")})` : ""} - check it, then Save Settings.`, "ok");
      return;
    }
    if (rb) { if (!confirm(`Roll back ${panelGame.title} to ${rb.dataset.rollback}?`)) return; panelState("Rolling back…"); const r = await window.buddy.versionsRollback(panelGame.folder, rb.dataset.rollback); panelState(`Now on ${r.tag}.`, "ok"); await openVersions(panelGame); }
    if (ci) { ci.disabled = true; panelState(`Downloading ${ci.dataset.ciname}…`); const r = await window.buddy.nightlyInstall({ folder: panelGame.folder, id: Number(ci.dataset.ci), name: ci.dataset.ciname, runId: ci.dataset.cirun }); await openVersions(panelGame); panelState(`Installed ${r.tag}. Roll Back is here if it misbehaves.`, "ok"); }
    if (save) {
      const values = {}; for (const el of $("gamePanelBody").querySelectorAll("[data-cfg]")) values[el.dataset.cfg] = el.type === "checkbox" ? el.checked : el.value;
      await window.buddy.configSet(panelGame.folder, values); panelState("Saved. The previous file is kept beside it (.before-decomp-buddy).", "ok");
    }
  } catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
});
const CFG_LABEL = { fullscreen: "Fullscreen", resolution: "Resolution", ultrawide: "Widescreen / Aspect", vsync: "V-Sync" };
const isBool = (v) => typeof v === "boolean" || /^(true|false|yes|no|on|off|0|1)$/i.test(String(v));
async function openConfig(g) {
  panelGame = g; $("gamePanel").hidden = false; $("gamePanelTitle").textContent = `Settings - ${g.title}`; panelState("");
  const c = await window.buddy.configGet(g.folder);
  $("gamePanelBody").innerHTML = !c.known ? `<p class="sub">This project's README doesn't name its settings file, so Decomp Buddy can't edit it. Use the game's own options menu.</p>`
    : !c.exists ? `<p class="sub">The README says settings live in ${esc(c.name)}, but it isn't there yet - most ports write it the first time they run. Play once, then come back.</p>`
    : !c.editable ? `<p class="sub">Settings are in ${esc(c.file)}${c.format === "unknown" ? " (a format Decomp Buddy doesn't edit)" : ""}. </p><button id="cfgOpen" type="button">Open Settings File</button>`
    : `<p class="sub">Written into ${esc(c.file)} in its own format; everything else in the file is left alone.</p>${(c.presets || []).length ? `<div class="row" role="group" aria-label="Presets"><span class="sub">Presets:</span>${c.presets.map((p) => `<button class="small" type="button" data-preset="${p.id}">${esc(p.label)}</button>`).join("")}</div>` : ""}${Object.keys(c.keys).map((k) => { const v = c.values[k]; const id = `cfg-${k}`;
        return `<div class="cfgrow"><label for="${id}">${CFG_LABEL[k] || k}</label>${v === undefined ? `<span class="sub">${esc(c.keys[k])} isn't in the file yet</span>` : isBool(v) && k !== "resolution" ? `<input id="${id}" type="checkbox" data-cfg="${k}" ${/^(true|yes|on|1)$/i.test(String(v)) ? "checked" : ""}>` : `<input id="${id}" type="text" data-cfg="${k}" value="${esc(v)}">`}</div>`; }).join("")}<button id="cfgSave" class="primary" type="button">Save Settings</button>`;
  $("cfgOpen")?.addEventListener("click", () => window.buddy.open(c.file));
}

// ---- "Open In Decomp Buddy" from the website: fill in the links box, nothing more.
window.buddy.onDeepLink(async (link) => {
  if (!catalog.games.length) await loadCatalog({ refresh: false }).catch(() => {});
  const g = catalog.games.find((x) => x.owner && `${x.owner}/${x.repo}`.toLowerCase() === link.repo.toLowerCase() && (!link.game || !x.gameTitle || normTitle(x.gameTitle) === normTitle(link.game)));
  if (g) await addToLinks([g.id]);
  else { const lines = $("urls").value.split("\n").map((l) => l.trim()).filter(Boolean); if (!lines.includes(link.repoUrl)) lines.push(link.repoUrl); $("urls").value = lines.join("\n"); showView("setup"); }
  status(`Added ${link.game || link.repo} from the website - press Read Repos when you're ready.`, "ok"); $("analyze").focus();
});

// ---- Local model (Ollama)
let localModel = null;
async function renderLocal() {
  const st = await window.buddy.localStatus();
  localModel = st.setting?.model || st.models?.[0]?.name || st.suggested;
  const has = st.models?.some((m) => m.name === localModel);
  $("localState").textContent = !st.running ? "Ollama isn't running on this computer." : !st.models?.length ? `Ollama is running with no models. ${st.suggested} (about 4.7 GB) is a good one.` : `Ollama is running · ${localModel}${st.setting?.tested ? " · passed the test" : has ? " · not tested yet" : ""}.`;
  $("localPull").hidden = !st.running || has; $("localPull").textContent = `Download ${st.suggested}`;
  $("localTest").hidden = !st.running || !has;
  $("localEnableRow").hidden = !st.setting?.tested; $("localEnable").checked = !!st.setting?.enabled;
}
$("localPull").onclick = async () => { $("localPull").disabled = true; try { await window.buddy.localPull(localModel); } catch (err) { $("localState").textContent = err.message.replace(/^.*Error: /, ""); } finally { $("localPull").disabled = false; renderLocal(); } };
window.buddy.onLocalProgress((p) => { $("localState").textContent = `Ollama: ${p.status}${p.pct != null ? ` ${p.pct}%` : ""}`; });
$("localTest").onclick = async () => { $("localTest").disabled = true; $("localState").textContent = "Planning a sample repo with it - this can take a minute…"; const r = await window.buddy.localTest(localModel); $("localTest").disabled = false; await renderLocal(); $("localState").textContent = r.ok ? `Passed in ${r.seconds}s - switch it on below.` : `Didn't pass: ${r.why}`; };
$("localEnable").onchange = async () => { try { await window.buddy.localEnable($("localEnable").checked); } catch (err) { $("localEnable").checked = false; $("localState").textContent = err.message.replace(/^.*Error: /, ""); } };

// ---- Controllers: say which pad is connected; games whose README mentions controller quirks say so.
function renderPad() {
  const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  $("padState").hidden = !pads.length;
  if (pads.length) $("padState").textContent = `Controller connected: ${pads.map((p) => p.id.replace(/\s*\(.*?\)\s*/g, " ").trim()).join(", ")}. Games with controller notes say so on their page.`;
}
window.addEventListener("gamepadconnected", renderPad); window.addEventListener("gamepaddisconnected", renderPad);

const padNotes = (g) => { const c = catalog.games.find((x) => x.owner && g.repo && `${x.owner}/${x.repo}`.toLowerCase() === g.repo.toLowerCase()); return (c?.facts?.controller_notes || []).join(" · "); };

// ---- Offline banner
const setOnline = () => { $("offlineBanner").hidden = navigator.onLine; };
window.addEventListener("online", setOnline); window.addEventListener("offline", setOnline); setOnline();

// ---- Saves
let savesGame = null;
async function openSaves(g) { savesGame = g; $("savesPanel").hidden = false; $("savesTitle").textContent = `Saves - ${g.title}`; $("savesState").textContent = ""; await renderSaves(); $("savesBackup").focus(); }
async function renderSaves() {
  const r = await window.buddy.savesInfo(savesGame.folder);
  $("savesWhere").textContent = !r.here ? "This copy is built for another computer - back saves up on the machine that plays it."
    : r.paths.length ? `Saves live in: ${r.paths.map((p) => `${p.path}${p.exists ? "" : " (nothing there yet)"}`).join(" · ")}. They're backed up automatically before every update.`
    : r.documented.length ? `The README gives ${r.documented.join(", ")}, which isn't a folder on this computer.` : "This project's README doesn't say where saves go, so they can't be backed up automatically. Open Folder and copy them by hand.";
  $("savesBackup").disabled = !r.paths.some((p) => p.exists); $("savesBackup").title = $("savesBackup").disabled ? "No save files in the documented folders yet" : "";
  $("savesList").innerHTML = r.backups.length ? r.backups.map((b) => `<div class="srcRow"><span></span><div><div class="lab">${esc(b.name.replace(/\.zip$/, ""))}</div><div class="u">${mb(b.size) || `${b.size} bytes`}</div></div><button class="small" type="button" data-restore="${esc(b.file)}">Restore</button></div>`).join("") : `<p class="sub">No backups yet.</p>`;
}
$("savesClose").onclick = () => { $("savesPanel").hidden = true; };
$("savesBackup").onclick = async () => { try { const r = await window.buddy.savesBackup(savesGame.folder); $("savesState").textContent = `Backed up ${r.paths.length} folder(s).`; $("savesState").className = "status ok"; } catch (err) { $("savesState").textContent = err.message.replace(/^.*Error: /, ""); $("savesState").className = "status bad"; } renderSaves(); };
$("savesList").onclick = async (e) => {
  const b = e.target.closest("[data-restore]"); if (!b) return;
  if (!confirm("Replace the current saves with this backup? The saves there now are backed up first.")) return;
  try { await window.buddy.savesRestore(savesGame.folder, b.dataset.restore); $("savesState").textContent = "Restored."; $("savesState").className = "status ok"; } catch (err) { $("savesState").textContent = err.message.replace(/^.*Error: /, ""); $("savesState").className = "status bad"; }
  renderSaves();
};
// ---- Game-file library + DATs (Settings)
async function renderRomLibrary() {
  const st = await window.buddy.romStatus();
  $("romFolderList").innerHTML = st.folders.length ? st.folders.map((f) => `<div class="srcRow"><span></span><div class="lab">${esc(f)}</div><button class="small" type="button" data-romrm="${esc(f)}" aria-label="Remove ${esc(f)}">Remove</button></div>`).join("") : `<p class="sub">No folders yet.</p>`;
  if (!st.scanning) $("romState").textContent = st.files ? `${st.files} file(s) indexed${st.scannedAt ? `, last scan ${fmtDate(st.scannedAt)}` : ""}.` : st.folders.length ? "Not scanned yet." : "";
  $("romScan").disabled = !st.folders.length || st.scanning; $("romCancel").hidden = !st.scanning;
  const dats = await window.buddy.datList();
  $("datList").innerHTML = dats.length ? dats.map((d) => `<div class="srcRow"><span></span><div><div class="lab">${esc(d.name)}</div><div class="u">${d.games} games · ${esc(d.file)}</div></div><button class="small" type="button" data-datrm="${esc(d.id)}" aria-label="Remove ${esc(d.name)}">Remove</button></div>`).join("") : `<p class="sub">None.</p>`;
}
$("romAdd").onclick = async () => { await window.buddy.romFolders({ add: true }); renderRomLibrary(); };
$("romFolderList").onclick = async (e) => { const b = e.target.closest("[data-romrm]"); if (!b) return; await window.buddy.romFolders({ remove: b.dataset.romrm }); renderRomLibrary(); };
$("romScan").onclick = async () => {
  $("romScan").disabled = true; $("romCancel").hidden = false; $("romState").textContent = "Scanning…";
  try { const r = await window.buddy.romScan(); $("romState").textContent = `${r.total} file(s) indexed, ${r.hashed} new${r.cancelled ? " - stopped early" : ""}.`; }
  catch (err) { $("romState").textContent = err.message.replace(/^.*Error: /, ""); }
  finally { renderRomLibrary(); }
};
$("romCancel").onclick = () => window.buddy.romCancel();
window.buddy.onRomProgress((p) => { $("romState").textContent = `Scanning… ${p.done} of ${p.total} (${p.file})`; });
$("datAdd").onclick = async () => { const r = await window.buddy.datAdd(); const bad = r.filter((x) => x.error); $("datState").textContent = r.length ? `${r.length - bad.length} added${bad.length ? `; ${bad.map((x) => x.error).join("; ")}` : ""}.` : ""; renderRomLibrary(); };
$("datList").onclick = async (e) => { const b = e.target.closest("[data-datrm]"); if (!b) return; await window.buddy.datRemove(b.dataset.datrm); renderRomLibrary(); };
let drives = [];
async function openMods(g) {
  modsGame = g; $("modsPanel").hidden = false; $("modsTitle").textContent = `Mods - ${g.title}`; $("modsState").textContent = ""; $("modsPacks").hidden = true;
  await renderMods();
}
async function renderMods() {
  const g = modsGame; const r = await window.buddy.modsList(g.folder); const m = r.mods || {};
  const links = (m.links || []).map((l) => `<a href="#" data-ext="${esc(l.url)}">${esc(l.label)}</a>`).join(" · ");
  $("modsHow").innerHTML = (m.supported ? METHOD_TEXT[m.method || "unknown"](m) : "The project's docs don't mention mods or texture packs. You can still keep files here.") + (m.formats?.length ? ` Formats: ${esc(m.formats.join(", "))}.` : "") + (m.notes ? `<br><em>${esc(m.notes)}</em>` : "") + (links ? `<br>${links}` : "");
  $("modsHow").querySelectorAll("[data-ext]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.buddy.openExternal(a.dataset.ext); }));
  $("modsPackBtn").hidden = !r.texturesUrl; $("modsPackBtn").dataset.url = r.texturesUrl || "";
  $("modsList").innerHTML = r.items.length ? r.items.map((it) => `<div class="srcRow"><span>${it.enabled === null ? "" : `<input type="checkbox" data-mod="${esc(it.name)}" ${it.enabled ? "checked" : ""} aria-label="Enable ${esc(it.name)}">`}</span><div class="lab">${esc(it.name)}</div><span class="sub">${it.enabled === true ? "enabled" : it.enabled === false ? "disabled" : "in Decomp Buddy Mods"}</span></div>`).join("") : `<p class="sub">No mod files yet.</p>`;
  renderModsExtras(r);
}
$("modsClose").onclick = () => { $("modsPanel").hidden = true; };
$("modsAddBtn").onclick = async () => { const added = await window.buddy.modsAdd(modsGame.folder); if (added.length) { $("modsState").textContent = `Added ${added.length} file(s).`; $("modsState").className = "status ok"; } await renderMods(); };
$("modsList").onclick = async (e) => { const c = e.target.closest("[data-mod]"); if (!c) return; try { await window.buddy.modsToggle(modsGame.folder, c.dataset.mod, c.checked); } catch (err) { $("modsState").textContent = err.message.replace(/^.*Error: /, ""); $("modsState").className = "status bad"; } await renderMods(); };
$("modsPackBtn").onclick = async () => {
  const url = $("modsPackBtn").dataset.url; $("modsPacks").hidden = false; $("modsPacks").innerHTML = `<p class="sub">Looking for downloads on that page…</p>`;
  try {
    const links = await window.buddy.modsPackLinks(url);
    $("modsPacks").innerHTML = (links.length ? links.map((l) => `<div class="srcRow"><span></span><div class="lab">${esc(l.name)}</div><button class="small primary" type="button" data-pack="${esc(l.url)}">Download</button></div>`).join("") : `<p class="sub">No direct downloads found on that page.</p>`) + `<div class="srcRow"><span></span><div class="u">${esc(url)}</div><button class="small" type="button" data-ext="${esc(url)}">Open Page</button></div>`;
    $("modsPacks").querySelectorAll("[data-ext]").forEach((b) => (b.onclick = () => window.buddy.openExternal(b.dataset.ext)));
  } catch (err) { $("modsPacks").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
};
$("modsPacks").onclick = async (e) => { const b = e.target.closest("[data-pack]"); if (!b) return; b.disabled = true; $("modsState").textContent = "Downloading…"; $("modsState").className = "status"; try { await window.buddy.modsDownload(modsGame.folder, b.dataset.pack, $("modsPackBtn").dataset.url); $("modsState").textContent = "Downloaded into Decomp Buddy Mods/downloads."; $("modsState").className = "status ok"; await renderMods(); } catch (err) { $("modsState").textContent = err.message.replace(/^.*Error: /, ""); $("modsState").className = "status bad"; } finally { b.disabled = false; } };
$("buildClose").onclick = () => { $("buildPanel").hidden = true; };
// ---- LAN transfer UI
$("libReceive").onclick = async () => {
  try { const r = await window.buddy.transferReceive(); $("txPanel").hidden = false; $("txReceive").hidden = false; $("txSend").hidden = true; $("txAddr").textContent = r.addresses.map((a) => `${a}:${r.port}`).join("  or  "); $("txCode").textContent = r.code; $("txState").textContent = "Waiting…"; $("txState").className = "status"; }
  catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
};
$("txStopRx").onclick = async () => { await window.buddy.transferStop(); $("txPanel").hidden = true; };
window.buddy.onReceived(() => { $("txState").textContent = "Received - it's in Installed Games now."; $("txState").className = "status ok"; renderLibrary(); });
const txSelected = new Set();
$("libSend").onclick = () => {
  $("txPanel").hidden = false; $("txSend").hidden = false; $("txReceive").hidden = true; txSelected.clear();
  $("txList").innerHTML = library.map((g) => `<div class="srcRow"><input type="checkbox" data-tx="${esc(g.key)}" aria-label="Send ${esc(g.title)}"><div><div class="lab">${esc(g.title)}</div><div class="u">${esc(g.folder)}</div></div><span class="sub">${esc(TARGET_LABEL[g.target] || g.target)}</span></div>`).join("") || `<p class="sub">Nothing to send.</p>`;
  $("txPick").textContent = "0 selected";
};
$("txList").onclick = (e) => { const c = e.target.closest("[data-tx]"); if (!c) return; c.checked ? txSelected.add(c.dataset.tx) : txSelected.delete(c.dataset.tx); $("txPick").textContent = `${txSelected.size} selected`; };
$("txCancel").onclick = () => { $("txPanel").hidden = true; };
$("txGo").onclick = async () => {
  const [host, port] = $("txHost").value.trim().split(":"); const code = $("txPin").value.trim();
  if (!host || !port || !/^\d{6}$/.test(code)) { $("txState").textContent = "Enter address:port and the 6-digit code shown on the other computer."; $("txState").className = "status bad"; return; }
  const folders = library.filter((g) => txSelected.has(g.key)).map((g) => g.folder);
  if (!folders.length) { $("txState").textContent = "Tick at least one game."; $("txState").className = "status bad"; return; }
  $("txGo").disabled = true; $("txState").textContent = "Sending…"; $("txState").className = "status";
  try { const sent = await window.buddy.transferSend({ folders, host, port: Number(port), code }); $("txState").textContent = `Sent ${sent.length} game(s): ${sent.join(", ")}.`; $("txState").className = "status ok"; }
  catch (err) { $("txState").textContent = err.message.replace(/^.*Error: /, ""); $("txState").className = "status bad"; }
  finally { $("txGo").disabled = false; }
};
$("shelves").onclick = async (e) => {
  const b = e.target.closest("[data-lib]"); if (!b) return;
  const bookEl = b.closest(".book");
  const g = library.find((x) => x.key === bookEl.dataset.key);
  const wg = bookEl.dataset.wish && catalog.games.find((x) => x.id === bookEl.dataset.wish);
  try {
    if (b.dataset.lib === "play") { const r = await window.buddy.gamePlay(g.folder); $("libStatus").textContent = `Launched ${r.exe.split(/[\\/]/).pop()}.`; $("libStatus").className = "status ok"; }
    else if (b.dataset.lib === "steam") { const r = await window.buddy.gameSteam(g.folder); $("libStatus").textContent = `${r.updated ? "Updated in" : "Added to"} Steam (restart Steam to see it).`; $("libStatus").className = "status ok"; renderLibrary(); }
    else if (b.dataset.lib === "open") window.buddy.open(g.folder);
    else if (b.dataset.lib === "saves") await openSaves(g);
    else if (b.dataset.lib === "versions") await openVersions(g);
    else if (b.dataset.lib === "config") await openConfig(g);
    else if (b.dataset.lib === "build") await startBuild(g);
    else if (b.dataset.lib === "mods") await openMods(g);
    else if (b.dataset.lib === "more") await openMore(g);
    else if (b.dataset.lib === "update") { const c = catalog.games.find((c) => c.owner && `${c.owner}/${c.repo}`.toLowerCase() === g.repo.toLowerCase()); if (c) addToLinks([c.id], { andRead: true }); }
    else if (b.dataset.lib === "detail") { const c = catalog.games.find((c) => c.owner && `${c.owner}/${c.repo}`.toLowerCase() === g.repo.toLowerCase()); showDetail(c || { title: g.title, console: g.console, repoUrl: g.repoUrl, owner: g.repo.split("/")[0], repo: g.repo.split("/")[1], platforms: [], sources: [] }); }
    else if (b.dataset.lib === "addwish") addToLinks([wg.id]);
    else if (b.dataset.lib === "detailwish") showDetail(wg);
  } catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
};

// ---------- Game detail ----------
let detailGame = null, detailReturn = "browse";
async function showDetail(g) {
  if (!g) return;
  detailGame = g; const from = document.querySelector("main > section.view.active").dataset.view; detailReturn = ["library", "new", "foryou"].includes(from) ? from : "browse";
  showView("detail");
  const icon = iconCache.get(g.id);
  $("detailCover").innerHTML = typeof icon === "string" && icon !== "pending" ? `<img src="${icon}" alt="">` : "";
  if (icon === undefined && g.id) window.buddy.catalogIcon(g.id).then((r) => { if (r) { iconCache.set(g.id, r.dataUrl); $("detailCover").innerHTML = `<img src="${r.dataUrl}" alt="">`; } });
  $("detailTitle").textContent = g.title;
  $("detailMeta").textContent = [g.console, g.project, g.version ? `Version ${g.version}` : "", g.status === "latest" ? "Latest" : g.status === "prerelease" ? "Pre-release" : "", g.updatedAt ? `Updated ${fmtDate(g.updatedAt)}` : "", g.platforms?.length ? g.platforms.join(" · ") : ""].filter(Boolean).join(" · ");
  // What the tiles leave out: where it's listed, how it was read, and the disc details verification uses.
  const srcs = (g.sources || [g.source]).filter(Boolean).map((id) => catalog.perSource?.[id]?.label || id);
  $("detailMore").textContent = [srcs.length && `Listed on ${srcs.join(", ")}`, g.repoGames && `One of ${g.repoGames} games in this repository`, g.aiAssisted && "AI-assisted", g.region, g.serial && `Disc serial ${g.serial}`, g.bios && `BIOS ${g.bios}`, g.discs > 1 && `${g.discs} discs`].filter(Boolean).join(" · ");
  $("detailFacts").innerHTML = factsBlock(g); $("detailSince").innerHTML = "";
  renderFunding(g);
  const ports = otherPorts(g);
  $("detailPorts").innerHTML = ports.length ? `<h3 style="margin:16px 0 6px">Other Ports Of This Game</h3>${ports.map((p) => `<div class="srcRow"><span></span><div><div class="lab"><a href="#" data-portid="${esc(p.id)}">${esc(p.project || p.repo)}</a> <span class="sub">${esc([p.owner, p.platforms.join(" · ") || "no builds", p.version && `Version ${p.version}`, p.updatedAt && `Updated ${fmtDate(p.updatedAt)}`, p.facts?.completeness && COMPLETE[p.facts.completeness]].filter(Boolean).join(" · "))}</span></div></div></div>`).join("")}` : "";
  $("detailDesc").textContent = ""; $("detailShots").innerHTML = ""; $("detailReleases").innerHTML = ""; $("detailReadme").innerHTML = `<p class="sub">Loading…</p>`;
  const inst = installedFor(g), upd = updateAvailable(g, inst);
  $("detailActions").innerHTML = [
    g.repoUrl ? `<button type="button" data-det="repo">Repository</button>` : "",
    g.website ? `<button type="button" data-det="site">Website</button>` : "",
    `<button type="button" data-det="wish">${isWished(g) ? "★ Wishlisted" : "☆ Wishlist"}</button>`,
    inst ? (upd ? `<button class="primary" type="button" data-det="update">Update to ${esc(g.version)}</button>` : `<span class="badge inst">Installed</span>`) : g.repoUrl ? `<button class="primary" type="button" data-det="add">Add To Links</button>` : "",
  ].join("");
  if (!g.owner) { $("detailReadme").innerHTML = `<p class="sub">No repository to read.</p>`; return; }
  try {
    const d = await window.buddy.gameDetail(g.owner, g.repo, g.repoHost);
    if (detailGame !== g) return;
    $("detailDesc").textContent = [d.description, d.stars ? `★ ${d.stars}` : "", d.archived ? "Archived repository" : ""].filter(Boolean).join(" · ");
    $("detailShots").innerHTML = d.screenshots.map((u) => `<img src="${esc(u)}" alt="Screenshot">`).join("");
    if (upd && inst) {
      // What changed between the installed version and the new one, before you update.
      const mine = inst.map((i) => i.tag).filter((t) => t !== g.version); // the copies that are behind
      const cut = d.releases.findIndex((r) => mine.includes(r.tag));
      const newer = cut < 0 ? d.releases.slice(0, 5) : d.releases.slice(0, cut);
      $("detailSince").innerHTML = `<h3 style="margin:16px 0 6px">What's New Since ${esc(mine.join(", "))} (Yours)</h3>${cut < 0 ? `<p class="sub">Your version isn't among the last ${d.releases.length} releases; here are the newest.</p>` : ""}${newer.map((r) => `<div class="relnotes"><h4>${esc(r.name)} <span class="sub">· ${esc(fmtDate(r.at))}</span></h4>${r.notes || `<p class="sub">No notes.</p>`}</div>`).join("")}`;
    }
    const recent = d.releases.slice(0, 3);
    $("detailReleases").innerHTML = recent.length ? recent.map((r) => `<div class="relnotes"><h4>${esc(r.name)} <span class="sub">· ${esc(fmtDate(r.at))}${r.prerelease ? " · pre-release" : ""}</span></h4>${r.notes || `<p class="sub">No notes.</p>`}</div>`).join("") : `<p class="sub">No releases.</p>`;
    $("detailReadme").innerHTML = d.readme || `<p class="sub">No README.</p>`;
  } catch (err) { $("detailReadme").innerHTML = `<p class="sub">Couldn't load: ${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
}
$("detailBack").onclick = () => showView(detailReturn);
$("detailPorts").onclick = (e) => { const a = e.target.closest("[data-portid]"); if (!a) return; e.preventDefault(); showDetail(catalog.games.find((x) => x.id === a.dataset.portid)); };

// ---------- Facts (from published plans) and other ports ----------
const COMPLETE = { playable: "Playable Start To Finish", mostly: "Mostly Playable", partial: "Partly Playable", wip: "Not Playable Yet" };
const DECK = { verified: "Steam Deck Verified", works: "Runs On Steam Deck" };
function healthNotes(f) {
  const h = f?.health || {}; const out = [];
  if (h.archived) out.push(["warn", "Archived", "The author archived this repository - no more updates."]);
  if (h.dmca) out.push(["warn", "Takedown Notice", "The README or description mentions a takedown or legal notice."]);
  const quiet = h.pushedAt && (Date.now() - Date.parse(h.pushedAt)) / 86400000;
  if (!h.archived && quiet > 730) out.push(["muted", `Quiet Since ${new Date(h.pushedAt).getUTCFullYear()}`, `No commits since ${fmtDate(h.pushedAt)}.`]);
  return out;
}
function factsBlock(g) {
  const f = g.facts; if (!f) return "";
  const rows = [
    COMPLETE[f.completeness] && [COMPLETE[f.completeness], f.completeness_quote, true],
    DECK[f.steam_deck] && [DECK[f.steam_deck], f.deck_quote, true],
    ...healthNotes(f).map(([, label, why]) => [label, why, false]),
    f.save_paths?.length && ["Saves", f.save_paths.map((p) => `${p.platform === "any" ? "" : p.platform + ": "}${p.path}`).join(" · "), false],
    f.controller_notes?.length && ["Controllers", f.controller_notes.join(" · "), true],
  ].filter(Boolean);
  return rows.length ? `<hr class="sep"><h3 style="margin:0 0 6px">At A Glance</h3><dl class="facts">${rows.map(([k, v, q]) => `<dt>${esc(k)}</dt><dd>${v ? (q ? `“${esc(v)}”` : esc(v)) : ""}</dd>`).join("")}</dl>` : "";
}
let portsIndex = null, portsFor = null;
function otherPorts(g) {
  if (portsFor !== catalog.games) {
    portsFor = catalog.games; portsIndex = new Map();
    for (const x of catalog.games) { const k = `${normTitle(x.title)}|${x.console}`; portsIndex.set(k, [...(portsIndex.get(k) || []), x]); }
  }
  return (portsIndex.get(`${normTitle(g.title)}|${g.console}`) || []).filter((x) => x.id !== g.id && `${x.owner}/${x.repo}` !== `${g.owner}/${g.repo}`);
}
$("detailActions").onclick = (e) => {
  const b = e.target.closest("[data-det]"); if (!b || !detailGame) return;
  if (b.dataset.det === "repo") window.buddy.openExternal(detailGame.repoUrl);
  if (b.dataset.det === "site") window.buddy.openExternal(detailGame.website);
  if (b.dataset.det === "wish") toggleWish(detailGame).then(() => showDetail(detailGame));
  if (b.dataset.det === "add" || b.dataset.det === "update") addToLinks([detailGame.id], { andRead: b.dataset.det === "update" });
};
document.getElementById("detail").addEventListener("click", (e) => { const a = e.target.closest("a[data-ext]"); if (a) { e.preventDefault(); window.buddy.openExternal(a.href); } });

// ---------- Library folders (Settings) ----------
function renderLibFolders() {
  const f = settings.libraryFolders || [];
  $("libFolders").innerHTML = f.length ? f.map((d, i) => `<div class="srcRow"><span></span><div class="u" style="font-size:13px">${esc(d)}</div><button class="small" type="button" data-libfolder="${i}">Remove</button></div>`).join("") : `<p class="sub">None added.</p>`;
}
$("libFolderAdd").onclick = async () => { const d = await window.buddy.chooseFolder(); if (!d) return; await window.buddy.setSettings({ libraryFolders: [...(settings.libraryFolders || []), d] }); await refresh(); };
$("libFolders").onclick = async (e) => { const b = e.target.closest("[data-libfolder]"); if (!b) return; const f = [...(settings.libraryFolders || [])]; f.splice(Number(b.dataset.libfolder), 1); await window.buddy.setSettings({ libraryFolders: f }); await refresh(); };

// ---------- BIOS vault ----------
function renderVault() {
  const v = settings.vault || [];
  $("vaultList").innerHTML = v.length ? v.map((e) => `<div class="srcRow"><span></span><div><div class="lab">${esc(e.identity)}</div><div class="u">${esc(e.file)} · ${esc(String(e.size))} bytes</div></div><button class="small" type="button" data-vault="${esc(e.id)}">Remove</button></div>`).join("") : `<p class="sub">Empty. Add a BIOS file and it's verified before it's kept.</p>`;
}
$("vaultAdd").onclick = async () => {
  try { const r = await window.buddy.vaultAdd(); if (!r) return; $("vaultState").textContent = `Kept: ${r.identity}`; $("vaultState").className = "sub ok"; await refresh(); }
  catch (err) { $("vaultState").textContent = err.message.replace(/^.*Error: /, ""); $("vaultState").className = "sub bad"; }
};
$("vaultList").onclick = async (e) => { const b = e.target.closest("[data-vault]"); if (!b) return; await window.buddy.vaultRemove(b.dataset.vault); await refresh(); };

// ---------- Catalog sources ----------
function renderSources() {
  const b = settings.sources?.builtin || [], c = settings.sources?.custom || [], sh = settings.sources?.shared || [];
  $("srcList").innerHTML = b.map((x) => `<div class="srcRow"><input type="checkbox" data-src="builtin" data-id="${esc(x.id)}" ${x.enabled ? "checked" : ""} aria-label="Enable ${esc(x.label)}"><div><div class="lab">${esc(x.label)}</div><div class="u">${esc(x.url)}</div></div><span class="sub">built in</span></div>`).join("")
    + sh.map((x) => `<div class="srcRow"><input type="checkbox" data-src="shared" data-key="${esc(x.key)}" ${x.enabled ? "checked" : ""} aria-label="Enable ${esc(x.value)}"><div><div class="lab">${esc(x.label || x.value)}</div><div class="u">${x.type === "list" ? esc(x.value) : `github.com/${esc(x.value)}`}</div></div><span class="sub">shared</span></div>`).join("")
    + c.map((x, i) => `<div class="srcRow"><input type="checkbox" data-src="custom" data-i="${i}" ${x.enabled !== false ? "checked" : ""} aria-label="Enable ${esc(x.value)}"><div><div class="lab">${esc(x.value)}</div><div class="u">${x.type === "list" ? "page or file with repo links" : "GitHub user / org"}</div></div><button class="small" type="button" data-src="remove" data-i="${i}">Remove</button></div>`).join("");
}
async function saveSources(mutate) {
  const cfg = { builtin: Object.fromEntries((settings.sources?.builtin || []).map((x) => [x.id, x.enabled])), disabledShared: Object.fromEntries((settings.sources?.shared || []).filter((x) => !x.enabled).map((x) => [x.key, true])), custom: [...(settings.sources?.custom || [])] };
  mutate(cfg);
  try { await window.buddy.setSettings({ sources: cfg }); }
  catch (err) { status(err.message.replace(/^.*Error: /, ""), "bad"); $("srcValue").focus(); return; }
  await refresh();
  catalog = { games: [], installed: {}, fetchedAt: null, stale: false, error: null }; // force a reload next time Browse opens
}
$("srcList").onclick = (e) => {
  const t = e.target.closest("[data-src]"); if (!t) return;
  if (t.dataset.src === "remove") return saveSources((cfg) => cfg.custom.splice(Number(t.dataset.i), 1));
  if (t.dataset.src === "builtin") return saveSources((cfg) => { cfg.builtin[t.dataset.id] = t.checked; });
  if (t.dataset.src === "shared") return saveSources((cfg) => { if (t.checked) delete cfg.disabledShared[t.dataset.key]; else cfg.disabledShared[t.dataset.key] = true; });
  if (t.dataset.src === "custom") return saveSources((cfg) => { cfg.custom[Number(t.dataset.i)].enabled = t.checked; });
};
$("srcAdd").onclick = async () => {
  const value = $("srcValue").value.trim(); if (!value) return;
  const type = $("srcType").value;
  await saveSources((cfg) => cfg.custom.push({ type, value, enabled: true }));
  if (!$("status").classList.contains("bad")) $("srcValue").value = "";
};

// ---------- Individual Finds: suggest (everyone) + admin ----------
$("addGameBtn").onclick = () => { $("addGame").hidden = !$("addGame").hidden; if (!$("addGame").hidden) $("agRepo").focus(); };
$("agCancel").onclick = () => { $("addGame").hidden = true; };
$("agSave").onclick = async () => {
  const repo = $("agRepo").value.trim(); if (!repo) return;
  $("agSave").disabled = true;
  try {
    const note = $("agNotes").value;
    await window.buddy.findsAdd({ repo, title: $("agTitle").value, console: $("agConsole").value, notes: note });
    const sent = settings.admin ? null : await window.buddy.suggestSend(repo, [$("agTitle").value, $("agConsole").value, note].filter(Boolean).join(" · ")).catch(() => ({ sent: false }));
    for (const id of ["agRepo", "agTitle", "agConsole", "agNotes"]) $(id).value = "";
    $("addGame").hidden = true;
    await refresh();
    await loadCatalog({ refresh: true });
    $("catalogStatus").textContent = `Added. It's in the list under its console (or Unknown until it's read).${sent ? (sent.sent ? " Sent to Maddie too." : " Couldn't reach the site - it'll be sent to Maddie next time you open the app.") : ""}`; $("catalogStatus").className = "status ok";
  } catch (err) { $("catalogStatus").textContent = err.message.replace(/^.*Error: /, ""); $("catalogStatus").className = "status bad"; }
  finally { $("agSave").disabled = false; }
};

function renderFinds() {
  $("adminNav").hidden = $("adminSep").hidden = !settings.admin;
  $("findsFile").value = settings.findsFile || "";
  const list = settings.localFinds || [];
  $("adPending").innerHTML = list.length
    ? list.map((p) => `<div class="srcRow"><span></span><div><div class="lab">${esc(p.title)} <span class="sub">· ${esc(p.console)}</span></div><div class="u">${esc(p.repo)}${p.notes ? ` — ${esc(p.notes)}` : ""}</div></div><button class="small" type="button" data-find="${esc(p.repo)}">Remove</button></div>`).join("")
    : `<p class="sub">Nothing pending.</p>`;
}
function renderSharedAdmin() {
  const pend = settings.sources?.pendingShared || [], pub = settings.sources?.shared || [];
  const row = (x, btn) => `<div class="srcRow"><span></span><div><div class="lab">${esc(x.label || x.value)}</div><div class="u">${x.type === "list" ? esc(x.value) : `github.com/${esc(x.value)}`}</div></div>${btn}</div>`;
  $("adSrcPending").innerHTML = pend.length ? pend.map((x) => row(x, `<button class="small" type="button" data-srcpend="${esc(`${x.type}:${x.value.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").toLowerCase()}`)}">Remove</button>`)).join("") : `<p class="sub">Nothing pending.</p>`;
  $("adSrcPublished").innerHTML = pub.length ? pub.map((x) => row(x, `<button class="small" type="button" data-srcpub="${esc(x.key)}">Remove</button>`)).join("") : `<p class="sub">None published yet.</p>`;
}
$("adSrcAdd").onclick = async () => {
  try { await window.buddy.sourcesAddShared({ type: $("adSrcType").value, value: $("adSrcValue").value, label: "" }); $("adSrcValue").value = ""; await refresh(); $("findsState").textContent = "Source added to pending. Publish when ready."; $("findsState").className = "status ok"; }
  catch (err) { $("findsState").textContent = err.message.replace(/^.*Error: /, ""); $("findsState").className = "status bad"; }
};
$("adSrcPending").onclick = async (e) => { const b = e.target.closest("[data-srcpend]"); if (!b) return; await window.buddy.sourcesRemovePending(b.dataset.srcpend); await refresh(); };
$("adSrcPublished").onclick = async (e) => { const b = e.target.closest("[data-srcpub]"); if (!b) return; await window.buddy.sourcesUnpublish(b.dataset.srcpub); await refresh(); catalog.games = []; };

// ---------- Discover ----------
let discoverTimer = null;
let discoverAllList = [];
function renderDiscover(all, at) {
  discoverAllList = all;
  const list = $("discoverAll").checked ? all : all.filter((c) => c.via !== "GitHub search" || (c.stars || 0) >= 10);
  $("discoverMeta").textContent = at ? `· last scan ${new Date(at).toLocaleTimeString()} · ${list.length} shown of ${all.length}` : "";
  $("adminBadge").hidden = !list.length; $("adminBadge").textContent = list.length;
  $("discoverList").innerHTML = list.length ? list.map((c) => `<div class="srcRow" data-row="${esc(c.repo)}"><span></span><div><div class="lab">${esc(c.repo)}${c.stars ? ` <span class="sub">★ ${c.stars}</span>` : ""}</div><div class="u wrap">${esc(c.title || "")} — via ${esc(c.via)}${c.seen ? ` · ${esc(fmtDate(c.seen))}` : ""}</div><div class="row-state status" role="status" aria-live="polite"></div></div><div class="row-acts"><button class="small primary" type="button" data-disc="add" data-repo="${esc(c.repo)}" aria-label="Add ${esc(c.repo)}">Add</button><button class="small" type="button" data-disc="dismiss" data-repo="${esc(c.repo)}" aria-label="Dismiss ${esc(c.repo)}">Dismiss</button><button class="small" type="button" data-cat="ext" data-url="${esc(c.url)}" aria-label="Open ${esc(c.repo)} on GitHub">Open</button></div></div>`).join("") : `<p class="sub">Nothing new. Scan Now to look again.</p>`;
}
async function discoverScan({ quiet } = {}) {
  if (!quiet) { $("discoverScan").disabled = true; $("discoverMeta").textContent = "· scanning…"; }
  try { const r = await window.buddy.discoverScan(); renderDiscover(r.candidates, r.at); if (r.errors.length && !quiet) { $("findsState").textContent = r.errors.join("; "); $("findsState").className = "status bad"; } }
  catch (err) { if (!quiet) { $("findsState").textContent = err.message.replace(/^.*Error: /, ""); $("findsState").className = "status bad"; } }
  finally { $("discoverScan").disabled = false; }
}
$("discoverScan").onclick = () => discoverScan();
$("discSave").onclick = async () => { await window.buddy.setSettings({ discoverSubs: $("discSubs").value.split(","), discoverChannels: $("discChannels").value.split(",") }); await refresh(); $("findsState").textContent = "Feeds saved."; $("findsState").className = "status ok"; };
$("discoverAll").onchange = () => renderDiscover(discoverAllList, settings.lastDiscover);
$("discoverList").onclick = async (e) => {
  const ext = e.target.closest("[data-cat=ext]"); if (ext) { e.preventDefault(); return window.buddy.openExternal(ext.dataset.url); }
  const b = e.target.closest("[data-disc]"); if (!b) return;
  // Say right away that the click landed (Add reads the repo from GitHub first, which takes a moment).
  const row = b.closest(".srcRow"), state = row?.querySelector(".row-state");
  row?.querySelectorAll("button").forEach((x) => (x.disabled = true));
  if (state) { state.textContent = b.dataset.disc === "dismiss" ? "Dismissing…" : "Adding - reading the repo…"; state.className = ["row-state", "status"].join(" "); }
  if (b.dataset.disc === "dismiss") await window.buddy.discoverDismiss(b.dataset.repo);
  else {
    try { await window.buddy.findsAdd({ repo: b.dataset.repo, via: `Discover: ${discoverAllList.find((c) => c.repo === b.dataset.repo)?.via || "scan"}` }); await window.buddy.discoverForget(b.dataset.repo); await refresh(); catalog.games = []; $("findsState").textContent = `${b.dataset.repo} added to Pending.`; $("findsState").className = "status ok"; }
    catch (err) {
      const why = err.message.replace(/^.*Error: /, "");
      $("findsState").textContent = why; $("findsState").className = "status bad";
      if (/already/.test(err.message)) await window.buddy.discoverForget(b.dataset.repo);
      else if (state) { state.textContent = why; state.className = ["row-state", "status", "bad"].join(" "); row.querySelectorAll("button").forEach((x) => (x.disabled = false)); return; }
    }
  }
  const l = await window.buddy.discoverList(); renderDiscover(l.candidates, l.at);
};
function discoverSchedule() {
  clearInterval(discoverTimer); discoverTimer = null;
  if (!settings.admin) return;
  window.buddy.discoverList().then((l) => renderDiscover(l.candidates, l.at));
  discoverTimer = setInterval(() => discoverScan({ quiet: true }), 60 * 60 * 1000);
}

async function renderPublished() {
  const pub = await window.buddy.findsPublished();
  $("adPublishedFrom").textContent = pub.from ? `· ${pub.games.length} game(s) · ${pub.from}` : "· nothing published yet";
  $("adPublished").innerHTML = pub.games.length
    ? pub.games.map((p) => `<div class="srcRow"><span></span><div><div class="lab">${esc(p.title || p.repo)} <span class="sub">· ${esc(p.console || "Unknown")}</span></div><div class="u">${esc(p.repo)}${p.notes ? ` — ${esc(p.notes)}` : ""}</div></div><button class="small" type="button" data-unfind="${esc(p.repo)}">Remove</button></div>`).join("")
    : `<p class="sub">Empty.</p>`;
}
$("adAdd").onclick = async () => {
  const repo = $("adRepo").value.trim(); if (!repo) return;
  $("adAdd").disabled = true;
  try {
    await window.buddy.findsAdd({ repo, title: $("adTitle").value, console: $("adConsole").value, notes: $("adNotes").value });
    for (const id of ["adRepo", "adTitle", "adConsole", "adNotes"]) $(id).value = "";
    await refresh(); catalog.games = [];
    $("findsState").textContent = "Added to the pending list. Publish when you're ready."; $("findsState").className = "status ok";
  } catch (err) { $("findsState").textContent = err.message.replace(/^.*Error: /, ""); $("findsState").className = "status bad"; }
  finally { $("adAdd").disabled = false; }
};
$("adBulkAdd").onclick = async () => {
  const text = $("adBulk").value; if (!text.trim()) return;
  $("adBulkAdd").disabled = true; $("adBulkState").textContent = "Checking each link with GitHub…";
  try {
    const r = await window.buddy.findsAddMany(text);
    const parts = [`${r.added.length} added`];
    if (r.duplicates.length) parts.push(`${r.duplicates.length} skipped as duplicates (${r.duplicates.map((d) => `${d.repo}: ${d.where}`).join("; ")})`);
    if (r.missing.length) parts.push(`${r.missing.length} not found on GitHub (${r.missing.join(", ")})`);
    $("adBulkState").textContent = parts.join(" · ") + ".";
    $("adBulk").value = [...r.duplicates.map((d) => d.repo), ...r.missing].length ? "" : "";
    await refresh(); catalog.games = [];
  } catch (err) { $("adBulkState").textContent = err.message.replace(/^.*Error: /, ""); }
  finally { $("adBulkAdd").disabled = false; }
};
$("adPending").onclick = async (e) => { const b = e.target.closest("[data-find]"); if (!b) return; await window.buddy.findsRemove(b.dataset.find); await refresh(); catalog.games = []; };
$("adPublished").onclick = async (e) => { const b = e.target.closest("[data-unfind]"); if (!b) return; await window.buddy.findsUnpublish(b.dataset.unfind); await renderPublished(); catalog.games = []; };
$("findsChoose").onclick = async () => { const f = await window.buddy.chooseFile({ title: "Where to write finds.json" }); if (f) { $("findsFile").value = f; await window.buddy.setSettings({ findsFile: f }); } };
async function publishFinds() {
  const file = $("findsFile").value.trim();
  await window.buddy.setSettings({ findsFile: file });
  const r = await window.buddy.findsPublish(file);
  // published now; clear pending so it isn't listed twice
  for (const p of settings.localFinds || []) await window.buddy.findsRemove(p.repo);
  await refresh(); await renderPublished(); catalog.games = [];
  return r;
}
$("adPublish").onclick = async () => {
  try { const r = await publishFinds(); $("findsState").textContent = `Wrote ${r.count} game(s) and ${r.sources} shared source(s). Deploy the site to make them live.`; $("findsState").className = "status ok"; }
  catch (err) { $("findsState").textContent = err.message.replace(/^.*Error: /, ""); $("findsState").className = "status bad"; }
};
$("adDeploy").onclick = async () => {
  $("adDeploy").disabled = true; $("adLog").textContent = "";
  const onLog = (m) => { $("adLog").textContent += m + "\n"; $("adLog").scrollTop = $("adLog").scrollHeight; };
  window.buddy.onLog(onLog);
  try { const r = await publishFinds(); $("findsState").textContent = `Wrote ${r.count} game(s). Deploying the site…`; $("findsState").className = "status"; await window.buddy.findsDeploy(); $("findsState").textContent = "Deployed - live for everyone now."; $("findsState").className = "status ok"; }
  catch (err) { $("findsState").textContent = err.message.replace(/^.*Error: /, ""); $("findsState").className = "status bad"; }
  finally { $("adDeploy").disabled = false; }
};

// ---------- Donation prompt: once at 3, again at 20 and 50 ----------
// Tip nudges: 3, 7, 10, then every 10 to 50, then every 25. Each one gets a different message.
const NUDGE_AT = [3, 7, 10, 20, 30, 40, 50];
const nudgeMark = (count) => { if (count < 50) return NUDGE_AT.filter((n) => count >= n).pop() || 0; return 50 + Math.floor((count - 50) / 25) * 25; };
const NUDGE_LINES = [
  ["Three games in. How's the evening going?", "Every plan you just used was generated once, with Maddie's AI key, so you never need one. It's a few cents a game. If Decomp Buddy saved you a night of forum-reading, a tip keeps the lights on."],
  ["Seven games. That's a lot of childhood.", "Still free, still no account, still nothing phoning home. The plans do cost real money to make, though. A tip covers the next batch and Maddie's coffee, in that order."],
  ["Ten. Double digits. Respectable.", "Fun fact: ten games is more than most people ever set up, and you did it without touching a config file. If that felt good, the tip jar is one click away. If it didn't, tell Maddie what broke."],
  ["Twenty games. Do you own a shelf that big?", "By now the app has quietly saved you a weekend. Maddie's not asking for a subscription, a login, or your email. Just a tip, if you feel like it. Or don't. It works either way."],
  ["Thirty. At this point you're a collector.", "The whole catalog was planned once so nobody pays per game. That 'once' gets redone every time a project updates, and projects update constantly. A tip helps keep the plans fresh."],
  ["Forty games. The Steam library must be terrifying.", "Decomp Buddy has no investors, no ads, and no plan to get any. It has a tip page. You can probably see where this is going."],
  ["Fifty. Half a hundred. Honestly, wow.", "You've now used more AI plans than most people generate in a year of trying. If you've got fifty games' worth of fun out of this, a tip for the person who made it is a fair trade. No pressure, no lock-out, ever."],
  ["Still here? Still free.", "Every 25 games, one small reminder: this costs money to run and asks for nothing back. A tip goes a long way. Maybe Later works as many times as you need it to."],
  ["Another 25 down.", "Maddie makes apps alone, for one person at a time, and this is one of the ones she's proudest of. If it's earned a tip, the button is right there. If not, keep playing."],
];
function maybeNudge(count, nudged) {
  const mark = nudgeMark(count);
  if (!mark || nudged.includes(mark)) return;
  showNudge(count, NUDGE_AT.indexOf(mark) >= 0 ? NUDGE_AT.indexOf(mark) : 7 + ((mark - 75) / 25) % 2);
  window.buddy.setSettings({ nudgedAt: [...nudged, mark] }); settings.nudgedAt = [...nudged, mark];
}
// Dialog behaviour: Escape closes, Tab stays inside, everything behind is inert while it's open.
function closeNudge() { $("nudge").hidden = true; for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = false; nudgeReturnFocus?.focus?.(); }
let nudgeReturnFocus = null;
$("nudge").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); closeNudge(); return; }
  if (e.key !== "Tab") return;
  const f = [...$("nudge").querySelectorAll("button")]; const i = f.indexOf(document.activeElement);
  e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
});
function showNudge(count, idx = 0) {
  const [title, body] = NUDGE_LINES[Math.max(0, Math.min(idx, NUDGE_LINES.length - 1))];
  $("nudgeTitle").textContent = title; $("nudgeBody").textContent = body; $("nudgeCount").textContent = `${count} set up`;
  nudgeReturnFocus = document.activeElement;
  for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = true;
  $("nudge").hidden = false; $("nudgeLater").focus();
}
$("nudgeTip").onclick = () => { window.buddy.openExternal("https://tanookistudios.com/SupportMe"); closeNudge(); };
$("nudgeLater").onclick = () => closeNudge();
// Admin preview cycles through every message so each one can be read.
let nudgePreview = 0;
$("nudgeTest").onclick = () => { const marks = [...NUDGE_AT, 75, 100]; showNudge(marks[nudgePreview], nudgePreview); $("nudgeCount").textContent += ` · message ${nudgePreview + 1} of ${NUDGE_LINES.length}`; nudgePreview = (nudgePreview + 1) % NUDGE_LINES.length; };

// ---------- Published plans (admin) ----------
const SPARK = "▁▂▃▄▅▆▇█";
const spark = (xs) => { if (!xs.length) return ""; const lo = Math.min(...xs), hi = Math.max(...xs); return xs.map((x) => SPARK[hi === lo ? 3 : Math.round(((x - lo) / (hi - lo)) * 7)]).join(""); };
async function renderStats() {
  const st = await window.buddy.stats();
  const rows = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") || "none yet";
  const last = st.catalog.at(-1), first = st.catalog[0], lastPlans = st.plans.at(-1);
  $("statsBody").innerHTML = `<dl class="facts">
    <dt>Catalog</dt><dd>${last ? `${last.games} games today${first && first.day !== last.day ? `, ${first.games} on ${esc(first.day)}` : ""} <span aria-hidden="true">${spark(st.catalog.slice(-30).map((c) => c.games))}</span>` : "no samples yet"}</dd>
    <dt>Published Plans</dt><dd>${lastPlans ? `${lastPlans.published} of ${lastPlans.total} <span aria-hidden="true">${spark(st.plans.slice(-30).map((p) => p.published))}</span>` : "no samples yet"}</dd>
    <dt>Set-Ups</dt><dd>${st.setupCount} done · ${st.installs.games} in your library (${rows(st.installs.byTarget)})</dd>
    <dt>Game Files</dt><dd>${rows(st.verification)}</dd>
    <dt>Pending Finds</dt><dd>${st.finds.pending} (${rows(st.finds.byVia)})</dd>
    <dt>Discover</dt><dd>${st.discover.waiting} waiting · ${st.discover.dismissed} dismissed</dd></dl>`;
}
$("exportSetup").onclick = async () => { const r = await window.buddy.exportSetup().catch((e) => ({ err: e.message })); if (!r) return; $("setupFileState").textContent = r.err ? r.err.replace(/^.*Error: /, "") : `Saved ${r.file} (${r.finds} pending finds, ${r.games} games listed).`; $("setupFileState").className = r.err ? "status bad" : "status ok"; };
$("importSetup").onclick = async () => {
  const r = await window.buddy.importSetup().catch((e) => ({ err: e.message })); if (!r) return;
  if (r.err) { $("setupFileState").textContent = r.err.replace(/^.*Error: /, ""); $("setupFileState").className = "status bad"; return; }
  const got = Object.entries(r.added).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(", ");
  $("setupFileState").textContent = `Imported: ${got || "nothing new"}${r.filled.length ? `; filled in ${r.filled.join(", ")}` : ""}. The other computer had ${r.otherMachineGames} game(s) - set those up again here, your game files carry over.`;
  $("setupFileState").className = "status ok"; await refresh(); catalog.games = [];
};
async function renderSuggestions() {
  try {
    const r = await window.buddy.suggestQueue();
    $("sugKeyRow").hidden = r.hasKey;
    $("sugMeta").textContent = r.hasKey ? `· ${r.suggestions.length} waiting` : "· add the key to read the queue";
    const onCat = (url) => catalog.games.some((g) => g.repoUrl && g.repoUrl.toLowerCase() === url.toLowerCase());
    $("sugList").innerHTML = !r.hasKey ? "" : r.suggestions.length ? r.suggestions.map((x) => `<div class="srcRow"><span></span><div><div class="lab"><a href="#" data-ext="${esc(x.repo_url)}">${esc(x.repo_url.replace(/^https:\/\//, ""))}</a> <span class="sub">${x.votes > 1 ? `· ${x.votes} people` : ""}${onCat(x.repo_url) ? " · already in the catalog" : ""}</span></div>${x.note ? `<div class="u">${esc(x.note)}</div>` : ""}</div><div class="actions"><button class="small primary" type="button" data-sug="approved" data-id="${x.id}" data-repo="${esc(x.repo_url)}">Approve</button><button class="small" type="button" data-sug="have" data-id="${x.id}">Already Have</button><button class="small" type="button" data-sug="rejected" data-id="${x.id}">Reject</button></div></div>`).join("") : `<p class="sub">Nothing waiting.</p>`;
  } catch (err) { $("sugMeta").textContent = ""; $("sugList").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
}
$("sugRefresh").onclick = () => renderSuggestions();
$("sugKeySave").onclick = async () => { const k = $("sugKey").value.trim(); if (!k) return; await window.buddy.suggestSetKey(k); $("sugKey").value = ""; renderSuggestions(); };
$("sugList").onclick = async (e) => {
  const ext = e.target.closest("[data-ext]"); if (ext) { e.preventDefault(); return window.buddy.openExternal(ext.dataset.ext); }
  const b = e.target.closest("[data-sug]"); if (!b) return; b.disabled = true;
  try {
    if (b.dataset.sug === "approved") await window.buddy.findsAdd({ repo: b.dataset.repo, via: "Suggestion" }).catch((err) => { if (!/already/.test(err.message)) throw err; });
    await window.buddy.suggestMark(Number(b.dataset.id), b.dataset.sug);
    $("sugState").textContent = b.dataset.sug === "approved" ? "Approved - it's in Individual Finds (plans are made automatically when your AI key is set). Publish to send it to everyone." : "Done."; $("sugState").className = "status ok";
  } catch (err) { $("sugState").textContent = err.message.replace(/^.*Error: /, ""); $("sugState").className = "status bad"; }
  renderSuggestions();
};
async function renderDead() {
  const list = await window.buddy.deadReposList();
  const shown = list.filter((d) => d.hidden);
  $("deadMeta").textContent = `· ${shown.length} hidden`;
  $("deadList").innerHTML = shown.length ? shown.map((d) => `<div class="srcRow"><span></span><div><div class="lab">${esc(d.repo)}</div><div class="u">Gone since ${esc(new Date(d.at).toLocaleDateString())}</div></div><button class="small" type="button" data-unhide="${esc(d.repo)}">Unhide</button></div>`).join("") : `<p class="sub">None.</p>`;
}
$("deadList").onclick = async (e) => { const b = e.target.closest("[data-unhide]"); if (!b) return; await window.buddy.deadReposUnhide(b.dataset.unhide); catalog.games = []; renderDead(); };
async function plansStatus() {
  try { const st = await window.buddy.plansStatus(); $("plansMeta").textContent = `· ${st.published} of ${st.total} catalog entries have plans · ${st.jobs} to generate (~$${st.estimateUsd})`; $("plansGen").textContent = `Generate Missing (${st.jobs})`; $("plansGen").disabled = !st.jobs || st.running; return st; }
  catch (err) { $("plansMeta").textContent = `· ${err.message.replace(/^.*Error: /, "")}`; }
}
$("plansGen").onclick = async () => {
  const st = await plansStatus(); if (!st?.jobs) return;
  $("plansGen").disabled = true; $("plansCancel").hidden = false; $("plansState").textContent = `Generating ${st.jobs} plan(s)… this costs about $${st.estimateUsd} on your key.`; $("plansState").className = "status";
  if (st.jobs > 20 && !confirm(`Generate ${st.jobs} plans on your AI key? That's about $${st.estimateUsd}.`)) { $("plansGen").disabled = false; $("plansCancel").hidden = true; $("plansState").textContent = "Not started."; return; }
  try { const r = await window.buddy.plansGenerate({ confirmedJobs: st.jobs }); if (r.needsConfirm) { $("plansState").textContent = `The list changed (${r.needsConfirm} plans now) - press Generate again.`; $("plansState").className = "status bad"; return; } $("plansState").textContent = r.fatal ? `${r.done} done, then stopped: ${r.fatal}` : `${r.done} generated, ${r.failed} failed${r.cancelled ? ", cancelled" : ""}. Publish & Deploy to make them live.`; $("plansState").className = r.failed ? "status bad" : "status ok"; }
  catch (err) { $("plansState").textContent = err.message.replace(/^.*Error: /, ""); $("plansState").className = "status bad"; }
  finally { $("plansCancel").hidden = true; plansStatus(); }
};
$("plansCancel").onclick = () => window.buddy.plansCancel();
window.buddy.onPlansProgress((p) => { $("plansState").textContent = `Generating… ${p.done + p.failed} of ${p.total} (${p.failed} failed)`; });

// ---------- Admin cheat code ----------
// Type the word anywhere outside a text field to show or hide the Admin section.
const ADMIN_CODE = "tanooki";
let typed = "";
const toast = (m) => { $("toast").textContent = m; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 2200); };
document.addEventListener("keydown", async (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
  typed = (typed + e.key.toLowerCase()).slice(-ADMIN_CODE.length);
  if (typed !== ADMIN_CODE) return;
  typed = "";
  const on = !settings.admin;
  await window.buddy.setSettings({ admin: on });
  await refresh();
  toast(on ? "Admin unlocked" : "Admin hidden");
  if (on) showView("admin"); else if (document.querySelector("main > section.view.active").dataset.view === "admin") showView("browse");
});

// ---------- App updates ----------
let updateInfo = null;
async function checkUpdates({ quiet } = {}) {
  try {
    updateInfo = await window.buddy.checkUpdate();
    if (updateInfo.available && !updaterReady) {
      $("updateText").textContent = `Decomp Buddy ${updateInfo.version} is available (you have ${updateInfo.current}).${updateInfo.notes ? ` ${updateInfo.notes}` : ""}`;
      $("updateBar").classList.add("show");
      $("updateState").textContent = `Version ${updateInfo.version} is available.`;
    } else $("updateState").textContent = `You're on the latest version (${updateInfo.current}).`;
  } catch (err) {
    $("updateState").textContent = quiet ? "Couldn't check for updates." : `Couldn't check: ${err.message.replace(/^.*Error: /, "")}`;
  }
}
let updaterReady = false;
window.buddy.onUpdater((st) => {
  if (st.status === "downloading") { $("updateText").textContent = `Downloading Decomp Buddy ${st.version || ""}${st.percent != null ? ` - ${st.percent}%` : ""}…`; $("updateBar").classList.add("show"); $("updateGet").hidden = true; }
  if (st.status === "ready") { updaterReady = true; $("updateText").textContent = `Decomp Buddy ${st.version} is downloaded.`; $("updateGet").hidden = false; $("updateGet").textContent = "Restart To Update"; $("updateBar").classList.add("show"); $("updateState").textContent = `Version ${st.version} downloaded - restart to install.`; }
  if (st.status === "current") $("updateState").textContent = `You're on the latest version (${settings.version}).`;
  if (st.status === "error") $("updateState").textContent = st.message;
});
$("updateGet").onclick = () => updaterReady ? window.buddy.updateInstall() : updateInfo?.url ? window.buddy.openExternal(updateInfo.url) : window.buddy.openExternal("https://decompbuddy.com/download");
$("updateLater").onclick = () => $("updateBar").classList.remove("show");
$("updateCheck").onclick = () => checkUpdates();
$("openLogBtn").onclick = () => window.buddy.openLog();
setTimeout(() => checkUpdates({ quiet: true }), 3000);

// ---------- Daily catalog + game-update check ----------
// Sources refetch every time Browse opens; this covers the app sitting open on Set Up all day.
async function dailyCheck() {
  try {
    await loadCatalog({ refresh: true, checkInstalled: true });
    for (const [id, w] of Object.entries(settings.wishlist || {})) {
      const g = catalog.games.find((x) => x.id === id); if (!g) continue;
      const news = [];
      if (w.sawStatus !== "latest" && g.status === "latest") news.push("is now Latest");
      const newPlat = (g.platforms || []).filter((p) => !(w.sawPlatforms || []).includes(p)); if (newPlat.length) news.push(`now has ${newPlat.join("/")} build(s)`);
      if (w.sawVersion && g.version && g.version !== w.sawVersion) news.push(`has ${g.version}`);
      if (news.length) { toast(`${g.title} ${news.join(", ")}`); settings.wishlist[id] = { ...w, sawStatus: g.status, sawPlatforms: g.platforms, sawVersion: g.version }; await window.buddy.setSettings({ wishlist: settings.wishlist }); }
    }
    const updates = catalog.games.filter((g) => updateAvailable(g, installedFor(g)));
    if (updates.length) {
      toast(`${updates.length} installed game(s) have a newer release - see Browse Games`);
      $("updatesBtn").textContent = `Check For Updates (${updates.length})`;
    } else $("updatesBtn").textContent = "Check For Updates";
    await digestCheck();
  } catch {}
}
setTimeout(dailyCheck, 8000);
setTimeout(() => window.buddy.suggestFlush().catch(() => {}), 12000); // suggestions made while offline
setInterval(dailyCheck, 24 * 60 * 60 * 1000);
$("target").onchange = async () => { await window.buddy.setSettings({ target: $("target").value }); await refresh(); if (catalog.games.length) renderCatalog(); };
const PLATFORM_OF_TARGET = { windows: "Windows", "macos-arm64": "macOS", "macos-x64": "macOS", linux: "Linux" };
let runsOnTouched = false;
function targetPlatformLabel() { if (!runsOnTouched) $("catRunsOn").value = PLATFORM_OF_TARGET[$("target").value] || "Windows"; }

$("analyze").onclick = async () => {
  const urls = $("urls").value.split("\n").map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return status("Paste at least one GitHub link.", "bad");
  // No key is fine: published plans cover the catalog; the app says so per repo if one's missing.
  $("analyze").disabled = true; $("setup").disabled = true; $("log").textContent = ""; status("Reading repos…");
  try {
    games = await window.buddy.analyze({ urls: urls.map((u) => (catalogPicks.has(u) ? { url: u, ...catalogPicks.get(u) } : u)) });
    picks.clear(); verifications.clear(); overrides.clear(); reviewOpen.clear(); autoFrom.clear();
    drives = await window.buddy.dumpDrives().catch(() => []);
    renderGames();
    // Fill in what the BIOS vault and your game-file library can answer with confidence.
    (async () => {
      for (const g of games.filter((x) => x.ok)) for (const [i, f] of g.game_files.entries()) {
        const p = f.vaultPath || f.libraryPath; if (!p || (picks.get(g.id) || {})[i]) continue;
        autoFrom.set(`${g.id}:${i}`, f.vaultPath ? `from your BIOS vault (${f.vaultIdentity})` : `from your game-file library - ${f.libraryWhy}`);
        await usePick(g, i, p);
      }
    })();
    const ok = games.filter((g) => g.ok).length;
    const need = games.filter((g) => g.ok).reduce((n, g) => n + g.game_files.length, 0);
    status(`${ok} of ${games.length} read. ${need ? `Choose your ${need} game file(s) below, then Set Up Games.` : "Nothing to choose - hit Set Up Games."}`, ok ? "ok" : "bad");
  } catch (err) {
    status(err.message.replace(/^.*Error: /, ""), "bad");
  } finally { $("analyze").disabled = false; }
};

$("setup").onclick = async () => {
  const active = games.filter((g) => g.ok && !skipped.has(g.id));
  const items = active.map((g) => ({
    id: g.id, picks: picks.get(g.id) || {}, overrides: overrides.get(g.id),
    verifications: Object.fromEntries(g.game_files.map((_, i) => [i, verifications.get(`${g.id}:${i}`)]).filter(([, v]) => v && !v.pending)),
  }));
  const warn = [...verifications.values()].filter((v) => v.status === "mismatch").length;
  $("setup").disabled = true; $("analyze").disabled = true; status("Setting up… (three games at a time)");
  $("setupPause").hidden = false; $("setupCancel").hidden = false; $("setupPause").textContent = "Pause Downloads";
  try {
    const { results, setupCount, nudgedAt } = await window.buddy.setup({ items });
    showResults(results, active, warn);
    maybeNudge(setupCount, nudgedAt || []);
    for (const g of active) catalogPicks.delete(g.url); // consumed: the next pick from this repo starts fresh
    games = []; picks.clear(); verifications.clear(); skipped.clear(); overrides.clear(); reviewOpen.clear(); $("games").innerHTML = "";
  } catch (err) {
    status(err.message.replace(/^.*Error: /, ""), "bad");
    $("setup").disabled = false;
  } finally { $("analyze").disabled = false; $("setupPause").hidden = true; $("setupCancel").hidden = true; }
};
$("setupPause").onclick = async () => {
  const pausing = $("setupPause").textContent.startsWith("Pause");
  await (pausing ? window.buddy.setupPause() : window.buddy.setupResume());
  $("setupPause").textContent = pausing ? "Resume Downloads" : "Pause Downloads"; status(pausing ? "Paused - resuming picks up where each download stopped." : "Setting up…");
};
$("setupCancel").onclick = async () => { if (confirm("Cancel the set-up? Games already finished stay set up.")) await window.buddy.setupCancel(); };

const STATUS_TEXT = { ready: "Ready", needs_build: "Needs build on PC", needs_attention: "Needs attention", unsupported: "Not installable" };

function showResults(results, active, warn) {
  const tile = (cls, name, sub) => `<div class="tile ${cls}"><span translate="no">${esc(name)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  const ok = [], bad = [], skip = [];
  results.forEach((r, i) => {
    const g = active[i];
    if (!r.ok) return bad.push(tile("bad", g.game_title, r.error));
    const m = r.manifest;
    const flagged = m.plan.game_files.filter((f) => f.verification?.status === "mismatch").length;
    if (m.status === "unsupported" || m.status === "needs_attention") bad.push(tile("bad", `${m.plan.game_title} · ${m.plan.console}`, m.statusDetail));
    else ok.push(tile("ok", `${m.plan.game_title} · ${m.plan.console}`, [STATUS_TEXT[m.status], flagged && `${flagged} file(s) flagged`].filter(Boolean).join(" · ")));
  });
  games.filter((g) => g.ok && skipped.has(g.id)).forEach((g) => skip.push(tile("skip", `${g.game_title} · ${g.console}`, "Skipped - read the repo again when you have the files")));
  games.filter((g) => !g.ok).forEach((g) => bad.push(tile("bad", g.url, g.error)));
  $("colOk").innerHTML = ok.join("") || `<p class="none">None</p>`;
  $("colBad").innerHTML = bad.join("") || `<p class="none">None</p>`;
  $("colSkip").innerHTML = skip.join("") || `<p class="none">None</p>`;
  $("resultsSummary").textContent = `${ok.length} set up, ${bad.length} failed, ${skip.length} skipped${warn ? ` · ${warn} game file(s) flagged, see install.html` : ""}.`;
  showView("results");
}
$("resultsBack").onclick = () => showView("setup");
$("resultsHtml").onclick = () => window.buddy.open(`${$("outDir").value.trim()}/install.html`);
$("resultsFolder").onclick = () => window.buddy.open($("outDir").value.trim());

// ---------- Browse (portsdr.com catalog) ----------
let catalog = { games: [], installed: {}, fetchedAt: null, stale: false, error: null };
const catSelected = new Set();          // game ids picked with Add, on any of the game pages
let catCon = "";                        // the console button pressed in Browse ("" = All)
const catalogPicks = new Map();         // repo url -> { preferredTag, artworkPath } handed to Read Repos
const iconCache = new Map();            // id -> dataUrl | null | "pending"
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

async function loadCatalog({ refresh = true, checkInstalled = false } = {}) {
  $("catalogStatus").textContent = refresh ? "Loading catalog…" : "";
  try {
    catalog = await window.buddy.catalog({ refresh, checkInstalled });
    $("catalogMeta").textContent = `${catalog.games.length} projects · updated ${fmtDate(catalog.fetchedAt)}`;
    $("catalogStatus").textContent = catalog.stale ? `Showing the last saved catalog - couldn't refresh: ${catalog.error}` : "";
    $("catalogStatus").className = `status ${catalog.stale ? "bad" : ""}`;
    const counts = {};
    catalog.games.forEach((g) => { counts[g.console] = (counts[g.console] || 0) + 1; });
    if (catCon && !counts[catCon]) catCon = "";
    const last = (c) => ["Others", "Unknown"].includes(c); // the catch-alls go at the end
    $("conBar").innerHTML = [["", "All", catalog.games.length], ...Object.keys(counts).sort((a, b) => last(a) - last(b) || a.localeCompare(b)).map((c) => [c, c, counts[c]])]
      .map(([v, label, n]) => `<button type="button" data-con="${esc(v)}" aria-pressed="${v === catCon}">${esc(label)}<span class="n">${n}</span></button>`).join("");
  } catch (err) {
    catalog = { games: [], installed: {}, fetchedAt: null, stale: true, error: err.message };
    $("catalogStatus").textContent = err.message.replace(/^.*Error: /, ""); $("catalogStatus").className = "status bad";
  }
  renderCatalog();
}

const isWished = (g) => !!(settings.wishlist || {})[g.id];
const isNew = (g) => { const d = new Date(g.addedAt || g.firstSeen || 0), u = new Date(g.updatedAt || 0), week = Date.now() - 7 * 86400e3; return (d.getTime() > 86400e3 && d.getTime() > week) || u.getTime() > week; };
async function toggleWish(g) {
  const w = { ...(settings.wishlist || {}) };
  if (w[g.id]) delete w[g.id]; else w[g.id] = { addedAt: new Date().toISOString(), sawStatus: g.status, sawPlatforms: g.platforms, sawVersion: g.version };
  await window.buddy.setSettings({ wishlist: w }); settings.wishlist = w;
  renderCatalog();
}
// Read repos for every game that's behind, then set up straight away: placed files carry over, no picking.
async function updateAll(games) {
  if (!games.length) return;
  $("urls").value = "";
  await addToLinks(games.map((g) => g.id));
  await $("analyze").onclick();
  if (!$("setup").disabled) await $("setup").onclick();
}
const normTitle = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
function installedFor(g) {
  let list = g.owner ? catalog.installed[`${g.owner}/${g.repo}`.toLowerCase()] : null;
  // One card per game of a collection: only that game's install counts, not its siblings'.
  if (list && g.gameTitle) list = list.filter((i) => normTitle(i.title) === normTitle(g.gameTitle));
  return list && list.length ? list : null;
}
const updateAvailable = (g, inst) => !!(inst && g.version && inst.some((i) => i.tag !== g.version));

function visibleGames() {
  const q = $("catSearch").value.trim().toLowerCase();
  const con = catCon, st = $("catStatus").value, srcF = $("catSource").value;
  const plat = PLATFORM_OF_TARGET[$("target").value] || "Windows";
  const runsOn = $("catRunsOn").value, instOnly = $("catInstalled").checked, wishOnly = $("catWish").checked, playOnly = $("catPlayable").checked;
  const runsOk = (g) => !runsOn || (runsOn === "Steam Deck" ? ["verified", "works"].includes(g.facts?.steam_deck) : g.platforms.includes(runsOn) || !g.platforms.length);
  let list = catalog.games.filter((g) =>
    (!q || `${g.title} ${g.project}`.toLowerCase().includes(q)) &&
    (!con || g.console === con) && (!st || g.status === st) && (!srcF || (g.sources || [g.source]).includes(srcF)) &&
    runsOk(g) && (!playOnly || ["playable", "mostly"].includes(g.facts?.completeness)) && (!instOnly || installedFor(g)) && (!wishOnly || isWished(g)));
  const sort = $("catSort").value;
  const byTitle = (a, b) => a.title.localeCompare(b.title) || a.project.localeCompare(b.project);
  const plats = (g) => ["Windows", "macOS", "Linux"].filter((p) => g.platforms.includes(p)).join(" · ") || "No builds";
  if (sort === "updated") list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  else if (sort === "platforms") list.sort((a, b) => plats(a).localeCompare(plats(b)) || a.console.localeCompare(b.console) || byTitle(a, b));
  else if (sort === "title") list.sort(byTitle);
  else list.sort((a, b) => a.console.localeCompare(b.console) || byTitle(a, b));
  if (instOnly) list.sort((a, b) => updateAvailable(b, installedFor(b)) - updateAvailable(a, installedFor(a)));
  return { list, grouped: (sort === "console" && !con) || sort === "platforms", groupBy: sort === "platforms" ? plats : (g) => g.console };
}

// One game as a tile: box art, title, one line about it, one button. Everything else is on its page.
const PLAT_SHORT = { Windows: "Win", macOS: "Mac", Linux: "Linux" };
const TILE_DONE = { playable: "Complete", mostly: "Mostly Playable", partial: "Partly Playable", wip: "Not Playable Yet" };
// The tile's two lines: how complete it is, and which computers it runs on (phones and consoles are on its page).
function tileLine(g) {
  const rel = g.status === "latest" ? "Latest Release" : g.status === "prerelease" ? "Pre-release" : g.version ? "" : "No Release Yet";
  return { text: TILE_DONE[g.facts?.completeness] || rel || "Not Read Yet", plats: Object.keys(PLAT_SHORT).filter((p) => (g.platforms || []).includes(p)).map((p) => PLAT_SHORT[p]).join(" · "), good: g.facts?.completeness === "playable" };
}
function portCard(g) {
  const inst = installedFor(g), upd = updateAvailable(g, inst), picked = catSelected.has(g.id);
  const icon = iconCache.get(g.id);
  if (icon === undefined) { iconCache.set(g.id, "pending"); window.buddy.catalogIcon(g.id).then((r) => { iconCache.set(g.id, r ? r.dataUrl : null); if (r) iconPaths.set(g.id, r.path); document.querySelectorAll(`[data-icon="${CSS.escape(g.id)}"]`).forEach((slot) => { if (r) slot.innerHTML = `<img src="${r.dataUrl}" alt="">`; }); }); }
  const art = typeof icon === "string" && icon !== "pending" ? `<img src="${icon}" alt="">` : `<div class="nocover" translate="no">${esc(g.title)}</div>`;
  const tag = upd ? `<span class="tag">Update</span>` : inst ? `<span class="tag inst">Installed</span>` : isNew(g) ? `<span class="tag">New</span>` : "";
  const line = tileLine(g);
  const act = !g.repoUrl ? `<span class="state muted">No Repository Link</span>`
    : upd ? `<button class="small primary upd" type="button" data-cat="update" data-id="${esc(g.id)}">Update To ${esc(g.version)}</button>`
    : inst ? `<span class="state">Installed ${esc(inst.map((i) => i.tag || "").filter(Boolean).join(", "))}</span>`
    : `<button class="small pick" type="button" data-cat="pick" data-id="${esc(g.id)}" aria-pressed="${picked}" aria-label="${picked ? "Remove" : "Add"} ${esc(g.title)}">${picked ? "✓ Added" : "Add"}</button>`;
  return `<div class="gtile${picked ? " picked" : ""}" tabindex="0" data-card="${esc(g.id)}" aria-label="${esc(g.title)} - ${esc(g.console)}">
    <div class="cover" data-cat="detail" data-id="${esc(g.id)}"><div data-icon="${esc(g.id)}">${art}</div>${tag}</div>
    <div class="t"><h4 translate="no"><a href="#" data-cat="detail" data-id="${esc(g.id)}">${esc(g.title)}</a></h4>
      <div class="line${line.good ? " good" : ""}">${esc(line.text)}</div>${line.plats ? `<div class="line">${esc(line.plats)}</div>` : ""}</div>
    <div class="acts">${act}<button class="star${isWished(g) ? " on" : ""}" type="button" data-cat="wish" data-id="${esc(g.id)}" aria-pressed="${isWished(g)}" aria-label="${isWished(g) ? "Remove from" : "Add to"} wishlist: ${esc(g.title)}" title="Wishlist">${isWished(g) ? "★" : "☆"}</button></div>
  </div>`;
}
const iconPaths = new Map();

function renderCatalog() {
  const { list, grouped, groupBy } = visibleGames();
  let html = "";
  if (grouped) {
    let cur = null;
    for (const g of list) {
      const key = groupBy(g);
      if (key !== cur) { cur = key; html += `${html ? "</div>" : ""}<h2 class="group-head">${esc(cur)}<span class="n">${list.filter((x) => groupBy(x) === cur).length}</span></h2><div class="tiles">`; }
      html += portCard(g);
    }
    if (html) html += "</div>";
  } else html = list.length ? `<div class="tiles">${list.map(portCard).join("")}</div>` : "";
  $("catalogList").innerHTML = html || `<p class="muted">Nothing matches.</p>`;
  const updates = list.filter((g) => updateAvailable(g, installedFor(g))).length;
  $("catCount").textContent = `${list.length} shown · ${catSelected.size} selected${updates ? ` · ${updates} update(s) available` : ""}`;
  document.querySelectorAll(".pickAdd").forEach((b) => (b.disabled = !catSelected.size));
  document.querySelectorAll(".pickCount").forEach((n) => (n.textContent = catSelected.size ? `${catSelected.size} selected` : ""));
  const extra = [$("catStatus").value, $("catSource").value, $("catPlayable").checked, $("catInstalled").checked, $("catWish").checked].filter(Boolean).length;
  $("moreFiltersBtn").textContent = extra ? `More Filters (${extra})` : "More Filters";
  const allUpd = catalog.games.filter((g) => updateAvailable(g, installedFor(g))).length;
  $("catUpdateAll").hidden = !allUpd; $("catUpdateAll").textContent = `Update All (${allUpd})`;
  renderNewGames();
  renderForYou();
}

async function addToLinks(ids, { andRead = false } = {}) {
  const lines = $("urls").value.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const id of ids) {
    const g = catalog.games.find((x) => x.id === id);
    if (!g?.repoUrl) continue;
    const inBox = lines.includes(g.repoUrl);
    if (!inBox) lines.push(g.repoUrl);
    if (iconCache.get(g.id) === undefined || iconCache.get(g.id) === "pending") { const r = await window.buddy.catalogIcon(g.id); if (r) iconPaths.set(g.id, r.path); }
    const asset = g.assets?.[$("target").value] ? g.assets[$("target").value].split("/").pop() : undefined;
    const hints = [g.region && `region ${g.region}`, g.serial && `disc serial ${g.serial}`, g.bios && `BIOS model ${g.bios}`, g.discs > 1 && `${g.discs} discs (one game file per disc)`].filter(Boolean).join(", ") || undefined;
    const prev = (inBox && catalogPicks.get(g.repoUrl)) || {};
    const onlyGames = g.gameTitle ? [...new Set([...(prev.onlyGames || []), g.gameTitle])] : undefined;
    catalogPicks.set(g.repoUrl, { preferredTag: g.version || undefined, preferredAsset: asset, artworkPath: iconPaths.get(g.id) || undefined, hints, onlyGames });
  }
  $("urls").value = lines.join("\n");
  catSelected.clear();
  showView("setup");
  status(`${ids.length} game(s) added to the links box.`, "ok");
  if (andRead) $("analyze").click(); else $("analyze").focus();
}

$("updatesBtn").onclick = async () => {
  showView("browse");
  $("catInstalled").checked = true; $("catRunsOn").value = ""; runsOnTouched = true;
  await loadCatalog({ refresh: true, checkInstalled: true });
  const inst = catalog.games.filter((g) => installedFor(g));
  const upd = inst.filter((g) => updateAvailable(g, installedFor(g)));
  $("catalogStatus").textContent = !inst.length ? "Nothing from the catalog is installed in the output folder yet." : upd.length ? `${upd.length} update(s) available.` : "Everything's current.";
  $("catalogStatus").className = `status ${upd.length ? "bad" : "ok"}`;
};
$("catalogRefresh").onclick = () => loadCatalog({ refresh: true });
document.querySelectorAll("[data-ext]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.buddy.openExternal(a.dataset.ext); }));
document.getElementById("aboutSources").onclick = (e) => { const a = e.target.closest("a[data-url]"); if (a) { e.preventDefault(); window.buddy.openExternal(a.dataset.url); } };
for (const id of ["catSearch", "catStatus", "catSource", "catSort", "catRunsOn", "catPlayable", "catInstalled", "catWish"]) $(id).oninput = renderCatalog;
$("conBar").onclick = (e) => {
  const b = e.target.closest("[data-con]"); if (!b) return;
  catCon = b.dataset.con;
  $("conBar").querySelectorAll("[data-con]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderCatalog(); $("catalogList").scrollTop = 0;
};
$("moreFiltersBtn").onclick = () => { const open = $("moreFilters").hidden; $("moreFilters").hidden = !open; $("moreFiltersBtn").setAttribute("aria-expanded", String(open)); };
$("clearFilters").onclick = () => { $("catStatus").value = ""; $("catSource").value = ""; for (const id of ["catPlayable", "catInstalled", "catWish"]) $(id).checked = false; renderCatalog(); };
$("catUpdateAll").onclick = () => updateAll(catalog.games.filter((g) => updateAvailable(g, installedFor(g))));
$("libUpdateAll").onclick = async () => { if (!catalog.games.length) await loadCatalog({ refresh: true, checkInstalled: true }); updateAll(catalog.games.filter((g) => updateAvailable(g, installedFor(g)))); };
$("catRunsOn").onchange = () => { runsOnTouched = true; renderCatalog(); };
$("catalogList").onclick = (e) => {
  const t = e.target.closest("[data-cat]");
  if (!t) return;
  if (t.dataset.cat === "ext") { e.preventDefault(); return window.buddy.openExternal(t.dataset.url); }
  if (t.dataset.cat === "pick") { togglePick(t.dataset.id); return document.querySelector(`.view.active [data-cat="pick"][data-id="${CSS.escape(t.dataset.id)}"]`)?.focus(); }
  if (t.dataset.cat === "update") return showDetail(catalog.games.find((x) => x.id === t.dataset.id)); // see what changed, then Update
  if (t.dataset.cat === "wish") { e.preventDefault(); return toggleWish(catalog.games.find((x) => x.id === t.dataset.id)).then(() => document.querySelector(`.view.active [data-cat="wish"][data-id="${CSS.escape(t.dataset.id)}"]`)?.focus()); }
  if (t.dataset.cat === "detail") { e.preventDefault(); return showDetail(catalog.games.find((x) => x.id === t.dataset.id)); }
};
// Keyboard-first Browse: arrows move between cards the way they're laid out (grid-aware), Home/End
// jump to the ends, Enter opens the game, Space ticks Add. "/" anywhere jumps to search.
const CARD_LISTS = ["catalogList", "newList", "forYouList"];
function togglePick(id) { catSelected.has(id) ? catSelected.delete(id) : catSelected.add(id); renderCatalog(); }
const focusCard = (id) => { const c = [...document.querySelectorAll(".view.active .gtile")].find((x) => x.dataset.card === id); c?.focus(); c?.scrollIntoView({ block: "nearest" }); };
function cardNeighbour(card, key) {
  const cards = [...document.querySelectorAll(".view.active .gtile")].filter((c) => c.offsetParent);
  const i = cards.indexOf(card); if (i < 0) return null;
  if (key === "ArrowRight") return cards[i + 1]; if (key === "ArrowLeft") return cards[i - 1];
  if (key === "Home") return cards[0]; if (key === "End") return cards[cards.length - 1];
  const r = card.getBoundingClientRect(), down = key === "ArrowDown";
  const rows = cards.filter((c) => { const t = c.getBoundingClientRect().top; return down ? t > r.top + 4 : t < r.top - 4; });
  if (!rows.length) return null;
  const rowTop = down ? Math.min(...rows.map((c) => c.getBoundingClientRect().top)) : Math.max(...rows.map((c) => c.getBoundingClientRect().top));
  return rows.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 4).sort((a, b) => Math.abs(a.getBoundingClientRect().left - r.left) - Math.abs(b.getBoundingClientRect().left - r.left))[0];
}
for (const list of CARD_LISTS) $(list).addEventListener("keydown", (e) => {
  const card = e.target.closest(".gtile"); if (!card || e.target !== card) return;
  if (e.key === "Enter") { e.preventDefault(); showDetail(catalog.games.find((x) => x.id === card.dataset.card)); }
  if (e.key === " ") { e.preventDefault(); if (card.querySelector('[data-cat="pick"]')) { togglePick(card.dataset.card); focusCard(card.dataset.card); } }
  if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) { const n = cardNeighbour(card, e.key); if (n) { e.preventDefault(); focusCard(n.dataset.card); } }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.querySelector("main > section.view.active")?.dataset.view !== "browse") return;
  e.preventDefault(); $("catSearch").focus();
});
document.querySelectorAll(".pickAdd").forEach((b) => (b.onclick = () => addToLinks([...catSelected])));

$("clean").onclick = async () => {
  const { removed, count } = await window.buddy.clean($("outDir").value.trim());
  status(`Removed ${removed} Mac junk file(s); install.html lists ${count} game(s).`, "ok");
};
$("openHtml").onclick = () => window.buddy.open(`${$("outDir").value.trim()}/install.html`);
$("openFolder").onclick = () => window.buddy.open($("outDir").value.trim());

window.buddy.onLog(log);
refresh();
