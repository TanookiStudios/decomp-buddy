// Install Doctor: the reasons a port usually won't start, read from what it printed (decomp-buddy-launch.log) and
// from the folder itself. Fixes are buttons in the app, never automatic.

// What the end of a launch log points at (the words for each are in renderer/more.js). Ordered: the first match wins.
const HINTS = [
  ["runtime", /\b(?:msvcp1\d\d|vcruntime1\d\d|ucrtbase|d3dx9_\d+|xinput1_\d|concrt1\d\d)\w*\.dll\b|0xc000007b|0xc0000135|side-by-side configuration/i],
  ["graphics", /vulkan|vk_error|\bglx\b|opengl|\bgl version\b|d3d1[12]|dxgi|\bmetal\b.*(?:fail|error|not)|no suitable (?:gpu|device|adapter)|failed to create (?:device|swapchain|renderer|window)/i],
  ["permission", /permission denied|access is denied|operation not permitted/i],
  ["gamefile", /(?:rom|iso|disc|game data|baserom|assets?)\b[^\n]{0,60}(?:not found|missing|invalid|wrong|mismatch|bad checksum)|(?:could not|couldn't|failed to) (?:find|open|load)[^\n]{0,60}\.(?:z64|n64|v64|iso|bin|cue|chd|rvz|sfc|smc|gba|nds|xex|elf)\b/i],
];
export function logHint(tail) {
  for (const [kind, re] of HINTS) if (re.test(String(tail || ""))) return { kind };
  return null;
}

// A Mac/Linux program without permission to run (a zip or tarball that lost it).
export const lacksExecBit = (mode, platform = process.platform) => platform !== "win32" && (mode & 0o111) === 0;
