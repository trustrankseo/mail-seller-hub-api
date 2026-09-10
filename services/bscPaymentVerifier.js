const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DEFAULT_BSC_USDT = '0x55d398326f99059ff775485246999027b3197955';

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function topicAddress(topic) {
  const value = String(topic || '').replace(/^0x/, '');
  return value.length === 64 ? `0x${value.slice(24)}`.toLowerCase() : '';
}

function tokenAmount(hexValue, decimals) {
  const raw = BigInt(hexValue || '0x0');
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(fraction ? `${whole}.${fraction}` : whole.toString());
}

function findTokenTransfer(receipt, { walletAddress, tokenContract, tokenDecimals = 18 } = {}) {
  const wallet = normalizeAddress(walletAddress);
  const token = normalizeAddress(tokenContract || DEFAULT_BSC_USDT);
  const matches = (receipt?.logs || []).filter((log) =>
    normalizeAddress(log.address) === token &&
    String(log.topics?.[0] || '').toLowerCase() === TRANSFER_TOPIC &&
    topicAddress(log.topics?.[2]) === wallet
  );

  if (!matches.length) return null;
  const amount = matches.reduce((sum, log) => sum + tokenAmount(log.data, tokenDecimals), 0);
  return {
    amount,
    from: topicAddress(matches[0].topics?.[1]),
    to: wallet,
    tokenContract: token
  };
}

async function rpcCall(method, params) {
  const endpoint = process.env.BSC_RPC_URL || 'https://bsc-dataseed-public.bnbchain.org';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!response.ok) throw new Error(`BSC RPC returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'BSC RPC request failed');
  return data.result;
}

async function verifyBscPayment({ txHash, walletAddress, expectedAmount }) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash || ''))) {
    return { verified: false, code: 'invalid_hash', message: 'TxID format is not valid.' };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress || ''))) {
    return { verified: false, code: 'wallet_missing', message: 'Receiving wallet is not configured correctly.' };
  }

  const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return { verified: false, code: 'not_found', message: 'Transaction is not on BSC yet. Wait a little and try again.' };
  if (receipt.status !== '0x1') return { verified: false, code: 'failed', message: 'This BSC transaction failed.' };

  const transfer = findTokenTransfer(receipt, {
    walletAddress,
    tokenContract: process.env.BSC_USDT_CONTRACT || DEFAULT_BSC_USDT,
    tokenDecimals: Number(process.env.BSC_USDT_DECIMALS || 18)
  });
  if (!transfer) {
    return { verified: false, code: 'wrong_transfer', message: 'No BSC-USDT payment to the receiving wallet was found in this transaction.' };
  }

  const currentBlockHex = await rpcCall('eth_blockNumber', []);
  const confirmations = Math.max(0, Number(BigInt(currentBlockHex) - BigInt(receipt.blockNumber) + 1n));
  const requiredConfirmations = Math.max(1, Number(process.env.BSC_MIN_CONFIRMATIONS || 1));
  if (confirmations < requiredConfirmations) {
    return { verified: false, code: 'confirming', message: `Payment found, but it needs ${requiredConfirmations} confirmation(s). Try again shortly.` };
  }

  const expected = Number(expectedAmount || 0);
  const tolerance = Math.max(0, Number(process.env.PAYMENT_AMOUNT_TOLERANCE || 0.001));
  if (transfer.amount + tolerance < expected) {
    return { verified: false, code: 'underpaid', message: `Received ${transfer.amount.toFixed(2)} USDT, but this order requires ${expected.toFixed(2)} USDT.` };
  }

  return {
    verified: true,
    amount: transfer.amount,
    from: transfer.from,
    to: transfer.to,
    confirmations,
    explorerUrl: `https://bscscan.com/tx/${String(txHash).toLowerCase()}`
  };
}

module.exports = {
  DEFAULT_BSC_USDT,
  findTokenTransfer,
  verifyBscPayment
};
