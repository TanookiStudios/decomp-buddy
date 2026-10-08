// GameBanana mods, read-only, through its public site API (apiv11 - no key; undocumented, so every
// field is read defensively). Mods download straight from GameBanana to this computer, are checked
// against the MD5 GameBanana publishes, and credit + link back to the author's page.

export const GB = "https://gamebanana.com/apiv11";
const UA = { "User-Agent": "DecompBuddy (+https://tanookistudios.com/decomp-buddy)", Accept: "application/json" };

// Games we've matched by hand; everything else is found by search and confirmed by the player.
export const KNOWN_GAMES = {
  "harbourmasters/shipwright": 16121,
  "zelda64recomp/zelda64recomp": 21763,
  "hedge-dev/unleashedrecomp": 21975,
  "banjorecomp/banjorecomp": 24169,
};

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GameBanana answered ${res.status}`);
  const j = await res.json();
  if (j?._sErrorCode) throw new Error(`GameBanana: ${j._sErrorCode}`);
  return j;
}

export async function searchGames(q, { fetchImpl = fetch } = {}) {
  const j = await get(`${GB}/Util/Search/Results?_sModelName=Game&_sOrder=best_match&_sSearchString=${encodeURIComponent(q)}`, fetchImpl);
  return (j._aRecords || []).slice(0, 8).map((r) => ({ id: r._idRow, name: r._sName, url: r._sProfileUrl || null, icon: r._sIconUrl || null }));
}

const SORTS = { popular: "Generic_MostDownloaded", new: "Generic_Newest", updated: "Generic_LatestUpdated", liked: "Generic_MostLiked" };
const img = (r) => { const i = r._aPreviewMedia?._aImages?.[0]; return i ? `${i._sBaseUrl}/${i._sFile220 || i._sFile}` : null; };
export function modOf(r) {
  return {
    id: r._idRow, name: r._sName || "Untitled", url: r._sProfileUrl || `https://gamebanana.com/mods/${r._idRow}`,
    author: r._aSubmitter?._sName || null, authorUrl: r._aSubmitter?._sProfileUrl || null, category: r._aRootCategory?._sName || null,
    image: img(r), likes: r._nLikeCount || 0, views: r._nViewCount || 0, version: r._sVersion || null,
    updated: r._tsDateUpdated || r._tsDateModified || r._tsDateAdded ? new Date(1000 * (r._tsDateUpdated || r._tsDateModified || r._tsDateAdded)).toISOString() : null,
    hasFiles: r._bHasFiles !== false, obsolete: !!r._bIsObsolete,
  };
}
export async function listMods(gameId, { page = 1, sort = "popular", fetchImpl = fetch } = {}) {
  const j = await get(`${GB}/Mod/Index?_nPage=${page}&_nPerpage=20&_aFilters%5BGeneric_Game%5D=${Number(gameId)}&_sSort=${SORTS[sort] || SORTS.popular}`, fetchImpl);
  return { total: j._aMetadata?._nRecordCount || 0, complete: !!j._aMetadata?._bIsComplete, mods: (j._aRecords || []).filter((r) => r._sModelName === "Mod").map(modOf) };
}

const strip = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
export async function modFiles(modId, { fetchImpl = fetch } = {}) {
  const j = await get(`${GB}/Mod/${Number(modId)}/ProfilePage`, fetchImpl);
  return {
    ...modOf(j), description: j._sDescription || "", license: strip(j._sLicense).slice(0, 600),
    updatedTs: j._tsDateUpdated || j._tsDateModified || null,
    files: (j._aFiles || []).map((f) => ({
      id: f._idRow, name: f._sFile, size: f._nFilesize || 0, md5: f._sMd5Checksum || null, url: f._sDownloadUrl || `https://gamebanana.com/dl/${f._idRow}`,
      description: f._sDescription || "", added: f._tsDateAdded ? new Date(f._tsDateAdded * 1000).toISOString() : null,
      clean: f._sAvResult ? f._sAvResult === "clean" : null, archived: !!f._bIsArchived,
    })).filter((f) => !f.archived),
  };
}
