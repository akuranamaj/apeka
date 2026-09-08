// Database asli project ini adalah satu file JSON yang hidup di sebuah repo
// GitHub, dibaca dan ditulis lewat GitHub Contents API. Tidak butuh Vercel KV
// atau database server terpisah — cukup token GitHub yang sudah kamu punya.
//
// Catatan jujur: ini bukan database yang dirancang untuk banyak write
// bersamaan (tiap write = satu commit baru ke repo, dan GitHub akan menolak
// kalau `sha` yang dikirim sudah basi karena ada commit lain di antaranya).
// Untuk skala panel kecil ini cukup aman berkat retry di bawah, tapi kalau
// trafiknya sudah ramai, ini adalah bagian pertama yang perlu diganti ke
// database sungguhan (Postgres/Redis/dll).

const axios = require('axios');
const config = require('./config');

const DEFAULT_DB = {
  webUsers: {}, // username -> { passwordHash, role, createdAt }
  telegramUsers: {}, // telegramId -> { step, license, verified, url, appName, zipFileId }
  stats: { success: 0, failed: 0 },
  queue: [],
  building: [],
  jobs: {} // jobId -> job detail, dipakai buat mencocokkan callback dari GitHub Actions
};

function ghHeaders() {
  return {
    Authorization: `Bearer ${config.github.token}`,
    Accept: 'application/vnd.github+json'
  };
}

function contentsUrl() {
  const { owner, repo, path } = config.githubDb;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

async function readRaw() {
  try {
    const res = await axios.get(contentsUrl(), {
      headers: ghHeaders(),
      params: { ref: config.githubDb.branch }
    });
    const json = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return { db: JSON.parse(json), sha: res.data.sha };
  } catch (e) {
    if (e.response && e.response.status === 404) {
      return { db: structuredClone(DEFAULT_DB), sha: null };
    }
    throw e;
  }
}

async function writeRaw(db, sha) {
  const body = {
    message: 'chore: update db.json dari panel',
    content: Buffer.from(JSON.stringify(db, null, 2)).toString('base64'),
    branch: config.githubDb.branch
  };
  if (sha) body.sha = sha;
  await axios.put(contentsUrl(), body, { headers: ghHeaders() });
}

async function readDB() {
  const { db } = await readRaw();
  return db;
}

// Baca -> ubah -> simpan, dengan retry kalau ternyata ada commit lain yang
// nyelip di antara baca dan tulis (GitHub balikin 409/422 kalau sha basi).
async function withDB(mutator, attempt = 0) {
  const { db, sha } = await readRaw();
  const result = await mutator(db);
  try {
    await writeRaw(db, sha);
    return result;
  } catch (e) {
    const status = e.response && e.response.status;
    if ((status === 409 || status === 422) && attempt < 4) {
      return withDB(mutator, attempt + 1);
    }
    throw e;
  }
}

module.exports = { readDB, withDB };
