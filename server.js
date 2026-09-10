require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const productsRoute = require('./routes/products');
const ordersRoute = require('./routes/orders');
const paymentRoute = require('./routes/payment');
const telegramRoute = require('./routes/telegram');

app.use('/api/products', productsRoute);
app.use('/api/orders', ordersRoute);
app.use('/api/payment', paymentRoute);
app.use('/api/telegram', telegramRoute);

function detectTelegramTokenSource() {
  if (process.env.TELEGRAM_TOKEN) return 'TELEGRAM_TOKEN';
  if (process.env.TELEGRAM_BOT_TOKEN) return 'TELEGRAM_BOT_TOKEN';
  if (process.env.BOT_TOKEN) return 'BOT_TOKEN';
  return null;
}

app.get('/', (req, res) => {
  const telegramTokenSource = detectTelegramTokenSource();
  const telegramLikeEnvKeys = Object.keys(process.env)
    .filter((key) => /telegram|bot.*token|token.*bot/i.test(key))
    .sort();

  res.json({
    status: 'online',
    service: 'Mail Seller Hub API',
    telegramTokenConfigured: Boolean(telegramTokenSource),
    telegramTokenSource,
    telegramLikeEnvKeys,
    deploymentEnvironment: process.env.VERCEL_ENV || null,
    telegramSetupEndpoint: '/api/telegram/setup',
    telegramStatusEndpoint: '/api/telegram/status'
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
  });
}

module.exports = app;
