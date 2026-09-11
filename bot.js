const { Bot, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");

// --- Environment Variables Check ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0", 10);
const PAYOUT_CHANNEL_ID = process.env.PAYOUT_CHANNEL_ID || "";

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

const withdrawalSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  details: { type: String, required: true },
  status: { type: String, default: "PENDING" }, // PENDING, APPROVED, REJECTED
  createdAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const User = mongoose.model("User", userSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);
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
  return fundConfig ? fundConfig.value : 1000; // Default Fund: 1000
}

async function updateBotFund(amount) {
  await Config.findOneAndUpdate(
    { key: "botFund" },
    { $inc: { value: amount } },
    { upsert: true, new: true }
  );
}

// Inline keyboard layout builder for clean UI
function getMainMenuKeyboard() {
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

// --- Bot Commands & Callbacks ---

// /start Command
bot.command("start", async (ctx) => {
  await getUser(ctx.from.id);
  const welcomeText = `👋 *ഹലോ ${ctx.from.first_name || "User"}!* \n\nTelegram Payment Task Bot-ലേക്ക് സ്വാഗതം! താഴെയുള്ള ഓപ്ഷനുകൾ ഉപയോഗിക്കാം:`;
  await ctx.reply(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard()
  });
});

// Balance & Refresh In-Place Update (Prevents Chat Spam)
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
    } catch (e) {
      // Ignore "message is not modified" error
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

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
  const welcomeText = `👋 Main Menu-ലേക്ക് തിരികെ എത്തി!`;
  await ctx.editMessageText(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard()
  });
});

// --- Payout Setup UI ---
bot.callbackQuery("btn_payout_setup", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from.id);
  
  const text = `⚙️ *Payout Method Setup*\n\n` +
               `📍 **Current UPI:** ${user.payoutUPI || "Not Set"}\n` +
               `🏦 **Current Bank Details:** ${user.payoutBank || "Not Set"}\n\n` +
               `മാറ്റങ്ങൾ വരുത്താൻ താഴെ കൊടുത്ത കമാൻഡുകൾ അയക്കുക:\n` +
               `👉 \`/setupi <Your_UPI_ID>\`\n` +
               `👉 \`/setbank <Account_No, IFSC, Name>\``;

  const keyboard = new InlineKeyboard().text("🔙 Back to Main Menu", "btn_main_menu");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.command("setupi", async (ctx) => {
  const upi = ctx.match.trim();
  if (!upi) return ctx.reply("❌ ദയവായി ഉപയോഗിക്കേണ്ട UPI ID ചേർത്ത് നൽകുക. \nഉദാഹരണം: `/setupi myname@upi`", { parse_mode: "Markdown" });
  
  await User.findOneAndUpdate({ userId: ctx.from.id }, { payoutUPI: upi });
  await ctx.reply(`✅ നിങ്ങളുടെ UPI ID സക്സസ്ഫുളായി സേവ് ചെയ്തു: \`${upi}\``, { parse_mode: "Markdown" });
});

bot.command("setbank", async (ctx) => {
  const bank = ctx.match.trim();
  if (!bank) return ctx.reply("❌ ദയവായി ബാങ്ക് വിവരങ്ങൾ ചേർത്ത് നൽകുക. \nഉദാഹരണം: `/setbank 12345678, SBIN0001234, Name`", { parse_mode: "Markdown" });
  
  await User.findOneAndUpdate({ userId: ctx.from.id }, { payoutBank: bank });
  await ctx.reply(`✅ നിങ്ങളുടെ Bank Details സക്സസ്ഫുളായി സേവ് ചെയ്തു!`);
});

// --- P2P Transfer System ---
bot.command("transfer", async (ctx) => {
  const args = ctx.match.split(" ");
  if (args.length < 2) {
    return ctx.reply("❌ ശരിയായ ഫോർമാറ്റ് ഉപയോഗിക്കുക: `/transfer <User_ID> <Amount>`", { parse_mode: "Markdown" });
  }

  const targetId = parseInt(args[0], 10);
  const amount = parseFloat(args[1]);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ തെറ്റായ User ID അല്ലെങ്കിൽ തുക!");
  }

  const sender = await getUser(ctx.from.id);
  if (sender.balance < amount) {
    return ctx.reply("❌ നിങ്ങളുടെ അക്കൗണ്ടിൽ ആവശ്യത്തിന് ബാലൻസ് ഇല്ല!");
  }

  const recipient = await User.findOne({ userId: targetId });
  if (!recipient) {
    return ctx.reply("❌ സ്വീകർത്താവിനെ കണ്ടെത്താനായില്ല! User ID പരിശോധിക്കുക.");
  }

  // Deduct & Credit (MongoDB Session Transaction safe)
  sender.balance -= amount;
  recipient.balance += amount;
  await sender.save();
  await recipient.save();

  await ctx.reply(`✅ ₹${amount} വിജയകരമായി User ID \`${targetId}\`-ലേക്ക് ട്രാൻസ്ഫർ ചെയ്തു!`, { parse_mode: "Markdown" });
  
  try {
    await bot.api.sendMessage(targetId, `🎉 നിങ്ങൾക്ക് \`${ctx.from.id}\`-ൽ നിന്ന് ₹${amount} P2P Transfer ലഭിച്ചു!`, { parse_mode: "Markdown" });
  } catch (e) {
    // Recipient blocked bot or chat unavailable
  }
});

// --- Gift Code Claiming System ---
bot.command("claim", async (ctx) => {
  const codeInput = ctx.match.trim();
  if (!codeInput) return ctx.reply("❌ Gift code നൽകുക. ഉദാഹരണത്തിന്: `/claim GIFT100`", { parse_mode: "Markdown" });

  const gift = await GiftCode.findOne({ code: codeInput });
  if (!gift) return ctx.reply("❌ നൽകിയ Gift Code നിലവിലില്ല!");
  if (gift.isClaimed) return ctx.reply("❌ ഈ Gift Code ഇതിനകം ക്ലെയിം ചെയ്‌തതാണ്!");

  gift.isClaimed = true;
  gift.claimedBy = ctx.from.id;
  await gift.save();

  await User.findOneAndUpdate({ userId: ctx.from.id }, { $inc: { balance: gift.amount } });

  await ctx.reply(`🎉 അഭിനന്ദനങ്ങൾ! Gift Code വഴി ₹${gift.amount} നിങ്ങളുടെ ബാലൻസിലേക്ക് ആഡ് ചെയ്തു!`);
});

// --- Admin Controls & Notifications ---
bot.command("addbalance", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.match.split(" ");
  const targetId = parseInt(args[0], 10);
  const amount = parseFloat(args[1]);

  if (isNaN(targetId) || isNaN(amount)) {
    return ctx.reply(" Admin Format: `/addbalance <User_ID> <Amount>`", { parse_mode: "Markdown" });
  }

  const updatedUser = await User.findOneAndUpdate(
    { userId: targetId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );

  await ctx.reply(`✅ User \`${targetId}\`-ന്റെ ബാലൻസ് ₹${updatedUser.balance.toFixed(2)} ആയി അപ്ഡേറ്റ് ചെയ്തു.`, { parse_mode: "Markdown" });

  try {
    await bot.api.sendMessage(targetId, `🔔 Admin നിങ്ങളുടെ വാലറ്റിലേക്ക് ₹${amount} ക്രെഡിറ്റ് ചെയ്തിട്ടുണ്ട്!\n💰 നിലവിലെ ബാലൻസ്: ₹${updatedUser.balance.toFixed(2)}`);
  } catch (e) {}
});

bot.command("creategift", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.match.split(" ");
  const code = args[0];
  const amount = parseFloat(args[1]);

  if (!code || isNaN(amount)) {
    return ctx.reply(" Admin Format: `/creategift <Code> <Amount>`", { parse_mode: "Markdown" });
  }

  try {
    await GiftCode.create({ code, amount });
    await ctx.reply(`✅ New Gift Code Created: \`${code}\` for ₹${amount}`, { parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply("❌ ഈ കോഡ് മുൻപേ ക്രിയേറ്റ് ചെയ്തതാണ്!");
  }
});

// Database Connect & Bot Launching
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
