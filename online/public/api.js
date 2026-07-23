'use strict';

const RouletteAPI = (function () {
  async function req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    createTable: (name) => req('POST', '/api/tables', { name }),
    findByCode: (code) => req('GET', `/api/tables/by-code/${encodeURIComponent(code)}`),
    getState: (tableId) => req('GET', `/api/tables/${tableId}/state`),
    registerPlayer: (tableId, name, startingBalance) => req('POST', `/api/tables/${tableId}/players`, { name, startingBalance }),
    deletePlayers: (tableId, adminToken, opts) => req('DELETE', `/api/tables/${tableId}/players`, { adminToken, ids: opts.ids, all: opts.all }),
    placeBet: (tableId, playerId, playerToken, type, value, amount) => req('POST', `/api/tables/${tableId}/bets`, { playerId, playerToken, type, value, amount }),
    removeBet: (tableId, betId, playerId, playerToken) => req('DELETE', `/api/tables/${tableId}/bets/${betId}`, { playerId, playerToken }),
    spin: (tableId, adminToken) => req('POST', `/api/tables/${tableId}/spin`, { adminToken }),
    newRound: (tableId, adminToken) => req('POST', `/api/tables/${tableId}/new-round`, { adminToken }),
    resetTable: (tableId, adminToken) => req('POST', `/api/tables/${tableId}/reset`, { adminToken }),
    exportUrl: (tableId, adminToken) => `/api/tables/${tableId}/export?adminToken=${encodeURIComponent(adminToken)}`,

    listAllTables: (key) => req('GET', `/api/admin/tables?key=${encodeURIComponent(key)}`),
    deleteTables: (key, opts) => req('DELETE', '/api/admin/tables', { key, ids: opts.ids, all: opts.all }),
  };
})();
