// Depth zones — the water changes as you go down. Which zone you're in is set
// by the fish's CURRENT depth (render.js reads it for the palette), while how
// hard a catch is comes from how deep it was cast (see difficulty() below).
// So a deep catch starts in the Abyss and you reel up through every zone to the
// boat — a whole journey per fish.
//
// `from` is a depth in METRES (0 = surface). Zones are ordered shallow→deep.
//
// Layout knobs (used by fish-layout in game.js):
//   rowGap   base metres between hazard rows (tighter = harder)
//   sharkW   relative weight of sharks vs mines in the hazard mix
//   pearl    chance a row is a pearl arc instead of a hazard
//   sharkSpd multiplies a shark's patrol speed

const ZONES = [
  {
    id: "sunlit", name: "Sunlit Shallows", icon: "🌅", from: 0,
    blurb: "Warm, bright water.",
    water: ["#6fd3e8", "#2f9fc4"], deep: "#1f7fa4", accent: "#ffe27a",
    rowGap: 11, sharkW: 0.45, pearl: 0.20, sharkSpd: 0.85,
  },
  {
    id: "kelp", name: "Kelp Forest", icon: "🌿", from: 16,
    blurb: "Weeds and shadows.",
    water: ["#3aa6a0", "#1f7d78"], deep: "#155c58", accent: "#9be86a",
    rowGap: 10, sharkW: 0.55, pearl: 0.17, sharkSpd: 0.95,
  },
  {
    id: "twilight", name: "Twilight Zone", icon: "🌊", from: 42,
    blurb: "The light is fading.",
    water: ["#2b6fa8", "#184a78"], deep: "#0f2f52", accent: "#7fd0ff",
    rowGap: 9.2, sharkW: 0.62, pearl: 0.15, sharkSpd: 1.05,
  },
  {
    id: "midnight", name: "Midnight Deep", icon: "🌑", from: 78,
    blurb: "Cold and dark down here.",
    water: ["#1c3a66", "#111f3e"], deep: "#0a1428", accent: "#8f9fff",
    rowGap: 8.6, sharkW: 0.68, pearl: 0.14, sharkSpd: 1.15,
  },
  {
    id: "abyss", name: "The Abyss", icon: "🕳️", from: 116,
    blurb: "Where the big ones lurk.",
    water: ["#141d3a", "#070a18"], deep: "#03050e", accent: "#ff6fa5",
    rowGap: 8.0, sharkW: 0.72, pearl: 0.13, sharkSpd: 1.25,
  },
];

const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

// Which zone a depth (metres) falls in. Zones are ordered by `from`.
function zoneIndexAt(depth) {
  let i = 0;
  for (let k = 0; k < ZONES.length; k++) if (depth >= ZONES[k].from) i = k;
  return i;
}
function zoneAt(depth) { return ZONES[zoneIndexAt(depth)]; }

// How hard a catch is, from the catch number (0-based). Ramps up then flattens
// so an endless run stays survivable. Feeds the layout: rows get tighter and
// pack more blocked lanes, but a clear lane is always guaranteed.
function difficulty(k) {
  return Math.min(1, k / 14);          // 0 on the first catch → 1 by catch ~14
}
