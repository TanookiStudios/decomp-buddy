// Mods, continued: load order and conflicts for the open game, GameBanana (browse, read, download
// with the author credited), and updates for texture packs / GameBanana mods you've installed.
// Shares app.js's globals ($, esc, modsGame, renderMods, fmtDate, mb, library, renderLibrary).

const modsState = (m, cls = "") => { $("modsState").textContent = m; $("modsState").className = `status ${cls}`; };

// ---- Load order (folder-method ports: the game reads its mods folder alphabetically)
let orderDraft = [];
function renderModsExtras(r) {
  $("modsConflicts").innerHTML = ""; $("modsGb").hidden = true;
  const enabled = r.items.filter((it) => it.enabled === true).map((it) => it.name);
  const folderPort = r.mods?.method === "folder" && r.mods?.folder;
  if (!folderPort || enabled.length < 2) { $("modsOrder").innerHTML = ""; return; }
  orderDraft = enabled;
  drawOrder();
}
function drawOrder() {
  $("modsOrder").innerHTML = `<h4 style="margin:12px 0 4px">Load Order</h4><p class="sub">The game reads its mods folder in name order, so later ones win where two change the same thing. Move them, then Apply Order.</p>
    <ol class="srcList" style="padding:0;list-style:none">${orderDraft.map((n, i) => `<li class="srcRow"><span class="sub">${i + 1}</span><div class="lab">${esc(n)}</div><span><button class="small" type="button" data-up="${i}" ${i ? "" : "disabled"} aria-label="Move ${esc(n)} up">↑</button><button class="small" type="button" data-down="${i}" ${i < orderDraft.length - 1 ? "" : "disabled"} aria-label="Move ${esc(n)} down">↓</button></span></li>`).join("")}</ol>
    <button id="modsApplyOrder" type="button">Apply Order</button>`;
}
$("modsOrder").onclick = async (e) => {
  const up = e.target.closest("[data-up]"), down = e.target.closest("[data-down]");
  if (up || down) { const i = Number((up || down).dataset[up ? "up" : "down"]), j = up ? i - 1 : i + 1; [orderDraft[i], orderDraft[j]] = [orderDraft[j], orderDraft[i]]; drawOrder(); $("modsOrder").querySelector(`[data-${up ? "up" : "down"}="${j}"]`)?.focus(); return; }
  if (e.target.id === "modsApplyOrder") { try { await window.buddy.modsOrder(modsGame.folder, orderDraft); modsState("Order applied.", "ok"); renderMods(); } catch (err) { modsState(err.message.replace(/^.*Error: /, ""), "bad"); } }
};

// ---- Conflicts
$("modsConflictBtn").onclick = async () => {
  $("modsConflicts").innerHTML = `<p class="sub">Reading what each mod changes…</p>`;
  try {
    const c = await window.buddy.modsConflicts(modsGame.folder);
    $("modsConflicts").innerHTML = c.length ? `<h4 style="margin:12px 0 4px">Possible Conflicts</h4><div class="srcList">${c.map((x) => `<div class="srcRow"><span>⚠</span><div><div class="lab">${esc(x.a)} and ${esc(x.b)}</div><div class="u" title="${esc(x.sample.join(", "))}">both change ${x.count} file${x.count === 1 ? "" : "s"}, like ${esc(x.sample.slice(0, 2).join(", "))}</div></div><span class="sub">the later one wins</span></div>`).join("")}</div>` : `<p class="sub">No two mods change the same files.</p>`;
  } catch (err) { $("modsConflicts").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
};

// ---- GameBanana
let gb = { gameId: null, sort: "popular", page: 1 };
$("modsGbBtn").onclick = async () => {
  $("modsGb").hidden = false; $("modsGb").innerHTML = `<p class="sub">Looking this game up on GameBanana…</p>`;
  const g = modsGame;
  try {
    const r = await window.buddy.gbGame(g.repo, g.title);
    if (r.id) { gb = { gameId: r.id, sort: "popular", page: 1 }; return gbList(); }
    gbPickGame(r.results);
  } catch (err) { $("modsGb").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
};
function gbPickGame(results) {
  $("modsGb").innerHTML = `<h4 style="margin:12px 0 4px">Which GameBanana Page Is This Game?</h4>
    <div class="srcList">${results.map((x) => `<div class="srcRow"><span></span><div class="lab">${esc(x.name)}</div><button class="small" type="button" data-gbgame="${x.id}">This One</button></div>`).join("") || `<p class="sub">No match by name.</p>`}</div>
    <div class="row" style="margin-top:6px"><input id="gbQ" type="text" placeholder="Search GameBanana" aria-label="Search GameBanana for this game" spellcheck="false"><button id="gbQGo" type="button">Search</button><button id="gbNone" type="button">It Isn't There</button></div>`;
  $("modsGb").querySelectorAll("[data-gbgame]").forEach((b) => (b.onclick = async () => { await window.buddy.gbSetGame(modsGame.repo, b.dataset.gbgame); gb = { gameId: Number(b.dataset.gbgame), sort: "popular", page: 1 }; gbList(); }));
  $("gbQGo").onclick = async () => { const q = $("gbQ").value.trim(); if (q) gbPickGame(await window.buddy.gbSearch(q).catch(() => [])); };
  $("gbNone").onclick = () => { $("modsGb").innerHTML = `<p class="sub">OK - no GameBanana page for this one.</p>`; };
}
async function gbList() {
  $("modsGb").innerHTML = `<p class="sub">Loading mods…</p>`;
  try {
    const r = await window.buddy.gbMods(gb.gameId, gb.page, gb.sort);
    $("modsGb").innerHTML = `<div class="row" style="margin:12px 0 6px"><h4 style="margin:0;flex:1">GameBanana <span class="sub">· ${r.total} mods</span></h4>
        <label for="gbSort" class="sub" style="margin:0">Sort</label><select id="gbSort" style="width:auto">${[["popular", "Most Downloaded"], ["updated", "Recently Updated"], ["new", "Newest"], ["liked", "Most Liked"]].map(([k, l]) => `<option value="${k}" ${k === gb.sort ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="small" type="button" id="gbWrong" title="Pick a different GameBanana page for this game">Not This Game?</button></div>
      <p class="sub">Mods are made by the GameBanana community and download straight from GameBanana, checked against the checksum it publishes. Read each mod's page for how to use it.</p>
      <div class="srcList">${r.mods.map((m) => `<div class="gbmod">${m.image ? `<img src="${esc(m.image)}" alt="${esc(m.name)} preview" loading="lazy">` : `<div class="noimg"></div>`}<div><div class="lab">${esc(m.name)}${m.obsolete ? ` <span class="badge upd">Obsolete</span>` : ""}</div><div class="u">${esc([m.author && `by ${m.author}`, m.category, `♥ ${m.likes}`, m.updated && `updated ${fmtDate(m.updated)}`].filter(Boolean).join(" · "))}</div></div><button class="small" type="button" data-gbmod="${m.id}">Files</button></div><div id="gbfiles-${m.id}"></div>`).join("")}</div>
      <div class="row" style="margin-top:6px"><button class="small" type="button" id="gbPrev" ${gb.page > 1 ? "" : "disabled"}>Previous</button><span class="sub">Page ${gb.page}</span><button class="small" type="button" id="gbNext" ${r.complete || r.mods.length < 20 ? "disabled" : ""}>Next</button></div>`;
    $("gbSort").onchange = () => { gb.sort = $("gbSort").value; gb.page = 1; gbList(); };
    $("gbPrev").onclick = () => { gb.page--; gbList(); }; $("gbNext").onclick = () => { gb.page++; gbList(); };
    $("gbWrong").onclick = async () => { await window.buddy.gbSetGame(modsGame.repo, null); const res = await window.buddy.gbGame(modsGame.repo, modsGame.title); gbPickGame(res.results); };
  } catch (err) { $("modsGb").innerHTML = `<p class="sub">GameBanana: ${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
}
$("modsGb").addEventListener("click", async (e) => {
  const fb = e.target.closest("[data-gbmod]"), dl = e.target.closest("[data-gbfile]"), ext = e.target.closest("[data-gbext]");
  if (ext) return window.buddy.openExternal(ext.dataset.gbext);
  if (fb) {
    const slot = $(`gbfiles-${fb.dataset.gbmod}`); slot.innerHTML = `<p class="sub">Reading the mod's page…</p>`;
    try {
      const m = await window.buddy.gbMod(Number(fb.dataset.gbmod));
      slot.innerHTML = `<div class="addGame" style="margin:4px 0 8px">${m.description ? `<p class="sub">${esc(m.description)}</p>` : ""}
        ${m.files.map((f) => `<div class="srcRow"><span></span><div><div class="lab">${esc(f.name)}</div><div class="u">${esc([mb(f.size) || `${f.size} bytes`, f.description, f.clean === false ? "didn't pass GameBanana's virus scan" : f.clean ? "passed GameBanana's virus scan" : ""].filter(Boolean).join(" · "))}</div></div><button class="small primary" type="button" data-gbfile="${f.id}" data-gbm="${m.id}" ${f.clean === false ? "disabled" : ""}>Download</button></div>`).join("") || `<p class="sub">No files on this mod.</p>`}
        ${m.license ? `<p class="sub" style="white-space:pre-wrap">License: ${esc(m.license)}</p>` : ""}
        <button class="small" type="button" data-gbext="${esc(m.url)}">Open On GameBanana</button></div>`;
    } catch (err) { slot.innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
  }
  if (dl) {
    dl.disabled = true; modsState("Downloading from GameBanana…");
    try { const r = await window.buddy.gbInstall(modsGame.folder, Number(dl.dataset.gbm), Number(dl.dataset.gbfile)); modsState(`${r.name} is in Decomp Buddy Mods.`, "ok"); await renderMods(); }
    catch (err) { modsState(err.message.replace(/^.*Error: /, ""), "bad"); dl.disabled = false; }
  }
});

// ---- Updates for packs and GameBanana mods you've installed (checked at most every six hours)
let packUpdatesAt = 0, packUpdatesList = [];
async function renderPackUpdates(force = false) {
  if (force || Date.now() - packUpdatesAt > 6 * 3600e3) { packUpdatesAt = Date.now(); packUpdatesList = await window.buddy.modsUpdates().catch(() => []); }
  $("packUpdates").hidden = !packUpdatesList.length;
  $("packUpdates").innerHTML = packUpdatesList.length ? `<strong>Mod And Texture Pack Updates</strong><div class="srcList" style="margin-top:6px">${packUpdatesList.map((u, k) => `<div class="srcRow"><span></span><div><div class="lab">${esc(u.name)}</div><div class="u"><span translate="no">${esc(u.game)}</span> · ${esc(u.why)}</div></div><button class="small primary" type="button" data-packupd="${k}">Update</button></div>`).join("")}</div>` : "";
  $("packUpdates").querySelectorAll("[data-packupd]").forEach((b) => (b.onclick = async () => {
    const u = packUpdatesList[Number(b.dataset.packupd)]; b.disabled = true;
    try { await window.buddy.modsUpdatePack(u.folder, u.index); $("libStatus").textContent = `Updated ${u.name}.`; $("libStatus").className = "status ok"; renderPackUpdates(true); }
    catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; b.disabled = false; }
  }));
}
