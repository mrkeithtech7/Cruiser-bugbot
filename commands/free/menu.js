/**
 * 🐛 Tech God Bug 2026 v2.5.0.5.7 — Menu Command
 * Static menu with all categories in one message.
 * By Dev-Ntando
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const config = require('../../config');
const antiban = require('../../utils/antiban');

function greeting() {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: config.timezone })).getHours();
  if (h >= 5  && h < 12) return '🌅 Good Morning';
  if (h >= 12 && h < 17) return '☀️ Good Afternoon';
  if (h >= 17 && h < 21) return '🌆 Good Evening';
  return '🌙 Good Night';
}

const P = config.prefix;
const up = process.uptime();
const upStr = `${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m ${Math.floor(up%60)}s`;
const now = new Date().toLocaleString('en-ZA', {
  timeZone: config.timezone,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// ==================== STATIC MENU ====================
const menu = `
╔══════════════════════════════════════╗
║  🐛  *T E C H  G O D  B U G*        ║
║  *2 0 2 6*  ·  v${config.botVersion}  ║
║  ${greeting()}                         ║
╚══════════════════════════════════════╝

👤 *User:* @${sender}
📅 *Date:* ${now}
⏱️ *Uptime:* ${upStr}
🐛 *Prefix:* [ ${P} ]

────────────────────────────────────────

🐛 *BUG COMMANDS*
  ❯ ${P}crash <number>   – Invisible crash payload (3 rounds)
  ❯ ${P}freeze <number>  – viewonce crash message 
  ❯ ${P}ghost <number>   – Invisible empty message
  ❯ ${P}fakecall <number> – Fake call lure + invisible crash
  ❯ ${P}unicode <number> – RTL/Unicode rendering chaos
  ❯ ${P}spam <number> [n] – Spam repeated messages
  ❯ ${P}massmention [n] – Tag everyone rapidly (groups)

────────────────────────────────────────

🤖 *AI COMMANDS*
  ❯ ${P}ask <question>   – Chat AI (GPT)
  ❯ ${P}imagine <prompt> – AI image generation
  ❯ ${P}tts <text>      – Text‑to‑voice note
  ❯ ${P}caption         – AI describes an image
  ❯ ${P}summarize <text> – Summarise long text
  ❯ ${P}roast @user     – AI roasts a tagged person

────────────────────────────────────────

📥 *DOWNLOADS*
  ❯ ${P}tiktok <url>    – TikTok no‑watermark video
  ❯ ${P}song <name/url> – YouTube audio MP3
  ❯ ${P}video <name/url> – YouTube video MP4
  ❯ ${P}ig <url>        – Instagram reels/posts
  ❯ ${P}fb <url>        – Facebook video
  ❯ ${P}pin <url>       – Pinterest images

────────────────────────────────────────

🔧 *TOOLS & FUN*
  ❯ ${P}ping            – Bot latency
  ❯ ${P}weather <city>  – Current weather
  ❯ ${P}translate <text> – Translate text
  ❯ ${P}define <word>   – Dictionary lookup
  ❯ ${P}calc <expr>     – Calculate math
  ❯ ${P}qr <text>       – Generate QR code
  ❯ ${P}sticker         – Convert image to sticker
  ❯ ${P}toimage         – Sticker to image
  ❯ ${P}joke            – Random joke
  ❯ ${P}fact            – Random fact
  ❯ ${P}quote           – Motivational quote
  ❯ ${P}toss            – Flip a coin
  ❯ ${P}8ball <question> – Magic 8‑ball
  ❯ ${P}dice            – Roll a dice
  ❯ ${P}password [len]  – Random password
  ❯ ${P}aesthetic <text> – Aesthetic styling
  ❯ ${P}reverse <text>  – Reverse text

────────────────────────────────────────

🔍 *SEARCH*
  ❯ ${P}wiki <query>    – Wikipedia
  ❯ ${P}lyrics <song>   – Song lyrics
  ❯ ${P}movie <name>    – Movie info
  ❯ ${P}news            – Latest news
  ❯ ${P}gif <query>     – Search GIFs
  ❯ ${P}ytsearch <query> – YouTube search

────────────────────────────────────────

👥 *GROUP COMMANDS*
  ❯ ${P}antilink on/off – Toggle anti‑link
  ❯ ${P}antiword <word> – Block words
  ❯ ${P}welcome on/off  – Toggle welcome
  ❯ ${P}kick @user      – Remove member
  ❯ ${P}promote @user   – Make admin
  ❯ ${P}demote @user    – Remove admin
  ❯ ${P}mute / unmute   – Mute/unmute group
  ❯ ${P}tagall          – Tag all members
  ❯ ${P}groupinfo       – Show group info
  ❯ ${P}rules           – Set/view group rules
  ❯ ${P}warn @user      – Warn a member

────────────────────────────────────────

👑 *OWNER COMMANDS*
  ❯ ${P}pair            – Generate pairing code
  ❯ ${P}broadcast <msg> – Broadcast to all chats
  ❯ ${P}shutdown        – Shut down bot
  ❯ ${P}setname <name>  – Change bot display name
  ❯ ${P}botstats        – View bot statistics
  ❯ ${P}ban @user       – Ban user
  ❯ ${P}unban @user     – Unban user
  ❯ ${P}addpremium @user – Give premium access
  ❯ ${P}rmpremium @user  – Remove premium access

══════════════════════════════════════
🐛 Tech God Bug 2026 · By Dev‑Ntando
_Type ${P}menu to see this again_
`;

// ==================== COMMAND HANDLER ====================
module.exports = async (sock, msg, args, { isOwner, sender, jid }) => {
  const fakeQuote = {
    key: { fromMe: false, participant: '0@s.whatsapp.net', remoteJid: 'status@broadcast' },
    message: {
      contactMessage: {
        displayName: config.botName,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${config.botName}\nORG:🐛 Tech God Bug 2026;\nTEL;type=CELL;type=VOICE;waid=${config.ownerNumber[0]}:+${config.ownerNumber[0]}\nEND:VCARD`,
      },
    },
  };

  // Send the menu with optional image
  const imgPath = path.join(__dirname, '../../assets/menu_image.jpg');
  if (config.menuImageUrl) {
    await antiban.sendHuman(sock, jid, {
      image: { url: config.menuImageUrl },
      caption: menu,
      mentions: [sender],
    }, { quoted: fakeQuote });
  } else if (fs.existsSync(imgPath)) {
    await antiban.sendHuman(sock, jid, {
      image: fs.readFileSync(imgPath),
      caption: menu,
      mentions: [sender],
    }, { quoted: fakeQuote });
  } else {
    await antiban.sendHuman(sock, jid, { text: menu, mentions: [sender] }, { quoted: fakeQuote });
  }
};