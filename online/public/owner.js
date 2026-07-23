'use strict';

const KEY_STORAGE = 'roulette-owner-key';
let ownerKey = localStorage.getItem(KEY_STORAGE) || '';
let selectedIds = new Set();
let refreshTimer = null;

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
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

applyThemeInit();
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

document.getElementById('keyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('ownerKey').value.trim();
  await tryUnlock(key);
});

document.getElementById('refreshBtn').addEventListener('click', () => loadTables());
document.getElementById('lockBtn').addEventListener('click', () => {
  ownerKey = '';
  localStorage.removeItem(KEY_STORAGE);
  clearInterval(refreshTimer);
  document.getElementById('dashboard').hidden = true;
  document.getElementById('keyGate').hidden = false;
  document.getElementById('ownerKey').value = '';
});

document.getElementById('selectAllTables').addEventListener('change', (e) => {
  if (e.target.checked) latestTables.forEach(t => selectedIds.add(t.id));
  else selectedIds.clear();
  renderTables(latestTables);
});

document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
  if (selectedIds.size === 0) return;
  if (!confirm(`Delete ${selectedIds.size} selected table(s)? This removes all their players, bets, and history permanently.`)) return;
  try {
    const res = await RouletteAPI.deleteTables(ownerKey, { ids: [...selectedIds] });
    selectedIds.clear();
    renderTables(res.tables);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('deleteAllBtn').addEventListener('click', async () => {
  if (latestTables.length === 0) return;
  if (!confirm(`Delete ALL ${latestTables.length} active table(s)? This cannot be undone.`)) return;
  try {
    const res = await RouletteAPI.deleteTables(ownerKey, { all: true });
    selectedIds.clear();
    renderTables(res.tables);
  } catch (err) {
    showToast(err.message);
  }
});

let latestTables = [];

async function tryUnlock(key) {
  try {
    const res = await RouletteAPI.listAllTables(key);
    ownerKey = key;
    localStorage.setItem(KEY_STORAGE, key);
    document.getElementById('keyGate').hidden = true;
    document.getElementById('dashboard').hidden = false;
    document.getElementById('keyError').textContent = '';
    renderTables(res.tables);
    refreshTimer = setInterval(loadTables, 8000);
  } catch (err) {
    document.getElementById('keyError').textContent = err.status === 403 ? 'Incorrect key.' : err.message;
  }
}

async function loadTables() {
  try {
    const res = await RouletteAPI.listAllTables(ownerKey);
    renderTables(res.tables);
  } catch (err) {
    if (err.status === 403) {
      clearInterval(refreshTimer);
      document.getElementById('dashboard').hidden = true;
      document.getElementById('keyGate').hidden = false;
      document.getElementById('keyError').textContent = 'Session expired or key no longer valid — enter it again.';
    }
  }
}

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

function renderTables(tables) {
  latestTables = tables;
  selectedIds.forEach(id => { if (!tables.some(t => t.id === id)) selectedIds.delete(id); });

  const body = document.getElementById('tablesTableBody');
  body.innerHTML = '';
  document.getElementById('tablesEmptyHint').hidden = tables.length > 0;

  tables.forEach(t => {
    const tr = document.createElement('tr');

    const checkTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedIds.has(t.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedIds.add(t.id); else selectedIds.delete(t.id);
      updateSelectAllCheckbox(tables);
      updateBulkButtons(tables);
    });
    checkTd.appendChild(checkbox);
    tr.appendChild(checkTd);

    const nameTd = document.createElement('td');
    const adminLink = document.createElement('a');
    adminLink.href = `admin.html?table=${encodeURIComponent(t.id)}&token=${encodeURIComponent(t.adminToken)}`;
    adminLink.target = '_blank';
    adminLink.textContent = t.name;
    nameTd.appendChild(adminLink);
    tr.appendChild(nameTd);

    const codeTd = document.createElement('td');
    codeTd.textContent = t.joinCode;
    tr.appendChild(codeTd);

    const playersTd = document.createElement('td');
    playersTd.textContent = t.playerCount;
    tr.appendChild(playersTd);

    const spinsTd = document.createElement('td');
    spinsTd.textContent = t.spinCount;
    tr.appendChild(spinsTd);

    const createdTd = document.createElement('td');
    createdTd.textContent = formatDate(t.createdAt);
    tr.appendChild(createdTd);

    const activeTd = document.createElement('td');
    activeTd.textContent = formatDate(t.lastActivity);
    tr.appendChild(activeTd);

    const actionTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete table "${t.name}" (${t.joinCode})? This removes all its players, bets, and history permanently.`)) return;
      try {
        const res = await RouletteAPI.deleteTables(ownerKey, { ids: [t.id] });
        selectedIds.delete(t.id);
        renderTables(res.tables);
      } catch (err) {
        showToast(err.message);
      }
    });
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    body.appendChild(tr);
  });

  updateSelectAllCheckbox(tables);
  updateBulkButtons(tables);
}

function updateSelectAllCheckbox(tables) {
  const el = document.getElementById('selectAllTables');
  const total = tables.length;
  const selected = tables.filter(t => selectedIds.has(t.id)).length;
  el.checked = total > 0 && selected === total;
  el.indeterminate = selected > 0 && selected < total;
  el.disabled = total === 0;
}

function updateBulkButtons(tables) {
  document.getElementById('deleteSelectedBtn').disabled = selectedIds.size === 0;
  document.getElementById('deleteAllBtn').disabled = tables.length === 0;
}

if (ownerKey) {
  tryUnlock(ownerKey);
}
