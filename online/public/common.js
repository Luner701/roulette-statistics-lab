'use strict';

/* Shared, state-agnostic UI helpers used by both admin.js and play.js.
   Domain constants (BET_TYPES, colorOf, WHEEL_ORDER...) come from domain.js
   which must be loaded first (exposes window.RouletteDomain). */

const RouletteUI = (function () {
  const D = window.RouletteDomain;
  const { WHEEL_ORDER, POCKETS, SLICE_ANGLE, THEORETICAL_HOUSE_EDGE, colorOf, BET_TYPES, CHIP_VALUES, CHIP_COLORS } = D;

  /* ---------- Small utilities ---------- */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function identityStorageKey(tableId) { return `roulette-player-${tableId}`; }
  function loadPlayerIdentity(tableId) {
    try { return JSON.parse(localStorage.getItem(identityStorageKey(tableId))); } catch { return null; }
  }
  function savePlayerIdentity(tableId, identity) {
    localStorage.setItem(identityStorageKey(tableId), JSON.stringify(identity));
  }
  function clearPlayerIdentity(tableId) {
    localStorage.removeItem(identityStorageKey(tableId));
  }

  function playerColorVar(playerId, players) {
    const idx = players.findIndex(p => p.id === playerId);
    return idx >= 0 ? `var(--player-${(idx % 8) + 1})` : 'var(--text-muted)';
  }

  let toastTimer = null;
  function showToast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function showTooltip(evt, html) {
    const el = document.getElementById('chartTooltip');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
    positionTooltip(evt);
  }
  function positionTooltip(evt) {
    const el = document.getElementById('chartTooltip');
    if (!el) return;
    const pad = 14;
    el.style.left = `${evt.clientX + pad}px`;
    el.style.top = `${evt.clientY + pad}px`;
  }
  function hideTooltip() {
    const el = document.getElementById('chartTooltip');
    if (el) el.hidden = true;
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

  function angleToXY(cx, cy, r, angleDeg) {
    const theta = (angleDeg - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(theta), cy + r * Math.sin(theta)];
  }

  function buildWheel(containerEl) {
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
      svg.appendChild(svgEl('path', {
        d: `M ${cx},${cy} L ${x1},${y1} A ${outerR} ${outerR} 0 0 1 ${x2},${y2} Z`,
        fill, stroke: '#d9b25f', 'stroke-width': '0.5',
      }));

      const centerAngle = start + SLICE_ANGLE / 2;
      const [lx, ly] = angleToXY(cx, cy, labelR, centerAngle);
      const text = svgEl('text', {
        x: lx, y: ly, fill: '#f5efe0', 'font-size': '13', 'font-weight': '600',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        transform: `rotate(${centerAngle}, ${lx}, ${ly})`,
      });
      text.textContent = String(num);
      svg.appendChild(text);
    }

    svg.appendChild(svgEl('circle', { cx, cy, r: innerR, fill: '#c9a13b', stroke: '#7a5b1e', 'stroke-width': '3' }));
    svg.appendChild(svgEl('circle', { cx, cy, r: innerR - 14, fill: '#3a2c10' }));

    containerEl.innerHTML = '';
    containerEl.appendChild(svg);
  }

  /**
   * Computes the next absolute rotation (deg) so that pocket `winningIndex`
   * ends up at the top pointer, spinning forward from `currentRotation`.
   */
  function computeSpinRotation(currentRotation, winningIndex) {
    const centerAngle = winningIndex * SLICE_ANGLE + SLICE_ANGLE / 2;
    const targetMod = (360 - centerAngle + 360) % 360;
    const extraTurns = 6 + Math.floor(Math.random() * 4);
    const currentMod = ((currentRotation % 360) + 360) % 360;
    const delta = extraTurns * 360 + ((targetMod - currentMod) + 360) % 360;
    return currentRotation + delta;
  }

  function animateWheel(wheelDiscEl, newRotation, onDone) {
    wheelDiscEl.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.68, 0.18, 1)';
    wheelDiscEl.style.transform = `rotate(${newRotation}deg)`;
    wheelDiscEl.addEventListener('transitionend', function handler() {
      wheelDiscEl.removeEventListener('transitionend', handler);
      if (onDone) onDone();
    }, { once: true });
  }

  /* ---------- Betting board ---------- */

  function cellSelector(boardEl, type, value) {
    const v = (value === null || value === undefined) ? '' : String(value);
    return boardEl.querySelector(`.board-cell[data-bet-type="${type}"][data-bet-value="${v}"]`);
  }

  /**
   * Builds the roulette table layout inside boardEl.
   * options: { readOnly, onCellClick(type, value), onCellContextMenu(type, value) }
   */
  function buildBettingBoard(boardEl, options) {
    options = options || {};
    boardEl.innerHTML = '';
    boardEl.classList.toggle('board-readonly', !!options.readOnly);

    function makeCell(className, label, type, value) {
      const cell = document.createElement('div');
      cell.className = `board-cell ${className}`;
      cell.textContent = label;
      cell.dataset.betType = type;
      cell.dataset.betValue = (value === null || value === undefined) ? '' : String(value);

      const def = BET_TYPES[type];
      cell.addEventListener('mouseenter', e => {
        const label2 = def.label + (type === 'straight' ? ` (${value})` : '');
        showTooltip(e, `<strong>${label2}</strong><br>Pays ${def.odds}:1 &middot; true probability ${(def.trueProbability * 100).toFixed(1)}%`);
      });
      cell.addEventListener('mousemove', positionTooltip);
      cell.addEventListener('mouseleave', hideTooltip);

      if (!options.readOnly) {
        cell.addEventListener('click', () => options.onCellClick && options.onCellClick(type, value));
        cell.addEventListener('contextmenu', e => {
          e.preventDefault();
          options.onCellContextMenu && options.onCellContextMenu(type, value);
        });
      }
      return cell;
    }

    const zero = makeCell('cell-zero', '0', 'straight', 0);
    zero.style.gridColumn = '1 / 2';
    zero.style.gridRow = '1 / 4';
    boardEl.appendChild(zero);

    for (let c = 0; c < 12; c++) {
      const top = c * 3 + 3, mid = c * 3 + 2, bot = c * 3 + 1;
      [[top, 1], [mid, 2], [bot, 3]].forEach(([num, row]) => {
        const cls = colorOf(num) === 'red' ? 'cell-red' : 'cell-black';
        const cell = makeCell(cls, String(num), 'straight', num);
        cell.style.gridColumn = `${c + 2} / ${c + 3}`;
        cell.style.gridRow = `${row} / ${row + 1}`;
        boardEl.appendChild(cell);
      });
    }

    [[1, 'col3'], [2, 'col2'], [3, 'col1']].forEach(([row, type]) => {
      const cell = makeCell('cell-outside cell-colbet', '2 to 1', type, null);
      cell.style.gridColumn = '14 / 15';
      cell.style.gridRow = `${row} / ${row + 1}`;
      boardEl.appendChild(cell);
    });

    [[2, 6, 'dozen1', '1st 12'], [6, 10, 'dozen2', '2nd 12'], [10, 14, 'dozen3', '3rd 12']].forEach(([cs, ce, type, label]) => {
      const cell = makeCell('cell-outside cell-dozen', label, type, null);
      cell.style.gridColumn = `${cs} / ${ce}`;
      cell.style.gridRow = '4 / 5';
      boardEl.appendChild(cell);
    });

    const evens = [
      [2, 4, 'low', '1-18'], [4, 6, 'even', 'EVEN'], [6, 8, 'red', 'RED'],
      [8, 10, 'black', 'BLACK'], [10, 12, 'odd', 'ODD'], [12, 14, 'high', '19-36'],
    ];
    evens.forEach(([cs, ce, type, label]) => {
      const extraCls = type === 'red' ? ' cell-red-label' : (type === 'black' ? ' cell-black-label' : '');
      const cell = makeCell('cell-outside' + extraCls, label, type, null);
      cell.style.gridColumn = `${cs} / ${ce}`;
      cell.style.gridRow = '5 / 6';
      boardEl.appendChild(cell);
    });
  }

  function renderBoardChips(boardEl, pendingBets, players) {
    boardEl.querySelectorAll('.chip-badge').forEach(el => el.remove());
    const byCell = new Map();
    pendingBets.forEach(b => {
      const key = `${b.type}:${b.value === null || b.value === undefined ? '' : b.value}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(b);
    });
    byCell.forEach((bets, key) => {
      const [type, rawVal] = key.split(':');
      const cellEl = cellSelector(boardEl, type, rawVal === '' ? null : rawVal);
      if (!cellEl) return;
      bets.forEach((b, i) => {
        const badge = document.createElement('div');
        badge.className = 'chip-badge' + (b.resolved ? (b.win ? ' chip-badge-win' : ' chip-badge-loss') : '');
        badge.style.background = playerColorVar(b.playerId, players);
        badge.style.right = `${2 + i * 9}px`;
        badge.style.bottom = `${2 + i * 9}px`;
        badge.textContent = b.amount;
        badge.title = b.resolved
          ? `${b.playerName}: ${b.win ? 'won +' + b.net.toLocaleString() : 'lost ' + b.amount.toLocaleString()}`
          : `${b.playerName}: ${b.amount}`;
        cellEl.appendChild(badge);
      });
    });
  }

  function renderPayoutReference(tbodyEl) {
    tbodyEl.innerHTML = '';
    const seen = new Set();
    Object.values(BET_TYPES).forEach(def => {
      if (seen.has(def.label)) return;
      seen.add(def.label);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${def.label}${def === BET_TYPES.straight ? ' (any single number)' : ''}</td><td>${def.odds}:1</td><td>${(def.trueProbability * 100).toFixed(1)}%</td>`;
      tbodyEl.appendChild(tr);
    });
  }

  /* ---------- Chip tray ---------- */

  function buildChipTray(trayEl, activeValue, onChange) {
    trayEl.innerHTML = '';
    CHIP_VALUES.forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (v === activeValue ? ' active' : '');
      chip.dataset.value = v;
      chip.style.background = CHIP_COLORS[v];
      chip.textContent = v;
      chip.addEventListener('click', () => {
        document.getElementById('customChipAmount') && (document.getElementById('customChipAmount').value = '');
        onChange(v);
      });
      trayEl.appendChild(chip);
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
      if (v > 0) onChange(v);
    });
    trayEl.appendChild(customInput);
  }

  function updateChipTraySelection(trayEl, activeValue) {
    trayEl.querySelectorAll('.chip').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.value, 10) === activeValue);
    });
  }

  /* ---------- Stats aggregation ---------- */

  function computePlayerStats(players, history) {
    const map = new Map();
    players.forEach(p => map.set(p.id, { playerId: p.id, name: p.name, bets: 0, wagered: 0, won: 0, net: 0, wins: 0 }));
    history.forEach(spin => {
      spin.results.forEach(r => {
        let s = map.get(r.playerId);
        if (!s) { s = { playerId: r.playerId, name: r.playerName, bets: 0, wagered: 0, won: 0, net: 0, wins: 0 }; map.set(r.playerId, s); }
        s.bets += 1;
        s.wagered += r.amount;
        if (r.win) { s.won += r.amount * (1 + r.odds); s.net += r.amount * r.odds; s.wins += 1; }
        else { s.net -= r.amount; }
      });
    });
    return Array.from(map.values()).map(s => {
      const live = players.find(p => p.id === s.playerId);
      return { ...s, active: !!live, balance: live ? live.balance : null, winRate: s.bets ? (s.wins / s.bets) * 100 : 0 };
    });
  }

  function computeNumberCounts(history) {
    const counts = new Array(37).fill(0);
    history.forEach(spin => { counts[spin.number] += 1; });
    return counts;
  }
  function computeColorCounts(history) {
    const counts = { red: 0, black: 0, green: 0 };
    history.forEach(spin => { counts[spin.color] += 1; });
    return counts;
  }

  /* ---------- Charts ---------- */

  function renderSummaryTiles(containerEl, { totalSpins, totalPlayers, totalWagered, totalReturned }) {
    containerEl.innerHTML = '';
    const observedEdge = totalWagered > 0 ? ((totalWagered - totalReturned) / totalWagered) * 100 : null;
    const tiles = [
      { label: 'Total spins', value: totalSpins.toLocaleString() },
      { label: 'Registered players', value: totalPlayers.toLocaleString() },
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
      containerEl.appendChild(el);
    });
  }

  function renderNumberChart(containerEl, history) {
    containerEl.innerHTML = '';
    const counts = computeNumberCounts(history);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) { containerEl.innerHTML = '<p class="empty-state">No spins yet — spin the wheel to start collecting data.</p>'; return; }

    const W = 800, H = 260, marginL = 34, marginR = 10, marginT = 10, marginB = 28;
    const plotW = W - marginL - marginR, plotH = H - marginT - marginB;
    const n = counts.length, slot = plotW / n, barW = Math.min(24, slot - 3);
    const maxCount = Math.max(...counts, 1), expected = total / n, yMax = Math.max(maxCount, expected) * 1.15;
    const yFor = c => marginT + plotH - (c / yMax) * plotH;
    const svg = createSvg(W, H);

    for (let i = 0; i <= 4; i++) {
      const y = yFor((yMax / 4) * i);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, stroke: 'var(--gridline)', 'stroke-width': 1 }));
    }
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH, stroke: 'var(--baseline)', 'stroke-width': 1 }));

    counts.forEach((c, i) => {
      const x = marginL + i * slot + (slot - barW) / 2;
      const path = svgEl('path', { d: roundedTopBarPath(x, yFor(c), marginT + plotH, barW, 3), fill: 'var(--series-1)' });
      path.addEventListener('mouseenter', e => showTooltip(e, `<strong>Number ${i}</strong><br>${c} spin${c === 1 ? '' : 's'} (${((c / total) * 100).toFixed(1)}%)`));
      path.addEventListener('mousemove', positionTooltip);
      path.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(path);
      if (i % 5 === 0 || i === n - 1) {
        const label = svgEl('text', { x: x + barW / 2, y: marginT + plotH + 16, 'text-anchor': 'middle', 'font-size': '10', fill: 'var(--text-muted)' });
        label.textContent = String(i);
        svg.appendChild(label);
      }
    });

    const expectedY = yFor(expected);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: expectedY, y2: expectedY, stroke: 'var(--text-muted)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    containerEl.appendChild(svg);

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `<span class="legend-item"><span class="legend-swatch" style="background:var(--series-1)"></span>Observed</span><span class="legend-item"><span class="legend-line"></span>Expected (${expected.toFixed(1)} per number)</span>`;
    containerEl.appendChild(legend);
  }

  function renderColorChart(containerEl, history) {
    containerEl.innerHTML = '';
    const counts = computeColorCounts(history);
    const total = counts.red + counts.black + counts.green;
    if (total === 0) { containerEl.innerHTML = '<p class="empty-state">No spins yet.</p>'; return; }

    const categories = [
      { key: 'red', label: 'Red', color: '#a8121f', expectedProb: 18 / 37 },
      { key: 'black', label: 'Black', color: 'var(--text-primary)', expectedProb: 18 / 37 },
      { key: 'green', label: 'Green (0)', color: '#0d7a3f', expectedProb: 1 / 37 },
    ];
    const W = 360, H = 260, marginL = 34, marginR = 10, marginT = 10, marginB = 34;
    const plotW = W - marginL - marginR, plotH = H - marginT - marginB;
    const groupW = plotW / categories.length, barW = 26, gap = 6;
    const maxVal = Math.max(...categories.map(c => Math.max(counts[c.key], c.expectedProb * total))) * 1.15;
    const yFor = v => marginT + plotH - (v / maxVal) * plotH;
    const svg = createSvg(W, H);

    for (let i = 0; i <= 4; i++) {
      const y = yFor((maxVal / 4) * i);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, stroke: 'var(--gridline)', 'stroke-width': 1 }));
    }
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH, stroke: 'var(--baseline)', 'stroke-width': 1 }));

    categories.forEach((cat, i) => {
      const centerX = marginL + i * groupW + groupW / 2;
      const observed = counts[cat.key], expected = cat.expectedProb * total;
      const obsX = centerX - gap / 2 - barW;
      const obsPath = svgEl('path', { d: roundedTopBarPath(obsX, yFor(observed), marginT + plotH, barW, 4), fill: cat.color });
      obsPath.addEventListener('mouseenter', e => showTooltip(e, `<strong>${cat.label} — observed</strong><br>${observed} spins (${((observed / total) * 100).toFixed(1)}%)`));
      obsPath.addEventListener('mousemove', positionTooltip);
      obsPath.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(obsPath);

      const expX = centerX + gap / 2;
      const expRect = svgEl('rect', { x: expX, y: yFor(expected), width: barW, height: (marginT + plotH) - yFor(expected), fill: 'none', stroke: cat.color, 'stroke-width': 2, rx: 4 });
      expRect.addEventListener('mouseenter', e => showTooltip(e, `<strong>${cat.label} — expected</strong><br>${expected.toFixed(1)} spins (${(cat.expectedProb * 100).toFixed(1)}%)`));
      expRect.addEventListener('mousemove', positionTooltip);
      expRect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(expRect);

      const label = svgEl('text', { x: centerX, y: marginT + plotH + 18, 'text-anchor': 'middle', 'font-size': '11', fill: 'var(--text-secondary)' });
      label.textContent = cat.label;
      svg.appendChild(label);
    });

    containerEl.appendChild(svg);
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `<span class="legend-item"><span class="legend-swatch" style="background:var(--text-secondary)"></span>Observed</span><span class="legend-item"><span class="legend-swatch outline"></span>Expected</span>`;
    containerEl.appendChild(legend);
  }

  function renderPlayerChart(containerEl, stats) {
    containerEl.innerHTML = '';
    const rows = stats.filter(s => s.bets > 0).sort((a, b) => b.net - a.net);
    if (rows.length === 0) { containerEl.innerHTML = '<p class="empty-state">No resolved bets yet.</p>'; return; }

    const rowH = 34, W = 400, H = rows.length * rowH + 20;
    const marginL = 90, marginR = 60, centerX0 = marginL + (W - marginL - marginR) / 2;
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.net)), 1) * 1.2;
    const halfW = (W - marginL - marginR) / 2;
    const xFor = v => centerX0 + (v / maxAbs) * halfW;
    const svg = createSvg(W, H);
    svg.appendChild(svgEl('line', { x1: centerX0, x2: centerX0, y1: 6, y2: H - 6, stroke: 'var(--baseline)', 'stroke-width': 1 }));

    rows.forEach((r, i) => {
      const y = 10 + i * rowH, barH = 18;
      const color = r.net >= 0 ? 'var(--good)' : 'var(--critical)';
      const x1 = xFor(Math.min(0, r.net)), x2 = xFor(Math.max(0, r.net));
      const rect = svgEl('rect', { x: x1, y, width: Math.max(1, x2 - x1), height: barH, rx: 3, fill: color });
      rect.addEventListener('mouseenter', e => showTooltip(e, `<strong>${escapeHtml(r.name)}</strong><br>Net: ${r.net >= 0 ? '+' : ''}${r.net.toLocaleString()}<br>Wagered: ${r.wagered.toLocaleString()} &middot; Win rate: ${r.winRate.toFixed(0)}%`));
      rect.addEventListener('mousemove', positionTooltip);
      rect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(rect);

      const name = svgEl('text', { x: marginL - 8, y: y + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': '11', fill: 'var(--text-secondary)' });
      name.textContent = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
      svg.appendChild(name);

      const valueX = r.net >= 0 ? x2 + 6 : x1 - 6;
      const value = svgEl('text', { x: valueX, y: y + barH / 2, 'text-anchor': r.net >= 0 ? 'start' : 'end', 'dominant-baseline': 'middle', 'font-size': '11', fill: 'var(--text-primary)', 'font-weight': '600' });
      value.textContent = `${r.net >= 0 ? '+' : ''}${r.net.toLocaleString()}`;
      svg.appendChild(value);
    });
    containerEl.appendChild(svg);
  }

  function renderPlayerStatsTable(tbodyEl, stats) {
    tbodyEl.innerHTML = '';
    const rows = stats.slice().sort((a, b) => b.net - a.net);
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
        <td>${s.bets ? s.winRate.toFixed(0) + '%' : '—'}</td>`;
      tbodyEl.appendChild(tr);
    });
    return rows.length;
  }

  /**
   * options: { canRemove(bet) => bool, onRemove(bet) }
   */
  function renderBetsTable(tbodyEl, pendingBets, players, options) {
    options = options || {};
    tbodyEl.innerHTML = '';
    pendingBets.forEach(b => {
      const def = BET_TYPES[b.type];
      const label = def.label + (b.type === 'straight' ? ` (${b.value})` : '');
      const tr = document.createElement('tr');
      const playerCell = `<td><span class="row-dot" style="background:${playerColorVar(b.playerId, players)}"></span>${escapeHtml(b.playerName)}</td>`;
      const betCell = `<td>${label}</td>`;
      const amountCell = `<td>${b.amount.toLocaleString()}</td>`;
      const resultCell = b.resolved
        ? `<td class="${b.win ? 'result-win' : 'result-loss'}">${b.win ? 'Won +' : 'Lost '}${b.net.toLocaleString()}</td>`
        : '<td></td>';
      tr.innerHTML = playerCell + betCell + amountCell + resultCell;
      if (!b.resolved && options.canRemove && options.canRemove(b)) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-small';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => options.onRemove && options.onRemove(b));
        tr.lastElementChild.appendChild(btn);
      }
      tbodyEl.appendChild(tr);
    });
    return pendingBets.length;
  }

  function renderResultsTicker(containerEl, history) {
    containerEl.innerHTML = '';
    history.slice(0, 24).forEach(spin => {
      const chip = document.createElement('div');
      chip.className = 'ticker-chip';
      chip.style.background = spin.color === 'red' ? '#a8121f' : (spin.color === 'black' ? '#161616' : '#0d7a3f');
      chip.textContent = spin.number;
      chip.title = new Date(spin.timestamp).toLocaleString();
      containerEl.appendChild(chip);
    });
  }

  function renderRoundSummary(containerEl, roundResolved, pendingBets, players) {
    if (!roundResolved) { containerEl.hidden = true; containerEl.innerHTML = ''; return; }
    containerEl.hidden = false;
    if (pendingBets.length === 0) { containerEl.innerHTML = '<p class="round-summary-empty">No bets were placed this round.</p>'; return; }
    const winners = pendingBets.filter(b => b.win);
    if (winners.length === 0) { containerEl.innerHTML = '<p class="round-summary-empty">No winning bets this round.</p>'; return; }
    containerEl.innerHTML = '<ul class="winners-list">' + winners.map(w => `
      <li>
        <span class="winner-dot" style="background:${playerColorVar(w.playerId, players)}"></span>
        <strong>${escapeHtml(w.playerName)}</strong> won
        <span class="winner-amount">+${w.net.toLocaleString()}</span>
        on ${w.typeLabel} <span class="muted">(${w.odds}:1)</span>
      </li>`).join('') + '</ul>';
  }

  return {
    escapeHtml, playerColorVar, showToast, showTooltip, positionTooltip, hideTooltip,
    loadPlayerIdentity, savePlayerIdentity, clearPlayerIdentity,
    buildWheel, computeSpinRotation, animateWheel,
    buildBettingBoard, renderBoardChips, renderPayoutReference, cellSelector,
    buildChipTray, updateChipTraySelection,
    computePlayerStats, computeNumberCounts, computeColorCounts,
    renderSummaryTiles, renderNumberChart, renderColorChart, renderPlayerChart,
    renderPlayerStatsTable, renderBetsTable, renderResultsTicker, renderRoundSummary,
  };
})();
