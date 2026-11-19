// How It Runs: asking how a game ran (after a play session, or from More…), and showing what players said on a
// game's page. Shares app.js / more.js globals ($, esc, catalog, catalogOf, reports, loadReports, library, settings, fmtDate).
const RAN = { runs: "Plays Great", issues: "Has Problems", no: "Won't Run" };
const RAN_ORDER = ["runs", "issues", "no"];
// One line for a computer; an Apple chip is both the processor and the graphics, so it's said once.
const pcLine = (c) => [...new Set([c.os, c.cpu, c.gpu, c.ram && `${c.ram} GB`].filter(Boolean))].join(" · ");

// The card: pick how it ran, add a few words if you like, see exactly what goes with it, send.
// lib = an installed game. preset = a verdict already picked (from More…); asked = it came up by itself after playing.
async function askHowItRan(lib, { preset = null, asked = false } = {}) {
  const cat = catalogOf(lib); if (!cat) return;
  const id = cat.id.toLowerCase(), cur = reports.mine[id] || {}, pc = await window.buddy.reportComputer().catch(() => null);
  const el = $("ranAsk"); let verdict = preset || cur.verdict || null;
  el.innerHTML = `<h3 id="ranTitle">How Did It Run?</h3><p style="margin:0" translate="no"><strong>${esc(lib.title)}</strong></p>
    <div class="row" role="group" aria-labelledby="ranTitle">${RAN_ORDER.map((v) => `<button type="button" class="small" data-ran="${v}" aria-pressed="${v === verdict}">${RAN[v]}</button>`).join("")}</div>
    <div class="row" id="ranWhy"><label for="ranReason">What Went Wrong?</label><select id="ranReason" style="width:auto"><option value="">Pick One (Optional)</option><option value="crash">It Crashes</option><option value="graphics">Graphics Problems</option><option value="sound">Sound Problems</option><option value="controls">Controller Problems</option><option value="files">It Wants Files I Gave It</option><option value="other">Something Else</option></select></div>
    <label for="ranNote">Anything To Add? (Optional)</label><textarea id="ranNote" rows="2" maxlength="500">${esc(cur.note || "")}</textarea>
    ${pc ? `<label class="check"><input id="ranPc" type="checkbox" ${cur.pc === false ? "" : "checked"}> Include My Computer</label><p class="sub" id="ranPcLine" translate="no">${esc(pcLine(pc))}</p>` : ""}
    <p class="sub">Other players see this on the game's page. It never says who you are.</p>
    <div class="row"><button type="button" class="primary" id="ranSend">Send Report</button><button type="button" id="ranLater">Not Now</button>${asked ? `<button type="button" id="ranNever">Don't Ask Again</button>` : ""}</div>
    <p class="sub" id="ranState" role="status" aria-live="polite"></p>`;
  if (cur.reason && cur.reason !== "download") $("ranReason").value = cur.reason;
  const sync = () => { el.querySelectorAll("[data-ran]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ran === verdict))); $("ranWhy").hidden = !["issues", "no"].includes(verdict); $("ranSend").disabled = !verdict; };
  el.querySelectorAll("[data-ran]").forEach((b) => (b.onclick = () => { verdict = b.dataset.ran; sync(); }));
  const close = () => { el.hidden = true; el.innerHTML = ""; };
  $("ranLater").onclick = close;
  if ($("ranNever")) $("ranNever").onclick = () => { settings.askAfterPlay = false; $("askAfterPlay").checked = false; close(); window.buddy.setSettings({ askAfterPlay: false }); };
  $("ranSend").onclick = async () => {
    $("ranSend").disabled = true;
    try {
      await window.buddy.reportSend(id, verdict, ["issues", "no"].includes(verdict) ? $("ranReason").value || null : null, lib.tag, { note: $("ranNote").value.trim(), withComputer: !!$("ranPc")?.checked });
      await loadReports(); $("ranState").textContent = "Thanks! Your report is in."; setTimeout(close, 1800);
      if (!$("gamePanel")?.hidden && typeof openMore === "function" && $("moreRepState")) $("moreRepState").textContent = "Thanks! Your report is in.";
    } catch (err) { $("ranState").textContent = err.message.replace(/^.*Error: /, ""); $("ranSend").disabled = false; }
  };
  sync(); el.hidden = false; if (!asked) (el.querySelector('[aria-pressed="true"]') || el.querySelector("[data-ran]")).focus();
}

// After a play session: ask once per game per version, unless they've said not to.
async function gamePlayed({ folder }) {
  if (settings.askAfterPlay === false || !$("ranAsk").hidden) return;
  if (!library.length) library = await window.buddy.libraryList().catch(() => []);
  const lib = library.find((x) => x.folder === folder), cat = lib && catalogOf(lib); if (!cat) return;
  const mine = reports.mine[cat.id.toLowerCase()];
  if (mine && (mine.tag || null) === (lib.tag || null)) return;
  await askHowItRan(lib, { asked: true });
}
window.buddy.onGamePlayed(gamePlayed);
$("askAfterPlay").onchange = () => { settings.askAfterPlay = $("askAfterPlay").checked; window.buddy.setSettings({ askAfterPlay: $("askAfterPlay").checked }); };

// ---- On a game's page: what players said.
const ranDay = (day) => { const d = Math.round((new Date(new Date().toISOString().slice(0, 10)) - new Date(day)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : fmtDate(`${day}T12:00:00`); }; // noon: a bare date is UTC midnight, the day before here
const ranRow = (r) => `<li><div class="rhead"><span class="rdot ${r.verdict}" aria-hidden="true"></span><strong>${RAN[r.verdict]}</strong><span class="sub" translate="no">${esc([r.tag, ranDay(r.day)].filter(Boolean).join(" · "))}</span></div>${pcLine(r) ? `<div class="sub" translate="no">${esc(pcLine(r))}</div>` : ""}${r.note ? `<p translate="no">${esc(r.note)}</p>` : ""}</li>`;
// d = the site's answer for one game ({ all, tags, recent }); version = the catalog's current version.
// What the bar shows. With fewer than three reports each answer starts with one share, so a game nobody has
// reported on is even thirds and every report moves it; from three reports on it's exactly what players said.
const barShares = (c) => (c[0] + c[1] + c[2] >= 3 ? c : c.map((x) => x + 1));
// How many reports a game needs before the card shows numbers (Maddie, 18 Nov 2026: no counts until we're more popular).
const COUNTS_AT = 25;
function howItRunsHtml(d, version, { only = false, open = false } = {}) {
  const total = d.all[0] + d.all[1] + d.all[2], counts = total >= COUNTS_AT;
  const mineV = version && d.tags[version], c = only && mineV ? mineV : d.all, n = c[0] + c[1] + c[2], pct = n ? Math.round((c[0] / n) * 100) : 0, bar = barShares(c);
  const list = d.recent.filter((r) => !only || r.tag === version), shown = open ? list : list.slice(0, 3);
  return `<div class="hir"><div class="rtop"><h3>How It Runs</h3>${counts ? `<span class="sub">${total} Reports</span>` : ""}</div>
    ${n >= 3 ? `<p class="rbig"><b class="${pct >= 75 ? "runs" : pct >= 40 ? "issues" : "no"}">${pct}%</b> <span class="sub"><span>${only && mineV ? "This Version" : "All Versions"}</span>${only && mineV ? ` <span translate="no">(${esc(version)})</span>` : ""} · <span>Plays Great</span></span></p>` : ""}
    <div class="rbar" role="img" aria-label="${n >= 3 ? `Mostly ${RAN[RAN_ORDER[c.indexOf(Math.max(...c))]]}` : "Early days: not enough reports for a score yet"}">${RAN_ORDER.map((v, i) => (bar[i] ? `<span class="${v}" style="flex:${bar[i]}"></span>` : "")).join("")}</div>
    <div class="rcounts">${RAN_ORDER.map((v, i) => `<div><span class="rdot ${v}" aria-hidden="true"></span>${RAN[v]}${counts ? ` <b>${c[i]}</b>` : ""}</div>`).join("")}</div>
    ${mineV && total >= 3 ? `<div class="row" role="group" aria-label="Which versions"><button type="button" class="small" data-runs="all" aria-pressed="${!only}">All Versions</button><button type="button" class="small" data-runs="only" aria-pressed="${only}">This Version</button></div>` : ""}
    ${shown.length ? `<ul class="rlist">${shown.map(ranRow).join("")}</ul>` : `<p class="sub">Played it? Decomp Buddy asks how it ran when you close the game.</p>`}
    ${list.length > 3 && !open ? `<button type="button" data-runs="open">More Reports</button>` : ""}</div>`;
}
async function showHowItRuns(g) {
  const box = $("detailRuns"); box.innerHTML = "";
  const d = g?.id ? await window.buddy.reportGame(g.id).catch(() => null) : null;
  if (!d || detailGame !== g) return;
  const st = { only: false, open: false }, draw = () => { box.innerHTML = howItRunsHtml(d, g.version, st); };
  box.onclick = (e) => { const b = e.target.closest("[data-runs]"); if (!b) return; if (b.dataset.runs === "open") st.open = true; else st.only = b.dataset.runs === "only"; draw(); box.querySelector(`[data-runs="${b.dataset.runs}"]`)?.focus(); };
  draw();
}

// ---- On a game's page: How To Set Up (what you bring, the first start) and, when its project says so, AI-Assisted.
async function showSetup(g) {
  const box = $("detailSetup"); box.innerHTML = "";
  const ai = aiState(g) === "assisted" ? `<div class="hir"><div><span class="badge ai">AI-Assisted</span></div><p style="margin:0">Its project says AI tools helped with its code.${g.facts?.ai_quote ? ` <span class="sub" translate="no">“${esc(g.facts.ai_quote)}”</span>` : ""}</p><p class="sub" style="margin:0">Rather not see AI-assisted games? Tick Hide AI-Assisted in Browse Games.</p></div>` : "";
  box.innerHTML = ai;
  const c = g?.owner ? await window.buddy.planSetup({ owner: g.owner, repo: g.repo, host: g.repoHost, gameTitle: g.gameTitle || "" }).catch(() => null) : null;
  if (!c || detailGame !== g) return;
  box.innerHTML = `<div class="hir"><h3>How To Set Up</h3>
    ${c.files.length ? `<p style="margin:0"><strong>You Bring</strong></p><ul class="setupList" translate="no">${c.files.map((f) => `<li><strong>${esc(f.label)}</strong>${f.description ? ` - ${esc(f.description)}` : ""}</li>`).join("")}</ul>` : `<p style="margin:0">Nothing of your own is needed.</p>`}
    ${c.steps.length ? `<p style="margin:0"><strong>The First Time It Starts</strong></p><ol class="setupList" translate="no">${c.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    <p class="sub" style="margin:0">Decomp Buddy does the downloading and unpacking for you. These notes are condensed from the project's own instructions.</p></div>${ai}`;
}
