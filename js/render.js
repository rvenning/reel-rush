// Rendering — everything is drawn procedurally from the zone palette, so a new
// zone is a colour table and nothing else. Attached to Game so the loop in
// game.js stays simulation-only (and the headless bot skips this file).
//
// Draw space is the fixed 320x480 logical stage. The canvas is usually taller
// or wider, so ocean is painted past the stage edges out to the real canvas
// bounds — never letterbox bars, just more water. Depths become screen y through
// Game.screenY(depth): the fish sits at a fixed y and the world slides past it.

Object.assign(Game, {
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.scale * this.DPR;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(this.offX, this.offY);

    const L = -this.offX, T = -this.offY;
    const R = LW + this.offX, B = LH + this.offY;

    this.drawOcean(ctx, L, T, R, B);
    this.drawBubbles(ctx, L, T, R, B);

    if (typeof Fx !== "undefined" && Fx.shake > 0) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * Fx.shake, (Math.random() - 0.5) * Fx.shake);
    }

    this.drawChaser(ctx, R, B);
    for (const e of this.pearls) if (!e.dead) this.drawPearl(ctx, e);
    for (const e of this.orbs) if (!e.dead) this.drawOrb(ctx, e);
    for (const e of this.hazards) if (!e.dead) this.drawHazard(ctx, e, L, R);
    this.drawLineAndBoat(ctx, L, T, R);
    this.drawFish(ctx);

    if (typeof Fx !== "undefined") {
      Fx.render(ctx);
      if (Fx.shake > 0) ctx.restore();
      if (Fx.flash > 0) {
        ctx.globalAlpha = Math.min(1, Fx.flash);
        ctx.fillStyle = Fx.flashColor;
        ctx.fillRect(L, T, R - L, B - T);
        ctx.globalAlpha = 1;
      }
    }

    if (this.state === "landed") this.drawCatchBanner(ctx, L, R);
    this.drawHints(ctx, L, R, B);
  },

  /* -------------------------------- ocean -------------------------------- */
  drawOcean(ctx, L, T, R, B) {
    const z = this.zone || ZONES[0];
    const g = ctx.createLinearGradient(0, T, 0, B);
    g.addColorStop(0, z.water[0]);
    g.addColorStop(0.55, z.water[1]);
    g.addColorStop(1, z.deep);
    ctx.fillStyle = g;
    ctx.fillRect(L, T, R - L, B - T);

    // soft god-rays near the top of the visible column in bright zones
    if (this.zoneIdx <= 1) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const x = L + (R - L) * (0.12 + i * 0.19) + Math.sin(this.elapsed * 0.3 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x + 26, T);
        ctx.lineTo(x + 60, B);
        ctx.lineTo(x + 6, B);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  // Ambient bubbles drifting up — cheap depth cue, seeded off hash2 so they
  // don't jitter frame to frame.
  drawBubbles(ctx, L, T, R, B) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    const n = 22;
    for (let i = 0; i < n; i++) {
      const bx = L + (Math.floor(GK.util.hash2(i, 3) * 997) % 100) / 100 * (R - L);
      const speed = 12 + (i % 5) * 6;
      const span = B - T + 40;
      const by = B - ((this.elapsed * speed + i * 57) % span);
      const r = 1.2 + (i % 3) * 0.9;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /* --------------------------- surface + line ---------------------------- */
  drawLineAndBoat(ctx, L, T, R) {
    const sk = this.skin || SKINS[0];
    const surfY = this.screenY(0);           // where the surface/boat sits
    // fishing line from the boat down to the fish
    ctx.strokeStyle = sk.line;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(this.fishX, FISH_Y - this.fish.r * 0.7);
    ctx.quadraticCurveTo((this.fishX + LW / 2) / 2, (FISH_Y + surfY) / 2, LW / 2, surfY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (surfY > T - 30) {
      // Sky above the waterline. Visible for the last ~20m of every reel-up, so
      // it's the "almost there" moment — worth a gradient, a sun and gulls
      // rather than a flat slab.
      const sg = ctx.createLinearGradient(0, T, 0, surfY);
      sg.addColorStop(0, "#7ec8f2");
      sg.addColorStop(1, "#dff4ff");
      ctx.fillStyle = sg;
      ctx.fillRect(L, T, R - L, Math.max(0, surfY) - T);
      // sun, low and warm
      const sunY = Math.min(surfY - 40, T + 54);
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#ffe27a";
      ctx.beginPath(); ctx.arc(L + (R - L) * 0.78, sunY, 30, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff3b8";
      ctx.beginPath(); ctx.arc(L + (R - L) * 0.78, sunY, 16, 0, Math.PI * 2); ctx.fill();
      // a couple of distant gulls
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.6;
      for (let i = 0; i < 2; i++) {
        const gx = L + (R - L) * (0.18 + i * 0.16);
        const gy = sunY - 18 + Math.sin(this.elapsed * 0.8 + i * 2) * 4;
        ctx.beginPath();
        ctx.moveTo(gx - 6, gy); ctx.quadraticCurveTo(gx - 3, gy - 4, gx, gy);
        ctx.quadraticCurveTo(gx + 3, gy - 4, gx + 6, gy);
        ctx.stroke();
      }
      // wavy waterline
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(L, surfY);
      for (let x = L; x <= R; x += 10)
        ctx.lineTo(x, surfY + Math.sin(x * 0.14 + this.elapsed * 2) * 2.2);
      ctx.lineTo(R, surfY + 6); ctx.lineTo(L, surfY + 6);
      ctx.fill();
      // little boat hull
      const bx = LW / 2, bw = 54;
      ctx.fillStyle = "#8a5a34";
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2, surfY - 8);
      ctx.lineTo(bx + bw / 2, surfY - 8);
      ctx.lineTo(bx + bw / 2 - 8, surfY);
      ctx.lineTo(bx - bw / 2 + 8, surfY);
      ctx.fill();
      ctx.fillStyle = "#a06a3e";
      ctx.fillRect(bx - bw / 2, surfY - 11, bw, 3);
      // rod
      ctx.strokeStyle = "#4a3222"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx + 10, surfY - 10); ctx.lineTo(bx + 24, surfY - 26); ctx.stroke();
    }
  },

  /* ------------------------------- the fish ------------------------------ */
  drawFish(ctx) {
    const f = this.fish, sk = this.skin || SKINS[0];
    const x = this.fishX, y = FISH_Y;
    const r = f.r;
    const dir = (this.input.targetX < x - 4) ? -1 : 1;   // lean toward travel
    ctx.save();
    if (this.p_iframes > 0 && Math.floor(this.p_iframes * 18) % 2 === 0) ctx.globalAlpha = 0.4;

    // catch glow
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = sk.glow;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha /= 0.35;

    ctx.translate(x, y);
    ctx.scale(dir, 1);
    const wob = Math.sin(this.elapsed * 8) * 0.12;

    // tail
    ctx.fillStyle = GK.util.shade(f.body, -30);
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.5, -r * 0.6 + wob * r);
    ctx.lineTo(-r * 1.5, r * 0.6 + wob * r);
    ctx.fill();
    // body
    ctx.fillStyle = f.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    // belly
    ctx.fillStyle = GK.util.shade(f.body, 40);
    ctx.beginPath(); ctx.ellipse(2, r * 0.22, r * 0.62, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    // top fin
    ctx.fillStyle = GK.util.shade(f.body, -20);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.6);
    ctx.quadraticCurveTo(r * 0.2, -r * 1.15, r * 0.5, -r * 0.55);
    ctx.fill();
    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#16232e";
    ctx.beginPath(); ctx.arc(r * 0.56, -r * 0.1, r * 0.11, 0, Math.PI * 2); ctx.fill();
    // hooked mouth
    ctx.strokeStyle = "#16232e"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(r * 0.82, r * 0.12, r * 0.16, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    ctx.restore();

    // hook
    ctx.strokeStyle = sk.hook; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x + r * 0.9 * dir, y - r * 0.5, 2.4, 0, Math.PI * 1.4); ctx.stroke();

    // bubble shield
    if (this.shield) {
      ctx.strokeStyle = "rgba(143,216,255,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 + Math.sin(this.elapsed * 6) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  /* ------------------------------- hazards ------------------------------- */
  drawHazard(ctx, e, L, R) {
    const y = this.screenY(e.depth);
    if (y < -40 || y > LH + this.offY + 40) return;
    if (e.type === "shark") this.drawShark(ctx, e, y);
    else this.drawMine(ctx, e, y);
  },

  drawShark(ctx, e, y) {
    const spec = HAZARDS.shark;
    const x = e.x, dir = e.vx < 0 ? -1 : 1, rx = spec.rx, ry = spec.ry;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    const sway = Math.sin(e.t * 5) * 0.1;
    // tail
    ctx.fillStyle = spec.fin;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.7, 0);
    ctx.lineTo(-rx * 1.25, -ry * 0.9 + sway * ry);
    ctx.lineTo(-rx * 1.25, ry * 0.9 + sway * ry);
    ctx.fill();
    // body
    ctx.fillStyle = spec.body;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = spec.belly;
    ctx.beginPath(); ctx.ellipse(2, ry * 0.35, rx * 0.7, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // dorsal fin
    ctx.fillStyle = spec.fin;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.1, -ry * 0.8);
    ctx.lineTo(rx * 0.25, -ry * 1.7);
    ctx.lineTo(rx * 0.5, -ry * 0.7);
    ctx.fill();
    // eye + gills
    ctx.fillStyle = "#12181d";
    ctx.beginPath(); ctx.arc(rx * 0.55, -ry * 0.2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = spec.fin; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(rx * 0.15 + i * 3, -ry * 0.4); ctx.lineTo(rx * 0.15 + i * 3, ry * 0.4); ctx.stroke(); }
    // toothy grin
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(rx * 0.35, ry * 0.35); ctx.lineTo(rx * 0.95, ry * 0.2); ctx.stroke();
    ctx.restore();
  },

  drawMine(ctx, e, y) {
    const spec = HAZARDS.mine, x = e.x, r = spec.rx;
    const bob = Math.sin(e.t * 2) * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    // spikes
    ctx.fillStyle = spec.spike;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.14) * r, Math.sin(a - 0.14) * r);
      ctx.lineTo(Math.cos(a) * (r + 5), Math.sin(a) * (r + 5));
      ctx.lineTo(Math.cos(a + 0.14) * r, Math.sin(a + 0.14) * r);
      ctx.fill();
    }
    // body
    ctx.fillStyle = spec.body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = GK.util.shade(spec.body, 30);
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
    // blinking light
    const on = Math.sin(e.t * 6) > 0;
    ctx.fillStyle = on ? spec.light : "#5a2020";
    ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ----------------------------- pickups --------------------------------- */
  drawPearl(ctx, e) {
    const y = this.screenY(e.depth);
    const r = PEARL.r + Math.sin(e.t + this.elapsed * 4) * 0.6;
    ctx.globalAlpha = 0.3; ctx.fillStyle = PEARL.ring;
    ctx.beginPath(); ctx.arc(e.x, y, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = PEARL.body;
    ctx.beginPath(); ctx.arc(e.x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(e.x - r * 0.3, y - r * 0.3, r * 0.32, 0, Math.PI * 2); ctx.fill();
  },

  drawOrb(ctx, e) {
    const spec = POWERUPS[e.type];
    const y = this.screenY(e.depth);
    const r = 11 + Math.sin(e.t * 5 + this.elapsed * 3) * 1;
    ctx.globalAlpha = 0.28; ctx.fillStyle = spec.color;
    ctx.beginPath(); ctx.arc(e.x, y, r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = spec.color;
    ctx.beginPath(); ctx.arc(e.x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(spec.icon, e.x, y + 0.5);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  },

  /* --------------------------- the deep shark ---------------------------- */
  // Rises from below. It's mostly menace: a dark silhouette climbing toward the
  // fish, teeth and glowing eyes, that grows as it closes.
  drawChaser(ctx, R, B) {
    const y = this.screenY(this.chaserD);
    if (y > B + 120) return;                     // still far below, off-screen
    const near = GK.util.clamp(1 - (this.chaserD - this.depth) / 30, 0, 1);
    const w = LW * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * near;
    // body wedge coming up from the bottom
    ctx.fillStyle = "#0a1420";
    ctx.beginPath();
    ctx.moveTo(LW / 2 - w / 2, B);
    ctx.quadraticCurveTo(LW / 2, y, LW / 2 + w / 2, B);
    ctx.fill();
    // snout point
    ctx.beginPath();
    ctx.moveTo(LW / 2 - 26, y + 30);
    ctx.quadraticCurveTo(LW / 2, y - 6, LW / 2 + 26, y + 30);
    ctx.fill();
    // teeth
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = -3; i <= 3; i++) {
      const tx = LW / 2 + i * 9;
      ctx.beginPath();
      ctx.moveTo(tx - 3, y + 18); ctx.lineTo(tx + 3, y + 18); ctx.lineTo(tx, y + 27);
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = near > 0.5 ? "#ff4d4d" : "#ffd93b";
    ctx.beginPath(); ctx.arc(LW / 2 - 14, y + 12, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(LW / 2 + 14, y + 12, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ------------------------------ overlays ------------------------------- */
  drawCatchBanner(ctx, L, R) {
    const lc = this.lastCatch;
    if (!lc) return;
    const a = GK.util.clamp(this.landT / 0.95, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe27a";
    ctx.font = "bold 22px 'Baloo 2', system-ui, sans-serif";
    ctx.fillText("NICE CATCH!", LW / 2, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px 'Baloo 2', system-ui, sans-serif";
    ctx.fillText(`${lc.fish.emoji} ${lc.fish.name}  +${lc.gain}${lc.combo > 1 ? `  x${lc.combo}` : ""}`, LW / 2, 178);
    ctx.textAlign = "left";
    ctx.restore();
  },

  // Fades out after the first few seconds of a run.
  drawHints(ctx, L, R, B) {
    if (this.elapsed > 4.5 || this.catchIdx > 0) return;
    ctx.globalAlpha = GK.util.clamp((4.5 - this.elapsed) / 2, 0, 1) * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HOLD to reel up", LW / 2, FISH_Y + 46);
    ctx.fillText("slide to steer", LW / 2, FISH_Y + 64);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  },
});
