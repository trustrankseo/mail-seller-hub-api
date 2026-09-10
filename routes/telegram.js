const express = require('express');
const router = express.Router();
const { handleMessage, setWebhook, getWebhookInfo, getTelegramToken } = require('../services/telegramBot');

router.get('/status', async (req, res) => {
  try {
    if (!getTelegramToken()) {
      return res.status(500).json({ ok: false, error: 'Telegram bot token is not configured' });
    }
    const info = await getWebhookInfo();
    res.json({ ok: true, webhook: info.result });
  } catch (error) {
    console.error('Telegram status error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/setup', async (req, res) => {
  try {
    if (!getTelegramToken()) {
      return res.status(500).json({ ok: false, error: 'Telegram bot token is not configured' });
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = forwardedProto || req.protocol || 'https';
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    const result = await setWebhook(webhookUrl);
    res.json({ ok: true, webhookUrl, telegram: result });
  } catch (error) {
    console.error('Telegram setup error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (update && update.message) {
      await handleMessage(update.message);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
});

module.exports = router;
