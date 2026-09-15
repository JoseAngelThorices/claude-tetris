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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  // Teclas de juego sobre el selector de skin: devolver el foco al juego
  if (e.target === skinSelect && /^(Arrow|Space$|KeyP$|KeyX$)/.test(e.code)) { e.preventDefault(); skinSelect.blur(); }
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

init();
