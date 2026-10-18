# Proposed RULES.md additions for phone and headset plans

`scripts/ccplans.mjs` writes `~/.decomp-buddy-ccplans/RULES.md` and `schema-plan.json` itself on `prep`:

- The "Plan rules" section is `SYSTEM` from `src/plan.js`, so the new device rule (the last bullet there)
  reaches the agents automatically on the next `prep`.
- `schema-plan.json` is `z.toJSONSchema(Analysis)`, so `build.package_id` and `game_files[].push_to`
  appear in it automatically (both required, `null` when not used).
- `TARGET_OF_PLATFORM` in `src/plans.js` now maps the catalog's `Android` platform to the `android` target
  and `Meta Quest` to `quest`, so `prep` will start asking for those plans.

What is NOT automatic is the "Hard checks" section, which is a string in `scripts/ccplans.mjs`. Proposed
additions (append to that list):

```
- Targets "android" (an Android phone or handheld) and "quest" (a Meta Quest headset): build.release_asset must be an .apk from the job's release list. No .apk in any release → method "unsupported" (never "source": Decomp Buddy doesn't build apps). For "quest", when several .apks are released, pick the one whose name says quest, oculus or vr; any other .apk is allowed when it's the only one. For "android", never pick an .apk whose name says quest, oculus, vr, xr or openxr.
- build.package_id: the app's Android package name (e.g. "com.drbeef.questzdoom") only when the README, docs or file tree (AndroidManifest.xml, build.gradle applicationId) states it; else null. Never guess it from the repo name. Always null for computer targets.
- game_files[].push_to: for "android"/"quest" only, the folder on the device's shared storage the docs say the file goes in, relative to /sdcard (docs say "/sdcard/QuestZDoom/wads" → "QuestZDoom/wads"). No leading slash, no "..", no backslashes. null when the docs don't name a folder, and always null for computer targets. drop_into stays "Game Files" (where the file waits on the computer).
```

What import does with them today: `Analysis.safeParse` checks the shapes; the app itself refuses at install
time any push_to that leaves /sdcard (`safeRemote` in `src/adb.js`) and any non-.apk download for a device
(`assetMismatch` in `src/targets.js`). A plan with a wrong push_to therefore fails loudly on the player's
machine rather than writing somewhere odd - but it would still be published, so a matching import check in
`validate()` (reject a device plan whose release_asset isn't .apk, or whose push_to fails `safeRemote`) is
worth adding when the first device plans are generated.
