#!/bin/zsh
# Copy this commit's source into the public repo (TanookiStudios/decomp-buddy) as one Tanooki Studios commit and
# print its sha. The private history never goes there: its commits carry a personal email. Files holding account
# ids or signing setup stay private, and a personal-detail check refuses the publish if anything slips through.
#   scripts/publish-source.sh
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
export GH_TOKEN="${GH_TOKEN:-$(gh auth token -u TanookiStudios)}"
CRED=(-c credential.helper= -c "credential.helper=!GH_TOKEN=$GH_TOKEN gh auth git-credential")
PRIVATE=(.github/workflows/windows-signed.yml ios/scripts/asc-setup.py ios/scripts/upload-testflight.sh)
PUB=$(mktemp -d)
git "${CRED[@]}" clone -q --depth 1 https://github.com/TanookiStudios/decomp-buddy.git "$PUB"
find "$PUB" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD | tar -x -C "$PUB"
for f in $PRIVATE; do rm -f "$PUB/$f"; done
# plans.json credits strangers' GitHub accounts, and some of them are really called Michael: it skips that one word.
if grep -rliE "michael|ireland|madilyn|maddietendo|ISSUER *= *\"[0-9a-f]" "$PUB" --exclude-dir=.git --exclude=publish-source.sh --exclude=plans.json >&2 \
  || grep -liE "ireland|madilyn|maddietendo" "$PUB/plans.json" >&2; then
  echo "✗ a personal name or account id is in the files above - source not published" >&2; exit 1
fi
cd "$PUB"; git add -A
git diff --cached --quiet || git -c user.name="Tanooki Studios" -c user.email="hello@tanookistudios.com" commit -qm "Decomp Buddy $V source"
git "${CRED[@]}" push -q origin HEAD:main
git rev-parse HEAD
rm -rf "$PUB"
