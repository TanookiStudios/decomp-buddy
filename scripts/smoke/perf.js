// Perf: what the app costs on its own. Leaves the app idle after start-up and reports long main-thread
// stalls (start-up freeze), heap size, and the biggest data it holds. CPU/RAM per process is sampled
// from outside by scripts/smoke/perf.sh.
const long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true });
const t0 = performance.now();
await wait(Number(window.SMOKE_IDLE || 90000));
const heapMB = Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576);
return { ok: true, sinceLoadS: Math.round((performance.now() + t0) / 1000), longTasks: long.length, longTotalMs: long.reduce((a, b) => a + b, 0), worstMs: Math.max(0, ...long), heapMB, games: (typeof catalog !== "undefined" && catalog?.games?.length) || 0, domNodes: document.getElementsByTagName("*").length };
