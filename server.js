require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
const productsRoute = require('./routes/products');
const ordersRoute = require('./routes/orders');
const paymentRoute = require('./routes/payment');
const telegramRoute = require('./routes/telegram');

app.use('/api/products', productsRoute);
app.use('/api/orders', ordersRoute);
app.use('/api/payment', paymentRoute);
app.use('/api/telegram', telegramRoute);

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Mail Seller Hub API',
    telegram: 'connected-ready'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
