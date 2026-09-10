const STORE_URL = process.env.STORE_URL || 'https://mail-seller-hub.web.app/';

function telegramApi(method) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) throw new Error('TELEGRAM_TOKEN is not configured');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function sendMessage(chatId, text, extra = {}) {
  const response = await fetch(telegramApi('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data;
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛒 Open Store', url: STORE_URL }],
      [{ text: '📦 Live Inventory', url: STORE_URL }, { text: '💳 Payment', url: STORE_URL }]
    ]
  };
}

function buildReply(text = '') {
  const t = text.trim().toLowerCase();

  if (t === '/start' || t === 'start') {
    return {
      text: 'Welcome to Gmail Seller 👋\n\nBrowse live inventory, check current availability and view order details directly from our store.\n\nCommands: /price /stock /buy /payment /support /about',
      reply_markup: mainKeyboard()
    };
  }

  if (t === '/price' || /\b(price|prices|rate|cost|how much)\b/.test(t)) {
    return { text: '💰 Current prices are shown live in the store. Tap Open Store to see the latest available options.', reply_markup: mainKeyboard() };
  }

  if (t === '/stock' || /\b(stock|inventory|available|availability)\b/.test(t)) {
    return { text: '📦 Live inventory and current availability are shown in the store.', reply_markup: mainKeyboard() };
  }

  if (t === '/buy' || /\b(buy|order|purchase)\b/.test(t)) {
    return { text: '🛒 To place an order, open the store, choose the available option and follow the checkout instructions.', reply_markup: mainKeyboard() };
  }

  if (t === '/payment' || /\b(payment|pay|binance|usdt|crypto)\b/.test(t)) {
    return { text: '💳 Payment details are shown during the store checkout. Please verify the displayed payment details before sending any payment.', reply_markup: mainKeyboard() };
  }

  if (t === '/support' || /\b(support|help|problem|issue)\b/.test(t)) {
    return { text: '💬 Please send your question in one message with the relevant order details. Support can then review it.' };
  }

  if (t === '/about') {
    return { text: 'Gmail Seller customer service bot. Use the store for live inventory, prices and order information.', reply_markup: mainKeyboard() };
  }

  if (/^(hi|hello|hey|salam|assalam|aoa)\b/.test(t)) {
    return { text: 'Hello 👋 Welcome to Gmail Seller. How can I help? You can ask about price, stock, orders, payment or support.', reply_markup: mainKeyboard() };
  }

  return { text: 'Thanks for your message. I can help with price, stock, orders, payment and support. You can also open the live store below.', reply_markup: mainKeyboard() };
}

async function handleMessage(message) {
  if (!message || !message.chat || !message.chat.id) return;
  const reply = buildReply(message.text || '');
  await sendMessage(message.chat.id, reply.text, reply.reply_markup ? { reply_markup: reply.reply_markup } : {});
}

async function setWebhook(webhookUrl) {
  const response = await fetch(telegramApi('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message']
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`setWebhook failed: ${JSON.stringify(data)}`);
  return data;
}

async function getWebhookInfo() {
  const response = await fetch(telegramApi('getWebhookInfo'));
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`getWebhookInfo failed: ${JSON.stringify(data)}`);
  return data;
}

module.exports = { handleMessage, sendMessage, setWebhook, getWebhookInfo };
