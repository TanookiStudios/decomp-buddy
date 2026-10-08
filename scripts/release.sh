#!/bin/zsh
# Full release: build Mac (signed + notarized), Windows, Linux; upload the installers to GitHub
# Releases (TanookiStudios/decomp-buddy); write latest.json into the site repo; deploy the site; verify
# every download URL with a real GET. Any failure stops the run - a release that silently
# didn't upload is worse than none.
#
#   ./scripts/release.sh              build + publish
#   ./scripts/release.sh --no-publish build only (what release-mac.sh + electron-builder used to do)
#   ./scripts/release.sh --dry-run    print the publish commands, run nothing outward
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=1; DRY=0; REUSE=0
for a in "$@"; do case "$a" in --no-publish) PUBLISH=0;; --dry-run) DRY=1;; --reuse) REUSE=1;; esac; done

SITE="$HOME/Documents/GitHub/TanookiStudios-Site"
SITE_DIR="$SITE/public/decomp-buddy"
BASE_URL="https://tanookistudios.com/decomp-buddy"
V=$(node -p "require('./package.json').version")

echo "→ Decomp Buddy $V"
DMG="Decomp Buddy-$V-arm64.dmg"; DMG_X64="Decomp Buddy-$V-x64.dmg"; EXE="Decomp Buddy Setup $V.exe"; PORTABLE="Decomp Buddy $V Portable.exe"; APPIMAGE="Decomp Buddy-$V.AppImage"
DEB="decomp-buddy_${V}_amd64.deb"
if { [ "$DRY" = 1 ] || [ "$REUSE" = 1 ]; } && [ -s "dist/$DMG" ] && [ -s "dist/$EXE" ] && [ -s "dist/$APPIMAGE" ]; then
  echo "→ using the existing dist/ build"
else
  rm -rf dist
  ./scripts/release-mac.sh
  # Windows code signing (Azure Artifact Signing) runs only when its details are set - see
  # docs/WINDOWS-SIGNING.md. It needs Windows' signtool, so it happens on a Windows machine / CI runner.
  WIN_SIGN=()
  if [ -n "${AZURE_TENANT_ID:-}" ] && [ -n "${AZURE_SIGN_ENDPOINT:-}" ]; then
    WIN_SIGN=(-c.win.azureSignOptions.publisherName="${AZURE_SIGN_PUBLISHER:-Tanooki Studios LLC}" -c.win.azureSignOptions.endpoint="$AZURE_SIGN_ENDPOINT" -c.win.azureSignOptions.certificateProfileName="$AZURE_SIGN_PROFILE" -c.win.azureSignOptions.codeSigningAccountName="$AZURE_SIGN_ACCOUNT")
    echo "→ Windows builds will be signed ($AZURE_SIGN_ACCOUNT / $AZURE_SIGN_PROFILE)"
  fi
  npx electron-builder --win "${WIN_SIGN[@]}"
  npx electron-builder --linux
fi
for f in "$DMG" "$DMG_X64" "$EXE" "$PORTABLE" "$APPIMAGE" "$DEB"; do [ -s "dist/$f" ] || { echo "✗ missing dist/$f" >&2; exit 1; }; done
echo "→ built: $DMG, $DMG_X64, $EXE, $PORTABLE, $APPIMAGE, $DEB"

[ "$PUBLISH" = 1 ] || { echo "→ --no-publish: stopping after the build"; exit 0; }
[ -d "$SITE_DIR" ] || { echo "✗ site repo not found at $SITE_DIR" >&2; exit 1; }

enc() { node -p "encodeURIComponent(process.argv[1])" "$1"; }
run() { if [ "$DRY" = 1 ]; then echo "  (dry) $*"; else "$@"; fi; }

# Installers live in GitHub Releases on the TanookiStudios account (public repo, installers only - free,
# no bandwidth bill). tanookistudios.com/decomp-buddy/<file> forwards there, so every download link and
# the in-app updater's feed keep the same address. GitHub turns spaces in asset names into dots.
REL_REPO="TanookiStudios/decomp-buddy"
GH_TOKEN_REL=$(gh auth token --user TanookiStudios 2>/dev/null) || { echo "✗ gh isn't signed in to the TanookiStudios account (gh auth login)" >&2; exit 1; }
ASSETS=("dist/$DMG" "dist/$DMG_X64" "dist/$EXE" "dist/$PORTABLE" "dist/$APPIMAGE" "dist/$DEB")
for f in dist/latest-mac.yml dist/latest.yml dist/latest-linux.yml dist/*.blockmap dist/"Decomp Buddy-$V-arm64-mac.zip" dist/"Decomp Buddy-$V-x64-mac.zip"; do [ -f "$f" ] && ASSETS+=("$f"); done
echo "→ uploading ${#ASSETS[@]} files to github.com/$REL_REPO release v$V…"
if GH_TOKEN=$GH_TOKEN_REL gh release view "v$V" --repo "$REL_REPO" >/dev/null 2>&1; then
  run env GH_TOKEN=$GH_TOKEN_REL gh release upload "v$V" "${ASSETS[@]}" --repo "$REL_REPO" --clobber
else
  run env GH_TOKEN=$GH_TOKEN_REL gh release create "v$V" "${ASSETS[@]}" --repo "$REL_REPO" --title "Decomp Buddy $V" --notes "Download from https://decompbuddy.com/download - Mac (Apple Silicon + Intel, signed and notarized), Windows (installer or portable), Linux (AppImage or .deb)."
fi

echo "→ writing $SITE_DIR/latest.json"
LATEST=$(cat <<JSON
{
  "version": "$V",
  "notes": "",
  "downloads": {
    "macos-arm64": "$BASE_URL/$(enc "$DMG")",
    "macos-x64": "$BASE_URL/$(enc "$DMG_X64")",
    "windows": "$BASE_URL/$(enc "$EXE")",
    "windows-portable": "$BASE_URL/$(enc "$PORTABLE")",
    "linux": "$BASE_URL/$(enc "$APPIMAGE")",
    "linux-deb": "$BASE_URL/$(enc "$DEB")"
  }
}
JSON
)
if [ "$DRY" = 1 ]; then echo "$LATEST"; else echo "$LATEST" > "$SITE_DIR/latest.json"; fi

echo "→ deploying the site…"
run npm --prefix "$SITE" run deploy

echo "→ verifying downloads with real GETs…"
for f in "$DMG" "$DMG_X64" "$EXE" "$PORTABLE" "$APPIMAGE" "$DEB"; do
  url="$BASE_URL/$(enc "$f")"
  if [ "$DRY" = 1 ]; then echo "  (dry) GET $url"; continue; fi
  want=$(stat -f%z "dist/$f")
  got=$(curl -sL -A decomp-buddy-release -r 0-0 -o /dev/null -w "%{http_code} %{size_download}" "$url" | cut -d' ' -f1)
  len=$(curl -sIL -A decomp-buddy-release "$url" | grep -i '^content-length' | tail -1 | tr -dc '0-9')
  [ "$got" = 206 ] || [ "$got" = 200 ] || { echo "✗ $url answered $got" >&2; exit 1; }
  [ "$len" = "$want" ] || { echo "✗ $url is $len bytes, built file is $want" >&2; exit 1; }
  echo "  ✓ $f ($len bytes)"
done
live=$(curl -s -A decomp-buddy-release "$BASE_URL/latest.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version" 2>/dev/null || true)
[ "$DRY" = 1 ] || [ "$live" = "$V" ] || { echo "✗ live latest.json says '$live', expected $V" >&2; exit 1; }
# The in-app updater reads latest*.yml - make sure every feed already says $V (the site caches GitHub's
# release list for 5 minutes, so give it up to 7).
if [ "$DRY" != 1 ]; then
  for feed in latest.yml latest-mac.yml latest-linux.yml; do
    got=""; for try in $(seq 1 15); do got=$(curl -sL -A decomp-buddy-release "$BASE_URL/$feed?t=$(date +%s)" | sed -n 's/^version: *//p' | head -1); [ "$got" = "$V" ] && break; sleep 30; done
    [ "$got" = "$V" ] || { echo "✗ updater feed $feed says '$got', expected $V" >&2; exit 1; }
    echo "  ✓ $feed → $V"
  done
fi
echo "✓ Decomp Buddy $V is live at $BASE_URL/"
