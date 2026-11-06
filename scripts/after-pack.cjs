// 7zip-bin ships most of its programs without permission to run, so every packaged Linux and Intel Mac app failed
// to unpack .zip games with "spawn ... EACCES". Runs on every build, before signing.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack({ appOutDir, electronPlatformName }) {
  if (electronPlatformName === "win32") return; // Windows runs 7za.exe by its name
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "7za" && e.isFile()) { fs.chmodSync(p, 0o755); found.push(p); }
    }
  };
  walk(appOutDir);
  if (!found.length) throw new Error(`after-pack: no 7za in ${appOutDir}, so this build couldn't unpack games.`);
};
