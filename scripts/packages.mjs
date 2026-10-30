#!/usr/bin/env node
// One-line installs: the winget, Homebrew and Scoop listings for a published release, written from the release's own
// files and their GitHub checksums (nothing is downloaded). Writes only into packaging/; sending them anywhere is a
// separate, public step (packaging/README.md) that Maddie approves.
//   node scripts/packages.mjs [version]     default: package.json's version (must already be released on GitHub)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, ".."), REPO = "TanookiStudios/decomp-buddy";
const V = process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const token = execFileSync("gh", ["auth", "token", "-u", "TanookiStudios"], { encoding: "utf8" }).trim();
const rel = JSON.parse(execFileSync("gh", ["api", `repos/${REPO}/releases/tags/v${V}`], { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } }));
const asset = (name) => {
  const a = rel.assets.find((x) => x.name === name);
  if (!a?.digest?.startsWith("sha256:")) throw new Error(`v${V} has no ${name} with a checksum - is the release finished?`);
  return { url: a.browser_download_url, sha: a.digest.slice(7) };
};
const setup = asset(`Decomp.Buddy.Setup.${V}.exe`), portable = asset(`Decomp.Buddy.${V}.Portable.exe`);
const arm = asset(`Decomp.Buddy-${V}-arm64.dmg`), intel = asset(`Decomp.Buddy-${V}-x64.dmg`);
const date = rel.published_at.slice(0, 10);
const SHORT = "Finds, installs and updates fan-made PC ports of classic games, using your own game files.";
const LONG = "Decomp Buddy is a free, open source launcher for decompilations, recompilations and fan-made PC ports. It downloads each project straight from its own releases, checks your own copy of the game is the right version, sets everything up, and keeps it updated with your saves backed up. It never downloads games.";
const write = (rel, text) => { const f = path.join(ROOT, "packaging", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return rel; };
const out = [];

// winget (microsoft/winget-pkgs): the installer (NSIS, per user, silent with /S).
const W = `winget/manifests/t/TanookiStudios/DecompBuddy/${V}/TanookiStudios.DecompBuddy`, head = `# Created by scripts/packages.mjs\nPackageIdentifier: TanookiStudios.DecompBuddy\nPackageVersion: ${V}\n`;
out.push(write(`${W}.yaml`, `${head}DefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.6.0\n`));
out.push(write(`${W}.installer.yaml`, `${head}InstallerType: nullsoft\nScope: user\nInstallModes:\n- interactive\n- silent\n- silentWithProgress\nUpgradeBehavior: install\nReleaseDate: ${date}\nInstallers:\n- Architecture: x64\n  InstallerUrl: ${setup.url}\n  InstallerSha256: ${setup.sha.toUpperCase()}\nManifestType: installer\nManifestVersion: 1.6.0\n`));
out.push(write(`${W}.locale.en-US.yaml`, `${head}PackageLocale: en-US\nPublisher: Tanooki Studios LLC\nPublisherUrl: https://tanookistudios.com/\nPackageName: Decomp Buddy\nPackageUrl: https://decompbuddy.com/\nLicense: GPL-3.0-or-later\nLicenseUrl: https://github.com/${REPO}/blob/HEAD/LICENSE\nShortDescription: ${SHORT}\nDescription: ${LONG}\nTags:\n- games\n- game-launcher\n- decompilation\n- recompilation\n- pc-ports\n- steam-deck\nReleaseNotesUrl: https://decompbuddy.com/changelog\nManifestType: defaultLocale\nManifestVersion: 1.6.0\n`));

// Homebrew cask (our own tap, TanookiStudios/homebrew-tap): the signed, notarized Mac app, Apple Silicon or Intel.
out.push(write("homebrew/Casks/decomp-buddy.rb", `# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "${V}"
  sha256 arm:   "${arm.sha}",
         intel: "${intel.sha}"

  url "https://github.com/${REPO}/releases/download/v#{version}/Decomp.Buddy-#{version}-#{arch}.dmg",
      verified: "github.com/${REPO}/"
  name "Decomp Buddy"
  desc "Installs and updates fan-made PC ports of classic games"
  homepage "https://decompbuddy.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :ventura

  app "Decomp Buddy.app"

  zap trash: [
    "~/Library/Application Support/Decomp Buddy",
    "~/Library/Preferences/com.tanookistudios.decompbuddy.plist",
    "~/Library/Saved Application State/com.tanookistudios.decompbuddy.savedState",
  ]
end
`));

// Scoop (our own bucket, TanookiStudios/scoop-bucket): the portable build; its settings folder survives updates.
out.push(write("scoop/bucket/decomp-buddy.json", JSON.stringify({
  version: V, description: SHORT, homepage: "https://decompbuddy.com/", license: "GPL-3.0-or-later",
  architecture: { "64bit": { url: `${portable.url}#/DecompBuddy.exe`, hash: portable.sha } },
  shortcuts: [["DecompBuddy.exe", "Decomp Buddy"]], persist: "Decomp Buddy Data",
  checkver: { github: `https://github.com/${REPO}` },
  autoupdate: { architecture: { "64bit": { url: `https://github.com/${REPO}/releases/download/v$version/Decomp.Buddy.$version.Portable.exe#/DecompBuddy.exe` } } },
}, null, 4) + "\n"));

console.log(`packages: Decomp Buddy ${V} (released ${date})\n  ${out.join("\n  ")}`);
