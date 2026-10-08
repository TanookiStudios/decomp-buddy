// Catches undefined names (typos, a helper that moved) - `npm run lint`. The renderer's scripts share
// one global scope in the page, so they're checked together as one file (scripts/lint-renderer.mjs).
const g = (s) => Object.fromEntries(s.split(" ").map((k) => [k, "readonly"]));
const node = g("process Buffer console setTimeout clearTimeout setInterval clearInterval setImmediate URL URLSearchParams AbortSignal AbortController fetch structuredClone TextDecoder TextEncoder globalThis crypto queueMicrotask Response Request Headers FormData Blob TransformStream ReadableStream WritableStream");
const web = g("window document navigator confirm alert setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame console fetch structuredClone CSS Intl performance location queueMicrotask getComputedStyle matchMedia localStorage URL Blob Event KeyboardEvent HTMLElement NodeFilter MutationObserver IntersectionObserver ResizeObserver");
export default [
  { ignores: ["node_modules/**", "dist/**", "renderer/**", "build/**", "scripts/smoke/*.js", "src/vendor/**"] },
  { files: ["**/*.js", "**/*.mjs"], languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: node }, rules: { "no-undef": "error" } },
  { files: [".lint/renderer.js"], languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: web }, rules: { "no-undef": "error" } },
];
