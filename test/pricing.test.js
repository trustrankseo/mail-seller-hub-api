const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProduct } = require('../services/firebaseService');
const { unitPriceForQuantity, pricingText } = require('../services/telegramBot');

test('website pricePerEmail takes priority over an old price field', () => {
  const product = normalizeProduct('br', {
    name: 'BR Domain Emails',
    pricePerEmail: 0.60,
    price: 0.50,
    stockCount: 1000,
    tiers: [{ minQty: 500, maxQty: 0, price: 0.50 }]
  });

  assert.equal(product.price, 0.60);
  assert.equal(unitPriceForQuantity(product, 100), 0.60);
  assert.equal(unitPriceForQuantity(product, 500), 0.50);
});

test('the most specific matching quantity tier is applied', () => {
  const product = normalizeProduct('br', {
    pricePerEmail: 0.60,
    tiers: [
      { minQty: 100, maxQty: 499, price: 0.55 },
      { minQty: 500, maxQty: 0, price: 0.50 }
    ]
  });

  assert.equal(unitPriceForQuantity(product, 99), 0.60);
  assert.equal(unitPriceForQuantity(product, 100), 0.55);
  assert.equal(unitPriceForQuantity(product, 499), 0.55);
  assert.equal(unitPriceForQuantity(product, 500), 0.50);
});

test('display includes the website base price and bulk tiers', () => {
  const product = normalizeProduct('br', {
    pricePerEmail: 0.60,
    currency: 'USD',
    tiers: [{ minQty: 500, maxQty: 0, price: 0.50 }]
  });

  assert.match(pricingText(product), /Base price: 0\.60 USD each/);
  assert.match(pricingText(product), /500\+: 0\.50 USD each/);
});
