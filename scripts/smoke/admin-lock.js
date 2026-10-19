// Admin is Maddie's computer only: typing the word does nothing elsewhere, and asking for it is refused.
await refresh(); await wait(500);
const type = async (w) => { for (const k of w) document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); await wait(800); };
await type("tanooki");
const afterTyping = { navHidden: $("adminNav").hidden, admin: (await window.buddy.getSettings()).admin };
await window.buddy.setSettings({ admin: true }); const forced = (await window.buddy.getSettings()).admin;
const s = await window.buddy.getSettings();
const ok = s.canAdmin ? (afterTyping.admin && !afterTyping.navHidden && forced) : (!afterTyping.admin && afterTyping.navHidden && !forced);
return { ok, canAdmin: s.canAdmin, afterTyping, forced };
