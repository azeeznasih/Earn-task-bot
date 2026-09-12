const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const axios = require("axios");

// --- Express Server for 24/7 Render Uptime ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot & Website Server is Live and Running 24/7!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
});

// Self-ping to prevent Render from sleeping (Keeps Bot 24/7 Active)
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    axios.get(renderUrl).catch((err) => {
      console.error("Keep-Alive Ping Error:", err.message);
    });
  }
}, 300000); // Every 5 minutes

// --- Environment Variables Check ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ ERROR: BOT_TOKEN and MONGO_URI must be provided in Environment Variables!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// --- MongoDB Schemas & Models ---
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  balance: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  walletId: { type: String, default: "" },
  payoutUPI: { type: String, default: "" },
  payoutGatewayName: { type: String, default: "Not Set" },
  payoutGatewayAccount: { type: String, default: "Not Set" },
  bankAccount: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  isClaimed: { type: Boolean, default: false },
  claimedBy: { type: Number, default: null }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const User = mongoose.model("User", userSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const Config = mongoose.model("Config", configSchema);

const userState = {};

// --- Helper Functions ---
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({ 
      userId, 
      walletId: Math.floor(1000000000 + Math.random() * 9000000000).toString() 
    });
  }
  return user;
}

async function getBotFund() {
  const fundConfig = await Config.findOne({ key: "botFund" });
  return fundConfig ? fundConfig.value : 1000;
}

// Bottom Persistent Reply Keyboard
function getReplyKeyboard() {
  return new Keyboard()
    .text("🚀 My Balance").text("📋 Tasks").row()
    .text("🎁 Gift Code").text("💸 P2P Transfer").row()
    .text("💳 Payout Method").text("🏦 Withdraw")
    .resized();
}

// --- Bot Commands & Handlers ---

bot.command("start", async (ctx) => {
  delete userState[ctx.from.id];
  await getUser(ctx.from.id);
  const welcomeText = `👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome to Telegram Payment Task Bot! Use the keyboard buttons below:`;
  
  await ctx.reply(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getReplyKeyboard()
  });
});

// 1. MY BALANCE / WALLET OVERVIEW
async function sendBalanceMessage(ctx) {
  const user = await getUser(ctx.from.id);
  const botFund = await getBotFund();
  
  const text = `💳 **Wallet Overview** 💳\n\n` +
               `🌐 **Wallet ID** → \`${user.walletId}\`\n` +
               `💰 **Balance** → ₹${user.balance.toFixed(2)}\n\n` +
               `Built with security you can Trust. Support that responds promptly. ✅`;

  const keyboard = new InlineKeyboard()
    .text("📁 Balance Statement", "btn_statement").row()
    .text("💰 Live Bot Fund", "btn_bot_fund").row()
    .text("📢 Contact Support ↗", "btn_support");

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
}

bot.hears("🚀 My Balance", async (ctx) => {
  delete userState[ctx.from.id];
  await sendBalanceMessage(ctx);
});

bot.callbackQuery("btn_statement", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from.id);
  await ctx.reply(`📁 *Balance Statement*\n\nUser ID: \`${user.userId}\`\nCurrent Balance: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown" });
});

bot.callbackQuery("btn_bot_fund", async (ctx) => {
  await ctx.answerCallbackQuery();
  const botFund = await getBotFund();
  await ctx.reply(`💰 *Live Bot Fund Balance:* ₹${botFund.toFixed(2)}`, { parse_mode: "Markdown" });
});

bot.callbackQuery("btn_support", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(`📢 For support, contact our admin team.`);
});

// 2. PAYOUT METHOD
bot.hears("💳 Payout Method", async (ctx) => {
  delete userState[ctx.from.id];
  const user = await getUser(ctx.from.id);
  
  const text = `Choose Desired Payment Method From Below 👇\n\n` +
               `Your Current Gateway Name - ${user.payoutGatewayName}\n` +
               `Your Current Gateway Account/UPI - ${user.payoutGatewayAccount}\n` +
               `Your Current Bank Account - ${user.bankAccount || "Not Set"}`;

  const keyboard = new InlineKeyboard()
    .text("🔗 Set Gateway Name", "set_gateway_name").row()
    .text("💰 Set Gateway Account / UPI", "set_gateway_account").row()
    .text("🏦 Set Bank Account", "set_bank_account");

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.callbackQuery("set_gateway_name", async (ctx) => {
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_GATEWAY_NAME";
  const keyboard = new InlineKeyboard().text("❌ Cancel", "cancel_action");
  await ctx.editMessageText("🔗 Please send your **Gateway Name** (e.g., your custom gateway or wallet name) in the chat below:", {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
});

bot.callbackQuery("set_gateway_account", async (ctx) => {
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_GATEWAY_ACCOUNT";
  const keyboard = new InlineKeyboard().text("❌ Cancel", "cancel_action");
  await ctx.editMessageText("💰 Please send your **Gateway Account / UPI ID** in the chat below:", {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
});

bot.callbackQuery("set_bank_account", async (ctx) => {
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_BANK";
  const keyboard = new InlineKeyboard().text("❌ Cancel", "cancel_action");
  await ctx.editMessageText("🏦 Please send your **Bank Account Details** in the chat below:", {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
});

bot.callbackQuery("cancel_action", async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  await ctx.editMessageText("❌ Action cancelled.");
});

// 3. WITHDRAW METHOD
bot.hears("🏦 Withdraw", async (ctx) => {
  delete userState[ctx.from.id];
  const user = await getUser(ctx.from.id);
  
  const text = `✨ Choose Withdrawal Method:\n\n` +
               `📌 Active Gateway: *${user.payoutGatewayName}*`;

  const keyboard = new InlineKeyboard()
    .text(`🟢 ${user.payoutGatewayName}`, "wd_gateway").row()
    .text("💳 Bank Transfer", "wd_bank");

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.callbackQuery("wd_gateway", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from.id);
  await ctx.reply(`🟢 Withdrawal via *${user.payoutGatewayName}* selected. Account: \`${user.payoutGatewayAccount}\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("wd_bank", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from.id);
  await ctx.reply(`🏦 Bank withdrawal selected. Account: \`${user.bankAccount}\``, { parse_mode: "Markdown" });
});

// Other features
bot.hears("📋 Tasks", async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply("📋 Tasks feature is coming soon!");
});

bot.hears("🎁 Gift Code", async (ctx) => {
  userState[ctx.from.id] = "WAITING_FOR_GIFT";
  const keyboard = new InlineKeyboard().text("❌ Cancel", "cancel_action");
  await ctx.reply("🎁 **Enter your Gift Code:**\n\nType and send your gift code in the chat below:", {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
});

bot.hears("💸 P2P Transfer", async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply("💸 To transfer balance, use command:\n`/transfer <User_ID> <Amount>`", { parse_mode: "Markdown" });
});

// Handle Text Inputs
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.text.trim();
  const state = userState[userId];

  if (!state) return;

  if (state === "WAITING_FOR_GATEWAY_NAME") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { payoutGatewayName: text });
    await ctx.reply(`✅ Gateway Name successfully saved as: \`${text}\``, { parse_mode: "Markdown" });
  } 
  else if (state === "WAITING_FOR_GATEWAY_ACCOUNT") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { payoutGatewayAccount: text });
    await ctx.reply(`✅ Gateway Account / UPI successfully saved: \`${text}\``, { parse_mode: "Markdown" });
  }
  else if (state === "WAITING_FOR_BANK") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { bankAccount: text });
    await ctx.reply(`✅ Bank Account details successfully saved!`, { parse_mode: "Markdown" });
  } 
  else if (state === "WAITING_FOR_GIFT") {
    delete userState[userId];
    
    const gift = await GiftCode.findOne({ code: text });
    if (!gift) {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", "retry_gift")
        .row()
        .text("🔙 Main Menu", "cancel_action");
      return ctx.reply(`❌ Invalid Gift Code! The code you entered does not exist.`, { reply_markup: keyboard });
    }
    if (gift.isClaimed) {
      return ctx.reply(`❌ This Gift Code has already been claimed!`);
    }

    gift.isClaimed = true;
    gift.claimedBy = userId;
    await gift.save();

    await User.findOneAndUpdate({ userId }, { $inc: { balance: gift.amount } });
    await ctx.reply(`🎉 Congratulations! ₹${gift.amount} added successfully to your balance!`);
  }
});

bot.callbackQuery("retry_gift", async (ctx) => {
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_GIFT";
  const keyboard = new InlineKeyboard().text("❌ Cancel", "cancel_action");
  await ctx.editMessageText("🎁 **Enter your Gift Code again:**", { parse_mode: "Markdown", reply_markup: keyboard });
});

// Commands
bot.command("transfer", async (ctx) => {
  const args = ctx.match.split(" ");
  if (args.length < 2) return ctx.reply("❌ Format: `/transfer <User_ID> <Amount>`", { parse_mode: "Markdown" });

  const targetId = parseInt(args[0], 10);
  const amount = parseFloat(args[1]);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid ID or Amount!");

  const sender = await getUser(ctx.from.id);
  if (sender.balance < amount) return ctx.reply("❌ Insufficient balance!");

  const recipient = await User.findOne({ userId: targetId });
  if (!recipient) return ctx.reply("❌ Recipient not found!");

  sender.balance -= amount;
  recipient.balance += amount;
  await sender.save();
  await recipient.save();

  await ctx.reply(`✅ ₹${amount} transferred successfully!`);
});

bot.command("addbalance", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.match.split(" ");
  const targetId = parseInt(args[0], 10);
  const amount = parseFloat(args.id || args[1]); // Safe fallback

  if (isNaN(targetId) || isNaN(amount)) return ctx.reply("Admin: `/addbalance <User_ID> <Amount>`");

  const updatedUser = await User.findOneAndUpdate(
    { userId: targetId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );

  await ctx.reply(`✅ User \`${targetId}\` balance updated to ₹${updatedUser.balance.toFixed(2)}`);
});

// --- Detailed Error Handling (Logs on Render & Notifies User/Admin) ---
bot.catch(async (err) => {
  const ctx = err.ctx;
  console.error(`❌ CRITICAL BOT ERROR [Update ID: ${ctx && ctx.update ? ctx.update.update_id : 'Unknown'}]:`, err.error || err);
  
  if (ctx && ctx.chat) {
    try {
      await ctx.reply("⚠️ An unexpected error occurred while processing your request. The developer has been notified via logs.");
    } catch (e) {
      console.error("Failed to send error message to user:", e);
    }
  }
});

// --- Database Connect & Bot Start ---
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Atlas Successfully Connected!");
    bot.start({
      onStart: (botInfo) => console.log(`🚀 Bot @${botInfo.username} is running 24/7 seamlessly with Detailed Error Logging!`)
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });
