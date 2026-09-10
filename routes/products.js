const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    products: [
      {name:'Gmail Account', price:'0', stock:0}
    ]
  });
});

module.exports = router;
