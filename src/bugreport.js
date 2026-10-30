// One-Click Bug Report: the project's own "new issue" page, filled in with what a developer needs when a port won't
// start. Opened in the player's browser; they read it and submit it themselves. Nothing is sent by Decomp Buddy, and
// the player's home folder (which usually holds their name) never appears: it becomes "~".
const OS = { darwin: "macOS", win32: "Windows", linux: "Linux" };

// Any home-folder path (this user's, or a Windows/Mac/Linux one from a log) -> "~".
export function scrub(text, home = "") {
  let t = String(text || "");
  if (home) for (const h of [home, home.replace(/\\/g, "/"), home.replace(/\//g, "\\")]) t = t.split(h).join("~");
  return t.replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, "~").replace(/\/(?:Users|home)\/[^/\s"']+/g, "~");
}

export function reportBody({ title, tag, platform, arch, appVersion, exit, tail, home }) {
  const lines = scrub(tail, home).split(/\r?\n/).filter(Boolean).slice(-15).join("\n").slice(-2500);
  return [`**Game:** ${title}${tag ? ` (${tag})` : ""}`, `**Computer:** ${OS[platform] || platform}${arch ? ` (${arch})` : ""}`,
    `**What happened:** it closed right away${exit ? ` (${exit})` : ""}.`, "", "**The last lines it printed:**", "```", lines || "(nothing)", "```", "",
    `_Filled in by Decomp Buddy ${appVersion}. The player read this before posting it; nothing was sent automatically._`].join("\n");
}

// The new-issue page on the project's host, or null when the link isn't one we know.
export function issueUrl(repoUrl, title, body) {
  let u; try { u = new URL(repoUrl); } catch { return null; }
  const repo = u.pathname.replace(/^\/|\.git$|\/$/g, ""); if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const q = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  if (u.hostname === "github.com") return `https://github.com/${repo}/issues/new?${q({ title, body })}`;
  if (u.hostname === "codeberg.org") return `https://codeberg.org/${repo}/issues/new?${q({ title, body })}`;
  if (u.hostname === "gitlab.com") return `https://gitlab.com/${repo}/-/issues/new?${q({ "issue[title]": title, "issue[description]": body })}`;
  return null;
}
