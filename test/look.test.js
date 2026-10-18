import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLook, lookFileProblem } from "../src/look.js";

test("look settings are clamped and file names can't be paths", () => {
  assert.deepEqual(cleanLook(), { accent: "", bgImage: "", bgDim: 0.6, music: "", musicVolume: 0.5, musicOn: false, layout: "grid", cardSize: 150 });
  const l = cleanLook({ accent: "#E0A53A", bgImage: "../settings.json", bgDim: 5, music: "music-1.mp3", musicVolume: -1, musicOn: 1, layout: "tower", cardSize: 999 });
  assert.deepEqual(l, { accent: "#e0a53a", bgImage: "", bgDim: 0.9, music: "music-1.mp3", musicVolume: 0, musicOn: true, layout: "grid", cardSize: 240 });
  assert.equal(cleanLook({ bgImage: "image-1.webp" }).bgImage, "image-1.webp");
  assert.equal(cleanLook({ bgImage: "image-1.mp3" }).bgImage, "");
  assert.equal(cleanLook({ accent: "red" }).accent, "");
});

test("only small enough pictures and music of the right kind are taken", () => {
  assert.equal(lookFileProblem("image", "a.PNG", 1000), "");
  assert.match(lookFileProblem("image", "a.gif", 1000), /PNG, JPG or WebP/);
  assert.match(lookFileProblem("image", "a.jpg", 11 * 1024 * 1024), /over 10 MB/);
  assert.equal(lookFileProblem("music", "a.m4a", 29 * 1024 * 1024), "");
  assert.match(lookFileProblem("music", "a.wav", 1), /MP3, OGG or M4A/);
});
