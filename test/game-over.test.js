'use strict';

/*
 * Regresión: al terminar la partida el bucle debe detenerse.
 *
 * loop() reprogramaba un frame con requestAnimationFrame incluso cuando
 * lockPiece() acababa de disparar el game over, así que el juego seguía
 * corriendo y las piezas se apilaban bajo el overlay.
 *
 * Uso: node test/game-over.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_JS = process.argv[2] || path.join(__dirname, '..', 'game.js');

/* ---- DOM falso: solo lo que game.js llega a tocar ---- */

const stubContext = () => new Proxy({}, { get: () => () => {} });

const createElement = id => ({
  id,
  textContent: '',
  checked: false,
  dataset: {},
  width: 300,
  height: 600,
  getContext: stubContext,
  classList: { add() {}, remove() {} },
  addEventListener() {},
});

const elements = {};
const document = {
  documentElement: { dataset: {} },
  getElementById: id => (elements[id] ||= createElement(id)),
  addEventListener() {},
};

// Reloj virtual: el bucle solo avanza cuando el test llama a step().
let clock = 0;
let pendingFrame = null;
let frameId = 0;

const sandbox = {
  document,
  window: { matchMedia: () => ({ matches: false }) },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {} },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  performance: { now: () => clock },
  requestAnimationFrame(fn) { pendingFrame = fn; return ++frameId; },
  cancelAnimationFrame(id) { if (id === frameId) pendingFrame = null; },
  console,
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(GAME_JS, 'utf8'), sandbox, { filename: GAME_JS });

const read = expr => vm.runInContext(expr, sandbox);

// Un frame cada segundo: siempre supera dropInterval, así cada paso baja una fila.
function step() {
  clock += 1000;
  const fn = pendingFrame;
  pendingFrame = null;
  if (fn) fn(clock);
}

/* ---- Escenario ---- */

// Tablero lleno salvo la fila inferior: el siguiente bloqueo desborda por
// arriba y la pieza que entra ya no cabe.
vm.runInContext(`
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      board[r][c] = r === ROWS - 1 ? 0 : 1;
  current.y = 0;
`, sandbox);

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FALLO'}  ${message}`);
  if (!ok) failures.push(message);
};

let frames = 0;
while (frames < 200 && !read('gameOver')) { step(); frames++; }

check(read('gameOver'), `se alcanza el game over (tras ${frames} frames)`);
if (!read('gameOver')) process.exit(1);

check(pendingFrame === null, 'no queda ningún frame programado');
check(read('animId') === null, `animId queda a null (vale ${read('animId')})`);

const occupiedCells = () => read('board').flat().filter(Boolean).length;
const before = occupiedCells();
for (let i = 0; i < 60; i++) step();
const after = occupiedCells();

check(before === after, `el tablero no cambia tras el game over (${before} -> ${after} celdas)`);

console.log(failures.length
  ? `\n${failures.length} comprobación(es) fallida(s): el juego sigue corriendo`
  : '\nTodo correcto: el bucle queda detenido y no aparecen más piezas');

process.exit(failures.length ? 1 : 0);
