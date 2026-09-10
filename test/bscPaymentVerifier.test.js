const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_BSC_USDT, findTokenTransfer } = require('../services/bscPaymentVerifier');

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicFor = (address) => `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;

test('finds a BSC-USDT transfer sent to the configured receiving wallet', () => {
  const sender = '0x1111111111111111111111111111111111111111';
  const wallet = '0xdc9338991d12cad5a6ab87be60124d8f42d00459';
  const rawAmount = 30n * (10n ** 18n);
  const receipt = {
    logs: [{
      address: DEFAULT_BSC_USDT,
      topics: [transferTopic, topicFor(sender), topicFor(wallet)],
      data: `0x${rawAmount.toString(16)}`
    }]
  };

  const transfer = findTokenTransfer(receipt, { walletAddress: wallet });
  assert.equal(transfer.amount, 30);
  assert.equal(transfer.from, sender);
  assert.equal(transfer.to, wallet);
});

test('rejects a token transfer sent to a different wallet', () => {
  const receipt = {
    logs: [{
      address: DEFAULT_BSC_USDT,
      topics: [
        transferTopic,
        topicFor('0x1111111111111111111111111111111111111111'),
        topicFor('0x2222222222222222222222222222222222222222')
      ],
      data: '0x1'
    }]
  };

  assert.equal(findTokenTransfer(receipt, {
    walletAddress: '0x3333333333333333333333333333333333333333'
  }), null);
});
