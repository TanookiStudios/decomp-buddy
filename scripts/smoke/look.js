const out = {};
const cssVar = (el, v) => getComputedStyle(el).getPropertyValue(v).trim();
const root = document.documentElement, main = document.querySelector("body > main");
const change = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); };
await refresh(); await wait(800);
// The seeded picture and music: picture behind the main area, music loaded but not playing (Play Music is off).
out.bgOn = main.classList.contains("lookbg") && /^url\("data:image\/png;base64,/.test(cssVar(main, "--lookimg"));
out.bgDim = cssVar(main, "--bgdim");
out.music = $("lookMusic").src.startsWith("blob:") && $("lookMusic").paused;
showView("settings");
$("accentSwatches").querySelector('[data-accent="#e0a53a"]').click(); await wait(500);
out.gold = `${cssVar(root, "--accent")} on ${cssVar(root, "--accentfg")}`;
out.goldPressed = $("accentSwatches").querySelector('[data-accent="#e0a53a"]').getAttribute("aria-pressed");
change("accentCustom", "#1d4ed8"); await wait(500);
out.custom = `${cssVar(root, "--accent")} on ${cssVar(root, "--accentfg")}`;
root.dataset.theme = "dark"; out.customInDark = cssVar(root, "--accent"); root.dataset.theme = "";
// The primary button actually takes it.
out.primaryBg = getComputedStyle($("analyze")).backgroundColor;
change("lookLayout", "list"); await wait(400);
showView("library"); await wait(1500);
out.listClass = $("shelves").className; out.listCover = getComputedStyle(document.querySelector("#shelves .book .cover")).width;
showView("settings"); change("lookLayout", "compact"); change("cardSize", "200"); await wait(600);
showView("library"); await wait(1200);
out.compactClass = $("shelves").className; out.compactCover = getComputedStyle(document.querySelector("#shelves .book .cover")).width;
out.chipsHidden = getComputedStyle(document.querySelector("#shelves .book .chips")).display;
// Out-of-range and junk values are cleaned by the main process.
await window.buddy.setSettings({ look: { layout: "tower", accent: "javascript:alert(1)", bgDim: 7, music: "../settings.json" } });
out.cleaned = (await window.buddy.getSettings()).look;
showView("settings"); $("bgRemove").click(); await wait(500);
out.bgRemoved = !main.classList.contains("lookbg") && $("bgRemove").hidden;
$("lookReset").click(); await wait(800);
out.reset = `${root.style.getPropertyValue("--accent") || "default accent"} ${$("shelves").className} ${$("lookMusic").src ? "music" : "no music"}`;
return {
  ok: out.bgOn && out.bgDim === "50%" && out.music && out.gold === "#e0a53a on #000000" && out.goldPressed === "true" && out.custom === "#1d4ed8 on #ffffff" && out.customInDark === "#1d4ed8"
    && out.primaryBg === "rgb(29, 78, 216)" && out.listClass === "shelf-wrap layout-list" && out.listCover === "64px" && out.compactClass === "shelf-wrap layout-compact" && out.compactCover === "140px" && out.chipsHidden === "none"
    && out.cleaned.layout === "grid" && out.cleaned.accent === "" && out.cleaned.bgDim === 0.9 && out.cleaned.music === "" && out.bgRemoved && out.reset === "default accent shelf-wrap layout-grid no music",
  ...out,
};
