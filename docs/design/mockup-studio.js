// Studio designers (terminal preset + scene layout). Uses $, $$, svg, enter, toast from mockup.js.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");
const PAT = { "Memphis Pop": "confetti", "Zebra Club": "zebra", "Leopard Lounge": "leopard", "Zig Zag": "zigzag" };

const PRESETS = {
  "app-dev": { name: "app-dev", target: "ssh-host", cwd: "~/code/app", persist: false, env: [["NODE_ENV", "development"]],
    pre_exec: { mode: "stop_on_fail", run: ["git pull --ff-only", "source .venv/bin/activate"] }, command: "npm run dev",
    post_exec: { mode: "all", run: ["notify-send 'dev server stopped'"] }, on_close: { mode: "all", run: ["docker compose down"] },
    theme: "Memphis Pop", font: "JetBrainsMono Nerd Font", size: 14, bg: "pattern", opacity: 85 },
  logs: { name: "logs", target: "container", cwd: "/var/log", persist: true, env: [],
    pre_exec: { mode: "all", run: [] }, command: "tail -f syslog", post_exec: { mode: "all", run: [] }, on_close: { mode: "all", run: [] },
    theme: "Zig Zag", font: "Hack Nerd Font", size: 12, bg: "solid", opacity: 100 },
  htop: { name: "htop", target: "nsenter", cwd: "~", persist: false, env: [["TERM", "xterm-256color"]],
    pre_exec: { mode: "all", run: [] }, command: "htop", post_exec: { mode: "all", run: [] }, on_close: { mode: "all", run: [] },
    theme: "Zebra Club", font: "FiraCode Nerd Font", size: 13, bg: "gradient", opacity: 70 },
};
let cur = "app-dev";
const cp = () => PRESETS[cur];
const CHAINS = { pre_exec: "Before the command", post_exec: "After the command finishes", on_close: "When the terminal closes" };
const bgCss = (kind, theme) => kind === "pattern" ? `var(--pat-${PAT[theme] || "confetti"})` : kind === "gradient" ? "linear-gradient(135deg, var(--purple), var(--pink) 55%, var(--yellow))" : "var(--term-bg)";
const glass = (op) => `color-mix(in srgb, var(--term-bg) ${op}%, transparent)`;

// ---------- terminal designer ----------
function renderPresetList() {
  $("#preset-list").innerHTML = Object.keys(PRESETS).map((k) => `<button type="button" data-p="${k}" aria-pressed="${k === cur}">${esc(PRESETS[k].name)}</button>`).join("") + `<button type="button" class="add" data-p="+">+ New preset</button>`;
}
$("#preset-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-p]");
  if (!b) return;
  if (b.dataset.p === "+") {
    const k = "preset-" + (Object.keys(PRESETS).length + 1);
    PRESETS[k] = { ...structuredClone(PRESETS.logs), name: k, command: "", cwd: "~", persist: false, theme: "Memphis Pop", bg: "pattern" };
    cur = k; toast("success", `${k} created. Give it a name and a command.`);
  } else cur = b.dataset.p;
  fillForm();
  $$("#term-form .group").forEach((g, i) => enter(g, { delay: i * 80 }));
});

function setSeg(id, v) { $$(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v)); }
function fillForm() {
  const p = cp();
  renderPresetList();
  $$("#term-form [data-k]").forEach((i) => (i.value = p[i.dataset.k]));
  setSeg("t-target", p.target); setSeg("t-bg", p.bg);
  $("#t-persist").setAttribute("aria-checked", p.persist);
  renderEnv(); $$(".chain").forEach(renderChain); refresh();
}
function refresh() {
  const p = cp();
  $("#t-size-o").textContent = p.size + " px";
  $("#t-opacity-o").textContent = p.opacity + "%";
  renderPreview(); renderToml();
}
$("#term-form").addEventListener("input", (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  cp()[k] = e.target.type === "range" ? +e.target.value : e.target.value;
  if (k === "name") renderPresetList();
  refresh();
});
$("#term-form").addEventListener("change", (e) => { if (e.target.dataset.k) { cp()[e.target.dataset.k] = e.target.value; refresh(); } });
$("#t-target").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { cp().target = b.dataset.v; setSeg("t-target", b.dataset.v); refresh(); } });
$("#t-bg").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b && !b.disabled) { cp().bg = b.dataset.v === "none" ? "solid" : b.dataset.v; setSeg("t-bg", b.dataset.v); refresh(); } });
$("#t-persist").addEventListener("click", () => { cp().persist = $("#t-persist").getAttribute("aria-checked") === "true"; refresh(); });

function renderEnv() {
  $("#t-env").innerHTML = cp().env.map(([k, v], i) => `<div class="kv-row" data-i="${i}"><input class="input mono" aria-label="Variable name" value="${esc(k)}" data-e="0"><input class="input mono" aria-label="Value" value="${esc(v)}" data-e="1"><button type="button" class="icon-btn sm x-btn" data-del aria-label="Remove variable" data-tip="Remove">${svg("x")}</button></div>`).join("") || `<p class="muted">No variables. The shell inherits the server's environment.</p>`;
}
$("#t-env").addEventListener("input", (e) => { const r = e.target.closest(".kv-row"); if (r && e.target.dataset.e) { cp().env[r.dataset.i][e.target.dataset.e] = e.target.value; renderToml(); renderPreview(); } });
$("#t-env").addEventListener("click", (e) => { const r = e.target.closest("[data-del]")?.closest(".kv-row"); if (r) removeRow(r, () => { cp().env.splice(r.dataset.i, 1); renderEnv(); refresh(); }); });
$('[data-add="env"]').onclick = () => { cp().env.push(["", ""]); renderEnv(); enter($("#t-env .kv-row:last-child")); $("#t-env .kv-row:last-child input").focus(); refresh(); };
function removeRow(r, done) { tip.hidden = true; exit(r).finished.then(done); }

function renderChain(el) {
  const key = el.dataset.chain, c = cp()[key];
  el.innerHTML = `<div class="chain-head"><b>${CHAINS[key]}</b><div class="seg" role="group" aria-label="${CHAINS[key]} mode">
      <button type="button" data-mode-v="stop_on_fail" aria-pressed="${c.mode === "stop_on_fail"}">Stop on first failure</button><button type="button" data-mode-v="all" aria-pressed="${c.mode === "all"}">Run all</button></div></div>
    ${c.run.map((s, i) => `<div class="step" draggable="true" data-i="${i}"><span class="handle" aria-hidden="true" data-tip="Drag to reorder">⋮⋮</span><span class="step-n">${i + 1}</span><input class="input mono" aria-label="Step ${i + 1}" value="${esc(s)}"><button type="button" class="icon-btn sm x-btn" data-del aria-label="Remove step" data-tip="Remove">${svg("x")}</button></div>`).join("") || `<p class="muted">No steps yet.</p>`}
    <button type="button" class="btn sm ghost" data-add-step>Add step</button>`;
}
const chainOf = (e) => e.target.closest(".chain");
document.addEventListener("click", (e) => {
  const ch = chainOf(e); if (!ch) return;
  const c = cp()[ch.dataset.chain];
  const m = e.target.closest("[data-mode-v]");
  if (m) { c.mode = m.dataset.modeV; renderChain(ch); renderToml(); return; }
  if (e.target.closest("[data-add-step]")) { c.run.push(""); renderChain(ch); const s = ch.querySelector(".step:last-of-type"); enter(s); s.querySelector("input").focus(); refresh(); return; }
  const d = e.target.closest("[data-del]")?.closest(".step");
  if (d) removeRow(d, () => { c.run.splice(d.dataset.i, 1); renderChain(ch); refresh(); });
});
document.addEventListener("input", (e) => { const ch = chainOf(e), s = e.target.closest(".step"); if (ch && s) { cp()[ch.dataset.chain].run[s.dataset.i] = e.target.value; refresh(); } });
let dragFrom = null;
document.addEventListener("dragstart", (e) => { const s = e.target.closest?.(".step"); if (s) { dragFrom = s; s.classList.add("dragging"); } });
document.addEventListener("dragover", (e) => { if (dragFrom && e.target.closest?.(".step")) e.preventDefault(); });
document.addEventListener("drop", (e) => {
  const to = e.target.closest?.(".step"), ch = to?.closest(".chain");
  if (!dragFrom || !to || ch !== dragFrom.closest(".chain")) return;
  e.preventDefault();
  const run = cp()[ch.dataset.chain].run, [m] = run.splice(+dragFrom.dataset.i, 1);
  run.splice(+to.dataset.i, 0, m); renderChain(ch); refresh();
  enter(ch.querySelectorAll(".step")[+to.dataset.i], { duration: 400 });
});
document.addEventListener("dragend", () => { dragFrom?.classList.remove("dragging"); dragFrom = null; });

function renderPreview() {
  const p = cp(), host = p.target === "container" ? "tdog" : "host";
  const pre = p.pre_exec.run.filter(Boolean).map((s) => `<span class="d">❯ ${esc(s)}</span>  <span class="ok">✓</span>`).join("\n");
  const env = p.env.filter(([k]) => k).map(([k, v]) => `<span class="d"># ${esc(k)}=${esc(v)}</span>`).join("\n");
  const body = [env, pre, `<span class="p">jmo@${host}</span> <span class="c">${esc(p.cwd)}</span> ❯ ${esc(p.command)}${p.command ? "" : '<span class="cursor"></span>'}`, p.command ? `<span class="g">  ready</span> <span class="d">(running)</span><span class="cursor"></span>` : ""].filter(Boolean).join("\n");
  $("#t-preview").innerHTML = `<div class="tpane" style="background:${bgCss(p.bg, p.theme)};background-size:180px"><div class="pane-head"><span class="title">${esc(p.name)}</span><span class="chip">${esc(p.target)}</span>${p.persist ? '<span class="chip ok">keeps running</span>' : ""}</div><pre class="term" style="font-size:${p.size}px;background:${glass(p.opacity)}">${body}</pre></div>`;
}

// ---------- TOML (escaped; user text never reaches innerHTML raw) ----------
const k = (s) => `<span class="k">${s}</span>`, str = (s) => `<span class="s">"${esc(s)}"</span>`;
const hook = (c) => `{ mode = ${str(c.mode)}, run = [${c.run.filter(Boolean).map(str).join(", ")}] }`;
function renderToml() {
  const p = cp();
  $("#t-toml").innerHTML = [`<span class="c"># ${esc(p.name)}.toml, saved to /data/presets/terminals</span>`,
    `${k("name")} = ${str(p.name)}`, `${k("target")} = ${str(p.target)}`, `${k("cwd")} = ${str(p.cwd)}`, `${k("persistent")} = ${p.persist}`,
    `${k("env")} = { ${p.env.filter(([n]) => n).map(([n, v]) => `${esc(n)} = ${str(v)}`).join(", ")} }`,
    `${k("pre_exec")}  = ${hook(p.pre_exec)}`, `${k("command")}   = ${str(p.command)}`, `${k("post_exec")} = ${hook(p.post_exec)}`, `${k("on_close")}  = ${hook(p.on_close)}`,
    `${k("theme")} = ${str(slug(p.theme))}`, `${k("font")} = { family = ${str(p.font)}, size = ${p.size} }`,
    `${k("background")} = { kind = ${str(p.bg)}, opacity = ${(p.opacity / 100).toFixed(2)} }`].join("\n");
}
// Form/TOML toggle (one per designer)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (!b) return;
  const d = b.closest(".designer"), toml = b.dataset.mode === "toml";
  $$("[data-mode]", d).forEach((x) => x.setAttribute("aria-pressed", x === b));
  const [hide, show] = toml ? [$(".designer-form, .scene-canvas", d), $(".toml", d)] : [$(".toml", d), $(".designer-form, .scene-canvas", d)];
  if (!show.hidden) return;
  hide.hidden = true; show.hidden = false; enter(show, { duration: 450 });
});

// ---------- scene designer ----------
const LAYOUTS = {
  single: { label: "Single", areas: ['"a"'], cols: () => "1fr" },
  "2-up": { label: "2-up", areas: ['"a b"'] },
  "3-col": { label: "3 columns", areas: ['"a b c"'], cols: (r) => `${r}fr ${(100 - r) / 2}fr ${(100 - r) / 2}fr` },
  "1+2": { label: "1 + 2", areas: ['"a b"', '"a c"'] },
  "2x2": { label: "2 × 2", areas: ['"a b"', '"c d"'] },
  "1+3": { label: "1 + 3", areas: ['"a b"', '"a c"', '"a d"'] },
};
const slotsOf = (l) => [...new Set(LAYOUTS[l].areas.join("").match(/[a-d]/g))];
const colsOf = (l, r) => (LAYOUTS[l].cols || ((r) => `${r}fr ${100 - r}fr`))(r);
const S = { name: "dev box", autostart: true, layout: "1+2", split: 60, gap: 12, op: 90, bg: "confetti", slots: ["app-dev", "htop", "logs", "app-dev"] };
const BGS = ["confetti", "zebra", "leopard", "zigzag", "gradient", "solid"];

$("#snaps").innerHTML = Object.entries(LAYOUTS).map(([id, l]) => `<button type="button" class="snap" data-l="${id}" aria-pressed="${id === S.layout}">
  <span class="mini" style="grid-template-areas:${l.areas.join(" ")};grid-template-columns:${colsOf(id, 50)}">${slotsOf(id).map((s) => `<i style="grid-area:${s}"></i>`).join("")}</span>${l.label}</button>`).join("");
$("#s-bg").innerHTML = BGS.map((b) => `<button type="button" class="swatch-btn" data-bg="${b}" aria-pressed="${b === S.bg}" aria-label="${b}" data-tip="${b[0].toUpperCase() + b.slice(1)}" style="background:${b === "solid" ? "var(--bg)" : b === "gradient" ? bgCss("gradient") : `var(--pat-${b})`};background-size:60px"></button>`).join("");

function sceneBg() { return S.bg === "solid" ? "var(--bg)" : S.bg === "gradient" ? bgCss("gradient") : `var(--pat-${S.bg}) var(--bg)`; }
function styleCanvas() {
  const c = $("#scene-canvas"), l = LAYOUTS[S.layout];
  Object.assign(c.style, { gridTemplateAreas: l.areas.join(" "), gridTemplateColumns: colsOf(S.layout, S.split), gridTemplateRows: `repeat(${l.areas.length}, 1fr)`, background: sceneBg(), backgroundSize: "160px" });
  c.style.setProperty("--gap", S.gap + "px");
  $$(".slot pre", c).forEach((p) => (p.style.background = glass(S.op)));
  $("#s-split-o").textContent = S.split + "%"; $("#s-gap-o").textContent = S.gap + " px"; $("#s-op-o").textContent = S.op + "%";
}
function slotBody(key) { const p = PRESETS[key]; return `<span class="p">❯</span> <span class="c">${esc(p.cwd)}</span>\n${esc(p.command || "zsh")}<span class="cursor"></span>`; }
function renderCanvas(animate) {
  const ids = slotsOf(S.layout), opts = Object.keys(PRESETS);
  $("#scene-canvas").innerHTML = ids.map((s, i) => `<div class="slot" style="grid-area:${s}" data-s="${i}"><div class="slot-head"><span class="select"><select aria-label="Terminal preset for pane ${i + 1}">${opts.map((o) => `<option value="${o}" ${o === S.slots[i] ? "selected" : ""}>${esc(PRESETS[o].name)}</option>`).join("")}</select></span><span class="chip">${esc(PRESETS[S.slots[i]].target)}</span></div><pre class="term">${slotBody(S.slots[i])}</pre></div>`).join("");
  styleCanvas(); renderSceneToml();
  if (animate) $$(".slot").forEach((s, i) => enter(s, { delay: i * 90 }));
}
$("#snaps").addEventListener("click", (e) => {
  const b = e.target.closest(".snap"); if (!b) return;
  $$(".snap").forEach((x) => x.setAttribute("aria-pressed", x === b));
  const old = $$(".slot");
  Promise.all(old.map((s) => exit(s, { duration: 280 }).finished)).then(() => { S.layout = b.dataset.l; renderCanvas(true); });
});
$("#scene-canvas").addEventListener("change", (e) => {
  const s = e.target.closest(".slot"); if (!s) return;
  S.slots[s.dataset.s] = e.target.value;
  s.querySelector(".chip").textContent = PRESETS[e.target.value].target;
  s.querySelector("pre").innerHTML = slotBody(e.target.value);
  enter(s.querySelector("pre"), { duration: 400 }); renderSceneToml();
});
[["s-split", "split"], ["s-gap", "gap"], ["s-op", "op"]].forEach(([id, key]) => { const r = $("#" + id); r.value = S[key]; r.addEventListener("input", () => { S[key] = +r.value; styleCanvas(); renderSceneToml(); }); });
$("#s-bg").addEventListener("click", (e) => { const b = e.target.closest("[data-bg]"); if (!b) return; S.bg = b.dataset.bg; $$("#s-bg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); styleCanvas(); renderSceneToml(); });
$("#s-name").addEventListener("input", (e) => { S.name = e.target.value; renderSceneToml(); });
$("#s-auto").addEventListener("click", () => { S.autostart = $("#s-auto").getAttribute("aria-checked") === "true"; renderSceneToml(); });

function renderSceneToml() {
  const ids = slotsOf(S.layout);
  $("#s-toml").innerHTML = [`<span class="c"># ${esc(S.name)}.toml, saved to /data/presets/scenes</span>`,
    `${k("name")} = ${str(S.name)}`, `${k("autostart")} = ${S.autostart}`, `${k("layout")} = ${str(S.layout)}  <span class="c"># snap template, expands to a split tree</span>`,
    `${k("split")} = ${(S.split / 100).toFixed(2)}`, `${k("gap")} = ${S.gap}`, `${k("pane_opacity")} = ${(S.op / 100).toFixed(2)}`,
    `${k("background")} = { kind = ${str(["solid", "gradient"].includes(S.bg) ? S.bg : "pattern")}${["solid", "gradient"].includes(S.bg) ? "" : `, ref = ${str(S.bg)}`} }`,
    ...ids.flatMap((s, i) => ["", `<span class="h">[[panes]]</span>`, `${k("slot")} = ${str(s)}`, `${k("preset")} = ${str(PRESETS[S.slots[i]].name)}`])].join("\n");
}

fillForm();
renderCanvas(false);
