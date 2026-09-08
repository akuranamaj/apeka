(async function applyBranding() {
  try {
    const res = await fetch('/api/branding');
    const b = await res.json();
    document.title = document.title.replace('Web2APK', b.siteName);
    document.querySelectorAll('[data-brand-title]').forEach((el) => (el.textContent = b.siteTitle));
    document.querySelectorAll('[data-brand-name]').forEach((el) => (el.textContent = b.siteName));
    document.querySelectorAll('[data-brand-owner]').forEach((el) => (el.textContent = b.ownerName));
    document.querySelectorAll('[data-brand-channel]').forEach((el) => {
      el.textContent = `@${b.channelUsername}`;
      el.href = b.channelUrl;
    });
    window.__branding = b;
  } catch {
    // Gagal ambil branding bukan hal fatal — halaman tetap pakai teks default di HTML.
  }
})();
