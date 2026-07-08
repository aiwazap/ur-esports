// 对手名标准化 — 共享模块（dashboard / training / import-json 共用）
const OPPONENT_ALIASES = {
  "Mongolz.A":    ["mongolza", "mongolz.a", "mongolz a", "mongolz_a", "mongolz academy"],
  "NEXVOID":      ["nexvoid", "nextvoid", "next void", "nex void"],
  "Tengri":       ["tengri", "tenjri", "tengrie"],
  "The Cube":     ["thecube", "the cube", "the_cube", "theqube", "the qube"],
  "Oasis Gaming": ["oasis gaming", "oasis_gaming", "oasisgaming", "oasis"],
  "100RA":        ["100ra", "100 ra"],
  "Wydo":         ["wydo"],
  "Modun":        ["modun"],
  "ZEVS":         ["zevs"],
  "Nas":          ["nas"],
  "Dy2k":         ["dy2k"],
  "RDC":          ["rdc", "relove deep cross", "relovedeepcross"],
  "TYLOO":        ["tyloo"],
  "ex-Nemesis":   ["ex-nemesis", "exnemesis"],
  "Unitronics":   ["unitronics"],
};

function normalizeOpponent(name) {
  if (!name) return name;
  const key = name.toLowerCase().replace(/[\s._\-]/g, "");
  for (const [standard, aliases] of Object.entries(OPPONENT_ALIASES)) {
    if (aliases.includes(key) || aliases.some(a => a.replace(/[\s._\-]/g, "") === key)) {
      return standard;
    }
  }
  return name;
}

module.exports = { OPPONENT_ALIASES, normalizeOpponent };
