#!/bin/zsh
# Build this checkout for this Mac and replace /Applications/Decomp Buddy.app with it - Maddie's own copy
# follows every change (her rule, 8 Oct 2026). Signed as Tanooki like a release, but not notarized: a
# locally built app carries no quarantine flag, so it opens without Apple's online check.
# Built outside dist/ and deleted after copying, so Spotlight never finds a second Decomp Buddy.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="/Applications/Decomp Buddy.app"
source scripts/mac-signing.zsh
OUT=$(mktemp -d)
cleanup() { sign_cleanup; rm -rf "$OUT"; }
trap cleanup EXIT
sign_setup
npx electron-builder --mac dir --arm64 -c.mac.notarize=false -c.directories.output="$OUT" >"$OUT.log" 2>&1 || { tail -30 "$OUT.log" >&2; exit 1; }
BUILT="$OUT/mac-arm64/Decomp Buddy.app"
who=$(codesign -dvv "$BUILT" 2>&1 | sed -n 's/^Authority=//p' | head -1)
[ "$who" = "$SIGNER" ] || { echo "✗ built app is signed by '$who', expected '$SIGNER'" >&2; exit 1; }
codesign --verify --deep --strict "$BUILT"
# Close the running copy first (a normal Quit - nothing is lost), then swap.
if pgrep -xq "Decomp Buddy"; then osascript -e 'quit app "Decomp Buddy"'; for _ in {1..20}; do pgrep -xq "Decomp Buddy" || break; sleep 0.5; done; fi
pgrep -xq "Decomp Buddy" && { echo "✗ Decomp Buddy is still running - close it and run this again" >&2; exit 1; }
rm -rf "$APP.new"; ditto "$BUILT" "$APP.new"; rm -rf "$APP"; mv "$APP.new" "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "✓ installed $(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString) ($(git rev-parse --short HEAD)$([ -n "$(git status --porcelain)" ] && echo ", with unsaved changes")) - $(lipo -archs "$APP/Contents/MacOS/Decomp Buddy"), signed by $who"
