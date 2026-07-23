'use strict';

const params = new URLSearchParams(window.location.search);
const code = (params.get('code') || '').toUpperCase();

let tableId = null;
let myPlayerId = null;
let myPlayerToken = null;

let lastSpinSeq = null;
let currentRotation = 0;
let spinning = false;
let activeChipValue = window.RouletteDomain.CHIP_VALUES[0];
let pollTimer = null;
let latestState = null;

function loadIdentity() {
  return RouletteUI.loadPlayerIdentity(tableId);
}
function saveIdentity(name) {
  RouletteUI.savePlayerIdentity(tableId, { playerId: myPlayerId, playerToken: myPlayerToken, name });
}
function clearIdentity() {
  RouletteUI.clearPlayerIdentity(tableId);
}

function applyThemeInit() {
  const pref = localStorage.getItem('rouletteTheme');
  if (pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
  updateThemeButton();
}
function updateThemeButton() {
  const pref = localStorage.getItem('rouletteTheme');
  const dark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.getElementById('themeToggle').textContent = dark ? '☀️' : '🌙';
}
function toggleTheme() {
  const pref = localStorage.getItem('rouletteTheme');
  const dark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  localStorage.setItem('rouletteTheme', next);
  document.documentElement.setAttribute('data-theme', next);
  updateThemeButton();
}

function showRegistration(note) {
  if (note) document.getElementById('registrationNote').textContent = note;
  document.getElementById('registrationCard').hidden = false;
  document.getElementById('app').hidden = true;
}
function showApp() {
  document.getElementById('registrationCard').hidden = true;
  document.getElementById('app').hidden = false;
}

async function init() {
  applyThemeInit();
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('registerForm').addEventListener('submit', onRegisterSubmit);

  if (!code) {
    document.getElementById('loadError').textContent = 'Missing join code. Ask your host for the table link.';
    return;
  }

  let info;
  try {
    info = await RouletteAPI.findByCode(code);
  } catch (err) {
    document.getElementById('loadError').textContent = err.message;
    return;
  }
  tableId = info.tableId;
  document.getElementById('tableNameHeading').textContent = info.name;
  document.title = `${info.name} — Roulette Statistics Lab`;

  const saved = loadIdentity();
  if (saved) {
    myPlayerId = saved.playerId;
    myPlayerToken = saved.playerToken;
    const state = await RouletteAPI.getState(tableId).catch(() => null);
    if (state && state.players.some(p => p.id === myPlayerId)) {
      enterTable(state);
      return;
    }
    clearIdentity();
    showRegistration('You were removed from this table by the host. Enter your name to rejoin.');
    return;
  }

  showRegistration();
}

async function onRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('playerName').value;
  try {
    const res = await RouletteAPI.registerPlayer(tableId, name);
    myPlayerId = res.playerId;
    myPlayerToken = res.playerToken;
    saveIdentity(name.trim());
    enterTable(res.state);
  } catch (err) {
    RouletteUI.showToast(err.message);
  }
}

function enterTable(state) {
  lastSpinSeq = state.spinSeq;
  showApp();
  RouletteUI.buildWheel(document.getElementById('wheelDisc'));
  RouletteUI.buildChipTray(document.getElementById('chipTray'), activeChipValue, (v) => {
    activeChipValue = v;
    RouletteUI.updateChipTraySelection(document.getElementById('chipTray'), activeChipValue);
  });
  RouletteUI.buildBettingBoard(document.getElementById('bettingBoard'), {
    onCellClick: (type, value) => placeBet(type, value),
    onCellContextMenu: (type, value) => removeBetOnCell(type, value),
  });
  RouletteUI.renderPayoutReference(document.getElementById('payoutRefBody'));
  render(state);
  pollTimer = setInterval(poll, 1500);
}

async function poll() {
  try {
    const state = await RouletteAPI.getState(tableId);
    document.getElementById('connectionNote').textContent = '';
    document.getElementById('connectionNote').classList.remove('offline');

    if (!state.players.some(p => p.id === myPlayerId)) {
      clearInterval(pollTimer);
      clearIdentity();
      RouletteUI.showToast('You were removed from this table by the host.');
      showRegistration('You were removed from this table by the host. Enter your name to rejoin.');
      return;
    }
    handleNewState(state);
  } catch (err) {
    if (err.status === 404) {
      clearInterval(pollTimer);
      document.getElementById('loadError').textContent = 'This table no longer exists.';
      document.getElementById('app').hidden = true;
    } else {
      document.getElementById('connectionNote').textContent = 'Connection lost — retrying…';
      document.getElementById('connectionNote').classList.add('offline');
    }
  }
}

function handleNewState(state) {
  if (lastSpinSeq === null) lastSpinSeq = state.spinSeq;

  if (state.spinSeq !== lastSpinSeq && !spinning) {
    const winningNumber = state.history[0].number;
    const winningIndex = window.RouletteDomain.WHEEL_ORDER.indexOf(winningNumber);
    spinning = true;
    document.getElementById('resultReadout').textContent = 'Spinning…';
    currentRotation = RouletteUI.computeSpinRotation(currentRotation, winningIndex);
    RouletteUI.animateWheel(document.getElementById('wheelDisc'), currentRotation, () => {
      spinning = false;
      lastSpinSeq = state.spinSeq;
      render(state);
    });
    return;
  }

  if (!spinning) render(state);
}

function render(state) {
  latestState = state;
  renderIdentity(state);
  RouletteUI.renderBoardChips(document.getElementById('bettingBoard'), state.pendingBets, state.players);
  RouletteUI.renderBetsTable(document.getElementById('pendingBetsBody'), state.pendingBets, state.players, {
    canRemove: (b) => b.playerId === myPlayerId,
    onRemove: (b) => removeBetById(b.id),
  });
  document.getElementById('pendingEmptyHint').hidden = state.pendingBets.length > 0;
  RouletteUI.renderRoundSummary(document.getElementById('roundSummary'), state.roundResolved, state.pendingBets, state.players);
  RouletteUI.renderResultsTicker(document.getElementById('resultsTicker'), state.history);

  if (state.history.length > 0 && state.roundResolved) {
    const latest = state.history[0];
    document.getElementById('resultReadout').innerHTML = `Result: <span class="pill pill-${latest.color}">${latest.number} &middot; ${latest.color}</span>`;
  } else if (!state.roundResolved) {
    document.getElementById('resultReadout').textContent = '';
  }

  const stats = RouletteUI.computePlayerStats(state.players, state.history);
  let totalWagered = 0, totalReturned = 0;
  state.history.forEach(spin => spin.results.forEach(r => {
    totalWagered += r.amount;
    if (r.win) totalReturned += r.amount * (1 + r.odds);
  }));
  RouletteUI.renderSummaryTiles(document.getElementById('summaryTiles'), {
    totalSpins: state.history.length, totalPlayers: state.players.length, totalWagered, totalReturned,
  });
  RouletteUI.renderNumberChart(document.getElementById('numberChart'), state.history);
  RouletteUI.renderColorChart(document.getElementById('colorChart'), state.history);
  RouletteUI.renderPlayerChart(document.getElementById('playerChart'), stats);
  RouletteUI.renderPlayerStatsTable(document.getElementById('playerStatsBody'), stats);
  document.getElementById('statsEmptyHint').hidden = state.history.length > 0;
}

function renderIdentity(state) {
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me) return;
  const banner = document.getElementById('identityBanner');
  banner.innerHTML = `<span class="dot" style="background:${RouletteUI.playerColorVar(me.id, state.players)}"></span><strong>${RouletteUI.escapeHtml(me.name)}</strong><span class="muted">at this table</span><span class="balance">${me.balance.toLocaleString()}</span>`;
}

async function placeBet(type, value) {
  if (latestState && latestState.roundResolved) {
    RouletteUI.showToast('Wait for the host to start the next round.');
    return;
  }
  try {
    const state = await RouletteAPI.placeBet(tableId, myPlayerId, myPlayerToken, type, value, activeChipValue);
    render(state);
  } catch (err) {
    RouletteUI.showToast(err.message);
  }
}

function removeBetOnCell(type, value) {
  if (!latestState || latestState.roundResolved) return;
  const bet = latestState.pendingBets.find(b => b.playerId === myPlayerId && b.type === type && b.value === value);
  if (!bet) return;
  removeBetById(bet.id);
}

async function removeBetById(betId) {
  try {
    const state = await RouletteAPI.removeBet(tableId, betId, myPlayerId, myPlayerToken);
    render(state);
  } catch (err) {
    RouletteUI.showToast(err.message);
  }
}

init();
