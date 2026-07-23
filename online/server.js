'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { BET_TYPES, colorOf, WHEEL_ORDER, POCKETS } = require('./public/domain.js');

store.loadFromDisk();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireTable(req, res, next) {
  const table = store.getTable(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found. It may have expired.' });
  req.table = table;
  next();
}

function requireAdmin(req, res, next) {
  const token = (req.body && req.body.adminToken) || req.query.adminToken;
  if (!token || token !== req.table.adminToken) return res.status(403).json({ error: 'Admin link required for this action.' });
  next();
}

function requirePlayer(req, res, next) {
  const { playerId, playerToken } = req.body || {};
  const player = req.table.players.find(p => p.id === playerId && p.token === playerToken);
  if (!player) return res.status(403).json({ error: 'You are not recognized at this table. Try re-registering.' });
  req.player = player;
  next();
}

function publicTableView(table) {
  return {
    id: table.id,
    joinCode: table.joinCode,
    name: table.name,
    createdAt: table.createdAt,
    players: table.players.map(p => ({ id: p.id, name: p.name, balance: p.balance })),
    pendingBets: table.pendingBets,
    history: table.history,
    roundResolved: table.roundResolved,
    spinSeq: table.spinSeq,
  };
}

app.post('/api/tables', (req, res) => {
  const table = store.createTable(req.body && req.body.name);
  res.json({ tableId: table.id, joinCode: table.joinCode, adminToken: table.adminToken, name: table.name });
});

app.get('/api/tables/by-code/:code', (req, res) => {
  const table = store.findByCode(req.params.code);
  if (!table) return res.status(404).json({ error: 'No table found with that code.' });
  res.json({ tableId: table.id, name: table.name });
});

app.get('/api/tables/:id/state', requireTable, (req, res) => {
  res.json(publicTableView(req.table));
});

app.post('/api/tables/:id/players', requireTable, (req, res) => {
  const table = req.table;
  if (table.players.length >= store.MAX_PLAYERS_PER_TABLE) {
    return res.status(400).json({ error: 'This table is full.' });
  }
  const name = ((req.body && req.body.name) || '').trim().slice(0, 24);
  if (!name) return res.status(400).json({ error: 'Enter a name to register.' });
  let startingBalance = parseInt(req.body && req.body.startingBalance, 10);
  if (!(startingBalance > 0)) startingBalance = 1000;
  startingBalance = Math.min(startingBalance, 1000000);

  const player = { id: crypto.randomUUID(), name, balance: startingBalance, token: store.genToken(), createdAt: Date.now() };
  table.players.push(player);
  store.touch(table);
  store.scheduleSave();
  res.json({ playerId: player.id, playerToken: player.token, tableId: table.id, state: publicTableView(table) });
});

app.delete('/api/tables/:id/players', requireTable, requireAdmin, (req, res) => {
  const table = req.table;
  const ids = new Set((req.body && req.body.ids) || []);
  if (req.body && req.body.all) table.players.forEach(p => ids.add(p.id));
  table.players = table.players.filter(p => !ids.has(p.id));
  table.pendingBets = table.pendingBets.filter(b => !ids.has(b.playerId));
  store.touch(table);
  store.scheduleSave();
  res.json(publicTableView(table));
});

app.post('/api/tables/:id/bets', requireTable, requirePlayer, (req, res) => {
  const table = req.table;
  if (table.roundResolved) return res.status(400).json({ error: 'Round already resolved — wait for the host to start the next round.' });

  const type = req.body && req.body.type;
  const def = BET_TYPES[type];
  if (!def) return res.status(400).json({ error: 'Unknown bet type.' });

  const amount = parseInt(req.body && req.body.amount, 10);
  if (!(amount > 0)) return res.status(400).json({ error: 'Chip amount must be greater than 0.' });

  if (table.pendingBets.length >= store.MAX_PENDING_BETS) {
    return res.status(400).json({ error: 'Too many bets placed this round.' });
  }

  const value = type === 'straight' ? parseInt(req.body.value, 10) : null;
  if (type === 'straight' && !(value >= 0 && value <= 36)) {
    return res.status(400).json({ error: 'Pick a number from 0 to 36.' });
  }

  const alreadyPending = table.pendingBets
    .filter(b => b.playerId === req.player.id)
    .reduce((s, b) => s + b.amount, 0);
  if (alreadyPending + amount > req.player.balance) {
    return res.status(400).json({ error: `Only ${req.player.balance - alreadyPending} available to bet.` });
  }

  const existing = table.pendingBets.find(b => b.playerId === req.player.id && b.type === type && b.value === value);
  if (existing) {
    existing.amount += amount;
  } else {
    table.pendingBets.push({
      id: crypto.randomUUID(),
      playerId: req.player.id,
      playerName: req.player.name,
      type,
      value,
      amount,
    });
  }
  store.touch(table);
  store.scheduleSave();
  res.json(publicTableView(table));
});

app.delete('/api/tables/:id/bets/:betId', requireTable, requirePlayer, (req, res) => {
  const table = req.table;
  if (table.roundResolved) return res.status(400).json({ error: 'Round already resolved — wait for the host to start the next round.' });
  const bet = table.pendingBets.find(b => b.id === req.params.betId);
  if (bet && bet.playerId !== req.player.id) return res.status(403).json({ error: 'That is not your bet.' });
  table.pendingBets = table.pendingBets.filter(b => b.id !== req.params.betId);
  store.touch(table);
  store.scheduleSave();
  res.json(publicTableView(table));
});

app.post('/api/tables/:id/spin', requireTable, requireAdmin, (req, res) => {
  const table = req.table;
  if (table.roundResolved) return res.status(400).json({ error: 'Click New Bet before spinning again.' });

  const winningIndex = crypto.randomInt(POCKETS);
  const winningNumber = WHEEL_ORDER[winningIndex];
  const winningColor = colorOf(winningNumber);

  table.pendingBets.forEach(bet => {
    const def = BET_TYPES[bet.type];
    const win = def.check(bet.value, winningNumber);
    const player = table.players.find(p => p.id === bet.playerId);
    const net = win ? bet.amount * def.odds : -bet.amount;
    if (player) player.balance += net;
    bet.typeLabel = def.label + (bet.type === 'straight' ? ` (${bet.value})` : '');
    bet.odds = def.odds;
    bet.win = win;
    bet.net = net;
    bet.resolved = true;
  });

  table.history.unshift({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    number: winningNumber,
    color: winningColor,
    results: JSON.parse(JSON.stringify(table.pendingBets)),
  });
  table.roundResolved = true;
  table.spinSeq += 1;
  store.touch(table);
  store.scheduleSave();
  res.json(publicTableView(table));
});

app.post('/api/tables/:id/new-round', requireTable, requireAdmin, (req, res) => {
  req.table.pendingBets = [];
  req.table.roundResolved = false;
  store.touch(req.table);
  store.scheduleSave();
  res.json(publicTableView(req.table));
});

app.post('/api/tables/:id/reset', requireTable, requireAdmin, (req, res) => {
  req.table.players = [];
  req.table.pendingBets = [];
  req.table.history = [];
  req.table.roundResolved = false;
  req.table.spinSeq = 0;
  store.touch(req.table);
  store.scheduleSave();
  res.json(publicTableView(req.table));
});

app.get('/api/tables/:id/export', requireTable, requireAdmin, (req, res) => {
  res.json(req.table);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Roulette Statistics Lab (online) listening on port ${PORT}`);
});
