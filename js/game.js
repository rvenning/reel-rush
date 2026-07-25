// The Reel Rush engine — an endless vertical reel-'em-up.
//
// You've hooked a fish deep down. Hold to reel it UP toward the boat; water
// keeps dragging the (heavy) fish back down, so you're always working. Steer
// left/right to thread past drifting sharks and sea mines, and stay ahead of
// the deep shark rising from below — that's the clock you're beating. Reach the
// surface and the catch lands (worth more the bigger the fish); the next cast
// drops deeper, for a bigger fish and busier water.
//
// Everything the player meets comes from the registries in fish.js and
// zones.js — the engine reads properties and never branches on a type name.
// Drawing lives in render.js; this file owns simulation only, so the headless
// balance bot in tests/ can run the whole game with no canvas at all.

const Game = {
  canvas: null, ctx: null, DPR: 1, scale: 1, viewLW: LW, viewLH: LH, offX: 0, offY: 0,
  active: false, running: false, paused: false, dead: false,
  input: { reelHeld: false, reelPressed: false, targetX: LW / 2, keyLeft: false, keyRight: false },
  rng: Math.random,
  _last: 0,

  /* ============================ boot / canvas ============================ */
  boot() {
    this.canvas = document.getElementById("cv");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    const re = () => this.resize();
    window.addEventListener("resize", re);
    // iOS settles its viewport lazily (toolbars, rotation, standalone launch),
    // so measure again well after the event as well as on it.
    window.addEventListener("orientationchange", () => setTimeout(re, 350));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", re);
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.running) this.pause(); });
    this.bindInput();
    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // The game screen is display:none until it's shown, which measures 0x0 —
    // retry rather than caching a broken layout.
    if (!w || !h) { setTimeout(() => this.resize(), 200); return; }
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    // A canvas is a replaced element: the width/height ATTRIBUTES are the
    // backing store, and without an explicit CSS size it renders at that size
    // and overflows every retina screen. css/style.css pins it to 100%/100%.
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = Math.round(w * this.DPR);
    this.canvas.height = Math.round(h * this.DPR);
    this.scale = Math.min(w / LW, h / LH);   // CSS px per logical px
    this.viewLW = w / this.scale;
    this.viewLH = h / this.scale;
    this.offX = (this.viewLW - LW) / 2;      // where the 320x480 stage sits
    this.offY = (this.viewLH - LH) / 2;
  },

  // Screen x (CSS px, from the stage's top-left) → logical playfield x.
  toLogicalX(cssX) {
    return GK.util.clamp(cssX / this.scale - this.offX, X_MARGIN, LW - X_MARGIN);
  },

  /* ================================ input ================================ */
  // One finger does everything: press to reel, slide to steer. Holding runs the
  // reel motor; the fish eases toward wherever your finger is. Keyboard splits
  // it: Space/Up reels, Left/Right steer.
  bindInput() {
    const I = this.input;
    const stage = document.querySelector(".game-stage");
    const fingers = new Set();

    const down = (e) => {
      e.preventDefault();
      GK.Sfx.init();
      fingers.add(e.pointerId);
      const r = stage.getBoundingClientRect();
      I.targetX = this.toLogicalX(e.clientX - r.left);
      if (!I.reelHeld) I.reelPressed = true;
      I.reelHeld = true;
    };
    const move = (e) => {
      if (!fingers.has(e.pointerId)) return;
      const r = stage.getBoundingClientRect();
      I.targetX = this.toLogicalX(e.clientX - r.left);
    };
    const up = (e) => {
      fingers.delete(e.pointerId);
      if (fingers.size === 0) I.reelHeld = false;
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("pointerleave", up);
    stage.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); this.togglePause(); return; }
      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
        e.preventDefault(); if (!I.reelHeld) I.reelPressed = true; I.reelHeld = true;
      }
      if (["ArrowLeft", "KeyA"].includes(e.code)) I.keyLeft = true;
      if (["ArrowRight", "KeyD"].includes(e.code)) I.keyRight = true;
    });
    window.addEventListener("keyup", (e) => {
      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) I.reelHeld = false;
      if (["ArrowLeft", "KeyA"].includes(e.code)) I.keyLeft = false;
      if (["ArrowRight", "KeyD"].includes(e.code)) I.keyRight = false;
    });
    // iOS ignores user-scalable=no for pinch; block the gesture at the source.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
  },

  /* ============================== lifecycle ============================== */
  start(profile) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.skin = activeSkin(this.progress);
    this.reset();
    this.running = true; this.paused = false; this.dead = false;
    GK.UI.showScreen("game");
    this.resize();               // the stage only has a size once it's visible
    this.updateHud();
    if (Music.enabled) Music.start("dive");
  },

  // Full simulation reset. Kept separate from start() so the headless bot can
  // drive a run without a profile, a canvas or the DOM.
  reset() {
    // Re-grab Math.random each run so the seeded test harness (which swaps
    // Math.random between runs) stays deterministic.
    this.rng = Math.random;
    this.lives = RULES.LIVES;
    this.score = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.caught = 0;
    this.pearlsGot = 0;
    this.maxCastDepth = 0;
    this.elapsed = 0;
    this.p_iframes = 0;
    this.shield = false;
    this.turboT = 0;
    this.freezeT = 0;
    this.landT = 0;             // >0 = celebrating a landed catch
    this.flashLand = 0;
    this.result = null;
    this.input.reelHeld = false; this.input.reelPressed = false;
    this.input.keyLeft = false; this.input.keyRight = false;
    this.input.targetX = LW / 2;
    this.newCatch(0);
    if (typeof Fx !== "undefined") { Fx.reset(); Tween.clear(); }
  },

  // Set up the next fish: deeper than the last, bigger, faster chaser.
  newCatch(k) {
    this.catchIdx = k;
    this.castDepth = Math.min(RULES.CAST_MAX, RULES.CAST_BASE + k * RULES.CAST_STEP);
    this.maxCastDepth = Math.max(this.maxCastDepth, this.castDepth);
    this.fish = pickFish(this.castDepth, this.rng);
    this.depth = this.castDepth;
    this.vy = 0;
    this.fishX = LW / 2;
    this.input.targetX = LW / 2;
    this.diff = difficulty(k);
    this.chaserSpd = Math.min(RULES.CHASER_SPD_MAX, RULES.CHASER_SPD + k * RULES.CHASER_RAMP);
    this.chaserD = this.castDepth + RULES.CHASER_GAP;
    this.layoutCatch();
    this.state = "reel";
    this.zoneIdx = zoneIndexAt(this.depth);
    this.zone = ZONES[this.zoneIdx];
  },

  // Build the whole gauntlet for one catch up front, from the cast depth to just
  // below the surface. Doing it as one pass (rather than streaming) lets the
  // test lint that every row leaves a lane clear and reachable.
  layoutCatch() {
    const rng = this.rng;
    this.hazards = []; this.pearls = []; this.orbs = [];
    const diff = this.diff, PATROL = 30;
    let orbPlaced = false;
    // start a few metres above the fish so the first row isn't in its face
    let d = this.castDepth - GK.util.rand(6, 9);
    const top = 4;
    while (d > top) {
      const z = zoneAt(d);
      // Pearl arc row — pure bonus, no hazard.
      if (rng() < z.pearl) {
        const lane = GK.util.irand(0, LANES.length - 1);
        const cx = LANES[lane];
        for (let i = -1; i <= 1; i++)
          this.pearls.push({ x: GK.util.clamp(cx + i * 22, X_MARGIN, LW - X_MARGIN), depth: d - i * 0.5, dead: false, t: rng() * 6 });
      } else {
        // How many lanes to block — always leave at least one clear.
        let nBlock = 1;
        if (rng() < diff) nBlock++;
        if (rng() < diff * 0.5) nBlock++;
        nBlock = Math.min(nBlock, LANES.length - 1);      // never seal the row
        const lanes = shuffled([0, 1, 2, 3], rng).slice(0, nBlock);
        // A shark patrols ±1 lane's worth of pixels, so a 3-blocked row uses
        // only static mines — a wanderer could otherwise stray into the one
        // clear lane. With ≤2 blocked, sharks are fine.
        const allowShark = nBlock <= 2;
        for (const lane of lanes) {
          const cx = LANES[lane];
          const isShark = allowShark && rng() < z.sharkW;
          if (isShark) {
            const xMin = Math.max(X_MARGIN, cx - PATROL);
            const xMax = Math.min(LW - X_MARGIN, cx + PATROL);
            const spd = HAZARDS.shark.speed * z.sharkSpd * (1 + 0.35 * diff);
            this.hazards.push({ type: "shark", x: cx, depth: d, xMin, xMax, vx: rng() < 0.5 ? spd : -spd, t: rng() * 6, dead: false });
          } else {
            this.hazards.push({ type: "mine", x: cx, depth: d, vx: 0, t: rng() * 6, dead: false });
          }
        }
      }
      // A single power-up per catch, dropped in a clear lane around mid-depth.
      if (!orbPlaced && rng() < 0.14 && d < this.castDepth * 0.75 && d > top + 8) {
        const clear = clearLaneAt(this.hazards, d);
        if (clear != null) {
          const type = GK.util.pick(POWERUP_IDS);
          this.orbs.push({ type, x: LANES[clear], depth: d - 1.5, dead: false, t: rng() * 6 });
          orbPlaced = true;
        }
      }
      const gap = z.rowGap * (1 - 0.16 * diff) * GK.util.rand(0.9, 1.15);
      d -= gap;
    }
  },

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    Music.stop();
    GK.UI.openModal("modal-pause");
  },
  resume() {
    GK.UI.closeModal("modal-pause");
    this.paused = false;
    this._last = performance.now();
    if (Music.enabled) Music.start("dive");
    Sfx.click();
  },
  togglePause() { this.paused ? this.resume() : this.pause(); },

  quit() {
    GK.UI.closeModal("modal-pause");
    this.running = false;
    Music.stop();
    App.runOver(this.buildResult(), true);
  },

  /* ================================ loop ================================= */
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const real = Math.min(0.05, (t - this._last) / 1000 || 0);
    this._last = t;
    if (typeof GK.Debug !== "undefined") GK.Debug.frame(real);
    if (!this.active) return;
    if (this.running && !this.paused) this.update(real);
    if (typeof Fx !== "undefined") Fx.update(real);
    this.render();
  },

  /* =============================== update ================================ */
  update(dt) {
    // The loop already gates on this, but the guard makes the engine safe to
    // step from a bot or a console — without it, driving update() past a death
    // keeps simulating a dead run.
    if (!this.running || this.paused) return;
    this.elapsed += dt;
    this.p_iframes = Math.max(0, this.p_iframes - dt);
    if (this.turboT > 0) this.turboT = Math.max(0, this.turboT - dt);
    if (this.freezeT > 0) this.freezeT = Math.max(0, this.freezeT - dt);
    if (this.flashLand > 0) this.flashLand = Math.max(0, this.flashLand - dt);

    // Celebrating a landed catch — hold the world still, then cast the next one.
    if (this.state === "landed") {
      this.landT -= dt;
      if (this.landT <= 0) this.newCatch(this.catchIdx + 1);
      this.updateHud();
      return;
    }

    const f = this.fish, w = f.weight, I = this.input;

    /* ---- reel physics: motor up, water drags down ---- */
    let vy = this.vy;
    if (this.turboT > 0) vy += RULES.REEL_ACCEL * 1.55 * dt;
    else if (I.reelHeld) vy += RULES.REEL_ACCEL * dt;
    if (I.reelPressed) { vy += RULES.TAP_POP; I.reelPressed = false; }
    vy -= RULES.GRAV * w * dt;
    const rMax = riseMax(w) * (this.turboT > 0 ? 1.5 : 1);
    vy = GK.util.clamp(vy, -RULES.SINK_MAX, rMax);
    this.vy = vy;
    this.depth -= vy * dt;
    if (this.depth > this.castDepth) { this.depth = this.castDepth; if (vy < 0) this.vy = 0; }

    /* ---- steering: ease toward the finger / keys ---- */
    if (I.keyLeft) I.targetX -= RULES.KEY_STEER * dt;
    if (I.keyRight) I.targetX += RULES.KEY_STEER * dt;
    I.targetX = GK.util.clamp(I.targetX, X_MARGIN, LW - X_MARGIN);
    this.fishX += (I.targetX - this.fishX) * Math.min(1, RULES.STEER * dt);

    /* ---- the deep shark rises ---- */
    this.chaserD -= this.chaserSpd * dt;
    if (this.p_iframes <= 0 && this.chaserD <= this.depth + RULES.CATCH_MARGIN) this.chaserHit();

    /* ---- hazards patrol ---- */
    if (this.freezeT <= 0) {
      for (const e of this.hazards) {
        e.t += dt;
        if (e.type !== "shark") continue;
        e.x += e.vx * dt;
        if (e.x < e.xMin) { e.x = e.xMin; e.vx = Math.abs(e.vx); }
        if (e.x > e.xMax) { e.x = e.xMax; e.vx = -Math.abs(e.vx); }
      }
    }

    this.zoneIdx = zoneIndexAt(this.depth);
    this.zone = ZONES[this.zoneIdx];

    this.collide();
    if (!this.running) return;               // a hit may have ended the run

    /* ---- landed the catch? ---- */
    if (this.depth <= 0) { this.land(); return; }

    this.updateHud();
  },

  /* ------------------------------ collisions ----------------------------- */
  collide() {
    const f = this.fish, fr = f.r, fx = this.fishX, d = this.depth;

    for (const e of this.orbs) {
      if (e.dead) continue;
      const dy = (e.depth - d) * PX_PER_M;
      if (Math.abs(dy) < 12 + fr && Math.abs(e.x - fx) < 14 + fr) this.takeOrb(e);
    }
    for (const e of this.pearls) {
      if (e.dead) continue;
      const dy = (e.depth - d) * PX_PER_M;
      if (Math.abs(dy) < PEARL.r + fr && Math.abs(e.x - fx) < PEARL.r + fr) this.takePearl(e);
    }
    if (this.p_iframes > 0) return;
    for (const e of this.hazards) {
      if (e.dead) continue;
      const spec = HAZARDS[e.type];
      const dy = (e.depth - d) * PX_PER_M;
      if (Math.abs(dy) < spec.ry + fr * 0.7 && Math.abs(e.x - fx) < spec.rx + fr * 0.8) {
        this.hitHazard(e);
        return;
      }
    }
  },

  takePearl(e) {
    e.dead = true;
    this.pearlsGot++;
    this.score += RULES.PEARL_VALUE;
    Sfx.pearl();
    if (typeof Fx !== "undefined") {
      Fx.sparkle(e.x, this.screenY(e.depth), PEARL.ring);
      Fx.text(e.x, this.screenY(e.depth) - 6, `+${RULES.PEARL_VALUE}`, { color: "#eafaff", size: 10 });
    }
  },

  takeOrb(e) {
    const spec = POWERUPS[e.type];
    e.dead = true;
    Sfx.power(POWERUP_IDS.indexOf(e.type));
    if (e.type === "shield") this.shield = true;
    else if (e.type === "turbo") this.turboT = spec.dur;
    else if (e.type === "freeze") this.freezeT = spec.dur;
    if (typeof Fx !== "undefined") {
      Fx.burst(e.x, this.screenY(e.depth), spec.color, 20, 150, 0.5, 3);
      Fx.flash = 0.3; Fx.flashColor = spec.color;
      Fx.text(e.x, this.screenY(e.depth) - 12, spec.name, { color: spec.color, size: 12 });
    }
    GK.UI.toast(`${spec.icon} ${spec.name} — ${spec.blurb}`);
  },

  hitHazard(e) {
    if (this.shield) {
      this.shield = false;
      this.p_iframes = RULES.IFRAMES;
      Sfx.shieldPop();
      if (typeof Fx !== "undefined") {
        Fx.burst(this.fishX, FISH_Y, "#8fd8ff", 20, 160, 0.5, 3);
        Fx.text(this.fishX, FISH_Y - 24, "BLOCKED!", { color: "#8fd8ff", size: 13 });
      }
      return;
    }
    if (this.loseLife()) return;
    // The line jerks: the fish is dragged back down toward the deep shark.
    this.depth = Math.min(this.castDepth, this.depth + RULES.KNOCK);
    this.vy = Math.min(this.vy, -2);
    Sfx.snap();
    if (typeof Fx !== "undefined") {
      Fx.addShake(8);
      Fx.flash = 0.4; Fx.flashColor = "#ff3b3b";
      Fx.burst(this.fishX, FISH_Y, HAZARDS[e.type].body || "#ff6b6b", 16, 160, 0.5, 2.6);
      Fx.text(this.fishX, FISH_Y - 26, "SNAP!", { color: "#ff6b6b", size: 13 });
    }
  },

  chaserHit() {
    if (this.shield) {
      this.shield = false;
      this.p_iframes = RULES.IFRAMES;
      this.chaserD = this.depth + RULES.CHASER_GAP;
      Sfx.shieldPop();
      return;
    }
    if (this.loseLife()) return;
    this.chaserD = this.depth + RULES.CHASER_GAP;   // beaten back down
    Sfx.snap();
    if (typeof Fx !== "undefined") {
      Fx.addShake(10);
      Fx.flash = 0.5; Fx.flashColor = "#ff3b3b";
      Fx.text(this.fishX, FISH_Y - 26, "TOO SLOW!", { color: "#ff6b6b", size: 13 });
    }
  },

  // Shared cost of any hit. Returns true if it ended the run.
  // Guarded so a hit resolved in the same frame as the fatal one (or a stray
  // call from a bot/console) can't drive the count negative.
  loseLife() {
    if (this.dead || this.lives <= 0) return true;
    this.lives--;
    this.combo = 1;
    this.p_iframes = RULES.IFRAMES;
    if (this.lives <= 0) { this.die(); return true; }
    return false;
  },

  /* ------------------------------ landing -------------------------------- */
  land() {
    const f = this.fish;
    const gain = f.value * this.combo;
    this.score += gain;
    this.caught++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastCatch = { fish: f, gain, combo: this.combo };
    this.combo = Math.min(RULES.COMBO_MAX, this.combo + 1);
    this.state = "landed";
    this.landT = 0.95;
    this.flashLand = 0.5;
    this.depth = 0;
    Sfx.land(f.weight);
    if (typeof Fx !== "undefined") {
      Fx.flash = 0.4; Fx.flashColor = "#ffe27a";
      Fx.confetti(LW, LH, ["#ffd93b", "#8fd8ff", "#ff6fa5", "#9be86a"], 40);
      Fx.text(this.fishX, FISH_Y - 30, `+${gain}${this.lastCatch.combo > 1 ? ` x${this.lastCatch.combo}` : ""}`,
        { color: "#ffe27a", size: 16 });
    }
    this.updateHud();
  },

  /* -------------------------------- death -------------------------------- */
  die() {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
    Music.stop();
    Sfx.gameover();
    if (typeof Fx !== "undefined") {
      Fx.addShake(12);
      Fx.flash = 0.6; Fx.flashColor = "#000000";
    }
    const res = this.buildResult();
    setTimeout(() => App.runOver(res, false), 850);
  },

  buildResult() {
    return {
      score: Math.round(this.score),
      caught: this.caught,
      pearls: this.pearlsGot,
      bestCombo: this.bestCombo,
      deepest: Math.round(this.maxCastDepth),
      zone: zoneIndexAt(this.maxCastDepth),
      time: Math.round(this.elapsed),
    };
  },

  /* --------------------------------- HUD --------------------------------- */
  // Logical screen y of a world depth, given where the fish currently is.
  screenY(depth) { return FISH_Y + (depth - this.depth) * PX_PER_M; },

  updateHud() {
    const el = (id) => document.getElementById(id);
    if (!el("reel-fill")) return;                 // no DOM (headless bot)
    const climbed = 1 - GK.util.clamp(this.depth / Math.max(1, this.castDepth), 0, 1);
    el("reel-fill").style.height = (climbed * 100).toFixed(1) + "%";
    el("hud-score").textContent = Math.round(this.score).toLocaleString();
    el("hud-depth").textContent = Math.max(0, Math.round(this.depth)) + "m";
    el("hud-fish").textContent = this.fish.emoji;
    el("hud-lives").textContent = "❤️".repeat(Math.max(0, this.lives));
    const c = el("hud-combo");
    c.textContent = this.combo > 1 ? `x${this.combo}` : "";
    c.className = "hud combo" + (this.combo >= 3 ? " hot" : "");
    let pw = "";
    if (this.shield) pw += POWERUPS.shield.icon;
    if (this.turboT > 0) pw += POWERUPS.turbo.icon;
    if (this.freezeT > 0) pw += POWERUPS.freeze.icon;
    el("hud-powers").textContent = pw;
    // danger glow when the deep shark is closing
    const near = (this.chaserD - this.depth) < 12;
    el("reel-bar").classList.toggle("danger", near);
  },
};

/* ------------------------------------------------------------- utilities */
// Fisher-Yates using the injected rng, so seeded tests are deterministic.
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Index of a lane with no hazard near this depth (or null if none) — used to
// place a power-up somewhere actually reachable.
function clearLaneAt(hazards, depth) {
  const blocked = new Set();
  for (const e of hazards) {
    if (Math.abs(e.depth - depth) > 4) continue;
    let best = 0, bd = Infinity;
    for (let i = 0; i < LANES.length; i++) {
      const dd = Math.abs(LANES[i] - e.x);
      if (dd < bd) { bd = dd; best = i; }
    }
    blocked.add(best);
  }
  for (let i = 0; i < LANES.length; i++) if (!blocked.has(i)) return i;
  return null;
}
