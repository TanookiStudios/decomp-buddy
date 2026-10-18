// Kiosk Mode PIN: kept only as a scrypt hash with a random salt - the PIN itself is never stored or logged.
import crypto from "node:crypto";

export const validPin = (pin) => /^\d{4,8}$/.test(String(pin ?? ""));

export function hashPin(pin) {
  if (!validPin(pin)) throw new Error("The PIN needs 4 to 8 digits.");
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString("hex"), hash: crypto.scryptSync(String(pin), salt, 32).toString("hex") };
}

export function checkPin(pin, rec) {
  if (!validPin(pin) || !/^[0-9a-f]{64}$/.test(rec?.hash || "") || !/^[0-9a-f]+$/.test(rec?.salt || "")) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(String(pin), Buffer.from(rec.salt, "hex"), 32), Buffer.from(rec.hash, "hex"));
}

// Three wrong tries, then nothing counts for 3 seconds.
export function pinGate({ tries = 3, waitMs = 3000 } = {}) {
  let fails = 0, until = 0;
  return (pin, rec, now = Date.now()) => {
    if (now < until) return { ok: false, wait: until - now };
    if (checkPin(pin, rec)) { fails = 0; return { ok: true }; }
    if (++fails < tries) return { ok: false };
    fails = 0; until = now + waitMs;
    return { ok: false, wait: waitMs };
  };
}
