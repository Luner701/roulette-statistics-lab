'use strict';

/* ---------- Domain constants ---------- */

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = WHEEL_ORDER.length; // 37, European single-zero
const SLICE_ANGLE = 360 / POCKETS;
const THEORETICAL_HOUSE_EDGE = 100 / POCKETS; // 2.70%

function colorOf(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

const BET_TYPES = {
  straight: { label: 'Straight up', odds: 35, trueProbability: 1 / 37, check: (value, num) => num === value },
  red: { label: 'Red', odds: 1, trueProbability: 18 / 37, check: (_, num) => colorOf(num) === 'red' },
  black: { label: 'Black', odds: 1, trueProbability: 18 / 37, check: (_, num) => colorOf(num) === 'black' },
  odd: { label: 'Odd', odds: 1, trueProbability: 18 / 37, check: (_, num) => num !== 0 && num % 2 === 1 },
  even: { label: 'Even', odds: 1, trueProbability: 18 / 37, check: (_, num) => num !== 0 && num % 2 === 0 },
  low: { label: '1 - 18', odds: 1, trueProbability: 18 / 37, check: (_, num) => num >= 1 && num <= 18 },
  high: { label: '19 - 36', odds: 1, trueProbability: 18 / 37, check: (_, num) => num >= 19 && num <= 36 },
  dozen1: { label: '1st dozen (1-12)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 1 && num <= 12 },
  dozen2: { label: '2nd dozen (13-24)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 13 && num <= 24 },
  dozen3: { label: '3rd dozen (25-36)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 25 && num <= 36 },
  col1: { label: 'Column 1', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 1 },
  col2: { label: 'Column 2', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 2 },
  col3: { label: 'Column 3', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 0 },
};

const CHIP_VALUES = [1, 5, 10, 25, 100, 500];
const CHIP_COLORS = { 1: '#8a8a8a', 5: '#b3242c', 10: '#1f6fb2', 25: '#1a7a3c', 100: '#1a1a1a', 500: '#6a3ea1' };
const PLAYER_COLOR_SLOTS = 8;

function playerColorVar(playerId) {
  const idx = state.players.findIndex(p => p.id === playerId);
  return idx >= 0 ? `var(--player-${(idx % PLAYER_COLOR_SLOTS) + 1})` : 'var(--text-muted)';
}

/* ---------- State & persistence ---------- */

const STORAGE_KEY = 'rouletteLabState';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { players: [], pendingBets: [], history: [], roundResolved: false };
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players || [],
      pendingBets: parsed.pendingBets || [],
      history: parsed.history || [],
      roundResolved: !!parsed.roundResolved,
    };
  } catch {
    return { players: [], pendingBets: [], history: [], roundResolved: false };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

/* ---------- Toast ---------- */

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

/* ---------- Tooltip ---------- */

const tooltipEl = document.getElementById('chartTooltip');
function showTooltip(evt, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.hidden = false;
  positionTooltip(evt);
}
function positionTooltip(evt) {
  const pad = 14;
  tooltipEl.style.left = `${evt.clientX + pad}px`;
  tooltipEl.style.top = `${evt.clientY + pad}px`;
}
function hideTooltip() { tooltipEl.hidden = true; }

/* ---------- Theme ---------- */

function applyStoredTheme() {
  const pref = localStorage.getItem('rouletteTheme');
  if (pref === 'light' || pref === 'dark') {
    document.documentElement.setAttribute('data-theme', pref);
  }
  updateThemeButton();
}
function updateThemeButton() {
  const pref = localStorage.getItem('rouletteTheme');
  const effectiveDark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.getElementById('themeToggle').textContent = effectiveDark ? '☀️' : '🌙';
}
function toggleTheme() {
  const pref = localStorage.getItem('rouletteTheme');
  const currentlyDark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = currentlyDark ? 'light' : 'dark';
  localStorage.setItem('rouletteTheme', next);
  document.documentElement.setAttribute('data-theme', next);
  updateThemeButton();
}

/* ---------- SVG helpers ---------- */

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const key in attrs) el.setAttribute(key, attrs[key]);
  return el;
}

function createSvg(w, h) {
  return svgEl('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'xMidYMid meet' });
}

function roundedTopBarPath(x, yTop, yBottom, w, r) {
  const h = yBottom - yTop;
  const rr = Math.max(0, Math.min(r, h / 2, w / 2));
  return `M ${x},${yBottom} L ${x},${yTop + rr} Q ${x},${yTop} ${x + rr},${yTop} ` +
         `L ${x + w - rr},${yTop} Q ${x + w},${yTop} ${x + w},${yTop + rr} L ${x + w},${yBottom} Z`;
}

/* ---------- Wheel ---------- */

let currentRotation = 0;
let spinning = false;
let activePlayerId = null;
let activeChipValue = CHIP_VALUES[0];
let selectedPlayerIds = new Set();

function angleToXY(cx, cy, r, angleDeg) {
  const theta = (angleDeg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(theta), cy + r * Math.sin(theta)];
}

function buildWheel() {
  const size = 400;
  const cx = size / 2, cy = size / 2;
  const outerR = 190, innerR = 60, labelR = 155;
  const svg = createSvg(size, size);

  for (let i = 0; i < POCKETS; i++) {
    const num = WHEEL_ORDER[i];
    const start = i * SLICE_ANGLE;
    const end = (i + 1) * SLICE_ANGLE;
    const [x1, y1] = angleToXY(cx, cy, outerR, start);
    const [x2, y2] = angleToXY(cx, cy, outerR, end);
    const fill = num === 0 ? '#0d7a3f' : (colorOf(num) === 'red' ? '#a8121f' : '#161616');
    const path = svgEl('path', {
      d: `M ${cx},${cy} L ${x1},${y1} A ${outerR} ${outerR} 0 0 1 ${x2},${y2} Z`,
      fill,
      stroke: '#d9b25f',
      'stroke-width': '0.5',
    });
    svg.appendChild(path);

    const centerAngle = start + SLICE_ANGLE / 2;
    const [lx, ly] = angleToXY(cx, cy, labelR, centerAngle);
    const text = svgEl('text', {
      x: lx, y: ly,
      fill: '#f5efe0',
      'font-size': '13',
      'font-weight': '600',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: `rotate(${centerAngle}, ${lx}, ${ly})`,
    });
    text.textContent = String(num);
    svg.appendChild(text);
  }

  svg.appendChild(svgEl('circle', { cx, cy, r: innerR, fill: '#c9a13b', stroke: '#7a5b1e', 'stroke-width': '3' }));
  svg.appendChild(svgEl('circle', { cx, cy, r: innerR - 14, fill: '#3a2c10' }));

  const disc = document.getElementById('wheelDisc');
  disc.innerHTML = '';
  disc.appendChild(svg);
}

function spin() {
  if (spinning) return;
  if (state.roundResolved) { showToast("Click “New Bet” to start the next round."); return; }
  spinning = true;
  document.getElementById('spinBtn').disabled = true;

  const winningIndex = Math.floor(Math.random() * POCKETS);
  const winningNumber = WHEEL_ORDER[winningIndex];
  const winningColor = colorOf(winningNumber);

  const centerAngle = winningIndex * SLICE_ANGLE + SLICE_ANGLE / 2;
  const targetMod = (360 - centerAngle + 360) % 360;
  const extraTurns = 6 + Math.floor(Math.random() * 4);
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const delta = extraTurns * 360 + ((targetMod - currentMod) + 360) % 360;
  currentRotation += delta;

  const disc = document.getElementById('wheelDisc');
  disc.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.68, 0.18, 1)';
  disc.style.transform = `rotate(${currentRotation}deg)`;

  document.getElementById('resultReadout').textContent = 'Spinning…';

  disc.addEventListener('transitionend', function handler() {
    disc.removeEventListener('transitionend', handler);
    finishSpin(winningNumber, winningColor);
  }, { once: true });
}

function finishSpin(winningNumber, winningColor) {
  state.pendingBets.forEach(bet => {
    const def = BET_TYPES[bet.type];
    const win = def.check(bet.value, winningNumber);
    const player = state.players.find(p => p.id === bet.playerId);
    const net = win ? bet.amount * def.odds : -bet.amount;
    if (player) player.balance += net;
    bet.typeLabel = def.label + (bet.type === 'straight' ? ` (${bet.value})` : '');
    bet.odds = def.odds;
    bet.win = win;
    bet.net = net;
    bet.resolved = true;
  });

  state.history.unshift({
    id: uid(),
    timestamp: Date.now(),
    number: winningNumber,
    color: winningColor,
    results: JSON.parse(JSON.stringify(state.pendingBets)),
  });
  state.roundResolved = true;
  saveState();

  const readout = document.getElementById('resultReadout');
  readout.innerHTML = `Result: <span class="pill pill-${winningColor}">${winningNumber} · ${winningColor}</span>`;

  spinning = false;
  renderAll();
}

function startNewRound() {
  state.pendingBets = [];
  state.roundResolved = false;
  saveState();
  renderAll();
}

/* ---------- Registration ---------- */

function addPlayer(name, startingBalance) {
  name = name.trim();
  if (!name) { showToast('Enter a name to register a player.'); return; }
  if (!(startingBalance > 0)) { showToast('Starting balance must be greater than 0.'); return; }
  const player = { id: uid(), name, balance: startingBalance, createdAt: Date.now() };
  state.players.push(player);
  if (!activePlayerId) activePlayerId = player.id;
  saveState();
  renderAll();
}

function removePlayer(id) {
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  removePlayers([id], `Remove ${player.name}? Their past spin history stays in the statistics.`);
}

function removePlayers(ids, confirmMessage) {
  if (confirmMessage && !confirm(confirmMessage)) return;
  const idSet = new Set(ids);
  state.players = state.players.filter(p => !idSet.has(p.id));
  state.pendingBets = state.pendingBets.filter(b => !idSet.has(b.playerId));
  if (activePlayerId && idSet.has(activePlayerId)) activePlayerId = state.players[0]?.id || null;
  idSet.forEach(id => selectedPlayerIds.delete(id));
  saveState();
  renderAll();
}

function deleteSelectedPlayers() {
  if (selectedPlayerIds.size === 0) return;
  removePlayers([...selectedPlayerIds], `Remove ${selectedPlayerIds.size} selected player(s)? Their past spin history stays in the statistics.`);
}

function deleteAllPlayers() {
  if (state.players.length === 0) return;
  removePlayers(state.players.map(p => p.id), `Remove all ${state.players.length} registered players? Their past spin history stays in the statistics.`);
}

/* ---------- Betting ---------- */

function pendingSumForPlayer(playerId) {
  return state.pendingBets.filter(b => b.playerId === playerId).reduce((s, b) => s + b.amount, 0);
}

function addBet(playerId, type, value, amount) {
  if (state.roundResolved) { showToast("Click “New Bet” to start the next round."); return; }
  const player = state.players.find(p => p.id === playerId);
  if (!player) { showToast('Select a registered player.'); return; }
  if (!(amount > 0)) { showToast('Chip amount must be greater than 0.'); return; }
  const alreadyPending = pendingSumForPlayer(playerId);
  if (alreadyPending + amount > player.balance) {
    showToast(`${player.name} only has ${player.balance - alreadyPending} available to bet.`);
    return;
  }
  const existing = state.pendingBets.find(b => b.playerId === playerId && b.type === type && b.value === value);
  if (existing) {
    existing.amount += amount;
  } else {
    state.pendingBets.push({ id: uid(), playerId, playerName: player.name, type, value, amount });
  }
  saveState();
  renderAll();
}

function removeBet(id) {
  state.pendingBets = state.pendingBets.filter(b => b.id !== id);
  saveState();
  renderAll();
}

function removeBetOnCell(playerId, type, value) {
  if (state.roundResolved) return;
  const bet = state.pendingBets.find(b => b.playerId === playerId && b.type === type && b.value === value);
  if (!bet) return;
  removeBet(bet.id);
}

/* ---------- Stats aggregation ---------- */

function computePlayerStats() {
  const map = new Map();
  state.players.forEach(p => {
    map.set(p.id, { playerId: p.id, name: p.name, bets: 0, wagered: 0, won: 0, net: 0, wins: 0 });
  });
  state.history.forEach(spin => {
    spin.results.forEach(r => {
      let s = map.get(r.playerId);
      if (!s) {
        s = { playerId: r.playerId, name: r.playerName, bets: 0, wagered: 0, won: 0, net: 0, wins: 0 };
        map.set(r.playerId, s);
      }
      s.bets += 1;
      s.wagered += r.amount;
      if (r.win) {
        s.won += r.amount * (1 + r.odds);
        s.net += r.amount * r.odds;
        s.wins += 1;
      } else {
        s.net -= r.amount;
      }
    });
  });
  return Array.from(map.values()).map(s => {
    const live = state.players.find(p => p.id === s.playerId);
    return {
      ...s,
      active: !!live,
      balance: live ? live.balance : null,
      winRate: s.bets ? (s.wins / s.bets) * 100 : 0,
    };
  });
}

function computeNumberCounts() {
  const counts = new Array(37).fill(0);
  state.history.forEach(spin => { counts[spin.number] += 1; });
  return counts;
}

function computeColorCounts() {
  const counts = { red: 0, black: 0, green: 0 };
  state.history.forEach(spin => { counts[spin.color] += 1; });
  return counts;
}

/* ---------- Rendering: registration & betting ---------- */

function renderPlayers() {
  selectedPlayerIds.forEach(id => { if (!state.players.some(p => p.id === id)) selectedPlayerIds.delete(id); });

  const body = document.getElementById('playersTableBody');
  body.innerHTML = '';
  document.getElementById('playersEmptyHint').hidden = state.players.length > 0;

  state.players.forEach(p => {
    const tr = document.createElement('tr');

    const checkTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'player-select';
    checkbox.checked = selectedPlayerIds.has(p.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedPlayerIds.add(p.id); else selectedPlayerIds.delete(p.id);
      updateSelectAllCheckbox();
      updatePlayerBulkButtons();
    });
    checkTd.appendChild(checkbox);
    tr.appendChild(checkTd);

    const nameTd = document.createElement('td');
    nameTd.textContent = p.name;
    tr.appendChild(nameTd);

    const balTd = document.createElement('td');
    balTd.textContent = p.balance.toLocaleString();
    tr.appendChild(balTd);

    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-small';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => removePlayer(p.id));
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);

    body.appendChild(tr);
  });

  updateSelectAllCheckbox();
  updatePlayerBulkButtons();
}

function updateSelectAllCheckbox() {
  const el = document.getElementById('selectAllPlayers');
  const total = state.players.length;
  const selected = state.players.filter(p => selectedPlayerIds.has(p.id)).length;
  el.checked = total > 0 && selected === total;
  el.indeterminate = selected > 0 && selected < total;
  el.disabled = total === 0;
}

function updatePlayerBulkButtons() {
  document.getElementById('deleteSelectedBtn').disabled = selectedPlayerIds.size === 0;
  document.getElementById('deleteAllPlayersBtn').disabled = state.players.length === 0;
}

function renderPlayerTabs() {
  const container = document.getElementById('playerTabs');
  container.innerHTML = '';
  if (state.players.length === 0) {
    container.innerHTML = '<span class="muted" style="font-size:0.82rem;">Register a player above first.</span>';
    return;
  }
  state.players.forEach(p => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'player-tab' + (p.id === activePlayerId ? ' active' : '');
    tab.innerHTML = `<span class="dot" style="background:${playerColorVar(p.id)}"></span>${escapeHtml(p.name)} (${p.balance.toLocaleString()})`;
    tab.addEventListener('click', () => { activePlayerId = p.id; renderPlayerTabs(); });
    container.appendChild(tab);
  });
}

function renderPendingBets() {
  const body = document.getElementById('pendingBetsBody');
  body.innerHTML = '';
  document.getElementById('pendingEmptyHint').hidden = state.pendingBets.length > 0;
  state.pendingBets.forEach(b => {
    const def = BET_TYPES[b.type];
    const label = def.label + (b.type === 'straight' ? ` (${b.value})` : '');
    const tr = document.createElement('tr');
    const playerCell = `<td><span class="row-dot" style="background:${playerColorVar(b.playerId)}"></span>${escapeHtml(b.playerName)}</td>`;
    const betCell = `<td>${label}</td>`;
    const amountCell = `<td>${b.amount.toLocaleString()}</td>`;
    const resultCell = b.resolved
      ? `<td class="${b.win ? 'result-win' : 'result-loss'}">${b.win ? 'Won +' : 'Lost '}${b.net.toLocaleString()}</td>`
      : '<td></td>';
    tr.innerHTML = playerCell + betCell + amountCell + resultCell;
    if (!b.resolved) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-small';
      btn.textContent = 'Remove';
      btn.addEventListener('click', () => removeBet(b.id));
      tr.lastElementChild.appendChild(btn);
    }
    body.appendChild(tr);
  });
}

function renderRoundSummary() {
  const el = document.getElementById('roundSummary');
  if (!state.roundResolved) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  if (state.pendingBets.length === 0) {
    el.innerHTML = '<p class="round-summary-empty">No bets were placed this round.</p>';
    return;
  }
  const winners = state.pendingBets.filter(b => b.win);
  if (winners.length === 0) {
    el.innerHTML = '<p class="round-summary-empty">No winning bets this round.</p>';
    return;
  }
  el.innerHTML = '<ul class="winners-list">' + winners.map(w => `
    <li>
      <span class="winner-dot" style="background:${playerColorVar(w.playerId)}"></span>
      <strong>${escapeHtml(w.playerName)}</strong> won
      <span class="winner-amount">+${w.net.toLocaleString()}</span>
      on ${w.typeLabel} <span class="muted">(${w.odds}:1)</span>
    </li>`).join('') + '</ul>';
}

function renderResultsTicker() {
  const ticker = document.getElementById('resultsTicker');
  ticker.innerHTML = '';
  state.history.slice(0, 24).forEach(spin => {
    const chip = document.createElement('div');
    chip.className = 'ticker-chip';
    chip.style.background = spin.color === 'red' ? '#a8121f' : (spin.color === 'black' ? '#161616' : '#0d7a3f');
    chip.textContent = spin.number;
    chip.title = new Date(spin.timestamp).toLocaleString();
    ticker.appendChild(chip);
  });
}

/* ---------- Chip tray ---------- */

function buildChipTray() {
  const tray = document.getElementById('chipTray');
  tray.innerHTML = '';
  CHIP_VALUES.forEach(v => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = v;
    chip.style.background = CHIP_COLORS[v];
    chip.textContent = v;
    chip.addEventListener('click', () => {
      activeChipValue = v;
      document.getElementById('customChipAmount').value = '';
      updateChipTraySelection();
    });
    tray.appendChild(chip);
  });

  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.step = '1';
  customInput.id = 'customChipAmount';
  customInput.className = 'chip-custom-input';
  customInput.placeholder = 'Custom';
  customInput.addEventListener('input', () => {
    const v = parseInt(customInput.value, 10);
    if (v > 0) { activeChipValue = v; updateChipTraySelection(); }
  });
  tray.appendChild(customInput);

  updateChipTraySelection();
}

function updateChipTraySelection() {
  document.querySelectorAll('#chipTray .chip').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.value, 10) === activeChipValue);
  });
}

/* ---------- Betting board ---------- */

function cellSelector(type, value) {
  const v = (value === null || value === undefined) ? '' : String(value);
  return `.board-cell[data-bet-type="${type}"][data-bet-value="${v}"]`;
}

function attachCellHandlers(cell, type, value) {
  const def = BET_TYPES[type];
  cell.addEventListener('mouseenter', e => {
    const label = def.label + (type === 'straight' ? ` (${value})` : '');
    showTooltip(e, `<strong>${label}</strong><br>Pays ${def.odds}:1 &middot; true probability ${(def.trueProbability * 100).toFixed(1)}%`);
  });
  cell.addEventListener('mousemove', positionTooltip);
  cell.addEventListener('mouseleave', hideTooltip);
  cell.addEventListener('click', () => {
    if (!activePlayerId) { showToast('Select a player to bet as, first.'); return; }
    addBet(activePlayerId, type, value, activeChipValue);
  });
  cell.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!activePlayerId) return;
    removeBetOnCell(activePlayerId, type, value);
  });
}

function buildBettingBoard() {
  const board = document.getElementById('bettingBoard');
  board.innerHTML = '';

  function makeCell(className, label, type, value) {
    const cell = document.createElement('div');
    cell.className = `board-cell ${className}`;
    cell.textContent = label;
    cell.dataset.betType = type;
    cell.dataset.betValue = (value === null || value === undefined) ? '' : String(value);
    attachCellHandlers(cell, type, value);
    return cell;
  }

  const zero = makeCell('cell-zero', '0', 'straight', 0);
  zero.style.gridColumn = '1 / 2';
  zero.style.gridRow = '1 / 4';
  board.appendChild(zero);

  for (let c = 0; c < 12; c++) {
    const top = c * 3 + 3;  // 3, 6, ... 36
    const mid = c * 3 + 2;  // 2, 5, ... 35
    const bot = c * 3 + 1;  // 1, 4, ... 34
    [[top, 1], [mid, 2], [bot, 3]].forEach(([num, row]) => {
      const cls = colorOf(num) === 'red' ? 'cell-red' : 'cell-black';
      const cell = makeCell(cls, String(num), 'straight', num);
      cell.style.gridColumn = `${c + 2} / ${c + 3}`;
      cell.style.gridRow = `${row} / ${row + 1}`;
      board.appendChild(cell);
    });
  }

  [[1, 'col3'], [2, 'col2'], [3, 'col1']].forEach(([row, type]) => {
    const cell = makeCell('cell-outside cell-colbet', '2 to 1', type, null);
    cell.style.gridColumn = '14 / 15';
    cell.style.gridRow = `${row} / ${row + 1}`;
    board.appendChild(cell);
  });

  [[2, 6, 'dozen1', '1st 12'], [6, 10, 'dozen2', '2nd 12'], [10, 14, 'dozen3', '3rd 12']].forEach(([cs, ce, type, label]) => {
    const cell = makeCell('cell-outside cell-dozen', label, type, null);
    cell.style.gridColumn = `${cs} / ${ce}`;
    cell.style.gridRow = '4 / 5';
    board.appendChild(cell);
  });

  const evens = [
    [2, 4, 'low', '1-18'],
    [4, 6, 'even', 'EVEN'],
    [6, 8, 'red', 'RED'],
    [8, 10, 'black', 'BLACK'],
    [10, 12, 'odd', 'ODD'],
    [12, 14, 'high', '19-36'],
  ];
  evens.forEach(([cs, ce, type, label]) => {
    const extraCls = type === 'red' ? ' cell-red-label' : (type === 'black' ? ' cell-black-label' : '');
    const cell = makeCell('cell-outside' + extraCls, label, type, null);
    cell.style.gridColumn = `${cs} / ${ce}`;
    cell.style.gridRow = '5 / 6';
    board.appendChild(cell);
  });
}

function renderBoardChips() {
  document.querySelectorAll('.chip-badge').forEach(el => el.remove());
  const byCell = new Map();
  state.pendingBets.forEach(b => {
    const key = `${b.type}:${b.value === null || b.value === undefined ? '' : b.value}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(b);
  });
  byCell.forEach((bets, key) => {
    const [type, rawVal] = key.split(':');
    const cellEl = document.querySelector(cellSelector(type, rawVal === '' ? null : rawVal));
    if (!cellEl) return;
    bets.forEach((b, i) => {
      const badge = document.createElement('div');
      badge.className = 'chip-badge' + (b.resolved ? (b.win ? ' chip-badge-win' : ' chip-badge-loss') : '');
      badge.style.background = playerColorVar(b.playerId);
      badge.style.right = `${2 + i * 9}px`;
      badge.style.bottom = `${2 + i * 9}px`;
      badge.textContent = b.amount;
      badge.title = b.resolved
        ? `${b.playerName}: ${b.win ? 'won +' + b.net.toLocaleString() : 'lost ' + b.amount.toLocaleString()}`
        : `${b.playerName}: ${b.amount} (right-click cell to remove)`;
      cellEl.appendChild(badge);
    });
  });
}

function renderPayoutReference() {
  const body = document.getElementById('payoutRefBody');
  body.innerHTML = '';
  const seen = new Set();
  Object.values(BET_TYPES).forEach(def => {
    if (seen.has(def.label)) return;
    seen.add(def.label);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${def.label}${def === BET_TYPES.straight ? ' (any single number)' : ''}</td><td>${def.odds}:1</td><td>${(def.trueProbability * 100).toFixed(1)}%</td>`;
    body.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Rendering: summary tiles ---------- */

function renderSummaryTiles() {
  const wrap = document.getElementById('summaryTiles');
  wrap.innerHTML = '';

  const totalSpins = state.history.length;
  let totalWagered = 0, totalReturned = 0;
  state.history.forEach(spin => spin.results.forEach(r => {
    totalWagered += r.amount;
    if (r.win) totalReturned += r.amount * (1 + r.odds);
  }));
  const observedEdge = totalWagered > 0 ? ((totalWagered - totalReturned) / totalWagered) * 100 : null;

  const tiles = [
    { label: 'Total spins', value: totalSpins.toLocaleString() },
    { label: 'Registered players', value: state.players.length.toLocaleString() },
    { label: 'Total wagered', value: totalWagered.toLocaleString() },
    { label: 'Returned to players', value: Math.round(totalReturned).toLocaleString() },
    {
      label: 'Observed house edge',
      value: observedEdge === null ? '—' : `${observedEdge.toFixed(2)}%`,
      sub: `Theoretical: ${THEORETICAL_HOUSE_EDGE.toFixed(2)}%`,
    },
  ];

  tiles.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `<div class="tile-label">${t.label}</div><div class="tile-value">${t.value}</div>${t.sub ? `<div class="tile-sub">${t.sub}</div>` : ''}`;
    wrap.appendChild(el);
  });
}

/* ---------- Rendering: number frequency chart ---------- */

function renderNumberChart() {
  const container = document.getElementById('numberChart');
  container.innerHTML = '';
  const counts = computeNumberCounts();
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    container.innerHTML = '<p class="empty-state">No spins yet — spin the wheel to start collecting data.</p>';
    return;
  }

  const W = 800, H = 260;
  const marginL = 34, marginR = 10, marginT = 10, marginB = 28;
  const plotW = W - marginL - marginR, plotH = H - marginT - marginB;
  const n = counts.length;
  const slot = plotW / n;
  const barW = Math.min(24, slot - 3);
  const maxCount = Math.max(...counts, 1);
  const expected = total / n;
  const yMax = Math.max(maxCount, expected) * 1.15;

  const yFor = c => marginT + plotH - (c / yMax) * plotH;
  const svg = createSvg(W, H);

  // gridlines
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const val = (yMax / gridSteps) * i;
    const y = yFor(val);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, stroke: 'var(--gridline)', 'stroke-width': 1 }));
  }
  svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH, stroke: 'var(--baseline)', 'stroke-width': 1 }));

  counts.forEach((c, i) => {
    const x = marginL + i * slot + (slot - barW) / 2;
    const yTop = yFor(c);
    const yBottom = marginT + plotH;
    const path = svgEl('path', { d: roundedTopBarPath(x, yTop, yBottom, barW, 3), fill: 'var(--series-1)' });
    path.addEventListener('mouseenter', e => showTooltip(e, `<strong>Number ${i}</strong><br>${c} spin${c === 1 ? '' : 's'} (${((c / total) * 100).toFixed(1)}%)`));
    path.addEventListener('mousemove', positionTooltip);
    path.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(path);

    if (i % 5 === 0 || i === n - 1) {
      const label = svgEl('text', {
        x: x + barW / 2, y: marginT + plotH + 16,
        'text-anchor': 'middle', 'font-size': '10', fill: 'var(--text-muted)',
      });
      label.textContent = String(i);
      svg.appendChild(label);
    }
  });

  const expectedY = yFor(expected);
  svg.appendChild(svgEl('line', {
    x1: marginL, x2: W - marginR, y1: expectedY, y2: expectedY,
    stroke: 'var(--text-muted)', 'stroke-width': 2, 'stroke-dasharray': '5 4',
  }));

  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:var(--series-1)"></span>Observed</span>
    <span class="legend-item"><span class="legend-line"></span>Expected (${expected.toFixed(1)} per number)</span>
  `;
  container.appendChild(legend);
}

/* ---------- Rendering: color distribution chart ---------- */

function renderColorChart() {
  const container = document.getElementById('colorChart');
  container.innerHTML = '';
  const counts = computeColorCounts();
  const total = counts.red + counts.black + counts.green;

  if (total === 0) {
    container.innerHTML = '<p class="empty-state">No spins yet.</p>';
    return;
  }

  const categories = [
    { key: 'red', label: 'Red', color: '#a8121f', expectedProb: 18 / 37 },
    { key: 'black', label: 'Black', color: 'var(--text-primary)', expectedProb: 18 / 37 },
    { key: 'green', label: 'Green (0)', color: '#0d7a3f', expectedProb: 1 / 37 },
  ];

  const W = 360, H = 260;
  const marginL = 34, marginR = 10, marginT = 10, marginB = 34;
  const plotW = W - marginL - marginR, plotH = H - marginT - marginB;
  const groupW = plotW / categories.length;
  const barW = 26, gap = 6;
  const maxVal = Math.max(...categories.map(c => Math.max(counts[c.key], c.expectedProb * total))) * 1.15;
  const yFor = v => marginT + plotH - (v / maxVal) * plotH;

  const svg = createSvg(W, H);
  for (let i = 0; i <= 4; i++) {
    const val = (maxVal / 4) * i;
    const y = yFor(val);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, stroke: 'var(--gridline)', 'stroke-width': 1 }));
  }
  svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH, stroke: 'var(--baseline)', 'stroke-width': 1 }));

  categories.forEach((cat, i) => {
    const groupX = marginL + i * groupW;
    const centerX = groupX + groupW / 2;
    const observed = counts[cat.key];
    const expected = cat.expectedProb * total;

    const obsX = centerX - gap / 2 - barW;
    const obsPath = svgEl('path', { d: roundedTopBarPath(obsX, yFor(observed), marginT + plotH, barW, 4), fill: cat.color });
    obsPath.addEventListener('mouseenter', e => showTooltip(e, `<strong>${cat.label} — observed</strong><br>${observed} spins (${((observed / total) * 100).toFixed(1)}%)`));
    obsPath.addEventListener('mousemove', positionTooltip);
    obsPath.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(obsPath);

    const expX = centerX + gap / 2;
    const expRect = svgEl('rect', {
      x: expX, y: yFor(expected), width: barW, height: (marginT + plotH) - yFor(expected),
      fill: 'none', stroke: cat.color, 'stroke-width': 2, rx: 4,
    });
    expRect.addEventListener('mouseenter', e => showTooltip(e, `<strong>${cat.label} — expected</strong><br>${expected.toFixed(1)} spins (${(cat.expectedProb * 100).toFixed(1)}%)`));
    expRect.addEventListener('mousemove', positionTooltip);
    expRect.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(expRect);

    const label = svgEl('text', { x: centerX, y: marginT + plotH + 18, 'text-anchor': 'middle', 'font-size': '11', fill: 'var(--text-secondary)' });
    label.textContent = cat.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:var(--text-secondary)"></span>Observed</span>
    <span class="legend-item"><span class="legend-swatch outline"></span>Expected</span>
  `;
  container.appendChild(legend);
}

/* ---------- Rendering: player net result chart ---------- */

function renderPlayerChart(stats) {
  const container = document.getElementById('playerChart');
  container.innerHTML = '';
  const rows = stats.filter(s => s.bets > 0).sort((a, b) => b.net - a.net);

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-state">No resolved bets yet.</p>';
    return;
  }

  const rowH = 34;
  const W = 400, H = rows.length * rowH + 20;
  const marginL = 90, marginR = 60, centerX0 = marginL + (W - marginL - marginR) / 2;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.net)), 1) * 1.2;
  const halfW = (W - marginL - marginR) / 2;
  const xFor = v => centerX0 + (v / maxAbs) * halfW;

  const svg = createSvg(W, H);
  svg.appendChild(svgEl('line', { x1: centerX0, x2: centerX0, y1: 6, y2: H - 6, stroke: 'var(--baseline)', 'stroke-width': 1 }));

  rows.forEach((r, i) => {
    const y = 10 + i * rowH;
    const barH = 18;
    const color = r.net >= 0 ? 'var(--good)' : 'var(--critical)';
    const x1 = xFor(Math.min(0, r.net));
    const x2 = xFor(Math.max(0, r.net));
    const rect = svgEl('rect', { x: x1, y, width: Math.max(1, x2 - x1), height: barH, rx: 3, fill: color });
    rect.addEventListener('mouseenter', e => showTooltip(e, `<strong>${escapeHtml(r.name)}</strong><br>Net: ${r.net >= 0 ? '+' : ''}${r.net.toLocaleString()}<br>Wagered: ${r.wagered.toLocaleString()} · Win rate: ${r.winRate.toFixed(0)}%`));
    rect.addEventListener('mousemove', positionTooltip);
    rect.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(rect);

    const name = svgEl('text', { x: marginL - 8, y: y + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': '11', fill: 'var(--text-secondary)' });
    name.textContent = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
    svg.appendChild(name);

    const valueX = r.net >= 0 ? x2 + 6 : x1 - 6;
    const anchor = r.net >= 0 ? 'start' : 'end';
    const value = svgEl('text', { x: valueX, y: y + barH / 2, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-size': '11', fill: 'var(--text-primary)', 'font-weight': '600' });
    value.textContent = `${r.net >= 0 ? '+' : ''}${r.net.toLocaleString()}`;
    svg.appendChild(value);
  });

  container.appendChild(svg);
}

/* ---------- Rendering: player stats table ---------- */

function renderPlayerStatsTable(stats) {
  const body = document.getElementById('playerStatsBody');
  body.innerHTML = '';
  const rows = stats.filter(s => s.bets > 0 || s.active).sort((a, b) => b.net - a.net);
  document.getElementById('statsEmptyHint').hidden = state.history.length > 0;

  rows.forEach(s => {
    const tr = document.createElement('tr');
    const netColor = s.net > 0 ? 'var(--good)' : (s.net < 0 ? 'var(--critical)' : 'var(--text-primary)');
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.active ? 'Active' : 'Removed'}</td>
      <td>${s.bets}</td>
      <td>${s.wagered.toLocaleString()}</td>
      <td>${Math.round(s.won).toLocaleString()}</td>
      <td style="color:${netColor}; font-weight:600;">${s.net >= 0 ? '+' : ''}${s.net.toLocaleString()}</td>
      <td>${s.bets ? s.winRate.toFixed(0) + '%' : '—'}</td>
    `;
    body.appendChild(tr);
  });
}

/* ---------- Master render ---------- */

function renderAll() {
  renderPlayers();
  renderPlayerTabs();
  renderPendingBets();
  renderBoardChips();
  renderRoundSummary();
  renderResultsTicker();
  renderSummaryTiles();
  renderNumberChart();
  renderColorChart();
  const stats = computePlayerStats();
  renderPlayerChart(stats);
  renderPlayerStatsTable(stats);
  updateActionButtons();
}

function updateActionButtons() {
  document.getElementById('spinBtn').disabled = spinning || state.roundResolved;
  document.getElementById('newBetBtn').disabled = state.pendingBets.length === 0;
}

/* ---------- Form wiring ---------- */

function wireForms() {
  document.getElementById('registerForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('playerName').value;
    const balance = parseInt(document.getElementById('startingBalance').value, 10);
    addPlayer(name, balance);
    e.target.reset();
    document.getElementById('startingBalance').value = 1000;
    document.getElementById('playerName').focus();
  });

  document.getElementById('spinBtn').addEventListener('click', spin);
  document.getElementById('newBetBtn').addEventListener('click', startNewRound);

  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedPlayers);
  document.getElementById('deleteAllPlayersBtn').addEventListener('click', deleteAllPlayers);
  document.getElementById('selectAllPlayers').addEventListener('change', e => {
    if (e.target.checked) state.players.forEach(p => selectedPlayerIds.add(p.id));
    else selectedPlayerIds.clear();
    renderPlayers();
  });

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roulette-lab-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset all players, bets, and spin history? This cannot be undone.')) return;
    state = { players: [], pendingBets: [], history: [], roundResolved: false };
    saveState();
    renderAll();
  });
}

/* ---------- Init ---------- */

applyStoredTheme();
buildWheel();
buildBettingBoard();
buildChipTray();
renderPayoutReference();
wireForms();
renderAll();
