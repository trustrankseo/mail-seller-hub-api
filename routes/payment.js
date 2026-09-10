const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    network: 'Binance USDT',
    address: process.env.BINANCE_ADDRESS || 'ADD_BINANCE_ADDRESS'
  });
});

module.exports = router;
