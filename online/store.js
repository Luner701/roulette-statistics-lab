'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const MAX_TABLES = 500;
const MAX_PLAYERS_PER_TABLE = 40;
const MAX_PENDING_BETS = 300;
const TABLE_IDLE_MS = 48 * 60 * 60 * 1000; // purge tables idle 48h+

let tables = new Map(); // id -> table

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw);
    tables = new Map(arr.map(t => [t.id, t]));
  } catch {
    tables = new Map();
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const arr = Array.from(tables.values());
    fs.writeFile(DATA_FILE, JSON.stringify(arr), () => {});
  }, 250);
}

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

function genJoinCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => JOIN_CODE_CHARS[crypto.randomInt(JOIN_CODE_CHARS.length)]).join('');
  } while (Array.from(tables.values()).some(t => t.joinCode === code));
  return code;
}

function createTable(name) {
  if (tables.size >= MAX_TABLES) cleanupIdle();
  const table = {
    id: crypto.randomUUID(),
    joinCode: genJoinCode(),
    name: (name || '').trim().slice(0, 40) || 'Roulette Table',
    adminToken: genToken(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: [],
    pendingBets: [],
    history: [],
    roundResolved: false,
    spinSeq: 0,
  };
  tables.set(table.id, table);
  scheduleSave();
  return table;
}

function findByCode(code) {
  code = (code || '').trim().toUpperCase();
  return Array.from(tables.values()).find(t => t.joinCode === code);
}

function getTable(id) {
  return tables.get(id);
}

function touch(table) {
  table.lastActivity = Date.now();
}

function cleanupIdle() {
  const now = Date.now();
  for (const [id, t] of tables) {
    if (now - t.lastActivity > TABLE_IDLE_MS) tables.delete(id);
  }
  scheduleSave();
}
setInterval(cleanupIdle, 60 * 60 * 1000).unref();

function listTables() {
  return Array.from(tables.values())
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map(t => ({
      id: t.id,
      joinCode: t.joinCode,
      name: t.name,
      adminToken: t.adminToken,
      createdAt: t.createdAt,
      lastActivity: t.lastActivity,
      playerCount: t.players.length,
      spinCount: t.history.length,
    }));
}

function deleteTables(ids) {
  ids.forEach(id => tables.delete(id));
  scheduleSave();
}

module.exports = {
  loadFromDisk,
  createTable,
  findByCode,
  getTable,
  touch,
  scheduleSave,
  genToken,
  listTables,
  deleteTables,
  MAX_PLAYERS_PER_TABLE,
  MAX_PENDING_BETS,
};
