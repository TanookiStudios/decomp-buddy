// Install Doctor: a game that can't run (no permission), is blocked by the Mac, and printed a graphics error gets all
// three findings; Let It Run and Unblock On This Mac fix the first two. Run by scripts/smoke/doctor.sh.
const out = {};
await refresh(); await wait(800);
showView("library"); await renderLibrary(); await wait(800);
const g = library.find((x) => /Broken/.test(x.title)); out.found = !!g;
await openMore(g); await wait(300); out.emblem = !!document.querySelector("#moreDoctor svg.emblem"); out.heading = document.querySelector("#moreDoctor h4").textContent;
await runCheck(g); await wait(1500);
out.findings = [...$("moreCheckOut").querySelectorAll("li")].map((li) => li.textContent).filter((t) => t.startsWith("✗"));
out.buttons = [...$("moreCheckOut").querySelectorAll("button")].map((b) => b.textContent);
out.tail = !!$("moreCheckOut").querySelector("pre.logTail");
out.reportButton = !!$("moreReport");
const url = await window.buddy.bugUrl(g.folder); const body = decodeURIComponent(url.split("body=")[1] || "");
out.report = { page: url.split("?")[0], hasError: body.includes("VK_ERROR"), hidesHome: !body.includes((await window.buddy.getSettings()).installDir?.split("/.decomp-buddy-smoke")[0] || "/Users/"), scrubbed: body.includes("~/Games/broken") };
$("moreFixRun")?.click(); await wait(1800);
$("moreFixMac")?.click(); await wait(1800);
const after = await window.buddy.gameCheck(g.folder);
out.after = { cantRun: after.cantRun, quarantined: after.quarantined };
const has = (re) => out.findings.some((t) => re.test(t));
return { ok: out.found && out.emblem && has(/isn't allowed to run/) && has(/blocking it/) && has(/graphics/) && out.buttons.includes("Let It Run") && out.buttons.includes("Unblock On This Mac") && out.tail && !after.cantRun && !after.quarantined && out.reportButton && out.report.page === "https://github.com/x/broken/issues/new" && out.report.hasError && out.report.hidesHome && out.report.scrubbed, ...out };
