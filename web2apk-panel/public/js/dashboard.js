let currentUser = null;
let pollTimer = null;

const mainContent = document.getElementById('mainContent');
const viewTitle = document.getElementById('viewTitle');

const VIEWS = {
  overview: { title: 'overview', render: renderOverview },
  build: { title: 'build-baru', render: renderBuild },
  queue: { title: 'antrian', render: renderQueue },
  users: { title: 'daftar-user', render: renderUsers }
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Belum login');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

async function init() {
  try {
    currentUser = await api('/api/me');
  } catch {
    return;
  }
  document.getElementById('avatarInitial').textContent = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = currentUser.username;
  document.getElementById('userRole').textContent = currentUser.role === 'owner' ? 'Owner' : 'Member';

  if (currentUser.role === 'owner') {
    document.getElementById('ownerGroupLabel').style.display = 'block';
    document.getElementById('usersChannel').style.display = 'flex';
  }

  document.querySelectorAll('.channel-item[data-view]').forEach((el) => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  switchView('overview');
}

function switchView(view) {
  document.querySelectorAll('.channel-item[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  viewTitle.textContent = VIEWS[view].title;
  VIEWS[view].render();

  if (pollTimer) clearInterval(pollTimer);
  if (view === 'overview' || view === 'queue') {
    pollTimer = setInterval(() => VIEWS[view].render(), 5000);
  }
}

async function renderOverview() {
  const { stats, queue, building } = await api('/api/stats');
  mainContent.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${stats.success}</div><div class="stat-label">Build sukses</div></div>
      <div class="stat-card"><div class="stat-value">${stats.failed}</div><div class="stat-label">Build gagal</div></div>
      <div class="stat-card"><div class="stat-value">${queue.length}</div><div class="stat-label">Antrian</div></div>
      <div class="stat-card"><div class="stat-value">${building.length}</div><div class="stat-label">Sedang build</div></div>
    </div>
    <div class="panel-card">
      <h3><i data-lucide="activity" class="icon" style="width:16px;height:16px;"></i> Aktivitas saat ini</h3>
      ${renderJobRows(building, queue)}
    </div>
  `;
  lucide.createIcons();
}

function renderBuild() {
  mainContent.innerHTML = `
    <div class="panel-card">
      <h3><i data-lucide="hammer" class="icon" style="width:16px;height:16px;"></i> Submit build dari URL</h3>
      <div id="buildError"></div>
      <form id="buildForm" class="build-form">
        <input type="text" id="appName" placeholder="Nama aplikasi" required>
        <input type="text" id="sourceUrl" placeholder="https://situs-kamu.com" required>
        <button type="submit"><i data-lucide="play" class="icon" style="width:16px;height:16px;"></i> Mulai build</button>
      </form>
      <p style="color:var(--text-muted);font-size:13px;margin-top:14px;">
        Untuk build dari file .zip project, kirim langsung lewat bot Telegram (menu "Build dari ZIP") —
        upload file besar lebih stabil lewat Telegram dibanding lewat form web.
      </p>
    </div>
  `;
  lucide.createIcons();

  document.getElementById('buildForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('buildError');
    errorBox.innerHTML = '';
    try {
      const appName = document.getElementById('appName').value.trim();
      const url = document.getElementById('sourceUrl').value.trim();
      await api('/api/build', { method: 'POST', body: JSON.stringify({ appName, url }) });
      switchView('queue');
    } catch (err) {
      errorBox.innerHTML = `<div class="form-error">${err.message}</div>`;
    }
  });
}

async function renderQueue() {
  const { queue, building } = await api('/api/stats');
  mainContent.innerHTML = `
    <div class="panel-card">
      <h3><i data-lucide="list-ordered" class="icon" style="width:16px;height:16px;"></i> Antrian & sedang build</h3>
      ${renderJobRows(building, queue)}
    </div>
  `;
  lucide.createIcons();
}

function renderJobRows(building, queue) {
  if (building.length === 0 && queue.length === 0) {
    return `<div class="empty-state">Tidak ada build yang berjalan.</div>`;
  }
  const buildingRows = building
    .map((j) => `<div class="queue-row building"><i data-lucide="loader-circle" class="icon"></i> ${escapeHtml(j.appName)} <span class="badge">building</span></div>`)
    .join('');
  const queueRows = queue
    .map((j, i) => `<div class="queue-row"><i data-lucide="clock" class="icon"></i> ${escapeHtml(j.appName)} <span class="badge">antrian #${i + 1}</span></div>`)
    .join('');
  return buildingRows + queueRows;
}

async function renderUsers() {
  try {
    const { users } = await api('/api/users');
    mainContent.innerHTML = `
      <div class="panel-card">
        <h3><i data-lucide="users" class="icon" style="width:16px;height:16px;"></i> Semua user web</h3>
        ${users
          .map(
            (u) => `<div class="queue-row"><i data-lucide="user" class="icon"></i> ${escapeHtml(u.username)} <span class="badge">${escapeHtml(u.role)}</span></div>`
          )
          .join('')}
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    mainContent.innerHTML = `<div class="form-error">${err.message}</div>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
