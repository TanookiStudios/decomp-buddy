#!/bin/zsh
# Shared by release-mac.sh and install-local.sh. Source it, then: trap sign_cleanup EXIT; sign_setup
# Sign as Tanooki Studios LLC (Developer ID G2, issued 5 Oct 2026). The .p12 goes into a throwaway keychain we
# make here (electron-builder's own one can't be unlocked on this macOS), added to the search list for the build
# only; the original list is put back and the keychain deleted on any exit. Nothing prompts. No fallback: the old
# personal certificate must never sign a release.

SIGN_P12="$HOME/.decomp-buddy-signing/devid-tanooki.p12"
SIGNER="Developer ID Application: Tanooki Studios LLC (NPT8NXJ7C8)"
sign_cleanup() { [[ -n "${SIGN_KC:-}" ]] || return 0; security list-keychains -d user -s "${ORIG_KCS[@]}"; security delete-keychain "$SIGN_KC" 2>/dev/null; rm -rf "$SIGN_DIR"; }
sign_setup() {
  [ -s "$SIGN_P12" ] || { echo "✗ $SIGN_P12 missing - refusing to sign with anything else" >&2; exit 1; }
  SIGN_DIR=$(mktemp -d); SIGN_KC="$SIGN_DIR/sign.keychain-db"; SIGN_KC_PW=$(openssl rand -hex 16)
  ORIG_KCS=("${(@f)$(security list-keychains -d user | sed -e 's/^ *"//' -e 's/"$//')}")
  security create-keychain -p "$SIGN_KC_PW" "$SIGN_KC"
  security set-keychain-settings -lut 7200 "$SIGN_KC"
  security unlock-keychain -p "$SIGN_KC_PW" "$SIGN_KC"
  security import "$SIGN_P12" -k "$SIGN_KC" -P "$(security find-generic-password -a decomp-buddy -s decomp-buddy-devid-p12 -w)" -T /usr/bin/codesign -T /usr/bin/productsign >/dev/null
  security set-key-partition-list -S apple-tool:,apple: -s -k "$SIGN_KC_PW" "$SIGN_KC" >/dev/null 2>&1 || true
  security list-keychains -d user -s "$SIGN_KC" "${ORIG_KCS[@]}"
  IDS=$(security find-identity -v -p codesigning "$SIGN_KC"); [[ "$IDS" == *"$SIGNER"* ]] || { echo "✗ $SIGNER not usable from the signing keychain" >&2; exit 1; }
  unset CSC_LINK CSC_KEY_PASSWORD
  export CSC_NAME="Tanooki Studios LLC (NPT8NXJ7C8)"
}

bundle_site_data() {
  # Bundle the latest published finds so a fresh install has them even offline.
  SITE_FINDS="$HOME/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/finds.json"
  [ -f "$SITE_FINDS" ] && cp "$SITE_FINDS" finds.json && echo "bundled finds.json ($(node -p "require('./finds.json').games.length") games)"
  SITE_SOURCES="$HOME/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/sources.json"
  [ -f "$SITE_SOURCES" ] && cp "$SITE_SOURCES" sources.json && echo "bundled sources.json ($(node -p "require('./sources.json').sources.length") sources)"
  SITE_PLANS="$HOME/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/plans.json"
  [ -f "$SITE_PLANS" ] && cp "$SITE_PLANS" plans.json && echo "bundled plans.json ($(node -p "Object.keys(require('./plans.json').plans).length") plans)"
  return 0
}
