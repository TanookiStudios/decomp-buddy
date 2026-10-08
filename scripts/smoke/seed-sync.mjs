// Fixture: a save "made on the PC" sitting in the sync folder for the smoke's fake game.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupSaves } from "../../src/saves.js";
import { pushToCloud, gameKey } from "../../src/savesync.js";
const [cloud, repo, title] = process.argv.slice(2);
const pc = fs.mkdtempSync(path.join(os.tmpdir(), "db-pc-"));
for (const slot of ["slot1", "slot2"]) { fs.mkdirSync(path.join(pc, "data", "saves", slot), { recursive: true }); fs.writeFileSync(path.join(pc, "data", "saves", slot, "save.bin"), `pc ${slot}`); }
const b = await backupSaves(pc, ["slot1", "slot2"].map((s) => ({ path: path.join(pc, "data", "saves", s), documented: `<game folder>/data/saves/${s}/` })), { reason: "after-play" });
console.log(pushToCloud(b.file, cloud, gameKey(repo, title), { machine: "PC-9999", now: new Date("2099-01-01T00:00:00Z") }));
