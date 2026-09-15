'use strict';

/*
 * Skins visuales: cada skin dibuja sin errores, neon limpia el shadowBlur,
 * retro conserva el dibujo original, pixel art es determinista, y la
 * preferencia se guarda en localStorage y se aplica sin recargar.
 *
 * Uso: node test/skins.test.js [ruta/a/game.js]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_JS = process.argv[2] || path.join(__dirname, '..', 'game.js');
const SOURCE = fs.readFileSync(GAME_JS, 'utf8');

/* ---- Contexto de canvas que registra asignaciones y llamadas ---- */

function recordingContext() {
  const state = { ops: [], props: {} };
  const ctx = new Proxy(state.props, {
    get(target, prop) {
      if (prop === '__ops') return state.ops;
      if (prop === '__props') return target;
      if (prop in target) return target[prop];
      return (...args) => { state.ops.push(['call', prop, ...args]); };
    },
    set(target, prop, value) {
      state.ops.push(['set', prop, value]);
      target[prop] = value;
      return true;
    },
  });
  return ctx;
}

/* ---- DOM falso genérico ---- */

function createClassList() {
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
    get size() { return set.size; },
    values: () => [...set],
  };
}

function createGame(storage) {
  const elements = {};
  const docListeners = {};
  let clock = 0;
  let pendingFrame = null;
  let frameId = 0;

  const document = {
    activeElement: null,
    documentElement: { dataset: {} },
    getElementById: id => (elements[id] ||= createElement(id)),
    querySelector: sel => createElement(sel),
    querySelectorAll: () => [],
    createElement: tag => createElement(tag),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener() {},
  };

  function createElement(id) {
    const listeners = {};
    let context = null;
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      checked: false,
      disabled: false,
      dataset: {},
      style: {},
      width: id === 'next-canvas' ? 120 : 300,
      height: id === 'next-canvas' ? 120 : 600,
      classList: createClassList(),
      listeners,
      getContext: () => (context ||= recordingContext()),
      querySelector: sel => createElement(sel),
      querySelectorAll: () => [],
      appendChild: child => child,
      setAttribute() {},
      removeAttribute() {},
      focus() { document.activeElement = el; },
      blur() { if (document.activeElement === el) document.activeElement = null; el.blurred = true; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener() {},
      fire(type, extra = {}) {
        const ev = { type, target: el, preventDefault() {}, stopPropagation() {}, ...extra };
        (listeners[type] || []).forEach(fn => fn(ev));
      },
    };
    return el;
  }

  document.body = createElement('body');

  const sandbox = {
    document,
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    matchMedia: () => ({ matches: false }),
    localStorage: storage,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => clock },
    requestAnimationFrame(fn) { pendingFrame = fn; return ++frameId; },
    cancelAnimationFrame(id) { if (id === frameId) pendingFrame = null; },
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: GAME_JS });

  return {
    sandbox,
    document,
    el: id => document.getElementById(id),
    run: expr => vm.runInContext(expr, sandbox),
    pendingFrame: () => pendingFrame,
    step() {
      clock += 16;
      const fn = pendingFrame;
      pendingFrame = null;
      if (fn) fn(clock);
    },
    keydown(code, target = document.body, onPrevent = () => {}) {
      const ev = { code, target, preventDefault: onPrevent };
      (docListeners.keydown || []).forEach(fn => fn(ev));
    },
  };
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}

/* ---- Utilidades ---- */

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FALLO'}  ${message}`);
  if (!ok) failures.push(message);
};

const ctxOf = (game, id) => game.el(id).getContext('2d');
const clearOps = game => {
  ctxOf(game, 'board').__ops.length = 0;
  ctxOf(game, 'next-canvas').__ops.length = 0;
};
const chooseSkin = (game, name) => {
  const select = game.el('skin-select');
  select.focus();
  select.value = name;
  select.fire('change');
};

// Tablero con todos los tipos de pieza 1–8 (columna 0 libre: sin líneas completas)
const FILL_BOARD = `
  for (let r = ROWS - 8; r < ROWS; r++)
    for (let c = 1; c < COLS; c++)
      board[r][c] = ((r + c) % 8) + 1;
`;
const setPieces = type => `
  current = { type: ${type}, shape: PIECES[${type}].map(row => [...row]), x: 3, y: 0 };
  next = { type: ${type}, shape: PIECES[${type}].map(row => [...row]), x: 3, y: 0 };
`;

const ORIGINAL_COLORS = [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#9e9e9e'];
const SKIN_NAMES = ['retro', 'neon', 'pastel', 'pixel'];

/* ---- 1. Carga inicial sin preferencia ---- */

{
  const storage = memoryStorage();
  const game = createGame(storage);
  check(game.run('activeSkin === SKINS.retro'), 'sin preferencia guardada se usa retro');
  check(game.document.body.classList.contains('skin-retro'), 'body tiene la clase skin-retro');
  check(game.el('skin-select').value === 'retro', 'el selector muestra retro');
  check(game.run('Object.keys(SKINS).join()') === SKIN_NAMES.join(), 'existen los skins retro, neon, pastel y pixel');
  for (const name of SKIN_NAMES) {
    const colors = game.run(`SKINS.${name}.colors`);
    check(colors.length === 9 && colors.slice(1).every(c => typeof c === 'string' && c),
      `${name}: paleta con 8 colores alineados con PIECES (incluye la tuerca)`);
  }

  /* ---- 2. Retro conserva colores y dibujo originales ---- */
  check(JSON.stringify(game.run('SKINS.retro.colors')) === JSON.stringify(ORIGINAL_COLORS), 'retro usa los colores originales');
  const boardCtx = ctxOf(game, 'board');
  clearOps(game);
  game.run('drawBlock(ctx, 2, 3, 5, BLOCK)');
  const expected = [
    ['set', 'globalAlpha', 1],
    ['set', 'fillStyle', '#e57373'],
    ['call', 'fillRect', 61, 91, 28, 28],
    ['set', 'fillStyle', 'rgba(255,255,255,0.12)'],
    ['call', 'fillRect', 61, 91, 28, 4],
    ['set', 'globalAlpha', 1],
  ];
  check(JSON.stringify(boardCtx.__ops) === JSON.stringify(expected), 'retro dibuja exactamente igual que antes');
  clearOps(game);
  game.run('drawBlock(ctx, 0, 0, 1, BLOCK, 0.2)');
  check(boardCtx.__ops[0][2] === 0.2 && boardCtx.__props.globalAlpha === 1, 'el fantasma usa alpha 0.2 y se restaura a 1');

  /* ---- 3. Todos los skins dibujan todo sin errores ---- */
  game.run(FILL_BOARD);
  for (const name of SKIN_NAMES) {
    let error = null;
    try {
      chooseSkin(game, name);
      for (let type = 1; type <= 8; type++) {
        game.run(setPieces(type));
        clearOps(game);
        game.run('draw(); drawNext();');
        if (!ctxOf(game, 'board').__ops.length || !ctxOf(game, 'next-canvas').__ops.length)
          throw new Error(`sin llamadas de dibujo para el tipo ${type}`);
      }
    } catch (e) { error = e; }
    check(!error, `${name}: tablero, fantasma, pieza y siguiente se dibujan sin errores${error ? ` (${error.message})` : ''}`);
    check(game.run('activeSkin') === game.run(`SKINS.${name}`), `${name}: queda como skin activo`);
  }

  /* ---- 4. Neon: glow con shadowBlur y reseteo ---- */
  chooseSkin(game, 'neon');
  game.run(setPieces(8));
  clearOps(game);
  game.run('draw(); drawNext();');
  for (const id of ['board', 'next-canvas']) {
    const c = ctxOf(game, id);
    const blurs = c.__ops.filter(op => op[0] === 'set' && op[1] === 'shadowBlur').map(op => op[2]);
    check(blurs.some(v => v > 0), `neon (${id}): usa shadowBlur > 0 al dibujar`);
    check(c.__props.shadowBlur === 0, `neon (${id}): shadowBlur queda a 0 al terminar`);
  }
  clearOps(game);
  game.run('drawBlock(ctx, 0, 0, 1, BLOCK, 0.2)');
  const ghostBlur = boardCtx.__ops.find(op => op[1] === 'shadowBlur')[2];
  clearOps(game);
  game.run('drawBlock(ctx, 0, 0, 1, BLOCK)');
  const solidBlur = boardCtx.__ops.find(op => op[1] === 'shadowBlur')[2];
  check(ghostBlur > 0 && ghostBlur < solidBlur, `neon: el glow del fantasma es más suave (${ghostBlur} < ${solidBlur})`);

  /* ---- 5. Pastel: rectángulos redondeados con arcTo ---- */
  chooseSkin(game, 'pastel');
  clearOps(game);
  game.run('drawBlock(ctx, 0, 0, 3, BLOCK)');
  check(boardCtx.__ops.some(op => op[1] === 'arcTo') && !boardCtx.__ops.some(op => op[1] === 'roundRect'),
    'pastel: bordes redondeados con arcTo (sin roundRect)');

  /* ---- 6. Pixel art determinista ---- */
  chooseSkin(game, 'pixel');
  clearOps(game);
  game.run('draw(); drawNext();');
  const frameA = JSON.stringify([ctxOf(game, 'board').__ops, ctxOf(game, 'next-canvas').__ops]);
  clearOps(game);
  game.run('draw(); drawNext();');
  const frameB = JSON.stringify([ctxOf(game, 'board').__ops, ctxOf(game, 'next-canvas').__ops]);
  check(frameA === frameB, 'pixel art: dos frames consecutivos generan las mismas llamadas');

  /* ---- 7. Persistencia, clase del body y foco ---- */
  const select = game.el('skin-select');
  check(storage.data['tetris-skin'] === 'pixel', 'la elección se guarda en localStorage');
  const skinClasses = game.document.body.classList.values().filter(c => c.startsWith('skin-'));
  check(skinClasses.length === 1 && skinClasses[0] === 'skin-pixel', `body solo tiene la clase skin-pixel (${skinClasses})`);
  check(select.blurred && game.document.activeElement !== select, 'el selector pierde el foco tras cambiar');

  /* ---- 8. Teclas de juego con el selector enfocado (cerrado sin cambiar) ---- */
  game.run(setPieces(1));
  const x0 = game.run('current.x');
  select.focus();
  select.blurred = false;
  let prevented = false;
  game.keydown('ArrowLeft', select, () => { prevented = true; });
  check(prevented, 'una flecha sobre el selector no cambia la opción (preventDefault)');
  check(select.blurred && game.document.activeElement !== select, 'una flecha sobre el selector le quita el foco');
  check(game.run('current.x') === x0 - 1, 'la flecha sobre el selector mueve la pieza igualmente');
  check(game.run('activeSkin === SKINS.pixel'), 'la flecha sobre el selector no cambia el skin');
  game.keydown('ArrowLeft');
  check(game.run('current.x') === x0 - 2, 'las flechas fuera del selector siguen moviendo la pieza');

  /* ---- 9. En pausa, cambiar de skin redibuja ---- */
  game.keydown('KeyP');
  check(game.run('paused') && game.pendingFrame() === null, 'el juego queda en pausa con el bucle detenido');
  clearOps(game);
  chooseSkin(game, 'neon');
  check(ctxOf(game, 'board').__ops.length > 0 && ctxOf(game, 'next-canvas').__ops.length > 0,
    'en pausa, cambiar de skin redibuja tablero y siguiente');
  check(game.pendingFrame() === null, 'el redibujado no reanuda el bucle');

  /* ---- 9b. Tras el game over no se pinta la pieza que no cabía ---- */
  game.run('gameOver = true;');
  clearOps(game);
  chooseSkin(game, 'pixel');
  check(ctxOf(game, 'board').__ops.length === 0, 'tras el game over el cambio de skin no redibuja el tablero');
  check(ctxOf(game, 'next-canvas').__ops.length > 0, 'tras el game over el cambio de skin redibuja la siguiente pieza');
  chooseSkin(game, 'neon');
  game.run('gameOver = false;');

  /* ---- 10. Recarga en un contexto nuevo con el mismo localStorage ---- */
  const reloaded = createGame(storage);
  check(reloaded.run('activeSkin === SKINS.neon'), 'al recargar se restaura el skin guardado');
  check(reloaded.el('skin-select').value === 'neon', 'al recargar el selector muestra el skin guardado');
  check(reloaded.document.body.classList.contains('skin-neon'), 'al recargar body tiene la clase skin-neon');
  let loopError = null;
  try { for (let i = 0; i < 5; i++) reloaded.step(); } catch (e) { loopError = e; }
  check(!loopError, `el bucle corre con el skin restaurado${loopError ? ` (${loopError.message})` : ''}`);
}

/* ---- 11. Valores inválidos y localStorage roto ---- */

{
  const game = createGame(memoryStorage({ 'tetris-skin': 'toString' }));
  check(game.run('activeSkin === SKINS.retro'), 'un valor inválido guardado vuelve a retro');
  check(game.el('skin-select').value === 'retro', 'con valor inválido el selector muestra retro');

  let error = null;
  try {
    // El tema lee tetris-theme sin try/catch: solo rompemos la clave de skins
    const broken = {
      getItem(k) { if (k === 'tetris-skin') throw new Error('bloqueado'); return null; },
      setItem(k) { if (k === 'tetris-skin') throw new Error('bloqueado'); },
    };
    const g = createGame(broken);
    chooseSkin(g, 'pastel');
    check(g.run('activeSkin === SKINS.pastel'), 'sin localStorage el cambio de skin sigue funcionando');
  } catch (e) { error = e; }
  check(!error, `localStorage inaccesible no rompe el juego${error ? ` (${error.message})` : ''}`);
}

console.log(failures.length
  ? `\n${failures.length} comprobación(es) fallida(s)`
  : '\nTodo correcto: los skins se dibujan, persisten y se aplican sin recargar');

process.exit(failures.length ? 1 : 0);
