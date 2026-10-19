# The daily Decomp Buddy run

A scheduled Claude Code task runs this once a day. It finds new games, sorts them, checks them, writes their install
steps, follows new versions through the 48-hour hold and the malware scan, and publishes. Data only: never change the
app's code, never release the app, never touch Maddie's own app data.

Work in `~/Documents/GitHub/DecompBuddy`. Write American English. Use Sonnet agents (`model: "sonnet"`), **at most two
at a time**. Show nothing on screen. If a step fails, stop, don't publish, and say what failed in the final reply.
GitHub's 5,000 lookups an hour can run out: if a command says "rate limit", stop for the day and say so.

## 1. Find
`scripts/daily.sh find` - prints the batch ids (t001, t002, ...). None: skip to step 3.

## 2. Sort (agents)
Give each agent up to 5 batch ids:
> Follow ~/.decomp-buddy-triage/AGENT.md exactly, once for EACH of these batch ids in order: tNNN tNNN ... Read RULES.md
> fully first (including the rule for release files whose names don't say the computer). Finish and check one batch
> before starting the next. Read job files with the Read tool (in chunks if long), not cat. Write American English.
> Final reply: the AGENT.md summary for each batch.

**Then check every "play" answer yourself** (in `~/.decomp-buddy-triage/out/*.json`, with its job text in `jobs/`):
- Malware bait: a random account name plus "free download", password-protected zips, mediafire / mega / linkvertise
  links, a README that's mostly a download button, or a brand-new account copying a known project.
- Copies: a fork or same-named repo of a project Decomp Buddy already lists (the job warns), unless the README shows
  it's a distinct, maintained port with its own downloads.
- A release that bundles the game's own files (ROMs, ISOs, game data) - Decomp Buddy never lists those.
Change any of those to `"verdict": "hide"` with a one-line reason, then `node scripts/triage.mjs check <id>` again.
"No AI" READMEs are fine - never hide or flag a game for that.

## 3. Steps
`scripts/daily.sh steps` - imports the sorted batches and prepares install-step jobs into
`~/.decomp-buddy-ccplans/batches/daily-NN.txt` (prints how many).

## 4. Install steps (agents)
Up to 4 batch files per agent:
> Follow the instructions in ~/.decomp-buddy-ccplans/AGENT.md exactly. Read ~/.decomp-buddy-ccplans/RULES.md fully
> first. Your batch files are, in order: ~/.decomp-buddy-ccplans/batches/daily-NN.txt, ... (finish each before the
> next). Read job files with the Read tool (in chunks if long), not cat. Write American English. When done, reply
> with only the per-id result lines.

## 5. Gates
`scripts/daily.sh gates` - imports the steps, moves games onto new releases that passed the 48-hour hold, the
same-uploader check and the scan, scans new files (skipped while a long scan is already running), and prepares AI
labels. If it prints `FLAGGED`, look at that file the way docs say in scripts/scan.mjs and src/scan.js: a false alarm
goes into `~/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/scans-reviewed.json` **by sha256 only**, with the
reason; a real hit stays held and goes in the final reply.

## 6. AI labels (agent, only if `ailabel prep` found READMEs to decide)
> Read ~/.decomp-buddy-ailabel/RULES.md fully and follow it exactly. Do batch ~/.decomp-buddy-ailabel/batch.md ->
> write ~/.decomp-buddy-ailabel/answers.json, then run the count check. No network. When unsure, null.

## 7. Publish
`scripts/daily.sh publish` - builds, deploys both sites, checks the live catalog, IndexNow, commits and pushes.

## Final reply (Maddie reads this; she isn't a developer)
Three or four plain sentences: how many new games went live (name the best two or three), how many moved to a new
version, anything held by the malware scan or the uploader check, and anything that failed. No file names or jargon.
Never claim every download has been scanned unless `scan.mjs` reported nothing left to scan.
