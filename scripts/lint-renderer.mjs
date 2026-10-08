// The renderer's classic scripts share globals: lint them as the page sees them, one after another.
import fs from "node:fs";
const order = ["i18n.js", "app.js", ...fs.readdirSync("renderer").filter((n) => n.endsWith(".js") && !["i18n.js", "app.js"].includes(n)).sort()];
fs.mkdirSync(".lint", { recursive: true });
fs.writeFileSync(".lint/renderer.js", order.map((n) => fs.readFileSync(`renderer/${n}`, "utf8")).join("\n;\n"));
