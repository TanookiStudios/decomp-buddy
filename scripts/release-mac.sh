#!/bin/zsh
# Signed + notarized Mac build. Needs the Developer ID .p12 (see mac-signing.zsh) and an App Store
# Connect API key: ~/.decomp-buddy-signing/notary.env sets APPLE_API_KEY_ID and APPLE_API_ISSUER (or set
# them yourself), and the key itself is ~/.appstoreconnect/private_keys/AuthKey_<id>.p8.
set -euo pipefail
cd "$(dirname "$0")/.."
NOTARY_ENV="$HOME/.decomp-buddy-signing/notary.env"
[ -f "$NOTARY_ENV" ] && set -a && . "$NOTARY_ENV" && set +a
[ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] || { echo "✗ APPLE_API_KEY_ID / APPLE_API_ISSUER not set (put them in $NOTARY_ENV)" >&2; exit 1; }
export APPLE_API_KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY_ID}.p8"
source scripts/mac-signing.zsh
trap sign_cleanup EXIT
sign_setup
bundle_site_data
npx electron-builder --mac
# Every Mac app we just built must carry the Tanooki signature - fail the release otherwise.
for app in dist/mac*/*.app; do
  sig=$(codesign -dvv "$app" 2>&1); who=$(print -r -- "$sig" | sed -n 's/^Authority=//p' | head -1)
  [ "$who" = "$SIGNER" ] || { echo "✗ $app is signed by '$who', expected '$SIGNER'" >&2; exit 1; }
  echo "✓ $app signed by $who"
done
