const express = require('express');
const router = express.Router();
const { handleMessage } = require('../services/telegramBot');

router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (update.message) {
      await handleMessage(update.message);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
