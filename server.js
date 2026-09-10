require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Mail Seller Hub API'
  });
});

app.get('/api/products', (req, res) => {
  res.json({
    products: []
  });
});

app.get('/api/payment', (req, res) => {
  res.json({
    methods: [],
    message: 'Payment configuration will be connected later.'
  });
});

app.post('/api/orders', (req, res) => {
  const order = req.body;

  res.json({
    success: true,
    message: 'Order received',
    order
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
