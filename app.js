"use strict";

const state = {
  fieldSize: 100,       // 100 or 400
  n: 10,                // 10 or 20 (per side)
  rows: 0,              // selected rows (0..n)
  cols: 0,              // selected cols (0..n)
  mode: null,           // mode key, or null when no mode is selected
};

const MODES_100 = [
  { key: "aufgabe",     label: "Aufgabe" },
  { key: "gruppen",     label: "Gruppen" },
  { key: "kernaufgaben", label: "Kernaufgaben" },
];
const MODES_400 = [
  { key: "aufgabe",      label: "Aufgabe" },
  { key: "gruppen",      label: "Gruppen" },
  { key: "teilaufgaben", label: "Teilaufgaben" },
  { key: "malkreuz",     label: "Malkreuz" },
];

const Q_COLORS = {
  TL: { name: "q-blue",   dot: "#2b3fb8", hex: "#2b3fb8" },
  TR: { name: "q-green",  dot: "#1f9d55", hex: "#1f9d55" },
  BL: { name: "q-red",    dot: "#d63a3a", hex: "#d63a3a" },
  BR: { name: "q-orange", dot: "#e98a1a", hex: "#e98a1a" },
};

const SVG_NS = "http://www.w3.org/2000/svg";

// --- DOM refs ---
const $grid = document.getElementById("grid");
const $modeSel = document.getElementById("mode-selector");
const $panel = document.getElementById("task-panel");
const $resetBtn = document.getElementById("reset-btn");

// --- Init ---
document.querySelectorAll(".field-selector .seg").forEach(btn => {
  btn.addEventListener("click", () => {
    const size = parseInt(btn.dataset.field, 10);
    setField(size);
  });
});
$resetBtn.addEventListener("click", () => {
  state.rows = 0;
  state.cols = 0;
  state.mode = null;
  renderModeSelector();
  render();
});

function setField(size) {
  state.fieldSize = size;
  state.n = size === 100 ? 10 : 20;
  state.rows = 0;
  state.cols = 0;
  document.querySelectorAll(".field-selector .seg").forEach(b => {
    const on = parseInt(b.dataset.field, 10) === size;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  // Clear mode if it isn't valid in the new field size (null stays null).
  const modes = currentModes();
  if (state.mode !== null && !modes.find(m => m.key === state.mode)) state.mode = null;
  renderModeSelector();
  render();
}

function currentModes() {
  return state.fieldSize === 100 ? MODES_100 : MODES_400;
}

function renderModeSelector() {
  $modeSel.innerHTML = "";
  $modeSel.classList.toggle("grid-2x2", state.fieldSize === 400);
  currentModes().forEach(m => {
    const b = document.createElement("button");
    b.className = "seg" + (m.key === state.mode ? " active" : "");
    b.textContent = m.label;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", m.key === state.mode ? "true" : "false");
    b.addEventListener("click", () => {
      state.mode = m.key;
      renderModeSelector();
      renderTaskPanel();
      drawGrid();
    });
    $modeSel.appendChild(b);
  });
}

// --- Grid layout constants ---
function gridGeom() {
  const n = state.n;
  // dot size & spacing
  const dot = state.fieldSize === 100 ? 22 : 13;
  const gap = state.fieldSize === 100 ? 10 : 6;
  // groups-of-5 extra gap
  const fiveGap = state.fieldSize === 100 ? 4 : 4;
  // groups-of-10 extra gap (400er only)
  const tenGap = state.fieldSize === 400 ? 6 : 0;
  const pad = 20;

  // x positions per col index (0..n-1)
  const xs = [];
  let x = pad;
  for (let i = 0; i < n; i++) {
    xs.push(x + dot / 2);
    x += dot;
    if (i < n - 1) {
      x += gap;
      if ((i + 1) % 5 === 0 && (i + 1) % 10 !== 0) x += fiveGap;
      if ((i + 1) % 10 === 0 && i + 1 < n) x += tenGap;
    }
  }
  const ys = [];
  let y = pad;
  for (let i = 0; i < n; i++) {
    ys.push(y + dot / 2);
    y += dot;
    if (i < n - 1) {
      y += gap;
      if ((i + 1) % 5 === 0 && (i + 1) % 10 !== 0) y += fiveGap;
      if ((i + 1) % 10 === 0 && i + 1 < n) y += tenGap;
    }
  }
  const w = xs[xs.length - 1] + dot / 2 + pad;
  const h = ys[ys.length - 1] + dot / 2 + pad;
  return { xs, ys, dot, gap, fiveGap, tenGap, pad, w, h, n };
}

// classify dot by quadrant (400er)
function quadrantOf(r, c) {
  if (state.fieldSize !== 400) return null;
  const top = r < 10, left = c < 10;
  if (top && left) return Q_COLORS.TL;
  if (top && !left) return Q_COLORS.TR;
  if (!top && left) return Q_COLORS.BL;
  return Q_COLORS.BR;
}

// --- Draw grid ---
let _overlay = null;       // persistent interaction rect
let _contentGroup = null;  // group containing all redrawn artwork
let _currentGeom = null;   // latest geometry for pointer mapping

function drawGrid() {
  const g = gridGeom();
  _currentGeom = g;
  // Add margin so the Malwinkel can render fully outside the dot field (when rows/cols == n+1)
  const margin = (g.dot + g.gap) * 3 + 8;
  const vbW = g.w + margin;
  const vbH = g.h + margin;
  $grid.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  $grid.setAttribute("width", vbW);
  $grid.setAttribute("height", vbH);

  // Set up persistent overlay + content group once.
  if (!_overlay) {
    _contentGroup = el("g", {});
    $grid.appendChild(_contentGroup);
    _overlay = el("rect", {
      x: 0, y: 0, width: vbW, height: vbH,
      fill: "transparent", style: "cursor:pointer",
    });
    $grid.appendChild(_overlay);
    attachPointerHandlers(_overlay);
  } else {
    _overlay.setAttribute("width", vbW);
    _overlay.setAttribute("height", vbH);
  }

  // Wipe and redraw the content group only.
  while (_contentGroup.firstChild) _contentGroup.removeChild(_contentGroup.firstChild);

  // 1) Malwinkel
  drawMalwinkel(g);
  // 2) Separators
  drawSeparators(g);
  // 3) Dots
  const selRows = Math.min(state.rows, g.n);
  const selCols = Math.min(state.cols, g.n);
  const hasSelection = selRows > 0 && selCols > 0;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cx = g.xs[c], cy = g.ys[r];
      const q = quadrantOf(r, c);
      const fill = q ? q.hex : "#2b3fb8";
      const selected = r < selRows && c < selCols;
      const opacity = !hasSelection || selected ? 1 : 0.25;
      addToGrid(el("circle", { cx, cy, r: g.dot / 2 - 1, fill, opacity }));
    }
  }
  // 4) Mode-specific overlays
  if (state.mode === "gruppen") drawGruppenBorders(g);
  if (state.mode === "kernaufgaben") drawKernBorders(g);
  if (state.mode === "teilaufgaben") drawTeilBorders(g);
  if (state.mode === "malkreuz") drawMalkreuzBorders(g);
}

// Append a drawn element to the content group (everything except the persistent overlay).
function addToGrid(node) {
  _contentGroup.appendChild(node);
}

function drawMalwinkel(g) {
  const r = Math.min(state.rows, g.n), c = Math.min(state.cols, g.n);
  if (r === 0 && c === 0) return;

  const fill = "rgba(43, 95, 217, 0.10)";
  const stroke = "#2b5fd9";
  const strokeW = 2;
  const rx = 8;
  const pad = 4;
  // Extra outset when an arm sits outside the dot field (all rows/cols selected)
  const outside = g.dot + g.gap;

  // The Malwinkel straddles two dot positions: dot (k-1) and dot (k), where k is the
  // count of selected rows/cols. When k === n, the second position is virtual — one
  // dot-pitch beyond the last dot.
  const pitch = g.dot + g.gap;
  const xCenterAt = (i) => (i < g.n ? g.xs[i] : g.xs[g.n - 1] + pitch * (i - g.n + 1));
  const yCenterAt = (i) => (i < g.n ? g.ys[i] : g.ys[g.n - 1] + pitch * (i - g.n + 1));

  // Vertical arm band: straddles col c and col c+1 (those are NOT selected).
  let vL, vR;
  vL = xCenterAt(c)     - g.dot / 2 - pad;
  vR = xCenterAt(c + 1) + g.dot / 2 + pad;

  // Horizontal arm band: straddles row r and row r+1.
  let hT, hB;
  hT = yCenterAt(r)     - g.dot / 2 - pad;
  hB = yCenterAt(r + 1) + g.dot / 2 + pad;

  // Outer extents (where the arms terminate at the field edges)
  const xLeftOuter = g.pad - 4;
  const yTopOuter  = g.pad - 4;

  // Single L-shaped path:
  //   (vL, yTopOuter) → (vR, yTopOuter) → (vR, hB) → (xLeftOuter, hB)
  //                  → (xLeftOuter, hT) → (vL, hT) → close
  const d = roundedPath([
    [vL,         yTopOuter],
    [vR,         yTopOuter],
    [vR,         hB],
    [xLeftOuter, hB],
    [xLeftOuter, hT],
    [vL,         hT],
  ], rx);
  addToGrid(el("path", {
    d, fill, stroke, "stroke-width": strokeW, "stroke-linejoin": "round",
  }));
}

// Build an SVG path for a polygon with rounded corners.
function roundedPath(points, r) {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const [p1, p2] = trimCorner(prev, curr, next, r);
    if (i === 0) d += `M ${p1[0]} ${p1[1]} `;
    else         d += `L ${p1[0]} ${p1[1]} `;
    d += `Q ${curr[0]} ${curr[1]} ${p2[0]} ${p2[1]} `;
  }
  d += "Z";
  return d;
}
function trimCorner(prev, curr, next, r) {
  const v1x = prev[0] - curr[0], v1y = prev[1] - curr[1];
  const v2x = next[0] - curr[0], v2y = next[1] - curr[1];
  const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
  const t = Math.min(r, l1 / 2, l2 / 2);
  return [
    [curr[0] + v1x / l1 * t, curr[1] + v1y / l1 * t],
    [curr[0] + v2x / l2 * t, curr[1] + v2y / l2 * t],
  ];
}

function drawSeparators(g) {
  // Vertical lines between columns 5/10/15
  for (let i = 5; i < g.n; i += 5) {
    const c = i - 1; // right edge of column i-1
    const xMid = (g.xs[c] + g.xs[i]) / 2;
    const dashed = (i % 10 !== 0);
    const line = el("line", {
      x1: xMid, x2: xMid,
      y1: g.pad - 4, y2: g.h - g.pad + 4,
      stroke: dashed ? "#b4bacb" : "#8892ad",
      "stroke-width": dashed ? 1 : 1.5,
      "stroke-dasharray": dashed ? "3,4" : "0",
    });
    addToGrid(line);
  }
  for (let i = 5; i < g.n; i += 5) {
    const r = i - 1;
    const yMid = (g.ys[r] + g.ys[i]) / 2;
    const dashed = (i % 10 !== 0);
    const line = el("line", {
      x1: g.pad - 4, x2: g.w - g.pad + 4,
      y1: yMid, y2: yMid,
      stroke: dashed ? "#b4bacb" : "#8892ad",
      "stroke-width": dashed ? 1 : 1.5,
      "stroke-dasharray": dashed ? "3,4" : "0",
    });
    addToGrid(line);
  }
}

function rectAround(g, r0, c0, rows, cols, opts = {}) {
  if (rows <= 0 || cols <= 0) return null;
  const pad = opts.pad ?? 4;
  const x0 = g.xs[c0] - g.dot / 2 - pad;
  const y0 = g.ys[r0] - g.dot / 2 - pad;
  const x1 = g.xs[c0 + cols - 1] + g.dot / 2 + pad;
  const y1 = g.ys[r0 + rows - 1] + g.dot / 2 + pad;
  const stroke = opts.stroke || "#d63a3a";
  return el("rect", {
    x: x0, y: y0, width: x1 - x0, height: y1 - y0,
    fill: hexToRgba(stroke, 0.12),
    stroke,
    "stroke-width": opts.width || 2,
    rx: opts.rx ?? 6,
  });
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawGruppenBorders(g) {
  const rows = Math.min(state.rows, g.n), cols = Math.min(state.cols, g.n);
  if (rows === 0 || cols === 0) return;
  for (let r = 0; r < rows; r++) {
    const rect = rectAround(g, r, 0, 1, cols, {
      stroke: "#d63a3a", width: 2, rx: 10,
    });
    addToGrid(rect);
  }
}

function drawKernBorders(g) {
  const rows = Math.min(state.rows, g.n), cols = Math.min(state.cols, g.n);
  const dec = kernDecomposition(rows, cols);
  if (!dec) return;
  // dec.parts: [{rows, cols, sign, offsetR, offsetC}]
  dec.parts.forEach(p => {
    const stroke = p.sign === "+" ? "#1f9d55" : "#d63a3a";
    const rect = rectAround(g, p.offsetR, p.offsetC, p.rows, p.cols, {
      stroke, width: 2.5, rx: 8, pad: p.padInset ?? 3,
    });
    if (rect) addToGrid(rect);
  });
}

function drawTeilBorders(g) {
  // outline each of the four quadrant sub-rectangles selected
  const rows = Math.min(state.rows, g.n), cols = Math.min(state.cols, g.n);
  if (rows === 0 || cols === 0) return;
  const parts = teilParts();
  parts.forEach(p => {
    if (p.rows === 0 || p.cols === 0) return;
    const rect = rectAround(g, p.r0, p.c0, p.rows, p.cols, {
      stroke: p.q.hex, width: 2.5, rx: 8,
    });
    addToGrid(rect);
  });
}

function drawMalkreuzBorders(g) {
  // outline the four sub-rectangles with column-split / row-split colors
  drawTeilBorders(g);
}

function teilParts() {
  // For 400er: split by quadrant boundary (row 10, col 10)
  const r = Math.min(state.rows, state.n), c = Math.min(state.cols, state.n);
  if (state.fieldSize !== 400) return [];
  const top = Math.min(r, 10);
  const bot = Math.max(0, r - 10);
  const left = Math.min(c, 10);
  const right = Math.max(0, c - 10);
  const parts = [];
  if (top && left)   parts.push({ r0: 0,  c0: 0,  rows: top, cols: left,  q: Q_COLORS.TL });
  if (top && right)  parts.push({ r0: 0,  c0: 10, rows: top, cols: right, q: Q_COLORS.TR });
  if (bot && left)   parts.push({ r0: 10, c0: 0,  rows: bot, cols: left,  q: Q_COLORS.BL });
  if (bot && right)  parts.push({ r0: 10, c0: 10, rows: bot, cols: right, q: Q_COLORS.BR });
  return parts;
}

function el(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// --- Pointer interaction ---
function attachPointerHandlers(overlay) {
  let dragging = false;
  function pointToRC(evt) {
    const g = _currentGeom;
    if (!g) return null;
    const pt = $grid.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = $grid.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    // The L straddles dot (k) and dot (k+1). The selected dots are those *above/left*
    // of the L — count k. So tapping near dot i → k = i. Tap virtual position past
    // the last dot → k = n (L half-on / half-off, all n dots selected). Tap further → k = n+1 (fully outside).
    const pitch = g.dot + g.gap;
    const xAt = (i) => (i < g.n ? g.xs[i] : g.xs[g.n - 1] + pitch * (i - g.n + 1));
    const yAt = (i) => (i < g.n ? g.ys[i] : g.ys[g.n - 1] + pitch * (i - g.n + 1));
    // The L straddles dot k and dot k+1 (those are NOT selected). Selected = 0..k-1 = k.
    // Boundary between k and k+1: midpoint(xAt(k), xAt(k+1)).
    // Tap dot i exactly → k = i.
    // Max selected = n (all dots), reached when tap is one pitch past the last dot.
    let cols = g.n;
    for (let i = 0; i <= g.n; i++) {
      const b = (xAt(i) + xAt(i + 1)) / 2;
      if (loc.x <= b) { cols = i; break; }
    }
    let rows = g.n;
    for (let i = 0; i <= g.n; i++) {
      const b = (yAt(i) + yAt(i + 1)) / 2;
      if (loc.y <= b) { rows = i; break; }
    }
    // Tapping anywhere selects at least 1×1.
    if (cols < 1) cols = 1;
    if (rows < 1) rows = 1;
    return { rows, cols };
  }
  function update(evt) {
    const rc = pointToRC(evt);
    if (!rc) return;
    if (rc.rows !== state.rows || rc.cols !== state.cols) {
      state.rows = rc.rows;
      state.cols = rc.cols;
      render();
    }
  }
  overlay.addEventListener("pointerdown", e => {
    overlay.setPointerCapture(e.pointerId);
    dragging = true;
    update(e);
    e.preventDefault();
  });
  overlay.addEventListener("pointermove", e => {
    if (dragging) update(e);
  });
  overlay.addEventListener("pointerup", e => {
    dragging = false;
    overlay.releasePointerCapture(e.pointerId);
  });
  overlay.addEventListener("pointercancel", () => { dragging = false; });
}

// --- Kern decomposition ---
const ELEMENTARY = [1, 2, 5, 10];
function kernDecomposition(rows, cols) {
  if (rows === 0 || cols === 0) return null;

  // If rows is already a Kernaufgabe, no decomposition needed.
  if (ELEMENTARY.includes(rows)) {
    return {
      text: `${rows}·${cols} ist eine Kernaufgabe`,
      parts: [{ rows, cols, sign: "+", offsetR: 0, offsetC: 0 }],
      elementary: true,
    };
  }

  // Try additive: bigger + smaller = rows, both in ELEMENTARY.
  // The bigger summand is listed first and drawn on top.
  for (const big of ELEMENTARY) {
    for (const small of ELEMENTARY) {
      if (big + small === rows && big >= small) {
        return {
          text: `${rows}·${cols} = ${big}·${cols} + ${small}·${cols}`,
          parts: [
            { rows: big,   cols, sign: "+", offsetR: 0,   offsetC: 0 },
            { rows: small, cols, sign: "+", offsetR: big, offsetC: 0, padInset: 1 },
          ],
        };
      }
    }
  }
  // Try subtractive: a - b = rows, a,b in ELEMENTARY, b<a
  for (const a of ELEMENTARY) {
    for (const b of ELEMENTARY) {
      if (a - b === rows && b < a) {
        return {
          text: `${rows}·${cols} = ${a}·${cols} − ${b}·${cols}`,
          parts: [
            { rows: a, cols, sign: "+", offsetR: 0, offsetC: 0 },
            { rows: b, cols, sign: "-", offsetR: a - b, offsetC: 0, padInset: 1 },
          ],
        };
      }
    }
  }
  return null;
}

// --- Verification helpers ---

// Grade a single input. Tracks wrong-attempt count via dataset; only counts as
// a new attempt when the value has CHANGED from the prior wrong value.
// Returns { filled, ok, revealAnswer }.
function gradeInput(inp) {
  const v = inp.value.trim();
  if (v === "") return { filled: false, ok: false, revealAnswer: false };
  const expected = parseInt(inp.dataset.expected, 10);
  const ok = parseInt(v, 10) === expected;
  if (ok) {
    delete inp.dataset.lastWrong;
    delete inp.dataset.wrongCount;
    return { filled: true, ok: true, revealAnswer: false };
  }
  const lastWrong = inp.dataset.lastWrong;
  const prevCount = parseInt(inp.dataset.wrongCount || "0", 10);
  let count = prevCount;
  if (v !== lastWrong) {
    count = prevCount + 1;
    inp.dataset.lastWrong = v;
    inp.dataset.wrongCount = String(count);
  }
  return { filled: true, ok: false, revealAnswer: count >= 2 };
}

// Apply visual feedback to a group of inputs that have been graded.
// If any input crossed the "revealAnswer" threshold, show the correct value
// next to it (in a sibling .answer-reveal element).
function applyGrade(inp, result) {
  inp.classList.toggle("ok", result.ok);
  inp.classList.toggle("err", result.filled && !result.ok);
  // Remove any prior reveal
  const next = inp.parentElement?.querySelector(".answer-reveal");
  if (next) next.remove();
  if (result.revealAnswer) {
    const reveal = document.createElement("span");
    reveal.className = "answer-reveal";
    const isMalkreuz = inp.dataset.kind || inp.classList.contains("malkreuz-head");
    reveal.textContent = isMalkreuz ? inp.dataset.expected : `Richtig: ${inp.dataset.expected}`;
    inp.parentElement.appendChild(reveal);
  }
}

// --- Task panel rendering ---
function renderTaskPanel() {
  $panel.innerHTML = "";
  const r = Math.min(state.rows, state.n), c = Math.min(state.cols, state.n);

  if (r === 0 || c === 0) {
    const hint = document.createElement("div");
    hint.style.color = "var(--muted)";
    hint.textContent = "Wähle mit dem Malwinkel Punkte aus.";
    $panel.appendChild(hint);
    return;
  }

  if (state.mode === null) {
    const hint = document.createElement("div");
    hint.style.color = "var(--muted)";
    hint.textContent = "Wähle eine Aufgabenart aus.";
    $panel.appendChild(hint);
    return;
  }

  if (state.mode === "aufgabe") renderAufgabe(r, c);
  else if (state.mode === "gruppen") renderGruppen(r, c);
  else if (state.mode === "kernaufgaben") renderKern(r, c);
  else if (state.mode === "teilaufgaben") renderTeil(r, c);
  else if (state.mode === "malkreuz") renderMalkreuz(r, c);
}

function renderAufgabe(r, c) {
  const eq = document.createElement("div");
  eq.className = "task-eq";
  eq.textContent = (r === c) ? `${r} · ${c} =` : `${r} · ${c} = ${c} · ${r} =`;
  $panel.appendChild(eq);
  appendAnswerInput(r * c);
}

function renderGruppen(r, c) {
  const eq = document.createElement("div");
  eq.className = "gruppen-eq";
  eq.innerHTML = `<span class="num">${r}</span> <span class="num">${c}</span>er = `;
  $panel.appendChild(eq);
  appendAnswerInput(r * c);
}

function renderKern(r, c) {
  const dec = kernDecomposition(r, c);
  if (!dec) {
    const msg = document.createElement("div");
    msg.style.color = "var(--muted)";
    msg.textContent = `Für ${r}·${c} gibt es keine einfache Zerlegung.`;
    $panel.appendChild(msg);
    return;
  }
  const decline = document.createElement("div");
  decline.className = "kern-eq";
  decline.textContent = dec.elementary
    ? `${r}·${c} =`
    : `${dec.text} =`;
  $panel.appendChild(decline);

  appendAnswerInput(r * c);
}

function renderTeil(r, c) {
  const list = document.createElement("div");
  list.className = "teil-list";
  const parts = teilParts();
  const partInputs = [];
  parts.forEach(p => {
    const line = document.createElement("div");
    line.className = `teil-eq ${p.q.name}`;
    const label = document.createElement("span");
    label.textContent = `${p.rows} · ${p.cols} = `;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.className = "teil-input";
    inp.dataset.expected = String(p.rows * p.cols);
    line.appendChild(label);
    line.appendChild(inp);
    list.appendChild(line);
    partInputs.push(inp);
  });
  $panel.appendChild(list);

  const total = document.createElement("div");
  total.className = "task-eq";
  total.innerHTML = `${r} · ${c} = `;
  const totalInp = document.createElement("input");
  totalInp.type = "text";
  totalInp.inputMode = "numeric";
  totalInp.className = "teil-total";
  totalInp.dataset.expected = String(r * c);
  total.appendChild(totalInp);
  $panel.appendChild(total);

  const row = document.createElement("div");
  row.className = "answer-row";
  const verify = document.createElement("button");
  verify.className = "verify";
  verify.textContent = "Prüfen";
  const feedback = document.createElement("div");
  feedback.className = "feedback";
  row.appendChild(verify);
  row.appendChild(feedback);
  $panel.appendChild(row);

  const allInputs = [...partInputs, totalInp];
  verify.addEventListener("click", () => {
    const allFilled = allInputs.every(i => i.value.trim() !== "");
    if (!allFilled) {
      allInputs.forEach(i => i.classList.remove("ok", "err"));
      allInputs.forEach(i => i.parentElement?.querySelector(".answer-reveal")?.remove());
      feedback.textContent = "Bitte alle Felder ausfüllen.";
      feedback.className = "feedback err";
      return;
    }
    let allCorrect = true;
    allInputs.forEach(inp => {
      const result = gradeInput(inp);
      applyGrade(inp, result);
      if (!result.ok) allCorrect = false;
    });
    feedback.textContent = allCorrect ? "Alles richtig! ✓" : "Manche Felder sind noch nicht richtig.";
    feedback.className = "feedback " + (allCorrect ? "ok" : "err");
  });
}

function renderMalkreuz(r, c) {
  // Build a malkreuz table
  // Rows: row-splits (top quadrant rows, bottom quadrant rows)
  // Cols: col-splits (left, right)
  const rowParts = [];
  if (r >= 1) rowParts.push(Math.min(r, 10));
  if (r > 10) rowParts.push(r - 10);
  const colParts = [];
  if (c >= 1) colParts.push(Math.min(c, 10));
  if (c > 10) colParts.push(c - 10);

  function quadFor(ri, ci) {
    const top = ri === 0;
    const left = ci === 0;
    if (top && left) return Q_COLORS.TL;
    if (top && !left) return Q_COLORS.TR;
    if (!top && left) return Q_COLORS.BL;
    return Q_COLORS.BR;
  }

  const head = document.createElement("div");
  head.className = "task-eq";
  head.textContent = `${r} · ${c} =`;
  $panel.appendChild(head);

  const table = document.createElement("table");
  table.className = "malkreuz";

  // Helper for header-cell inputs (used in phase 1)
  function makeHeaderInput(expected) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.className = "malkreuz-head";
    inp.dataset.expected = String(expected);
    return inp;
  }
  // Helper for body-cell inputs (revealed in phase 2)
  function makeCellInput(expected, kind) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.dataset.expected = String(expected);
    inp.dataset.kind = kind;
    return inp;
  }

  // --- Header row (·, col-headers, empty) ---
  const thead = document.createElement("tr");
  thead.appendChild(thHeader("·"));
  const colHeaderInputs = colParts.map(cp => {
    const th = document.createElement("th");
    const inp = makeHeaderInput(cp);
    th.appendChild(inp);
    thead.appendChild(th);
    return inp;
  });
  thead.appendChild(thHeader(""));
  table.appendChild(thead);

  // --- Body rows ---
  const rowHeaderInputs = [];
  const cellTds = []; // {td, kind, expected} for phase-2 reveal
  rowParts.forEach((rp, ri) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const rhInp = makeHeaderInput(rp);
    th.appendChild(rhInp);
    rowHeaderInputs.push(rhInp);
    tr.appendChild(th);

    colParts.forEach((cp, ci) => {
      const td = document.createElement("td");
      const q = quadFor(ri, ci);
      td.className = q.name;
      const inp = makeCellInput(rp * cp, "cell");
      inp.style.visibility = "hidden";
      td.appendChild(inp);
      cellTds.push({ td, kind: "cell", expected: rp * cp, input: inp });
      tr.appendChild(td);
    });
    // row sum cell
    const tdRowSum = document.createElement("td");
    tdRowSum.className = "sum";
    {
      const inp = makeCellInput(rp * c, "rowsum");
      inp.style.visibility = "hidden";
      tdRowSum.appendChild(inp);
      cellTds.push({ td: tdRowSum, kind: "rowsum", expected: rp * c, input: inp });
    }
    tr.appendChild(tdRowSum);
    table.appendChild(tr);
  });

  // --- Footer (col sums + total) ---
  const tfoot = document.createElement("tr");
  tfoot.appendChild(thHeader(""));
  colParts.forEach((cp, ci) => {
    const td = document.createElement("td");
    td.className = "sum";
    const inp = makeCellInput(cp * r, "colsum");
    inp.style.visibility = "hidden";
    td.appendChild(inp);
    cellTds.push({ td, kind: "colsum", expected: cp * r, input: inp });
    tfoot.appendChild(td);
  });
  const tdTotal = document.createElement("td");
  tdTotal.className = "total";
  {
    const inp = makeCellInput(r * c, "total");
    inp.style.visibility = "hidden";
    tdTotal.appendChild(inp);
    cellTds.push({ td: tdTotal, kind: "total", expected: r * c, input: inp });
  }
  tfoot.appendChild(tdTotal);
  table.appendChild(tfoot);

  $panel.appendChild(table);

  const row = document.createElement("div");
  row.className = "answer-row";
  const verify = document.createElement("button");
  verify.className = "verify";
  verify.textContent = "Prüfen";
  const feedback = document.createElement("div");
  feedback.className = "feedback";
  row.appendChild(verify);
  row.appendChild(feedback);
  $panel.appendChild(row);

  let phase = 1;

  function revealPhase2() {
    phase = 2;
    [...colHeaderInputs, ...rowHeaderInputs].forEach(inp => {
      inp.disabled = true;
      inp.classList.remove("ok", "err");
    });
    cellTds.forEach(({ input }) => {
      input.style.visibility = "";
    });
  }

  verify.addEventListener("click", () => {
    if (phase === 1) {
      const headerInputs = [...colHeaderInputs, ...rowHeaderInputs];
      const allFilled = headerInputs.every(i => i.value.trim() !== "");
      if (!allFilled) {
        headerInputs.forEach(i => i.classList.remove("ok", "err"));
        headerInputs.forEach(i => i.parentElement?.querySelector(".answer-reveal")?.remove());
        feedback.textContent = "Bitte alle Felder ausfüllen.";
        feedback.className = "feedback err";
        return;
      }
      let allCorrect = true;
      headerInputs.forEach(inp => {
        const result = gradeInput(inp);
        applyGrade(inp, result);
        if (!result.ok) allCorrect = false;
      });
      if (allCorrect) {
        feedback.textContent = "Zerlegung richtig! Jetzt die Tabelle ausfüllen.";
        feedback.className = "feedback ok";
        revealPhase2();
      } else {
        feedback.textContent = "Manche Felder sind noch nicht richtig.";
        feedback.className = "feedback err";
      }
      return;
    }

    // Phase 2: validate body cells, sums, and total.
    const bodyInputs = cellTds.map(c => c.input);
    const allFilled = bodyInputs.every(i => i.value.trim() !== "");
    if (!allFilled) {
      bodyInputs.forEach(i => i.classList.remove("ok", "err"));
      bodyInputs.forEach(i => i.parentElement?.querySelector(".answer-reveal")?.remove());
      feedback.textContent = "Bitte alle Felder ausfüllen.";
      feedback.className = "feedback err";
      return;
    }
    let allCorrect = true;
    bodyInputs.forEach(inp => {
      const result = gradeInput(inp);
      applyGrade(inp, result);
      if (!result.ok) allCorrect = false;
    });
    feedback.textContent = allCorrect ? "Alles richtig! ✓" : "Manche Felder sind noch nicht richtig.";
    feedback.className = "feedback " + (allCorrect ? "ok" : "err");
  });
}

function thHeader(text) {
  const th = document.createElement("th");
  th.textContent = text;
  return th;
}

function appendAnswerInput(expected) {
  const row = document.createElement("div");
  row.className = "answer-row";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = "?";
  input.dataset.expected = String(expected);
  const verify = document.createElement("button");
  verify.className = "verify";
  verify.textContent = "Prüfen";
  const feedback = document.createElement("div");
  feedback.className = "feedback";

  function check() {
    const result = gradeInput(input);
    if (!result.filled) {
      feedback.textContent = "Bitte eine Zahl eingeben.";
      feedback.className = "feedback err";
      input.classList.remove("ok", "err");
      return;
    }
    applyGrade(input, result);
    // For this single-input flow, show the reveal as a second line in the
    // feedback area instead of as an inline sibling next to the input.
    input.parentElement?.querySelector(".answer-reveal")?.remove();
    feedback.innerHTML = "";
    if (result.ok) {
      feedback.textContent = "Richtig! ✓";
    } else {
      feedback.appendChild(document.createTextNode("Noch nicht richtig."));
      if (result.revealAnswer) {
        feedback.appendChild(document.createElement("br"));
        const reveal = document.createElement("span");
        reveal.className = "reveal-line";
        reveal.textContent = `Richtig ist ${expected}`;
        feedback.appendChild(reveal);
      }
    }
    feedback.className = "feedback " + (result.ok ? "ok" : "err");
  }
  verify.addEventListener("click", check);
  input.addEventListener("keydown", e => { if (e.key === "Enter") check(); });

  row.appendChild(input);
  row.appendChild(verify);
  row.appendChild(feedback);
  $panel.appendChild(row);
}

// --- Master render ---
function render() {
  drawGrid();
  renderTaskPanel();
}

// boot
renderModeSelector();
setField(100);
