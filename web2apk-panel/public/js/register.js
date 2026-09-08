const form = document.getElementById('registerForm');
const errorBox = document.getElementById('errorBox');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.innerHTML = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mendaftarkan...';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal daftar');
    window.location.href = '/login';
  } catch (err) {
    errorBox.innerHTML = `<div class="form-error">${err.message}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Daftar';
  }
});
