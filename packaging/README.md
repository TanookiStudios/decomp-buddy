# Store listings

`node scripts/packages.mjs [version]` writes these from a published GitHub release (checksums from GitHub, nothing
downloaded). release.sh runs it after every release. Sending them is public, under Tanooki Studios: Maddie approves
each one first (her rule, 28 Oct 2026).

- winget/ -> a pull request to microsoft/winget-pkgs (copy manifests/t/TanookiStudios/DecompBuddy/<version>/).
- homebrew/ -> the repo TanookiStudios/homebrew-tap (Casks/decomp-buddy.rb). Users: `brew install tanookistudios/tap/decomp-buddy`.
  Checked with `brew style` and `brew audit --cask --online` (passes; the main Homebrew list needs 75+ stars).
- scoop/ -> the repo TanookiStudios/scoop-bucket (bucket/decomp-buddy.json). Users: `scoop bucket add tanooki
  https://github.com/TanookiStudios/scoop-bucket` then `scoop install decomp-buddy`.
- Steam Deck plugin: ~/Documents/GitHub/decky-decomp-buddy -> its own repo, then a pull request to
  SteamDeckHomebrew/decky-plugin-database.
