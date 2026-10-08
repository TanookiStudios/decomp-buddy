import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startReceiver, sendFolder, probeReceiver } from "../src/transfer.js";

test("a folder crosses the wire byte-identical, wrong code refused, server stops", async () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "tx-src-")), dst = fs.mkdtempSync(path.join(os.tmpdir(), "tx-dst-"));
  const game = path.join(src, "Skate 3 - Xbox 360"); fs.mkdirSync(path.join(game, "Game Files"), { recursive: true });
  fs.writeFileSync(path.join(game, "skate3.exe"), Buffer.alloc(300_000, 7)); fs.writeFileSync(path.join(game, "Game Files", "PUT GAME FILE HERE.txt"), "hi"); fs.writeFileSync(path.join(game, "decomp-buddy.json"), "{}");
  const done = [];
  const rx = await startReceiver(dst, { onDone: (n) => done.push(n) });
  assert.match(rx.code, /^\d{6}$/);
  assert.equal((await probeReceiver("127.0.0.1", rx.port)).app, "decomp-buddy");
  await assert.rejects(sendFolder(game, { host: "127.0.0.1", port: rx.port, code: "000000" }), /401/);
  let progressed = 0;
  await sendFolder(game, { host: "127.0.0.1", port: rx.port, code: rx.code, onProgress: (b) => (progressed = b) });
  assert.ok(progressed > 0);
  assert.deepEqual(done, ["Skate 3 - Xbox 360"]);
  assert.ok(fs.readFileSync(path.join(dst, "Skate 3 - Xbox 360", "skate3.exe")).equals(Buffer.alloc(300_000, 7)));
  assert.equal(fs.readFileSync(path.join(dst, "Skate 3 - Xbox 360", "Game Files", "PUT GAME FILE HERE.txt"), "utf8"), "hi");
  await rx.stop();
  await assert.rejects(probeReceiver("127.0.0.1", rx.port));
});
