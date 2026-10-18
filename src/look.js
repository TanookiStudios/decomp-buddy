// Make It Yours: the `look` setting (accent color, background picture and music, Installed Games layout).
// Picture and music are copies kept in userData/theme; only a bare file name is stored.

export const LOOK_FILES = {
  image: { key: "bgImage", exts: ["png", "jpg", "jpeg", "webp"], maxMB: 10, kind: "picture", names: "a PNG, JPG or WebP picture" },
  music: { key: "music", exts: ["mp3", "ogg", "m4a"], maxMB: 30, kind: "music file", names: "an MP3, OGG or M4A file" },
};
export const LOOK_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4" };
export const LAYOUTS = ["grid", "list", "compact"];

const extOf = (name) => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
// A stored name: letters, digits, - and _, then one allowed extension - never a path.
const fileName = (f, kind) => (typeof f === "string" && /^[\w-]+\.[a-z0-9]+$/i.test(f) && LOOK_FILES[kind].exts.includes(extOf(f)) ? f : "");
const num = (n, lo, hi, d) => (n === null || n === "" || !Number.isFinite(Number(n)) ? d : Math.max(lo, Math.min(hi, Number(n))));

export function cleanLook(l = {}) {
  return {
    accent: /^#[0-9a-f]{6}$/i.test(l.accent || "") ? l.accent.toLowerCase() : "",
    bgImage: fileName(l.bgImage, "image"), bgDim: num(l.bgDim, 0, 0.9, 0.6),
    music: fileName(l.music, "music"), musicVolume: num(l.musicVolume, 0, 1, 0.5), musicOn: !!l.musicOn,
    layout: LAYOUTS.includes(l.layout) ? l.layout : "grid", cardSize: Math.round(num(l.cardSize, 100, 240, 150)),
  };
}

// Why a picked file can't be used, or "" when it can.
export function lookFileProblem(kind, name, bytes) {
  const k = LOOK_FILES[kind];
  if (!k) return "Unknown file kind.";
  if (!k.exts.includes(extOf(name))) return `Pick ${k.names}.`;
  if (bytes > k.maxMB * 1024 * 1024) return `That ${k.kind} is over ${k.maxMB} MB - pick a smaller one.`;
  return "";
}
export const lookExt = extOf;
