/**
 * 🐛 Tech God Bug 2026 — Mongo Session Store
 *
 * Backs up each user's Baileys auth-state directory (sessions/<phone>/*.json)
 * into MongoDB, and restores it on boot if the local disk copy is missing
 * (e.g. after a redeploy on a host that wipes the filesystem).
 *
 * We deliberately mirror the *files* Baileys already writes with
 * useMultiFileAuthState, rather than re-implementing the auth-state
 * key/value contract directly against Mongo. That keeps Baileys' own
 * (well-tested) serialization in charge of correctness, and Mongo is
 * just a durable backup target.
 *
 * By Keith Tech
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const mongo = require('./mongo');

function _log(...args) { console.log('[MongoSession]', ...args); }

const COLLECTION = 'wa_sessions';

// Debounce so we don't hammer Mongo on every single creds.update tick.
const _pendingSave = new Map(); // phone -> timeout handle
const SAVE_DEBOUNCE_MS = 4000;

// ── Read every file in a session dir into a plain object ─────────────────────
function _readDirAsBlob(sessionDir) {
  const blob = {};
  if (!fs.existsSync(sessionDir)) return blob;
  for (const file of fs.readdirSync(sessionDir)) {
    const full = path.join(sessionDir, file);
    try {
      if (fs.statSync(full).isFile()) {
        blob[file] = fs.readFileSync(full, 'utf8');
      }
    } catch (e) {
      _log(`Could not read ${file}:`, e.message);
    }
  }
  return blob;
}

// ── Write a blob object back out to a session dir ────────────────────────────
function _writeBlobToDir(blob, sessionDir) {
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  for (const [file, content] of Object.entries(blob)) {
    try {
      fs.writeFileSync(path.join(sessionDir, file), content, 'utf8');
    } catch (e) {
      _log(`Could not restore ${file}:`, e.message);
    }
  }
}

// ── Immediately persist the current on-disk session for a phone into Mongo ───
async function saveNow(phone, sessionDir) {
  if (!mongo.isEnabled()) return false;
  try {
    const db = await mongo.getDb();
    if (!db) return false;
    const blob = _readDirAsBlob(sessionDir);
    if (Object.keys(blob).length === 0) return false;
    await db.collection(COLLECTION).updateOne(
      { phone },
      { $set: { phone, files: blob, updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    _log(`Save failed for ${phone}:`, e.message);
    return false;
  }
}

// ── Debounced save — call this often (e.g. on every creds.update) safely ─────
function saveDebounced(phone, sessionDir) {
  if (!mongo.isEnabled()) return;
  if (_pendingSave.has(phone)) clearTimeout(_pendingSave.get(phone));
  const handle = setTimeout(() => {
    _pendingSave.delete(phone);
    saveNow(phone, sessionDir).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
  _pendingSave.set(phone, handle);
}

// ── Restore a session from Mongo onto disk, if disk copy is missing/empty ────
// Returns true if it restored something.
async function restoreIfMissing(phone, sessionDir) {
  if (!mongo.isEnabled()) return false;

  const hasLocal = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
  if (hasLocal) return false;

  try {
    const db = await mongo.getDb();
    if (!db) return false;
    const doc = await db.collection(COLLECTION).findOne({ phone });
    if (!doc || !doc.files || Object.keys(doc.files).length === 0) return false;
    _writeBlobToDir(doc.files, sessionDir);
    _log(`♻️  Restored session for ${phone} from MongoDB`);
    return true;
  } catch (e) {
    _log(`Restore failed for ${phone}:`, e.message);
    return false;
  }
}

// ── List all phone numbers that have a backup in Mongo ───────────────────────
async function listBackedUpPhones() {
  if (!mongo.isEnabled()) return [];
  try {
    const db = await mongo.getDb();
    if (!db) return [];
    const docs = await db.collection(COLLECTION).find({}, { projection: { phone: 1 } }).toArray();
    return docs.map((d) => d.phone);
  } catch (e) {
    _log('List failed:', e.message);
    return [];
  }
}

// ── Remove a phone's backup (on logout/destroy) ───────────────────────────────
async function remove(phone) {
  if (_pendingSave.has(phone)) {
    clearTimeout(_pendingSave.get(phone));
    _pendingSave.delete(phone);
  }
  if (!mongo.isEnabled()) return;
  try {
    const db = await mongo.getDb();
    if (!db) return;
    await db.collection(COLLECTION).deleteOne({ phone });
  } catch (e) {
    _log(`Delete failed for ${phone}:`, e.message);
  }
}

module.exports = { saveNow, saveDebounced, restoreIfMissing, listBackedUpPhones, remove };
