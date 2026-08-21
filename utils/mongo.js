/**
 * 🐛 Tech God Bug 2026 — MongoDB Connection Manager
 *
 * Handles connecting to MongoDB for WhatsApp session backup/restore.
 * This is separate from the local JSON database (database.js), which
 * keeps handling groups/users/premium/etc. exactly as before.
 *
 * "Strong" here means:
 *  - Never crashes the process if Mongo is unreachable
 *  - Retries with exponential backoff instead of giving up
 *  - Reconnects automatically if the connection drops
 *  - Sensible pool/timeouts so a slow/dead cluster doesn't hang the bot
 *
 * By Keith Tech
 */
'use strict';

const config = require('../config');

let MongoClient = null;
try {
  ({ MongoClient } = require('mongodb'));
} catch {
  // "mongodb" not installed — handled gracefully below.
}

let _client = null;
let _db = null;
let _connecting = null;
let _reconnectAttempt = 0;
let _lastError = null;

function _log(...args) { console.log('[Mongo]', ...args); }

function isEnabled() {
  return !!config.mongoUri && !!MongoClient;
}

function isConnected() {
  return !!_db && !!_client && _client.topology && _client.topology.isConnected?.();
}

function _backoff(attempt) {
  return Math.min(30000, 1500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 1000);
}

// ── Connect (idempotent — safe to call repeatedly) ───────────────────────────
async function connect() {
  if (!config.mongoUri) {
    _log('MONGODB_URI not set — session backup to Mongo is disabled, running on local disk only.');
    return null;
  }
  if (!MongoClient) {
    _log('⚠️  "mongodb" package not installed. Run `npm install mongodb` to enable session backup.');
    return null;
  }
  if (_db) return _db;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    while (true) {
      try {
        _client = new MongoClient(config.mongoUri, {
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          maxPoolSize: 10,
          minPoolSize: 1,
          retryWrites: true,
          retryReads: true,
        });

        _client.on('close', () => {
          _log('⚠️  Connection closed — will reconnect on next use.');
          _db = null;
          _scheduleReconnect();
        });
        _client.on('error', (e) => {
          _lastError = e;
          _log('⚠️  Client error:', e.message);
        });

        await _client.connect();
        // Cheap ping to confirm the connection actually works, not just "opened".
        await _client.db('admin').command({ ping: 1 });

        _db = _client.db(config.mongoDbName);
        _reconnectAttempt = 0;
        _lastError = null;
        _log(`✅ Connected to MongoDB (db: ${config.mongoDbName})`);

        await _ensureIndexes(_db);
        return _db;
      } catch (e) {
        _lastError = e;
        const delay = _backoff(_reconnectAttempt++);
        _log(`❌ Connection failed (${e.message}) — retrying in ${Math.round(delay / 1000)}s`);
        await new Promise((r) => setTimeout(r, delay));
        // loop and retry
      }
    }
  })();

  const db = await _connecting;
  _connecting = null;
  return db;
}

function _scheduleReconnect() {
  if (_connecting) return;
  const delay = _backoff(_reconnectAttempt++);
  setTimeout(() => {
    connect().catch(() => {});
  }, delay);
}

async function _ensureIndexes(db) {
  try {
    await db.collection('wa_sessions').createIndex({ phone: 1 }, { unique: true });
    await db.collection('wa_sessions').createIndex({ updatedAt: 1 });
  } catch (e) {
    _log('Index setup warning:', e.message);
  }
}

// ── Get the db handle, connecting first if needed ────────────────────────────
async function getDb() {
  if (_db) return _db;
  return connect();
}

function status() {
  return {
    enabled: isEnabled(),
    connected: isConnected(),
    lastError: _lastError ? _lastError.message : null,
  };
}

async function connectWithTimeout(ms = 8000) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([connect(), timeout]);
}

module.exports = { connect, connectWithTimeout, getDb, isEnabled, isConnected, status };
