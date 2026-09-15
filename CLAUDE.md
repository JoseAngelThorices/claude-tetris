# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step, no dependencies, no `package.json`, no linter. Open directly or serve with any static server:

```bash
xdg-open index.html              # Linux (macOS: open, Windows: start)
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Tests

There is currently no test suite. A Node regression test for the game-over loop (`test/game-over.test.js`) existed but was deleted in `cc95b4a`. It is a useful template for testing `game.js` headlessly — it loads the script with `vm` over a fake DOM (stub canvas contexts, elements by id) and a virtual `requestAnimationFrame` clock:

```bash
git show b77856d:test/game-over.test.js > test/game-over.test.js
node test/game-over.test.js [path/to/game.js]
```

Any such harness must stub everything `game.js` touches at load time: the element ids in `index.html`, `getComputedStyle`, `localStorage`, `performance.now`, and `requestAnimationFrame`/`cancelAnimationFrame`.

## Architecture

Three files, no framework, no bundler. UI text is in Spanish (`lang="es"`).

- **`index.html`** — `<canvas id="board">` (300×600) for the playfield, `<canvas id="next-canvas">` (120×120) for the preview, HUD (`#score`, `#lines`, `#level`), `#theme-toggle` button, and a single shared `#overlay` (with `#overlay-title`, `#overlay-score`, `#restart-btn`) used for both PAUSA and GAME OVER. The overlay is shown/hidden via the `hidden` class.
- **`style.css`** — Dark/retro arcade theme driven by CSS variables on `:root`; `body.light-mode` overrides them for the light theme.
- **`game.js`** — All game logic (~330 lines, `'use strict'`, no modules, globals only). Queries all DOM elements at top level and calls `init()` at the bottom.

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–8` = piece type / color index |
| Pieces | `PIECES[1..8]`: the 7 standard tetrominoes plus a custom 8th piece **N ("tuerca")**, a 3×3 ring. Cell values equal the piece type, so `COLORS[value]` gives the color. |
| Piece object | `{ type, shape, x, y }`; `randomPiece()` picks from `1..8` and deep-copies the shape |
| Rotation | `rotateCW(shape)`; `tryRotate()` tries horizontal kicks `[0, -1, 1, -2, 2]` |
| Collision | `collide(shape, ox, oy)` — bounds + board occupancy (cells with `y < 0` are allowed) |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` vs `dropInterval`; RAF handle in `animId` |
| Line clear | `clearLines()` — bottom-up, splice full row + unshift empty row, re-check same index |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `level = floor(lines/10) + 1`; `dropInterval = max(100, 1000 − (level−1) × 90)` ms |
| Ghost piece | `ghostY()`; drawn with `drawBlock(..., alpha = 0.2)` |
| Theme | `applyTheme(isLight)` toggles `body.light-mode`; persisted in `localStorage['tetris-theme']` |

### Game flow

`init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()` → schedule next frame. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` collides immediately → `endGame()`.

Invariants that have caused bugs before:
- **Game over must stop the loop.** `endGame()` cancels `animId`, but `lockPiece()` can trigger it from *inside* `loop()`, so `loop()` checks `if (gameOver) return;` after the drop step and before re-scheduling. Keep that check if you restructure the loop.
- The keydown handler ignores everything except `KeyP` while `paused || gameOver`; `togglePause()` is a no-op after game over. Resuming calls `loop()` directly with a fresh `lastTime` so the paused interval isn't counted as dt.

### Rendering and theming

The canvas is cleared with `clearRect` each frame, so the board background comes from CSS (`--canvas-bg`), not from JS. Grid lines read the CSS variable `--grid-line` via `getComputedStyle` every frame, so they follow the theme automatically. Piece colors in `COLORS` are hard-coded hex and are **not** theme-aware. To add a themed canvas color, define the variable in both `:root` and `body.light-mode` and read it the same way `drawGrid()` does.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` / `PIECES` (indexed 1–8, must stay aligned), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`). `drawNext()` assumes shapes fit in a 4×4 grid of 30 px cells on the 120×120 preview canvas.

## GitHub automation

`.github/workflows/` runs `anthropics/claude-code-action`:
- `claude.yml` — responds to `@claude` mentions in issues/PRs.
- `claude-code-review.yml` — automatic code review on every PR.
- `claude-issue-triage.yml` — labels new/edited issues (using `priority:`/`area:`/`type:` prefixes) and posts a technical diagnosis in Spanish. Its prompt hard-codes the file layout (`game.js`, `index.html`, `style.css`); update it if files are added or renamed.

README.md and in-game text are in Spanish; keep new user-facing strings in Spanish.
