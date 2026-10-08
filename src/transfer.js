// Send a game folder to another computer on the LAN: the receiver runs a small HTTP
// server with a one-time code; the sender streams a tar of the folder. Private
// addresses only, one transfer at a time, server stops when told.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const isPrivate = (ip) => { const a = String(ip).replace(/^::ffff:/, ""); return a === "127.0.0.1" || a === "::1" || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^fe80:/i.test(a) || /^fd/i.test(a); };

export function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
}

// Receiver. onDone(folderName) after each successful unpack. Returns { port, code, stop }.
export function startReceiver(destRoot, { onLog = () => {}, onDone = () => {}, port = 0 } = {}) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  let busy = false;
  const server = http.createServer((req, res) => {
    const ip = req.socket.remoteAddress || "";
    if (!isPrivate(ip)) { res.writeHead(403); return res.end("LAN only"); }
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/ping") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ app: "decomp-buddy", host: os.hostname() })); }
    if (req.method !== "POST" || url.pathname !== "/send") { res.writeHead(404); return res.end(); }
    if (url.searchParams.get("code") !== code) { res.writeHead(401); return res.end("Wrong code"); }
    if (busy) { res.writeHead(409); return res.end("Another transfer is running"); }
    const name = path.basename(url.searchParams.get("name") || "transfer").replace(/[\\/:*?"<>|]/g, "_");
    busy = true;
    fs.mkdirSync(destRoot, { recursive: true });
    onLog(`Receiving ${name} from ${ip.replace(/^::ffff:/, "")}…`);
    const tar = spawn("tar", ["-xf", "-", "-C", destRoot], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    tar.stderr.on("data", (d) => (err += d));
    let bytes = 0; req.on("data", (c) => (bytes += c.length));
    req.pipe(tar.stdin);
    tar.on("close", (codeExit) => {
      busy = false;
      if (codeExit === 0) { onLog(`Received ${name} (${(bytes / 1e6).toFixed(0)} MB).`); onDone(name); res.writeHead(200); res.end("ok"); }
      else { onLog(`Receive failed: ${err.trim() || `tar exited ${codeExit}`}`); res.writeHead(500); res.end(err || "tar failed"); }
    });
    req.on("error", () => { busy = false; tar.kill(); });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "0.0.0.0", () => resolve({ port: server.address().port, code, addresses: lanAddresses(), stop: () => new Promise((r) => server.close(() => r())) }));
  });
}

// Sender: tar the folder (system tar keeps modes) and POST it. onProgress(bytesSent).
export function sendFolder(folder, { host, port, code, onProgress = () => {}, onLog = () => {} }) {
  return new Promise((resolve, reject) => {
    const name = path.basename(folder);
    const tar = spawn("tar", ["-cf", "-", "-C", path.dirname(folder), name], { stdio: ["ignore", "pipe", "pipe"] });
    let err = ""; tar.stderr.on("data", (d) => (err += d));
    const req = http.request({ host, port, method: "POST", path: `/send?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`, headers: { "content-type": "application/x-tar", "transfer-encoding": "chunked" }, timeout: 0 }, (res) => {
      let body = ""; res.on("data", (d) => (body += d));
      res.on("end", () => (res.statusCode === 200 ? resolve({ name }) : reject(new Error(`${host}:${port} said ${res.statusCode}: ${body || err}`))));
    });
    req.on("error", (e) => reject(new Error(`Couldn't reach ${host}:${port} - ${e.message}`)));
    let sent = 0;
    tar.stdout.on("data", (c) => { sent += c.length; onProgress(sent); });
    tar.stdout.pipe(req);
    tar.on("close", (c) => { if (c !== 0) { req.destroy(); reject(new Error(`tar failed: ${err.trim()}`)); } });
    onLog(`Sending ${name} to ${host}:${port}…`);
  });
}

export async function probeReceiver(host, port) {
  const res = await fetch(`http://${host}:${port}/ping`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`No receiver at ${host}:${port}`);
  return res.json();
}
