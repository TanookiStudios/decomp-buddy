// Malware scan label: a game whose published downloads were all scanned shows "Scanned For Malware" in At A Glance.
// Run: scripts/smoke.sh scripts/smoke/scan.js <throwaway profile dir>
await refresh(); await loadCatalog({ refresh: true }); await wait(1500);
const g = catalog.games.find((x) => x.scan?.at && x.facts), plain = catalog.games.find((x) => !x.scan && x.facts);
if (!g) return { ok: false, why: "no scanned game in the catalog", scanned: catalog.games.filter((x) => x.scan).length };
await showDetail(g); await wait(800);
const txt = document.getElementById("detail").innerText;
await showDetail(plain); await wait(800);
const plainTxt = document.getElementById("detail").innerText;
return { ok: txt.includes("Scanned For Malware") && /found no known malware/.test(txt) && !plainTxt.includes("Scanned For Malware"), game: g.title, scan: g.scan, line: txt.split("\n").find((l) => /no known malware/.test(l)) };
