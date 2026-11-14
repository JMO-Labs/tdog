// tdog chrome mockup. Vanilla JS + Web Animations; the real app uses React + shadcn + motion.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// Every animation goes through here: reduced motion swaps the keyframes for a plain fade.
function anim(el, frames, opts = {}) {
  if (RM) { const o = opts.out ? [1, 0] : [0, 1]; return el.animate([{ opacity: o[0] }, { opacity: o[1] }], { duration: 200, fill: opts.fill }); }
  const { out, ...o } = opts;
  return el.animate(frames, { duration: 500, easing: "cubic-bezier(.34,1.56,.64,1)", ...o });
}
// Entry/exit pools: every pop-in and pop-out picks one at random, so the chrome never repeats itself.
const ENTER = [
  [{ transform: "translateY(-90px) rotate(-8deg)", opacity: 0 }, { transform: "translateY(8px) rotate(2deg)", opacity: 1, offset: .7 }, { transform: "none" }], // drop + bounce
  [{ transform: "scale(0) rotate(-200deg)", opacity: 0 }, { transform: "scale(1.08) rotate(6deg)", opacity: 1, offset: .75 }, { transform: "none" }], // spin pop
  [{ transform: "translateX(-140px) skewX(30deg)", opacity: 0 }, { transform: "translateX(12px) skewX(-10deg)", opacity: 1, offset: .7 }, { transform: "none" }], // skate in
  [{ transform: "perspective(700px) rotateX(90deg)", opacity: 0 }, { transform: "perspective(700px) rotateX(-14deg)", opacity: 1, offset: .7 }, { transform: "none" }], // flip down
  [{ transform: "scale(1.8,.15)", opacity: 0 }, { transform: "scale(.85,1.2)", opacity: 1, offset: .45 }, { transform: "scale(1.05,.95)", offset: .75 }, { transform: "none" }], // squash + stretch
  [{ transform: "scale(1.7) rotate(-12deg)", opacity: 0 }, { transform: "scale(.94)", opacity: 1, offset: .6 }, { transform: "none" }], // sticker slap
];
const EXIT = [
  [{ transform: "none", opacity: 1 }, { transform: "rotate(18deg) translate(60px,-40px) scale(.7)", opacity: 0 }], // peel
  [{ transform: "none", opacity: 1 }, { transform: "scale(0) rotate(220deg)", opacity: 0 }], // spin down the drain
  [{ transform: "none" }, { transform: "translateY(-14px) rotate(-4deg)", offset: .2 }, { transform: "translateY(110vh) rotate(28deg)", opacity: .7 }], // gravity
  [{ transform: "none", opacity: 1 }, { transform: "scale(1.18)", opacity: 1, offset: .3 }, { transform: "scale(0)", opacity: 0 }], // pop
  [{ transform: "none", opacity: 1 }, { transform: "translateX(120vw) skewX(-30deg)", opacity: .5 }], // skate off
  [{ transform: "none", opacity: 1 }, { transform: "perspective(700px) rotateY(90deg)", opacity: 0 }], // flip away
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const enter = (el, o = {}) => anim(el, pick(ENTER), { duration: 560, ...o });
const exit = (el, o = {}) => anim(el, pick(EXIT), { duration: 440, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards", out: true, ...o });

// ---------- icons (stroke, 24 grid) ----------
const P = {
  brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-2 0-4-2-6"/>',
  system: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  dark: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  right: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  down: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  phone: '<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>', check: '<path d="M4 12l5 5L20 6"/>',
  modem: '<rect x="2" y="13" width="20" height="7" rx="2"/><path d="M6 16.5h.01M10 16.5h.01M8 9a6 6 0 0 1 8 0M5 6a10 10 0 0 1 14 0"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;
const paintIcons = (root = document) => $$("[data-icon]", root).forEach((e) => (e.innerHTML = svg(e.dataset.icon)));

const CASSETTE = `<svg viewBox="0 0 120 84"><rect x="2" y="2" width="116" height="80" rx="10" fill="#FFE14D" stroke="#160B2E" stroke-width="4"/><rect x="16" y="14" width="88" height="34" rx="6" fill="#FF2D95" stroke="#160B2E" stroke-width="3"/><circle cx="38" cy="31" r="9" fill="#fff" stroke="#160B2E" stroke-width="3"/><circle cx="82" cy="31" r="9" fill="#fff" stroke="#160B2E" stroke-width="3"/><path d="M30 80l8-20h44l8 20" fill="#22D3EE" stroke="#160B2E" stroke-width="3"/><path d="M16 56h30" stroke="#160B2E" stroke-width="3"/></svg>`;

// ---------- theme + display font ----------
const MODES = ["system", "light", "dark"];
let mode = store.get("tdog.theme") || "system";
function applyTheme() {
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = mode;
  $$(".theme-toggle").forEach((b) => { b.innerHTML = svg(mode); b.dataset.tip = `Theme: ${mode[0].toUpperCase() + mode.slice(1)}`; });
}
function cycleTheme() { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; store.set("tdog.theme", mode); applyTheme(); }

// ---------- tooltips: 400ms delay, instant while moving between neighbours ----------
const tip = $("#tip");
let tipTimer, tipWarm = 0;
document.addEventListener("pointerover", (e) => {
  const t = e.target.closest("[data-tip]");
  if (!t) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(t), Date.now() - tipWarm < 300 ? 0 : 400);
});
document.addEventListener("pointerout", (e) => { if (e.target.closest("[data-tip]")) { clearTimeout(tipTimer); if (!tip.hidden) tipWarm = Date.now(); tip.hidden = true; } });
document.addEventListener("focusin", (e) => { const t = e.target.closest("[data-tip]"); if (t && t.matches(":focus-visible")) showTip(t); });
document.addEventListener("focusout", () => (tip.hidden = true));
function showTip(t) {
  tip.innerHTML = t.dataset.tip + (t.dataset.kbd ? `<kbd>${t.dataset.kbd}</kbd>` : "");
  tip.hidden = false;
  const r = t.getBoundingClientRect(), w = tip.offsetWidth;
  const below = r.top < 60;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  tip.style.top = (below ? r.bottom + 10 : r.top - tip.offsetHeight - 10) + "px";
  anim(tip, [{ transform: "scale(.6) rotate(-6deg)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260 });
}

// ---------- toasts with slang headlines ----------
const SLANG = {
  success: ["Radical!", "Bodacious!", "Booyah!", "All that and a bag of chips", "Da bomb", "Phat!"],
  fail: ["Bummer.", "As if!", "Not!", "Talk to the hand", "Psych!", "Whatever."],
  warn: ["Whoa.", "Duuude.", "Don't have a cow"],
};
const serious = () => $("#sw-serious").getAttribute("aria-checked") === "true";
function toast(kind, detail, head) {
  const el = document.createElement("div");
  const h = serious() ? "" : head || (SLANG[kind] || SLANG.success)[Math.floor(Math.random() * (SLANG[kind] || SLANG.success).length)];
  el.className = `toast ${kind}`;
  el.innerHTML = (h ? `<b>${h}</b>` : "") + `<p>${detail}</p>`;
  const tilt = (Math.random() * 6 - 3).toFixed(1);
  el.style.rotate = tilt + "deg";
  $("#toasts").append(el);
  enter(el);
  let gone = false;
  const peel = () => { if (!gone) { gone = true; exit(el).finished.then(() => el.remove()); } };
  el.onclick = peel;
  setTimeout(peel, 4200);
}

// ---------- confetti burst (Memphis shapes) ----------
function confetti() {
  if (RM) return;
  const c = $("#confetti"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const cols = ["#FF2D95", "#22D3EE", "#FFE14D", "#8B3DFF"];
  const ps = Array.from({ length: 110 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 18, vy: Math.random() * -18 - 4, r: Math.random() * 6, s: 6 + Math.random() * 8, k: Math.floor(Math.random() * 3), col: cols[Math.floor(Math.random() * 4)] }));
  let t = 0;
  (function frame() {
    x.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += .55; p.r += .1;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.col; x.strokeStyle = "#160B2E"; x.lineWidth = 2; x.beginPath();
      if (p.k === 0) x.arc(0, 0, p.s / 2, 0, 7); else if (p.k === 1) x.rect(-p.s / 2, -p.s / 2, p.s, p.s); else { x.moveTo(0, -p.s / 2); x.lineTo(p.s / 2, p.s / 2); x.lineTo(-p.s / 2, p.s / 2); x.closePath(); }
      x.fill(); x.stroke(); x.restore();
    }
    if (++t < 110) requestAnimationFrame(frame); else x.clearRect(0, 0, c.width, c.height);
  })();
}

// ---------- routing ----------
const AUTH = { boot: "#v-login", setup: "#v-setup", totp: "#v-totp" };
function route() {
  const v = location.hash.slice(1) || "boot";
  const auth = v in AUTH;
  $("#auth").hidden = !auth;
  $("#workspace").hidden = auth;
  $$(".auth-card").forEach((f) => (f.hidden = f !== $(AUTH[v])));
  if (auth) bootSeq(); else { requestAnimationFrame(movePill); }
}
let booted = false;
try { booted = sessionStorage.getItem("tdog.booted") === "1"; } catch {}
function bootSeq(force) {
  if (booted && !force) return;
  booted = true;
  try { sessionStorage.setItem("tdog.booted", "1"); } catch {}
  const letters = $$(".wordmark.big span");
  const all = [];
  letters.forEach((l, i) => all.push(anim(l, [{ transform: "translateY(-120vh) rotate(-40deg)" }, { transform: "translateY(10px) rotate(6deg)", offset: .7 }, { transform: "none" }], { duration: 700, delay: i * 140, fill: "backwards" })));
  all.push(anim($(".auth-card:not([hidden])"), [{ transform: "translateY(60px) rotate(3deg)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 600, delay: 650, fill: "backwards" }));
  const skip = () => all.forEach((a) => a.finish());
  addEventListener("keydown", skip, { once: true });
  addEventListener("pointerdown", skip, { once: true });
}

// ---------- auth flows ----------
let tries = 5;
$("#v-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const pw = $("#login-pw");
  if (pw.value.toLowerCase() === "radical") return signOn();
  tries = Math.max(1, tries - 1);
  $("#nono-detail").textContent = `Wrong password. ${tries} ${tries === 1 ? "try" : "tries"} left before a 1-minute lockout.`;
  anim($("#v-login"), [0, -14, 12, -10, 8, -4, 0].map((d) => ({ transform: `translateX(${d}px) rotate(${d / 6}deg)` })), { duration: 520, easing: "linear" });
  const crt = $("#nono");
  crt.hidden = false;
  anim(crt, [{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 380 });
  if (!RM) $(".hand").animate([0, -4, 4, -4, 4, -4, 0].map((d) => ({ transform: `rotate(${d}deg) translateX(${d * 2}px)` })), { duration: 1500, easing: "ease-in-out" });
  setTimeout(() => anim(crt, [{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 250, fill: "forwards" }).finished.then(() => { crt.hidden = true; pw.select(); }), 2400);
});
$("#setup-pw").addEventListener("input", (e) => {
  const n = e.target.value.length, pct = Math.min(100, (n / 16) * 100);
  $(".tape i").style.width = pct + "%";
  $("#tape-label").textContent = n === 0 ? "Tape empty. 12 characters minimum." : n < 12 ? `${12 - n} more characters to go.` : n < 16 ? "Good enough to record." : "Full tape. Totally tubular.";
});
$("#v-setup").addEventListener("submit", (e) => { e.preventDefault(); signOn("Account created. You're in."); });
$$(".otp-box").forEach((b, i, all) => b.addEventListener("input", () => { b.value = b.value.replace(/\D/g, ""); if (b.value && all[i + 1]) all[i + 1].focus(); }));
$("#v-totp").addEventListener("submit", (e) => { e.preventDefault(); signOn(); });

async function signOn(msg = "Signed in. Your 3 shells are right where you left them.") {
  const o = $("#dialup"), steps = $$(".steps li");
  steps.forEach((s) => s.classList.remove("on"));
  $("#wave").hidden = true;
  o.hidden = false;
  enter($(".dialup-card"));
  for (const s of steps) { await new Promise((r) => setTimeout(r, RM ? 150 : 650)); s.classList.add("on"); anim(s.firstElementChild, [{ transform: "scale(1.6) rotate(-20deg)" }, { transform: "none" }], { duration: 400 }); }
  $("#wave").hidden = false;
  enter($("#wave"), { duration: 600 });
  await new Promise((r) => setTimeout(r, RM ? 600 : 1400));
  close(o);
  location.hash = "workspace";
  confetti();
  toast("success", msg);
}

// ---------- workspace: panes ----------
const TERM_A = `<span class="p">jmo@tdog</span> <span class="c">~/code/tdog</span> <span class="y">(dev)</span> ❯ npm run dev
<span class="d">> web@0.1.0 dev
> vite</span>

  <span class="g">VITE v8.0.2</span>  ready in 212 ms
  ➜  Local:   <span class="c">http://localhost:5173/</span>
`;
const TERM_B = `<span class="p">jmo@host</span> <span class="c">~</span> ❯ htop
<span class="d">  CPU</span> [<span class="g">||||||||</span><span class="y">|||</span>        <span class="d">31.4%</span>]   <span class="d">Tasks:</span> 142
<span class="d">  Mem</span> [<span class="g">||||||||||||</span><span class="p">||</span>     <span class="d">9.1G/32G</span>]   <span class="d">Load:</span> 0.42
<span class="d">  PID USER   CPU% MEM% COMMAND</span>
  <span class="c">812</span> jmo    12.0  1.2 tdog
  <span class="c">944</span> jmo     6.3  4.8 node vite
  <span class="c">101</span> root    0.7  0.3 sshd<span class="cursor"></span>`;
let paneN = 0;
function pane(kind, title, target, body) {
  const p = document.createElement("section");
  p.className = "pane";
  p.dataset.id = ++paneN;
  p.innerHTML = `<div class="pane-head"><span class="title">${title}</span><span class="chip">${target}</span><span class="spacer"></span>
    <button class="icon-btn sm" data-act="right" data-tip="Split right" data-kbd="⌘D" aria-label="Split right">${svg("right")}</button>
    <button class="icon-btn sm" data-act="down" data-tip="Split down" data-kbd="⇧⌘D" aria-label="Split down">${svg("down")}</button>
    <button class="icon-btn sm" data-act="close" data-tip="Close pane" data-kbd="⌘W" aria-label="Close pane">${svg("x")}</button></div>`;
  if (kind === "empty") {
    p.insertAdjacentHTML("beforeend", `<div class="empty"><div class="sticker">${CASSETTE}</div><p class="empty-big">Nothing playing.</p><p class="muted">Split this pane, or press <kbd>⌘K</kbd> to pick a preset.</p></div>`);
  } else p.insertAdjacentHTML("beforeend", `<pre class="term">${body}</pre>`);
  return p;
}
function seedPanes() {
  const ps = $("#panes");
  ps.append(pane("term", "zsh: ~/code/tdog", "container", TERM_A), pane("term", "htop", "ssh-host", TERM_B), pane("empty", "new pane", "container"));
}
$("#panes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const p = b.closest(".pane");
  if (b.dataset.act === "close") {
    tip.hidden = true;
    exit(p).finished.then(() => { p.remove(); toast("success", "Pane closed. Shell ended cleanly.", "Peace out!"); });
  } else {
    const n = pane("empty", "new pane", "container");
    p.after(n);
    enter(n);
  }
});
// fake streaming output keeps the pet awake
const STREAM = ["  <span class='d'>12:01:04</span> <span class='g'>[vite]</span> hmr update /src/App.tsx", "  <span class='d'>12:01:09</span> <span class='g'>[vite]</span> page reload src/main.tsx", "  <span class='d'>12:01:15</span> <span class='y'>[vite]</span> optimized deps changed"];
let streamI = 0, lastOut = 0;
setInterval(() => {
  const t = $(".pane .term");
  if (!t || $("#workspace").hidden || Math.random() < .5) return;
  t.insertAdjacentHTML("beforeend", STREAM[streamI++ % STREAM.length] + "\n");
  t.scrollTop = t.scrollHeight; lastOut = Date.now();
}, 1400);

// ---------- tabs ----------
function movePill() {
  const sel = $('.tab[aria-selected="true"]'), pill = $(".tab-pill");
  if (!sel || !sel.offsetWidth) return;
  const to = { left: sel.offsetLeft + "px", width: sel.offsetWidth + "px" };
  const from = { left: pill.style.left || to.left, width: pill.style.width || to.width };
  Object.assign(pill.style, to);
  anim(pill, [from, { ...to, transform: "scaleY(.8)", offset: .6 }, to], { duration: 480 });
}
$(".tabs").addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  $$(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
  movePill();
});
$("#new-scene").onclick = () => {
  const t = document.createElement("button");
  t.className = "tab"; t.role = "tab"; t.textContent = "scene " + ($$(".tab").length + 1);
  $(".tabs").append(t);
  anim(t, [{ transform: "scale(0) rotate(-20deg)" }, { transform: "none" }]);
  t.click();
};

// ---------- pet ----------
const DOG = ["....XX....XX", "...XYYX..XYX", "...XYYYXXYYX", "..XYYYYYYYYX", ".XYYKYYYYKYX", "XYYYYYPPYYYX", "XYYYYYYYYYX.", ".XXYYYYYYX..", "..XYXXXXYX..", "..XX....XX.."];
const COL = { X: "#160B2E", Y: "#FFE14D", K: "#160B2E", P: "#FF2D95" };
function drawPet(awake) {
  const r = DOG.flatMap((row, y) => [...row].map((c, x) => c === "." ? "" : `<rect x="${x * 3}" y="${y * 3}" width="3" height="3" fill="${!awake && c === "K" ? "#4E4568" : COL[c]}"/>`)).join("");
  $("#pet").innerHTML = `<svg viewBox="-2 -8 44 40">${r}${awake ? "" : '<text class="zz" x="34" y="0">z</text><text class="zz" x="39" y="-5">z</text>'}</svg>`;
  $("#pet").className = "pet " + (awake ? "awake" : "sleep");
  $("#pet").dataset.tip = awake ? "Dogbert is watching your output. Click to hide" : "Dogbert is asleep. Click to hide";
}
let petAwake = null;
setInterval(() => { const a = Date.now() - lastOut < 3000; if (a !== petAwake) drawPet((petAwake = a)); }, 500);
function backflip() { if (!RM) $("#pet svg").animate([{ transform: "none" }, { transform: "translateY(-16px) rotate(-180deg)" }, { transform: "rotate(-360deg)" }], { duration: 700, easing: "ease-in-out" }); }
$("#pet").onclick = () => { $("#sw-pet").setAttribute("aria-checked", "false"); $("#pet").hidden = true; tip.hidden = true; toast("warn", "Pet hidden. Bring it back in Settings."); };

// ---------- dialogs ----------
function open(el) { el.hidden = false; return el; }
// Overlays animate their card out; drawer/studio animate themselves. Then hide and clear the held frame.
function close(el) {
  if (!el || el.hidden || el.dataset.closing) return;
  const t = el.classList.contains("overlay") ? el.firstElementChild : el;
  el.dataset.closing = "1";
  exit(t).finished.then(() => { el.hidden = true; delete el.dataset.closing; t.getAnimations().forEach((a) => a.cancel()); });
}
document.addEventListener("click", (e) => { const c = e.target.closest("[data-close]"); if (c) close(c.closest(".overlay, .drawer, .studio")); });
$$(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o) close(o); }));
function openDrawer() { anim(open($("#drawer")), [{ transform: "translateX(110%) rotate(4deg)" }, { transform: "none" }], { duration: 520 }); }
function openStudio() { anim(open($("#studio")), [{ clipPath: "circle(0% at 95% 4%)" }, { clipPath: "circle(150% at 95% 4%)" }], { duration: 600, easing: "ease-out" }); }
$("#open-settings").onclick = openDrawer;
$("#open-studio").onclick = openStudio;
$$(".theme-toggle").forEach((b) => (b.onclick = cycleTheme));
$$(".switch").forEach((s) => s.addEventListener("click", () => {
  const on = s.getAttribute("aria-checked") !== "true";
  s.setAttribute("aria-checked", on);
  if (s.id === "sw-pet") $("#pet").hidden = !on;
  if (s.id === "sw-totp") toast(on ? "success" : "warn", on ? "Two-factor codes on. Scan the QR code next." : "Two-factor codes off. Anyone with your password can sign in.");
  if (s.id === "sw-serious") toast("info", on ? "Serious mode on. Messages stay plain." : "Serious mode off.", on ? "" : "Back in business!");
}));
$("#revoke").onclick = () => toast("warn", "Signed out 1 other session. This browser stays signed in.");

// studio
const THEMES = [["Memphis Pop", "confetti", "Confetti, squiggles, triangles"], ["Zebra Club", "zebra", "Teal stripes, hot-pink scribbles"], ["Leopard Lounge", "leopard", "Bubblegum with purple spots"], ["Zig Zag", "zigzag", "Neon outlines only"]];
$("#theme-cards").innerHTML = THEMES.map(([n, k, d]) => `<button class="theme-card" data-pat="${k}" aria-pressed="${k === "confetti"}"><span class="swatch" style="background-image:var(--pat-${k});background-color:var(--bg)"></span><b>${n}</b><span class="muted">${d}</span></button>`).join("");
$("#theme-cards").addEventListener("click", (e) => {
  const c = e.target.closest(".theme-card");
  if (!c) return;
  $$(".theme-card").forEach((x) => x.setAttribute("aria-pressed", x === c));
  document.documentElement.style.setProperty("--pattern", `var(--pat-${c.dataset.pat})`);
  anim(c, [{ transform: "scale(.9) rotate(-3deg)" }, { transform: "none" }], { duration: 400 });
  toast("success", `${c.querySelector("b").textContent} applied to every scene.`);
});
$$(".nav-item").forEach((n) => n.addEventListener("click", () => {
  $$(".nav-item").forEach((x) => x.setAttribute("aria-current", x === n));
  $$("[data-pane-body]").forEach((b) => {
    const show = b.dataset.paneBody === n.dataset.pane;
    if (show && b.hidden) { b.hidden = false; enter(b, { duration: 480 }); } else if (!show) b.hidden = true;
  });
}));
$$("[data-sticker]").forEach((s) => (s.innerHTML = CASSETTE));

// kill-all hold
let holdT, holdStart;
const ring = $("#ring");
$("#open-kill").onclick = () => enter(open($("#kill")).firstElementChild);
function holdTick() {
  const p = Math.min(1, (Date.now() - holdStart) / 1600);
  ring.style.strokeDashoffset = 327 * (1 - p);
  if (!RM) { document.body.classList.add("shake"); document.body.style.setProperty("--amp", (p * 6).toFixed(1) + "px"); }
  if (p < 1) holdT = requestAnimationFrame(holdTick); else nuke();
}
function holdEnd() { cancelAnimationFrame(holdT); ring.style.strokeDashoffset = 327; document.body.classList.remove("shake"); }
$("#hold").addEventListener("pointerdown", () => { holdStart = Date.now(); holdTick(); });
["pointerup", "pointerleave"].forEach((ev) => $("#hold").addEventListener(ev, () => { if (holdStart && Date.now() - holdStart < 1600) { holdEnd(); toast("warn", "Let go too early. Shells are safe.", "Psych!"); } holdStart = 0; }));
function nuke() {
  holdEnd(); holdStart = 0; close($("#kill"));
  const b = open($("#bolt"));
  anim(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: "ease-in" }).finished.then(() => close(b));
  $$(".pane .term").forEach((t) => t.insertAdjacentHTML("beforeend", "\n<span class='p'>[process exited: killed by kill-all]</span>"));
  toast("success", "3 shells nuked in 2 scenes.", "Booyah!");
}

// ---------- command palette ----------
const CMDS = [["Open Studio", "⌘.", openStudio], ["Open Settings", "⌘,", openDrawer], ["Cycle theme", "⇧⌘L", cycleTheme], ["New scene", "⌘T", () => $("#new-scene").click()],
  ["Split right", "⌘D", () => $(".pane [data-act=right]")?.click()], ["Kill all shells", "⌘⇧⌫", () => $("#open-kill").click()], ["Start screensaver", "", screensaver],
  ["Sign out", "", () => { toast("info", "Session ended. See you next time.", "Be kind, rewind."); setTimeout(() => (location.hash = "boot"), 600); }]];
let sel = 0;
function renderCmds() {
  const q = $("#cmdk-q").value.toLowerCase();
  const list = CMDS.filter((c) => c[0].toLowerCase().includes(q));
  sel = Math.min(sel, Math.max(0, list.length - 1));
  $("#cmdk-list").innerHTML = list.length ? list.map((c, i) => `<li role="option" aria-selected="${i === sel}" data-i="${CMDS.indexOf(c)}">${c[0]}${c[1] ? `<kbd>${c[1]}</kbd>` : ""}</li>`).join("") : `<li>As if! No command matches.</li>`;
}
function openCmdk() { open($("#cmdk")); $("#cmdk-q").value = ""; sel = 0; renderCmds(); enter($(".cmdk")); $("#cmdk-q").focus(); }
function runCmd(i) { close($("#cmdk")); CMDS[i][2](); }
$("#open-cmdk").onclick = openCmdk;
$("#cmdk-q").addEventListener("input", () => { sel = 0; renderCmds(); });
$("#cmdk-list").addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) runCmd(+li.dataset.i); });
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openCmdk(); return; }
  if (e.key === "Escape") { [$("#cmdk"), $("#kill"), $("#drawer"), $("#studio"), $("#saver")].forEach(close); return; }
  if ($("#cmdk").hidden) return;
  const items = $$("#cmdk-list [data-i]");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; renderCmds(); }
  if (e.key === "Enter" && items[sel]) { e.preventDefault(); runCmd(+items[sel].dataset.i); }
});

// ---------- gags ----------
function dropConnection() {
  const p = $(".pane .term")?.closest(".pane");
  if (!p) return;
  const v = document.createElement("div");
  v.className = "vhs"; v.innerHTML = `<span class="play">▶ PLAY</span>Adjusting tracking…`;
  p.append(v);
  setTimeout(() => {
    v.remove();
    const c = document.createElement("canvas"); c.className = "static"; c.width = 160; c.height = 90; p.append(c);
    const x = c.getContext("2d"), img = x.createImageData(160, 90); let n = 0;
    (function noise() { for (let i = 0; i < img.data.length; i += 4) { const g = Math.random() * 255; img.data.set([g, g, g, 255], i); } x.putImageData(img, 0, 0); if (++n < 14 && !RM) requestAnimationFrame(noise); else {
      c.remove(); const r = document.createElement("div"); r.className = "vhs"; r.innerHTML = `<span class="play">◀◀ REW</span>Rewinding…`; p.append(r);
      anim(r, [{ filter: "blur(0)", transform: "skewX(0)" }, { filter: "blur(2px)", transform: "skewX(-8deg)" }, { filter: "blur(0)", transform: "none" }], { duration: 800, easing: "linear" }).finished.then(() => { r.remove(); toast("success", "Reconnected. Scrollback replayed."); });
    } })();
  }, 2600);
}
function lag() {
  const l = $("#latency");
  l.classList.add("slow"); l.innerHTML = `${svg("modem")}<b>412 ms</b>`; l.dataset.tip = "Dial-up speeds. Typing may feel sluggish.";
  setTimeout(() => { l.classList.remove("slow"); l.innerHTML = `${svg("bolt")}<b>3 ms</b>`; delete l.dataset.tip; }, 4000);
}
function screensaver() {
  const s = open($("#saver"));
  s.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="fly" style="left:${20 + i * 14}vw;top:${-20 - (i % 3) * 25}vh;animation-duration:${7 + (i % 4) * 2}s;animation-delay:-${i * 1.3}s">${CASSETTE}</div>`).join("");
  setTimeout(() => { const off = () => { close(s); removeEventListener("keydown", off); removeEventListener("pointerdown", off); }; addEventListener("keydown", off); addEventListener("pointerdown", off); }, 300);
}
const GAGS = {
  drop: dropConnection, lag, saver: screensaver,
  bg: () => { backflip(); toast("info", "npm test finished in scene logs (exit 0).", "You've got output!"); },
  fail: () => toast("fail", "Shell exited with code 1 in pane htop."),
  boot: () => { location.hash = "boot"; setTimeout(() => bootSeq(true), 50); },
};
$$("[data-gag]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.gag !== "boot" && b.dataset.gag !== "saver" && location.hash !== "#workspace") location.hash = "workspace"; setTimeout(GAGS[b.dataset.gag], 80); }));

// ---------- start ----------
paintIcons();
applyTheme();
seedPanes();
drawPet(false);
addEventListener("hashchange", route);
addEventListener("resize", movePill);
route();
