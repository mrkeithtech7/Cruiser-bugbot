/**
 * 🐛 Tech God Bug 2026 v2.5.0.5.7 — Multi-User Session Manager
 *
 * Manages multiple independent Baileys bot instances.
 * Each user has their own isolated session directory, socket, and state.
 *
 * sessions/<phone>/   <- Baileys auth state files
 *
 * By Keith. Tech
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const pino = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('baileys');

const config    = require('./config');
const antiban   = require('./utils/antiban');
const handler   = require('./handler');
const { decodeSession, clearSession } = require('./utils/session');
const welcomeMod  = require('./commands/group/welcome');
const autoProtect = require('./utils/autoprotect');
const mongo             = require('./utils/mongo');
const mongoSessionStore = require('./utils/mongoSessionStore');

// ── Root directory for all user sessions ─────────────────────────────────────
const SESSIONS_ROOT = path.resolve(process.env.SESSIONS_ROOT || './sessions');
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

// ── WA version cache ─────────────────────────────────────────────────────────
let _cachedVersion    = null;
let _versionFetchedAt = 0;
const VERSION_TTL_MS  = 6 * 60 * 60 * 1000;

async function _getVersion() {
  if (_cachedVersion && (Date.now() - _versionFetchedAt) < VERSION_TTL_MS) return _cachedVersion;

  // Retry a few times before giving up — a stale/wrong hardcoded version
  // number is a common cause of "pairing code issued but phone never links"
  // because WhatsApp silently rejects the handshake on a mismatched client
  // version. If every attempt fails, we return null and let Baileys use its
  // own bundled default version instead of guessing.
  for (let i = 0; i < 3; i++) {
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      _cachedVersion    = version;
      _versionFetchedAt = Date.now();
      _log(`WA version: ${version.join('.')}${isLatest ? '' : ' (not latest)'}`);
      return _cachedVersion;
    } catch (e) {
      _log(`fetchLatestBaileysVersion attempt ${i + 1}/3 failed:`, e.message);
      if (i < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (_cachedVersion) return _cachedVersion; // reuse last known-good version
  _log('⚠️  Could not fetch WA version — letting Baileys use its own bundled default.');
  return null;
}

// ── In-memory registry ───────────────────────────────────────────────────────
const _bots = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function _log(...args) { console.log('[SessionManager]', ...args); }

function _sessionDir(phone) {
  return path.join(SESSIONS_ROOT, phone);
}

function maskPhone(phone) {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length <= 6) return '+' + s;
  return '+' + s.slice(0, 3) + '***' + s.slice(-4);
}

// ── Boot all previously-saved sessions on startup ─────────────────────────────
async function bootSavedSessions() {
  await _getVersion();

  // Kick off Mongo connection in the background (non-blocking — if the URI
  // is unreachable it keeps retrying with backoff instead of hanging boot).
  mongo.connect().catch(() => {});

  const localDirs = fs.existsSync(SESSIONS_ROOT)
    ? fs.readdirSync(SESSIONS_ROOT).filter(d => fs.statSync(path.join(SESSIONS_ROOT, d)).isDirectory())
    : [];

  // Also pull in any phones that have a Mongo backup but no local dir
  // (e.g. the host wiped disk on redeploy) — bounded so a slow/unreachable
  // Mongo can never hang the boot sequence.
  let mongoPhones = [];
  if (mongo.isEnabled()) {
    mongoPhones = await Promise.race([
      mongoSessionStore.listBackedUpPhones(),
      new Promise((resolve) => setTimeout(() => resolve([]), 8000)),
    ]);
  }

  const allPhones = Array.from(new Set([...localDirs, ...mongoPhones]));
  _log(`Found ${localDirs.length} local session(s), ${mongoPhones.length} Mongo backup(s) — booting ${allPhones.length} total`);

  for (const phone of allPhones) {
    try {
      await Promise.race([
        mongoSessionStore.restoreIfMissing(phone, _sessionDir(phone)),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      await createBot(phone);
    } catch (e) {
      _log(`Failed to boot session ${maskPhone(phone)}:`, e.message);
    }
  }

  _startWatchdog();
}

// ── Fresh in-memory bot record ────────────────────────────────────────────────
function _newBotRecord(phone, sessionDir) {
  return {
    phone,
    sessionDir,
    connected: false,
    socketReady: false,
    number: phone,
    socket: null,
    qr: null,
    qrResolve: null,
    pairCodeResolve: null,
    pairCodeReject: null,
    pairCodeRequested: false,
    startedAt: Date.now(),
    attempt: 0,
    destroyed: false,
    lastDisconnectedAt: null,
  };
}

// ── Create / connect a bot instance (no pairing, just boot) ──────────────────
async function createBot(phone) {
  if (_bots.has(phone) && !_bots.get(phone).destroyed) {
    const existing = _bots.get(phone);
    if (existing.connected) return existing;
  }

  const sessionDir = _sessionDir(phone);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const bot = _newBotRecord(phone, sessionDir);

  _bots.set(phone, bot);
  await _connectSocket(bot);
  return bot;
}

// ── Request pairing code for a phone number ──────────────────────────────────
// Returns a promise that resolves with the 8-char pairing code
async function requestPairCode(phone) {
  // Clear any existing session for fresh pairing
  const sessionDir = _sessionDir(phone);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  mongoSessionStore.remove(phone).catch(() => {}); // don't let a stale Mongo backup get restored later

  // Destroy existing bot if any
  if (_bots.has(phone)) {
    const old = _bots.get(phone);
    old.destroyed = true;
    try { old.socket?.end(); } catch {}
    _bots.delete(phone);
  }

  fs.mkdirSync(sessionDir, { recursive: true });

  const bot = _newBotRecord(phone, sessionDir);

  _bots.set(phone, bot);

  // Create promise that will resolve when pairing code is obtained
  const codePromise = new Promise((resolve, reject) => {
    bot.pairCodeResolve = resolve;
    bot.pairCodeReject = reject;
  });

  await _connectSocket(bot);
  return codePromise;
}

// ── Request QR for a phone number ────────────────────────────────────────────
// Returns a promise that resolves with the QR string
async function requestQR(phone) {
  // Clear any existing session for fresh QR
  const sessionDir = _sessionDir(phone);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  mongoSessionStore.remove(phone).catch(() => {});

  // Destroy existing bot if any
  if (_bots.has(phone)) {
    const old = _bots.get(phone);
    old.destroyed = true;
    try { old.socket?.end(); } catch {}
    _bots.delete(phone);
  }

  fs.mkdirSync(sessionDir, { recursive: true });

  const bot = _newBotRecord(phone, sessionDir);

  _bots.set(phone, bot);

  // Create promise that will resolve when QR is generated
  const qrPromise = new Promise((resolve, reject) => {
    bot.qrResolve = resolve;
    // Timeout after 30s
    setTimeout(() => reject(new Error('QR generation timeout')), 30000);
  });

  await _connectSocket(bot);
  return qrPromise;
}

// ── Internal socket connection ───────────────────────────────────────────────
async function _connectSocket(bot) {
  if (bot.destroyed) return;

  bot.attempt++;
  const version = await _getVersion();
  const { state, saveCreds } = await useMultiFileAuthState(bot.sessionDir);

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    ...(version ? { version } : {}), // omit if unknown rather than risk a stale hardcoded value
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Tech God Bug 2026', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 25000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  bot.socket = sock;

  // ── Credentials update ─────────────────────────────────────────────────────
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    mongoSessionStore.saveDebounced(bot.phone, bot.sessionDir);
  });

  // ── Request pairing code immediately ─────────────────────────────────────
  // Per Baileys' documented flow, requestPairingCode() must be called right
  // after the socket is created — NOT after waiting for a 'qr' event. Baileys
  // queues the request internally until the WS is actually open. Waiting for
  // 'qr' (the old behavior here) put the request outside the tight timing
  // window WhatsApp expects, which is why a code would be issued but the
  // phone's "Link a device" prompt never completed.
  if (bot.pairCodeResolve && !bot.pairCodeRequested && !state.creds?.registered) {
    bot.pairCodeRequested = true;
    (async () => {
      try {
        const code = await sock.requestPairingCode(bot.phone);
        _log(`✅ Pairing code for ${maskPhone(bot.phone)}: ${code}`);
        if (bot.pairCodeResolve) bot.pairCodeResolve(code);
      } catch (e) {
        _log(`❌ Pairing code failed for ${maskPhone(bot.phone)}:`, e.message);
        if (bot.pairCodeReject) bot.pairCodeReject(e);
      }
      bot.pairCodeResolve = null;
      bot.pairCodeReject = null;
    })();
  }

  // ── Connection update ──────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR generated (only meaningful for the QR-scan flow now) ──────────────
    if (qr) {
      bot.qr = qr;
      if (bot.qrResolve) {
        _log(`QR generated for ${maskPhone(bot.phone)}`);
        bot.qrResolve(qr);
        bot.qrResolve = null;
      }
    }

    // ── Connected ────────────────────────────────────────────────────────────
    if (connection === 'open') {
      bot.connected         = true;
      bot.socketReady       = true;
      bot.qr                = null;
      bot.attempt           = 0;
      bot.lastDisconnectedAt = null;
      const me = sock.user?.id?.split(':')[0] || bot.phone;
      bot.number = me;
      _log(`✅ Connected: ${maskPhone(me)}`);
      // Durable backup the moment pairing actually completes, not just on the debounce.
      mongoSessionStore.saveNow(bot.phone, bot.sessionDir).catch(() => {});
    }

    // ── Disconnected ─────────────────────────────────────────────────────────
    if (connection === 'close') {
      bot.connected   = false;
      bot.socketReady = false;
      bot.lastDisconnectedAt = Date.now();

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        _log(`Session logged out: ${maskPhone(bot.phone)}`);
        clearSession(bot.sessionDir);
        mongoSessionStore.remove(bot.phone).catch(() => {});
        bot.destroyed = true;
        _bots.delete(bot.phone);
        return;
      }

      if (shouldReconnect && !bot.destroyed) {
        let delay;
        if (statusCode === DisconnectReason.restartRequired) {
          // Expected mid-pairing close — WhatsApp intentionally closes the
          // socket right after a pairing code is issued and expects an
          // almost-immediate reconnect on the SAME auth state to finish the
          // handshake. A slow backoff here is what let the pairing code
          // expire before the phone ever completed linking.
          delay = 350;
          bot.attempt = 0; // don't let an expected restart inflate future backoff
        } else {
          delay = antiban.reconnectDelay(bot.attempt);
        }
        _log(`Reconnecting ${maskPhone(bot.phone)} in ${Math.round(delay / 1000)}s (attempt ${bot.attempt}, code ${statusCode})`);
        setTimeout(() => _connectSocket(bot), delay);
      }
    }
  });

  // ── Message handler ────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async (m) => {
    if (!m.messages || !m.messages.length) return;
    for (const msg of m.messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      try {
        await handler(sock, msg, bot);
      } catch (e) {
        console.error('[Handler Error]', e.message);
      }
    }
  });

  // ── Group participants update (welcome/goodbye) ────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await welcomeMod.handleGroupUpdate(sock, update);
    } catch {}
  });
}

// ── Destroy a session ────────────────────────────────────────────────────────
async function destroySession(phone) {
  const bot = _bots.get(phone);
  if (!bot) return false;
  bot.destroyed = true;
  try { bot.socket?.end(); } catch {}
  clearSession(bot.sessionDir);
  mongoSessionStore.remove(phone).catch(() => {});
  _bots.delete(phone);
  _log(`Destroyed session: ${maskPhone(phone)}`);
  return true;
}

// ── Watchdog: auto-restart any bot that's been dead too long ────────────────
// The close handler above already reconnects on every disconnect, but this
// is a safety net in case that chain ever silently stops (e.g. an uncaught
// synchronous throw). Runs continuously for the life of the process.
const WATCHDOG_INTERVAL_MS = 2 * 60 * 1000; // check every 2 minutes
const WATCHDOG_STALE_MS    = 5 * 60 * 1000; // force-reconnect if dead > 5 minutes
let _watchdogStarted = false;

function _startWatchdog() {
  if (_watchdogStarted) return;
  _watchdogStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const bot of _bots.values()) {
      if (bot.destroyed || bot.connected) continue;
      if (!bot.lastDisconnectedAt) continue;
      if (now - bot.lastDisconnectedAt > WATCHDOG_STALE_MS) {
        _log(`⚠️  Watchdog: ${maskPhone(bot.phone)} has been offline for ${Math.round((now - bot.lastDisconnectedAt) / 60000)}m — forcing reconnect`);
        bot.lastDisconnectedAt = now; // reset so we don't hammer it every tick
        bot.attempt = 0;
        _connectSocket(bot).catch((e) => _log('Watchdog reconnect failed:', e.message));
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}

// ── Public getters ───────────────────────────────────────────────────────────
function getBot(phone)  { return _bots.get(phone) || null; }
function getAllBots()    { return Array.from(_bots.values()); }
function getMongoStatus() { return mongo.status(); }

module.exports = {
  bootSavedSessions,
  createBot,
  destroySession,
  requestPairCode,
  requestQR,
  getBot,
  getAllBots,
  maskPhone,
  getMongoStatus,
};
