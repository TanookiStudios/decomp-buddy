// CMake and Ninja for Build Here: the official downloads, pinned by version and checksum, kept in the app's own
// folder, so nobody has to install them. Windows has no Build Here yet, so it isn't listed.
import fs from "node:fs";
import path from "node:path";
import { download, extractZip } from "./setup.js";

const CMAKE = "4.4.5", NINJA = "1.13.2";
const cmake = (file, sha256, bin) => ({ name: "cmake", file, sha256, bin, url: `https://github.com/Kitware/CMake/releases/download/v${CMAKE}/${file}` });
const ninja = (file, sha256) => ({ name: "ninja", file, sha256, bin: ".", url: `https://github.com/ninja-build/ninja/releases/download/v${NINJA}/${file}` });
const MAC = [cmake(`cmake-${CMAKE}-macos-universal.tar.gz`, "679e77a96b9ef9484cc6c1445255fc4f84206b48a65420efbedf16bdab55fbff", "CMake.app/Contents/bin"),
  ninja("ninja-mac.zip", "c99048673aa765960a99cf10c6ddb9f1fad506099ff0a0e137ad8960a88f321b")];
export const TOOLCHAIN = {
  "darwin-arm64": MAC, "darwin-x64": MAC,
  "linux-x64": [cmake(`cmake-${CMAKE}-linux-x86_64.tar.gz`, "ed85135c5a5135b45e50423cb406dea04ca3338da0b8ef3c9ede963559680be0", "bin"),
    ninja("ninja-linux.zip", "5749cbc4e668273514150a80e387a957f933c6ed3f5f11e03fb30955e2bbead6")],
  "linux-arm64": [cmake(`cmake-${CMAKE}-linux-aarch64.tar.gz`, "301d5063ab259577c1b57ce5490b1aab9ea5c56dc4c822f73499553dab94925f", "bin"),
    ninja("ninja-linux-aarch64.zip", "fd2cacc8050a7f12a16a2e48f9e06fca5c14fc4c2bee2babb67b58be17a607fc")],
};

// Returns the folders to add to PATH, downloading whatever isn't there yet. A file that doesn't match its checksum
// is deleted by download() and nothing is kept.
export async function ensureBuildTools(dir, { log = () => {}, platform = process.platform, arch = process.arch, get = download, unpack = extractZip } = {}) {
  const set = TOOLCHAIN[`${platform}-${arch}`] || [], bins = [];
  for (const t of set) {
    const to = path.join(dir, `${t.name}-${t.sha256.slice(0, 12)}`), ready = path.join(to, ".ready");
    if (!fs.existsSync(ready)) {
      log(`Getting ${t.name} (only needed once)…`);
      fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, t.file);
      try {
        await get(t.url, file, log, { digest: `sha256:${t.sha256}` });
        await unpack(file, to);
      } finally { fs.rmSync(file, { force: true }); }
      if (t.name === "ninja") fs.chmodSync(path.join(to, "ninja"), 0o755);
      fs.writeFileSync(ready, "");
    }
    bins.push(path.join(to, t.bin));
  }
  return bins;
}
