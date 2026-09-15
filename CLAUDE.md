# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly or serve with any static server:

```bash
open index.html                  # macOS direct open
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`), a dedicated pause menu `#pause-menu` (`#resume-btn`, `#pause-restart-btn`, `#controls-btn` + `#pause-controls`, `#start-level-select`), and the `#overlay` used only for GAME OVER (`#restart-btn`).
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays. Pause menu styles: `.pause-box`, `.menu-btn`, `.pause-controls`, `.level-select`, `.menu-hint`.
- **`game.js`** — All game logic (~475 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–7` = piece color index |
| Piece representation | `{ type, shape, x, y }` where `shape` is a 2-D matrix |
| Rotation | `rotateCW(shape)` — transpose + reverse; `tryRotate()` applies wall kicks `[0,±1,±2]` |
| Collision | `collide(shape, ox, oy)` — checks bounds and board occupancy |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` tracks elapsed ms against `dropInterval` |
| Line clear | `clearLines()` — iterates board bottom-up, splices full rows, prepends empty row |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `intervalForLevel(lv)` = `max(100, 1000 − (lv−1) × 90)` ms; `computeLevel()` = `max(startLevel, floor(lines/10) + 1)` |
| Starting level | `startLevel` (1–`MAX_START_LEVEL`=15), set via `setStartLevel()` from `#start-level-select`, persisted in `localStorage['tetris-start-level']`; applied on next `init()` |
| Pause menu | `P`/`Escape` → `togglePause()` → `pauseGame()` / `resumeGame()`; `restartGame()`; `openPauseMenu()` / `closePauseMenu()`; `handleMenuKey(e)` (↑/↓/Tab focus cycling, ←/→ change level) |
| Input lock | While `paused`, game keys never reach the game. `heldKeys` / `suppressedKeys`: keys still held when the menu closes are ignored until `keyup`, so Enter/Space/arrows used in the menu don't leak into gameplay |
| State flags | `paused`, `gameOver`, `animId` (RAF handle; always cancelled before requesting a new one) |

### Game flow

`init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()`. Resuming resets `lastTime` to `performance.now()` (and `loop` clamps `dt ≥ 0`) so there is no drop jump after a pause.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array indexed 1–7), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
