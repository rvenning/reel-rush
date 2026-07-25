// Entity registry — the fish you reel up, the hazards you dodge, the pickups,
// and the tuning constants the engine and the tests both read. The engine
// reads properties off these tables and never branches on a type name, so a new
// fish or hazard is one entry here plus a draw case in render.js.
//
// Depths are in METRES (0 = the surface, where the boat is). Sizes are in
// logical px. tests/bot.test.js drives the real engine off these numbers and
// fails if the balance drifts — so treat these as tuned, not arbitrary.

/* --------------------------------------------------------------- geometry */
// One fixed logical stage for every device (portrait), so a phone and a laptop
// see the same amount of water and the family leaderboard stays fair. render.js
// paints ocean past the stage edges so there are never letterbox bars.
const LW = 320;            // logical stage width
const LH = 480;            // logical stage height
const FISH_Y = 322;        // the hooked fish's fixed screen y (lower third)
const PX_PER_M = 16;       // world px per metre of depth (≈30 m visible)
const X_MARGIN = 40;       // fish/hazard playfield inset from each wall

// Four lanes the hazards sit in and the fish steers between. A row always
// leaves at least one lane clear (enforced in fish layout + linted in tests).
const LANES = [X_MARGIN, 120, 200, LW - X_MARGIN];   // = [40, 120, 200, 280]

/* -------------------------------------------------------------- the catch */
// The fish on your line. Bigger fish live deeper, are worth far more, and are
// HEAVIER — a heavy fish barely out-reels its own sinking, so the deep catches
// are the real test. The tier for a cast is the biggest whose `from` depth the
// cast reaches (fish.js pickFish), so the ladder climbs as you go deeper.
const FISH = [
  { id: "minnow",  name: "Minnow",     emoji: "🐟", r: 12, weight: 1.00, value: 40,  from: 0,   body: "#7fd4e8" },
  { id: "reef",    name: "Reef Fish",  emoji: "🐠", r: 15, weight: 1.24, value: 100, from: 22,  body: "#ffb347" },
  { id: "puffer",  name: "Puffer",     emoji: "🐡", r: 17, weight: 1.44, value: 200, from: 42,  body: "#ffd95a" },
  { id: "squid",   name: "Squid",      emoji: "🦑", r: 19, weight: 1.64, value: 360, from: 66,  body: "#c98bff" },
  { id: "octopus", name: "Octopus",    emoji: "🐙", r: 21, weight: 1.84, value: 560, from: 92,  body: "#ff6fa5" },
  { id: "whale",   name: "Whale",      emoji: "🐳", r: 24, weight: 2.10, value: 900, from: 120, body: "#8fb6ff" },
];

// The fish for a cast of this depth: the deepest-tier one it reaches, with a
// small chance of the next tier up ("a big one!") so it isn't perfectly
// predictable. `rng` is injected so the seeded test is deterministic.
function pickFish(castDepth, rng = Math.random) {
  let idx = 0;
  for (let i = 0; i < FISH.length; i++) if (castDepth >= FISH[i].from) idx = i;
  if (idx < FISH.length - 1 && rng() < 0.18) idx++;   // occasional lucky upgrade
  return FISH[idx];
}

/* ----------------------------------------------------------------- hazards */
// Touch one and the line jerks: you lose a life, drop toward the deep shark,
// and get a moment of i-frames. `laneSpan` (in lanes) is how far a shark
// patrols from its home lane — kept small so a clear lane always survives.
const HAZARDS = {
  shark: {
    name: "Shark", emoji: "🦈", rx: 24, ry: 12,
    patrol: true, laneSpan: 1, speed: 34,        // px/s side-to-side
    body: "#7b8794", belly: "#c3ccd4", fin: "#5a6673",
  },
  mine: {
    name: "Sea Mine", emoji: "💣", rx: 15, ry: 15,
    patrol: false,
    body: "#3a4149", spike: "#20252b", light: "#ff4d4d",
  },
};

/* ----------------------------------------------------------------- pickups */
// A pearl is pure bonus score, usually dangled just off the safe lane so
// grabbing it costs a little risk. Power-ups are rarer.
const PEARL = { r: 9, value: 15, body: "#eafaff", ring: "#8fd8ff" };

const POWERUPS = {
  shield: {
    id: "shield", icon: "🫧", name: "Bubble Shield", dur: 0, color: "#8fd8ff",
    blurb: "Blocks one hit",
  },
  turbo: {
    id: "turbo", icon: "🪝", name: "Power Reel", dur: 3.2, color: "#ffd93b",
    blurb: "Reels up fast!",
  },
  freeze: {
    id: "freeze", icon: "❄️", name: "Cold Snap", dur: 3.6, color: "#b6f0ff",
    blurb: "Hazards freeze",
  },
};
const POWERUP_IDS = Object.keys(POWERUPS);

/* -------------------------- scoring / feel constants (engine + tests) ----- */
const RULES = {
  LIVES: 3,

  // Reel physics, all in metres and m/s. Up = rising = depth decreasing.
  // Holding the reel runs a motor (REEL_ACCEL); water always pulls the fish
  // back down (GRAV, scaled by the fish's weight so heavy fish sink harder).
  REEL_ACCEL: 74,           // upward accel while reeling (m/s^2)
  GRAV: 25,                 // base downward accel (m/s^2), x fish.weight
  RISE_MAX: 15,             // top rise speed (m/s), minus weight penalty
  RISE_MAX_WEIGHT: 3.0,     // m/s shaved off RISE_MAX per unit weight over 1
  SINK_MAX: 11,             // top sink speed (m/s)
  TAP_POP: 3.2,             // extra instant rise on a fresh press (m/s)

  // Steering — the fish eases toward the target x set by touch/keys.
  STEER: 12,                // ease factor per second
  KEY_STEER: 320,           // px/s when steering by keyboard

  // The deep shark that rises from below: the clock you're always beating.
  // Its speed climbs with the catch number so the run keeps tightening.
  CHASER_SPD: 3.4,          // m/s it rises at, on the first catch
  CHASER_RAMP: 0.11,        // + m/s per catch landed
  CHASER_SPD_MAX: 7.5,
  CHASER_GAP: 14,           // m below the cast it starts
  CATCH_MARGIN: 3.2,        // caught once it closes within this many metres

  // Getting hit.
  IFRAMES: 1.4,
  KNOCK: 6,                 // metres the fish is dragged back down on a hit

  // Cast escalation.
  CAST_BASE: 32,            // depth of the first catch (m)
  CAST_STEP: 6.5,           // + m per catch
  CAST_MAX: 132,

  // Combo: catches landed in a row without losing a life multiply fish value.
  COMBO_MAX: 5,

  PEARL_VALUE: PEARL.value,
};

// Top rise speed for a given fish weight (heavier = slower ceiling).
function riseMax(weight) {
  return Math.max(8, RULES.RISE_MAX - (weight - 1) * RULES.RISE_MAX_WEIGHT);
}
