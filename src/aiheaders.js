// Headers for every call to an OpenAI-compatible AI endpoint. A real product
// token says who we are; x-opencode-session ties every request made for one
// repository analysis together (first try, retries, facts) so OpenCode Go can
// group them. Ordinary OpenAI-compatible APIs simply ignore the extra header.

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

let version = "";
try { version = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version || ""; } catch {}

// DecompBuddy/<version> (+https://decompbuddy.com), RFC 9110 product-token shape.
export const USER_AGENT = `DecompBuddy${version ? `/${version}` : ""} (+https://decompbuddy.com)`;
export const SESSION_HEADER = "x-opencode-session";

// One repository analysis = one UUID, reused by everything that analysis asks for.
export const newSessionId = () => randomUUID();

export function aiHeaders(sessionId, extra = {}) {
  return { "User-Agent": USER_AGENT, [SESSION_HEADER]: sessionId || newSessionId(), ...extra };
}
