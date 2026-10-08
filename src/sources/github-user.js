// Source: every repository of a GitHub user or organization that looks like a
// decomp/recomp/port. One API call per 100 repos; no release lookups (rate limit),
// so version/status show as unknown until a game is analysed.

const KEYWORDS = /recomp|decomp|port|native|pc\b|remaster|reverse/i;

export function makeSource(user) {
  const id = `github-user:${user.toLowerCase()}`;
  return {
    SOURCE: { id, label: `github.com/${user}`, url: `https://github.com/${user}` },
    async fetchSource() {
      const repos = [];
      for (let page = 1; page <= 5; page++) {
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&page=${page}&sort=pushed`, { headers: { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) throw new Error(`GitHub user or org "${user}" not found`);
        if (res.status === 403) throw new Error("GitHub rate limit hit - try again in an hour");
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const batch = await res.json();
        repos.push(...batch);
        if (batch.length < 100) break;
      }
      const live = repos.filter((r) => !r.fork && !r.archived);
      const keyed = live.filter((r) => KEYWORDS.test(`${r.name} ${r.description || ""}`));
      return (keyed.length ? keyed : live).map((r) => ({
        source: id,
        id: `github:${r.full_name}`.toLowerCase(),
        title: humanize(r.name), project: r.name, console: "Unknown",
        platforms: [], repoUrl: r.html_url, repoHost: "github", owner: r.owner.login, repo: r.name,
        version: null, releaseUrl: `${r.html_url}/releases`, status: "unknown", updatedAt: r.pushed_at || "",
        iconUrl: "", website: r.homepage || "", aiAssisted: false, description: r.description || "",
      }));
    },
  };
}

export function humanize(name) {
  return name.replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b(recomp(iled|ilation)?|decomp(iled|ilation)?|pc port|port)\b/gi, "").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || name;
}
