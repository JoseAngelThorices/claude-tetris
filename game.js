'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
];

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
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
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
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
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
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

initStartLevelSelect();
init();
