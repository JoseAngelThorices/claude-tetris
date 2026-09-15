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

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';
const TOP_SIZE = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';

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
const overlayMsgs = document.getElementById('overlay-msgs');
const restartBtn = document.getElementById('restart-btn');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsSection = document.getElementById('records-section');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetYesBtn = document.getElementById('reset-yes-btn');
const resetNoBtn = document.getElementById('reset-no-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false;   // false mientras se muestra la pantalla de inicio
let combo = 0;         // piezas consecutivas que han limpiado al menos una línea
let maxCombo = 0;      // combo máximo de la partida actual
let lastGame = null;   // { entry, saved, newBestCombo, newMaxLines } de la partida terminada

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function toCount(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function cleanName(raw) {
  return String(raw ?? '').trim().slice(0, NAME_MAX).trim() || DEFAULT_NAME;
}

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !Number.isFinite(e.score)) return null;
  return {
    name: cleanName(e.name),
    score: toCount(e.score),
    lines: toCount(e.lines),
    level: Math.max(1, toCount(e.level)),
    combo: toCount(e.combo),
    date: typeof e.date === 'string' ? e.date : '',
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return emptyRecords();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.top)) return emptyRecords();
    const top = data.top
      .map(sanitizeEntry)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_SIZE);
    return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch (err) {
    return emptyRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    // localStorage no disponible: el juego sigue sin persistir records
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (err) {
    // ignorar
  }
}

function loadLastName() {
  try {
    return cleanName(localStorage.getItem(LAST_NAME_KEY));
  } catch (err) {
    return DEFAULT_NAME;
  }
}

function saveLastName(name) {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch (err) {
    // ignorar
  }
}

function qualifiesForTop(value, top) {
  return value > 0 && (top.length < TOP_SIZE || value > top[TOP_SIZE - 1].score);
}

// Inserta sin mutar; en empate la entrada nueva queda detrás de las existentes.
function insertEntry(top, entry) {
  let index = top.findIndex(e => e.score < entry.score);
  if (index === -1) index = top.length;
  const list = [...top.slice(0, index), entry, ...top.slice(index)].slice(0, TOP_SIZE);
  return { top: list, index };
}

function renderRecords(records, highlightIndex = -1) {
  const rows = [];
  for (let i = 0; i < TOP_SIZE; i++) {
    const e = records.top[i];
    const tr = document.createElement('tr');
    if (!e) tr.classList.add('empty');
    if (i === highlightIndex) tr.classList.add('highlight');
    const cells = e
      ? [i + 1, e.name, e.score.toLocaleString(), e.lines, e.level, e.combo]
      : [i + 1, '---', '-', '-', '-', '-'];
    cells.forEach((val, ci) => {
      const td = document.createElement('td');
      td.textContent = String(val);
      if (ci === 1 && e) td.title = e.name;
      tr.appendChild(td);
    });
    rows.push(tr);
  }
  recordsBody.replaceChildren(...rows);
  bestComboEl.textContent = String(records.bestCombo);
  maxLinesEl.textContent = String(records.maxLines);
}

function setMessages(msgs) {
  overlayMsgs.replaceChildren(...msgs.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
}

// Refresca tabla, mensajes y formulario según el modo del overlay.
function refreshRecordsView() {
  const records = loadRecords();
  if (overlay.dataset.mode !== 'gameover' || !lastGame) {
    nameForm.hidden = true;
    setMessages([]);
    renderRecords(records);
    return;
  }

  const msgs = [];
  let view = records;
  let highlight = -1;
  const pending = !lastGame.saved && qualifiesForTop(lastGame.entry.score, records.top);

  if (pending) {
    // Vista previa: la fila de la partida actual resaltada con el nombre escrito
    lastGame.entry.name = cleanName(nameInput.value);
    const ins = insertEntry(records.top, lastGame.entry);
    view = { ...records, top: ins.top };
    highlight = ins.index;
  } else if (lastGame.saved) {
    highlight = records.top.findIndex(e =>
      e.date === lastGame.entry.date && e.score === lastGame.entry.score && e.name === lastGame.entry.name);
  }

  if (highlight !== -1) msgs.push(`¡Nuevo récord! Puesto #${highlight + 1}`);
  if (lastGame.newBestCombo) msgs.push(`¡Mejor combo histórico: ${lastGame.entry.combo}!`);
  if (lastGame.newMaxLines) msgs.push(`¡Récord de líneas: ${lastGame.entry.lines}!`);

  nameForm.hidden = !pending;
  setMessages(msgs);
  renderRecords(view, highlight);
}

function saveCurrentRecord() {
  if (!gameOver || !lastGame || lastGame.saved) return;
  const records = loadRecords();
  lastGame.entry.name = cleanName(nameInput.value);
  if (qualifiesForTop(lastGame.entry.score, records.top)) {
    records.top = insertEntry(records.top, lastGame.entry).top;
    saveRecords(records);
  }
  lastGame.saved = true;
  saveLastName(lastGame.entry.name);
  nameInput.blur();
  refreshRecordsView();
}

function resetRecords() {
  clearRecords();
  if (lastGame) {
    lastGame.newBestCombo = false;
    lastGame.newMaxLines = false;
  }
  hideResetConfirm();
  refreshRecordsView();
}

function hideResetConfirm() {
  resetConfirm.hidden = true;
  resetRecordsBtn.hidden = false;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function showOverlay(mode) {
  overlay.dataset.mode = mode;
  if (mode === 'start') {
    overlayTitle.textContent = 'TETRIS';
    overlayScore.textContent = 'Pulsa Jugar o Enter';
    restartBtn.textContent = 'Jugar';
  } else if (mode === 'pause') {
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = 'Pulsa P para continuar';
    restartBtn.textContent = 'Reiniciar';
  } else {
    overlayTitle.textContent = 'GAME OVER';
    overlayScore.textContent =
      `Puntuación: ${score.toLocaleString()}\nLíneas: ${lines} · Combo máx: ${maxCombo}`;
    restartBtn.textContent = 'Jugar de nuevo';
  }
  recordsSection.hidden = mode === 'pause';
  hideResetConfirm();
  refreshRecordsView();
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  nameForm.hidden = true;
}

// ---------------------------------------------------------------------------
// Juego
// ---------------------------------------------------------------------------

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

// Devuelve el número de líneas limpiadas.
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
  if (clearLines() > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
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

  if (!current || gameOver) return;

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
  draw();

  // Récords globales independientes del top 5: se guardan siempre
  const records = loadRecords();
  const newBestCombo = maxCombo > records.bestCombo;
  const newMaxLines = lines > records.maxLines;
  if (newBestCombo || newMaxLines) {
    records.bestCombo = Math.max(records.bestCombo, maxCombo);
    records.maxLines = Math.max(records.maxLines, lines);
    saveRecords(records);
  }

  lastGame = {
    entry: { name: DEFAULT_NAME, score, lines, level, combo: maxCombo, date: new Date().toISOString() },
    saved: false,
    newBestCombo,
    newMaxLines,
  };
  nameInput.value = loadLastName();
  showOverlay('gameover');

  if (!nameForm.hidden) {
    // Diferido para que la tecla que terminó la partida no se escriba en el input
    setTimeout(() => {
      if (!gameOver || nameForm.hidden) return;
      nameInput.focus();
      nameInput.select();
    }, 0);
  }
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  cancelAnimationFrame(animId);
  if (!paused) {
    hideOverlay();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    showOverlay('pause');
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

function resetState() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  current = null;
  next = randomPiece();
  lastGame = null;
}

// Arranca (o reinicia) una partida. Cancela siempre el RAF previo: nunca hay dos loops.
function init() {
  cancelAnimationFrame(animId);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  resetState();
  started = true;
  spawn();
  updateHUD();
  hideOverlay();
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

// Pantalla de inicio: tablero vacío, sin loop, overlay con records y botón Jugar.
function showStartScreen() {
  cancelAnimationFrame(animId);
  resetState();
  started = false;
  updateHUD();
  draw();
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  showOverlay('start');
}

document.addEventListener('keydown', e => {
  const t = e.target;
  // Escribiendo en un campo de texto: ninguna tecla dispara acciones del juego
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;

  if (!started || gameOver) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (t instanceof HTMLButtonElement) return; // el botón enfocado ya gestiona su click
      e.preventDefault();
      if (gameOver && !nameForm.hidden) {
        nameInput.focus(); // hay un récord pendiente de guardar
        return;
      }
      init();
    }
    return;
  }

  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused) return;
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

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveCurrentRecord();
});

nameInput.addEventListener('input', refreshRecordsView);

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.hidden = true;
  resetConfirm.hidden = false;
  resetNoBtn.focus();
});
resetYesBtn.addEventListener('click', resetRecords);
resetNoBtn.addEventListener('click', hideResetConfirm);

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

let savedTheme = null;
try {
  savedTheme = localStorage.getItem('tetris-theme');
} catch (err) {
  // localStorage no disponible
}
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  try {
    localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
  } catch (err) {
    // ignorar
  }
  draw(); // repinta la rejilla con el color del tema también fuera de partida
});

showStartScreen();
