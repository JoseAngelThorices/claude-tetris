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

// Rectángulo redondeado con arcTo (sin depender de ctx.roundRect)
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Textura fija 4×4 del skin pixel art: 1 = claro, 2 = oscuro
const PIXEL_PATTERN = [
  [1, 0, 0, 0],
  [0, 0, 2, 0],
  [0, 2, 0, 1],
  [0, 0, 0, 0],
];

// Skins: paleta (índices 1–8 alineados con PIECES) + función de dibujo.
// drawBlock(context, px, py, size, color, alpha) recibe coordenadas en píxeles;
// globalAlpha ya viene fijado por drawBlock() y lo restaura él.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00f5ff', '#fff200', '#d500ff', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#c0c8ff'],
    drawBlock(context, px, py, size, color, alpha) {
      context.shadowColor = color;
      context.shadowBlur = alpha < 1 ? 4 : 14; // glow suave para el fantasma
      context.fillStyle = color;
      context.fillRect(px + 2, py + 2, size - 4, size - 4);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      // núcleo oscuro para el efecto de tubo
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(px + 5, py + 5, size - 10, size - 10);
      context.fillStyle = color;
      context.fillRect(px + 9, py + 9, size - 18, size - 18);
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6ef', '#fdf1a6', '#d9c2f0', '#bfe8c3', '#f7b8c0', '#b9d3f6', '#fcd5b0', '#d3d3de'],
    drawBlock(context, px, py, size, color) {
      const r = size * 0.25;
      roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
      context.fillStyle = color;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0,0,0,0.15)';
      context.stroke();
      // borde interior más claro
      roundRectPath(context, px + 3.5, py + 3.5, size - 7, size - 7, r * 0.7);
      context.strokeStyle = 'rgba(255,255,255,0.6)';
      context.stroke();
      // brillo superior
      roundRectPath(context, px + 6, py + 5, size - 12, size * 0.2, size * 0.1);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#00d8f8', '#f8d800', '#b848f8', '#58d854', '#f83800', '#3878f8', '#fc9838', '#bcbcbc'],
    drawBlock(context, px, py, size, color) {
      const u = size / 6; // bloque de 6×6 subpíxeles
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // bisel: luz arriba/izquierda, sombra abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(px, py, size - u, u);
      context.fillRect(px, py, u, size - u);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(px + u, py + size - u, size - u, u);
      context.fillRect(px + size - u, py + u, u, size - u);
      // textura determinista (espejada según la posición de la celda)
      const flip = Math.round((px + py) / size) % 2 === 1;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const v = PIXEL_PATTERN[r][flip ? 3 - c : c];
          if (!v) continue;
          context.fillStyle = v === 1 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
          context.fillRect(px + (c + 1) * u, py + (r + 1) * u, u, u);
        }
      }
    },
  },
};

let activeSkin = SKINS.retro;

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  updateCombo(clearLines());
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
  context.globalAlpha = alpha ?? 1;
  activeSkin.drawBlock(context, x * size, y * size, size, activeSkin.colors[colorIndex], alpha ?? 1);
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

// ---- Skins ----
const SKIN_STORAGE_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  activeSkin = SKINS[name];
  for (const key of Object.keys(SKINS)) document.body.classList.remove(`skin-${key}`);
  document.body.classList.add(`skin-${name}`);
  try { localStorage.setItem(SKIN_STORAGE_KEY, name); } catch (e) { /* sin almacenamiento */ }
  if (skinSelect) skinSelect.value = name;
  // Redibujar ya: en pausa el bucle RAF está detenido. Tras el game over no se
  // redibuja el tablero para no pintar la pieza que ya no cabía.
  if (current && !gameOver) draw();
  if (next) drawNext();
}

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_STORAGE_KEY); } catch (e) { /* sin almacenamiento */ }
applySkin(savedSkin);

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    skinSelect.blur(); // devolver el teclado al juego
  });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  onGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
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
  resetRecordsUI();
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Menú de pausa ----
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

const START_LEVEL_KEY = 'tetris-start-level';
const RESUME_GRACE_MS = 150;
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

let gameStartLevel = 1;   // nivel inicial de la partida en curso
let resumeGraceUntil = 0; // hasta cuándo se descartan teclas tras reanudar
let freshKeys = null;     // teclas pulsadas de nuevo tras reanudar (su autorrepetición vale)

function parseStartLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

function loadStartLevel() {
  try {
    return parseStartLevel(localStorage.getItem(START_LEVEL_KEY)) ?? 1;
  } catch (_) {
    return 1;
  }
}

let startLevel = loadStartLevel(); // se aplica en la próxima partida
startLevelSelect.value = String(startLevel);

function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function') el.blur();
}

function openPauseMenu() {
  pauseControls.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  blurActive();
  pauseMenu.classList.add('hidden');
  resumeGraceUntil = performance.now() + RESUME_GRACE_MS;
  freshKeys = new Set();
}

// Devuelve true si la tecla no debe llegar al juego (menú abierto o recién cerrado)
function pauseInputBlocked(e) {
  const inMenu = !pauseMenu.classList.contains('hidden');
  const inGrace = !inMenu && performance.now() < resumeGraceUntil;
  if (!inMenu && freshKeys && !e.repeat) freshKeys.add(e.code);
  // Autorrepetición de una tecla que ya se mantenía con el menú abierto
  const staleRepeat = e.repeat && freshKeys !== null && !freshKeys.has(e.code);
  const blocked = inMenu || inGrace || staleRepeat;
  // Evita el scroll de la página, salvo al usar los controles del propio menú
  if (blocked && GAME_KEYS.includes(e.code) && !(inMenu && pauseMenu.contains(e.target))) {
    e.preventDefault();
  }
  return blocked;
}

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });

pauseRestartBtn.addEventListener('click', () => {
  blurActive();
  pauseMenu.classList.add('hidden');
  init();
});

controlsBtn.addEventListener('click', () => {
  const show = pauseControls.classList.contains('hidden');
  pauseControls.classList.toggle('hidden', !show);
  controlsBtn.setAttribute('aria-expanded', String(show));
});

startLevelSelect.addEventListener('change', () => {
  const n = parseStartLevel(startLevelSelect.value);
  if (n === null) { startLevelSelect.value = String(startLevel); return; }
  startLevel = n;
  try {
    localStorage.setItem(START_LEVEL_KEY, String(n));
  } catch (_) { /* sin almacenamiento: vale solo para esta sesión */ }
});

document.addEventListener('keydown', e => {
  // Escribiendo el nombre del récord: el teclado no llega al juego
  if (e.target && e.target.tagName === 'INPUT') return;
  // Teclas de juego sobre el selector de skin: devolver el foco al juego
  if (e.target === skinSelect && /^(Arrow|Space$|KeyP$|KeyX$|Escape$)/.test(e.code)) { e.preventDefault(); skinSelect.blur(); }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) togglePause(); return; }
  if (pauseInputBlocked(e) || paused || gameOver) return;
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
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Récords ----

const RECORDS_KEY = 'tetris-records';
const PLAYER_NAME_KEY = 'tetris-player-name';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordMessage = document.getElementById('record-message');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const saveNameBtn = document.getElementById('save-name-btn');
const gameoverRecords = document.getElementById('gameover-records');

// combo = bloqueos seguidos que limpian al menos una línea
let combo = 0;
let bestComboGame = 0;
let pendingRecord = null;   // partida pendiente de guardar con nombre
let resetArmed = false;
let resetTimer = null;

function defaultRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function cleanName(name) {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
  return trimmed || 'Anónimo';
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return defaultRecords();
    const scores = (Array.isArray(data.scores) ? data.scores : [])
      .filter(s => s && typeof s === 'object' && Number.isFinite(s.score))
      .map(s => ({
        name: cleanName(s.name),
        score: toCount(s.score),
        lines: toCount(s.lines),
        level: Math.max(1, toCount(s.level)),
        date: typeof s.date === 'string' ? s.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { scores, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch {
    return defaultRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch { /* almacenamiento no disponible */ }
}

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch { /* almacenamiento no disponible */ }
}

function qualifiesForTop(records, value) {
  if (value <= 0) return false;
  const s = records.scores;
  return s.length < MAX_RECORDS || value > s[s.length - 1].score;
}

function updateCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  bestComboGame = Math.max(bestComboGame, combo);
}

// Pinta tabla + mejor combo / líneas máximas (solo textContent: nombres de usuario)
function renderRecords(container, records, highlightIndex = -1) {
  container.replaceChildren();
  if (records.scores.length) {
    const table = document.createElement('table');
    table.className = 'records-table';
    const head = document.createElement('tr');
    for (const label of ['#', 'Nombre', 'Puntos', 'Líneas']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    }
    table.appendChild(head);
    records.scores.forEach((entry, i) => {
      const row = document.createElement('tr');
      if (i === highlightIndex) row.classList.add('record-new');
      for (const value of [i + 1, entry.name, entry.score.toLocaleString(), entry.lines]) {
        const td = document.createElement('td');
        td.textContent = String(value);
        row.appendChild(td);
      }
      table.appendChild(row);
    });
    container.appendChild(table);
  } else {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin récords todavía';
    container.appendChild(empty);
  }
  const stats = document.createElement('p');
  stats.className = 'records-stats';
  stats.textContent = `Mejor combo: ${records.bestCombo} · Líneas máx.: ${records.maxLines}`;
  container.appendChild(stats);
}

function onGameOverRecords() {
  const records = loadRecords();
  records.bestCombo = Math.max(records.bestCombo, bestComboGame);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords(records);

  if (qualifiesForTop(records, score)) {
    const isBest = !records.scores.length || score > records.scores[0].score;
    pendingRecord = { score, lines, level };
    recordMessage.textContent = isBest ? '¡Nuevo récord!' : '¡Entras en el Top 5!';
    recordMessage.classList.remove('hidden');
    gameoverRecords.classList.add('hidden');
    nameForm.classList.remove('hidden');
    playerNameInput.value = loadPlayerName();
    playerNameInput.focus();
  } else {
    pendingRecord = null;
    renderRecords(gameoverRecords, records);
    gameoverRecords.classList.remove('hidden');
  }
}

function saveNamedRecord() {
  if (!pendingRecord) return;   // evita guardar dos veces
  const name = cleanName(playerNameInput.value);
  const entry = { name, ...pendingRecord, date: new Date().toISOString().slice(0, 10) };
  pendingRecord = null;
  savePlayerName(name === 'Anónimo' ? '' : name);

  const records = loadRecords();
  records.scores.push(entry);
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords(records);

  playerNameInput.blur();
  nameForm.classList.add('hidden');
  renderRecords(gameoverRecords, records, records.scores.indexOf(entry));
  gameoverRecords.classList.remove('hidden');
}

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  resetRecordsBtn.textContent = 'Borrar récords';
  resetRecordsBtn.classList.remove('armed');
}

function resetRecordsUI() {
  if (pendingRecord) saveNamedRecord();   // no perder un récord al reiniciar sin guardar
  combo = 0;
  bestComboGame = 0;
  pendingRecord = null;
  disarmReset();
  startScreen.classList.add('hidden');
  recordMessage.classList.add('hidden');
  nameForm.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
}

// Pantalla de inicio: se modela como gameOver = true para bloquear teclas y pausa
function showStartScreen() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = true;
  updateHUD();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  renderRecords(startRecords, loadRecords());
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

playBtn.addEventListener('click', init);

document.addEventListener('keydown', e => {
  if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  if (startScreen.classList.contains('hidden')) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || (tag === 'BUTTON' && e.target !== playBtn)) return;
  e.preventDefault();
  init();
});

saveNameBtn.addEventListener('click', saveNamedRecord);

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    saveNamedRecord();
  }
});

// Borrado en dos pasos: primer clic arma, segundo clic borra
resetRecordsBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetRecordsBtn.textContent = '¿Seguro?';
    resetRecordsBtn.classList.add('armed');
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  saveRecords(defaultRecords());
  renderRecords(startRecords, loadRecords());
});

document.addEventListener('click', e => {
  if (resetArmed && e.target !== resetRecordsBtn) disarmReset();
});

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

showStartScreen();
