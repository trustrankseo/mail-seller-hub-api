const TelegramBot = require('node-telegram-bot-api');

function startTelegramBot(){
  if(!process.env.TELEGRAM_TOKEN) return null;

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN,{polling:true});

  bot.on('message',(msg)=>{
    const text = msg.text || '';
    let reply = 'Thanks for contacting us. Please choose an option or ask your question.';

    if(text.toLowerCase().includes('price')) reply='Please check our latest prices.';
    if(text.toLowerCase().includes('payment')) reply='Payment is available through Binance.';
    if(text.toLowerCase().includes('buy')) reply='Please send package quantity and we will create your order.';

    bot.sendMessage(msg.chat.id, reply);
  });

  return bot;
}

module.exports = startTelegramBot;
