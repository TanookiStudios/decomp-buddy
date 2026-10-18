// Make It Yours (Settings): accent color, background picture and music, Installed Games layout.
// Saved as one `look` setting; the picture and music are copies the main process keeps and hands back.
// Shares app.js globals ($, settings, refresh).

const lookShown = { bgImage: null, music: null };
// Black or white text on the accent, whichever reads better (WCAG relative luminance).
function accentFg(hex) {
  const lin = (c) => { c = parseInt(c, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
}
async function applyLook() {
  const l = settings.look || {}, root = document.documentElement.style, main = document.querySelector("body > main"), audio = $("lookMusic");
  if (l.accent) { root.setProperty("--accent", l.accent); root.setProperty("--accentfg", accentFg(l.accent)); } else { root.removeProperty("--accent"); root.removeProperty("--accentfg"); }
  $("shelves").className = `shelf-wrap layout-${l.layout || "grid"}`; $("shelves").style.setProperty("--cardsize", `${l.cardSize || 150}px`);
  main.style.setProperty("--bgdim", `${Math.round((l.bgDim ?? 0.6) * 100)}%`);
  audio.volume = l.musicVolume ?? 0.5;
  lookControls(l);
  if (l.bgImage !== lookShown.bgImage) {
    lookShown.bgImage = l.bgImage;
    const url = l.bgImage ? await window.buddy.lookMedia("image").catch(() => null) : null;
    main.style.setProperty("--lookimg", url ? `url("${url}")` : "none"); main.classList.toggle("lookbg", !!url);
  }
  if (l.music !== lookShown.music) {
    lookShown.music = l.music;
    if (audio.src) { URL.revokeObjectURL(audio.src); audio.removeAttribute("src"); audio.load(); }
    const m = l.music ? await window.buddy.lookMedia("music").catch(() => null) : null;
    if (m) audio.src = URL.createObjectURL(new Blob([m.bytes], { type: m.type }));
  }
  lookMusic();
}
// Plays only while switched on and the window is showing: never on first run (it starts off).
function lookMusic() {
  const audio = $("lookMusic");
  if (settings.look?.musicOn && audio.src && !document.hidden) audio.play().catch(() => {}); else audio.pause();
}
document.addEventListener("visibilitychange", lookMusic);

function lookControls(l) {
  for (const b of $("accentSwatches").querySelectorAll("[data-accent]")) b.setAttribute("aria-pressed", String(b.dataset.accent === (l.accent || "")));
  if (l.accent) $("accentCustom").value = l.accent;
  $("bgState").textContent = l.bgImage ? "A picture is set." : "No picture.";
  $("bgRemove").hidden = !l.bgImage;
  $("bgDim").value = Math.round((l.bgDim ?? 0.6) * 100); $("bgDimVal").textContent = `${$("bgDim").value}%`;
  $("musicState").textContent = l.music ? "Music is set." : "No music.";
  $("musicRemove").hidden = !l.music;
  $("musicOn").checked = !!l.musicOn;
  $("musicVolume").value = Math.round((l.musicVolume ?? 0.5) * 100); $("musicVolumeVal").textContent = `${$("musicVolume").value}%`;
  $("lookLayout").value = l.layout || "grid";
  $("cardSize").value = l.cardSize || 150; $("cardSizeVal").textContent = `${$("cardSize").value} px`;
}

const lookSay = (m, cls = "") => { $("lookState").textContent = m; $("lookState").className = `sub ${cls}`; };
async function setLook(patch) {
  try { await window.buddy.setSettings({ look: patch }); settings = await window.buddy.getSettings(); await applyLook(); lookSay(""); }
  catch (err) { lookSay(err.message.replace(/^.*Error: /, ""), "bad"); }
}
async function chooseLook(kind) {
  try { const look = await window.buddy.lookChoose(kind); if (!look) return; settings.look = look; await applyLook(); lookSay(kind === "image" ? "Picture set." : "Music set - switch on Play Music to hear it.", "ok"); }
  catch (err) { lookSay(err.message.replace(/^.*Error: /, ""), "bad"); }
}
$("accentSwatches").addEventListener("click", (e) => { const b = e.target.closest("[data-accent]"); if (b) setLook({ accent: b.dataset.accent }); });
$("accentCustom").onchange = () => setLook({ accent: $("accentCustom").value });
$("bgChoose").onclick = () => chooseLook("image");
$("bgRemove").onclick = () => setLook({ bgImage: "" });
$("bgDim").oninput = () => { $("bgDimVal").textContent = `${$("bgDim").value}%`; document.querySelector("body > main").style.setProperty("--bgdim", `${$("bgDim").value}%`); };
$("bgDim").onchange = () => setLook({ bgDim: Number($("bgDim").value) / 100 });
$("musicChoose").onclick = () => chooseLook("music");
$("musicRemove").onclick = () => setLook({ music: "", musicOn: false });
$("musicOn").onchange = () => setLook({ musicOn: $("musicOn").checked });
$("musicVolume").oninput = () => { $("musicVolumeVal").textContent = `${$("musicVolume").value}%`; $("lookMusic").volume = Number($("musicVolume").value) / 100; };
$("musicVolume").onchange = () => setLook({ musicVolume: Number($("musicVolume").value) / 100 });
$("lookLayout").onchange = () => setLook({ layout: $("lookLayout").value });
$("cardSize").oninput = () => { $("cardSizeVal").textContent = `${$("cardSize").value} px`; $("shelves").style.setProperty("--cardsize", `${$("cardSize").value}px`); };
$("cardSize").onchange = () => setLook({ cardSize: Number($("cardSize").value) });
$("lookReset").onclick = async () => { await setLook(null); lookSay("Back to the standard look.", "ok"); };
// refresh() (app.js) may have finished before this script ran; it calls applyLook itself after that.
if (settings.look) applyLook();
