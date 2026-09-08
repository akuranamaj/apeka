const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = require('../lib/config');
const { readDB, withDB } = require('../lib/db');
const { hashPassword, verifyPassword, signSession, cookieOptions, requireAuth, COOKIE_NAME } = require('../lib/auth');
const { downloadArtifactApk } = require('../lib/github');
const { bot, queueJob, startBuild } = require('../lib/bot');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// ---------- Branding (publik, dipakai frontend buat judul/nama tanpa hardcode) ----------
app.get('/api/branding', (req, res) => {
  res.json({
    siteTitle: config.branding.siteTitle,
    siteName: config.branding.siteName,
    ownerName: config.branding.ownerName,
    channelUrl: config.verification.channelUrl,
    channelUsername: config.verification.channelUsername
  });
});

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });

  const taken = await withDB(async (db) => {
    if (db.webUsers[username]) return true;
    db.webUsers[username] = {
      passwordHash: await hashPassword(password),
      role: username === config.bot.adminId ? 'owner' : 'user',
      createdAt: Date.now()
    };
    return false;
  });

  if (taken) return res.status(409).json({ error: 'Username sudah dipakai' });
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const db = await readDB();
  const user = db.webUsers[username];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const token = signSession({ username, role: user.role || 'user' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ---------- Dashboard data ----------
app.get('/api/stats', requireAuth, async (req, res) => {
  const db = await readDB();
  res.json({
    stats: db.stats,
    queue: db.queue.map((j) => ({ id: j.id, appName: j.appName })),
    building: db.building.map((j) => ({ id: j.id, appName: j.appName }))
  });
});

app.get('/api/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Khusus owner' });
  const db = await readDB();
  const users = Object.entries(db.webUsers).map(([username, u]) => ({ username, role: u.role, createdAt: u.createdAt }));
  res.json({ users });
});

// ---------- Build submission from the web dashboard ----------
app.post('/api/build', requireAuth, async (req, res) => {
  const { appName, url } = req.body || {};
  if (!appName) return res.status(400).json({ error: 'Nama aplikasi wajib diisi' });
  if (!url) return res.status(400).json({ error: 'URL sumber wajib diisi (upload ZIP lewat bot Telegram untuk sekarang)' });

  const job = { id: uuidv4(), appName: appName.slice(0, 40), url, webUsername: req.user.username, createdAt: Date.now() };
  await queueJob(job);
  res.json({ ok: true, jobId: job.id });
});

// ---------- GitHub Actions calls this when a real build finishes ----------
app.post('/api/build-callback', async (req, res) => {
  const { secret, job_id, status, artifact_id } = req.body || {};
  if (secret !== config.buildCallbackSecret) return res.status(401).json({ error: 'Secret salah' });

  const db = await readDB();
  const job = db.jobs[job_id];
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });

  if (status === 'success') {
    try {
      const { buffer, filename } = await downloadArtifactApk(artifact_id);
      if (job.telegramId) {
        await bot.api.sendDocument(job.telegramId, { source: buffer, filename }, { caption: `Build "${job.appName}" berhasil. Ini file APK-nya.` });
      }
      await withDB((d) => {
        d.stats.success++;
        d.jobs[job_id].status = 'success';
      });
    } catch (e) {
      await withDB((d) => {
        d.stats.failed++;
        d.jobs[job_id].status = 'failed';
      });
      if (job.telegramId) {
        await bot.api.sendMessage(job.telegramId, `Build "${job.appName}" selesai di GitHub Actions tapi panel gagal mengambil file APK-nya (${e.message}). Cek langsung di tab Actions repo kamu.`);
      }
    }
  } else {
    await withDB((d) => {
      d.stats.failed++;
      d.jobs[job_id].status = 'failed';
    });
    if (job.telegramId) {
      await bot.api.sendMessage(job.telegramId, `Build "${job.appName}" gagal. Cek log di tab Actions repo GitHub kamu untuk detail errornya.`);
    }
  }

  await withDB((d) => {
    d.building = d.building.filter((j) => j.id !== job_id);
    if (d.queue.length) {
      const next = d.queue.shift();
      d.building.push(next);
      startBuild(next);
    }
  });

  res.json({ ok: true });
});

module.exports = app;
