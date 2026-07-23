'use strict';

const params = new URLSearchParams(window.location.search);
const tableId = params.get('table');
const adminToken = params.get('token');

let lastSpinSeq = null;
let currentRotation = 0;
let spinning = false;
let selectedPlayerIds = new Set();
let pollTimer = null;

let myPlayerId = null;
let myPlayerToken = null;
let activeChipValue = window.RouletteDomain.CHIP_VALUES[0];
let latestState = null;

if (!tableId || !adminToken) {
  document.getElementById('loadError').textContent = 'Missing or invalid admin link. Create a new table from the home page.';
} else {
  init();
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

function init() {
  applyThemeInit();
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  const saved = RouletteUI.loadPlayerIdentity(tableId);
  if (saved) { myPlayerId = saved.playerId; myPlayerToken = saved.playerToken; }

  RouletteUI.buildWheel(document.getElementById('wheelDisc'));
  RouletteUI.renderPayoutReference(document.getElementById('payoutRefBody'));
  setupBoardForIdentity();

  wireForms();
  poll();
  pollTimer = setInterval(poll, 1500);
}

function setupBoardForIdentity() {
  const iAmPlaying = !!myPlayerId;
  document.getElementById('adminJoinPrompt').hidden = iAmPlaying;
  document.getElementById('identityBanner').hidden = !iAmPlaying;
  document.getElementById('chipTrayRow').hidden = !iAmPlaying;
  document.getElementById('boardInstructions').textContent = iAmPlaying
    ? 'Pick a chip, then click a spot on the table to bet. Right-click a spot to remove your own bet before the spin.'
    : 'This board is read-only — register yourself above to bet, or players can place their own bets from their own device.';

  RouletteUI.buildBettingBoard(document.getElementById('bettingBoard'), iAmPlaying ? {
    onCellClick: (type, value) => placeBet(type, value),
    onCellContextMenu: (type, value) => removeBetOnCell(type, value),
  } : { readOnly: true });

  if (iAmPlaying) {
    RouletteUI.buildChipTray(document.getElementById('chipTray'), activeChipValue, (v) => {
      activeChipValue = v;
      RouletteUI.updateChipTraySelection(document.getElementById('chipTray'), activeChipValue);
    });
  }
}

async function placeBet(type, value) {
  if (latestState && latestState.roundResolved) {
    RouletteUI.showToast('Click New Bet to start the next round.');
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

async function poll() {
  try {
    const state = await RouletteAPI.getState(tableId);
    document.getElementById('app').hidden = false;
    document.getElementById('loadError').textContent = '';
    document.getElementById('connectionNote').textContent = '';
    document.getElementById('connectionNote').classList.remove('offline');
    handleNewState(state);
  } catch (err) {
    if (err.status === 404) {
      document.getElementById('loadError').textContent = 'This table no longer exists (it may have expired after 48h of inactivity).';
      document.getElementById('app').hidden = true;
      clearInterval(pollTimer);
    } else {
      document.getElementById('connectionNote').textContent = 'Connection lost — retrying…';
      document.getElementById('connectionNote').classList.add('offline');
    }
  }
}

function handleNewState(state) {
  if (lastSpinSeq === null) lastSpinSeq = state.spinSeq; // first load: don't replay history as a fresh spin

  if (state.spinSeq !== lastSpinSeq && !spinning) {
    const winningNumber = state.history[0].number;
    const winningIndex = window.RouletteDomain.WHEEL_ORDER.indexOf(winningNumber);
    spinning = true;
    document.getElementById('resultReadout').textContent = 'Spinning…';
    document.getElementById('spinBtn').disabled = true;
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

  if (myPlayerId && !state.players.some(p => p.id === myPlayerId)) {
    RouletteUI.clearPlayerIdentity(tableId);
    myPlayerId = null;
    myPlayerToken = null;
    setupBoardForIdentity();
  }
  renderIdentity(state);

  renderJoinBanner(state);
  renderPlayers(state);
  RouletteUI.renderBoardChips(document.getElementById('bettingBoard'), state.pendingBets, state.players);
  RouletteUI.renderBetsTable(document.getElementById('pendingBetsBody'), state.pendingBets, state.players, {
    canRemove: (b) => !!myPlayerId && b.playerId === myPlayerId,
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

  renderStats(state);
  updateActionButtons(state);
}

function renderIdentity(state) {
  if (!myPlayerId) return;
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me) return;
  const banner = document.getElementById('identityBanner');
  banner.innerHTML = `<span class="dot" style="background:${RouletteUI.playerColorVar(me.id, state.players)}"></span><strong>${RouletteUI.escapeHtml(me.name)}</strong><span class="muted">you're betting at this table too</span><span class="balance">${me.balance.toLocaleString()}</span>`;
}

function renderJoinBanner(state) {
  document.getElementById('tableNameHeading').textContent = state.name;
  document.title = `${state.name} — Admin — Roulette Statistics Lab`;
  document.getElementById('joinCodeDisplay').textContent = state.joinCode;
  const link = `${window.location.origin}/play.html?code=${encodeURIComponent(state.joinCode)}`;
  document.getElementById('joinLinkInput').value = link;
}

function renderPlayers(state) {
  selectedPlayerIds.forEach(id => { if (!state.players.some(p => p.id === id)) selectedPlayerIds.delete(id); });

  const body = document.getElementById('playersTableBody');
  body.innerHTML = '';
  document.getElementById('playersEmptyHint').hidden = state.players.length > 0;

  state.players.forEach(p => {
    const tr = document.createElement('tr');

    const checkTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedPlayerIds.has(p.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedPlayerIds.add(p.id); else selectedPlayerIds.delete(p.id);
      updatePlayerBulkButtons(state);
      updateSelectAllCheckbox(state);
    });
    checkTd.appendChild(checkbox);
    tr.appendChild(checkTd);

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `<span class="row-dot" style="background:${RouletteUI.playerColorVar(p.id, state.players)}"></span>${RouletteUI.escapeHtml(p.name)}`;
    tr.appendChild(nameTd);

    const balTd = document.createElement('td');
    balTd.textContent = p.balance.toLocaleString();
    tr.appendChild(balTd);

    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-small';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => removePlayers([p.id], `Remove ${p.name}? Their past spin history stays in the statistics.`));
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);

    body.appendChild(tr);
  });

  updateSelectAllCheckbox(state);
  updatePlayerBulkButtons(state);
}

function updateSelectAllCheckbox(state) {
  const el = document.getElementById('selectAllPlayers');
  const total = state.players.length;
  const selected = state.players.filter(p => selectedPlayerIds.has(p.id)).length;
  el.checked = total > 0 && selected === total;
  el.indeterminate = selected > 0 && selected < total;
  el.disabled = total === 0;
}

function updatePlayerBulkButtons(state) {
  document.getElementById('deleteSelectedBtn').disabled = selectedPlayerIds.size === 0;
  document.getElementById('deleteAllPlayersBtn').disabled = state.players.length === 0;
}

function renderStats(state) {
  const stats = RouletteUI.computePlayerStats(state.players, state.history);
  let totalWagered = 0, totalReturned = 0;
  state.history.forEach(spin => spin.results.forEach(r => {
    totalWagered += r.amount;
    if (r.win) totalReturned += r.amount * (1 + r.odds);
  }));
  RouletteUI.renderSummaryTiles(document.getElementById('summaryTiles'), {
    totalSpins: state.history.length,
    totalPlayers: state.players.length,
    totalWagered,
    totalReturned,
  });
  RouletteUI.renderNumberChart(document.getElementById('numberChart'), state.history);
  RouletteUI.renderColorChart(document.getElementById('colorChart'), state.history);
  RouletteUI.renderPlayerChart(document.getElementById('playerChart'), stats);
  const rows = RouletteUI.renderPlayerStatsTable(document.getElementById('playerStatsBody'), stats);
  document.getElementById('statsEmptyHint').hidden = state.history.length > 0;
  void rows;
}

function updateActionButtons(state) {
  document.getElementById('spinBtn').disabled = spinning || state.roundResolved;
  document.getElementById('newBetBtn').disabled = state.pendingBets.length === 0;
}

async function removePlayers(ids, confirmMessage) {
  if (confirmMessage && !confirm(confirmMessage)) return;
  try {
    const state = await RouletteAPI.deletePlayers(tableId, adminToken, { ids });
    ids.forEach(id => selectedPlayerIds.delete(id));
    render(state);
  } catch (err) {
    RouletteUI.showToast(err.message);
  }
}

function wireForms() {
  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    const input = document.getElementById('joinLinkInput');
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      RouletteUI.showToast('Join link copied.');
    } catch {
      RouletteUI.showToast('Could not copy automatically — select and copy manually.');
    }
  });

  document.getElementById('adminJoinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('adminPlayerName').value;
    try {
      const res = await RouletteAPI.registerPlayer(tableId, name);
      myPlayerId = res.playerId;
      myPlayerToken = res.playerToken;
      RouletteUI.savePlayerIdentity(tableId, { playerId: myPlayerId, playerToken: myPlayerToken, name: name.trim() });
      e.target.reset();
      setupBoardForIdentity();
      render(res.state);
    } catch (err) {
      RouletteUI.showToast(err.message);
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('playerName').value;
    const balance = parseInt(document.getElementById('startingBalance').value, 10);
    try {
      const { state } = await RouletteAPI.registerPlayer(tableId, name, balance);
      e.target.reset();
      document.getElementById('startingBalance').value = 1000;
      render(state);
    } catch (err) {
      RouletteUI.showToast(err.message);
    }
  });

  document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    if (selectedPlayerIds.size === 0) return;
    removePlayers([...selectedPlayerIds], `Remove ${selectedPlayerIds.size} selected player(s)? Their past spin history stays in the statistics.`);
  });

  document.getElementById('deleteAllPlayersBtn').addEventListener('click', async () => {
    if (!confirm('Remove all registered players? Their past spin history stays in the statistics.')) return;
    try {
      const state = await RouletteAPI.deletePlayers(tableId, adminToken, { all: true });
      selectedPlayerIds.clear();
      render(state);
    } catch (err) {
      RouletteUI.showToast(err.message);
    }
  });

  document.getElementById('spinBtn').addEventListener('click', async () => {
    if (spinning) return;
    document.getElementById('spinBtn').disabled = true;
    try {
      const state = await RouletteAPI.spin(tableId, adminToken);
      handleNewState(state);
    } catch (err) {
      RouletteUI.showToast(err.message);
      document.getElementById('spinBtn').disabled = false;
    }
  });

  document.getElementById('newBetBtn').addEventListener('click', async () => {
    try {
      const state = await RouletteAPI.newRound(tableId, adminToken);
      render(state);
    } catch (err) {
      RouletteUI.showToast(err.message);
    }
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    window.open(RouletteAPI.exportUrl(tableId, adminToken), '_blank');
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('Reset this table completely — remove all players, bets, and spin history? This cannot be undone.')) return;
    try {
      const state = await RouletteAPI.resetTable(tableId, adminToken);
      selectedPlayerIds.clear();
      lastSpinSeq = state.spinSeq;
      render(state);
    } catch (err) {
      RouletteUI.showToast(err.message);
    }
  });
}
