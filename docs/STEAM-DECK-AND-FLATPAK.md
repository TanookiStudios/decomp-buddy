# Decomp Buddy on a Steam Deck

## What works today (no Flathub needed)
1. In Desktop Mode, download the **AppImage** from tanookistudios.com/decomp-buddy, right-click it →
   Properties → Permissions → "Is executable", and open it.
2. Settings → **Add Decomp Buddy To Steam** (quit Steam first). Back in Gaming Mode, Decomp Buddy is a
   tile in your library and opens in **Couch Mode**: big tiles, A to play, B to go back.
3. In Gaming Mode Decomp Buddy starts in Couch Mode on its own (it notices it's running inside gamescope).
4. Installed Games → Install To Steam puts each game in Gaming Mode too.

## A Flatpak (optional)
`packaging/flatpak/com.tanookistudios.DecompBuddy.yml` wraps the Linux build. Flatpaks only build on
Linux (a Linux PC, a Steam Deck in Desktop Mode, or a Linux CI runner):

    npx electron-builder --linux dir
    flatpak install flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.electronjs.Electron2.BaseApp//24.08
    flatpak-builder --user --install --force-clean build-dir packaging/flatpak/com.tanookistudios.DecompBuddy.yml
    flatpak build-bundle ~/.local/share/flatpak/repo decomp-buddy.flatpak com.tanookistudios.DecompBuddy

The resulting `decomp-buddy.flatpak` installs on a Deck with `flatpak install --user decomp-buddy.flatpak`.
Inside a Flatpak the app's own updater is off (Flatpak does updates).

## Flathub: a decision, not a build step
Flathub's rules (docs.flathub.org/docs/for-app-authors/requirements, checked 2026-09-28):
- open-source apps must be **built from source** on Flathub's servers (so the repo would need to be public);
- apps that are "thin launchers around other tools" and apps that bundle or run **Wine** get extra scrutiny
  and may be refused.
So submitting is Maddie's call (open-sourcing, and whether to drop the Wine feature from that build).
