# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static web app — "Digitales Punktefeld" — for German elementary-school students learning multiplication on iPads. A Punktefeld is a grid of dots; students drag an L-shaped "Malwinkel" to select a rectangular sub-grid, then solve multiplication tasks of increasing complexity.

Three files, no build step, no dependencies: `index.html`, `style.css`, `app.js`. Deployed via GitHub Pages — push to main, serve from root.

## Running locally

Open `index.html` in a browser, or serve the directory (e.g. `python3 -m http.server`). All interactions use pointer events so touch and mouse both work; viewport is locked against zoom (`user-scalable=no`) and `touch-action: none` is set on the SVG so drags don't scroll the page.

## Architecture

### State (`app.js` top)

```
state = { fieldSize: 100|400, n: 10|20, rows, cols, mode }
```

`rows`/`cols` is the count of selected dots, **not** a dot index. The L straddles dot index `rows` and dot index `rows+1` (those two dots are NOT selected; the selection is dots `0..rows-1`). `rows` ranges 0..n:
- `rows = i` (1 ≤ i ≤ n-1): L fully inside the grid, dots `i` and `i+1` covered.
- `rows = n-1`: L straddles last real dot and first virtual position → half-on, half-off.
- `rows = n`: L fully outside grid, adjacent to the edge → all `n` dots selected.

The minimum after any tap is clamped to 1 (see `pointToRC` in `attachPointerHandlers`).

### Rendering

`render()` calls `drawGrid()` (SVG) and `renderTaskPanel()` (HTML). The SVG is split into:
- A persistent interaction `<rect>` overlay (created once) that owns pointer events. Re-using it across renders is essential — without this, `setPointerCapture` would be lost mid-drag when the SVG redraws.
- A content `<g>` group that is wiped and rebuilt on each render. Helpers should call `addToGrid(el)` rather than appending directly to `$grid`.

`gridGeom()` is the single source of truth for dot positions. It uses a base `gap` between every dot, an extra `fiveGap` after every 5th dot, and a `tenGap` (400er only) after every 10th. `xs[]`/`ys[]` are dot center coordinates; `pointToRC` and `drawMalwinkel` both extrapolate one or two pitches past the last dot for the half-on / fully-outside states.

### Modes

Mode availability depends on field size:
- 100er: Aufgabe, Gruppen, Kernaufgaben
- 400er: Aufgabe, Gruppen, Teilaufgaben, Malkreuz (rendered as a 2×2 grid)

Each mode has its own `renderXxx` function that builds inputs and a Prüfen button.

**Kernaufgaben** decomposes `rows × cols` into elementary multiplications (×1, ×2, ×5, ×10). Order of preference: elementary itself → additive (`a+b`, larger first) → subtractive (`a−b`). Rectangle borders on the grid use translucent fills derived from the stroke color via `hexToRgba`.

**Teilaufgaben** (400er only) splits the selection by the 10×10 quadrant boundary into up to four sub-rectangles, each shown in its quadrant color (blue/green/red/orange from `Q_COLORS`).

**Malkreuz** (400er only) is a two-phase task. Phase 1: only the row- and column-header inputs are editable. After all headers are correct, `revealPhase2` disables the headers and unhides the pre-created body inputs (cells, row sums, column sums, total). The body inputs are created upfront with `visibility: hidden` so the table doesn't shift on phase change.

### Verification

All inputs go through `gradeInput(inp)` + `applyGrade(inp, result)`. Two-attempt reveal logic:
- Correct → green ✓, counter resets.
- Wrong with a value different from the last wrong attempt → counter increments. On the 2nd such attempt, the correct answer is revealed in a `.answer-reveal` sibling.
- Wrong with the same value as last attempt → no counter advance (pressing Prüfen repeatedly without changing the input doesn't reveal the answer).

State lives in the input's `dataset` (`lastWrong`, `wrongCount`), so re-rendering the panel (e.g. moving the Malwinkel, switching modes) resets it automatically.

## Conventions

- All text is German; verify-button label is "Prüfen", success/error messages use "richtig" / "Felder ausfüllen".
- The four quadrant colors are defined once in `Q_COLORS` and reused for dot fills, border strokes, translucent fills, and task-panel text colors.
- Layout switches between landscape (controls right of grid) and portrait (controls below grid) via CSS media queries on `orientation` / `max-width`.
