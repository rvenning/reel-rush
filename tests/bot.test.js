"use strict";
// Headless balance bot.
//
// A reel-'em-up can look fine and still be broken: hazards you can't dodge, a
// deep shark you can't out-reel, or — worst for a kid — a game that plays
// itself. None of that shows up in a unit test of one function, so this suite
// runs the REAL engine with no canvas and measures the outcome:
//
//   1. every catch layout always leaves a clear, reachable lane
//   2. a competent angler gets deep; a passive one drowns
//   3. steering matters — dodging beats reeling straight up
//
// Math.random is seeded (tests/seed.js) so a failure here is a real balance
// change, not a bad roll.

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const DT = 1 / 60;

const X = loadScripts({
  baseDir: ROOT,
  files: [
    "tests/seed.js",
    "lib/gk-util.js", "lib/gk-audio.js",
    "js/fish.js", "js/zones.js", "js/skins.js",
    "js/audio.js", "js/game.js",
  ],
  exports: ["Game", "FISH", "HAZARDS", "LANES", "RULES", "ZONES", "PX_PER_M",
            "LW", "X_MARGIN", "riseMax", "difficulty", "zoneAt", "zoneIndexAt",
            "pickFish", "__reseed"],
  browser: true,
  globals: {
    // gk-util does `window.GK = window.GK || {}`, so a pre-seeded GK survives
    // and lets us stub the screen/toast layer the engine pokes at.
    GK: { UI: { toast() {}, showScreen() {}, openModal() {}, closeModal() {} } },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
    App: { runOver() {} },
    performance: { now: () => 0 },
    requestAnimationFrame() {},
  },
});
const { Game, HAZARDS, LANES, RULES, ZONES, zoneIndexAt, __reseed } = X;

// The closest a hazard can get to a lane centre (a shark patrols, so use the
// nearest point of its beat; a mine is static).
function worstX(e, lane) {
  if (e.type !== "shark") return e.x;
  return Math.max(e.xMin, Math.min(e.xMax, lane));
}
function laneClear(row, lane, fr) {
  for (const e of row) {
    const spec = HAZARDS[e.type];
    if (Math.abs(lane - worstX(e, lane)) < spec.rx + fr * 0.8) return false;
  }
  return true;
}
// Cluster hazards into rows by depth (they're authored ~row by row).
function groupRows(hazards) {
  const sorted = hazards.slice().sort((a, b) => b.depth - a.depth);
  const rows = [];
  for (const e of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].depth - e.depth) < 3.5) last.push(e);
    else rows.push([e]);
  }
  return rows;
}

/* ================= 1. every layout is dodgeable ================= */
test("every catch layout leaves a clear lane the fish can fit through", () => {
  let rowsChecked = 0;
  for (let k = 0; k <= 22; k++) {
    __reseed(500 + k);
    Game.reset();
    Game.newCatch(k);
    const fr = Game.fish.r;
    for (const row of groupRows(Game.hazards)) {
      rowsChecked++;
      const ok = LANES.some((lane) => laneClear(row, lane, fr));
      assert.ok(ok, `catch ${k}: a hazard row seals every lane (fish r=${fr})`);
    }
  }
  assert.ok(rowsChecked > 200, `only ${rowsChecked} rows checked — not enough coverage`);
});

/* ============================ playing bots ============================ */
function smartPolicy(G) {
  const I = G.input, d = G.depth, fr = G.fish.r;
  const ahead = G.hazards
    .map((e) => ({ e, dz: d - e.depth }))         // dz>0 = above us, reached soon
    .filter((o) => o.dz > -1.5 && o.dz < 18)
    .sort((a, b) => a.dz - b.dz);

  let targetX = G.fishX, hold = true;
  if (ahead.length) {
    const nearDz = ahead[0].dz;
    const row = ahead.filter((o) => Math.abs(o.dz - nearDz) < 3).map((o) => o.e);
    let best = null, bestDist = Infinity;
    for (const lane of LANES) {
      if (!laneClear(row, lane, fr + 2)) continue;
      const dist = Math.abs(lane - G.fishX);
      if (dist < bestDist) { bestDist = dist; best = lane; }
    }
    if (best != null) targetX = best;
    // nearest row is right on us and we're not lined up yet — stop reeling to
    // buy time to slide across, rather than climbing into it.
    if (nearDz < 3.2 && Math.abs(G.fishX - targetX) > 16) hold = false;
  } else {
    const goodies = [...G.orbs, ...G.pearls]
      .map((e) => ({ e, dz: d - e.depth }))
      .filter((o) => o.dz > -1 && o.dz < 16)
      .sort((a, b) => a.dz - b.dz);
    if (goodies.length) targetX = goodies[0].e.x;
  }
  I.targetX = targetX;
  I.reelHeld = hold;
}

const reelOnlyPolicy = (G) => { G.input.reelHeld = true; G.input.targetX = LW / 2; };
const passivePolicy = (G) => { G.input.reelHeld = false; G.input.targetX = LW / 2; };
const LW = X.LW;

function runBot(policy, { seed = 1, maxFrames = 60 * 180 } = {}) {
  __reseed(seed);
  Game.reset();
  Game.running = true; Game.dead = false;
  let frames = 0;
  while (Game.running && !Game.dead && frames < maxFrames) {
    if (Game.state === "reel") policy(Game);
    Game.update(DT);
    frames++;
  }
  return {
    caught: Game.caught, score: Math.round(Game.score),
    deepest: Math.round(Game.maxCastDepth), zone: zoneIndexAt(Game.maxCastDepth),
    seconds: +(frames / 60).toFixed(1), died: Game.dead, hitCap: frames >= maxFrames,
  };
}
const show = (tag, r) =>
  console.log(`  ${tag}: ${r.caught} landed  score ${r.score}  ${r.deepest}m  zone ${r.zone}  ` +
              `${r.seconds}s  ${r.died ? "sunk" : r.hitCap ? "capped" : "going"}`);

test("a competent angler lands a stack of fish and gets deep", () => {
  const runs = [1, 2, 3].map((s) => runBot(smartPolicy, { seed: s }));
  runs.forEach((r, i) => show(`smart seed ${i + 1}`, r));
  const caught = runs.map((r) => r.caught);
  const deepest = Math.max(...runs.map((r) => r.deepest));
  assert.ok(Math.min(...caught) >= 8, `a smart run only landed ${Math.min(...caught)} fish`);
  assert.ok(deepest >= 66, `the deepest smart run only reached ${deepest}m (Twilight starts at ${ZONES[2].from}m)`);
});

test("a passive angler drowns fast — the deep shark is a real clock", () => {
  const runs = [7, 8, 9].map((s) => runBot(passivePolicy, { seed: s }));
  show("passive", runs[0]);
  assert.ok(runs.every((r) => r.died), "never reeling should get you eaten");
  assert.ok(runs.every((r) => r.seconds < 16), `a passive run survived ${Math.max(...runs.map(r => r.seconds))}s`);
  assert.ok(runs.every((r) => r.caught <= 1), "you shouldn't land fish without reeling");
});

test("dodging beats reeling straight up, by a lot", () => {
  const seeds = [3, 11, 21];
  const smart = seeds.map((s) => runBot(smartPolicy, { seed: s }));
  const reel = seeds.map((s) => runBot(reelOnlyPolicy, { seed: s }));
  show("smart   ", smart[0]);
  show("reel-only", reel[0]);
  const avg = (a) => a.reduce((s, r) => s + r.caught, 0) / a.length;
  const smartAvg = avg(smart), reelAvg = avg(reel);
  console.log(`  avg fish landed — smart ${smartAvg.toFixed(1)} vs reel-only ${reelAvg.toFixed(1)}`);
  assert.ok(reel.every((r) => r.died), "reeling blindly into hazards should end the run");
  assert.ok(smartAvg > reelAvg * 1.6,
    `steering (${smartAvg.toFixed(1)}) barely beats not steering (${reelAvg.toFixed(1)})`);
});

test("a good run is worth starting and not endless", () => {
  const r = runBot(smartPolicy, { seed: 4 });
  show("smart seed 4", r);
  assert.ok(r.seconds > 25, `a good run only lasted ${r.seconds}s`);
});
