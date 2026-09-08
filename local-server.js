require('dotenv').config();
const app = require('./api/index');
const { bot } = require('./lib/bot');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web panel jalan di http://localhost:${PORT}`));

// Long polling cuma dipakai untuk development lokal.
// Di Vercel, bot jalan lewat webhook (api/telegram.js) — jangan panggil bot.start() di sana.
bot.start();
console.log('Bot Telegram jalan (long polling, mode dev).');
