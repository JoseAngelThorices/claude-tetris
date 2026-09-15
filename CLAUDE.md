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

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`), and a shared overlay `#overlay` used for START, PAUSE and GAME OVER (`data-mode="start|pause|gameover"`). Overlay contents: `#overlay-title`, `#overlay-score`, `#overlay-msgs` (record messages), `#name-form`/`#name-input`/`#save-btn`, `#records-section` (`#records-body` table, `#best-combo`, `#max-lines`, `#reset-records-btn`, `#reset-confirm` with `#reset-yes-btn`/`#reset-no-btn`) and `#restart-btn` (Jugar/Reiniciar).
- **`style.css`** — Dark/retro arcade theme; uses CSS variables (incl. `--accent`, `--danger`, `--highlight-text`, `--highlight-bg`, `--input-bg`, redefined in `body.light-mode`), flexbox, and `backdrop-filter` on overlays. Visibility of overlay sub-elements uses the `hidden` attribute (`[hidden]{display:none!important}`); the overlay itself uses `.overlay.hidden`.
- **`game.js`** — All game logic (~670 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–7` = piece color index |
| Piece representation | `{ type, shape, x, y }` where `shape` is a 2-D matrix |
| Rotation | `rotateCW(shape)` — transpose + reverse; `tryRotate()` applies wall kicks `[0,±1,±2]` |
| Collision | `collide(shape, ox, oy)` — checks bounds and board occupancy |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` tracks elapsed ms against `dropInterval` |
| Line clear | `clearLines()` — iterates board bottom-up, splices full rows, prepends empty row; returns number of lines cleared |
| Combo | `combo`, `maxCombo` — updated in `lockPiece()` (see definition below) |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `dropInterval = max(100, 1000 − (level−1) × 90)` ms; level = `floor(lines/10) + 1` |
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| State flags | `started` (false on start screen), `paused`, `gameOver`, `animId` (RAF handle), `lastGame` (`{ entry, saved, newBestCombo, newMaxLines }` for the finished game) |
| Overlay | `showOverlay(mode)` (`'start'`/`'pause'`/`'gameover'`), `hideOverlay()` |
| Records storage | `RECORDS_KEY` (`'tetris-records'`), `LAST_NAME_KEY` (`'tetris-last-name'`), `TOP_SIZE` (5), `NAME_MAX` (12), `DEFAULT_NAME`; `loadRecords()` (try/catch + shape validation via `sanitizeEntry()`, falls back to `emptyRecords()`), `saveRecords()`, `clearRecords()`, `loadLastName()`, `saveLastName()`, `cleanName()` |
| Records logic | `qualifiesForTop(score, top)`, `insertEntry(top, entry)` (non-mutating, returns `{ top, index }`), `saveCurrentRecord()`, `resetRecords()` |
| Records UI | `renderRecords(records, highlightIndex)` (DOM built with `textContent` only — never `innerHTML` with user data), `setMessages(msgs)`, `refreshRecordsView()` (table + messages + name form for the current overlay mode) |

### Game flow

Page load → `showStartScreen()` (empty board, no RAF loop, overlay in `start` mode with the records table). "Jugar" button or Enter → `init()` → `resetState()` + `spawn()` → `requestAnimationFrame(loop)`. `init()` always cancels the previous RAF and blurs the focused element, so restarting never duplicates the loop. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + combo update + `spawn()`. If `spawn()` immediately collides → `endGame()`.

Keyboard: while an `<input>` has focus the global `keydown` handler ignores every key. Outside a game (start screen / game over) only Enter is handled: it starts a game, or focuses `#name-input` if a record is still pending to be saved.

### Records (localStorage)

Stored under `tetris-records` as `{ top: [{ name, score, lines, level, combo, date }], bestCombo, maxLines }`; last used name under `tetris-last-name`. If storage is missing, corrupt or throws, the game runs without records.

- **Combo**: number of consecutive locked pieces that clear at least one line. It resets to 0 when a piece locks without clearing. `maxCombo` is the highest combo in the current game.
- **Líneas máximas**: highest total `lines` reached in a single game.
- `bestCombo` and `maxLines` are all-time records independent of the top 5; `endGame()` saves them whenever they are beaten.
- **Top 5**: a game qualifies when `score > 0` and (fewer than 5 entries or `score` > 5th score). On game over a qualifying score shows `#name-form` (default = last used name or `"Jugador"`, trimmed, max 12 chars) and a highlighted preview row; submitting saves it and keeps the row highlighted. Ties go below existing entries.
- "Resetear records" asks for confirmation inside the overlay, removes `tetris-records` (keeps last name) and refreshes the visible table.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array indexed 1–7), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
