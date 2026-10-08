import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installedIndex, mergeSources } from "../src/catalog.js";
import { parseCatalog } from "../src/sources/portsdr.js";
import { parseCatalogData, literalToJson } from "../src/sources/alexbeav.js";

const html = fs.readFileSync(new URL("./fixtures/portsdr-sample.html", import.meta.url), "utf8");

test("parses portsdr cards into the fields the browser needs", () => {
  const g = parseCatalog(html);
  assert.equal(g.length, 5);
  const skate = g.find((x) => x.project === "skate3recomp");
  assert.deepEqual({ ...skate, iconUrl: undefined, updatedAt: undefined }, {
    source: "portsdr", id: "github:mchughalex/skate3recomp", title: "Skate 3", project: "skate3recomp", console: "Xbox 360",
    platforms: ["Windows", "Linux", "macOS"], repoUrl: "https://github.com/mchughalex/skate3recomp", repoHost: "github",
    owner: "mchughalex", repo: "skate3recomp", version: "v2.0.2", releaseUrl: "https://github.com/mchughalex/skate3recomp/releases/tag/v2.0.2",
    status: "latest", website: "", texturesUrl: "", aiAssisted: false, iconUrl: undefined, updatedAt: undefined,
  });
  assert.match(skate.iconUrl, /steamgriddb/);
  assert.match(skate.updatedAt, /^2026-07-24/);
  assert.equal(g.find((x) => x.project === "AC6_recomp").status, "prerelease");
  const soh = g.find((x) => x.project === "Ship of Harkinian");
  assert.equal(soh.title, "The Legend of Zelda: Ocarina of Time");
  assert.match(soh.iconUrl, /\.ico$/);
  assert.equal(soh.website, "https://www.shipofharkinian.com/");
  const digi = g.find((x) => x.title === "Digimon World");
  assert.equal(digi.repoHost, "gitlab");
  const none = g.find((x) => !x.repoUrl);
  assert.equal(none.status, "none"); assert.equal(none.version, null); assert.match(none.id, /^project:/);
});

test("installedIndex maps repo -> installed tag from manifests", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cat-"));
  for (const [folder, repo, tag] of [["Skate 3 - Xbox 360", "mchughalex/skate3recomp", "v2.0.1"], ["Spidey - PS1", "GTTeancum/OpenSpideyPS1", "sm1-v1.0"]]) {
    fs.mkdirSync(path.join(out, folder));
    fs.writeFileSync(path.join(out, folder, "decomp-buddy.json"), JSON.stringify({ setUpAt: "2026-09-13T00:00:00Z", repo, folder, status: "ready", release: { tag }, plan: { game_title: folder } }));
  }
  const idx = installedIndex(out);
  assert.equal(idx["mchughalex/skate3recomp"][0].tag, "v2.0.1");
  assert.equal(idx["gtteancum/openspideyps1"][0].folder, "Spidey - PS1");
});

const ALEX = `window.CATALOG_GAMES = [
  {
    slug: "valkyrie-profile", title: "Valkyrie Profile", region: "USA", serial: "SLUS-01156", bios: "SCPH-1001", players: 1, playersLabel: "1 player", discs: 2,
    repository: "https://github.com/Alexbeav/valkyrie-profile-recomp",
    windows: "https://github.com/Alexbeav/valkyrie-profile-recomp/releases/download/v0.1.1/valkyrie-profile-recomp-0.1.1-windows-x64.zip",
    linux: "https://github.com/Alexbeav/valkyrie-profile-recomp/releases/download/v0.1.1/valkyrie-profile-recomp-0.1.1-linux-x64.zip",
    macosArm64: "https://github.com/Alexbeav/valkyrie-profile-recomp/releases/download/v0.1.1/valkyrie-profile-recomp-0.1.1-macos-arm64.zip",
    macosX64: "https://github.com/Alexbeav/valkyrie-profile-recomp/releases/download/v0.1.1/valkyrie-profile-recomp-0.1.1-macos-x64.zip",
    images: [["valkyrie-profile/menu.jpg", "Menu: a \\"quoted\\" alt"]], // trailing comment
    knownIssues: "Disc 2 swap: not fully qualified.",
  },
];
`;

test("alexbeav catalog-data.js is parsed without executing it", () => {
  const g = parseCatalogData(ALEX);
  assert.equal(g.length, 1);
  const v = g[0];
  assert.equal(v.id, "github:alexbeav/valkyrie-profile-recomp");
  assert.equal(v.console, "PlayStation"); assert.equal(v.version, "v0.1.1"); assert.equal(v.serial, "SLUS-01156"); assert.equal(v.bios, "SCPH-1001"); assert.equal(v.discs, 2);
  assert.deepEqual(v.platforms, ["Windows", "Linux", "macOS"]);
  assert.match(v.assets["macos-arm64"], /macos-arm64\.zip$/);
  assert.match(v.iconUrl, /screenshots\/v0\.2\.0\/valkyrie-profile\/menu\.jpg$/);
  assert.equal(JSON.parse(literalToJson('{a: "x:y", b: [1,2,], url: "https://h/",}')).url, "https://h/");
});

test("mergeSources: same repo from two sources becomes one card, different ports of one game stay separate", () => {
  const a = [{ source: "portsdr", id: "github:x/y", title: "Game", platforms: ["Windows"], status: "latest", serial: "", updatedAt: "2026-01-01" }];
  const b = [{ source: "alexbeav", id: "github:x/y", title: "Game", platforms: ["Linux"], status: "unknown", serial: "SLUS-1", updatedAt: "" },
             { source: "alexbeav", id: "github:z/game", title: "Game", platforms: ["Windows"], status: "unknown", serial: "SLUS-2" }];
  const m = mergeSources([a, b]);
  assert.equal(m.length, 2);
  const xy = m.find((g) => g.id === "github:x/y");
  assert.deepEqual(xy.sources, ["portsdr", "alexbeav"]); assert.equal(xy.status, "latest"); assert.equal(xy.serial, "SLUS-1"); assert.deepEqual(xy.platforms, ["Windows", "Linux"]);
});

test("finds: repo keys, cards, publish merges by repo", async () => {
  const { repoKey, findsToGames, publishFinds } = await import("../src/sources/finds.js");
  assert.equal(repoKey("https://github.com/Foo/Bar.git"), "Foo/Bar");
  assert.equal(repoKey("foo/bar/releases/tag/v1"), "foo/bar");
  assert.equal(repoKey("not a repo"), null);
  const g = findsToGames({ games: [{ repo: "Foo/Bar", title: "Bar Game", console: "SNES" }] });
  assert.equal(g[0].id, "github:foo/bar"); assert.equal(g[0].console, "SNES");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "picks-"));
  const file = path.join(out, "finds.json");
  fs.writeFileSync(file, JSON.stringify({ games: [{ repo: "foo/bar", title: "Old Title" }, { repo: "x/y", title: "Y" }] }));
  const r = publishFinds(file, [{ repo: "https://github.com/Foo/Bar", title: "New Title", console: "SNES" }]);
  assert.equal(r.games.length, 2);
  assert.equal(r.games.find((x) => x.repo.toLowerCase() === "foo/bar").title, "New Title"); // one entry, whichever spelling came first
  const { mergeSources } = await import("../src/catalog.js");
  const merged = mergeSources([[{ source: "portsdr", id: "github:foo/bar", title: "Bar", platforms: ["Windows"], status: "latest", console: "SNES" }], g]);
  assert.equal(merged.length, 1); assert.deepEqual(merged[0].sources, ["portsdr", "finds"]);
});

test("enrichFromGitHub fills platforms/version/console from a real repo", async () => {
  const { enrichFromGitHub } = await import("../src/sources/finds.js");
  const info = await enrichFromGitHub("CrownParkComputing/Xbox360-Native-Ports");
  assert.equal(info.exists, true);
  assert.equal(info.consoleGuess, "Xbox 360");
  assert.deepEqual(info.platforms.sort(), ["Linux", "Windows"]);
  assert.ok(info.version, "has a latest tag");
  assert.match(info.notes, /Xbox 360/);
});

test("iconFor follows libretro symlink stubs, and never uses the owner's profile photo", async () => {
  const { iconFor } = await import("../src/catalog.js");
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "icons-"));
  // symlink stub in libretro: "Fear Effect 2 - Retro Helix (USA) (Disc 1).png" -> text naming the real file
  const link = await iconFor({ id: "t1", iconUrl: "https://raw.githubusercontent.com/libretro-thumbnails/Sony_-_PlayStation/master/Named_Boxarts/Fear%20Effect%202%20-%20Retro%20Helix%20(USA)%20(Disc%201).png" }, { cacheDir: cache });
  assert.ok(link && fs.statSync(link).size > 1000, "resolved through the symlink to a real image");
  const fb = await iconFor({ id: "github:crownparkcomputing/xbox360-native-ports", iconUrl: "", owner: "CrownParkComputing", repo: "Xbox360-Native-Ports" }, { cacheDir: cache });
  assert.equal(fb, null, "no art of its own and no custom social preview: a title card, not the owner's photo");
  const photo = await iconFor({ id: "t3", iconUrl: "https://avatars.githubusercontent.com/u/1?v=4" }, { cacheDir: cache });
  assert.equal(photo, null, "a catalog icon that is a profile photo is skipped too");
});

test("shared sources: publish dedups, activeSources merges managed + local without doubles", async () => {
  const { publishSources, sourceKey, removeSource } = await import("../src/sources/shared-sources.js");
  const { activeSources } = await import("../src/catalog.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-")); const file = path.join(dir, "sources.json");
  publishSources(file, [{ type: "github-user", value: "Alexbeav" }, { type: "list", value: "https://x/y.txt" }]);
  const again = publishSources(file, [{ type: "github-user", value: "https://github.com/alexbeav/" }]);
  assert.equal(again.sources.length, 2, "same user in different spelling is one entry");
  const shared = again.sources;
  const act = activeSources({ shared, custom: [{ type: "github-user", value: "Alexbeav", enabled: true }, { type: "github-user", value: "Other", enabled: true }] });
  const ids = act.map((s) => s.SOURCE.id);
  assert.equal(ids.filter((i) => i === "github-user:alexbeav").length, 1);
  assert.ok(ids.includes("github-user:other"));
  const off = activeSources({ shared, disabledShared: { [sourceKey(shared[0])]: true } }).map((s) => s.SOURCE.id);
  assert.ok(!off.includes("github-user:alexbeav"));
  assert.equal(removeSource(file, "list:https://x/y.txt"), 1);
});

test("source entries are validated: repos and websites can't masquerade as GitHub users", async () => {
  const { validateSourceEntry, normalizeUser } = await import("../src/sources/shared-sources.js");
  assert.equal(validateSourceEntry({ type: "github-user", value: "Alexbeav" }), null);
  assert.equal(validateSourceEntry({ type: "github-user", value: "https://github.com/Alexbeav" }), null);
  assert.match(validateSourceEntry({ type: "github-user", value: "https://github.com/n64decomp/007" }), /n64decomp\/007 is a repository/);
  assert.match(validateSourceEntry({ type: "github-user", value: "https://alexbeav.github.io/psxrecomp-ports/" }), /isn't a GitHub user/);
  assert.match(validateSourceEntry({ type: "list", value: "alexbeav" }), /full http/);
  assert.equal(validateSourceEntry({ type: "list", value: "https://alexbeav.github.io/psxrecomp-ports/" }), null);
  assert.equal(normalizeUser("https://github.com/Alexbeav/"), "Alexbeav");
});

test("artUrl: project icon by default, box art when preferred, screenshots never win", async () => {
  const { artUrl } = await import("../src/catalog.js");
  const both = { iconUrl: "https://x/icon.png", boxartUrl: "https://x/box.png" };
  assert.equal(artUrl(both, false), "https://x/icon.png");
  assert.equal(artUrl(both, true), "https://x/box.png");
  assert.equal(artUrl({ ...both, iconIsScreenshot: true }, false), "https://x/box.png");
  assert.equal(artUrl({ iconUrl: "https://x/icon.png" }, true), "https://x/icon.png"); // no box art match: keep the icon
  assert.equal(artUrl({ boxartUrl: "https://x/box.png" }, false), "https://x/box.png"); // no icon: box art
  assert.equal(artUrl({}, true), "");
});

test("collection artwork paths become raw file URLs", async () => {
  const { artworkUrl } = await import("../src/expand.js");
  const g = { owner: "Alexbeavs-PS1-Ports", repo: "psxrecomp-ports", repoHost: "github" };
  assert.equal(artworkUrl("docs/screenshots/fire red.png", g), "https://raw.githubusercontent.com/Alexbeavs-PS1-Ports/psxrecomp-ports/HEAD/docs/screenshots/fire%20red.png");
  assert.equal(artworkUrl("https://github.com/a/b/blob/main/x.png", g), "https://raw.githubusercontent.com/a/b/main/x.png");
  assert.equal(artworkUrl("./logo.png", { ...g, repoHost: "gitlab" }), "https://gitlab.com/Alexbeavs-PS1-Ports/psxrecomp-ports/-/raw/HEAD/logo.png");
  assert.equal(artworkUrl("../etc/passwd", g), null);
});
