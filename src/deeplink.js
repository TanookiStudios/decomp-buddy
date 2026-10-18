// decompbuddy://add?repo=owner/name[&game=Title][&host=gitlab|codeberg] - from the website's "Open In Decomp Buddy".
// Only ever fills in the links box; nothing is read, downloaded or run until the user presses Read Repos.
// decompbuddy://play?folder=<installed game folder>&k=<this install's shortcut key> - a desktop shortcut for a game that
// needs Decomp Buddy to start it (Wine or Proton). Without the key a web page could start your games.
import { HOSTS } from "./hosts.js";

export function parseDeepLink(url) {
  let u; try { u = new URL(String(url)); } catch { return null; }
  const verb = u.protocol === "decompbuddy:" && (u.hostname || u.pathname.replace(/^\/+/, ""));
  if (verb === "play") {
    const folder = u.searchParams.get("folder") || "", k = u.searchParams.get("k") || "";
    return folder && folder.length < 1000 && /^[0-9a-f]{32}$/.test(k) ? { play: true, folder, key: k } : null;
  }
  if (verb !== "add") return null;
  const repo = u.searchParams.get("repo") || "";
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo.includes("..")) return null;
  const asked = u.searchParams.get("host"), host = Object.hasOwn(HOSTS, asked || "") ? asked : "github";
  const game = (u.searchParams.get("game") || "").slice(0, 200) || null;
  return { repoUrl: `https://${HOSTS[host].domain}/${repo}`, repo, host, game };
}
