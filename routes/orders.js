const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const order = req.body;

  res.json({
    success: true,
    message: 'Order received',
    order
  });
});

module.exports = router;
