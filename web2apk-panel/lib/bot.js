const { Bot, InlineKeyboard } = require('grammy');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { withDB, readDB } = require('./db');
const { hashPassword } = require('./auth');
const { dispatchBuild } = require('./github');

const bot = new Bot(config.bot.token);

function checkLicense(user) {
  if (!user) return false;
  if (!user.license) return false;
  if (user.license.expiry === 'permanent') return true;
  return Date.now() < user.license.expiry;
}

function calcExpiry(tier) {
  const l = config.license[tier];
  if (!l) return null;
  if (l.duration === 'permanent') return 'permanent';
  const unitMs = { hour: 3600000, day: 86400000 };
  return Date.now() + l.duration * unitMs[l.unit];
}

// ---------- Tampilan menu: satu foto banner, caption & tombol yang berganti ----------

function mainMenuCaption(isAdmin) {
  return (
    `<b>${config.branding.siteName}</b>\n` +
    `by ${config.branding.ownerName}\n\n` +
    `Build APK dari link website atau dari project ZIP kamu sendiri. ` +
    `Semua tombol di bawah ini interaktif — tinggal pilih.` +
    (isAdmin ? `\n\n<i>Kamu login sebagai admin.</i>` : '')
  );
}

function mainMenuKeyboard(isAdmin) {
  const kb = new InlineKeyboard()
    .text('🔗 Build dari URL', 'menu_url')
    .text('📦 Build dari ZIP', 'menu_zip')
    .row()
    .text('📋 Antrian', 'menu_queue')
    .text('❓ Bantuan', 'menu_help');
  if (isAdmin) kb.row().text('⚙️ Owner Menu', 'menu_owner');
  return kb;
}

async function sendMainMenu(ctx) {
  const isAdmin = String(ctx.from.id) === config.bot.adminId;
  const caption = mainMenuCaption(isAdmin);
  const keyboard = mainMenuKeyboard(isAdmin);
  if (config.bot.menuPhotoUrl) {
    await ctx.replyWithPhoto(config.bot.menuPhotoUrl, { caption, parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

// Edit menu di tempat kalau bisa (biar terasa satu "layar" yang berganti isi,
// bukan spam pesan baru tiap klik tombol) — fallback ke pesan baru kalau gagal.
async function renderInPlace(ctx, { caption, keyboard }) {
  try {
    if (ctx.callbackQuery.message.photo) {
      await ctx.editMessageCaption({ caption, parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.editMessageText(caption, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch {
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

const backKeyboard = new InlineKeyboard().text('◀️ Kembali ke menu', 'menu_back');

// ---------- Verifikasi channel ----------

function verificationView() {
  let tierList = '';
  Object.entries(config.license).forEach(([tier, d]) => {
    tierList += `• ${tier} — ${d.duration === 'permanent' ? 'Permanen' : d.duration + (d.unit === 'hour' ? ' jam' : '')}\n`;
  });
  const caption =
    `<b>Verifikasi dulu yuk</b>\n\n` +
    `Join channel @${config.verification.channelUsername} dulu sebelum pakai bot ini.\n\n` +
    `<b>Harga akses:</b>\n${tierList}\n` +
    `Hubungi ${config.contact.owner} untuk beli akses.`;
  const keyboard = new InlineKeyboard()
    .url('📢 Join channel', config.verification.channelUrl)
    .row()
    .text('✅ Saya sudah join', 'verify_join');
  return { caption, keyboard };
}

bot.callbackQuery('verify_join', async (ctx) => {
  const uid = String(ctx.from.id);
  await withDB((db) => {
    db.telegramUsers[uid] = db.telegramUsers[uid] || {};
    db.telegramUsers[uid].verified = true;
  });
  await ctx.answerCallbackQuery({ text: 'Terverifikasi!' });
  await sendMainMenu(ctx);
});

async function requireAccess(ctx) {
  const uid = String(ctx.from.id);
  if (uid === config.bot.adminId) return true;
  const db = await readDB();
  const tgUser = db.telegramUsers[uid];
  if (!tgUser?.verified || !checkLicense(tgUser)) {
    const { caption, keyboard } = verificationView();
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
    return false;
  }
  return true;
}

// ---------- Menu utama ----------

bot.command('start', async (ctx) => {
  if (!(await requireAccess(ctx))) return;
  await sendMainMenu(ctx);
});

bot.command('register', async (ctx) => {
  const [, username, password] = ctx.message.text.split(' ');
  if (!username || !password) return ctx.reply('Format: /register <username> <password>');
  const exists = await withDB(async (db) => {
    if (db.webUsers[username]) return true;
    db.webUsers[username] = { passwordHash: await hashPassword(password), role: 'user', createdAt: Date.now() };
    return false;
  });
  if (exists) return ctx.reply('Username sudah dipakai.');
  ctx.reply(`Akun dibuat. Login di web dengan username "${username}".`);
});

bot.callbackQuery('menu_back', async (ctx) => {
  await ctx.answerCallbackQuery();
  const isAdmin = String(ctx.from.id) === config.bot.adminId;
  await renderInPlace(ctx, { caption: mainMenuCaption(isAdmin), keyboard: mainMenuKeyboard(isAdmin) });
});

bot.callbackQuery('menu_url', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAccess(ctx))) return;
  const uid = String(ctx.from.id);
  await withDB((db) => {
    db.telegramUsers[uid] = db.telegramUsers[uid] || {};
    db.telegramUsers[uid].step = 'waiting_url';
  });
  await renderInPlace(ctx, {
    caption: 'Kirim link website yang mau di-build (harus diawali <code>http://</code> atau <code>https://</code>).',
    keyboard: new InlineKeyboard().text('❌ Batal', 'menu_cancel_step')
  });
});

bot.callbackQuery('menu_zip', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAccess(ctx))) return;
  const uid = String(ctx.from.id);
  await withDB((db) => {
    db.telegramUsers[uid] = db.telegramUsers[uid] || {};
    db.telegramUsers[uid].step = 'waiting_zip';
  });
  await renderInPlace(ctx, {
    caption: 'Kirim file <b>.zip</b> project Flutter kamu sebagai dokumen.',
    keyboard: new InlineKeyboard().text('❌ Batal', 'menu_cancel_step')
  });
});

bot.callbackQuery('menu_cancel_step', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Dibatalkan' });
  const uid = String(ctx.from.id);
  await withDB((db) => {
    if (db.telegramUsers[uid]) db.telegramUsers[uid].step = null;
  });
  const isAdmin = uid === config.bot.adminId;
  await renderInPlace(ctx, { caption: mainMenuCaption(isAdmin), keyboard: mainMenuKeyboard(isAdmin) });
});

bot.callbackQuery('menu_queue', async (ctx) => {
  await ctx.answerCallbackQuery();
  const db = await readDB();
  const rows = [
    ...db.building.map((j) => `🔄 <b>${escapeHtml(j.appName)}</b> — sedang build`),
    ...db.queue.map((j, i) => `⏳ <b>${escapeHtml(j.appName)}</b> — antrian #${i + 1}`)
  ];
  const caption = rows.length ? rows.join('\n') : 'Tidak ada build yang berjalan saat ini.';
  await renderInPlace(ctx, {
    caption: `<b>Status antrian</b>\n\n${caption}`,
    keyboard: new InlineKeyboard().text('🔄 Refresh', 'menu_queue').row().text('◀️ Kembali ke menu', 'menu_back')
  });
});

bot.callbackQuery('menu_help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderInPlace(ctx, {
    caption:
      `<b>Cara pakai</b>\n\n` +
      `1. Pilih <b>Build dari URL</b> atau <b>Build dari ZIP</b>\n` +
      `2. Ikuti instruksi yang muncul\n` +
      `3. Tunggu notifikasi hasil build (APK asli dikirim otomatis begitu build di GitHub Actions selesai)\n\n` +
      `Kontak: ${config.contact.owner}`,
    keyboard: backKeyboard
  });
});

// ---------- Owner menu ----------

function requireAdmin(ctx) {
  return String(ctx.from.id) === config.bot.adminId;
}

bot.callbackQuery('menu_owner', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!requireAdmin(ctx)) return;
  const db = await readDB();
  const caption =
    `<b>Owner menu</b>\n\n` +
    `User Telegram: ${Object.keys(db.telegramUsers).length}\n` +
    `User Web: ${Object.keys(db.webUsers).length}\n` +
    `Antrian: ${db.queue.length} | Building: ${db.building.length}\n` +
    `Sukses: ${db.stats.success} | Gagal: ${db.stats.failed}`;
  const keyboard = new InlineKeyboard()
    .text('📢 Broadcast', 'owner_broadcast')
    .text('💎 Buat Lisensi', 'owner_create_license')
    .row()
    .text('🔄 Refresh', 'menu_owner')
    .text('◀️ Kembali', 'menu_back');
  await renderInPlace(ctx, { caption, keyboard });
});

bot.callbackQuery('owner_broadcast', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!requireAdmin(ctx)) return;
  await withDB((db) => {
    db.telegramUsers[config.bot.adminId] = db.telegramUsers[config.bot.adminId] || {};
    db.telegramUsers[config.bot.adminId].step = 'waiting_broadcast';
  });
  await renderInPlace(ctx, {
    caption: 'Ketik pesan yang mau di-broadcast ke semua user Telegram.',
    keyboard: new InlineKeyboard().text('❌ Batal', 'menu_cancel_step')
  });
});

bot.callbackQuery('owner_create_license', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!requireAdmin(ctx)) return;
  await withDB((db) => {
    db.telegramUsers[config.bot.adminId] = db.telegramUsers[config.bot.adminId] || {};
    db.telegramUsers[config.bot.adminId].step = 'waiting_create_license';
  });
  await renderInPlace(ctx, {
    caption: 'Format: <code>telegram_id tier</code>\nTier: 2K / 5K / 10K / 15K\n\nContoh: <code>123456789 15K</code>',
    keyboard: new InlineKeyboard().text('❌ Batal', 'menu_cancel_step')
  });
});

// ---------- Input teks & dokumen mengikuti "step" yang lagi aktif ----------

bot.on(':document', async (ctx) => {
  const uid = String(ctx.from.id);
  const db = await readDB();
  const tgUser = db.telegramUsers[uid];
  if (tgUser?.step !== 'waiting_zip') return;

  const doc = ctx.message.document;
  if (!doc.file_name?.toLowerCase().endsWith('.zip')) return ctx.reply('Harus file .zip ya.');

  const job = {
    id: uuidv4(),
    telegramId: uid,
    appName: doc.file_name.replace(/\.zip$/i, '').slice(0, 40),
    zipFileId: doc.file_id,
    createdAt: Date.now()
  };
  await withDB((d) => {
    d.telegramUsers[uid].step = null;
  });
  await ctx.reply('ZIP diterima, build dimulai...', { reply_markup: backKeyboard });
  queueJob(job);
});

bot.on(':text', async (ctx) => {
  const uid = String(ctx.from.id);
  const text = ctx.message.text;
  if (text.startsWith('/')) return;
  const db = await readDB();
  const tgUser = db.telegramUsers[uid];
  if (!tgUser?.step) return;

  if (tgUser.step === 'waiting_url') {
    if (!text.startsWith('http')) return ctx.reply('Harus diawali http:// atau https://');
    await withDB((d) => {
      d.telegramUsers[uid].url = text;
      d.telegramUsers[uid].step = 'waiting_name';
    });
    return ctx.reply('Nama aplikasinya apa?', { reply_markup: new InlineKeyboard().text('❌ Batal', 'menu_cancel_step') });
  }

  if (tgUser.step === 'waiting_name') {
    const appName = text.slice(0, 40);
    const url = tgUser.url;
    await withDB((d) => {
      d.telegramUsers[uid].step = null;
    });
    await ctx.reply(`Build "${escapeHtml(appName)}" dimulai.`, { parse_mode: 'HTML', reply_markup: backKeyboard });
    return queueJob({ id: uuidv4(), telegramId: uid, appName, url, createdAt: Date.now() });
  }

  if (tgUser.step === 'waiting_broadcast' && requireAdmin(ctx)) {
    await withDB((d) => {
      d.telegramUsers[uid].step = null;
    });
    const all = await readDB();
    const ids = Object.keys(all.telegramUsers);
    let sent = 0, failed = 0;
    for (const id of ids) {
      try { await bot.api.sendMessage(id, text); sent++; } catch { failed++; }
    }
    return ctx.reply(`Broadcast selesai. Terkirim: ${sent}, gagal: ${failed}.`, { reply_markup: backKeyboard });
  }

  if (tgUser.step === 'waiting_create_license' && requireAdmin(ctx)) {
    const [targetId, tier] = text.split(' ');
    if (!targetId || !tier || !config.license[tier]) {
      return ctx.reply('Format salah. Contoh: 123456789 15K');
    }
    await withDB((d) => {
      d.telegramUsers[uid].step = null;
      d.telegramUsers[targetId] = d.telegramUsers[targetId] || {};
      d.telegramUsers[targetId].license = { tier, expiry: calcExpiry(tier) };
      d.telegramUsers[targetId].verified = true;
    });
    return ctx.reply(`Lisensi ${tier} diberikan ke ${targetId}.`, { reply_markup: backKeyboard });
  }
});

// ---------- Antrian & build asli ----------

async function queueJob(job) {
  let isBuilding = false;
  await withDB((db) => {
    db.jobs[job.id] = { ...job, status: 'queued' };
    if (db.building.length < config.server.maxConcurrent) {
      db.building.push(job);
      isBuilding = true;
    } else {
      db.queue.push(job);
    }
  });
  if (isBuilding) {
    await startBuild(job);
  } else {
    const db = await readDB();
    const position = db.queue.findIndex((j) => j.id === job.id) + 1;
    if (job.telegramId) bot.api.sendMessage(job.telegramId, `Masuk antrian, posisi #${position}.`).catch(() => {});
  }
}

async function startBuild(job) {
  await withDB((db) => {
    if (db.jobs[job.id]) db.jobs[job.id].status = 'building';
  });
  if (job.telegramId) {
    bot.api
      .sendMessage(job.telegramId, `Build "${job.appName}" dimulai. Kamu akan dikabari lagi begitu selesai — ini menunggu hasil build asli dari GitHub Actions, bukan simulasi.`)
      .catch(() => {});
  }
  let zipUrl = '';
  if (job.zipFileId) {
    const file = await bot.api.getFile(job.zipFileId);
    zipUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
  }
  const packageName = `com.web2apk.${job.appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  try {
    await dispatchBuild({ jobId: job.id, appName: job.appName, sourceUrl: job.url, zipUrl, packageName });
  } catch (e) {
    await withDB((db) => {
      db.stats.failed++;
      db.building = db.building.filter((j) => j.id !== job.id);
    });
    if (job.telegramId) bot.api.sendMessage(job.telegramId, 'Gagal memulai build (GitHub Actions menolak request). Coba lagi nanti.').catch(() => {});
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { bot, queueJob, startBuild, checkLicense };
