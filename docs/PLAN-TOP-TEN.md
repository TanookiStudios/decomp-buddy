# Plan: Top Ten 2-10 + Changelog (28 Oct 2026)

Maddie's plain-English copy: ~/Deliverables/Decomp Buddy - Plan For The Next Nine Features.html.
Nothing ships until she says (she held 0.30.8). Each phase: npm test, headless smoke on a throwaway profile,
i18n extract + 5 translations, Title Case, aria labels, install to /Applications. Release only on her word.

## Phase 1 - Changelog (first, so every later release carries notes)
- Source of truth: docs/releases/<version>.md (exists for 0.30.0-0.30.7). Sections: New / Better / Fixed / Removed.
- Backfill 0.29.0-0.29.12 from git log, same sections, plain English.
- release.sh refuses to run without docs/releases/$V.md that has at least one section (exit 1, says which file).
- release.sh publishes changelog.json (all versions, newest first) next to latest.json on tanookistudios.com/decomp-buddy.
- Site: DecompBuddy-Site/build.mjs builds /changelog from changelog.json; footer + download page link it.
- App: notes bundled at build time (offline-safe). settings.lastSeenVersion; on first launch after an upgrade, a
  "What's New" panel lists every version since lastSeenVersion. About → "What's New" any time. Fresh installs: no panel.
- All six app languages (her call, 28 Oct): docs/releases/<v>.<lang>.md beside the English file, written at release
  time; release.sh refuses if any is missing. Site /changelog has language tabs at the top; the app shows its own
  language. AUR: skipped, on her to-do list (needs her account).

## Phase 2 - Install With Decomp Buddy (#37), Safety Report (#2), Best Version (#9)
### #37
- Site game pages and list cards: "Open In Decomp Buddy" -> "Install With Decomp Buddy" (build.mjs ~L506-513, card()).
- Click: location = decompbuddy://add?...; if the page is still visible after ~1.5 s, reveal "Don't have Decomp Buddy
  yet? Get it free" with the download for this device (reuse the /download device-detect script, build.mjs ~L249).
- /games/<slug>?install starts the same flow on load (the README install-button.svg from /developers links there).
- App renderer/app.js onDeepLink: catalog match -> addToLinks([id], { andRead: true }) so it lands on "pick your game
  file" (published plan, no AI key, nothing downloaded until Set Up). Non-catalog repos keep the old fill-the-box path
  (would spend the user's AI key). Update src/deeplink.js header comment.
- Test: deeplink parse + a smoke that sends a deeplink and asserts the setup view shows the game.
### #2
- Daily follow step records per repo: license (GitHub repo .license.spdx_id), owner account created_at (cached, users
  API once per owner), uploader-is-owner (already known to the same-uploader gate). Into catalog as `trust`.
- Shown on site game page + app detail page: Malware Scan / Uploaded By The Project Owner / License / Account Age /
  Last Updated / Archived. Wording: "No known malware found", never "safe" or "virus-free". Account age is shown as a
  plain date only; it is never a reason to hold or doubt a project (Maddie, 29 Oct 2026).
### #9
- D1 decomp_reports already stores tag. Daily publish: per game, if latest tag has >=3 reports and most say "no",
  and an older tag has >=2 "runs" and its asset is in scans.json clean -> catalog `recommended: { tag, why }`.
- App Install uses preferredTag = recommended.tag with a line "Installing 1.2 - players say 1.3 doesn't start.
  Install 1.3 Anyway". Auto Update skips the bad tag until reports change. Site game page says the same.
- Test: pure function over fake report rows (threshold edges: 2 vs 3 reports, ties, unscanned older tag).

## Phase 3 - Tell Me When It's Playable (#27), Install Doctor (#8)
### #27
- Bell on Coming Soon rows (renderer/finding.js renderSoon) and Waiting For A Port rows; stored locally
  (settings.watch[]), no account, nothing sent anywhere.
- Background check (src/main/background.js daily + on launch): watched repo now in catalog -> system notification
  (Electron Notification) + "Now Playable" shelf; tray keeps it when Keep Running is on.
- Site Coming Soon page: "Tap the bell in Decomp Buddy to hear the day it's playable." No email list.
### #8
- Name in the UI: "Install Doctor", with a medical emblem (inline SVG cross-in-circle, decorative, aria-hidden; the
  button's own label carries the meaning). Her request, 28 Oct.
- "Install Doctor" button on the More panel and on the "It Didn't Start" screen. Checks, each with its own message:
  Windows runtimes (src/winruntimes.js), game file (existing Check Game), missing executable bit (Linux/Mac),
  graphics (Vulkan/Metal/OpenGL version vs README needs), launch log tail (library.js decomp-buddy-launch.log),
  Mac "downloaded from the internet" flag on the port's own scanned files (decision for Maddie; button, never silent).
- Each fix is a button; nothing changes without a press. Test per check with fixtures.

## Phase 4 - 60 FPS / Widescreen / HD badges (#17)
- facts.features { fps60, widescreen, hd, raytracing, mods, online, coop } each with a verbatim README quote.
- Cheap pass like ailabel: regex prep over cached READMEs picks candidate sentences -> Sonnet agents decide (<=2 at
  once) -> grounding check (quote must be in README) -> import. New games get it in ccplans facts from then on.
- Browse filters + card badges in app and on site; "Players Can Play Together" filter covers part of #18.

## Phase 5 - Find My Steam And GOG Games (#7)
- Store finder: Steam (reuse src/proton.js libraryPaths + appmanifest_*.acf), GOG (Windows registry GOG.com\Games,
  Mac GOG Galaxy folder, Linux Heroic gog_store/installed.json), Epic (manifests .item).
- Plan schema: game_files[].store { steam?: appid, gog?: id, inside?: relative path }. ccplans rule update + re-plan
  pass over the ~392 PC-console games only. Old plans read store as null.
- Setup: if found, the game file step fills itself and says where from; still verified by checksum/size as today.

## Phase 6 - Outside the app: package managers (#46), Steam Deck plugin (#47)
- winget: manifest PR to microsoft/winget-pkgs per release (scripted). Scoop + Homebrew: own buckets
  TanookiStudios/scoop-bucket, TanookiStudios/homebrew-tap (Homebrew's main list needs more stars). release.sh
  bumps them. AUR: on her to-do list (needs her account), then I maintain it.
- Every store we can be on (her call, 28 Oct): full researched list goes on her to-do list
  (~/Deliverables/Maddie's To-Do List.html), each with its submit link, who has to do it, and blockers.
- Decky plugin: TanookiStudios/decky-decomp-buddy. Talks to the desktop app over Phone Link (src/main/phonelink.js,
  port 47613, sealed messages) on localhost: list library, Play, browse + Install (hands to normal Set Up), updates.
  Store listing = PR to SteamDeckHomebrew/decky-plugin-database, public: Maddie approves before it's sent.
- All public submissions drafted by me, sent only after her OK.

## At release of 0.31.0 (not before - the site must not promise what the downloadable app can't do)
- DecompBuddy-Site build.mjs waiting.html lede: add "Waiting for one? Tap Notify Me next to it in Decomp Buddy's
  Coming Soon tab and the app tells you the day it's playable."
