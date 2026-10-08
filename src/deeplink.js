// decompbuddy://add?repo=owner/name[&game=Title][&host=gitlab] - from the website's "Open In Decomp Buddy".
// Only ever fills in the links box; nothing is read, downloaded or run until the user presses Read Repos.
export function parseDeepLink(url) {
  let u; try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== "decompbuddy:" || (u.hostname || u.pathname.replace(/^\/+/, "")) !== "add") return null;
  const repo = u.searchParams.get("repo") || "";
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo.includes("..")) return null;
  const host = u.searchParams.get("host") === "gitlab" ? "gitlab" : "github";
  const game = (u.searchParams.get("game") || "").slice(0, 200) || null;
  return { repoUrl: `https://${host}.com/${repo}`, repo, host, game };
}
