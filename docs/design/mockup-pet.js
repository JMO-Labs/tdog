// Dogbert: pocket virtual pet. Mini egg in the status bar, full device in a popover.
// Pixel engine on a 32x24 LCD; reacts to terminal output, typing, bell/errors, test passes and the clock.
// Uses $, RM, store, enter, toast and lastOut from mockup.js.

// ---------- sprites ('#' = lit segment) ----------
const FACE = [ // front, 14x11 + 2 leg rows, no eyes/mouth; beagle ears hang beside the head
  "...########...", "..#........#..", ".##........##.", "#.#........#.#", "#.#........#.#", "#.#........#.#",
  ".##........##.", "..#........#..", "...########...", "...#......#...", "...#......#...",
];
const LEGS = [["...#.#..#.#...", "...##....##..."], ["...#.#..#.#...", "....##..##...."]];
const EYES = {
  open: [[4, 4], [4, 5], [9, 4], [9, 5]], left: [[3, 4], [3, 5], [8, 4], [8, 5]], right: [[5, 4], [5, 5], [10, 4], [10, 5]],
  up: [[4, 4], [9, 4]], closed: [[3, 5], [4, 5], [9, 5], [10, 5]], happy: [[3, 5], [4, 4], [5, 5], [8, 5], [9, 4], [10, 5]],
  shock: [[3, 4], [4, 4], [3, 5], [4, 5], [9, 4], [10, 4], [9, 5], [10, 5]], sad: [[3, 4], [4, 5], [10, 4], [9, 5]],
};
const LYING = ["..##......##..", ".#..######..#.", "#............#", "#..##....##..#", "#.....##.....#", ".#..........#.", "..##########.."];
const SPR = {
  bone: ["#...#", ".###.", "#...#"], ball: [".#.", "#.#", ".#."], poop: ["..#..", ".###.", "#####"],
  heart: [".#.#.", "#####", ".###.", "..#.."], bang: ["#", "#", "#", ".", "#"], z: ["####", "..#.", ".#..", "####"],
  sun: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"], moon: [".##.", "#...", "#...", ".##."], spark: ["#.#", ".#.", "#.#"],
  cloud: [".##.##.", "#######"], rain: ["#.#.#..", ".#.#.#."], stink: [".#.#.", "#.#.."],
};

// ---------- state ----------
const HUNGER_MS = 45 * 60e3, HAPPY_MS = 60 * 60e3, SLEEP_MS = 60e3, POOP_MS = 90e3; // ponytail: mockup timings; app uses 5 min sleep, 20 min poop
const saved = JSON.parse(store.get("tdog.pet") || "null") || { hunger: 3, happy: 3, poops: 0, at: Date.now() };
const pet = { ...saved, x: 10, dir: 1, act: null, until: 0, t: 0, night: null, forceNight: false, lastKey: 0, yawned: true, lastSeenOut: 0, hopUntil: 0, nextPoop: Date.now() + POOP_MS, snack: 0, hAt: Date.now(), jAt: Date.now() };
{ // drift for time away; never below 0, never dies
  const away = Date.now() - saved.at;
  pet.hunger = Math.max(0, pet.hunger - Math.floor(away / HUNGER_MS));
  pet.happy = Math.max(0, pet.happy - Math.floor(away / HAPPY_MS));
}
const save = () => store.set("tdog.pet", JSON.stringify({ hunger: pet.hunger, happy: pet.happy, poops: pet.poops, at: Date.now() }));
const clamp = (n) => Math.max(0, Math.min(4, n));
function act(name, ms) { pet.act = name; pet.until = Date.now() + ms; pet.t = 0; }

// ---------- drawing ----------
const lcd = $("#pet-lcd"), lx = lcd.getContext("2d"), mini = $("#pet canvas"), mx = mini.getContext("2d");
const SEG = 4; // device: 32x24 logical pixels, 3px segments with a 1px gap
function plot(cells, ctx, s, gap) { for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s - gap, s - gap); }
function spr(rows, ox, oy) { const out = []; rows.forEach((r, y) => [...r].forEach((c, x) => c === "#" && out.push([ox + x, oy + y]))); return out; }
function face(eyes, { legs = 0, mouth = false, tail = 0, nose = true } = {}, ox = 0, oy = 0) {
  const rows = [...FACE, ...LEGS[legs]];
  if (nose) rows[6] = ".##...##...##.";
  const c = spr(rows, ox, oy);
  for (const [x, y] of EYES[eyes] || []) c.push([ox + x, oy + y]);
  if (mouth) c.push([ox + 6, oy + 7], [ox + 7, oy + 7]);
  if (tail) c.push([ox + 11, oy + 10], [ox + 12, oy + (tail === 1 ? 9 : 11)]);
  return c;
}

// One frame: {cells, mini, caption}. `a` alternates 0/1 each tick (always 0 under reduced motion).
function frame(now) {
  const a = RM ? 0 : pet.t % 2, x = pet.x, y = 9;
  const hop = !RM && now < pet.hopUntil ? -1 : 0;
  const cells = [];
  let me, cap;
  if (pet.night) cells.push(...spr(SPR.moon, 1, 1));
  for (let i = 0; i < pet.poops; i++) cells.push(...spr(SPR.poop, 26 - i * 6, 19), ...(a ? spr(SPR.stink, 26 - i * 6, 16) : []));

  switch (pet.act) {
    case "eat": {
      const bite = Math.min(4, Math.floor(pet.t / 3));
      me = face(a ? "closed" : "open", { mouth: !a }, x, y);
      cells.push(...spr(SPR.bone.map((r) => r.slice(0, 5 - bite).padEnd(5, ".")), x + 15, y + 8));
      cap = "Dogbert is eating."; break;
    }
    case "full": me = face("closed", {}, x + (a ? 1 : -1), y); cap = "Dogbert is full. No thanks."; break;
    case "play": {
      const bx = 30 - (pet.t * 2) % 34, by = 12 + Math.abs(((pet.t * 3) % 8) - 4);
      cells.push(...spr(SPR.ball, bx, by));
      pet.x = Math.max(0, Math.min(18, pet.x + (bx < pet.x + 6 ? -1 : 1)));
      me = face("happy", { legs: a, mouth: true, tail: a + 1 }, pet.x, y + (a && !RM ? -1 : 0));
      cap = "Dogbert is playing fetch."; break;
    }
    case "clean": {
      const sweep = 31 - pet.t * 4;
      for (let yy = 0; yy < 24; yy++) cells.push([sweep, yy]);
      if (sweep < 14) pet.poops = 0;
      me = face("happy", {}, x, y); cells.push(...spr(SPR.spark, x - 4, y - 3));
      cap = "All clean."; break;
    }
    case "startle": me = face("shock", { mouth: true }, x, y - (pet.t < 2 && !RM ? 2 : 0)); cells.push(...spr(SPR.bang, x + 15, y - 2)); cap = "Dogbert jumped. Something went wrong."; break;
    case "celebrate":
      me = face("happy", { mouth: true, tail: a + 1 }, x, y - (a && !RM ? 2 : 0));
      cells.push(...spr(SPR.heart, x - 6, y - 6 - (pet.t % 4)), ...spr(SPR.heart, x + 15, y - 4 - ((pet.t + 2) % 4)));
      cap = "Dogbert is celebrating. Tests passed."; break;
    case "yawn": me = face("closed", { mouth: true }, x, y); cap = "Dogbert yawns."; break;
    case "stretch": me = face(pet.t < 4 ? "closed" : "happy", { mouth: pet.t < 4, legs: 1 }, x, y); cells.push(...spr(SPR.sun, 1, 1)); cap = "Good morning. Dogbert is stretching."; break;
    case "grumpy": me = face("sad", {}, x, y); cap = "Dogbert woke up. It is the middle of the night."; break;
  }
  if (!me) {
    const idle = now - Math.max(lastOut, pet.lastKey);
    if (pet.night || idle > SLEEP_MS) {
      cells.push(...spr(LYING, pet.x, 15), ...spr(SPR.z, pet.x + 15, 9 - (pet.t >> 1) % 4));
      me = []; cap = pet.night ? "Dogbert is asleep. It is night." : "Dogbert is asleep. Shells are quiet.";
      return { cells: cells.concat(me), mini: "sleep", cap };
    }
    if (pet.happy === 0) {
      me = face(null, { nose: false }, x, y); cells.push(...spr(SPR.cloud, x + 3, 1), ...spr(SPR.rain, x + 3, 3 + a));
      cap = "Dogbert is sulking. Try playing fetch.";
    } else if (now - pet.lastKey < 1500) {
      me = face("up", { tail: a + 1 }, x, y); cap = "Dogbert is watching you type.";
    } else if (now - lastOut < 3000) {
      me = face(pet.t % 4 < 2 ? "left" : "right", {}, x, y + hop); cap = "Dogbert is reading your output.";
    } else if (pet.hunger === 0) {
      me = face("sad", {}, x, y); cap = "Dogbert is hungry. Press A to feed.";
    } else {
      if (!RM && pet.t % 3 === 0 && Math.random() < .7) { pet.x += pet.dir; if (pet.x <= 0 || pet.x >= 18 || Math.random() < .08) pet.dir *= -1; }
      const blink = Math.random() < .06;
      me = face(blink ? "closed" : pet.t % 24 < 6 ? (pet.dir > 0 ? "right" : "left") : "open", { legs: a }, pet.x, y);
      cap = "Dogbert is wandering around.";
    }
  }
  return { cells: cells.concat(me), mini: me, cap };
}

function render() {
  const now = Date.now(), f = frame(now);
  lx.clearRect(0, 0, lcd.width, lcd.height);
  lx.fillStyle = "rgb(38 48 31 / .07)"; // unlit segments, like a real LCD
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) lx.fillRect(x * SEG, y * SEG, SEG - 1, SEG - 1);
  lx.fillStyle = "#26301f"; plot(f.cells, lx, SEG, 1);
  mx.clearRect(0, 0, mini.width, mini.height); mx.fillStyle = "#26301f";
  plot(f.mini === "sleep" ? spr(LYING, 0, 3) : face(...miniPose(f)).filter(([xx]) => xx < 14), mx, 2, 0); // mini: whole dog, no tail
  lcd.setAttribute("aria-label", f.cap);
  $("#pet-cap").textContent = f.cap;
  $("#pet").dataset.tip = f.cap;
  $("#pet-lcd").classList.toggle("dim", !!pet.night);
  $("#pet .pet-pip").hidden = !(pet.hunger === 0 || pet.happy === 0 || pet.poops > 0);
  $("#pet-full").style.setProperty("--n", pet.hunger);
  $("#pet-happy").style.setProperty("--n", pet.happy);
}
// Mini egg shows Dogbert's face only, centred.
function miniPose(f) { const eyes = pet.act === "startle" ? "shock" : pet.act === "celebrate" || pet.act === "play" ? "happy" : pet.happy === 0 || pet.hunger === 0 ? "sad" : "open"; return [eyes, { mouth: pet.act === "eat" }, 0, 0]; }

// ---------- clock ----------
setInterval(() => {
  const now = Date.now(), h = new Date().getHours();
  const night = pet.forceNight || h >= 22 || h < 7;
  if (pet.night === true && !night) act("stretch", 2400);
  pet.night = night;
  if (pet.act && now > pet.until) pet.act = null;
  if (lastOut !== pet.lastSeenOut) { // new output: hop, snack every ~8 bursts
    pet.lastSeenOut = lastOut; pet.hopUntil = now + 300;
    if (++pet.snack % 8 === 0 && pet.hunger < 4) { pet.hunger++; save(); }
    if (pet.night && !pet.act) act("grumpy", 3000);
  }
  if (!pet.yawned && pet.lastKey && now - pet.lastKey > 20e3 && !pet.act) { pet.yawned = true; act("yawn", 1500); }
  if (now > pet.nextPoop) { pet.nextPoop = now + POOP_MS; if (pet.poops < 2 && !pet.night) { pet.poops++; save(); } }
  if (now - pet.hAt > HUNGER_MS) { pet.hAt = now; pet.hunger = clamp(pet.hunger - 1); save(); }
  if (now - pet.jAt > HAPPY_MS / (pet.poops ? 2 : 1)) { pet.jAt = now; pet.happy = clamp(pet.happy - 1); save(); } // poop left out = sadder faster
  pet.t++;
  if (!$("#workspace").hidden) render();
}, 250);

// ---------- inputs ----------
addEventListener("keydown", (e) => { if (!e.target.closest("input, textarea, [contenteditable]") && !$("#workspace").hidden) { pet.lastKey = Date.now(); pet.yawned = false; } });
// The app calls this from the output stream: BEL or error words startle, pass words celebrate.
window.petSaw = (text) => {
  if (/\x07|\b(error|failed|fatal|panic)\b/i.test(text)) act("startle", 1500);
  else if (/\b(passed|success|done)\b|✓/i.test(text)) { act("celebrate", 2000); }
};
const BTN = {
  feed: () => { if (pet.hunger >= 4) return act("full", 1200); act("eat", 2000); pet.hunger = clamp(pet.hunger + 1); },
  play: () => { act("play", 3200); pet.happy = clamp(pet.happy + 1); },
  clean: () => { act("clean", 1000); },
};
$$("[data-pet]").forEach((b) => b.addEventListener("click", () => { BTN[b.dataset.pet](); save(); render(); }));

// ---------- popover ----------
const pop = $("#pet-pop");
function togglePop(show = pop.hidden) {
  pop.hidden = !show; $("#pet").setAttribute("aria-expanded", show);
  if (show) { enter(pop.firstElementChild, { duration: 480 }); pop.querySelector("[data-pet]").focus(); render(); }
}
$("#pet").onclick = (e) => { e.stopPropagation(); togglePop(); };
document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest("#pet-pop")) togglePop(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { togglePop(false); $("#pet").focus(); } });
$("#pet-hide").onclick = () => { togglePop(false); $("#sw-pet").setAttribute("aria-checked", "false"); $("#pet").hidden = true; toast("warn", "Pet hidden. Bring it back in Settings."); };

// mockup-only gags
Object.assign(GAGS, {
  petBell: () => window.petSaw("\x07"), petPass: () => window.petSaw("Tests: 171 passed"),
  petNight: () => { pet.forceNight = !pet.forceNight; },
  petHungry: () => { pet.hunger = 0; pet.happy = 0; pet.poops = 2; save(); },
});
