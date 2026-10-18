// Installed Games additions: Continue Playing, the per-game More panel (launch options,
// disk space, Check Game, save sync), Adopt A Folder, and Save Sync in Settings.
// Shares app.js's globals ($, esc, settings, library, catalog, fmtDate, mb, normTitle, TARGET_LABEL).

// ---- Continue Playing: the game you played last, one button away.
function renderContinue(g) {
  const el = $("continueHero");
  if (!g) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="hero" data-key="${esc(g.key)}">
    ${g.art ? `<img src="${g.art}" alt="${esc(g.title)} artwork">` : `<div class="nocover" translate="no">${esc(g.title)}</div>`}
    <div style="flex:1"><div class="sub">Continue Playing</div><h2 translate="no">${esc(g.title)}</h2>
      <div class="sub">Last played ${esc(fmtDate(g.lastPlayed))}${g.tag ? ` · ${esc(g.tag)}` : ""}</div>
      <div class="row">${playButton(g, `data-hero="play"`)}<button type="button" data-hero="more">More…</button></div></div></div>`;
}
$("continueHero").onclick = async (e) => {
  const b = e.target.closest("[data-hero]"); if (!b) return;
  const g = library.find((x) => x.key === b.closest(".hero").dataset.key); if (!g) return;
  try {
    if (b.dataset.hero === "play") { const r = await window.buddy.gamePlay(g.folder); $("libStatus").textContent = `Launched ${r.exe.split(/[\\/]/).pop()}.`; $("libStatus").className = "status ok"; }
    else await openMore(g);
  } catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
};

// Play, Play With Wine (a Windows copy on a Mac, experimental), or a disabled button that says why.
function playButton(g, attr) {
  if (g.onDevice) return `<button class="primary" type="button" ${attr} ${g.deviceReady && g.packageId ? "" : "disabled"} title="${!g.device ? "Install it from Phones And Headsets first" : !g.deviceReady ? `Plug in ${esc(g.device.model || "the device")} to start it` : !g.packageId ? "Start it on the device - Decomp Buddy doesn't know its app name" : `Starts it on ${esc(g.device.model || "the device")}`}">Launch</button>`;
  if (g.runsHere) return `<button class="primary" type="button" ${attr} ${g.exe ? "" : "disabled"} title="${g.exe ? "" : "No executable found"}">Play</button>`;
  if (g.canWine && g.wineReady && g.exe) return `<button class="primary" type="button" ${attr} title="${g.compatName === "Proton" ? "Runs the Windows version through Proton, the way Steam plays Windows games." : "Experimental: runs the Windows version through Wine. DirectX 9/11 and OpenGL games often work; Vulkan and DirectX 12 ones usually don't."}">Play With ${esc(g.compatName || "Wine")}</button>`;
  if (g.canWine && settings.platform === "linux") return `<button class="primary" type="button" ${attr} disabled title="This is the Windows version. Install Proton in Steam (search your Library for Proton) or install Wine to play it here.">Play</button>`;
  if (g.canWine) return `<button class="primary" type="button" ${attr} disabled title="This is the Windows version. Set up Wine in Settings → Windows Games On This Mac to try it here, or transfer it to a PC.">Play</button>`;
  return `<button class="primary" type="button" ${attr} disabled title="Built for ${esc(TARGET_LABEL[g.target] || g.target)} - transfer it">Play</button>`;
}

// ---- The More panel
let moreGame = null;
const fmtSize = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
async function openMore(g) {
  moreGame = g; $("gamePanel").hidden = false; $("gamePanelTitle").textContent = `More - ${g.title}`; panelState("");
  $("gamePanelBody").innerHTML = `
    <div class="more-sec"><h4>Launch Options</h4>
      <p class="sub">Extra words added after the program's name every time you press Play (and in Steam, if you add it there). The project's README lists what it accepts.</p>
      <div class="row"><input id="moreArgs" type="text" value="${esc(g.launchArgs || "")}" placeholder="for example: --fullscreen" aria-label="Launch options" spellcheck="false"><button id="moreArgsSave" type="button">Save</button></div></div>
    <div class="more-sec"><h4>Disk Space</h4><div id="moreUsage"><p class="sub">Measuring…</p></div></div>
    <div class="more-sec"><h4>Check Game</h4><p class="sub">Makes sure every file the game came with is still there, your game files are still the right ones, and the program can be found.</p>
      <button id="moreCheck" type="button">Check Now</button><div id="moreCheckOut"></div></div>
    <div class="more-sec"><h4>Save Sync</h4><div id="moreSync"></div></div>
    ${g.canWine && settings.platform === "linux" ? `<div class="more-sec"><h4>Runs With</h4><p class="sub">The Proton (or Wine) this Windows version starts with. If a game won't start, another Proton often fixes it.</p>
      <div class="row"><select id="moreRunner" aria-label="Proton or Wine for this game"><option value="">Newest Proton (recommended)</option></select></div></div>` : ""}
    ${catalogOf(g) ? `<div class="more-sec"><h4>How Did It Run?</h4><p class="sub">Tell other players how it went on your computer. Only totals are shown, never who.</p>
      <div class="row" role="group" aria-label="How did it run?">${[["runs", "Runs Well"], ["issues", "Has Issues"], ["no", "Doesn't Run"]].map(([v, l]) => `<button type="button" class="small" data-rep="${v}" aria-pressed="${reports.mine[catalogOf(g).id.toLowerCase()]?.verdict === v}">${l}</button>`).join("")}</div>
      <div class="row" id="moreRepWhy" ${["issues", "no"].includes(reports.mine[catalogOf(g).id.toLowerCase()]?.verdict) ? "" : "hidden"}><label for="moreRepReason">What Went Wrong?</label><select id="moreRepReason" style="width:auto"><option value="">Pick One (Optional)</option><option value="crash">It Crashes</option><option value="graphics">Graphics Problems</option><option value="sound">Sound Problems</option><option value="controls">Controller Problems</option><option value="files">It Wants Files I Gave It</option><option value="other">Something Else</option></select></div>
      <p class="sub"><button type="button" class="small" id="moreBroken">Report Broken Download</button> <span id="moreRepState" role="status" aria-live="polite"></span></p></div>` : ""}
    <div class="more-sec"><h4>Updates</h4>
      <label for="moreAuto">Install Updates By Themselves</label>
      <select id="moreAuto" style="width:auto"><option value="">Use My Setting (${settings.autoUpdateAll ? "On" : "Off"})</option><option value="on">On For This Game</option><option value="off">Off For This Game</option></select>
      ${g.skipTag ? `<p class="sub">You're skipping version ${esc(g.skipTag)}. <button id="moreUnskip" type="button" class="small">Stop Skipping</button></p>` : libUpdate(g) ? `<p class="sub">A newer version is ready. <button id="moreSkip" type="button" class="small">Skip This Version</button></p>` : ""}
      <button id="morePick" type="button">Pick A Version…</button><div id="moreVersions"></div></div>
    <div class="more-sec"><h4>Name And Tags</h4>
      <label for="moreName">Name</label><input id="moreName" type="text" value="${esc(g.title === g.originalTitle ? "" : g.title)}" placeholder="${esc(g.originalTitle)}" maxlength="120">
      <label for="moreTags">Tags</label><input id="moreTags" type="text" value="${esc(g.tags.join(", "))}" placeholder="for example: Favorites, Couch, Finished" spellcheck="false">
      <p class="sub">Separate tags with commas. They show as filters above your shelves.</p>
      <label class="row" style="gap:6px"><input id="moreHidden" type="checkbox" ${g.hidden ? "checked" : ""}> Hide this game from Installed Games</label>
      <div class="row"><button id="moreUserSave" type="button">Save</button></div></div>
    <div class="more-sec"><h4>Desktop Shortcut</h4><p class="sub">Puts an icon on your desktop that starts this game${g.runsHere ? "" : " (through Decomp Buddy, which starts it with Wine)"}.</p>
      <button id="moreShortcut" type="button">Add To Desktop</button></div>
    <div class="more-sec"><h4>Remove Game</h4><p class="sub">Moves this game's whole folder, game files and saves inside it included, to the Trash. You can still get it back from there.</p>
      <div class="row"><button id="moreRemove" type="button" class="danger">Remove Game…</button><button id="moreRemoveYes" type="button" class="danger" hidden>Yes, Move It To The Trash</button><button id="moreRemoveNo" type="button" hidden>Keep It</button></div></div>`;
  if ($("moreRunner")) {
    window.buddy.compatRunners().then((rs) => { $("moreRunner").insertAdjacentHTML("beforeend", rs.map((r) => `<option value="${esc(r.id)}" ${r.id === g.runner ? "selected" : ""}>${esc(r.label)}</option>`).join("")); });
    $("moreRunner").onchange = async () => { await window.buddy.compatSetRunner(g.folder, $("moreRunner").value); g.runner = $("moreRunner").value || null; panelState("Saved. It's used the next time you press Play.", "ok"); };
  }
  if (catalogOf(g)) {
    const id = catalogOf(g).id.toLowerCase(), cur = reports.mine[id];
    if (cur?.reason && $("moreRepReason")) $("moreRepReason").value = cur.reason === "download" ? "" : cur.reason;
    const send = async (verdict, reason) => {
      try {
        const r = await window.buddy.reportSend(id, verdict, reason, g.tag); await loadReports();
        $("gamePanelBody").querySelectorAll("[data-rep]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rep === verdict)));
        $("moreRepWhy").hidden = !["issues", "no"].includes(verdict);
        $("moreRepState").textContent = verdict === null ? "Report taken back." : r.counts ? `Thanks! On ${SYS_LABEL[r.sys] || "computers like yours"}: ${r.counts[0]} runs well, ${r.counts[1]} has issues, ${r.counts[2]} doesn't run.` : "Thanks!";
      } catch (err) { $("moreRepState").textContent = err.message.replace(/^.*Error: /, ""); }
    };
    $("gamePanelBody").querySelectorAll("[data-rep]").forEach((b) => (b.onclick = () => send(b.getAttribute("aria-pressed") === "true" ? null : b.dataset.rep, $("moreRepReason")?.value || null)));
    $("moreRepReason")?.addEventListener("change", () => { const v = reports.mine[id]?.verdict; if (v) send(v, $("moreRepReason").value || null); });
    $("moreBroken").onclick = () => send("no", "download");
  }
  $("moreAuto").value = g.autoUpdate === true ? "on" : g.autoUpdate === false ? "off" : "";
  $("moreAuto").onchange = async () => { await window.buddy.gameSetUser(g.folder, { autoUpdate: { on: true, off: false }[$("moreAuto").value] ?? null }); g.autoUpdate = { on: true, off: false }[$("moreAuto").value] ?? null; panelState("Saved.", "ok"); };
  const curVer = () => catalog.games.find((x) => x.owner && `${x.owner}/${x.repo}`.toLowerCase() === String(g.repo).toLowerCase())?.version;
  $("moreSkip")?.addEventListener("click", async () => { await window.buddy.gameSetUser(g.folder, { skipTag: curVer() }); await renderLibrary(); openMore(library.find((x) => x.key === g.key) || g); });
  $("moreUnskip")?.addEventListener("click", async () => { await window.buddy.gameSetUser(g.folder, { skipTag: null }); await renderLibrary(); openMore(library.find((x) => x.key === g.key) || g); });
  $("morePick").onclick = async () => {
    $("morePick").disabled = true; $("moreVersions").innerHTML = `<p class="sub">Reading the project's releases…</p>`;
    try {
      const rs = await window.buddy.gameReleases(g.folder);
      $("moreVersions").innerHTML = `<p class="sub">Older versions weren't scanned by Decomp Buddy. Your saves are backed up before the switch.</p><div class="srcList">${rs.slice(0, 30).map((r) => `<div class="srcRow"><span></span><div><div class="lab">${esc(r.tag)}${r.current ? " (installed)" : ""}${r.prerelease ? " · pre-release" : ""}</div><div class="u">${esc(fmtDate(r.publishedAt))}</div></div>${r.current ? "" : `<button type="button" class="small" data-ver="${esc(r.tag)}">Install This Version</button>`}</div>`).join("")}</div>`;
    } catch (err) { $("moreVersions").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
    $("morePick").disabled = false;
  };
  $("moreVersions").onclick = async (e) => {
    const b = e.target.closest("[data-ver]"); if (!b) return;
    $("moreVersions").querySelectorAll("button").forEach((x) => (x.disabled = true)); panelState(`Installing ${b.dataset.ver}…`);
    try { const r = await window.buddy.gameInstallVersion(g.folder, b.dataset.ver); panelState(`${r.tag} is installed.`, "ok"); await renderLibrary(); }
    catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); $("moreVersions").querySelectorAll("button").forEach((x) => (x.disabled = false)); }
  };
  $("moreUserSave").onclick = async () => {
    try {
      await window.buddy.gameSetUser(g.folder, { displayName: $("moreName").value, tags: $("moreTags").value.split(","), hidden: $("moreHidden").checked });
      panelState("Saved.", "ok"); await renderLibrary(); moreGame = library.find((x) => x.key === g.key) || g;
    } catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
  };
  $("moreShortcut").onclick = async () => { try { const r = await window.buddy.gameShortcut(g.folder); panelState(`Shortcut added: ${r.file.split(/[\\/]/).pop()}`, "ok"); } catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); } };
  // Two presses, both on this page - no pop-up.
  const confirmRemove = (on) => { $("moreRemove").hidden = on; $("moreRemoveYes").hidden = !on; $("moreRemoveNo").hidden = !on; (on ? $("moreRemoveNo") : $("moreRemove")).focus(); };
  $("moreRemove").onclick = () => confirmRemove(true);
  $("moreRemoveNo").onclick = () => confirmRemove(false);
  $("moreRemoveYes").onclick = async () => {
    try { const r = await window.buddy.gameRemove(g.folder); $("gamePanel").hidden = true; await renderLibrary(); $("libStatus").textContent = `${g.title} moved to the Trash.${r.steam ? " Its Steam shortcut is still in Steam - remove it there." : ""}`; $("libStatus").className = "status ok"; }
    catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); confirmRemove(false); }
  };
  $("moreArgsSave").onclick = async () => { try { await window.buddy.gameSetOptions(g.folder, $("moreArgs").value); g.launchArgs = $("moreArgs").value.trim(); panelState("Launch options saved.", "ok"); } catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); } };
  $("moreCheck").onclick = () => runCheck(g);
  renderUsage(g); renderMoreSync(g);
  $("gamePanel").scrollIntoView({ block: "nearest" });
}
async function renderUsage(g) {
  try {
    const u = await window.buddy.gameUsage(g.folder);
    $("moreUsage").innerHTML = `<p class="sub">This game takes ${fmtSize(u.total)}${u.parts.versions ? ` · old versions ${fmtSize(u.parts.versions)}` : ""}${u.parts.saveBackups ? ` · save backups ${fmtSize(u.parts.saveBackups)}` : ""}${u.parts.mods ? ` · mods ${fmtSize(u.parts.mods)}` : ""}.</p>`
      + (u.reclaim.length ? `<div class="srcList">${u.reclaim.map((r) => `<label class="srcRow"><input type="checkbox" data-reclaim="${r.kind}" checked aria-label="${esc(r.label)}"><div><div class="lab">${esc(r.label)}</div><div class="u">${esc(r.why)}</div></div><span class="sub">${fmtSize(r.bytes)}</span></label>`).join("")}</div>
        <div class="row" style="margin-top:6px"><span class="sub" style="flex:1">Ticked items go to the Trash, so you can still get them back.</span><button id="moreReclaim" type="button">Free Up Space</button></div>`
      : `<p class="sub">Nothing to clear - no old versions, spare save backups or leftover downloads.</p>`);
    $("moreReclaim")?.addEventListener("click", async () => {
      const kinds = [...$("moreUsage").querySelectorAll("[data-reclaim]:checked")].map((c) => c.dataset.reclaim);
      if (!kinds.length) return;
      try { const r = await window.buddy.gameReclaim(g.folder, kinds); panelState(`Moved ${fmtSize(r.freed)} to the Trash${r.failed.length ? ` (some couldn't move: ${r.failed.join("; ")})` : ""}.`, r.failed.length ? "bad" : "ok"); renderUsage(g); }
      catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
    });
  } catch (err) { $("moreUsage").innerHTML = `<p class="sub">${esc(err.message.replace(/^.*Error: /, ""))}</p>`; }
}
const CHECK_ICON = { match: "✓", mismatch: "✗", missing: "✗", unverified: "?" };
async function runCheck(g) {
  $("moreCheck").disabled = true; $("moreCheckOut").innerHTML = `<p class="sub">Checking… large game files take a moment.</p>`;
  try {
    const r = await window.buddy.gameCheck(g.folder);
    const rows = [
      r.exe ? `<li>✓ Program found: ${esc(r.exe)}</li>` : `<li>✗ No program found in the folder - run Update to put it back.</li>`,
      r.missingFiles.length ? `<li>✗ ${r.missingFiles.length} file(s) from the release are gone: ${esc(r.missingFiles.slice(0, 6).join(", "))}${r.missingFiles.length > 6 ? "…" : ""}. Update puts them back.</li>` : r.adopted && !r.tag ? `<li>? This folder was adopted, so there's no list of release files to check yet - Update once and Check can do it.</li>` : `<li>✓ Every file from the release is still there.</li>`,
      ...r.placed.map((p) => `<li>${CHECK_ICON[p.status] || "?"} ${esc(p.label)}: ${esc(p.summary)}</li>`),
      ...r.needed.map((n) => `<li>✗ Still needed: ${esc(n)}</li>`),
      ...(r.runtimes ? [r.runtimes.missing.length ? `<li>✗ Windows is missing: ${esc(r.runtimes.missing.map((x) => x.label).join(", "))} - use Fix Windows Runtimes below.</li>` : `<li>✓ Windows runtimes are installed.</li>`] : []),
    ];
    $("moreCheckOut").innerHTML = `<ul class="sub" style="margin:8px 0 0 18px">${rows.join("")}</ul>${r.runtimes?.missing?.length ? `<button id="moreFixRt" type="button">Fix Windows Runtimes</button>` : ""}`;
    $("moreFixRt")?.addEventListener("click", () => fixRuntimes());
    panelState(r.problems ? `${r.problems} problem(s) found.` : "All good.", r.problems ? "bad" : "ok");
  } catch (err) { $("moreCheckOut").innerHTML = ""; panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
  finally { $("moreCheck").disabled = false; }
}
async function fixRuntimes() {
  panelState("Installing the missing Windows runtimes - Windows may ask for permission…");
  try { const r = await window.buddy.runtimesFix(moreGame?.folder); panelState(r.installed.length ? `Installed ${r.installed.join(", ")}.${r.failed.length ? ` Couldn't install: ${r.failed.join(", ")}.` : ""}` : "Nothing needed installing.", r.failed.length ? "bad" : "ok"); }
  catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
}
async function renderMoreSync(g) {
  const st = await window.buddy.syncStatus();
  if (!st.dir) { $("moreSync").innerHTML = `<p class="sub">Off. Turn it on in Settings → Save Sync to keep this game's saves in step with your other computers.</p>`; return; }
  if (!g.runsHere) { $("moreSync").innerHTML = `<p class="sub">This copy is for another computer - sync its saves from the one that plays it.</p>`; return; }
  const list = await window.buddy.syncList(g.folder).catch(() => []);
  $("moreSync").innerHTML = `<p class="sub">Syncing through ${esc(st.dir)} as ${esc(st.machine)}. Saves go up automatically when the game closes.</p>
    <div class="srcList">${list.length ? list.map((c) => `<div class="srcRow"><span></span><div><div class="lab">${esc(c.machine)}</div><div class="u">${esc(c.at ? fmtDate(c.at) + " " + c.at.slice(11, 16) : c.name)}</div></div>${c.machine === st.machine ? `<span class="sub">this computer</span>` : `<button class="small" type="button" data-pull="${esc(c.file)}">Use This Save</button>`}</div>`).join("") : `<p class="sub">Nothing synced for this game yet.</p>`}</div>
    <div class="row" style="margin-top:6px"><span style="flex:1"></span><button id="moreSyncNow" type="button">Sync Now</button></div>`;
  $("moreSyncNow").onclick = async () => { try { const r = await window.buddy.syncPush(g.folder); panelState(`Saves synced (${r.file}).`, "ok"); renderMoreSync(g); } catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); } };
  $("moreSync").querySelectorAll("[data-pull]").forEach((b) => (b.onclick = () => pullSave(g.folder, b.dataset.pull, () => renderMoreSync(g))));
}
async function pullSave(folder, file, after) {
  if (!confirm("Replace this computer's saves with the synced one? The saves here now are backed up first (Saves → Restore brings them back).")) return;
  try { await window.buddy.syncPull(folder, file); $("libStatus").textContent = "Save restored from your sync folder."; $("libStatus").className = "status ok"; }
  catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
  after?.();
}

// ---- Newer saves waiting from another computer
async function renderSyncBanner() {
  const list = await window.buddy.syncCheck().catch(() => []);
  $("syncBanner").hidden = !list.length;
  $("syncBanner").innerHTML = list.length ? `<strong>Newer Saves From Another Computer</strong><div class="srcList" style="margin-top:6px">${list.map((x) => `<div class="srcRow"><span></span><div><div class="lab" translate="no">${esc(x.title)}</div><div class="u">from ${esc(x.machine)}, ${esc(fmtDate(x.at))}</div></div><button class="small primary" type="button" data-bpull="${esc(x.file)}" data-folder="${esc(x.folder)}">Use It</button></div>`).join("")}</div>` : "";
  $("syncBanner").querySelectorAll("[data-bpull]").forEach((b) => (b.onclick = () => pullSave(b.dataset.folder, b.dataset.bpull, renderSyncBanner)));
}

// ---- Adopt A Folder: a game you set up by hand becomes a Library game.
$("libAdopt").onclick = async () => {
  try {
    const r = await window.buddy.gameAdoptPick(); if (!r) return;
    if (!catalog.games.length) await loadCatalog({ refresh: false }).catch(() => {});
    $("gamePanel").hidden = false; $("gamePanelTitle").textContent = "Adopt A Folder"; panelState("");
    const opts = (list) => list.map((x) => `<option value="${esc(x.id)}">${esc(x.title)} - ${esc(x.console || "")} (${esc(x.repo)})</option>`).join("");
    $("gamePanelBody").innerHTML = `<p class="sub">${esc(r.folder)}</p>
      <div class="cfgrow"><label for="adoptGame">Which Game Is This?</label><select id="adoptGame">${r.guesses.length ? opts(r.guesses) : ""}<option value="">Search the catalog…</option></select></div>
      <div class="cfgrow" id="adoptSearchRow" ${r.guesses.length ? "hidden" : ""}><label for="adoptSearch">Search</label><input id="adoptSearch" type="text" placeholder="Game or project name" spellcheck="false"></div>
      <div class="cfgrow"><label for="adoptTarget">Built For</label><select id="adoptTarget">${Object.entries(TARGET_LABEL).map(([k, v]) => `<option value="${k}" ${k === (r.target || "windows") ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
      <p class="sub">${r.target ? "Worked out from the files in the folder." : "Couldn't tell from the files - pick the right one."} Nothing in the folder is moved or changed; Decomp Buddy only adds its small decomp-buddy.json note.</p>
      <button id="adoptGo" class="primary" type="button">Adopt</button>`;
    $("adoptGame").onchange = () => { $("adoptSearchRow").hidden = !!$("adoptGame").value; if (!$("adoptGame").value) $("adoptSearch").focus(); };
    $("adoptSearch").oninput = () => {
      const q = normTitle($("adoptSearch").value); if (q.length < 2) return;
      const hits = catalog.games.filter((g) => g.owner && normTitle(`${g.title}${g.project || ""}${g.repo}`).includes(q)).slice(0, 20).map((g) => ({ id: g.id, title: g.title, console: g.console, repo: `${g.owner}/${g.repo}` }));
      $("adoptGame").innerHTML = opts(hits) + `<option value="">Search the catalog…</option>`;
    };
    $("adoptGo").onclick = async () => {
      const gameId = $("adoptGame").value; if (!gameId) { panelState("Pick the game this folder holds.", "bad"); return; }
      try { const a = await window.buddy.gameAdopt({ folder: r.folder, gameId, target: $("adoptTarget").value }); panelState(`Adopted as ${a.title}. It's on your shelf now - Update brings it to the latest release.`, "ok"); renderLibrary(); }
      catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
    };
  } catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
};

// ---- Settings → Save Sync
async function renderSyncSettings() {
  const st = await window.buddy.syncStatus();
  $("syncState").textContent = st.dir ? `On: ${st.dir} (this computer is ${st.machine}).` : st.candidates.length ? "Off. Pick your cloud drive:" : "Off. No cloud drive found on this computer - choose any synced folder.";
  $("syncOff").hidden = !st.dir;
  $("syncPicks").innerHTML = st.dir ? "" : st.candidates.map((c) => `<button type="button" data-syncdir="${esc(c.path)}" title="${esc(c.path)}">${esc(c.label)}</button>`).join("");
  $("syncPicks").querySelectorAll("[data-syncdir]").forEach((b) => (b.onclick = async () => { await window.buddy.syncSet({ dir: b.dataset.syncdir }); renderSyncSettings(); }));
}
$("syncChoose").onclick = async () => { await window.buddy.syncSet({ choose: true }); renderSyncSettings(); };
$("syncOff").onclick = async () => { await window.buddy.syncSet({ off: true }); renderSyncSettings(); };
document.querySelector('nav.side button[data-nav="settings"]')?.addEventListener("click", renderSyncSettings);

// ---- Settings → Windows Games On This Mac (Wine)
async function renderProton() {
  const runners = await window.buddy.compatRunners();
  $("protonSection").hidden = settings.platform !== "linux"; if (settings.platform !== "linux") return;
  $("protonState").textContent = runners.length ? `Found: ${runners.map((r) => r.label).join(", ")}. Windows copies in Installed Games get a Play With Proton button.` : "No Proton or Wine found yet. Install Proton from your Steam Library, then come back here.";
}
async function renderWine() {
  renderProton();
  const st = await window.buddy.wineStatus();
  $("wineSection").hidden = !st.supported;
  if (!st.supported) return;
  $("wineState").textContent = st.installed ? `Wine ${st.tag} is set up. Windows copies in Installed Games get a Play With Wine button.` : !st.rosetta ? "Needs Rosetta 2 first: open Terminal and run  softwareupdate --install-rosetta  (it asks for your password), then come back." : "Not set up. About 190 MB from Gcenx's macOS Wine builds on GitHub.";
  $("wineInstall").hidden = st.installed; $("wineInstall").disabled = !st.rosetta; $("wineRemove").hidden = !st.installed; $("wineCancel").hidden = true;
}
$("wineInstall").onclick = async () => {
  $("wineInstall").disabled = true; $("wineCancel").hidden = false; $("wineState").textContent = "Downloading Wine…";
  const onLog = (m) => { if (/Wine|Unpacking|Downloading|%/.test(m)) $("wineState").textContent = m; };
  window.buddy.onLog(onLog);
  try { await window.buddy.wineInstall(); } catch (err) { $("wineState").textContent = err.message.replace(/^.*Error: /, ""); $("wineInstall").disabled = false; $("wineCancel").hidden = true; return; }
  renderWine();
};
$("wineCancel").onclick = () => window.buddy.wineCancel();
$("wineRemove").onclick = async () => { if (!confirm("Remove Wine? It goes to the Trash; your games aren't touched.")) return; await window.buddy.wineRemove(); renderWine(); };
document.querySelector('nav.side button[data-nav="settings"]')?.addEventListener("click", renderWine);

// ---- Offline Pack
$("libPack").onclick = () => {
  $("gamePanel").hidden = false; $("gamePanelTitle").textContent = "Offline Pack"; panelState("");
  $("gamePanelBody").innerHTML = `<p class="sub">Everything a computer with no internet needs, in one folder on any drive: the games you tick (without old versions), an install.html explaining each, the Windows runtimes they need, and - if you like - Decomp Buddy for Windows itself.</p>
    <div class="srcList">${library.map((g) => `<label class="srcRow"><input type="checkbox" data-packg="${esc(g.folder)}" aria-label="Include ${esc(g.title)}"><div><div class="lab" translate="no">${esc(g.title)}</div><div class="u">${esc(TARGET_LABEL[g.target] || g.target)}${g.tag ? ` · ${esc(g.tag)}` : ""}</div></div><span></span></label>`).join("") || `<p class="sub">Nothing set up yet.</p>`}</div>
    <label class="check"><input id="packRuntimes" type="checkbox" checked> Include the Windows runtimes these games need (from Microsoft)</label>
    <label class="check"><input id="packApp" type="checkbox"> Include Decomp Buddy for Windows (portable, about 120 MB)</label>
    <div class="row" style="margin-top:8px"><span class="sub" id="packSize" style="flex:1"></span><button id="packGo" class="primary" type="button">Choose Where And Make It…</button></div>`;
  const picked = () => [...$("gamePanelBody").querySelectorAll("[data-packg]:checked")].map((c) => c.dataset.packg);
  $("gamePanelBody").querySelectorAll("[data-packg]").forEach((c) => (c.onchange = async () => { const f = picked(); $("packSize").textContent = f.length ? `${f.length} game(s), about ${fmtSize(await window.buddy.packSize(f))} before runtimes.` : ""; }));
  $("packGo").onclick = async () => {
    const folders = picked(); if (!folders.length) { panelState("Tick at least one game.", "bad"); return; }
    $("packGo").disabled = true; panelState("Making the pack… big games take a few minutes.");
    try { const r = await window.buddy.packMake({ folders, includeApp: $("packApp").checked, includeRuntimes: $("packRuntimes").checked }); if (r) { panelState(`Done: ${r.games} game(s)${r.runtimes.length ? `, ${r.runtimes.join(", ")}` : ""}${r.app ? ", Decomp Buddy for Windows" : ""}. Open START HERE.txt in the pack.`, "ok"); window.buddy.open(r.dir); } else panelState(""); }
    catch (err) { panelState(err.message.replace(/^.*Error: /, ""), "bad"); }
    finally { $("packGo").disabled = false; }
  };
};

// ---- Patch A ROM (standalone): the patched copy goes next to the original, which is never changed.
$("libPatch").onclick = async () => {
  try {
    const r = await window.buddy.patchStandalone(); if (!r) return;
    $("libStatus").textContent = `Made ${r.out.split(/[\\/]/).pop()} - ${r.summary}.`; $("libStatus").className = "status ok";
    window.buddy.open(r.out.replace(/[\\/][^\\/]+$/, ""));
  } catch (err) { $("libStatus").textContent = err.message.replace(/^.*Error: /, ""); $("libStatus").className = "status bad"; }
};
