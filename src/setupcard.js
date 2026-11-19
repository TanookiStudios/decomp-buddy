// How To Set Up, for a game's page: what you bring and what happens the first time it starts, taken from the
// published install steps (plans.json, written from the project's own instructions). The steps for the computer
// asked for win, then Windows, Mac, Linux, then any other. The website's build uses this same file.
const compact = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function setupCard(entry, { gameTitle = "", target = "" } = {}) {
  for (const t of [target, "windows", "macos-arm64", "linux", ...Object.keys(entry?.targets || {})].filter(Boolean)) {
    const games = entry?.targets?.[t]?.games || [], g = gameTitle ? games.find((x) => compact(x.game_title) === compact(gameTitle)) : games[0];
    if (!g || g.build?.method === "unsupported") continue;
    const files = (g.game_files || []).filter((f) => f.label).map((f) => ({ label: f.label, description: f.description || "" }));
    const steps = (g.first_run || []).filter(Boolean);
    if (files.length || steps.length) return { target: t, files, steps };
  }
  return null;
}
