#!/bin/zsh
# Publish this commit's source, then build the Steam Deck Flatpak from it on GitHub (Flatpaks don't build on a Mac) and attach it to the
# release for package.json's version, under a fixed name the website links to (releases/latest/download/...),
# so the Steam Deck download is always the newest version. scripts/release.sh runs this at the end.
#   scripts/flatpak-release.sh [vX.Y.Z]
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-v$(node -p "require('./package.json').version")}"
# Built from the public source repo: public repos get GitHub's Linux machines free, private ones are billed.
BUILD_REPO="TanookiStudios/decomp-buddy"; REL_REPO="$BUILD_REPO"
export GH_TOKEN="${GH_TOKEN:-$(gh auth token -u TanookiStudios)}"
SHA=$(scripts/publish-source.sh)
echo "→ building the Flatpak for $TAG ($SHA) on GitHub…"
gh workflow run flatpak.yml -R "$BUILD_REPO" --ref main
sleep 15
RUN=$(gh run list -R "$BUILD_REPO" --workflow flatpak.yml --limit 5 --json databaseId,headSha --jq "[.[] | select(.headSha==\"$SHA\")][0].databaseId")
[[ -n "$RUN" && "$RUN" != null ]] || { echo "✗ couldn't find the Flatpak build for $SHA"; exit 1; }
gh run watch "$RUN" -R "$BUILD_REPO" --exit-status >/dev/null || { echo "✗ the Flatpak build failed: https://github.com/$BUILD_REPO/actions/runs/$RUN"; exit 1; }
D=$(mktemp -d); gh run download "$RUN" -R "$BUILD_REPO" -D "$D"
F=$(find "$D" -name "*.flatpak" | head -1); [[ -s "$F" ]] || { echo "✗ the build made no .flatpak"; exit 1; }
[[ "$(head -c 7 "$F")" == "flatpak" ]] || { echo "✗ that file isn't a Flatpak bundle"; exit 1; }
cp "$F" "$D/Decomp.Buddy-x86_64.flatpak"; cp "$F" "$D/Decomp.Buddy-${TAG#v}-x86_64.flatpak"
gh release upload "$TAG" "$D/Decomp.Buddy-x86_64.flatpak" "$D/Decomp.Buddy-${TAG#v}-x86_64.flatpak" -R "$REL_REPO" --clobber
code=$(curl -sL -r 0-0 -o /dev/null -w "%{http_code}" "https://github.com/$REL_REPO/releases/download/$TAG/Decomp.Buddy-x86_64.flatpak")
[[ "$code" == 206 || "$code" == 200 ]] || { echo "✗ the uploaded Flatpak answered $code"; exit 1; }
rm -rf "$D"
echo "✓ Steam Deck Flatpak for $TAG attached ($(du -h "$F" 2>/dev/null | cut -f1))"
