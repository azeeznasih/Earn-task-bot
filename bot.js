const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");

// --- Express Server for 24/7 Render Uptime ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot & Website Server is Live and Running 24/7!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
});

setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    fetch(renderUrl).catch(() => {});
  }
}, 300000);

// --- Environment Variables ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MAIN_OWNER_ID = parseInt(process.env.ADMIN_ID || "0", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ ERROR: BOT_TOKEN and MONGO_URI must be provided!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// --- MongoDB Schemas ---
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  balance: { type: Number, default: 0 },
  walletId: { type: String, default: "" },
  payoutGatewayName: { type: String, default: "Ultra-Pay" },
  payoutGatewayAccount: { type: String, default: "Not Set" },
  bankAccount: { type: String, default: "" },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const User = mongoose.model("User", userSchema);
const Config = mongoose.model("Config", configSchema);

const userState = {};

// Helper: Get Config value with defaults
async function getConfig(key, defaultValue) {
  let conf = await Config.findOne({ key });
  return conf ? conf.value : defaultValue;
}

async function setConfig(key, value) {
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}

// Helper: Check if User is Admin or Owner
async function isAdmin(userId) {
  if (userId === MAIN_OWNER_ID) return true;
  let admins = await getConfig("admins", []);
  return admins.includes(userId);
}

// Helper: Get User
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

// Dynamic Reply Keyboard based on Customization
async function getReplyKeyboard() {
  let btn1 = await getConfig("btn_balance", "🚀 My Balance");
  let btn2 = await getConfig("btn_tasks", "📋 Tasks");
  let btn3 = await getConfig("btn_gift", "🎁 Gift Code");
  let btn4 = await getConfig("btn_transfer", "💸 P2P Transfer");
  let btn5 = await getConfig("btn_payout", "💳 Payout Method");
  let btn6 = await getConfig("btn_withdraw", "🏦 Withdraw");

  return new Keyboard()
    .text(btn1).text(btn2).row()
    .text(btn3).text(btn4).row()
    .text(btn5).text(btn6)
    .resized();
}

// Forced Join Middleware / Check
async function checkForceJoin(ctx) {
  let channels = await getConfig("forced_channels", []);
  if (!channels || channels.length === 0) return true;

  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch, ctx.from.id);
      if (["left", "kicked", "restricted"].includes(member.status)) {
        return false;
      }
    } catch (e) {
      // If bot is not admin in channel, skip or handle
    }
  }
  return true;
}

// --- /start Command ---
bot.command("start", async (ctx) => {
  try {
    delete userState[ctx.from.id];
    let userId = ctx.from.id;
    let user = await getUser(userId);

    if (user.isBanned) {
      return ctx.reply("❌ You are banned from using this bot.");
    }

    // Check Force Join
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) {
      let channels = await getConfig("forced_channels", []);
      let keyboard = new InlineKeyboard();
      channels.forEach((ch, idx) => {
        keyboard.url(`📢 Join Channel ${idx + 1}`, `https://t.me/${ch.replace('@', '')}`).row();
      });
      keyboard.text("✅ I have Joined", "check_join");
      let joinText = await getConfig("text_forced_join", "⚠️ **You must join our channels to use this bot!**\n\nPlease join the channels below and click 'I have Joined':");
      return ctx.reply(joinText, { parse_mode: "Markdown", reply_markup: keyboard });
    }

    let welcomeText = await getConfig("text_welcome", `👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome to Telegram Payment Task Bot! Use the keyboard buttons below:`);
    
    await ctx.reply(welcomeText, {
      parse_mode: "Markdown",
      reply_markup: await getReplyKeyboard()
    });
  } catch (err) {
    console.error("Error in /start:", err);
  }
});

bot.callbackQuery("check_join", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) {
    return ctx.answerCallbackQuery({ text: "❌ You have not joined all channels yet!", show_alert: true });
  }
  await ctx.deleteMessage().catch(() => {});
  let welcomeText = await getConfig("text_welcome", `👋 Welcome back! Choose an option below:`);
  await ctx.reply(welcomeText, { parse_mode: "Markdown", reply_markup: await getReplyKeyboard() });
});

// --- ADMIN PANEL COMMAND ---
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.reply("❌ You are not an admin!");

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  let panelText = `👑 **Welcome To Admin Panel**\n\n` +
                  `💡 **Review Bot Details ^_^**\n` +
                  `👨‍💻 **Main Owner** ~ \`${ownerId}\`\n` +
                  `🤖 **Bot On/Off** ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 **Minimum Withdraw** ~ ${minW}\n` +
                  `💰 **Maximum Withdraw** ~ ${maxW}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("📢 Manage Channels", "adm_channels").text("🔄 Reset Balance", "adm_reset_bal").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🎨 Customize Texts & Themes", "adm_customize").row()
    .text("🔄 Refresh Panel", "admin");

  await ctx.reply(panelText, { parse_mode: "Markdown", reply_markup: keyboard });
});

// Admin Panel Actions via Callbacks
bot.callbackQuery("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  let panelText = `👑 **Welcome To Admin Panel**\n\n` +
                  `💡 **Review Bot Details ^_^**\n` +
                  `👨‍💻 **Main Owner** ~ \`${ownerId}\`\n` +
                  `🤖 **Bot On/Off** ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 **Minimum Withdraw** ~ ${minW}\n` +
                  `💰 **Maximum Withdraw** ~ ${maxW}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("📢 Manage Channels", "adm_channels").text("🔄 Reset Balance", "adm_reset_bal").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🎨 Customize Texts & Themes", "adm_customize").row()
    .text("🔄 Refresh Panel", "admin");

  await ctx.editMessageText(panelText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => {});
});

// 1. Add Balance Admin Handler
bot.callbackQuery("adm_add_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ **Add Balance:**\n\nSend in format: `UserID Amount`\n(Example: `123456789 50`)", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 2. Remove Balance Admin Handler
bot.callbackQuery("adm_rem_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ **Remove Balance:**\n\nSend in format: `UserID Amount`\n(Example: `123456789 20`)", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 3. Reset Balance Admin Handler
bot.callbackQuery("adm_reset_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 **Reset Balance:**\n\nSend the `UserID` whose balance you want to reset to 0:", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 4. Manage Channels (Forced Join) Handler
bot.callbackQuery("adm_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await getConfig("forced_channels", []);
  userState[ctx.from.id] = "WAITING_FOR_CHANNEL_ADD";
  await ctx.editMessageText(`📢 **Manage Forced Join Channels:**\n\nCurrent Channels: ${channels.join(", ") || "None"}\n\nSend channel username to add (e.g., \`@MyChannel\`) or type \`clear\` to remove all:`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 5. Manage Admins Handler
bot.callbackQuery("adm_admins", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) {
    return ctx.answerCallbackQuery({ text: "Only Main Owner can manage admins!", show_alert: true });
  }
  let admins = await getConfig("admins", []);
  userState[ctx.from.id] = "WAITING_FOR_ADMIN_ID";
  await ctx.editMessageText(`👥 **Manage Admins:**\n\nCurrent Admin IDs: ${admins.join(", ") || "None"}\n\nSend ` + "`add <ID>`" + ` or ` + "`remove <ID>`" + `:`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 6. Transfer Ownership Handler
bot.callbackQuery("adm_transfer", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) {
    return ctx.answerCallbackQuery({ text: "Only Main Owner can transfer ownership!", show_alert: true });
  }
  userState[ctx.from.id] = "WAITING_FOR_NEW_OWNER";
  await ctx.editMessageText("👑 **Transfer Ownership:**\n\nSend the Telegram `UserID` of the new owner:", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// 7. Customize Theme & Texts Handler
bot.callbackQuery("adm_customize", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_CUSTOM_TEXT";
  await ctx.editMessageText("🎨 **Customize Text / Theme:**\n\nSend in format: `key value`\n\nAvailable keys:\n- `text_welcome` (Start message)\n- `btn_balance` (Balance button name)\n- `btn_withdraw` (Withdraw button name)", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// --- User Features (Balance, Withdraw, Payout, etc.) ---
bot.hears(/^(🚀 My Balance|.+)$/, async (ctx, next) => {
  let text = ctx.text;
  let userId = ctx.from.id;
  let user = await getUser(userId);

  let btnBalance = await getConfig("btn_balance", "🚀 My Balance");
  let btnTasks = await getConfig("btn_tasks", "📋 Tasks");
  let btnGift = await getConfig("btn_gift", "🎁 Gift Code");
  let btnTransfer = await getConfig("btn_transfer", "💸 P2P Transfer");
  let btnPayout = await getConfig("btn_payout", "💳 Payout Method");
  let btnWithdraw = await getConfig("btn_withdraw", "🏦 Withdraw");

  if (text === btnBalance) {
    let msg = `💳 **Wallet Overview** 💳\n\n` +
              `🌐 **Wallet ID** → \`${user.walletId}\`\n` +
              `💰 **Balance** → ₹${user.balance.toFixed(2)}`;
    return ctx.reply(msg, { parse_mode: "Markdown" });
  }
  else if (text === btnPayout) {
    let msg = `💳 **Payout Method Settings**\n\n` +
              `Current Gateway: *${user.payoutGatewayName}*\n` +
              `Account / UPI: \`${user.payoutGatewayAccount}\``;
    let kb = new InlineKeyboard()
      .text("🔗 Set Gateway Name", "set_gw_name").row()
      .text("💰 Set Gateway Account", "set_gw_acc");
    return ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  }
  else if (text === btnWithdraw) {
    let msg = `🏦 **Withdrawal Menu**\n\n` +
              `Active Gateway: *${user.payoutGatewayName}*\n` +
              `Your Balance: ₹${user.balance.toFixed(2)}`;
    let kb = new InlineKeyboard().text(`🟢 Withdraw via ${user.payoutGatewayName}`, "do_withdraw");
    return ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  }
  else if (text === btnTasks) {
    return ctx.reply("📋 Tasks feature is coming soon!");
  }
  else if (text === btnGift) {
    return ctx.reply("🎁 Send your gift code in chat:");
  }
  else {
    return next();
  }
});

bot.callbackQuery("set_gw_name", async (ctx) => {
  userState[ctx.from.id] = "USER_SET_GW_NAME";
  await ctx.answerCallbackQuery();
  await ctx.reply("🔗 Send your desired **Gateway Name** (e.g., Ultra-Pay, VSV Wallet):", { parse_mode: "Markdown" });
});

bot.callbackQuery("set_gw_acc", async (ctx) => {
  userState[ctx.from.id] = "USER_SET_GW_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("💰 Send your **Gateway Account / UPI ID**:", { parse_mode: "Markdown" });
});

bot.callbackQuery("do_withdraw", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.balance <= 0) return ctx.answerCallbackQuery({ text: "❌ Insufficient balance for withdrawal!", show_alert: true });
  await ctx.reply(`✅ Withdrawal request of ₹${user.balance.toFixed(2)} via *${user.payoutGatewayName}* submitted successfully!`, { parse_mode: "Markdown" });
});

// --- Text State Inputs (Admin & User Customizations) ---
bot.on("message:text", async (ctx) => {
  let userId = ctx.from.id;
  let text = ctx.text.trim();
  let state = userState[userId];

  if (!state) return;

  // Admin States
  if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split(" ");
    let targetId = parseInt(parts[0], 10);
    let amount = parseFloat(parts[1]);
    if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Invalid format! Use: `UserID Amount`");

    let updated = await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amount } }, { new: true, upsert: true });
    return ctx.reply(`✅ Successfully added ₹${amount} to user \`${targetId}\`. New Balance: ₹${updated.balance.toFixed(2)}`, { parse_mode: "Markdown" });
  }

  if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split(" ");
    let targetId = parseInt(parts[0], 10);
    let amount = parseFloat(parts[1]);
    if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Invalid format! Use: `UserID Amount`");

    let targetUser = await getUser(targetId);
    let newBal = Math.max(0, targetUser.balance - amount);
    targetUser.balance = newBal;
    await targetUser.save();
    return ctx.reply(`✅ Successfully removed ₹${amount} from user \`${targetId}\`. Current Balance: ₹${newBal.toFixed(2)}`, { parse_mode: "Markdown" });
  }

  if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");
    await User.findOneAndUpdate({ userId: targetId }, { balance: 0 });
    return ctx.reply(`✅ Balance for user \`${targetId}\` has been reset to 0.`, { parse_mode: "Markdown" });
  }

  if (state === "WAITING_FOR_CHANNEL_ADD" && (await isAdmin(userId))) {
    delete userState[userId];
    if (text.toLowerCase() === "clear") {
      await setConfig("forced_channels", []);
      return ctx.reply("✅ All forced channels cleared.");
    }
    let channels = await getConfig("forced_channels", []);
    if (!channels.includes(text)) channels.push(text);
    await setConfig("forced_channels", channels);
    return ctx.reply(`✅ Channel ${text} added successfully to forced join list.`);
  }

  if (state === "WAITING_FOR_NEW_OWNER") {
    delete userState[userId];
    let newOwnerId = parseInt(text, 10);
    if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid ID!");
    await setConfig("owner_id", newOwnerId);
    return ctx.reply(`👑 Ownership successfully transferred to \`${newOwnerId}\`!`, { parse_mode: "Markdown" });
  }

  if (state === "WAITING_FOR_CUSTOM_TEXT" && (await isAdmin(userId))) {
    delete userState[userId];
    let spaceIdx = text.indexOf(" ");
    if (spaceIdx === -1) return ctx.reply("❌ Format: `key value`");
    let key = text.substring(0, spaceIdx);
    let val = text.substring(spaceIdx + 1);
    await setConfig(key, val);
    return ctx.reply(`✅ Successfully updated configuration for \`${key}\``, { parse_mode: "Markdown" });
  }

  // User States
  if (state === "USER_SET_GW_NAME") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { payoutGatewayName: text });
    return ctx.reply(`✅ Gateway Name updated to: *${text}*`, { parse_mode: "Markdown" });
  }

  if (state === "USER_SET_GW_ACC") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { payoutGatewayAccount: text });
    return ctx.reply(`✅ Gateway Account / UPI saved as: \`${text}\``, { parse_mode: "Markdown" });
  }
});

// Global Error Handler
bot.catch((err) => {
  console.error("❌ Bot Error:", err);
});

// --- Start Bot & DB ---
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Atlas Connected Successfully!");
    bot.start({
      onStart: (info) => console.log(`🚀 Bot @${info.username} is running 24/7 with Full Admin Panel!`)
    });
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err);
  });
