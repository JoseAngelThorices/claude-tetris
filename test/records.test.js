'use strict';

/*
 * Tabla de récords local: pantalla de inicio, combo, guardado con nombre,
 * ordenación / recorte a 5, resaltado, estadísticas y borrado en dos pasos.
 *
 * Carga game.js con vm sobre un DOM falso y un reloj virtual.
 * Uso: node test/records.test.js [ruta/a/game.js]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_JS = process.argv[2] || path.join(__dirname, '..', 'game.js');

/* ---- DOM falso genérico ---- */

const stubContext = () => new Proxy({}, { get: () => () => {} });

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : force;
      on ? set.add(c) : set.delete(c);
      return on;
    },
    contains: c => set.has(c),
    toString: () => [...set].join(' '),
  };
}

let activeElement = null;

function makeElement(tagName = 'DIV', id = '') {
  const listeners = {};
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    textContent: '',
    innerHTML: '',
    value: '',
    checked: false,
    width: 300,
    height: 600,
    style: {},
    dataset: {},
    children: [],
    classList: makeClassList(),
    set className(v) { v.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c)); },
    get className() { return el.classList.toString(); },
    getContext: stubContext,
    focus() { activeElement = el; },
    blur() { if (activeElement === el) activeElement = null; },
    appendChild(child) { el.children.push(child); return child; },
    replaceChildren(...kids) { el.children = kids; },
    querySelector: () => makeElement('SPAN'),
    querySelectorAll: () => [],
    contains: other => other === el,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type, props = {}) {
      const ev = { type, target: el, preventDefault() {}, stopPropagation() {}, ...props };
      (listeners[type] || []).forEach(fn => fn(ev));
      if (type === 'click') docListeners.click.forEach(fn => fn(ev));
      if (type === 'keydown') docListeners.keydown.forEach(fn => fn(ev));
      return ev;
    },
  };
  return el;
}

const INPUT_IDS = new Set(['player-name']);
const BUTTON_IDS = new Set(['play-btn', 'restart-btn', 'reset-records-btn', 'save-name-btn', 'theme-toggle']);
const elements = {};
const docListeners = { keydown: [], click: [] };
const body = makeElement('BODY');

const document = {
  body,
  documentElement: makeElement('HTML'),
  get activeElement() { return activeElement || body; },
  getElementById(id) {
    if (!elements[id]) {
      const tag = INPUT_IDS.has(id) ? 'INPUT' : BUTTON_IDS.has(id) ? 'BUTTON' : 'DIV';
      elements[id] = makeElement(tag, id);
    }
    return elements[id];
  },
  createElement: tag => makeElement(tag),
  querySelector: () => makeElement('DIV'),
  querySelectorAll: () => [],
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
};

// Estado inicial del HTML: todo oculto salvo la pantalla de inicio
for (const id of ['overlay', 'pause-menu', 'pause-controls', 'record-message', 'name-form', 'gameover-records'])
  document.getElementById(id).classList.add('hidden');

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

// Reloj virtual y temporizadores manuales
let clock = 0;
let pendingFrame = null;
let frameId = 0;
const timers = new Map();
let timerId = 0;

const sandbox = {
  document,
  window: { matchMedia: () => ({ matches: false }) },
  localStorage,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  performance: { now: () => clock },
  requestAnimationFrame(fn) { pendingFrame = fn; return ++frameId; },
  cancelAnimationFrame(id) { if (id === frameId) pendingFrame = null; },
  setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
  clearTimeout(id) { timers.delete(id); },
  console,
};

// Registro previo (debe sobrevivir a la carga)
store['tetris-records'] = JSON.stringify({
  scores: [
    { name: 'Ana', score: 500, lines: 5, level: 1, date: '2026-01-01' },
    { name: 'Luis', score: 900, lines: 9, level: 1, date: '2026-01-01' },
    { name: 'Eva', score: 300, lines: 3, level: 1, date: '2026-01-01' },
    { name: 'Max', score: 700, lines: 7, level: 1, date: '2026-01-01' },
    { name: 'Sol', score: 100, lines: 1, level: 1, date: '2026-01-01' },
  ],
  bestCombo: 2,
  maxLines: 9,
});
store['tetris-player-name'] = 'Pepe';

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(GAME_JS, 'utf8'), sandbox, { filename: GAME_JS });

const run = expr => vm.runInContext(expr, sandbox);
const $ = id => elements[id];
const hidden = id => $(id).classList.contains('hidden');
const records = () => JSON.parse(store['tetris-records']);
const key = (code, target = body) => {
  const ev = { code, key: code, target, repeat: false, preventDefault() {}, stopPropagation() {} };
  docListeners.keydown.forEach(fn => fn(ev));
};
const click = id => $(id).fire('click');
// Filas de la tabla renderizada en un contenedor (sin la cabecera)
const rows = id => {
  const table = $(id).children.find(c => c.tagName === 'TABLE');
  return table ? table.children.slice(1) : [];
};
const rowText = row => row.children.map(td => td.textContent);
const statsText = id => ($(id).children.find(c => c.classList.contains('records-stats')) || {}).textContent;

function step() {
  clock += 1000;
  const fn = pendingFrame;
  pendingFrame = null;
  if (fn) fn(clock);
}

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FALLO'}  ${message}`);
  if (!ok) failures.push(message);
};
const safely = (fn, message) => {
  try { fn(); check(true, message); } catch (err) { check(false, `${message} (${err.message})`); }
};

// Fuerza el game over con una puntuación dada: tablero casi lleno con un hueco
// en la última columna, para que el bloqueo final no limpie ninguna línea
function forceGameOver(finalScore, finalLines = 0, comboGame = 0) {
  run(`
    score = ${finalScore}; lines = ${finalLines}; bestComboGame = ${comboGame};
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        board[r][c] = c === COLS - 1 ? 0 : 1;
    current.y = 0;
  `);
  let frames = 0;
  while (frames < 200 && !run('gameOver')) { step(); frames++; }
}

/* ---- 1. Pantalla de inicio ---- */

check(!hidden('start-screen'), 'la pantalla de inicio es visible al cargar');
check(run('gameOver') === true, 'antes de jugar se modela como gameOver = true');
check(pendingFrame === null, 'no hay bucle de juego en marcha en la pantalla de inicio');
check(rows('start-records').length === 5, 'la pantalla de inicio muestra el Top 5');
check(rowText(rows('start-records')[0])[1] === 'Luis', 'el Top 5 inicial está ordenado (Luis primero)');
check(/Mejor combo: 2/.test(statsText('start-records')) && /Líneas máx\.: 9/.test(statsText('start-records')),
  'muestra mejor combo y líneas máximas en inicio');

safely(() => ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyP', 'KeyX'].forEach(c => key(c)),
  'las teclas de juego no fallan en la pantalla de inicio');
check(pendingFrame === null && !hidden('start-screen') && hidden('overlay'),
  'las teclas de juego no arrancan ni pausan nada');

key('Enter', $('reset-records-btn'));
check(!hidden('start-screen') && run('gameOver') === true, 'Enter sobre otro botón no arranca la partida');
key('Enter');
check(hidden('start-screen') && run('gameOver') === false, 'Enter arranca la partida desde la pantalla de inicio');

/* ---- 2. Jugar ---- */

click('play-btn');
check(hidden('start-screen'), 'Jugar oculta la pantalla de inicio');
check(run('gameOver') === false && pendingFrame !== null, 'Jugar arranca la partida');

/* ---- 3. Combo ---- */

function lockWithClear(clear) {
  run(`
    board = createBoard();
    if (${clear}) board[ROWS - 1] = new Array(COLS).fill(1);
    current = { type: 2, shape: [[2,2],[2,2]], x: 0, y: 0 };
    lockPiece();
  `);
}
lockWithClear(true);
lockWithClear(true);
lockWithClear(true);
check(run('combo') === 3 && run('bestComboGame') === 3, 'tres bloqueos con línea seguidos dan combo 3');
lockWithClear(false);
check(run('combo') === 0 && run('bestComboGame') === 3, 'un bloqueo sin líneas reinicia el combo pero conserva el mejor');
lockWithClear(true);
check(run('combo') === 1, 'el combo vuelve a contar desde 1');
check(run('clearLines()') === 0, 'clearLines() devuelve las líneas limpiadas');

/* ---- 4. Game over con puntuación que entra en el Top ---- */

forceGameOver(800, 14, 4);
check(run('gameOver') === true, 'se alcanza el game over');
check(!hidden('overlay'), 'el overlay de game over es visible');
check(!hidden('name-form'), 'la puntuación entra en el Top: se pide el nombre');
check(!hidden('record-message'), 'se muestra el mensaje de récord');
check($('player-name').value === 'Pepe', 'el campo se rellena con el último nombre usado');
check(activeElement === $('player-name'), 'el campo de nombre recibe el foco');
check(records().bestCombo === 4, `bestCombo se actualiza a 4 (vale ${records().bestCombo})`);
check(records().maxLines === 14, `maxLines se actualiza a 14 (vale ${records().maxLines})`);

// Escribir en el input no actúa sobre el juego
const input = $('player-name');
const boardBefore = JSON.stringify(run('board'));
safely(() => ['Space', 'KeyP', 'ArrowLeft', 'ArrowDown'].forEach(c => key(c, input)),
  'teclear en el campo de nombre no falla');
check(JSON.stringify(run('board')) === boardBefore && hidden('name-form') === false && run('paused') === false,
  'teclear en el campo de nombre no mueve piezas ni pausa');

input.value = '  <b>Zoe</b>12345  ';
input.fire('keydown', { code: 'Enter', key: 'Enter' });
let saved = records();
check(saved.scores.length === 5, 'el Top se recorta a 5 entradas');
check(saved.scores.map(s => s.score).join(',') === '900,800,700,500,300', `orden descendente (${saved.scores.map(s => s.score)})`);
check(saved.scores[1].name === '<b>Zoe</b>12', `nombre recortado a 12 caracteres (${saved.scores[1].name})`);
check(saved.scores[1].lines === 14 && typeof saved.scores[1].date === 'string', 'la entrada guarda líneas y fecha');
check(hidden('name-form') && !hidden('gameover-records'), 'tras guardar se oculta el formulario y se muestra la tabla');
const goRows = rows('gameover-records');
check(goRows.length === 5 && goRows[1].classList.contains('record-new'), 'la nueva fila se resalta con .record-new');
check(goRows.filter(r => r.classList.contains('record-new')).length === 1, 'solo una fila resaltada');
check(rowText(goRows[1])[1] === '<b>Zoe</b>12', 'el nombre se inserta como texto (sin HTML)');
check(store['tetris-player-name'] === '<b>Zoe</b>12', 'se recuerda el último nombre usado');

// Doble guardado
click('save-name-btn');
input.fire('keydown', { code: 'Enter', key: 'Enter' });
check(records().scores.length === 5 && records().scores.filter(s => s.score === 800).length === 1,
  'no se guarda dos veces');

/* ---- 5. Reiniciar y game over sin entrar en el Top ---- */

click('restart-btn');
check(hidden('overlay') && hidden('gameover-records') && hidden('name-form') && hidden('record-message'),
  'Reiniciar oculta los extras de game over');
check(run('gameOver') === false && run('combo') === 0 && run('bestComboGame') === 0, 'Reiniciar resetea estado y combo');

forceGameOver(50, 2, 1);
check(hidden('name-form') && hidden('record-message'), 'una puntuación que no entra no pide nombre');
check(!hidden('gameover-records') && rows('gameover-records').length === 5, 'muestra la tabla directamente');
check(rows('gameover-records').every(r => !r.classList.contains('record-new')), 'sin filas resaltadas');
check(records().bestCombo === 4 && records().maxLines === 14, 'bestCombo / maxLines no bajan');

// Puntuación 0 con Top incompleto: tampoco pide nombre
click('restart-btn');
store['tetris-records'] = JSON.stringify({ scores: [], bestCombo: 0, maxLines: 0 });
forceGameOver(0, 0, 0);
check(hidden('name-form'), 'una puntuación de 0 no entra en el Top');

// Nombre vacío -> Anónimo y primer récord
click('restart-btn');
forceGameOver(120, 1, 1);
check(!hidden('name-form') && $('record-message').textContent === '¡Nuevo récord!', 'Top vacío: ¡Nuevo récord!');
input.value = '   ';
click('save-name-btn');
check(records().scores.length === 1 && records().scores[0].name === 'Anónimo', 'nombre vacío se guarda como Anónimo');

// Reiniciar sin pulsar Guardar no pierde el récord
click('restart-btn');
forceGameOver(200, 2, 1);
input.value = 'Rápido';
click('restart-btn');
check(records().scores.length === 2 && records().scores[0].name === 'Rápido', 'Reiniciar sin guardar conserva el récord');
check(hidden('gameover-records') && hidden('overlay'), 'tras el guardado implícito el overlay queda oculto');

/* ---- 6. Datos corruptos ---- */

store['tetris-records'] = '{no json';
check(run('loadRecords().scores.length') === 0, 'JSON corrupto -> registros por defecto');
store['tetris-records'] = JSON.stringify({ scores: 'x', bestCombo: -3, maxLines: 'a' });
check(run('JSON.stringify(loadRecords())') === JSON.stringify({ scores: [], bestCombo: 0, maxLines: 0 }),
  'forma inválida -> valores saneados');

/* ---- 7. Borrado en dos pasos ---- */

store['tetris-records'] = JSON.stringify({
  scores: [{ name: 'Ana', score: 500, lines: 5, level: 1, date: '' }], bestCombo: 3, maxLines: 5,
});
click('reset-records-btn');
check($('reset-records-btn').textContent === '¿Seguro?', 'primer clic pide confirmación');
check(records().scores.length === 1, 'el primer clic no borra');
click('play-btn'); // clic en otro sitio
check($('reset-records-btn').textContent === 'Borrar récords', 'clic en otro sitio cancela la confirmación');
click('restart-btn');
click('reset-records-btn');
[...timers.values()].forEach(fn => fn());
check($('reset-records-btn').textContent === 'Borrar récords', 'la confirmación caduca con el temporizador');
click('reset-records-btn');
click('reset-records-btn');
const cleared = records();
check(cleared.scores.length === 0 && cleared.bestCombo === 0 && cleared.maxLines === 0, 'el segundo clic borra los récords');

console.log(failures.length ? `\n${failures.length} comprobación(es) fallida(s)` : '\nTodo correcto');
process.exit(failures.length ? 1 : 0);
