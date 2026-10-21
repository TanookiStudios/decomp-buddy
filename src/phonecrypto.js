// Phone Link messages: every request and answer is sealed with AES-256-GCM under the key from the pairing QR code,
// so another device on the same Wi-Fi can neither read nor fake them (plain HTTP on the home network, no TLS needed).
// A message carries its own time and is refused if it's more than two minutes off or was seen before (no replays).
import crypto from "node:crypto";

export const newKey = () => crypto.randomBytes(32).toString("base64");

export function seal(keyB64, obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64") };
}

// seen: a Map of iv -> time, shared across calls by the caller; old entries are dropped as it goes.
export function open(keyB64, env, { now = Date.now(), seen = null, maxSkew = 120e3 } = {}) {
  if (!env || typeof env.iv !== "string" || typeof env.ct !== "string") throw new Error("bad message");
  const iv = Buffer.from(env.iv, "base64"), raw = Buffer.from(env.ct, "base64");
  if (iv.length !== 12 || raw.length < 17) throw new Error("bad message");
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  d.setAuthTag(raw.subarray(raw.length - 16));
  const msg = JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8"));
  if (typeof msg.ts !== "number" || Math.abs(now - msg.ts) > maxSkew) throw new Error("stale message");
  if (seen) {
    for (const [k, t] of seen) if (now - t > maxSkew * 2) seen.delete(k);
    if (seen.has(env.iv)) throw new Error("replayed message");
    seen.set(env.iv, now);
  }
  return msg;
}
