// Quick Play: listing the library builds the Dock menu from the most recently played games (newest first, never a
// game that was never played). Run by scripts/smoke/quickplay.sh.
await refresh(); await window.buddy.libraryList(); await wait(300);
const items = await window.buddy.quickPlayItems();
return { ok: JSON.stringify(items.map((g) => g.title)) === JSON.stringify(["Charlie", "Alpha"]), items };
