// The computer a "How It Runs" report is about, in tidy words: the player sees exactly this before sending.
// Never the computer's name (os.hostname).
import os from "node:os";
import fs from "node:fs";

export const tidyCpu = (s) => String(s || "").replace(/\((?:R|TM)\)/gi, "").replace(/\b(?:CPU|Processor)\b/gi, "").replace(/@.*$/, "").replace(/\s+/g, " ").trim();
// Electron's GPU report -> "RTX 3050 Laptop GPU (driver 32.0.15.9649)". The renderer line looks like
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9649)".
export function tidyGpu(info, platform = process.platform) {
  const dev = (info?.gpuDevice || []).find((d) => d.active) || info?.gpuDevice?.[0];
  const raw = String(dev?.deviceString || info?.auxAttributes?.glRenderer || ""), m = raw.match(/^ANGLE \([^,]*,\s*(.+?),[^,]*\)$/);
  const name = (m ? m[1] : raw).replace(/^ANGLE Metal Renderer:\s*/i, "").replace(/\s+Direct3D.*$/i, "").replace(/\s*\(0x[0-9a-f]+\)/gi, "")
    .replace(/\((?:R|TM)\)/gi, "").replace(/\/PCIe\/SSE2/i, "").replace(/\s+/g, " ").trim();
  return name ? `${name}${dev?.driverVersion && platform !== "darwin" ? ` (driver ${dev.driverVersion})` : ""}` : "";
}
const prettyLinux = () => { for (const f of ["/run/host/os-release", "/etc/os-release"]) try { const m = fs.readFileSync(f, "utf8").match(/^PRETTY_NAME="?([^"\n]+)"?/m); if (m) return m[1]; } catch {} return "Linux"; };
export const osName = (platform = process.platform, version = os.version(), release = os.release(), sysver = process.getSystemVersion?.()) =>
  platform === "win32" ? `${version} (${release.split(".")[2] || release})` : platform === "darwin" ? `macOS ${sysver || release}` : prettyLinux();
