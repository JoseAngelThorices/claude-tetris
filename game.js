'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 15;
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX'];

// ---------------------------------------------------------------------------
// Skins: controlan TODO lo que se pinta en los canvas (tablero, ghost, pieza
// actual y preview). El tema claro/oscuro (body.light-mode) controla la UI.
// Una skin con boardBg/gridColor/accent = null hereda los valores del tema
// (así Retro se ve exactamente como el estilo original en ambos modos).
// ---------------------------------------------------------------------------

const SKIN_STORAGE_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';

// Utilidades de color / dibujo compartidas por las skins
const shadeCache = new Map();
function shade(hex, amount) {
  // amount > 0 aclara hacia blanco, amount < 0 oscurece hacia negro
  const key = hex + '|' + amount;
  let out = shadeCache.get(key);
  if (out) return out;
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const ch = v => Math.round(v + (target - v) * t);
  out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, r);
    return;
  }
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// Sprites pre-renderizados en canvas offscreen, cacheados por clave
// (skin|color|tamaño). Evita shadowBlur / texturas por bloque en cada frame.
const spriteCache = new Map();
function getSprite(key, w, h, render) {
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = w;
    sprite.height = h;
    render(sprite.getContext('2d'));
    spriteCache.set(key, sprite);
  }
  return sprite;
}

const neonPad = size => Math.ceil(size * 0.5);

function neonSprite(color, size) {
  const pad = neonPad(size);
  return getSprite(`neon|${color}|${size}`, size + pad * 2, size + pad * 2, g => {
    const x = pad + 2, y = pad + 2, w = size - 4;
    g.shadowColor = color;
    g.shadowBlur = size * 0.5;
    g.fillStyle = withAlpha(color, 0.22);
    g.fillRect(x, y, w, w);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, w - 2);
    g.strokeRect(x + 1, y + 1, w - 2, w - 2); // segunda pasada: glow más intenso
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.strokeRect(x + 3.5, y + 3.5, w - 7, w - 7);
  });
}

// 10×10 "píxeles": o = contorno oscuro, l = luz (arriba/izq), w = brillo,
// b = color base, d = sombra (abajo/der + tramado interior)
const PIXEL_PATTERN = [
  'oooooooooo',
  'ollllllldo',
  'olwwbbbbdo',
  'olwbbbbbdo',
  'olbbbbbbdo',
  'olbbbbbbdo',
  'olbbbbdbdo',
  'olbbbdbddo',
  'oldddddddo',
  'oooooooooo',
];

function pixelSprite(color, size) {
  return getSprite(`pixel|${color}|${size}`, size, size, g => {
    const p = Math.max(1, Math.floor(size / PIXEL_PATTERN.length));
    const off = Math.floor((size - p * PIXEL_PATTERN.length) / 2);
    const palette = {
      o: shade(color, -0.6),
      l: shade(color, 0.45),
      w: shade(color, 0.85),
      b: color,
      d: shade(color, -0.3),
    };
    PIXEL_PATTERN.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        g.fillStyle = palette[row[c]];
        g.fillRect(off + c * p, off + r * p, p, p);
      }
    });
  });
}

const SKINS = {
  retro: {
    name: 'Retro',
    // colores indexados 1–8 (índice 0 = vacío)
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#9e9e9e'],
    boardBg: null,   // null → var(--canvas-bg) del tema claro/oscuro
    gridColor: null, // null → var(--grid-line) del tema claro/oscuro
    accent: null,    // null → borde por defecto del tema
    ghostAlpha: 0.2,
    drawBlock(c, x, y, size, color, alpha) {
      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.fillRect(x + 1, y + 1, size - 2, size - 2);
      c.fillStyle = 'rgba(255,255,255,0.12)'; // highlight
      c.fillRect(x + 1, y + 1, size - 2, 4);
      c.restore();
    },
  },

  neon: {
    name: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff073a', '#2f6bff', '#ff8c00', '#e0e0ff'],
    boardBg: '#000000',
    gridColor: '#0c1424',
    accent: '#00f0ff',
    ghostAlpha: 0.3,
    drawBlock(c, x, y, size, color, alpha) {
      const pad = neonPad(size);
      c.save();
      c.globalAlpha = alpha;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(neonSprite(color, size), x - pad, y - pad);
      c.restore();
    },
  },

  pastel: {
    name: 'Pastel',
    colors: [null, '#9ad9ea', '#f9e09a', '#cfb0ee', '#b2e3b8', '#f5b0b0', '#b0c8f2', '#f8c9a0', '#cfc9d6'],
    boardBg: '#35304a',
    gridColor: '#403a58',
    accent: '#cfb0ee',
    ghostAlpha: 0.28,
    drawBlock(c, x, y, size, color, alpha) {
      const m = Math.max(1, Math.round(size * 0.07));
      const w = size - m * 2;
      const r = Math.round(size * 0.22);
      c.save();
      c.globalAlpha = alpha;
      c.beginPath();
      roundRectPath(c, x + m, y + m, w, w, r);
      c.fillStyle = color;
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = shade(color, -0.2);
      c.stroke();
      c.beginPath();
      roundRectPath(c, x + m + 3, y + m + 3, w - 6, Math.round(w * 0.28), r / 2);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fill();
      c.restore();
    },
  },

  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#f83800', '#0078f8', '#fc9838', '#bcbcbc'],
    boardBg: '#1c1a2b',
    gridColor: '#27243c',
    accent: '#f8b800',
    ghostAlpha: 0.3,
    drawBlock(c, x, y, size, color, alpha) {
      c.save();
      c.globalAlpha = alpha;
      c.drawImage(pixelSprite(color, size), x, y);
      c.restore();
    },
  },
};

let currentSkinId = DEFAULT_SKIN;
let currentSkin = SKINS[DEFAULT_SKIN];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinPicker = document.getElementById('skin-picker');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let themeGridColor = '#22222e'; // se sincroniza con var(--grid-line) en applyTheme()
let startLevel = 1;
const heldKeys = new Set();       // teclas actualmente pulsadas
const suppressedKeys = new Set(); // teclas ignoradas hasta su keyup (pulsadas con el menú abierto)

function computeLevel() {
  return Math.max(startLevel, Math.floor(lines / 10) + 1);
}

function intervalForLevel(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = computeLevel();
    dropInterval = intervalForLevel(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Dibuja la celda (col,row) de una rejilla de `size` px con la skin activa.
function drawCell(context, col, row, colorIndex, size, alpha) {
  if (!colorIndex) return;
  currentSkin.drawBlock(context, col * size, row * size, size, currentSkin.colors[colorIndex], alpha ?? 1);
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.gridColor || themeGridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawCell(ctx, c, r, board[r][c], BLOCK);

  // En game over la última pieza ya está fusionada en el tablero; la pieza
  // recién generada (que colisiona) no se pinta.
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawCell(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, currentSkin.ghostAlpha);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawCell(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawCell(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// Repinta ambos canvas al instante (útil en pausa / game over, sin loop activo).
function repaint() {
  if (!current || !next) return;
  draw();
  drawNext();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function menuFocusables() {
  return Array.from(pauseMenu.querySelectorAll('button, select'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function setControlsVisible(visible) {
  pauseControls.hidden = !visible;
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

// Cierra el menú y bloquea las teclas que sigan pulsadas hasta que se suelten,
// para que Enter/Espacio usados en el menú no lleguen al juego.
function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  setControlsVisible(false);
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  heldKeys.forEach(code => suppressedKeys.add(code));
}

function openPauseMenu() {
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function pauseGame() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  openPauseMenu();
}

function resumeGame() {
  if (gameOver || !paused) return;
  paused = false;
  closePauseMenu();
  lastTime = performance.now(); // evita un salto grande de dt/dropAccum
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (paused) resumeGame(); else pauseGame();
}

function restartGame() {
  closePauseMenu();
  init();
}

function handleMenuKey(e) {
  const focusables = menuFocusables();
  const idx = focusables.indexOf(document.activeElement);
  const move = step => {
    const n = focusables.length;
    focusables[((idx === -1 ? (step > 0 ? -1 : 0) : idx) + step + n) % n].focus();
  };
  switch (e.code) {
    case 'ArrowDown':
      e.preventDefault();
      move(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      move(-1);
      break;
    case 'Tab': // mantener el foco dentro del menú
      e.preventDefault();
      move(e.shiftKey ? -1 : 1);
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (document.activeElement === startLevelSelect) {
        const delta = e.code === 'ArrowRight' ? 1 : -1;
        const lv = Math.min(MAX_START_LEVEL, Math.max(1, Number(startLevelSelect.value) + delta));
        startLevelSelect.value = String(lv);
        setStartLevel(lv);
      }
      break;
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      // Activación nativa sólo si hay un control del menú enfocado; si no, bloquear.
      if (!pauseMenu.contains(document.activeElement)) e.preventDefault();
      break;
  }
}

function setStartLevel(lv) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, Math.floor(Number(lv)) || 1));
  try { localStorage.setItem('tetris-start-level', String(startLevel)); } catch (_) { /* sin storage */ }
}

function initStartLevelSelect() {
  for (let lv = 1; lv <= MAX_START_LEVEL; lv++) {
    const opt = document.createElement('option');
    opt.value = String(lv);
    opt.textContent = String(lv);
    startLevelSelect.appendChild(opt);
  }
  let saved = 1;
  try { saved = localStorage.getItem('tetris-start-level') || 1; } catch (_) { /* sin storage */ }
  setStartLevel(saved);
  startLevelSelect.value = String(startLevel);
  startLevelSelect.addEventListener('change', () => setStartLevel(startLevelSelect.value));
}

function loop(ts) {
  const dt = Math.max(0, ts - lastTime);
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = computeLevel();
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  cancelAnimationFrame(animId);
  pauseMenu.classList.add('hidden');
  overlay.classList.add('hidden');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  next = randomPiece();
  spawn();
  updateHUD();
  lastTime = performance.now();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (paused) { handleMenuKey(e); return; }
  // Mientras un control de la UI (selector de skin, toggle de tema...) tiene
  // el foco, las teclas del juego no actúan y conservan su comportamiento nativo.
  if (e.target instanceof Element && e.target.closest('button, select, input, textarea')) return;
  const isGameKey = GAME_KEYS.includes(e.code);
  if (gameOver) {
    // No hacer scroll con flechas/espacio, pero permitir activar el botón Reiniciar.
    if (isGameKey && !(e.code === 'Space' && e.target === restartBtn)) e.preventDefault();
    return;
  }
  if (isGameKey) e.preventDefault();
  if (suppressedKeys.has(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  suppressedKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  heldKeys.clear();
  suppressedKeys.clear();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', restartGame);
controlsBtn.addEventListener('click', () => setControlsVisible(pauseControls.hidden));

// ---- Tema claro/oscuro (UI) ----
const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
  themeGridColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim() || themeGridColor;
  repaint();
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
  themeToggle.blur(); // que Space/flechas vuelvan a controlar el juego
});

// ---- Skins (canvas) ----
function loadSkinId() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    return Object.prototype.hasOwnProperty.call(SKINS, saved) ? saved : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

function saveSkinId(id) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, id);
  } catch {
    // almacenamiento no disponible: la skin se aplica solo en esta sesión
  }
}

function setCssVar(name, value) {
  if (value) document.body.style.setProperty(name, value);
  else document.body.style.removeProperty(name);
}

function applySkin(id) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, id)) id = DEFAULT_SKIN;
  currentSkinId = id;
  currentSkin = SKINS[id];
  setCssVar('--skin-board-bg', currentSkin.boardBg);
  setCssVar('--skin-accent', currentSkin.accent);
  for (const btn of skinPicker.querySelectorAll('.skin-btn'))
    btn.setAttribute('aria-pressed', String(btn.dataset.skin === id));
  repaint();
}

function buildSkinPicker() {
  for (const [id, skin] of Object.entries(SKINS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skin-btn';
    btn.dataset.skin = id;
    btn.textContent = skin.name;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      applySkin(id);
      saveSkinId(id);
      btn.blur(); // devolver el foco al juego tras cambiar
    });
    skinPicker.appendChild(btn);
  }
}

buildSkinPicker();
applySkin(loadSkinId());

initStartLevelSelect();
init();
