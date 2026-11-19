// Screening "How It Runs" reports before other players see a report's computer and note (the totals count right
// away). A report with no note whose computer reads like a computer is shown without anyone looking; anything
// else - every note, and any odd computer text - waits for the daily run's reader (docs/DAILY.md).
const SAFE = /^[A-Za-z0-9 ()[\].,+/_@#:!-]{1,120}$/, LINK = /https?:|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|gg|ru|cn|xyz|info|biz|co|me|tv|app|dev|ly|to|shop|top|site|online)\b/i;
const KNOWN = {
  os: /windows|macos|linux|ubuntu|fedora|debian|arch|steamos|mint|manjaro|pop!_os|opensuse|nixos|bazzite|endeavour|cachyos|nobara|gentoo|freedesktop|chimera/i,
  cpu: /intel|amd|ryzen|core|apple|xeon|pentium|celeron|athlon|snapdragon|qualcomm|epyc|threadripper|arm|virtual/i,
  gpu: /nvidia|geforce|rtx|gtx|radeon|amd|intel|iris|uhd|arc|apple|adreno|mesa|llvmpipe|graphics|quadro|vulkan|swiftshader/i,
};
const fine = (k, v) => v == null || v === "" || (SAFE.test(v) && !LINK.test(v) && KNOWN[k].test(v));

// "show": nothing in it needs reading. "read": someone (the daily run's agent) decides.
export const screen = (row) => (!row.note && fine("os", row.os) && fine("cpu", row.cpu) && fine("gpu", row.gpu) ? "show" : "read");
