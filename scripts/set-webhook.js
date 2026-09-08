require('dotenv').config();
const { Bot } = require('grammy');
const config = require('../lib/config');

async function main() {
  if (!config.publicUrl) {
    console.error('Isi PUBLIC_URL di .env dulu (contoh: https://nama-project.vercel.app)');
    process.exit(1);
  }
  const bot = new Bot(config.bot.token);
  const url = `${config.publicUrl}/bot/webhook`;
  await bot.api.setWebhook(url, { secret_token: config.bot.webhookSecret });
  console.log('Webhook terpasang ke:', url);
}

main();
