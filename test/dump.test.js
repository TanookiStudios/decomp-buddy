import { test } from "node:test";
import assert from "node:assert/strict";
import { dumpKind, parseDrutil, ripCommands } from "../src/dump.js";

test("dumpKind: what a PC drive can and can't read", () => {
  assert.equal(dumpKind("PlayStation").kind, "cd-raw");
  assert.equal(dumpKind("Sega Saturn").kind, "cd-raw");
  assert.equal(dumpKind("PlayStation 2").kind, "dvd-iso");
  for (const c of ["GameCube", "Wii", "Xbox", "Xbox 360", "Dreamcast"]) assert.equal(dumpKind(c).kind, "impossible", c);
  assert.match(dumpKind("GameCube").why, /CleanRip/);
  assert.equal(dumpKind("Nintendo 64").kind, "unknown");
});

test("parseDrutil reads the drive, media type, device and size", () => {
  const out = ` Vendor   Product           Rev \n HL-DT-ST DVDRW  GX50N      RR06\n\n           Type: CD-ROM               Name: /dev/disk4\n       Sessions: 1                  Tracks: 2 \n     Space Used:   62:29:62         blocks:   281237 / 575.97MB / 549.29MiB\n`;
  const d = parseDrutil(out);
  assert.equal(d.media, "CD-ROM"); assert.equal(d.device, "/dev/disk4"); assert.equal(d.bytes, 281237 * 2048); assert.match(d.drive, /GX50N/);
  assert.equal(parseDrutil(" Vendor Product\n X Y\n\n  Type: No Media Inserted\n").media, null);
  assert.equal(parseDrutil(""), null);
});

test("ripCommands: raw CD via cdrdao + toc2cue; DVD via dd on the raw device, as admin on macOS", () => {
  const cd = ripCommands("cd-raw", { device: "/dev/disk4", outBase: "/o/FF7", platform: "darwin" });
  assert.deepEqual(cd.map((c) => c[0]), ["diskutil", "cdrdao", "toc2cue"]);
  assert.ok(cd[1][1].includes("--read-raw"));
  const dvd = ripCommands("dvd-iso", { device: "/dev/disk4", outBase: "/o/G", platform: "darwin" });
  assert.equal(dvd[1][1][0], "if=/dev/rdisk4"); assert.equal(dvd[1][2].admin, true);
  assert.deepEqual(ripCommands("dvd-iso", { device: "/dev/sr0", outBase: "/o/G", platform: "linux" }).map((c) => c[0]), ["dd"]);
  assert.throws(() => ripCommands("impossible", { device: "x", outBase: "y" }));
});
