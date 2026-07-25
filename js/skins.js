// Lures — the hook, line and the glow around your catch. Unlocked by LIFETIME
// fish landed, so they keep paying off across runs, not just inside one.
// Purely cosmetic: every lure reels the same, only the colours in render.js
// change. `need` is checked against progress.caught, which merges with max()
// across devices — an unlock can never be lost by syncing.

const SKINS = [
  { id: "classic", name: "Classic",   need: 0,    line: "#e9f2f6", hook: "#c9d3da", glow: "#bfe9ff" },
  { id: "gold",    name: "Gold Hook", need: 20,   line: "#ffe9a8", hook: "#ffcf4d", glow: "#ffe27a" },
  { id: "coral",   name: "Coral",     need: 60,   line: "#ffd0dc", hook: "#ff7fa5", glow: "#ff9ec4" },
  { id: "kelp",    name: "Kelp",      need: 140,  line: "#c9f0a8", hook: "#7fce4d", glow: "#a8f07a" },
  { id: "abyssal", name: "Abyssal",   need: 300,  line: "#b6c8ff", hook: "#7f8fff", glow: "#9f7fff" },
  { id: "prism",   name: "Prism",     need: 600,  line: "#eaffff", hook: "#8ff0ff", glow: "#ff9ef0" },
];

const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

function skinUnlocked(skin, caught) { return (caught || 0) >= skin.need; }

// The lure a profile is actually using — falls back to Classic if the saved id
// is unknown (old save, or a lure removed from the table) or not yet earned.
function activeSkin(prog) {
  const s = SKIN_BY_ID[prog && prog.skin] || SKINS[0];
  return skinUnlocked(s, prog && prog.caught) ? s : SKINS[0];
}

// The next locked lure, for the "8 more fish → Gold Hook" nudge.
function nextSkin(caught) {
  return SKINS.find((s) => !skinUnlocked(s, caught)) || null;
}
