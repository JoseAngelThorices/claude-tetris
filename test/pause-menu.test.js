'use strict';

/*
 * Menú de pausa: apertura con P/Escape, bloqueo de inputs, reanudar con
 * periodo de gracia, reiniciar sin duplicar el bucle y nivel inicial
 * persistido en localStorage.
 *
 * Uso: node test/pause-menu.test.js [ruta/a/game.js]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_JS = process.argv[2] || path.join(__dirname, '..', 'game.js');
const SOURCE = fs.readFileSync(GAME_JS, 'utf8');

// Elementos que en index.html arrancan con la clase "hidden"
const INITIALLY_HIDDEN = ['overlay', 'pause-menu', 'pause-controls'];

/* ---- Entorno falso: DOM genérico + reloj virtual ---- */

function createEnv(initialStorage = {}) {
  const env = { clock: 0, frames: new Map(), frameId: 0 };

  const stubContext = () => new Proxy({}, {
    get: () => () => {},
    set: () => true,
  });

  let document;

  function createStub(id) {
    const classes = new Set(INITIALLY_HIDDEN.includes(id) ? ['hidden'] : []);
    const listeners = {};
    const attrs = {};
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      checked: false,
      style: {},
      dataset: {},
      width: 300,
      height: 600,
      children: [],
      parent: null,
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        contains: c => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      getContext: stubContext,
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: k => (k in attrs ? attrs[k] : null),
      removeAttribute: k => { delete attrs[k]; },
      focus() { document.activeElement = el; },
      blur() { if (document.activeElement === el) document.activeElement = null; },
      appendChild(child) { child.parent = el; el.children.push(child); return child; },
      contains(node) {
        for (let n = node; n; n = n.parent) if (n === el) return true;
        return false;
      },
      querySelector: sel => createStub(sel),
      querySelectorAll: () => [],
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener() {},
      fire(type, extra = {}) {
        (listeners[type] || []).forEach(fn => fn({ type, target: el, preventDefault() {}, ...extra }));
      },
    };
    return el;
  }

  const elements = {};
  const docListeners = {};
  document = {
    activeElement: null,
    body: createStub('body'),
    documentElement: createStub('html'),
    getElementById: id => (elements[id] ||= createStub(id)),
    querySelector: sel => createStub(sel),
    querySelectorAll: () => [],
    createElement: tag => createStub(tag),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener() {},
  };

  // Los botones y el selector del menú cuelgan de #pause-menu
  const pauseMenu = document.getElementById('pause-menu');
  ['resume-btn', 'pause-restart-btn', 'controls-btn', 'pause-controls', 'start-level']
    .forEach(id => pauseMenu.appendChild(document.getElementById(id)));

  const store = { ...initialStorage };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };

  const sandbox = {
    document,
    window: { matchMedia: () => ({ matches: false }) },
    matchMedia: () => ({ matches: false }),
    localStorage,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => env.clock },
    requestAnimationFrame(fn) { env.frames.set(++env.frameId, fn); return env.frameId; },
    cancelAnimationFrame(id) { env.frames.delete(id); },
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: GAME_JS });

  env.store = store;
  env.el = id => document.getElementById(id);
  env.document = document;
  env.read = expr => vm.runInContext(expr, sandbox);
  env.run = code => vm.runInContext(code, sandbox);

  env.key = (code, opts = {}) => {
    const ev = {
      code,
      key: code,
      repeat: false,
      target: document.body,
      defaultPrevented: false,
      preventDefault() { ev.defaultPrevented = true; },
      ...opts,
    };
    (docListeners.keydown || []).forEach(fn => fn(ev));
    return ev;
  };

  // Avanza el reloj y ejecuta los frames pendientes
  env.advance = ms => {
    env.clock += ms;
    const pending = [...env.frames.values()];
    env.frames.clear();
    pending.forEach(fn => fn(env.clock));
  };

  env.menuOpen = () => !env.el('pause-menu').classList.contains('hidden');
  env.piece = () => env.read('JSON.stringify({ x: current.x, y: current.y, shape: current.shape })');

  return env;
}

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FALLO'}  ${message}`);
  if (!ok) failures.push(message);
};

/* ---- 1. Abrir el menú y bloquear inputs ---- */
{
  const env = createEnv();
  env.advance(16);

  check(!env.menuOpen() && env.read('paused') === false, 'arranca jugando con el menú oculto');
  check(env.el('start-level').value === '1', 'el selector arranca en el nivel 1 por defecto');

  env.key('Escape');
  check(env.menuOpen(), 'Escape abre el menú de pausa');
  check(env.read('paused') === true, 'Escape pone paused = true');
  check(env.frames.size === 0, 'al pausar no queda ningún frame programado');
  check(env.el('overlay').classList.contains('hidden'), 'el overlay compartido no se usa para la pausa');

  const before = env.piece();
  const left = env.key('ArrowLeft');
  const space = env.key('Space');
  env.key('ArrowDown');
  env.key('ArrowUp');
  check(env.piece() === before, 'flechas y Espacio no mueven la pieza con el menú abierto');
  check(left.defaultPrevented && space.defaultPrevented, 'flechas y Espacio hacen preventDefault con el menú abierto');

  const onSelect = env.key('ArrowDown', { target: env.el('start-level') });
  check(!onSelect.defaultPrevented, 'las flechas siguen funcionando sobre el selector del menú');

  env.key('Escape');
  check(!env.menuOpen() && env.read('paused') === false, 'Escape vuelve a cerrar el menú');

  env.advance(200);
  env.key('KeyP');
  check(env.menuOpen() && env.read('paused') === true, 'P también abre el menú');

  env.el('controls-btn').fire('click');
  check(!env.el('pause-controls').classList.contains('hidden'), 'Ver controles muestra la lista de teclas');
  check(env.el('controls-btn').getAttribute('aria-expanded') === 'true', 'Ver controles actualiza aria-expanded');
  env.el('controls-btn').fire('click');
  check(env.el('pause-controls').classList.contains('hidden'), 'Ver controles vuelve a ocultar la lista');

  /* ---- 2. Reanudar con periodo de gracia ---- */
  env.el('resume-btn').focus();
  env.el('resume-btn').fire('click');
  check(!env.menuOpen() && env.read('paused') === false, 'Reanudar cierra el menú y quita la pausa');
  check(env.frames.size === 1, `Reanudar vuelve a programar exactamente un frame (hay ${env.frames.size})`);
  check(env.document.activeElement === null, 'Reanudar quita el foco del botón');

  env.advance(50);
  const x0 = env.read('current.x');
  const inGrace = env.piece();
  const graceSpace = env.key('Space');
  env.key('ArrowDown');
  env.key('ArrowDown', { repeat: true });
  check(env.piece() === inGrace, 'las teclas dentro del periodo de gracia se ignoran');
  check(graceSpace.defaultPrevented, 'Espacio en el periodo de gracia no hace scroll');

  env.advance(200);
  env.key('ArrowLeft', { repeat: true });
  check(env.read('current.x') === x0, 'la autorrepetición de una tecla mantenida desde el menú se ignora');

  const y0 = env.read('current.y');
  env.key('ArrowDown', { repeat: true });
  check(env.read('current.y') === y0 + 1, 'una tecla pulsada durante la gracia y mantenida funciona al acabar la gracia');

  env.key('ArrowLeft');
  check(env.read('current.x') === x0 - 1, 'pasada la gracia, una pulsación nueva mueve la pieza');
  env.key('ArrowLeft', { repeat: true });
  check(env.read('current.x') === x0 - 2, 'tras una pulsación nueva la autorrepetición vuelve a funcionar');

  env.key('Escape');
  env.key('Escape', { repeat: true });
  env.key('Escape', { repeat: true });
  check(env.menuOpen() && env.read('paused') === true, 'mantener Escape pulsado no hace parpadear el menú');
  env.key('Escape');
  env.advance(200);

  /* ---- 3. Nivel inicial + Reiniciar ---- */
  env.key('Escape');
  env.el('start-level').value = '5';
  env.el('start-level').fire('change');
  check(env.store['tetris-start-level'] === '5', 'el nivel inicial se guarda en localStorage');
  check(env.read('level') === 1, 'cambiar el nivel inicial no altera la partida en curso');

  env.el('pause-restart-btn').fire('click');
  check(!env.menuOpen() && env.read('paused') === false, 'Reiniciar cierra el menú y quita la pausa');
  check(env.read('level') === 5, `Reiniciar arranca en el nivel 5 (vale ${env.read('level')})`);
  check(env.read('dropInterval') === 640, `dropInterval = 640 ms en nivel 5 (vale ${env.read('dropInterval')})`);
  check(env.read('score') === 0 && env.read('lines') === 0, 'Reiniciar empieza una partida nueva');
  check(env.frames.size === 1, `Reiniciar no duplica el bucle (frames pendientes: ${env.frames.size})`);
  env.advance(16);
  check(env.frames.size === 1, 'tras un frame sigue habiendo un único bucle');

  // Cambiar el selector a mitad de partida no altera la progresión actual
  env.el('start-level').value = '2';
  env.el('start-level').fire('change');
  env.run('lines = 9; board[ROWS - 1].fill(1); clearLines();');
  check(env.read('level') === 6, `la progresión usa el nivel inicial de la partida (5 + 1 = ${env.read('level')})`);

  env.el('start-level').value = 'abc';
  env.el('start-level').fire('change');
  check(env.store['tetris-start-level'] === '2' && env.el('start-level').value === '2',
    'un valor inválido en el selector se descarta');

  /* ---- 4. Sin pausa tras el game over ---- */
  env.run('endGame();');
  check(env.read('gameOver') === true, 'se alcanza el game over');
  env.key('Escape');
  env.key('KeyP');
  check(!env.menuOpen() && env.read('paused') === false, 'P y Escape no hacen nada tras el game over');
  check(env.frames.size === 0, 'tras el game over no se reprograma el bucle');
}

/* ---- 5. Carga desde localStorage ---- */
{
  const env = createEnv({ 'tetris-start-level': '7' });
  check(env.el('start-level').value === '7', 'el selector se inicializa con el nivel guardado');
  check(env.read('level') === 7 && env.read('dropInterval') === 460, 'la partida arranca en el nivel guardado');
}
for (const bad of ['42', '0', '3.5', 'hola', '']) {
  const env = createEnv({ 'tetris-start-level': bad });
  check(env.read('level') === 1 && env.el('start-level').value === '1',
    `un nivel guardado inválido (${JSON.stringify(bad)}) cae al nivel 1`);
}

console.log(failures.length
  ? `\n${failures.length} comprobación(es) fallida(s)`
  : '\nTodo correcto: el menú de pausa funciona');

process.exit(failures.length ? 1 : 0);
