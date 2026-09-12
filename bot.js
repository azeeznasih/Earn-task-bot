const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");

// --- Express Server for 24/7 Render / Replit Uptime ---
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

// --- Environment Variables & Config ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MAIN_OWNER_ID = parseInt(process.env.ADMIN_ID || "8061612320", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ ERROR: BOT_TOKEN and MONGO_URI must be provided!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const userState = {};

// --- MongoDB Schemas & Models ---
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  balance: { type: Number, default: 0 },
  walletId: { type: String, default: "" },
  referredBy: { type: Number, default: null },
  referralCount: { type: Number, default: 0 },
  payoutGatewayName: { type: String, default: "Ultra-Pay" },
  payoutGatewayAccount: { type: String, default: "Not Set" },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  reward: { type: Number, required: true },
  link: { type: String, required: true },
  completedUsers: { type: [Number], default: [] }
});

const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const Config = mongoose.model("Config", configSchema);

// --- Helper Functions ---
async function getConfig(key, defaultValue) {
  let conf = await Config.findOne({ key });
  return conf ? conf.value : defaultValue;
}

async function setConfig(key, value) {
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}

async function isAdmin(userId) {
  if (userId === MAIN_OWNER_ID) return true;
  let admins = await getConfig("admins", []);
  return admins.includes(userId);
}

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

async function getReplyKeyboard() {
  let btn1 = await getConfig("btn_balance", "🚀 My Balance");
  let btn2 = await getConfig("btn_tasks", "📋 Task Earn");
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

async function checkForceJoin(ctx) {
  let channels = await getConfig("forced_channels", []);
  if (!channels || channels.length === 0) return true;

  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch, ctx.from.id);
      if (["left", "kicked", "restricted"].includes(member.status)) {
        return false;
      }
    } catch (e) {}
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

    let payload = ctx.match;
    if (payload && !user.referredBy && parseInt(payload, 10) !== userId) {
      let referrerId = parseInt(payload, 10);
      if (!isNaN(referrerId)) {
        user.referredBy = referrerId;
        await user.save();
        let refBonus = await getConfig("referral_bonus", 1);
        await User.findOneAndUpdate({ userId: referrerId }, { $inc: { balance: refBonus, referralCount: 1 } });
        try {
          await ctx.api.sendMessage(referrerId, `🎉 You received ₹${refBonus} referral bonus from a new user!`);
        } catch (e) {}
      }
    }

    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) {
      let channels = await getConfig("forced_channels", []);
      let keyboard = new InlineKeyboard();
      channels.forEach((ch, idx) => {
        keyboard.url(`📢 Join Channel ${idx + 1}`, `https://t.me/${ch.replace('@', '')}`).row();
      });
      keyboard.text("✅ I have Joined", "check_join");
      let joinText = await getConfig("text_forced_join", "⚠️ You must join our channels to use this bot!\n\nPlease join the channels below and click 'I have Joined':");
      return ctx.reply(joinText, { reply_markup: keyboard });
    }

    let welcomeText = await getConfig("text_welcome", `👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome to Telegram Payment Task Bot! Use the keyboard buttons below:`);
    
    await ctx.reply(welcomeText, {
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
  await ctx.reply(welcomeText, { reply_markup: await getReplyKeyboard() });
});

// --- ADMIN PANEL COMMAND ---
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.reply("❌ You are not an admin!");

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  let panelText = `👑 Welcome To Admin Panel\n\n` +
                  `💡 Review Bot Details ^_^\n` +
                  `👨‍💻 Main Owner ~ ${ownerId}\n` +
                  `🤖 Bot On/Off ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 Minimum Withdraw ~ ${minW}\n` +
                  `💰 Maximum Withdraw ~ ${maxW}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("📢 Manage Channels", "adm_channels").text("🔄 Reset Balance", "adm_reset_bal").row()
    .text("📋 Create Task", "adm_create_task").text("🎁 Create Gift", "adm_create_gift").row()
    .text("📢 Broadcast", "adm_broadcast").text("👥 Manage Admins", "adm_admins").row()
    .text("👑 Transfer Ownership", "adm_transfer").text("🎨 Customize Texts", "adm_customize").row()
    .text("🔄 Refresh Panel", "admin");

  await ctx.reply(panelText, { reply_markup: keyboard });
});

bot.callbackQuery("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  let panelText = `👑 Welcome To Admin Panel\n\n` +
                  `💡 Review Bot Details ^_^\n` +
                  `👨‍💻 Main Owner ~ ${ownerId}\n` +
                  `🤖 Bot On/Off ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 Minimum Withdraw ~ ${minW}\n` +
                  `💰 Maximum Withdraw ~ ${maxW}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("📢 Manage Channels", "adm_channels").text("🔄 Reset Balance", "adm_reset_bal").row()
    .text("📋 Create Task", "adm_create_task").text("🎁 Create Gift", "adm_create_gift").row()
    .text("📢 Broadcast", "adm_broadcast").text("👥 Manage Admins", "adm_admins").row()
    .text("👑 Transfer Ownership", "adm_transfer").text("🎨 Customize Texts", "adm_customize").row()
    .text("🔄 Refresh Panel", "admin");

  await ctx.editMessageText(panelText, { reply_markup: keyboard }).catch(() => {});
});

// Admin Callbacks
bot.callbackQuery("adm_add_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend in format: UserID Amount\n(Example: 123456789 50)", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend in format: UserID Amount\n(Example: 123456789 20)", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_reset_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Reset Balance:\n\nSend the UserID whose balance you want to reset to 0:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await getConfig("forced_channels", []);
  userState[ctx.from.id] = "WAITING_FOR_CHANNEL_ADD";
  await ctx.editMessageText(`📢 Manage Forced Join Channels:\n\nCurrent Channels: ${channels.join(", ") || "None"}\n\nSend channel username to add (e.g., @MyChannel) or type clear to remove all:`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText("📋 Create Task:\n\nSend in format: TaskID | Title | Reward | Link\n(Example: task1 | Join Channel | 2 | https://t.me/example)", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_create_gift", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_GIFT_CREATE";
  await ctx.editMessageText("🎁 Create Gift Code:\n\nSend in format: CODE Amount MaxUses\n(Example: BONUS10 5 100)", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_broadcast", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText("📢 Broadcast Message:\n\nSend the message you want to broadcast to all users:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_admins", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) {
    return ctx.answerCallbackQuery({ text: "Only Main Owner can manage admins!", show_alert: true });
  }
  let admins = await getConfig("admins", []);
  userState[ctx.from.id] = "WAITING_FOR_ADMIN_ID";
  await ctx.editMessageText(`👥 Manage Admins:\n\nCurrent Admin IDs: ${admins.join(", ") || "None"}\n\nSend Admin UserID to add/remove:`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_transfer", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) {
    return ctx.answerCallbackQuery({ text: "Only Main Owner can transfer ownership!", show_alert: true });
  }
  userState[ctx.from.id] = "WAITING_FOR_NEW_OWNER";
  await ctx.editMessageText("👑 Transfer Ownership:\n\nSend the Telegram UserID of the new owner:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_customize", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_CUSTOM_TEXT";
  await ctx.editMessageText("🎨 Customize Text / Theme:\n\nSend in format: key value\n(Keys: text_welcome, btn_balance, btn_tasks, btn_gift, btn_transfer, btn_payout, btn_withdraw)", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

// --- Text and Button Routing Handler ---
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message && ctx.message.text ? ctx.message.text.trim() : "";
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Invalid format! Use: UserID Amount");

      let updated = await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amount } }, { new: true, upsert: true });
      return ctx.reply(`✅ Successfully added ₹${amount} to user ${targetId}. New Balance: ₹${updated.balance.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Invalid format! Use: UserID Amount");

      let targetUser = await getUser(targetId);
      let newBal = Math.max(0, targetUser.balance - amount);
      targetUser.balance = newBal;
      await targetUser.save();
      return ctx.reply(`✅ Successfully removed ₹${amount} from user ${targetId}. Current Balance: ₹${newBal.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");
      await User.findOneAndUpdate({ userId: targetId }, { balance: 0 });
      return ctx.reply(`✅ Balance for user ${targetId} has been reset to 0.`);
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

    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 4) return ctx.reply("❌ Invalid format! Use: TaskID | Title | Reward | Link");
      await Task.create({ taskId: parts[0], title: parts[1], reward: parseFloat(parts[2]), link: parts[3] });
      return ctx.reply(`✅ Task '${parts[1]}' created successfully!`);
    }

    if (state === "WAITING_FOR_GIFT_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      if (parts.length < 3) return ctx.reply("❌ Invalid format! Use: CODE Amount MaxUses");
      await GiftCode.create({ code: parts[0], amount: parseFloat(parts[1]), maxUses: parseInt(parts[2], 10) });
      return ctx.reply(`✅ Gift Code '${parts[0]}' created with ₹${parts[1]} reward!`);
    }

    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      let count = 0;
      for (let u of allUsers) {
        try {
          await ctx.api.sendMessage(u.userId, text);
          count++;
        } catch (e) {}
      }
      return ctx.reply(`✅ Broadcast sent to ${count} users successfully!`);
    }

    if (state === "WAITING_FOR_ADMIN_ID" && userId === (await getConfig("owner_id", MAIN_OWNER_ID))) {
      delete userState[userId];
      let adminId = parseInt(text, 10);
      if (isNaN(adminId)) return ctx.reply("❌ Invalid Admin ID!");
      let admins = await getConfig("admins", []);
      if (admins.includes(adminId)) {
        admins = admins.filter(id => id !== adminId);
        await setConfig("admins", admins);
        return ctx.reply(`✅ Admin ${adminId} removed successfully.`);
      } else {
        admins.push(adminId);
        await setConfig("admins", admins);
        return ctx.reply(`✅ Admin ${adminId} added successfully.`);
      }
    }

    if (state === "WAITING_FOR_NEW_OWNER") {
      delete userState[userId];
      let newOwnerId = parseInt(text, 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid ID!");
      await setConfig("owner_id", newOwnerId);
      return ctx.reply(`👑 Ownership successfully transferred to ${newOwnerId}!`);
    }

    if (state === "WAITING_FOR_CUSTOM_TEXT" && (await isAdmin(userId))) {
      delete userState[userId];
      let spaceIdx = text.indexOf(" ");
      if (spaceIdx === -1) return ctx.reply("❌ Format: key value");
      let key = text.substring(0, spaceIdx);
      let val = text.substring(spaceIdx + 1);
      await setConfig(key, val);
      return ctx.reply(`✅ Successfully updated configuration for ${key}`);
    }

    if (state === "USER_SET_GW_NAME") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { payoutGatewayName: text });
      return ctx.reply(`✅ Gateway Name updated to: ${text}`);
    }

    if (state === "USER_SET_GW_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { payoutGatewayAccount: text });
      return ctx.reply(`✅ Gateway Account / UPI saved as: ${text}`);
    }

    if (state === "WAITING_FOR_P2P") {
      delete userState[userId];
      let parts = text.split(" ");
      let targetWallet = parts[0];
      let amount = parseFloat(parts[1]);
      if (!targetWallet || isNaN(amount)) return ctx.reply("❌ Format: WalletID Amount");
      let sender = await getUser(userId);
      if (sender.balance < amount) return ctx.reply("❌ Insufficient balance!");
      let receiver = await User.findOne({ walletId: targetWallet });
      if (!receiver) return ctx.reply("❌ Receiver Wallet ID not found!");
      if (receiver.userId === userId) return ctx.reply("❌ You cannot transfer to yourself!");

      sender.balance -= amount;
      receiver.balance += amount;
      await sender.save();
      await receiver.save();
      return ctx.reply(`✅ Successfully transferred ₹${amount} to Wallet ID: ${targetWallet}`);
    }

    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOne({ code: text });
      if (!gift) return ctx.reply("❌ Invalid Gift Code! നൽകിയ ഗിഫ്റ്റ് കോഡ് തെറ്റാണ്.");
      if (gift.usedUsers.includes(userId)) return ctx.reply("❌ You have already redeemed this gift code!");
      if (gift.usedUsers.length >= gift.maxUses) return ctx.reply("❌ Gift code limit exceeded!");

      gift.usedUsers.push(userId);
      await gift.save();
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      return ctx.reply(`🎉 Gift code redeemed successfully! Added ₹${gift.amount} to your balance.`);
    }
  }

  // --- Normal Button Menu Routing ---
  let user = await getUser(userId);
  let btnBalance = await getConfig("btn_balance", "🚀 My Balance");
  let btnTasks = await getConfig("btn_tasks", "📋 Task Earn");
  let btnGift = await getConfig("btn_gift", "🎁 Gift Code");
  let btnTransfer = await getConfig("btn_transfer", "💸 P2P Transfer");
  let btnPayout = await getConfig("btn_payout", "💳 Payout Method");
  let btnWithdraw = await getConfig("btn_withdraw", "🏦 Withdraw");

  if (text === btnBalance) {
    let refLink = `https://t.me/${ctx.me.username}?start=${userId}`;
    let msg = `💳 Wallet Overview 💳\n\n` +
              `🌐 Wallet ID → ${user.walletId}\n` +
              `💰 Balance → ₹${user.balance.toFixed(2)}\n\n` +
              `👥 Total Referrals → ${user.referralCount || 0}\n` +
              `🔗 Referral Link → ${refLink}`;
    let kb = new InlineKeyboard()
      .text("🔄 Refresh Balance", "refresh_balance")
      .text("🔙 Back", "back_home");
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === btnTasks) {
    let tasks = await Task.find({});
    if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available right now.");
    let kb = new InlineKeyboard();
    tasks.forEach(t => {
      kb.text(`${t.title} (₹${t.reward})`, `do_task_${t.taskId}`).row();
    });
    return ctx.reply("📋 Available Tasks:", { reply_markup: kb });
  }
  else if (text === btnGift) {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Send your gift code in the chat:");
  }
  else if (text === btnTransfer) {
    userState[userId] = "WAITING_FOR_P2P";
    return ctx.reply("💸 P2P Transfer:\n\nSend in format: WalletID Amount\n(Example: 1234567890 50)");
  }
  else if (text === btnPayout) {
    let msg = `💳 Payout Method Settings\n\n` +
              `Current Gateway: ${user.payoutGatewayName}\n` +
              `Account / UPI: ${user.payoutGatewayAccount}`;
    let kb = new InlineKeyboard()
      .text("🔗 Set Gateway Name", "set_gw_name").row()
      .text("💰 Set Gateway Account / UPI", "set_gw_acc");
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === btnWithdraw) {
    let minW = await getConfig("min_withdraw", 1);
    let maxW = await getConfig("max_withdraw", 100);
    let msg = `🏦 Withdrawal Menu\n\n` +
              `Active Gateway: ${user.payoutGatewayName}\n` +
              `Your Balance: ₹${user.balance.toFixed(2)}\n` +
              `📉 Min Withdraw: ₹${minW}\n` +
              `📈 Max Withdraw: ₹${maxW}`;
    let kb = new InlineKeyboard().text(`🟢 Withdraw via ${user.payoutGatewayName}`, "do_withdraw");
    return ctx.reply(msg, { reply_markup: kb });
  }
  else {
    let gift = await GiftCode.findOne({ code: text });
    if (gift) {
      if (gift.usedUsers.includes(userId)) return ctx.reply("❌ You already redeemed this code!");
      if (gift.usedUsers.length >= gift.maxUses) return ctx.reply("❌ Gift code expired!");
      gift.usedUsers.push(userId);
      await gift.save();
      user.balance += gift.amount;
      await user.save();
      return ctx.reply(`🎉 Success! Added ₹${gift.amount} to your balance.`);
    }
    return next();
  }
});

// Inline Callbacks for User Actions
bot.callbackQuery("refresh_balance", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery("Balance Refreshed!");
  let refLink = `https://t.me/${ctx.me.username}?start=${ctx.from.id}`;
  let msg = `💳 Wallet Overview 💳\n\n` +
            `🌐 Wallet ID → ${user.walletId}\n` +
            `💰 Balance → ₹${user.balance.toFixed(2)}\n\n` +
            `👥 Total Referrals → ${user.referralCount || 0}\n` +
            `🔗 Referral Link → ${refLink}`;
  let kb = new InlineKeyboard()
    .text("🔄 Refresh Balance", "refresh_balance")
    .text("🔙 Back", "back_home");
  await ctx.editMessageText(msg, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("back_home", async (ctx) => {
  await ctx.answerCallbackQuery();
  let welcomeText = await getConfig("text_welcome", `👋 Welcome back! Choose an option below:`);
  await ctx.editMessageText(welcomeText, { reply_markup: await getReplyKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^do_task_/, async (ctx) => {
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found!", show_alert: true });
  
  let userId = ctx.from.id;
  if (task.completedUsers.includes(userId)) {
    return ctx.answerCallbackQuery({ text: "You already completed this task!", show_alert: true });
  }

  task.completedUsers.push(userId);
  await task.save();

  let user = await getUser(userId);
  user.balance += task.reward;
  await user.save();

  await ctx.answerCallbackQuery({ text: `Task completed! ₹${task.reward} added.`, show_alert: true });
  await ctx.editMessageText(`✅ Task Completed Successfully! You earned ₹${task.reward}.`);
});

bot.callbackQuery("set_gw_name", async (ctx) => {
  userState[ctx.from.id] = "USER_SET_GW_NAME";
  await ctx.answerCallbackQuery();
  await ctx.reply("🔗 Send your desired Gateway Name (e.g., UPI, Bank Account):");
});

bot.callbackQuery("set_gw_acc", async (ctx) => {
  userState[ctx.from.id] = "USER_SET_GW_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("💰 Send your Gateway Account / UPI ID (e.g., yourname@upi):");
});

bot.callbackQuery("do_withdraw", async (ctx) => {
  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  if (user.balance < minW) {
    return ctx.answerCallbackQuery({ text: `❌ Minimum withdrawal amount is ₹${minW}!`, show_alert: true });
  }
  if (user.balance > maxW) {
    return ctx.answerCallbackQuery({ text: `❌ Maximum withdrawal limit is ₹${maxW}!`, show_alert: true });
  }
  
  await ctx.answerCallbackQuery();
  await ctx.reply(`✅ Withdrawal request of ₹${user.balance.toFixed(2)} via ${user.payoutGatewayName} (${user.payoutGatewayAccount}) submitted successfully!`);
});

// Global Error Handler
bot.catch((err) => {
  console.error("❌ Bot Error:", err);
});

// --- Start Bot & DB Connection ---
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Atlas Connected Successfully!");
    bot.start({
      onStart: (info) => console.log(`🚀 Bot @${info.username} is running 24/7 with All Features & Admin Panel!`)
    });
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err);
  });
