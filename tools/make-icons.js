// Generate icons/ — a cheerful fish on a hook against deep water.
// Run: node tools/make-icons.js  (from the reel-rush folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;               // 1 unit = 1% of the icon

  const TOP = "#2f9fc4", MID = "#12608a", DEEP = "#08243a";
  const BODY = "#5ad1ff", DARK = "#2f8fc0", BELLY = "#cdf3ff";
  const GOLD = "#ffd93b", INK = "#0b2233";

  // water, lighter near the top
  cv.fillRect(0, 0, big, big, DEEP);
  cv.fillRect(0, 0, big, 46 * u, MID);
  cv.fillRect(0, 0, big, 22 * u, TOP);

  // maskable art stays inside the safe centre (~72%)
  const s = pad ? 0.78 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;
  const cx = 50 * u;

  // fishing line + hook from the top
  cv.fillRect(cx - sz(0.8), at(6), sz(1.6), sz(28), GOLD);
  cv.fillCircle(cx, at(34), sz(3.5), GOLD);

  // fish body
  cv.fillCircle(cx, at(58), sz(24), DARK);
  cv.fillCircle(cx, at(56), sz(21), BODY);
  cv.fillCircle(cx + sz(3), at(64), sz(12), BELLY);

  // tail
  cv.fillCircle(cx - sz(22), at(56), sz(11), DARK);
  cv.fillRect(cx - sz(30), at(56) - sz(10), sz(12), sz(20), DEEP);

  // top fin
  cv.fillCircle(cx + sz(2), at(38), sz(7), DARK);

  // eye
  cv.fillCircle(cx + sz(11), at(52), sz(6), "#ffffff");
  cv.fillCircle(cx + sz(13), at(52), sz(3), INK);

  // little smile / gill
  cv.fillRect(cx + sz(3), at(66), sz(12), sz(2), INK);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

fs.writeFileSync(path.join(OUT, "icon-192.png"), paint(192, false));
fs.writeFileSync(path.join(OUT, "icon-512.png"), paint(512, false));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), paint(512, true));
console.log("icons written to", OUT);
