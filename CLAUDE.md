# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step, no dependencies, no `package.json`, no linter. Open directly or serve with any static server:

```bash
xdg-open index.html              # Linux (macOS: open, Windows: start)
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Tests

Headless Node tests, one per feature, no test runner. Each exits non-zero on failure:

```bash
node test/pause-menu.test.js
node test/records.test.js
node test/skins.test.js
```

Each file loads `game.js` with `vm` over its **own** fake DOM (elements by id with a Set-backed `classList`, stored listeners to fire clicks/keydowns, recording canvas contexts) and a virtual `performance.now`/`requestAnimationFrame` clock. Any such harness must stub everything `game.js` touches at load time: every element id in `index.html`, `getComputedStyle`, `localStorage`, `performance.now`, `requestAnimationFrame`/`cancelAnimationFrame`. Two gotchas when adding UI:
- Elements declared with class `hidden` in `index.html` (`#overlay`, `#pause-menu`, `#pause-controls`, …) must also start hidden in the stubs, otherwise e.g. `pauseInputBlocked()` thinks the menu is open and swallows game keys.
- Stubs need any DOM method the new code calls (`contains`, `replaceChildren`, `focus`, …). A new element/method usually means updating all three harnesses.

## Architecture

Three files, no framework, no bundler. UI text is in Spanish (`lang="es"`).

- **`index.html`** — `<canvas id="board">` (300×600), `<canvas id="next-canvas">` (120×120), HUD (`#score`, `#lines`, `#level`), `#theme-toggle` (top-right), `#skin-select` (top-left), and three overlays toggled with the `hidden` class:
  - `#start-screen` — records table (`#start-records`), `#play-btn`, `#reset-records-btn`. Visible on load.
  - `#overlay` — GAME OVER only: `#overlay-title`, `#overlay-score`, `#record-message`, `#name-form` (`#player-name`, `#save-name-btn`), `#gameover-records`, `#restart-btn`.
  - `#pause-menu` — `#resume-btn`, `#pause-restart-btn`, `#controls-btn` / `#pause-controls`, `#start-level` select.
- **`style.css`** — Dark/retro arcade theme driven by CSS variables on `:root`; `body.light-mode` overrides them. Feature sections at the end (`Menú de pausa`, `Skins`, `Récords`) each define their own `:root` / `body.light-mode` variables. `body.skin-<name>` classes adjust canvas background/borders per skin.
- **`game.js`** — All game logic (`'use strict'`, no modules, globals only). Queries DOM elements at top level (feature sections query their own), and calls `showStartScreen()` at the bottom.

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–8` = piece type / color index |
| Pieces | `PIECES[1..8]`: the 7 standard tetrominoes plus a custom 8th piece **N ("tuerca")**, a 3×3 ring. Cell values equal the piece type, so `activeSkin.colors[value]` gives the color. |
| Piece object | `{ type, shape, x, y }`; `randomPiece()` picks from `1..8` and deep-copies the shape |
| Rotation | `rotateCW(shape)`; `tryRotate()` tries horizontal kicks `[0, -1, 1, -2, 2]` |
| Collision | `collide(shape, ox, oy)` — bounds + board occupancy (cells with `y < 0` are allowed) |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` vs `dropInterval`; RAF handle in `animId` |
| Line clear | `clearLines()` — bottom-up, splice full row + unshift empty row, re-check same index; returns the number cleared |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `level = gameStartLevel + floor(lines/10)`; `dropInterval = max(100, 1000 − (level−1) × 90)` ms |
| Ghost piece | `ghostY()`; drawn with `drawBlock(..., alpha = 0.2)` |
| Skins | `SKINS = { retro, neon, pastel, pixel }`, each `{ label, colors[1..8], drawBlock(ctx, px, py, size, color, alpha) }`; `activeSkin`; `applySkin(name)` persisted in `localStorage['tetris-skin']` |
| Pause menu | `togglePause()` → `openPauseMenu()` / `closePauseMenu()`; `pauseInputBlocked(e)`; `startLevel` (next game, `localStorage['tetris-start-level']`, 1–10) vs `gameStartLevel` (current game) |
| Records | `localStorage['tetris-records']` = `{ scores: [{name, score, lines, level, date}] (top 5), bestCombo, maxLines }`; `loadRecords()`/`saveRecords()`, `renderRecords()`, `onGameOverRecords()`, `saveNamedRecord()`; last name in `localStorage['tetris-player-name']` |
| Combo | `updateCombo(cleared)` — consecutive locks that clear ≥1 line; `combo`, `bestComboGame` |
| Theme | `applyTheme(isLight)` toggles `body.light-mode`; persisted in `localStorage['tetris-theme']` |

### Game flow

Load → `applySkin(saved)` → `showStartScreen()` (empty board, `gameOver = true`) → Jugar / Enter → `init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()` → schedule next frame. `lockPiece()` = `merge()` + `updateCombo(clearLines())` + `spawn()`. If `spawn()` collides immediately → `endGame()` → `onGameOverRecords()` (name form if the score enters the top 5, otherwise the table). `init()` starts with `resetRecordsUI()`, which saves a pending top-5 score before hiding the form.

Invariants that have caused bugs before:
- **Game over must stop the loop.** `endGame()` cancels `animId`, but `lockPiece()` can trigger it from *inside* `loop()`, so `loop()` checks `if (gameOver) return;` after the drop step and before re-scheduling. Keep that check if you restructure the loop.
- **The start screen is modeled as `gameOver = true`.** `togglePause()` must stay a no-op while `gameOver`, and game keys must stay ignored, otherwise P/Escape on the start screen would resume a loop with `current` undefined.
- **Keydown handler order matters:** (1) ignore events from `INPUT` (typing the record name); (2) game keys on `#skin-select` → `preventDefault` + blur, then fall through; (3) `KeyP`/`Escape` (non-repeat) → `togglePause()`; (4) `pauseInputBlocked(e) || paused || gameOver` → return. Selects inside the pause menu must still receive Escape/P so the menu can close.
- Resuming calls `loop()` directly with a fresh `lastTime`; `closePauseMenu()` blurs the focused button and opens a 150 ms grace window plus ignores auto-repeat of keys held while the menu was open.

### Rendering and theming

The canvas is cleared with `clearRect` each frame, so the board background comes from CSS (`--canvas-bg`), not from JS. Grid lines read the CSS variable `--grid-line` via `getComputedStyle` every frame, so they follow the theme and skin automatically. `drawBlock()` sets `globalAlpha` and delegates to `activeSkin.drawBlock`; skin painters must reset any context state they change (neon resets `shadowBlur`) and be deterministic (pixel art uses a fixed pattern, no `Math.random`). Skin colors are **not** theme-aware; `body.skin-neon` forces a black canvas in both themes. While paused/at game over the RAF loop is stopped, so `applySkin()` redraws manually (board only if `!gameOver`). To add a themed canvas color, define the variable in both `:root` and `body.light-mode` and read it the same way `drawGrid()` does.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` / `PIECES` / every `SKINS[*].colors` (indexed 1–8, must stay aligned), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`). `drawNext()` assumes shapes fit in a 4×4 grid of 30 px cells on the 120×120 preview canvas. Feature constants: `RESUME_GRACE_MS`, `MAX_RECORDS`, `NAME_MAX`.

## GitHub automation

`.github/workflows/` runs `anthropics/claude-code-action`:
- `claude.yml` — responds to `@claude` mentions in issues/PRs.
- `claude-code-review.yml` — automatic code review on every PR.
- `claude-issue-triage.yml` — labels new/edited issues (using `priority:`/`area:`/`type:` prefixes) and posts a technical diagnosis in Spanish. Its prompt hard-codes the file layout (`game.js`, `index.html`, `style.css`); update it if files are added or renamed.

README.md and in-game text are in Spanish; keep new user-facing strings in Spanish.
