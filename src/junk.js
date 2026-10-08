// Removes the invisible files macOS sprinkles everywhere (they show up on Windows).

import fs from "node:fs";
import path from "node:path";

const JUNK_NAMES = new Set([
  ".DS_Store", "__MACOSX", ".Spotlight-V100", ".Trashes", ".fseventsd",
  ".TemporaryItems", ".AppleDouble", ".LSOverride", ".apdisk", "Icon\r", ".VolumeIcon.icns",
]);

export function isMacJunk(name) {
  return JUNK_NAMES.has(name) || name.startsWith("._");
}

// keepIcons: leave the Mac folder icons (Icon\r) in place - used right after setup so the
// folders look right in Finder; Clean Mac Junk (before the copy) removes them.
export function sweepMacJunk(root, { keepIcons = false } = {}) {
  const removed = [];
  if (!fs.existsSync(root)) return removed;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (isMacJunk(entry.name) && !(keepIcons && entry.name === "Icon\r")) {
        fs.rmSync(full, { recursive: true, force: true });
        removed.push(full);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(root);
  return removed;
}
