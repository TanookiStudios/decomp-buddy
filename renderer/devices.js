// Phones And Headsets: the setup checklists, Google's Platform-Tools download, and one card per plugged-in
// device with the games on it. Polls devices:list every 2 s, only while this screen is open.
// Shares app.js's globals ($, esc, settings, TARGET_LABEL, renderLibrary).

let devTimer = null, devData = null, devDrawn = "", devBusy = false, devConfirm = null, devPolling = false;
const DEV_KIND = { quest: "Meta Quest", android: "Android Phone Or Handheld" };
const DEV_STATE = { device: "Ready", unauthorized: "Waiting For You To Allow It", offline: "Offline", "no permissions": "No Permission" };
const devTell = (m, cls = "") => { $("devState").textContent = m; $("devState").className = `status ${cls}`; };
const devErr = (err) => devTell(String(err.message || err).replace(/^.*Error: /, ""), "bad");

function devicesView(open) {
  clearInterval(devTimer); devTimer = null;
  if (!open) return;
  $("devWinDriver").hidden = settings.platform !== "win32";
  devPoll(); devTimer = setInterval(devPoll, 2000);
}
async function devPoll() {
  if (devPolling) return; devPolling = true;
  try { devData = await window.buddy.devicesList(); devRender(); } catch (err) { devErr(err); } finally { devPolling = false; }
}

function devRender() {
  const d = devData; if (!d) return;
  $("devTools").hidden = d.adb; $("devAgree").checked = d.licensed;
  const ready = (kind) => d.devices.some((x) => x.state === "device" && x.kind === kind);
  const waiting = d.devices.some((x) => x.state === "unauthorized");
  $("devQuestState").textContent = !d.adb ? "Download Platform-Tools First" : ready("quest") ? "Ready" : waiting ? "Put On The Headset And Allow" : "Not Seen";
  $("devPhoneState").textContent = !d.adb ? "Download Platform-Tools First" : ready("android") ? "Ready" : waiting ? "Unlock The Phone And Allow" : "Not Seen";
  // Redraw only when something changed, so a button isn't swapped out from under the pointer.
  const key = JSON.stringify([d.devices, d.games, devBusy, devConfirm]);
  if (key === devDrawn) return; devDrawn = key;
  const row = (g, acts) => `<div class="srcRow" data-folder="${esc(g.folder)}"><span class="lab" translate="no">${esc(g.title)}</span><span class="u wrap">${esc(g.statusDetail)}</span><span class="row-acts">${acts}</span></div>`;
  const btn = (act, label, aria, extra = "") => `<button type="button" class="small" data-dev="${act}" aria-label="${esc(aria)}" ${devBusy ? "disabled" : ""} ${extra}>${label}</button>`;
  $("devCards").innerHTML = d.devices.map((x) => {
    const name = x.model || x.serial;
    const on = d.games.filter((g) => g.serial === x.serial);
    const later = x.state === "device" ? d.games.filter((g) => !g.serial && g.target === x.kind && g.status === "staged") : [];
    return `<div class="addGame" data-serial="${esc(x.serial)}" role="region" aria-label="${esc(name)}">
      <div class="row"><strong style="flex:1" translate="no">${esc(name)}</strong><span class="sub">${esc([DEV_KIND[x.kind], DEV_STATE[x.state] || x.state].filter(Boolean).join(" · "))}</span></div>
      ${x.help ? `<p class="sub">${esc(x.help)}</p>` : ""}
      ${on.length ? `<div class="srcList">${on.map((g) => row(g, devConfirm === g.folder
        ? `<span class="sub">Remove It From ${esc(name)}? Its saves stay on the device.</span>${btn("removeYes", "Remove", `Yes, remove ${g.title}`)}${btn("removeNo", "Cancel", `Keep ${g.title}`)}`
        : `${btn("launch", "Launch", `Launch ${g.title} on ${name}`, g.packageId && x.state === "device" ? "" : `disabled title="${g.packageId ? "The device isn't ready" : "Start it on the device - Decomp Buddy doesn't know its app name"}"`)}${btn("install", "Reinstall", `Reinstall ${g.title} on ${name}`)}${btn("remove", "Remove", `Remove ${g.title} from ${name}`)}`)).join("")}</div>`
        : `<p class="sub">No games from Decomp Buddy on it yet.</p>`}
      ${later.length ? `<div class="sub">Ready To Install</div><div class="srcList">${later.map((g) => row(g, btn("install", "Install", `Install ${g.title} on ${name}`))).join("")}</div>` : ""}
    </div>`;
  }).join("") || (d.adb ? `<p class="sub">Nothing plugged in yet. Follow the steps above, then plug it in.</p>` : "");
  if (d.error) devTell(d.error, "bad");
}

$("devCards").onclick = async (e) => {
  const b = e.target.closest("[data-dev]"); if (!b || devBusy) return;
  const folder = b.closest("[data-folder]").dataset.folder, serial = b.closest("[data-serial]").dataset.serial, act = b.dataset.dev;
  if (act === "remove") { devConfirm = folder; return devRender(); }
  if (act === "removeNo") { devConfirm = null; return devRender(); }
  devBusy = true; devConfirm = null; devRender();
  try {
    if (act === "launch") { const r = await window.buddy.devicesLaunch(folder); devTell(`Started ${r.exe}.`, "ok"); }
    else if (act === "install") { devTell("Installing…"); const r = await window.buddy.devicesInstall(folder, serial); devTell(`Installed${r.pushed ? `, with ${r.pushed} file(s) copied` : ""}.`, "ok"); }
    else if (act === "removeYes") { await window.buddy.devicesRemove(folder); devTell("Removed. Its saves stayed on the device.", "ok"); }
  } catch (err) { devErr(err); }
  finally { devBusy = false; await devPoll(); }
};
window.buddy.onLog((m) => { if (devBusy && $("devState").textContent !== m) devTell(m); });

$("devAgree").onchange = async () => { await window.buddy.devicesAgree($("devAgree").checked); await devPoll(); };
$("devTerms").onclick = (e) => { e.preventDefault(); window.buddy.openExternal(devData?.terms || "https://developer.android.com/studio/terms"); };
document.querySelectorAll("[data-devlink]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.buddy.openExternal(a.dataset.devlink); }));
$("devGetTools").onclick = async () => {
  if (!$("devAgree").checked) return devTell("Tick the box to agree to Google's Android SDK terms first.", "bad");
  $("devGetTools").disabled = true; devBusy = true; devTell("Downloading…");
  try { const r = await window.buddy.devicesInstallTools(); devTell(`Android Platform-Tools ${r.version} is ready.`, "ok"); }
  catch (err) { devErr(err); }
  finally { devBusy = false; $("devGetTools").disabled = false; await devPoll(); }
};

// Install From GitHub with a phone/headset target: Set Up asks which plugged-in device (or stages it for later).
async function fillSetupDevices() {
  const row = $("setupDeviceRow"); row.hidden = settings.targetKind !== "device"; if (row.hidden) return;
  const keep = $("setupDevice").value;
  const r = await window.buddy.devicesList().catch(() => null);
  const ready = (r?.devices || []).filter((x) => x.state === "device" && x.kind === settings.target);
  $("setupDevice").innerHTML = `<option value="">Stage It For Later</option>` + ready.map((x) => `<option value="${esc(x.serial)}">${esc(x.model || x.serial)}</option>`).join("");
  $("setupDevice").value = ready.some((x) => x.serial === keep) ? keep : ready[0]?.serial || "";
}
// After Set Up: install each staged game on the chosen device. Returns a line for the status bar.
async function installAfterSetup(results, outDir) {
  const serial = settings.targetKind === "device" && $("setupDevice").value; if (!serial) return "";
  const sep = outDir.includes("\\") ? "\\" : "/", done = [], failed = [];
  status("Installing on the device…");
  for (const r of results.filter((x) => x.ok && x.manifest?.status === "staged")) {
    try { await window.buddy.devicesInstall(`${outDir}${sep}${r.manifest.folder}`, serial); done.push(r.manifest.plan.game_title); }
    catch (err) { failed.push(`${r.manifest.plan.game_title}: ${String(err.message).replace(/^.*Error: /, "")}`); }
  }
  return [done.length && `Installed on the device: ${done.join(", ")}.`, failed.length && `Not installed - ${failed.join("; ")}`].filter(Boolean).join(" ");
}
