import { test } from "node:test";
import assert from "node:assert/strict";
import { aiMentions } from "../src/ailabel.js";

test("aiMentions: every README sentence that mentions AI, once each, and nothing else", () => {
  const readme = "# Game\nA native port of Mega Man 7.\n\nThis port was made using Claude Code over a month. Enjoy!\n<!-- AI notes hidden -->\nThe enemy AI is unchanged. Not vibe coded, I promise.";
  assert.deepEqual(aiMentions(readme), ["This port was made using Claude Code over a month.", "The enemy AI is unchanged.", "Not vibe coded, I promise."]);
  assert.deepEqual(aiMentions("Air Gear and the AIR mode. Gemini Saga."), ["Gemini Saga."]); // a reader decides; the net is wide on purpose
  assert.deepEqual(aiMentions("No mentions here."), []);
});
