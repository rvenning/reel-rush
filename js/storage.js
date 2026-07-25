// Persistence — gamekit storage configured for Reel Rush.
// rr_* localStorage keys, "reelrush" Firestore collection.
//
// Every stat here is monotonic (personal bests, lifetime totals, deepest zone),
// so a field-wise max() merge is always safe across devices. The one exception
// is `skin`, which is a *preference*, not a record — max() is meaningless for
// it, so the more recently written side wins.

const Storage = GK.createStorage({
  prefix: "rr",
  collection: "reelrush",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: () => ({
    best: 0,          // best single-run score (leaderboard headline)
    bestDepth: 0,     // deepest metres reeled up in one run
    caught: 0,        // LIFETIME fish landed — drives lure unlocks
    bestCombo: 0,     // best catch chain in one run
    runs: 0,
    zone: 0,          // deepest zone index reached
    skin: "classic",
    updated: 0,
  }),
  mergeProgress: (a, b) => ({
    // Spread first so a field a newer client added survives an older client's
    // merge, then pin the fields we know how to reconcile.
    ...a, ...b,
    best: Math.max(a.best || 0, b.best || 0),
    bestDepth: Math.max(a.bestDepth || 0, b.bestDepth || 0),
    caught: Math.max(a.caught || 0, b.caught || 0),
    bestCombo: Math.max(a.bestCombo || 0, b.bestCombo || 0),
    runs: Math.max(a.runs || 0, b.runs || 0),
    zone: Math.max(a.zone || 0, b.zone || 0),
    skin: ((b.updated || 0) >= (a.updated || 0) ? b.skin : a.skin) || "classic",
  }),
});

Object.assign(Storage, {
  // Fold one finished run into the profile's records. Lifetime counters add up;
  // bests only move up. Returns the saved progress so callers can render it.
  recordRun(profileId, res) {
    const prog = this.getProgress(profileId);
    prog.runs = (prog.runs || 0) + 1;
    prog.caught = (prog.caught || 0) + (res.caught || 0);
    prog.best = Math.max(prog.best || 0, res.score || 0);
    prog.bestDepth = Math.max(prog.bestDepth || 0, res.deepest || 0);
    prog.bestCombo = Math.max(prog.bestCombo || 0, res.bestCombo || 0);
    prog.zone = Math.max(prog.zone || 0, res.zone || 0);
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Cosmetic choice — refuses a lure the player hasn't earned so a stale sync
  // or a hand-edited save can't equip something they haven't unlocked.
  setSkin(profileId, skinId) {
    const prog = this.getProgress(profileId);
    const skin = SKIN_BY_ID[skinId];
    if (!skin || !skinUnlocked(skin, prog.caught)) return prog;
    prog.skin = skinId;
    this.saveProgress(profileId, prog);
    return prog;
  },

  unlockedSkins(prog) { return SKINS.filter((s) => skinUnlocked(s, prog && prog.caught)); },
});
