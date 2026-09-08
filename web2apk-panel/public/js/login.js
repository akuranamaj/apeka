const form = document.getElementById('loginForm');
const errorBox = document.getElementById('errorBox');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.innerHTML = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Masuk...';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal login');
    window.location.href = '/dashboard';
  } catch (err) {
    errorBox.innerHTML = `<div class="form-error">${err.message}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Masuk';
  }
});
