const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");

// --- Express Server for Web & Render Port Binding ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot & Website Server is Live and Running!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
});

// --- Environment Variables Check ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("ERROR: BOT_TOKEN and MONGO_URI must be provided in Environment Variables!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// --- MongoDB Schemas & Models ---
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  balance: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  payoutUPI: { type: String, default: "" },
  payoutBank: { type: String, default: "" },
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

// --- Helper Functions ---
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({ userId });
  }
  return user;
}

async function getBotFund() {
  const fundConfig = await Config.findOne({ key: "botFund" });
  return fundConfig ? fundConfig.value : 1000;
}

// 1. Inline Keyboard (מലഞ്ചോടൊപ്പം വരുന്ന ബട്ടണുകൾ)
function getInlineMenuKeyboard() {
  return new InlineKeyboard()
    .text("💰 My Balance", "btn_balance")
    .text("🔄 Refresh", "btn_refresh")
    .row()
    .text("💸 Transfer (P2P)", "btn_p2p")
    .text("🎁 Claim Gift Code", "btn_gift")
    .row()
    .text("⚙️ Payout Setup", "btn_payout_setup")
    .text("🏦 Withdraw", "btn_withdraw");
}

// 2. Persistent Reply Keyboard (താഴെ കാണുന്ന 6 ബട്ടണുകൾ)
function getReplyKeyboard() {
  return new Keyboard()
    .text("📋 Tasks").text("💰 My Balance").row()
    .text("🎁 Gift Code").text("💸 P2P Transfer").row()
    .text("🏦 Withdraw").text("💳 Payout Method")
    .resized();
}

// --- Bot Commands & Handlers ---

// /start Command
bot.command("start", async (ctx) => {
  await getUser(ctx.from.id);
  const welcomeText = `👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome to Telegram Payment Task Bot! Use the options below:`;
  
  await ctx.reply(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getReplyKeyboard() // താഴെയുള്ള 6 ബട്ടണുകൾ വരാൻ
  });

  await ctx.reply("👇 Main Menu Options:", {
    reply_markup: getInlineMenuKeyboard() // മെസ്സേജിനുള്ളിലെ ഇൻലൈൻ ബട്ടണുകൾ
  });
});

// Balance & Refresh In-Place Update function
async function renderBalance(ctx, isEdit = false) {
  const user = await getUser(ctx.from.id);
  const botFund = await getBotFund();
  
  const text = `👤 *User Dashboard*\n\n` +
               `🆔 **User ID:** \`${user.userId}\`\n` +
               `💰 **Balance:** ₹${user.balance.toFixed(2)}\n` +
               `👥 **Referrals:** ${user.referrals}\n\n` +
               `🏦 **Bot Fund Balance:** ₹${botFund.toFixed(2)}`;

  const keyboard = new InlineKeyboard()
    .text("🔄 Refresh Balance", "btn_refresh")
    .row()
    .text("🔙 Back to Main Menu", "btn_main_menu");

  if (isEdit) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (e) {}
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

// Inline Callback Queries
bot.callbackQuery("btn_balance", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderBalance(ctx, true);
});

bot.callbackQuery("btn_refresh", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "🔄 Refreshed!" });
  await renderBalance(ctx, true);
});

bot.callbackQuery("btn_main_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("👋 Returned to Main Menu!", {
    parse_mode: "Markdown",
    reply_markup: getInlineMenuKeyboard()
  });
});

bot.callbackQuery("btn_payout_setup", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from.id);
  
  const text = `⚙️ *Payout Method Setup*\n\n` +
               `📍 **Current UPI:** ${user.payoutUPI || "Not Set"}\n` +
               `🏦 **Current Bank Details:** ${user.payoutBank || "Not Set"}\n\n` +
               `To update, send command:\n👉 \`/setupi <Your_UPI_ID>\``;

  const keyboard = new InlineKeyboard().text("🔙 Back to Main Menu", "btn_main_menu");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.callbackQuery("btn_p2p", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("💸 To transfer balance, use format:\n`/transfer <User_ID> <Amount>`", { parse_mode: "Markdown" });
});

bot.callbackQuery("btn_gift", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🎁 To claim gift code, use format:\n`/claim <GIFT_CODE>`", { parse_mode: "Markdown" });
});

bot.callbackQuery("btn_withdraw", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🏦 Withdraw feature is coming soon!");
});

// Reply Keyboard Text Handlers (താഴെയുള്ള ബട്ടണുകൾ അമർത്തുമ്പോൾ പ്രവർത്തിക്കുന്നത്)
bot.hears("💰 My Balance", async (ctx) => {
  await renderBalance(ctx, false);
});

bot.hears("📋 Tasks", async (ctx) => {
  await ctx.reply("📋 Available tasks will appear here soon!");
});

bot.hears("🎁 Gift Code", async (ctx) => {
  await ctx.reply("🎁 Send your gift code using: `/claim <code>`", { parse_mode: "Markdown" });
});

bot.hears("💸 P2P Transfer", async (ctx) => {
  await ctx.reply("💸 To transfer funds, use: `/transfer <User_ID> <Amount>`", { parse_mode: "Markdown" });
});

bot.hears("🏦 Withdraw", async (ctx) => {
  await ctx.reply("🏦 Withdraw requests are processed via your saved Payout Method.");
});

bot.hears("💳 Payout Method", async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(`💳 *Your Payout Details*\n\n📍 UPI: ${user.payoutUPI || "Not Set"}\n\nTo update, use: \`/setupi <UPI_ID>\``, { parse_mode: "Markdown" });
});

// Bot Commands
bot.command("setupi", async (ctx) => {
  const upi = ctx.match.trim();
  if (!upi) return ctx.reply("❌ Please provide UPI ID: `/setupi myname@upi`", { parse_mode: "Markdown" });
  
  await User.findOneAndUpdate({ userId: ctx.from.id }, { payoutUPI: upi });
  await ctx.reply(`✅ UPI ID saved successfully: \`${upi}\``, { parse_mode: "Markdown" });
});

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

bot.command("claim", async (ctx) => {
  const codeInput = ctx.match.trim();
  if (!codeInput) return ctx.reply("❌ Provide gift code: `/claim GIFT100`", { parse_mode: "Markdown" });

  const gift = await GiftCode.findOne({ code: codeInput });
  if (!gift) return ctx.reply("❌ Invalid Gift Code!");
  if (gift.isClaimed) return ctx.reply("❌ Gift Code already claimed!");

  gift.isClaimed = true;
  gift.claimedBy = ctx.from.id;
  await gift.save();

  await User.findOneAndUpdate({ userId: ctx.from.id }, { $inc: { balance: gift.amount } });
  await ctx.reply(`🎉 ₹${gift.amount} added to your balance!`);
});

bot.command("addbalance", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.match.split(" ");
  const targetId = parseInt(args[0], 10);
  const amount = parseFloat(args[1]);

  if (isNaN(targetId) || isNaN(amount)) return ctx.reply("Admin: `/addbalance <User_ID> <Amount>`");

  const updatedUser = await User.findOneAndUpdate(
    { userId: targetId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );

  await ctx.reply(`✅ User \`${targetId}\` balance updated to ₹${updatedUser.balance.toFixed(2)}`);
});

// --- Database Connect & Bot Start ---
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Atlas Successfully Connected!");
    bot.start({
      onStart: (botInfo) => console.log(`🚀 Bot @${botInfo.username} is running 24/7 on Render!`)
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });
