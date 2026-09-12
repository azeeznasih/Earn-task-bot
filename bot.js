const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");

// --- Express Server for 24/7 Render / Replit Uptime & Web App Receipt ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MongoDB Schemas needed for Express Web App endpoint
const withdrawalSchema = new mongoose.Schema({
  withdrawalId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  details: { type: String, required: true },
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.models.Withdrawal || mongoose.model("Withdrawal", withdrawalSchema);

// User Activity / Balance History Schema for Tracking
const balanceHistorySchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  action: { type: String, required: true }, 
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const BalanceHistory = mongoose.models.BalanceHistory || mongoose.model("BalanceHistory", balanceHistorySchema);

// Helper function to log balance changes
async function logBalanceHistory(userId, action, amount) {
  try {
    await BalanceHistory.create({ userId, action, amount });
  } catch (e) {}
}

// Web App Receipt Route
app.get("/receipt/:id", async (req, res) => {
  try {
    let wId = req.params.id;
    let wd = await Withdrawal.findOne({ withdrawalId: wId });
    if (!wd) {
      return res.status(404).send("<h2 style='color:white; background:#111; text-align:center; padding:50px;'>Receipt not found!</h2>");
    }

    let isSuccess = wd.status === "Approved";
    let isFailed = wd.status === "Rejected";

    let statusTitle = isSuccess ? "TRANSFER COMPLETE" : (isFailed ? "TRANSFER FAILED" : "TRANSFER PENDING");
    let statusSubtitle = isSuccess ? "FUNDS CREDITED" : (isFailed ? "TRANSACTION REJECTED" : "PROCESSING PAYMENT");
    let accentColor = isSuccess ? "#00ffcc" : (isFailed ? "#ff4d4d" : "#ffa500");
    let iconSvg = isSuccess ? "&#10003;" : (isFailed ? "&#10005;" : "&#8943;");

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Receipt - #${wd.withdrawalId}</title>
        <style>
            body {
                background-color: #0b0e14;
                color: #ffffff;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .container {
                background: #151a21;
                border-radius: 20px;
                padding: 30px;
                width: 100%;
                max-width: 400px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                text-align: center;
                border: 1px solid #222c37;
            }
            .icon-box {
                width: 70px;
                height: 70px;
                background: rgba(0, 255, 204, 0.1);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px auto;
                font-size: 32px;
                color: ${accentColor};
                border: 2px solid ${accentColor};
            }
            .title {
                font-size: 20px;
                font-weight: bold;
                color: ${accentColor};
                letter-spacing: 1px;
            }
            .subtitle {
                font-size: 12px;
                color: #8a9ba8;
                margin-top: 5px;
                margin-bottom: 25px;
                letter-spacing: 0.5px;
            }
            .card-box {
                background: #1e2530;
                border-radius: 15px;
                padding: 20px;
                margin-bottom: 20px;
            }
            .amount-label {
                font-size: 11px;
                color: #8a9ba8;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .amount-val {
                font-size: 32px;
                font-weight: bold;
                margin-top: 8px;
                color: #ffffff;
            }
            .info-row {
                background: #151a21;
                border-radius: 10px;
                padding: 12px 15px;
                margin-top: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 13px;
            }
            .info-title {
                color: #8a9ba8;
                text-align: left;
            }
            .info-value {
                color: #ffffff;
                font-weight: 500;
                text-align: right;
                word-break: break-all;
                max-width: 60%;
            }
            .close-btn {
                background: #2a3443;
                color: #ffffff;
                border: none;
                width: 100%;
                padding: 14px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 10px;
            }
            .close-btn:hover {
                background: #354256;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon-box">${iconSvg}</div>
            <div class="title">${statusTitle}</div>
            <div class="subtitle">${statusSubtitle}</div>

            <div class="card-box">
                <div class="amount-label">WITHDRAWAL AMOUNT</div>
                <div class="amount-val">₹ ${wd.amount.toFixed(1)}</div>
            </div>

            <div class="info-row">
                <span class="info-title">METHOD / ${wd.method.toUpperCase()}</span>
                <span class="info-value">${wd.details}</span>
            </div>

            <div class="info-row">
                <span class="info-title">REF NO</span>
                <span class="info-value">TXN${wd.withdrawalId}</span>
            </div>

            <div class="info-row">
                <span class="info-title">DATE</span>
                <span class="info-value">${new Date(wd.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button class="close-btn" onclick="window.close()">CLOSE & RETURN</button>
        </div>
    </body>
    </html>
    `;
    res.send(html);
  } catch (e) {
    res.status(500).send("Error generating receipt");
  }
});

app.get("/", (req, res) => {
  res.send("Bot & Payout Receipt Server is Live!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
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
  walletAccount: { type: String, default: "Not Set" },
  upiId: { type: String, default: "Not Set" },
  bankAccNo: { type: String, default: "Not Set" },
  bankIfsc: { type: String, default: "Not Set" },
  bankName: { type: String, default: "Not Set" },
  amazonEmail: { type: String, default: "Not Set" },
  redeemCodeAddr: { type: String, default: "Not Set" },
  withdrawnTotal: { type: Number, default: 0 },
  blockedRefs: { type: Number, default: 0 },
  referralsWithLinkWallet: { type: Number, default: 0 },
  referredBy: { type: String, default: "Auto Started" },
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

// Helper to generate User Tracker Details Text accurately using real linked data
function generateTrackerText(targetUser) {
  let linkedWalletInfo = targetUser.walletAccount !== "Not Set" ? targetUser.walletAccount : 
                         (targetUser.upiId !== "Not Set" ? targetUser.upiId : 
                         (targetUser.bankAccNo !== "Not Set" ? `${targetUser.bankAccNo} (${targetUser.bankIfsc})` : 
                         (targetUser.amazonEmail !== "Not Set" ? targetUser.amazonEmail : 
                         (targetUser.redeemCodeAddr !== "Not Set" ? targetUser.redeemCodeAddr : "Not Linked"))));

  return `🙇‍♂️ Uꜱᴇʀ Dᴇᴛᴀɪʟꜱ Fᴏᴜɴᴅ Cʜᴇᴄᴋ \n\n` +
         `🚻 Usᴇʀ : ${targetUser.userId}\n` +
         `🆔 Usᴇʀ ID : ${targetUser.userId}\n` +
         `💵 Aᴠᴀɪʟᴀʙʟᴇ Bᴀʟᴀɴᴄᴇ : ₹${targetUser.balance.toFixed(2)}\n` +
         `🏧 Wɪᴛʜᴅʀᴀᴡ Bᴀʟᴀɴᴄᴇ : ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}\n` +
         `⛔ Bʟᴏᴄᴋᴇᴅ Rᴇғᴇʀs (Sᴀᴍᴇ Dᴇᴠɪᴄᴇ) : ${targetUser.blockedRefs || 0}\n` +
         `🔗 Rᴇғᴇʀʀᴀls Wɪɴ Lɪɴᴋ Wállet : ${targetUser.referralsWithLinkWallet || 0}\n` +
         `🎴 Lɪɴᴋᴇᴅ Aᴄᴄᴏᴜɴᴛ / UPI : ${linkedWalletInfo}\n` +
         `👩‍💻 Rᴇғᴇʀᴇᴅ Bʏ : ${targetUser.referredBy || "Aᴜᴛᴏ Sᴛᴀʀᴛᴇᴅ"}`;
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
  let pChannel = await getConfig("payout_channel", "Not Set");

  let panelText = `👑 Welcome To Admin Panel\n\n` +
                  `💡 Review Bot Details ^_^\n` +
                  `👨‍💻 Main Owner ~ ${ownerId}\n` +
                  `🤖 Bot On/Off ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 Minimum Withdraw ~ ₹${minW}\n` +
                  `💰 Maximum Withdraw ~ ₹${maxW}\n` +
                  `📢 Payout Channel ~ ${pChannel}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("👥 User Tracker", "adm_user_tracker").row()
    .text("📉 Min Withdraw", "adm_set_min_w").text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Set Payout Channel", "adm_set_p_chan").text("📢 Manage Channels", "adm_channels").row()
    .text("🔄 Reset Balance", "adm_reset_bal").text("📋 Create Task", "adm_create_task").row()
    .text("🎁 Create Gift", "adm_create_gift").text("📢 Broadcast", "adm_broadcast").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🎨 Customize Texts", "adm_customize").text("🔄 Refresh Panel", "admin");

  await ctx.reply(panelText, { reply_markup: keyboard });
});

bot.callbackQuery("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");

  let panelText = `👑 Welcome To Admin Panel\n\n` +
                  `💡 Review Bot Details ^_^\n` +
                  `👨‍💻 Main Owner ~ ${ownerId}\n` +
                  `🤖 Bot On/Off ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 Minimum Withdraw ~ ₹${minW}\n` +
                  `💰 Maximum Withdraw ~ ₹${maxW}\n` +
                  `📢 Payout Channel ~ ${pChannel}`;

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("👥 User Tracker", "adm_user_tracker").row()
    .text("📉 Min Withdraw", "adm_set_min_w").text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Set Payout Channel", "adm_set_p_chan").text("📢 Manage Channels", "adm_channels").row()
    .text("🔄 Reset Balance", "adm_reset_bal").text("📋 Create Task", "adm_create_task").row()
    .text("🎁 Create Gift", "adm_create_gift").text("📢 Broadcast", "adm_broadcast").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🎨 Customize Texts", "adm_customize").text("🔄 Refresh Panel", "admin");

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

bot.callbackQuery("adm_user_tracker", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 User Tracker:\n\nSend the Telegram User ID of the user you want to track:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_set_min_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Set Minimum Withdraw Amount:\n\nSend the new amount (e.g. 10):", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_set_max_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Set Maximum Withdraw Amount:\n\nSend the new amount (e.g. 5000):", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});

bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Set Payout Channel:\n\nSend the channel username or ID (e.g., @payout_channel):", {
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

// --- Tracker Specific Callbacks (Balance Record, Withdraw History, Refresh, Back) ---
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  
  let msg = `📊 **User Balance Record (ID: ${targetId})**\n\n`;
  if (history.length === 0) {
    msg += "No balance records found for this user.";
  } else {
    history.forEach((h, idx) => {
      let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      msg += `${idx + 1}. **${h.action}**: ₹${h.amount} (${dateStr})\n`;
    });
  }

  let kb = new InlineKeyboard()
    .text("🔙 Back to User Info", `track_back_${targetId}`);
  await ctx.editMessageText(msg, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);

  let msg = `🏧 **User Withdraw History (ID: ${targetId})**\n\n`;
  if (withdrawals.length === 0) {
    msg += "No withdrawal history found for this user.";
  } else {
    withdrawals.forEach((w, idx) => {
      let dateStr = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      msg += `${idx + 1}. Amt: **₹${w.amount}** | Method: ${w.method}\n   Status: **${w.status}** | Date: ${dateStr}\n\n`;
    });
  }

  let kb = new InlineKeyboard()
    .text("🔙 Back to User Info", `track_back_${targetId}`);
  await ctx.editMessageText(msg, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^track_ref_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return ctx.answerCallbackQuery({ text: "User not found!", show_alert: true });

  let trackerMsg = generateTrackerText(targetUser);

  let kb = new InlineKeyboard()
    .text("📜 User Balance Record", `track_bal_${targetId}`).row()
    .text("🏧 User Withdraw History", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(trackerMsg, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^track_back_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_back_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return ctx.answerCallbackQuery({ text: "User not found!", show_alert: true });

  let trackerMsg = generateTrackerText(targetUser);

  let kb = new InlineKeyboard()
    .text("📜 User Balance Record", `track_bal_${targetId}`).row()
    .text("🏧 User Withdraw History", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(trackerMsg, { reply_markup: kb }).catch(() => {});
});

// --- In-Bot User Confirmation Callbacks (Confirm / Cancel Withdrawal) ---
bot.callbackQuery(/^conf_wd_/, async (ctx) => {
  let dataParts = ctx.callbackQuery.data.replace("conf_wd_", "").split("_");
  let method = dataParts[0];
  let amount = parseFloat(dataParts[1]);
  let userId = ctx.from.id;

  let user = await getUser(userId);
  if (user.balance < amount) {
    return ctx.answerCallbackQuery({ text: "❌ Insufficient balance!", show_alert: true });
  }

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();

  // Log to balance history
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let details = "";
  if (method === "Wallet") details = user.walletAccount;
  else if (method === "UPI") details = user.upiId;
  else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}, ${user.bankName}`;
  else if (method === "Amazon") details = user.amazonEmail;
  else if (method === "Redeem Code") details = user.redeemCodeAddr;

  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  await Withdrawal.create({
    withdrawalId,
    userId,
    amount,
    method,
    details
  });

  await ctx.answerCallbackQuery({ text: "Withdrawal Confirmed & Submitted!" });
  await ctx.editMessageText(`✅ Withdrawal request of ₹${amount} via ${method} submitted successfully!\nRequest ID: #${withdrawalId}\nStatus: Pending Admin Approval.`);

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    let adminKb = new InlineKeyboard()
      .text("✅ Approve", `wd_app_${withdrawalId}`)
      .text("❌ Reject & Refund", `wd_rej_${withdrawalId}`);
    try {
      await ctx.api.sendMessage(payoutChannel, `🔔 New Withdrawal Request #${withdrawalId}\n\n` +
                                               `👤 User ID: ${userId}\n` +
                                               `💰 Amount: ₹${amount}\n` +
                                               `💳 Method: ${method}\n` +
                                               `📋 Details: ${details}`, { reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Withdrawal Cancelled." });
  await ctx.editMessageText("❌ Withdrawal request has been cancelled by you.");
});

// Admin Approve / Reject Withdrawal Callbacks
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd) return ctx.answerCallbackQuery({ text: "Withdrawal request not found!", show_alert: true });
  if (wd.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already processed as ${wd.status}`, show_alert: true });

  wd.status = "Approved";
  await wd.save();

  await ctx.answerCallbackQuery({ text: "Withdrawal Approved!" });
  try {
    await ctx.editMessageText(`✅ Withdrawal Request #${wId} has been **APPROVED** by Admin (@${ctx.from.username || ctx.from.first_name}).`);
  } catch (e) {}
  
  try {
    let serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_DEV_DOMAIN || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

    let userKb = new InlineKeyboard().web_app("🚀 Check Payment Status", receiptUrl);

    let msg = `💸 Withdrawal Paid Successfully !! 💸\n\n` +
              `🎉 Check your ${wd.method} wallet 🎉\n\n` +
              `Amount: ₹${wd.amount.toFixed(1)}\n` +
              `Method: ${wd.method}\n` +
              `Details: ${wd.details}`;

    await ctx.api.sendMessage(wd.userId, msg, { reply_markup: userKb });
  } catch (e) {}
});

bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd) return ctx.answerCallbackQuery({ text: "Withdrawal request not found!", show_alert: true });
  if (wd.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already processed as ${wd.status}`, show_alert: true });

  wd.status = "Rejected";
  await wd.save();

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();

  await logBalanceHistory(wd.userId, `Withdrawal Refunded (${wd.method})`, wd.amount);

  await ctx.answerCallbackQuery({ text: "Withdrawal Rejected & Amount Refunded!" });
  try {
    await ctx.editMessageText(`❌ Withdrawal Request #${wId} has been **REJECTED** and ₹${wd.amount} refunded to user.`);
  } catch (e) {}

  try {
    let serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_DEV_DOMAIN || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

    let userKb = new InlineKeyboard().web_app("🚀 Check Payment Status", receiptUrl);

    await ctx.api.sendMessage(wd.userId, `❌ Your withdrawal request of ₹${wd.amount} via ${wd.method} was rejected and ₹${wd.amount} has been refunded to your wallet balance.`, { reply_markup: userKb });
  } catch (e) {}
});

// --- Text and Button Routing Handler ---
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message && ctx.message.text ? ctx.message.text.trim() : "";
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");

      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) {
        return ctx.reply(`❌ User with ID ${targetId} not found in database!`);
      }

      let trackerMsg = generateTrackerText(targetUser);

      let kb = new InlineKeyboard()
        .text("📜 User Balance Record", `track_bal_${targetId}`).row()
        .text("🏧 User Withdraw History", `track_wd_${targetId}`).row()
        .text("🔄 Refresh", `track_ref_${targetId}`).row()
        .text("🔙 Back to Admin", "admin");

      return ctx.reply(trackerMsg, { reply_markup: kb });
    }

    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Invalid format! Use: UserID Amount");

      let updated = await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amount } }, { new: true, upsert: true });
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
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
      await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
      return ctx.reply(`✅ Successfully removed ₹${amount} from user ${targetId}. Current Balance: ₹${newBal.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid amount!");
      await setConfig("min_withdraw", amt);
      return ctx.reply(`✅ Minimum withdrawal limit updated to ₹${amt}`);
    }

    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid amount!");
      await setConfig("max_withdraw", amt);
      return ctx.reply(`✅ Maximum withdrawal limit updated to ₹${amt}`);
    }

    if (state === "WAITING_FOR_P_CHAN" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("payout_channel", text);
      return ctx.reply(`✅ Payout notification channel updated to: ${text}`);
    }

    if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");
      await User.findOneAndUpdate({ userId: targetId }, { balance: 0 });
      await logBalanceHistory(targetId, "Admin Reset Balance to 0", 0);
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

    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text });
      return ctx.reply(`✅ Your Current Wallet updated to: ${text}`);
    }
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text });
      return ctx.reply(`✅ Your Current UPI updated to: ${text}`);
    }
    if (state === "SET_BANK_ACC") {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 3) return ctx.reply("❌ Invalid format! Use: AccNo | IFSC | BankName");
      await User.findOneAndUpdate({ userId }, { bankAccNo: parts[0], bankIfsc: parts[1], bankName: parts[2] });
      return ctx.reply(`✅ Bank Details Updated Successfully!\nAccount: ${parts[0]}\nIFSC: ${parts[1]}\nBank: ${parts[2]}`);
    }
    if (state === "SET_AMAZON_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text });
      return ctx.reply(`✅ Amazon email address updated to: ${text}`);
    }
    if (state === "SET_REDEEM_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text });
      return ctx.reply(`✅ Redeem code address updated to: ${text}`);
    }

    if (state && state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 1);
      let maxW = await getConfig("max_withdraw", 100);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Invalid withdrawal amount entered!");
      }
      if (amount < minW) {
        return ctx.reply(`❌ Minimum withdrawal amount is ₹${minW}!`);
      }
      if (amount > maxW) {
        return ctx.reply(`❌ Maximum withdrawal limit is ₹${maxW}!`);
      }
      if (user.balance < amount) {
        return ctx.reply(`❌ Insufficient balance! You have only ₹${user.balance.toFixed(2)}`);
      }

      let details = "";
      if (method === "Wallet") details = user.walletAccount;
      else if (method === "UPI") details = user.upiId;
      else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}, ${user.bankName}`;
      else if (method === "Amazon") details = user.amazonEmail;
      else if (method === "Redeem Code") details = user.redeemCodeAddr;

      let confirmMsg = `📋 **Withdrawal Summary**\n\n` +
                       `🔹 Method: ${method}\n` +
                       `🔹 Details: ${details}\n` +
                       `💰 Amount: ₹${amount}\n\n` +
                       `Do you want to confirm this withdrawal?`;

      let kb = new InlineKeyboard()
        .text("✅ Confirm", `conf_wd_${method}_${amount}`)
        .text("❌ Cancel", "canc_wd");

      return ctx.reply(confirmMsg, { reply_markup: kb });
    }

    if (state === "WAITING_FOR_P2P") {
      delete userState[userId];
      let sender = await getUser(userId);
      let lines = text.split("\n");
      let totalCost = 0;
      let transfers = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        let parts = line.split("-");
        if (parts.length !== 2) continue;
        let targetIdOrWallet = parts[0].trim();
        let amount = parseFloat(parts[1].trim());
        if (!targetIdOrWallet || isNaN(amount) || amount <= 0) continue;
        totalCost += amount;
        transfers.push({ targetIdOrWallet, amount });
      }

      if (transfers.length === 0) {
        return ctx.reply("❌ Invalid format! Use:\n8061612500-1\n1234567890-5");
      }

      if (sender.balance < totalCost) {
        return ctx.reply(`❌ Insufficient balance! Total required: ₹${totalCost}, your balance: ₹${sender.balance.toFixed(2)}`);
      }

      sender.balance -= totalCost;
      await sender.save();
      await logBalanceHistory(userId, "P2P Transfer Sent", -totalCost);

      let summary = "✅ P2P Transfer(s) Successful:\n";
      for (let t of transfers) {
        // Search user by Wallet ID OR Telegram User ID
        let receiver = await User.findOne({ 
          $or: [
            { walletId: t.targetIdOrWallet },
            { userId: parseInt(t.targetIdOrWallet, 10) || 0 }
          ]
        });

        if (receiver) {
          if (receiver.userId === sender.userId) {
            summary += `⚠️ Cannot transfer to yourself (Amount refunded)\n`;
            sender.balance += t.amount;
            await sender.save();
            continue;
          }
          receiver.balance += t.amount;
          await receiver.save();
          await logBalanceHistory(receiver.userId, `P2P Transfer Received from ${sender.userId}`, t.amount);
          
          summary += `➡️ ₹${t.amount} sent to Account: ${t.targetIdOrWallet}\n`;
          
          // Notify the receiver about received funds
          try {
            await ctx.api.sendMessage(receiver.userId, `🎉 You received **₹${t.amount}** via P2P Transfer from user ID \`${sender.userId}\`!`);
          } catch (e) {}

        } else {
          summary += `⚠️ Account / Wallet ID ${t.targetIdOrWallet} not found (Amount refunded)\n`;
          sender.balance += t.amount;
          await sender.save();
          await logBalanceHistory(userId, "P2P Transfer Refund", t.amount);
        }
      }
      return ctx.reply(summary);
    }

    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOne({ code: text });
      if (!gift) {
        return ctx.reply("🚫 Invalid Redeem Code! 🚫\n\n⚠️ Make sure you’ve entered the correct code.");
      }
      if (gift.usedUsers.includes(userId)) {
        return ctx.reply("❌ You already redeemed this gift code!");
      }
      if (gift.usedUsers.length >= gift.maxUses) {
        return ctx.reply("❌ Gift code limit exceeded!");
      }

      gift.usedUsers.push(userId);
      await gift.save();
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Code Redeemed (${gift.code})`, gift.amount);
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
    let msg = `Tasks Wallet Bot:\n` +
              `━━━━━━ 💳 Wallet Overview ━━━━━━\n\n` +
              ` 🔵 Wallet ID ➝ ${user.walletId}\n` +
              ` 🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\n` +
              `Built with security you can Trust. Support that responds promptly`;
    
    let supportUser = await getConfig("support_username", "AdminSupport");
    let kb = new InlineKeyboard()
      .text(`🧾 Balance: ₹${user.balance.toFixed(2)}`, "refresh_balance")
      .text("💬 Customer Support", `https://t.me/${supportUser.replace('@', '')}`).row()
      .text("🔄 Refresh", "refresh_balance");
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
    let msg = `🎁 Gift Code\n\n` +
              `💸 Send Gift Code To Claim Reward!`;
    return ctx.reply(msg);
  }
  else if (text === btnTransfer) {
    userState[userId] = "WAITING_FOR_P2P";
    let msg = `💸 P2P Transfer\n\n` +
              `💡 Select a user from 'Select User' to make a Quick Payment to a Single user.\n\n` +
              `You can also send Wallet ID or Telegram User ID using the format below:\n\n` +
              `Format:\n` +
              `WalletID_or_UserID-Amount\n` +
              `8061612500-1\n` +
              `1234567890-5`;
    let kb = new InlineKeyboard().text("👥 Select User", "p2p_select_user");
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === btnPayout) {
    let msg = `💳 Payout Method\n\n` +
              `Choose Desired Payment Method From Below 👇\n\n` +
              `Your Current Wallet - ${user.walletAccount}\n` +
              `Your Current UPI - ${user.upiId}\n` +
              `Your Current Banks - ${user.bankAccNo !== "Not Set" ? `${user.bankAccNo}, ${user.bankIfsc}, ${user.bankName}` : "Not Set"}\n` +
              `Your Current Amazon email address - ${user.amazonEmail}\n` +
              `Your Current Redeem code address - ${user.redeemCodeAddr}`;

    let kb = new InlineKeyboard()
      .text("🌐 Set Wallet", "set_wallet").row()
      .text("⚡ Set UPI", "set_upi").row()
      .text("🏦 Set Bank Account", "set_bank").row()
      .text("📧 Set Amazon Email", "set_amazon").row()
      .text("🎁 Set Redeem Code", "set_redeem");
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === btnWithdraw) {
    let minW = await getConfig("min_withdraw", 1);
    let maxW = await getConfig("max_withdraw", 100);
    let msg = `🏦 Withdraw\n\n` +
              `✨ Choose Withdrawal Method:\n\n` +
              `Your Balance: ₹${user.balance.toFixed(2)}\n` +
              `📉 Min Withdraw: ₹${minW} | 📈 Max Withdraw: ₹${maxW}`;
    
    let kb = new InlineKeyboard()
      .text("🌐 Withdraw via Wallet", "wd_wallet")
      .text("⚡ Withdraw via UPI", "wd_upi").row()
      .text("🏦 Withdraw via Bank", "wd_bank")
      .text("📧 Withdraw via Amazon", "wd_amazon").row()
      .text("🎁 Withdraw via Redeem Code", "wd_redeem");
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
      await logBalanceHistory(userId, `Gift Code Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Success! Added ₹${gift.amount} to your balance.`);
    }
    return next();
  }
});

// Inline Callbacks for User Actions
bot.callbackQuery("refresh_balance", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery("Balance Refreshed!");
  let msg = `Tasks Wallet Bot:\n` +
            `━━━━━━ 💳 Wallet Overview ━━━━━━\n\n` +
            ` 🔵 Wallet ID ➝ ${user.walletId}\n` +
            ` 🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\n` +
            `Built with security you can Trust. Support that responds promptly`;
  
  let supportUser = await getConfig("support_username", "AdminSupport");
  let kb = new InlineKeyboard()
    .text(`🧾 Balance: ₹${user.balance.toFixed(2)}`, "refresh_balance")
    .text("💬 Customer Support", `https://t.me/${supportUser.replace('@', '')}`).row()
    .text("🔄 Refresh", "refresh_balance");
  await ctx.editMessageText(msg, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("p2p_select_user", async (ctx) => {
  await ctx.answerCallbackQuery();
  let users = await User.find({ userId: { $ne: ctx.from.id } }).limit(10);
  if (users.length === 0) {
    return ctx.reply("❌ No other users found in the bot yet to transfer!");
  }
  let kb = new InlineKeyboard();
  users.forEach(u => {
    kb.text(`Wallet: ${u.walletId} (ID: ${u.userId})`, `p2p_target_${u.walletId}`).row();
  });
  await ctx.reply("👥 Select a friend / user to transfer payment:", { reply_markup: kb });
});

bot.callbackQuery(/^p2p_target_/, async (ctx) => {
  let targetWallet = ctx.callbackQuery.data.replace("p2p_target_", "");
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_P2P";
  await ctx.reply(`💡 Selected Target Wallet ID: ${targetWallet}\n\nNow send the amount you want to transfer in format:\n${targetWallet}-Amount\n(Example: ${targetWallet}-50)`);
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

  await logBalanceHistory(userId, `Task Completed (${task.title})`, task.reward);

  await ctx.answerCallbackQuery({ text: `Task completed! ₹${task.reward} added.`, show_alert: true });
  await ctx.editMessageText(`✅ Task Completed Successfully! You earned ₹${task.reward}.`);
});

// Payout setting triggers
bot.callbackQuery("set_wallet", async (ctx) => {
  userState[ctx.from.id] = "SET_WALLET_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("🌐 Send your desired Wallet account details:");
});
bot.callbackQuery("set_upi", async (ctx) => {
  userState[ctx.from.id] = "SET_UPI_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("⚡ Send your UPI ID (e.g. yourname@paytm):");
});
bot.callbackQuery("set_bank", async (ctx) => {
  userState[ctx.from.id] = "SET_BANK_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("🏦 Send Bank details in format:\nAccNo | IFSC | BankName");
});
bot.callbackQuery("set_amazon", async (ctx) => {
  userState[ctx.from.id] = "SET_AMAZON_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("📧 Send your Amazon email address:");
});
bot.callbackQuery("set_redeem", async (ctx) => {
  userState[ctx.from.id] = "SET_REDEEM_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("🎁 Send your Redeem code address / details:");
});

async function promptWithdrawalAmount(ctx, method, details) {
  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);

  if (user.balance < minW) {
    return ctx.answerCallbackQuery({ text: `❌ Minimum withdrawal amount is ₹${minW}!`, show_alert: true });
  }

  userState[ctx.from.id] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nYour Current Balance: ₹${user.balance.toFixed(2)}\n📉 Min Withdraw: ₹${minW} | 📈 Max Withdraw: ₹${maxW}\n\n👉 Send Total amount to withdraw:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.walletAccount === "Not Set") return ctx.answerCallbackQuery({ text: "Please set your Wallet account in Payout Method first!", show_alert: true });
  await promptWithdrawalAmount(ctx, "Wallet", user.walletAccount);
});

bot.callbackQuery("wd_upi", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.upiId === "Not Set") return ctx.answerCallbackQuery({ text: "Please set your UPI ID in Payout Method first!", show_alert: true });
  await promptWithdrawalAmount(ctx, "UPI", user.upiId);
});

bot.callbackQuery("wd_bank", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.bankAccNo === "Not Set") return ctx.answerCallbackQuery({ text: "Please set your Bank details in Payout Method first!", show_alert: true });
  await promptWithdrawalAmount(ctx, "Bank", `${user.bankAccNo}, ${user.bankIfsc}, ${user.bankName}`);
});

bot.callbackQuery("wd_amazon", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.amazonEmail === "Not Set") return ctx.answerCallbackQuery({ text: "Please set your Amazon email in Payout Method first!", show_alert: true });
  await promptWithdrawalAmount(ctx, "Amazon", user.amazonEmail);
});

bot.callbackQuery("wd_redeem", async (ctx) => {
  let user = await getUser(ctx.from.id);
  if (user.redeemCodeAddr === "Not Set") return ctx.answerCallbackQuery({ text: "Please set your Redeem code address in Payout Method first!", show_alert: true });
  await promptWithdrawalAmount(ctx, "Redeem Code", user.redeemCodeAddr);
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
      onStart: (info) => console.log(`🚀 Bot @${info.username} is running 24/7 with Working P2P Transfers & User IDs!`)
    });
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err);
  });
