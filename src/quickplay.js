// Quick Play: the games you played last, for the Dock menu (Mac) and the taskbar jump list (Windows).
// library: listLibrary()'s entries. Only games played on this computer (not phone/headset copies), newest first.
export function recentGames(library, n = 5) {
  return library.filter((g) => g.lastPlayed && !g.onDevice && g.folder && g.title)
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed)).slice(0, n).map(({ folder, title }) => ({ folder, title }));
}
// A Windows jump-list entry starts the app with the same decompbuddy://play link a desktop shortcut uses (it needs
// this install's key, so a web page can't start games).
export const playLink = (folder, key) => `decompbuddy://play?folder=${encodeURIComponent(folder)}&k=${key}`;
