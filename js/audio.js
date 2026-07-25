// Sound — gamekit's synth core plus Reel Rush's own jingles, and a small
// lookahead music scheduler.
//
// The music deliberately does NOT use one setInterval per note: timer drift
// makes that swing, and browsers throttle background tabs to ~1Hz which turns a
// tune into a machine gun on return. Instead a ~110ms pump schedules every note
// up to LOOKAHEAD seconds ahead on the WebAudio clock, which is sample-accurate.

const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // A pearl: a soft watery ping.
  pearl() {
    this.tone({ freq: 880, type: "sine", dur: 0.09, vol: 0.13, slide: 220 });
    this.tone({ freq: 1320, type: "sine", dur: 0.07, vol: 0.07, when: 0.05 });
  },
  power(color = 0) {
    [523, 659, 880, 1175].forEach((f, i) =>
      this.tone({ freq: f + color * 20, type: "triangle", dur: 0.12, vol: 0.13, when: i * 0.05 }));
  },
  shieldPop() {
    this.tone({ freq: 760, type: "sine", dur: 0.2, vol: 0.15, slide: -440 });
    this.noise({ dur: 0.12, vol: 0.1 });
  },
  // The line jerks / a hit — a sharp watery snap, nothing rewarding about it.
  snap() {
    this.noise({ dur: 0.16, vol: 0.24 });
    this.tone({ freq: 200, type: "square", dur: 0.14, vol: 0.18, slide: -120 });
    this.tone({ freq: 90, type: "sawtooth", dur: 0.24, vol: 0.16, slide: -30 });
  },
  // Landing a catch — a rising fanfare; bigger fish get a fatter splash.
  land(weight = 1) {
    this.noise({ dur: 0.12, vol: 0.14 });
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.16, vol: 0.15, when: i * 0.07 }));
    if (weight >= 1.6) this.tone({ freq: 160, type: "sawtooth", dur: 0.3, vol: 0.16, slide: 90 });
  },
  gameover() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.32, vol: 0.2, when: i * 0.16 }));
    this.noise({ dur: 0.5, vol: 0.1, when: 0.3 });
  },
  newBest() {
    [659, 784, 988, 1319, 1568].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.2, vol: 0.16, when: i * 0.11 }));
  },
});

/* ------------------------------------------------------------------ music */
// Tracks are semitone offsets from the root; null = rest. One step is an eighth
// note. A calm, rolling underwater theme.
const TRACKS = {
  dive: {
    root: 50,                      // D
    bpm: 104,
    bass: [0, null, 7, null, 5, null, 3, null, 0, null, 7, null, 10, null, 7, null],
    lead: [12, null, 15, 12, 10, null, 7, null, 12, 15, 19, 15, 14, null, 10, null,
           12, null, 17, 15, 14, null, 10, null, 7, null, 10, 12, 14, null, null, null],
  },
};

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const Music = {
  enabled: true,
  track: null,
  step: 0,
  nextT: 0,
  timer: null,
  LOOKAHEAD: 0.6,

  start(name) {
    const t = TRACKS[name];
    if (!t || !Sfx.ctx) return;
    if (this.track === t && this.timer) return;
    this.track = t;
    this.step = 0;
    this.nextT = Sfx.ctx.currentTime + 0.12;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 110);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.track = null;
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  },

  pump() {
    const t = this.track;
    if (!t || !this.enabled || !Sfx.enabled || !Sfx.ctx) return;
    const now = Sfx.ctx.currentTime;
    const spb = 60 / t.bpm / 2;
    if (this.nextT < now - 0.25) { this.nextT = now + 0.05; }
    while (this.nextT < now + this.LOOKAHEAD) {
      const when = this.nextT - now;
      const b = t.bass[this.step % t.bass.length];
      if (b !== null && b !== undefined)
        Sfx.tone({ freq: midiHz(t.root + b), type: "triangle", dur: spb * 0.9, vol: 0.07, when });
      const l = t.lead[this.step % t.lead.length];
      if (l !== null && l !== undefined)
        Sfx.tone({ freq: midiHz(t.root + 12 + l), type: "sine", dur: spb * 0.6, vol: 0.045, when });
      this.step++;
      this.nextT += spb;
    }
  },
};
