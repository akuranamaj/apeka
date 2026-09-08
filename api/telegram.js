const { webhookCallback } = require('grammy');
const { bot } = require('../lib/bot');
const config = require('../lib/config');

const handler = webhookCallback(bot, 'http', { secretToken: config.bot.webhookSecret });

module.exports = (req, res) => handler(req, res);
