/**
 * 🐛 Tech God Bug 2026 v2.5.0.5.7 — Express Web Server
 * Provides: health check, pairing endpoint, QR endpoint, admin panel, dashboard.
 * By Keith Tech
 */
'use strict';

const express        = require('express');
const qrcode         = require('qrcode');
const config         = require('./config');
const sessionManager = require('./sessionManager');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (for Render / Railway) ──────────────────────────────────────
// ── Root: send visitors straight to the pairing page ────────────────────────
// (Render/Railway health checks should point at /health or /status instead.)
app.get('/', (req, res) => {
  res.redirect('/pair');
});

app.get('/status', (req, res) => {
  const bots = sessionManager.getAllBots();
  const connected = bots.filter(b => b.connected).length;
  res.json({
    bot: config.botName,
    version: config.botVersion,
    status: 'running',
    bots: { total: bots.length, connected },
    uptime: Math.floor(process.uptime()) + 's',
  });
});

app.get('/health', (req, res) => res.sendStatus(200));

// ── Pairing page (GET) ──────────────────────────────────────────────────────
app.get('/pair', (req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${config.botName} · Pair Device</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-0: #060a17;
      --bg-1: #0b1226;
      --panel: #101a34;
      --panel-2: #0d1730;
      --border: #1f2c50;
      --blue: #3b82f6;
      --blue-2: #60a5fa;
      --cyan: #22d3ee;
      --text: #e6ecff;
      --text-dim: #8a96c2;
      --ok: #34d399;
      --err: #f87171;
      --warn: #fbbf24;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: var(--text);
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at 15% 10%, rgba(59,130,246,0.25), transparent 40%),
        radial-gradient(circle at 85% 90%, rgba(34,211,238,0.18), transparent 45%),
        linear-gradient(180deg, var(--bg-0), var(--bg-1));
      background-attachment: fixed;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px);
      background-size: 42px 42px;
      pointer-events: none;
      mask-image: radial-gradient(circle at 50% 30%, black, transparent 75%);
    }
    .card {
      position: relative;
      background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 40px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.06) inset;
      backdrop-filter: blur(10px);
    }
    .icon-badge {
      width: 64px; height: 64px;
      margin: 0 auto 18px;
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--blue), var(--cyan));
      box-shadow: 0 8px 24px rgba(59,130,246,0.4);
      font-size: 1.6rem;
      color: #04101f;
    }
    h1 { font-size: 1.6rem; margin-bottom: 6px; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-dim); margin-bottom: 26px; font-size: 0.9rem; }
    .tabs { display: flex; gap: 8px; margin-bottom: 24px; padding: 5px; border-radius: 12px; background: var(--bg-0); border: 1px solid var(--border); }
    .tab {
      flex: 1; padding: 11px; cursor: pointer; background: transparent; color: var(--text-dim);
      font-weight: 600; border: none; border-radius: 8px; font-size: 0.88rem;
      transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .tab i { font-size: 0.9rem; }
    .tab.active { background: linear-gradient(135deg, var(--blue), #2563eb); color: #fff; box-shadow: 0 4px 14px rgba(59,130,246,0.4); }
    .field { position: relative; margin-bottom: 16px; }
    .field i.field-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-dim); font-size: 0.95rem; }
    input {
      width: 100%; padding: 14px 16px 14px 42px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--bg-0); color: #fff;
      font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
    button.action {
      width: 100%; padding: 14px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, var(--blue), var(--cyan)); color: #04101f;
      font-size: 1rem; font-weight: 700; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      box-shadow: 0 8px 20px rgba(59,130,246,0.35);
    }
    button.action:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(59,130,246,0.45); }
    button.action:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .result { margin-top: 18px; padding: 16px; border-radius: 12px; font-size: 0.95rem; display: none; text-align: left; }
    .result.show { display: block; }
    .result.success { background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.3); color: var(--ok); }
    .result.error { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); color: var(--err); }
    .result.loading { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); color: var(--warn); }
    .result-row { display: flex; align-items: center; gap: 10px; }
    .code { font-size: 2.1rem; letter-spacing: 8px; margin-top: 12px; font-weight: 800; text-align: center; color: var(--cyan); }
    .qr-img { margin-top: 16px; background: #fff; padding: 16px; border-radius: 14px; display: block; text-align: center; }
    .qr-img img { max-width: 240px; width: 100%; border-radius: 4px; }
    .instructions { margin-top: 20px; color: var(--text-dim); font-size: 0.82rem; text-align: left; list-style: none; }
    .instructions li { margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start; }
    .instructions li i { color: var(--blue-2); margin-top: 2px; width: 14px; text-align: center; }
    .section { display: none; }
    .section.active { display: block; }
    a.back { color: var(--blue-2); text-decoration: none; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 6px; }
    a.back:hover { color: var(--cyan); }
    .nav { margin-top: 24px; }
    .spin { animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge"><i class="fa-solid fa-link"></i></div>
    <h1>Pair Device</h1>
    <p class="subtitle">Connect your WhatsApp to ${config.botName}</p>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('code')"><i class="fa-solid fa-keyboard"></i> Pairing Code</button>
      <button class="tab" onclick="switchTab('qr')"><i class="fa-solid fa-qrcode"></i> QR Code</button>
    </div>

    <!-- Pairing Code Section -->
    <div id="section-code" class="section active">
      <div class="field">
        <i class="fa-solid fa-phone field-icon"></i>
        <input type="text" id="phone" placeholder="Phone number (e.g. 263786831091)" maxlength="15" />
      </div>
      <button class="action" id="btn-pair" onclick="requestPairCode()"><i class="fa-solid fa-key"></i> Get Pairing Code</button>
      <div id="result-code" class="result"></div>
      <ul class="instructions">
        <li><i class="fa-solid fa-circle-1"></i> Enter your number with country code (no + or spaces)</li>
        <li><i class="fa-solid fa-circle-2"></i> Open WhatsApp &gt; <strong>Settings &gt; Linked Devices</strong></li>
        <li><i class="fa-solid fa-circle-3"></i> Tap <strong>Link a Device</strong></li>
        <li><i class="fa-solid fa-circle-4"></i> Tap <strong>Link with phone number instead</strong></li>
        <li><i class="fa-solid fa-circle-5"></i> Enter the pairing code shown above</li>
      </ul>
    </div>

    <!-- QR Code Section -->
    <div id="section-qr" class="section">
      <div class="field">
        <i class="fa-solid fa-phone field-icon"></i>
        <input type="text" id="phone-qr" placeholder="Phone number (e.g. 263786831091)" maxlength="15" />
      </div>
      <button class="action" id="btn-qr" onclick="requestQR()"><i class="fa-solid fa-qrcode"></i> Generate QR Code</button>
      <div id="result-qr" class="result"></div>
      <ul class="instructions">
        <li><i class="fa-solid fa-circle-1"></i> Enter your number with country code (no + or spaces)</li>
        <li><i class="fa-solid fa-circle-2"></i> Open WhatsApp &gt; <strong>Settings &gt; Linked Devices</strong></li>
        <li><i class="fa-solid fa-circle-3"></i> Tap <strong>Link a Device</strong></li>
        <li><i class="fa-solid fa-circle-4"></i> Scan the QR code shown above with your camera</li>
      </ul>
    </div>

    <div class="nav"><a class="back" href="/dashboard"><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</a></div>
  </div>

  <script>
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('section-' + tab).classList.add('active');
      event.currentTarget.classList.add('active');
    }

    async function requestPairCode() {
      const phone = document.getElementById('phone').value.trim();
      const btn = document.getElementById('btn-pair');
      const result = document.getElementById('result-code');
      if (!/^\\d{9,15}$/.test(phone)) {
        result.className = 'result error show';
        result.innerHTML = '<div class="result-row"><i class="fa-solid fa-triangle-exclamation"></i> Invalid number. Use 9-15 digits only (no + or spaces).</div>';
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Requesting code...';
      result.className = 'result loading show';
      result.innerHTML = '<div class="result-row"><i class="fa-solid fa-spinner spin"></i> Connecting to WhatsApp... this may take up to 60s</div>';
      try {
        const res = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
        const data = await res.json();
        if (data.success) {
          result.className = 'result success show';
          result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-check"></i> Your pairing code</div><div class="code">' + data.code + '</div>';
        } else {
          result.className = 'result error show';
          result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-xmark"></i> ' + (data.error || 'Pairing failed. Try again.') + '</div>';
        }
      } catch (e) {
        result.className = 'result error show';
        result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-xmark"></i> Network error: ' + e.message + '</div>';
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-key"></i> Get Pairing Code';
    }

    async function requestQR() {
      const phone = document.getElementById('phone-qr').value.trim();
      const btn = document.getElementById('btn-qr');
      const result = document.getElementById('result-qr');
      if (!/^\\d{9,15}$/.test(phone)) {
        result.className = 'result error show';
        result.innerHTML = '<div class="result-row"><i class="fa-solid fa-triangle-exclamation"></i> Invalid number. Use 9-15 digits only (no + or spaces).</div>';
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Generating QR...';
      result.className = 'result loading show';
      result.innerHTML = '<div class="result-row"><i class="fa-solid fa-spinner spin"></i> Generating QR code... please wait</div>';
      try {
        const res = await fetch('/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
        const data = await res.json();
        if (data.success && data.qr) {
          result.className = 'result success show';
          result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-check"></i> Scan this QR code with WhatsApp</div><div class="qr-img"><img src="' + data.qr + '" alt="QR Code" /></div>';
        } else if (data.connected) {
          result.className = 'result success show';
          result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-check"></i> This number is already connected!</div>';
        } else {
          result.className = 'result error show';
          result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-xmark"></i> ' + (data.error || 'Could not generate QR. Try again.') + '</div>';
        }
      } catch (e) {
        result.className = 'result error show';
        result.innerHTML = '<div class="result-row"><i class="fa-solid fa-circle-xmark"></i> Network error: ' + e.message + '</div>';
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Generate QR Code';
    }
  </script>
</body>
</html>`;
  res.send(html);
});

// ── Pairing code endpoint (POST) ─────────────────────────────────────────────
app.post('/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{9,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number. Use digits only (10-15).' });
  }

  try {
    const code = await Promise.race([
      sessionManager.requestPairCode(phone),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Pairing timeout (60s). Try again.')), 60000)),
    ]);
    res.json({ success: true, code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── QR code endpoint (POST) ──────────────────────────────────────────────────
app.post('/qr', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{9,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number. Use digits only (10-15).' });
  }

  try {
    // Check if already connected
    const existing = sessionManager.getBot(phone);
    if (existing && existing.connected) {
      return res.json({ success: false, connected: true });
    }

    const qrData = await Promise.race([
      sessionManager.requestQR(phone),
      new Promise((_, rej) => setTimeout(() => rej(new Error('QR generation timeout (30s). Try again.')), 35000)),
    ]);

    if (!qrData) {
      return res.status(500).json({ error: 'Could not generate QR code.' });
    }

    // Convert QR string to data URL image
    const qrImage = await qrcode.toDataURL(qrData, { width: 300, margin: 2 });
    res.json({ success: true, qr: qrImage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── QR page (GET - direct link) ──────────────────────────────────────────────
app.get('/qr', (req, res) => {
  res.redirect('/pair');
});

// ── Bot status list ──────────────────────────────────────────────────────────
app.get('/bots', (req, res) => {
  const bots = sessionManager.getAllBots().map(b => ({
    phone: sessionManager.maskPhone(b.phone),
    connected: b.connected,
    uptime: Math.floor((Date.now() - b.startedAt) / 1000) + 's',
  }));
  res.json({ bots });
});

// ── Admin: destroy session ───────────────────────────────────────────────────
app.post('/admin/destroy', async (req, res) => {
  const { phone, secret } = req.body;
  if (secret !== config.adminSecret) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const ok = await sessionManager.destroySession(phone);
  res.json({ success: ok });
});

// ── Dashboard page ───────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  const bots = sessionManager.getAllBots();
  const connected = bots.filter(b => b.connected).length;

  const fmtUptime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${config.botName} · Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-0: #060a17;
      --bg-1: #0b1226;
      --panel: #101a34;
      --panel-2: #0d1730;
      --border: #1f2c50;
      --blue: #3b82f6;
      --blue-2: #60a5fa;
      --cyan: #22d3ee;
      --text: #e6ecff;
      --text-dim: #8a96c2;
      --ok: #34d399;
      --err: #f87171;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: var(--text);
      min-height: 100vh;
      padding: 40px 20px;
      background:
        radial-gradient(circle at 10% 0%, rgba(59,130,246,0.25), transparent 40%),
        radial-gradient(circle at 90% 100%, rgba(34,211,238,0.16), transparent 45%),
        linear-gradient(180deg, var(--bg-0), var(--bg-1));
      background-attachment: fixed;
      position: relative;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px);
      background-size: 42px 42px;
      pointer-events: none;
      mask-image: radial-gradient(circle at 50% 0%, black, transparent 70%);
    }
    .wrap { max-width: 720px; margin: 0 auto; position: relative; }
    .header { text-align: center; margin-bottom: 34px; }
    .header .icon-badge {
      width: 68px; height: 68px; margin: 0 auto 16px;
      border-radius: 18px; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--blue), var(--cyan));
      box-shadow: 0 10px 30px rgba(59,130,246,0.4);
      font-size: 1.7rem; color: #04101f;
    }
    .header h1 { font-size: 1.9rem; letter-spacing: -0.02em; }
    .header p { color: var(--text-dim); margin-top: 6px; font-size: 0.92rem; }

    .stats { display: flex; gap: 14px; justify-content: center; margin-bottom: 34px; flex-wrap: wrap; }
    .stat {
      background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid var(--border); border-radius: 14px;
      padding: 18px 28px; text-align: center; min-width: 130px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }
    .stat i { color: var(--blue-2); font-size: 1.1rem; margin-bottom: 8px; display: block; }
    .stat .num { font-size: 1.8rem; color: #fff; font-weight: 800; }
    .stat .label { color: var(--text-dim); font-size: 0.8rem; margin-top: 2px; }

    .section-title { display: flex; align-items: center; gap: 10px; color: var(--text-dim); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 4px 12px; }
    .section-title i { color: var(--blue-2); }

    .bots { display: flex; flex-direction: column; gap: 10px; margin-bottom: 34px; }
    .bot {
      background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid var(--border); border-radius: 12px;
      padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
      transition: border-color 0.2s, transform 0.2s;
    }
    .bot:hover { border-color: rgba(59,130,246,0.5); transform: translateY(-1px); }
    .bot .left { display: flex; align-items: center; gap: 12px; }
    .bot .avatar {
      width: 38px; height: 38px; border-radius: 10px;
      background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25);
      display: flex; align-items: center; justify-content: center; color: var(--blue-2);
    }
    .bot .meta .phone { font-weight: 600; font-size: 0.95rem; }
    .bot .meta .uptime { font-size: 0.78rem; color: var(--text-dim); margin-top: 2px; }
    .bot .status { padding: 5px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .bot .status.online { background: rgba(52,211,153,0.12); color: var(--ok); border: 1px solid rgba(52,211,153,0.3); }
    .bot .status.offline { background: rgba(248,113,113,0.12); color: var(--err); border: 1px solid rgba(248,113,113,0.3); }
    .bot .status i { font-size: 0.55rem; }
    .status.online i { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

    .empty { text-align: center; color: var(--text-dim); padding: 30px; border: 1px dashed var(--border); border-radius: 12px; }
    .empty i { display: block; font-size: 1.6rem; margin-bottom: 10px; color: var(--blue-2); opacity: 0.7; }

    .actions { text-align: center; margin-top: 8px; }
    .actions a {
      display: inline-flex; align-items: center; gap: 10px;
      padding: 13px 26px; background: linear-gradient(135deg, var(--blue), var(--cyan)); color: #04101f;
      border-radius: 10px; text-decoration: none; font-weight: 700; margin: 5px;
      box-shadow: 0 10px 26px rgba(59,130,246,0.4); transition: transform 0.15s, box-shadow 0.15s;
    }
    .actions a:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(59,130,246,0.5); }

    .footer { text-align: center; margin-top: 40px; color: #55618a; font-size: 0.8rem; }
    .footer i { color: var(--blue-2); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="icon-badge"><i class="fa-solid fa-bug"></i></div>
      <h1>${config.botName}</h1>
      <p>Multi-User WhatsApp Bot Dashboard</p>
    </div>

    <div class="stats">
      <div class="stat"><i class="fa-solid fa-robot"></i><div class="num">${bots.length}</div><div class="label">Total Bots</div></div>
      <div class="stat"><i class="fa-solid fa-signal"></i><div class="num">${connected}</div><div class="label">Connected</div></div>
      <div class="stat"><i class="fa-solid fa-clock"></i><div class="num">${fmtUptime(process.uptime())}</div><div class="label">Uptime</div></div>
    </div>

    <div class="section-title"><i class="fa-solid fa-server"></i> Active Sessions</div>
    <div class="bots">
      ${bots.map(b => `<div class="bot">
        <div class="left">
          <div class="avatar"><i class="fa-solid fa-mobile-screen-button"></i></div>
          <div class="meta">
            <div class="phone">${sessionManager.maskPhone(b.phone)}</div>
            <div class="uptime">${fmtUptime(Math.floor((Date.now() - b.startedAt) / 1000))} uptime</div>
          </div>
        </div>
        <span class="status ${b.connected ? 'online' : 'offline'}"><i class="fa-solid fa-circle"></i> ${b.connected ? 'Online' : 'Offline'}</span>
      </div>`).join('')}
      ${bots.length === 0 ? `<div class="empty"><i class="fa-solid fa-satellite-dish"></i>No bots connected yet.</div>` : ''}
    </div>

    <div class="actions">
      <a href="/pair"><i class="fa-solid fa-link"></i> Pair New Device</a>
    </div>

    <div class="footer"><i class="fa-solid fa-bug"></i> ${config.botName} v${config.botVersion}</div>
  </div>
</body>
</html>`;
  res.send(html);
});

module.exports = app;
