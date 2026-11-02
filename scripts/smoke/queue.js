// Install When Online. QUEUE_STEP=1 (offline): reading a published game and setting it up leaves it waiting, shown in
// Installed Games. QUEUE_STEP=2 (same profile, online): the app sets it up by itself at start. Run by queue.sh.
const out = {};
if (QUEUE_STEP === 1) {
  const games = await window.buddy.analyze({ urls: [QUEUE_REPO] });
  out.read = games.map((g) => g.ok ? g.game_title : g.error);
  const g = games.find((x) => x.ok);
  const r = await window.buddy.setup({ items: [{ id: g.id, picks: Object.fromEntries(g.game_files.map((_, i) => [i, QUEUE_PICK])), verifications: {} }] });
  out.result = r.results.map((x) => ({ ok: x.ok, queued: !!x.queued, error: x.error }));
  showView("library"); await renderLibrary(); await wait(500);
  out.panel = $("installQueue").hidden ? "hidden" : $("installQueue").textContent.replace(/\s+/g, " ").trim();
  out.queue = (await window.buddy.queueList()).length;
  return { ok: out.result[0]?.queued && out.queue === 1 && /Waiting For The Internet \(1\)/.test(out.panel), ...out };
}
for (let i = 0; i < 240 && (await window.buddy.queueList()).length; i++) await wait(500); // runs 8 s after start
out.queueLeft = (await window.buddy.queueList()).length;
out.installed = (await window.buddy.libraryList()).map((x) => `${x.title} ${x.status || ""}`.trim());
return { ok: out.queueLeft === 0 && out.installed.length === 1, ...out };
