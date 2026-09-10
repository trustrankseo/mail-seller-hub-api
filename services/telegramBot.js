const {
  listProducts,
  getProduct,
  getPaymentSettings,
  saveSubscriber,
  listSubscribers,
  saveOrder,
  saveSession,
  getSession,
  clearSession
} = require('./firebaseService');

function getTelegramToken() {
  return process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
}

function telegramApi(method) {
  const token = getTelegramToken();
  if (!token) throw new Error('Telegram bot token is not configured');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramRequest(method, payload = {}) {
  const response = await fetch(telegramApi(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramRequest('sendMessage', { chat_id: chatId, text, ...extra });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {})
  });
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📦 Live Inventory', callback_data: 'inventory' },
        { text: '💰 Prices', callback_data: 'prices' }
      ],
      [
        { text: '💳 Payment', callback_data: 'payment' },
        { text: '🛒 Buy', callback_data: 'buy' }
      ],
      [
        { text: '🔔 Subscribe Updates', callback_data: 'subscribe' },
        { text: '🔕 Unsubscribe', callback_data: 'unsubscribe' }
      ],
      [
        { text: '❓ FAQ', callback_data: 'faq' },
        { text: '💬 Support', callback_data: 'support' }
      ]
    ]
  };
}

function backKeyboard() {
  return { inline_keyboard: [[{ text: '⬅️ Main Menu', callback_data: 'menu' }]] };
}

function money(product) {
  const price = Number(product.price || 0);
  return `${price.toFixed(price % 1 === 0 ? 0 : 2)} ${product.currency || 'USD'}`;
}

async function inventoryText() {
  const products = await listProducts({ availableOnly: true });
  if (!products.length) return '📦 Live Inventory\n\nNo stock is available right now.';

  const lines = products.map((p, i) => `${i + 1}. ${p.name}\n   Stock: ${p.stock}\n   Price: ${money(p)} each`);
  return `📦 Live Inventory\n\n${lines.join('\n\n')}`;
}

async function pricesText() {
  const products = await listProducts();
  if (!products.length) return '💰 Prices\n\nNo product pricing is available right now.';
  return `💰 Current Prices\n\n${products.map((p, i) => `${i + 1}. ${p.name} — ${money(p)} each`).join('\n')}`;
}

async function paymentText() {
  const payment = await getPaymentSettings();
  if (!payment.address) {
    return '💳 Payment\n\nPayment wallet is not configured yet. Please contact support.';
  }
  return `💳 Payment Method\n\nMethod: ${payment.label}\nAsset: ${payment.currency}\nNetwork: ${payment.network}\nAddress:\n${payment.address}\n\nPlease verify the network and address before sending payment.`;
}

async function buyKeyboard() {
  const products = await listProducts({ availableOnly: true });
  if (!products.length) return { text: '🛒 Buy\n\nNo stock is available right now.', reply_markup: backKeyboard() };

  return {
    text: '🛒 Select a product:',
    reply_markup: {
      inline_keyboard: [
        ...products.slice(0, 20).map((p) => [{ text: `${p.name} • ${p.stock} available`, callback_data: `buy:${p.id}` }]),
        [{ text: '⬅️ Main Menu', callback_data: 'menu' }]
      ]
    }
  };
}

async function showMenu(chatId) {
  return sendMessage(chatId, 'Welcome to Gmail Seller 👋\n\nEverything is available inside this bot. Choose an option below.', {
    reply_markup: mainKeyboard()
  });
}

async function handleBuyQuantity(message, session) {
  const chatId = message.chat.id;
  const quantity = Number(String(message.text || '').trim());
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return sendMessage(chatId, 'Please send a valid quantity, for example: 10');
  }

  const product = await getProduct(session.productId);
  if (!product || !product.active || product.stock <= 0) {
    await clearSession(chatId);
    return sendMessage(chatId, 'This product is no longer available. Please check Live Inventory again.', { reply_markup: mainKeyboard() });
  }

  if (quantity > product.stock) {
    return sendMessage(chatId, `Only ${product.stock} are currently available. Please send a quantity up to ${product.stock}.`);
  }

  const total = Number((product.price * quantity).toFixed(2));
  const order = await saveOrder({
    source: 'telegram',
    telegramChatId: String(chatId),
    telegramUserId: message.from?.id ? String(message.from.id) : null,
    username: message.from?.username || null,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    currency: product.currency,
    total
  });
  await clearSession(chatId);
  const payment = await getPaymentSettings();

  let text = `✅ Order Created\n\nOrder ID: ${order.id}\nProduct: ${product.name}\nQuantity: ${quantity}\nUnit Price: ${money(product)}\nTotal: ${total.toFixed(2)} ${product.currency}`;
  if (payment.address) {
    text += `\n\n💳 ${payment.label}\nNetwork: ${payment.network}\nAddress:\n${payment.address}\n\nAfter payment, send your transaction ID to support.`;
  } else {
    text += '\n\nPayment details are currently unavailable. Please contact support.';
  }

  return sendMessage(chatId, text, { reply_markup: mainKeyboard() });
}

async function handleMessage(message) {
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();
  const t = text.toLowerCase();

  try {
    const session = await getSession(chatId).catch(() => null);
    if (session?.action === 'awaiting_quantity' && /^\d+$/.test(text)) {
      return handleBuyQuantity(message, session);
    }

    if (t === '/start' || t === 'start' || t === '/store') return showMenu(chatId);
    if (t === '/stock' || /\b(stock|inventory|available|availability)\b/.test(t)) {
      return sendMessage(chatId, await inventoryText(), { reply_markup: backKeyboard() });
    }
    if (t === '/price' || /\b(price|prices|rate|cost|how much)\b/.test(t)) {
      return sendMessage(chatId, await pricesText(), { reply_markup: backKeyboard() });
    }
    if (t === '/payment' || /\b(payment|pay|binance|usdt|crypto)\b/.test(t)) {
      return sendMessage(chatId, await paymentText(), { reply_markup: backKeyboard() });
    }
    if (t === '/buy' || /\b(buy|order|purchase)\b/.test(t)) {
      const result = await buyKeyboard();
      return sendMessage(chatId, result.text, { reply_markup: result.reply_markup });
    }
    if (t === '/faq') {
      return sendMessage(chatId, '❓ FAQ\n\n• Live Inventory shows current available stock.\n• Prices are read from the live inventory database.\n• Use Buy to create an order.\n• Use Payment for the current payment method.\n• Subscribe Updates to receive new-stock alerts.', { reply_markup: backKeyboard() });
    }
    if (t === '/terms') {
      return sendMessage(chatId, '📄 Terms\n\nPlease review product details, quantity, price, payment network and wallet address carefully before placing or paying for an order.', { reply_markup: backKeyboard() });
    }
    if (t === '/support' || /\b(support|help|problem|issue)\b/.test(t)) {
      return sendMessage(chatId, '💬 Support\n\nSend your question and, if relevant, your Order ID and transaction ID in one message.');
    }
    if (t === '/about') {
      return sendMessage(chatId, 'Gmail Seller customer-service bot with live inventory, dynamic pricing, orders, payment information and stock alerts.', { reply_markup: mainKeyboard() });
    }
    if (/^(hi|hello|hey|salam|assalam|aoa)\b/.test(t)) return showMenu(chatId);

    return sendMessage(chatId, 'I can help with live inventory, prices, payment, orders and support. Choose an option below.', { reply_markup: mainKeyboard() });
  } catch (error) {
    console.error('Telegram message handler error:', error);
    return sendMessage(chatId, '⚠️ The live store data is temporarily unavailable. Please try again shortly.').catch(() => null);
  }
}

async function handleCallbackQuery(query) {
  if (!query?.id || !query?.message?.chat?.id) return;
  const chatId = query.message.chat.id;
  const data = String(query.data || '');
  await answerCallbackQuery(query.id).catch(() => null);

  try {
    if (data === 'menu') return showMenu(chatId);
    if (data === 'inventory') return sendMessage(chatId, await inventoryText(), { reply_markup: backKeyboard() });
    if (data === 'prices') return sendMessage(chatId, await pricesText(), { reply_markup: backKeyboard() });
    if (data === 'payment') return sendMessage(chatId, await paymentText(), { reply_markup: backKeyboard() });
    if (data === 'buy') {
      const result = await buyKeyboard();
      return sendMessage(chatId, result.text, { reply_markup: result.reply_markup });
    }
    if (data.startsWith('buy:')) {
      const productId = data.slice(4);
      const product = await getProduct(productId);
      if (!product || product.stock <= 0) return sendMessage(chatId, 'This product is no longer available.', { reply_markup: backKeyboard() });
      await saveSession(chatId, { action: 'awaiting_quantity', productId });
      return sendMessage(chatId, `You selected ${product.name}.\nAvailable: ${product.stock}\nPrice: ${money(product)} each\n\nSend the quantity you want to order.`);
    }
    if (data === 'subscribe') {
      await saveSubscriber({
        chatId,
        userId: query.from?.id,
        username: query.from?.username,
        firstName: query.from?.first_name,
        lastName: query.from?.last_name
      }, true);
      return sendMessage(chatId, '🔔 Subscribed! You will receive notifications when new inventory is added.', { reply_markup: backKeyboard() });
    }
    if (data === 'unsubscribe') {
      await saveSubscriber({ chatId, userId: query.from?.id, username: query.from?.username }, false);
      return sendMessage(chatId, '🔕 You are unsubscribed from inventory notifications.', { reply_markup: backKeyboard() });
    }
    if (data === 'faq') {
      return sendMessage(chatId, '❓ FAQ\n\nInventory and prices are loaded live from the database. Subscribe Updates for new-stock alerts. Use Buy to create an order.', { reply_markup: backKeyboard() });
    }
    if (data === 'support') return sendMessage(chatId, '💬 Send your question with the relevant Order ID or transaction ID, if applicable.', { reply_markup: backKeyboard() });
  } catch (error) {
    console.error('Telegram callback handler error:', error);
    return sendMessage(chatId, '⚠️ Could not load live store data right now. Please try again shortly.').catch(() => null);
  }
}

async function broadcastInventoryUpdate(product) {
  const subscribers = await listSubscribers();
  if (!subscribers.length) return { sent: 0, failed: 0 };

  const text = `🔔 New Inventory Available!\n\n📧 ${product.name}\nAvailable: ${product.stock}\nPrice: ${money(product)} each\n\nOpen the bot and tap Buy to order.`;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < subscribers.length; i += 20) {
    const chunk = subscribers.slice(i, i + 20);
    const results = await Promise.allSettled(chunk.map((sub) => sendMessage(sub.chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: '🛒 Buy Now', callback_data: `buy:${product.id}` }]] }
    })));
    results.forEach((r) => r.status === 'fulfilled' ? sent++ : failed++);
  }

  return { sent, failed };
}

async function setWebhook(webhookUrl) {
  return telegramRequest('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  });
}

async function getWebhookInfo() {
  const response = await fetch(telegramApi('getWebhookInfo'));
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`getWebhookInfo failed: ${JSON.stringify(data)}`);
  return data;
}

module.exports = {
  getTelegramToken,
  sendMessage,
  handleMessage,
  handleCallbackQuery,
  broadcastInventoryUpdate,
  setWebhook,
  getWebhookInfo
};
