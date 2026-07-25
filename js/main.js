// App shell — splash, profile roster, the hub, the lure locker, results and the
// family leaderboard. Profiles/PINs/sync/install all come from gamekit; this
// file only decides what goes on each screen.

const AVATARS = ["🐟", "🐠", "🦈", "🐙", "🐬", "🦀", "🐡", "🦑", "🐳", "🦭", "🐢", "⭐"];

const App = {
  profile: null,

  el(id) { return document.getElementById(id); },

  init() {
    const settings = Storage.getSettings();
    Sfx.enabled = settings.sound !== false;
    Music.enabled = settings.music !== false;

    GK.UI.onScreenChange = (name) => {
      Game.active = name === "game";
      if (name !== "game") Music.stop();
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) =>
        `🏆 ${(prog.best || 0).toLocaleString()} · 🐟 ${prog.caught || 0} · 📏 ${prog.bestDepth || 0}m`,
      onEnter: (p) => { this.profile = p; this.showHome(); },
      addLabel: "New Angler",
    });

    GK.initPWA({ appName: "Reel Rush" });
    Game.boot();
    if (typeof GK.Debug !== "undefined") {
      GK.Debug.init({ storage: Storage, title: "REEL RUSH" })
        .action("land catch", () => { if (Game.running) { Game.depth = 0.01; } })
        .action("+life", () => { if (Game.running) Game.lives++; })
        .toggle("nochaser", "freeze chaser");
    }

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "home") this.showHome();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },

  toggleMusic() {
    const on = Music.toggle();
    this.el("btn-music").textContent = on ? "🎵 Music: On" : "🔇 Music: Off";
    const s = Storage.getSettings();
    s.music = on;
    Storage.saveSettings(s);
    if (on && Game.running && !Game.paused) Music.start("dive");
    Sfx.click();
  },

  /* ------------------------------- splash -------------------------------- */
  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🎣 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch Angler";
    } else {
      cont.style.display = "none";
      start.className = "btn big green";
      start.textContent = "🎣 Start Fishing";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  /* --------------------------------- hub --------------------------------- */
  showHome() {
    if (!this.profile) return this.play();
    const prog = Storage.getProgress(this.profile.id);
    const sk = activeSkin(prog);
    this.el("home-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("home-skin").textContent = sk.name;
    this.el("stat-best").textContent = (prog.best || 0).toLocaleString();
    this.el("stat-caught").textContent = (prog.caught || 0).toLocaleString();
    this.el("stat-depth").textContent = (prog.bestDepth || 0) + "m";
    this.el("stat-combo").textContent = "x" + (prog.bestCombo || 1);
    const z = ZONES[Math.min(prog.zone || 0, ZONES.length - 1)];
    this.el("stat-zone").textContent = `${z.icon} ${z.name}`;

    const next = nextSkin(prog.caught);
    this.el("lure-nudge").textContent = next
      ? `${next.need - (prog.caught || 0)} more fish → ${next.name}`
      : "Every lure unlocked! 👑";
    this.showScreen("home");
  },

  startRun() {
    Sfx.init(); Sfx.click();
    Game.start(this.profile);
  },

  /* -------------------------------- lures -------------------------------- */
  showSkins() {
    Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    const wearing = activeSkin(prog).id;
    this.el("lure-list").innerHTML = SKINS.map((s) => {
      const got = skinUnlocked(s, prog.caught);
      const on = got && s.id === wearing;
      return `<button class="lure-card${got ? "" : " locked"}${on ? " on" : ""}"
        ${got ? `onclick="App.wearSkin('${s.id}')"` : "disabled"}>
        <span class="lure-swatch" style="background:${got ? s.glow : "#3a4150"};
              box-shadow: inset 0 0 0 3px ${got ? s.hook : "#2a3140"}"></span>
        <span class="lure-name">${got ? GK.util.esc(s.name) : "???"}</span>
        <span class="lure-need">${got ? (on ? "Equipped" : "Tap to use") : `🐟 ${s.need} caught`}</span>
      </button>`;
    }).join("");
    this.showScreen("skins");
  },

  wearSkin(id) {
    Sfx.power();
    Storage.setSkin(this.profile.id, id);
    this.showSkins();
  },

  /* ------------------------------- results ------------------------------- */
  runOver(res, quit) {
    const prog = Storage.getProgress(this.profile.id);
    const prevBest = prog.best || 0;
    const prevCaught = prog.caught || 0;
    const saved = Storage.recordRun(this.profile.id, res);
    if (quit) { this.showHome(); return; }

    const newBest = res.score > prevBest;
    this.el("res-emoji").textContent = newBest ? "🏆" : "🎣";
    this.el("res-title").textContent = newBest ? "NEW BEST!" : "Line Snapped!";
    this.el("res-score").textContent = res.score.toLocaleString();
    this.el("res-sub").textContent = newBest
      ? `Beat your old best of ${prevBest.toLocaleString()}`
      : `Best: ${(saved.best || 0).toLocaleString()}`;
    const z = ZONES[Math.min(res.zone, ZONES.length - 1)];
    this.el("res-stats").innerHTML = [
      `🐟 ${res.caught} landed`,
      `📏 ${res.deepest}m deep`,
      `⚪ ${res.pearls} pearls`,
      `🔥 best chain x${res.bestCombo}`,
      `${z.icon} ${GK.util.esc(z.name)}`,
    ].map((b) => `<div>${b}</div>`).join("");

    const justUnlocked = SKINS.find((s) => s.need > prevCaught && s.need <= (saved.caught || 0));
    const next = nextSkin(saved.caught);
    const note = this.el("res-note");
    if (justUnlocked) {
      note.className = "res-note unlocked";
      note.textContent = `🎉 New lure unlocked: ${justUnlocked.name}!`;
    } else if (next) {
      note.className = "res-note";
      note.textContent = `${next.need - (saved.caught || 0)} more fish → ${next.name}`;
    } else {
      note.className = "res-note";
      note.textContent = "";
    }

    if (newBest) setTimeout(() => Sfx.newBest(), 300);
    this.showScreen("results");
  },

  /* ----------------------------- leaderboard ----------------------------- */
  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">🐟 ${r.progress.caught || 0}</span>
        <span class="lb-stat">📏 ${r.progress.bestDepth || 0}m</span>
        <span class="lb-stat">🏆 ${(r.progress.best || 0).toLocaleString()}</span>`,
      sort: (a, b) => (b.progress.best || 0) - (a.progress.best || 0),
      meId: this.profile?.id,
      empty: "No anglers yet — tap Play!",
    });
    this.showScreen("leaderboard");
  },
};

window.addEventListener("DOMContentLoaded", () => App.init());
