// Credits: a GitHub contributors list -> the people shown in "Made By" (bots left out, top 12, avatar without size).
// GitHub marks some bots as plain users (ImgBotApp, OpenGOALBot, OpenRCT2-git-bot), so names that end in "bot"/"botapp"
// or have "bot" as their own word count as bots too; Ibot02 and botanicvelious are people and stay.
export const isBot = (c) => c?.type === "Bot" || /\[bot\]$|(?:bot|botapp)$|(?:^|[-_])bot(?:[-_]|$)/i.test(c?.login || "");
export const people = (list) => (Array.isArray(list) ? list : []).filter((c) => c?.login && !isBot(c))
  .slice(0, 12).map((c) => ({ login: c.login, avatar: String(c.avatar_url || c.avatar || "").replace(/\?.*$/, ""), n: c.contributions ?? c.n ?? 0 }));
