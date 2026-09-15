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
    level = Math.floor(lines / 10) + 1;
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
  onGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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
