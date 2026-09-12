// ============================================================
// 🤖 TELEGRAM PAYMENT TASK BOT - WITH INLINE BUTTON STYLE API
// grammy ^1.35.1 | mongoose ^8.13.0 | express ^4.21.2
// Telegram Bot API 9.4 - style: primary/success/danger
// ============================================================
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

const balanceHistorySchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  action: { type: String, required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const BalanceHistory = mongoose.models.BalanceHistory || mongoose.model("BalanceHistory", balanceHistorySchema);

async function logBalanceHistory(userId, action, amount) {
  try { await BalanceHistory.create({ userId, action, amount }); } catch (e) {}
}

// ============================================================
// 🧾 RECEIPT WEB PAGE
// ============================================================
app.get("/receipt/:id", async (req, res) => {
  try {
    let wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd) return res.status(404).send("<h2 style='color:white;background:#111;text-align:center;padding:50px;'>Receipt not found!</h2>");

    let isSuccess = wd.status === "Approved";
    let isFailed = wd.status === "Rejected";
    let statusTitle = isSuccess ? "TRANSFER COMPLETE" : (isFailed ? "TRANSFER FAILED" : "TRANSFER PENDING");
    let statusSubtitle = isSuccess ? "FUNDS CREDITED" : (isFailed ? "TRANSACTION REJECTED" : "PROCESSING PAYMENT");
    let accentColor = isSuccess ? "#00ffcc" : (isFailed ? "#ff4d4d" : "#ffa500");
    let iconSvg = isSuccess ? "&#10003;" : (isFailed ? "&#10005;" : "&#8943;");

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt - #${wd.withdrawalId}</title>
    <style>
      body{background:#0b0e14;color:#fff;font-family:'Segoe UI',sans-serif;margin:0;padding:20px;display:flex;align-items:center;justify-content:center;min-height:100vh;}
      .container{background:#151a21;border-radius:20px;padding:30px;max-width:400px;width:100%;text-align:center;border:1px solid #222c37;}
      .icon-box{width:70px;height:70px;background:rgba(0,255,204,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;color:${accentColor};border:2px solid ${accentColor};}
      .title{font-size:20px;font-weight:bold;color:${accentColor};letter-spacing:1px;}
      .subtitle{font-size:12px;color:#8a9ba8;margin:5px 0 25px;}
      .card-box{background:#1e2530;border-radius:15px;padding:20px;margin-bottom:20px;}
      .amount-label{font-size:11px;color:#8a9ba8;text-transform:uppercase;}
      .amount-val{font-size:32px;font-weight:bold;margin-top:8px;}
      .info-row{background:#151a21;border-radius:10px;padding:12px 15px;margin-top:10px;display:flex;justify-content:space-between;font-size:13px;}
      .info-title{color:#8a9ba8;}
      .info-value{color:#fff;font-weight:500;text-align:right;max-width:60%;word-break:break-all;}
      .close-btn{background:#2a3443;color:#fff;border:none;width:100%;padding:14px;border-radius:12px;font-size:14px;font-weight:bold;cursor:pointer;margin-top:10px;}
    </style></head><body>
    <div class="container">
      <div class="icon-box">${iconSvg}</div>
      <div class="title">${statusTitle}</div>
      <div class="subtitle">${statusSubtitle}</div>
      <div class="card-box"><div class="amount-label">WITHDRAWAL AMOUNT</div><div class="amount-val">₹ ${wd.amount.toFixed(1)}</div></div>
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${wd.method.toUpperCase()} / ${wd.details}</span></div>
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value">TXN${wd.withdrawalId}</span></div>
      <div class="info-row"><span class="info-title">DATE</span><span class="info-value">${new Date(wd.createdAt).toLocaleString('en-IN')}</span></div>
      <button class="close-btn" onclick="window.close()">CLOSE & RETURN</button>
    </div></body></html>`;
    res.send(html);
  } catch (e) { res.status(500).send("Error"); }
});

app.get("/", (req, res) => res.send("Bot Server Live!"));

app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

// ============================================================
// ⚙️ CONFIG
// ============================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MAIN_OWNER_ID = parseInt(process.env.ADMIN_ID || "8061612320", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ BOT_TOKEN & MONGO_URI required!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const userState = {};

// ============================================================
// 🗄️ MONGOOSE SCHEMAS
// ============================================================
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  firstName: { type: String, default: "" },
  username: { type: String, default: "" },
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
  timeLimitMinutes: { type: Number, default: 0 },
  alertEnabled: { type: Boolean, default: true },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] }
});

const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] }
});

const taskSubmissionSchema = new mongoose.Schema({
  submissionId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  taskId: { type: String, required: true },
  taskTitle: { type: String, required: true },
  reward: { type: Number, required: true },
  photoFileId: { type: String, required: true },
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

// Inline button style schema
const inlineStyleSchema = new mongoose.Schema({
  buttonId: { type: String, required: true, unique: true },
  style: { type: String, default: null } // "primary" | "success" | "danger" | null
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const TaskSubmission = mongoose.model("TaskSubmission", taskSubmissionSchema);
const Config = mongoose.model("Config", configSchema);
const InlineStyle = mongoose.models.InlineStyle || mongoose.model("InlineStyle", inlineStyleSchema);

// ============================================================
// 🔧 HELPERS
// ============================================================
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
async function checkForceJoin(ctx) {
  let channels = await getConfig("forced_channels", []);
  if (!channels || channels.length === 0) return true;
  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch, ctx.from.id);
      if (["left", "kicked", "restricted"].includes(member.status)) return false;
    } catch (e) {}
  }
  return true;
}
function generateTrackerText(targetUser) {
  let linkedWalletInfo = targetUser.walletAccount !== "Not Set" ? targetUser.walletAccount :
                         (targetUser.upiId !== "Not Set" ? targetUser.upiId :
                         (targetUser.bankAccNo !== "Not Set" ? `${targetUser.bankAccNo} (${targetUser.bankIfsc})` :
                         (targetUser.amazonEmail !== "Not Set" ? targetUser.amazonEmail :
                         (targetUser.redeemCodeAddr !== "Not Set" ? targetUser.redeemCodeAddr : "Not Linked"))));
  return `🙇‍♂️ Uꜱᴇʀ Dᴇᴛᴀɪʟꜱ Fᴏᴜɴᴅ Cʜᴇᴄᴋ\n\n` +
         `🚻 Usᴇʀ : ${targetUser.userId}\n` +
         `🆔 Usᴇʀ ID : ${targetUser.userId}\n` +
         `💵 Aᴠᴀɪʟᴀʙʟᴇ Bᴀʟᴀɴᴄᴇ : ₹${targetUser.balance.toFixed(2)}\n` +
         `🏧 Wɪᴛʜᴅʀᴀᴡ Bᴀʟᴀɴᴄᴇ : ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}\n` +
         `⛔ Bʟᴏᴄᴋᴇᴅ Rᴇғᴇʀs : ${targetUser.blockedRefs || 0}\n` +
         `🔗 Rᴇғᴇʀʀᴀls Wɪɴ Lɪɴᴋ : ${targetUser.referralsWithLinkWallet || 0}\n` +
         `🎴 Lɪɴᴋᴇᴅ Aᴄᴄᴏᴜɴᴛ / UPI : ${linkedWalletInfo}\n` +
         `👩‍💻 Rᴇғᴇʀᴇᴅ Bʏ : ${targetUser.referredBy || "Aᴜᴛᴏ Sᴛᴀʀᴛᴇᴅ"}`;
}

// ============================================================
// 🎨 INLINE BUTTON STYLE SYSTEM (Telegram Bot API 9.4)
// ============================================================
const INLINE_BUTTONS_REGISTRY = [
  // 💰 Balance screen
  { id: "balance_statement",      label: "📊 Balance Statement",     screen: "💳 Wallet" },
  { id: "customer_support",       label: "💬 Customer Support",      screen: "💳 Wallet" },
  { id: "refresh_balance_only",   label: "🔄 Refresh Balance",       screen: "💳 Wallet" },
  { id: "live_fund",              label: "💰 Live Fund",             screen: "💳 Wallet" },
  { id: "back_to_balance",        label: "🔙 Back to Balance",       screen: "💳 Wallet" },

  // 🏦 Withdraw screen
  { id: "wd_wallet",              label: "🌐 Wallet",                screen: "🏦 Withdraw" },
  { id: "wd_upi",                 label: "⚡ UPI",                    screen: "🏦 Withdraw" },
  { id: "wd_bank",                label: "🏦 Bank",                  screen: "🏦 Withdraw" },
  { id: "wd_amazon",              label: "📧 Amazon",                screen: "🏦 Withdraw" },
  { id: "wd_redeem",              label: "🎁 Redeem Code",           screen: "🏦 Withdraw" },
  { id: "confirm_wd",             label: "✅ Confirm Withdraw",       screen: "🏦 Withdraw" },
  { id: "cancel_wd",              label: "❌ Cancel Withdraw",        screen: "🏦 Withdraw" },

  // 💳 Payout screen
  { id: "set_wallet",             label: "🌐 Set Wallet",            screen: "💳 Payout" },
  { id: "set_upi",                label: "⚡ Set UPI",                 screen: "💳 Payout" },
  { id: "set_bank",               label: "🏦 Set Bank",              screen: "💳 Payout" },
  { id: "set_amazon",             label: "📧 Set Amazon",            screen: "💳 Payout" },
  { id: "set_redeem",             label: "🎁 Set Redeem",            screen: "💳 Payout" },

  // 📋 Task
  { id: "task_approve",           label: "✅ Approve Task",          screen: "📋 Task" },
  { id: "task_reject",            label: "❌ Reject Task",           screen: "📋 Task" },
  { id: "cancel_task",            label: "❌ Cancel Task",           screen: "📋 Task" },
  { id: "open_task_link",         label: "🔗 Open Task Link",        screen: "📋 Task" },

  // 👑 Admin
  { id: "adm_back",               label: "🔙 Back (Admin)",          screen: "👑 Admin" },
  { id: "adm_refresh",            label: "🔄 Refresh Panel",         screen: "👑 Admin" },
  { id: "adm_customize_theme",    label: "🎨 Customize Theme",       screen: "👑 Admin" },
  { id: "adm_edit_inline_styles", label: "🖌️ Edit Inline Styles",    screen: "👑 Admin" }
];

// Default styles for each button (per Telegram style API)
const DEFAULT_INLINE_STYLES = {
  // Success (green)
  "balance_statement": "primary",
  "customer_support": "success",
  "refresh_balance_only": "primary",
  "live_fund": "success",
  "back_to_balance": "primary",

  "wd_wallet": "primary",
  "wd_upi": "primary",
  "wd_bank": "primary",
  "wd_amazon": "primary",
  "wd_redeem": "primary",
  "confirm_wd": "success",
  "cancel_wd": "danger",

  "set_wallet": "primary",
  "set_upi": "primary",
  "set_bank": "primary",
  "set_amazon": "primary",
  "set_redeem": "primary",

  "task_approve": "success",
  "task_reject": "danger",
  "cancel_task": "danger",
  "open_task_link": "primary",

  "adm_back": "primary",
  "adm_refresh": "primary",
  "adm_customize_theme": "primary",
  "adm_edit_inline_styles": "primary"
};

// Get style for a button (from DB or default)
async function getInlineStyle(buttonId) {
  let record = await InlineStyle.findOne({ buttonId });
  if (record && record.style) return record.style;
  return DEFAULT_INLINE_STYLES[buttonId] || null;
}

// Set style for a button
async function setInlineStyle(buttonId, style) {
  if (style === null || style === "default") {
    await InlineStyle.findOneAndDelete({ buttonId });
  } else {
    await InlineStyle.findOneAndUpdate({ buttonId }, { style }, { upsert: true });
  }
}

// Build an inline button with style from registry
async function ibtn(buttonId, text, callbackData, extra = {}) {
  let style = await getInlineStyle(buttonId);
  let btn = { text, callback_data: callbackData };
  if (style) btn.style = style;
  return { ...btn, ...extra };
}

// Build an inline URL button with style
async function iurl(buttonId, text, url) {
  let style = await getInlineStyle(buttonId);
  let btn = { text, url };
  if (style) btn.style = style;
  return btn;
}

// Helper to build InlineKeyboard from array of buttons
function buildIKB(rows) {
  return { inline_keyboard: rows };
}

// ============================================================
// 🎨 INLINE STYLE EDITOR PANEL
// ============================================================
const STYLE_EMOJI = {
  "primary": "🔵",
  "success": "🟢",
  "danger": "🔴",
  "default": "⚪"
};
const STYLE_LABEL = {
  "primary": "Primary (Blue)",
  "success": "Success (Green)",
  "danger": "Danger (Red)",
  "default": "Default (No Color)"
};

async function getInlineStylesText() {
  let text = "🖌️ *Inline Button Styles Editor*\n\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n\n";
  text += "Tap a button below to change its color.\n";
  text += "Colors use Telegram's native `style` API.\n\n";
  text += "🔵 Primary  🟢 Success  🔴 Danger  ⚪ Default\n\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n\n";

  // Group by screen
  let screens = {};
  for (let b of INLINE_BUTTONS_REGISTRY) {
    if (!screens[b.screen]) screens[b.screen] = [];
    screens[b.screen].push(b);
  }
  for (let [screen, btns] of Object.entries(screens)) {
    text += `*${screen}*\n`;
    for (let b of btns) {
      let style = await getInlineStyle(b.id);
      let emoji = STYLE_EMOJI[style || "default"];
      text += `  ${emoji} ${b.label}\n`;
    }
    text += "\n";
  }
  text += "━━━━━━━━━━━━━━━━━━━━";
  return text;
}

async function getInlineStylesKeyboard() {
  let kb = new InlineKeyboard();
  let screens = {};
  for (let b of INLINE_BUTTONS_REGISTRY) {
    if (!screens[b.screen]) screens[b.screen] = [];
    screens[b.screen].push(b);
  }
  for (let [screen, btns] of Object.entries(screens)) {
    kb = kb.text(`📂 ${screen}`, `inline_scr_${encodeURIComponent(screen)}`).row();
  }
  kb = kb.text("🔄 Reset All to Default", "inline_reset_all").row();
  kb = kb.text("🔙 Back to Admin", "admin");
  return kb;
}

async function getScreenText(screen) {
  let btns = INLINE_BUTTONS_REGISTRY.filter(b => b.screen === screen);
  let text = `🖌️ *${screen}*\n\n`;
  text += "━━━━━━━━━━━━━━━━━━━━\n\n";
  for (let b of btns) {
    let style = await getInlineStyle(b.id);
    let emoji = STYLE_EMOJI[style || "default"];
    text += `${emoji} ${b.label}\n`;
  }
  text += "\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Tap a button to edit its style.";
  return text;
}

async function getScreenKeyboard(screen) {
  let btns = INLINE_BUTTONS_REGISTRY.filter(b => b.screen === screen);
  let kb = new InlineKeyboard();
  for (let b of btns) {
    let style = await getInlineStyle(b.id);
    let emoji = STYLE_EMOJI[style || "default"];
    kb = kb.text(`${emoji} ${b.label}`, `inline_btn_${b.id}`).row();
  }
  kb = kb.text("🔙 Back", "adm_edit_inline_styles");
  return kb;
}

// ============================================================
// 🚀 /start COMMAND
// ============================================================
bot.command("start", async (ctx) => {
  try {
    delete userState[ctx.from.id];
    let userId = ctx.from.id;
    let existingUser = await User.findOne({ userId });
    let isNewUser = !existingUser;

    let user = await getUser(userId);
    user.firstName = ctx.from.first_name || "";
    user.username = ctx.from.username || "";
    await user.save();

    if (isNewUser) {
      let nameStr = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim() || "No Name";
      let usernameStr = ctx.from.username ? `@${ctx.from.username}` : "No Username";
      let notifMsg =
        `🆕 *New User Started Bot!*\n\n` +
        `👤 Name: ${nameStr}\n` +
        `🆔 User ID: \`${userId}\`\n` +
        `📛 Username: ${usernameStr}\n` +
        `📅 Date: ${new Date().toLocaleString('en-IN')}\n\n` +
        `👆 Tap the button below to open profile.`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      try {
        await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb });
      } catch (e) {}
    }

    if (user.isBanned) return ctx.reply("❌ You are banned from using this bot.");

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
    await ctx.reply(welcomeText, { reply_markup: buildMainKeyboard() });
  } catch (err) { console.error("Error /start:", err); }
});

bot.callbackQuery("check_join", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ You have not joined all channels yet!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  let welcomeText = await getConfig("text_welcome", `👋 Welcome back! Choose an option below:`);
  await ctx.reply(welcomeText, { reply_markup: buildMainKeyboard() });
});

// Main reply keyboard (NO COLOR — plain, since reply keyboard has no style API)
function buildMainKeyboard() {
  return new Keyboard()
    .text("🚀 My Balance").text("📋 Task Earn").row()
    .text("🎁 Gift Code").text("💸 P2P Transfer").row()
    .text("💳 Payout Method").text("🏦 Withdraw").row()
    .resized();
}

// ============================================================
// 👑 ADMIN PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.reply("❌ You are not an admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");

  let panelText = `👑 Welcome To Admin Panel\n\n` +
                  `💡 Review Bot Details ^_^\n` +
                  `👨‍💻 Main Owner ~ ${ownerId}\n` +
                  `🤖 Bot On/Off ~ ${botActive ? "✅ Active" : "❌ Off"}\n` +
                  `💸 Minimum Withdraw ~ ₹${minW}\n` +
                  `💰 Maximum Withdraw ~ ₹${maxW}\n` +
                  `📢 Payout Channel ~ ${pChannel}\n` +
                  `💬 Support ID ~ ${supportId}`;

  let kb = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("👥 User Tracker", "adm_user_tracker").text("📊 All User Balances", "adm_all_balances").row()
    .text("📉 Min Withdraw", "adm_set_min_w").text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Set Payout Channel", "adm_set_p_chan").text("📢 Manage Channels", "adm_channels").row()
    .text("🔄 Reset Balance", "adm_reset_bal").text("📋 Manage Tasks", "adm_tasks_manager").row()
    .text("🎁 Create Gift", "adm_create_gift").text("📢 Broadcast", "adm_broadcast").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🖌️ Edit Inline Styles", "adm_edit_inline_styles").row()
    .text("💬 Set Support ID", "adm_set_support").text("🔄 Refresh Panel", "admin");

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(panelText, { reply_markup: kb }).catch(() => {});
  } else {
    await ctx.reply(panelText, { reply_markup: kb });
  }
}

bot.callbackQuery("admin", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery().catch(() => {});
  await sendAdminPanel(ctx, true);
});

// ============================================================
// 🖌️ INLINE STYLE EDITOR CALLBACKS
// ============================================================
bot.callbackQuery("adm_edit_inline_styles", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getInlineStylesText(), {
    parse_mode: "Markdown",
    reply_markup: await getInlineStylesKeyboard()
  }).catch(() => {});
});

bot.callbackQuery(/^inline_scr_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let screen = decodeURIComponent(ctx.callbackQuery.data.replace("inline_scr_", ""));
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getScreenText(screen), {
    parse_mode: "Markdown",
    reply_markup: await getScreenKeyboard(screen)
  }).catch(() => {});
});

bot.callbackQuery(/^inline_btn_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let buttonId = ctx.callbackQuery.data.replace("inline_btn_", "");
  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });
  await ctx.answerCallbackQuery();

  let currentStyle = await getInlineStyle(buttonId);
  let currentEmoji = STYLE_EMOJI[currentStyle || "default"];
  let currentLabel = STYLE_LABEL[currentStyle || "default"];

  let text =
    `🎨 *Edit Style*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 Button: *${meta.label}*\n` +
    `📍 Screen: ${meta.screen}\n` +
    `🎨 Current: ${currentEmoji} \`${currentLabel}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Pick a new style:`;

  let kb = new InlineKeyboard()
    .text(currentStyle === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `inline_set_${buttonId}_primary`).row()
    .text(currentStyle === "success" ? "✅ 🟢 Success" : "🟢 Success", `inline_set_${buttonId}_success`).row()
    .text(currentStyle === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `inline_set_${buttonId}_danger`).row()
    .text(currentStyle === null ? "✅ ⚪ Default" : "⚪ Default (No Color)", `inline_set_${buttonId}_default`).row()
    .text("🔄 Reset this Button", `inline_reset_${buttonId}`).row()
    .text("🔙 Back", `inline_scr_${encodeURIComponent(meta.screen)}`);

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^inline_set_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let raw = ctx.callbackQuery.data.replace("inline_set_", "");
  let lastUnderscore = raw.lastIndexOf("_");
  let buttonId = raw.substring(0, lastUnderscore);
  let newStyle = raw.substring(lastUnderscore + 1);

  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });

  if (newStyle === "default") {
    await setInlineStyle(buttonId, null);
    await ctx.answerCallbackQuery({ text: "⚪ Style reset to default", show_alert: false });
  } else if (["primary", "success", "danger"].includes(newStyle)) {
    await setInlineStyle(buttonId, newStyle);
    await ctx.answerCallbackQuery({ text: `${STYLE_EMOJI[newStyle]} ${STYLE_LABEL[newStyle]} applied!`, show_alert: false });
  } else {
    return ctx.answerCallbackQuery({ text: "❌ Invalid style!", show_alert: true });
  }

  // Re-render button editor
  let currentStyle = await getInlineStyle(buttonId);
  let currentEmoji = STYLE_EMOJI[currentStyle || "default"];
  let currentLabel = STYLE_LABEL[currentStyle || "default"];
  let text =
    `🎨 *Edit Style*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 Button: *${meta.label}*\n` +
    `📍 Screen: ${meta.screen}\n` +
    `🎨 Current: ${currentEmoji} \`${currentLabel}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Pick a new style:`;
  let kb = new InlineKeyboard()
    .text(currentStyle === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `inline_set_${buttonId}_primary`).row()
    .text(currentStyle === "success" ? "✅ 🟢 Success" : "🟢 Success", `inline_set_${buttonId}_success`).row()
    .text(currentStyle === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `inline_set_${buttonId}_danger`).row()
    .text(currentStyle === null ? "✅ ⚪ Default" : "⚪ Default (No Color)", `inline_set_${buttonId}_default`).row()
    .text("🔄 Reset this Button", `inline_reset_${buttonId}`).row()
    .text("🔙 Back", `inline_scr_${encodeURIComponent(meta.screen)}`);
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

// Reset single inline button style
bot.callbackQuery(/^inline_reset_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let buttonId = ctx.callbackQuery.data.replace("inline_reset_", "");
  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });

  let currentStyle = await getInlineStyle(buttonId);
  let defaultStyle = DEFAULT_INLINE_STYLES[buttonId] || null;

  if (currentStyle === defaultStyle) {
    return ctx.answerCallbackQuery({ text: "ℹ️ Already at default style!", show_alert: true });
  }

  await setInlineStyle(buttonId, defaultStyle);
  await ctx.answerCallbackQuery({ text: "✅ Reset to default!", show_alert: true });

  // Re-render button editor
  let newStyle = await getInlineStyle(buttonId);
  let currentEmoji = STYLE_EMOJI[newStyle || "default"];
  let currentLabel = STYLE_LABEL[newStyle || "default"];
  let text =
    `🎨 *Edit Style*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 Button: *${meta.label}*\n` +
    `📍 Screen: ${meta.screen}\n` +
    `🎨 Current: ${currentEmoji} \`${currentLabel}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Pick a new style:`;
  let kb = new InlineKeyboard()
    .text(newStyle === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `inline_set_${buttonId}_primary`).row()
    .text(newStyle === "success" ? "✅ 🟢 Success" : "🟢 Success", `inline_set_${buttonId}_success`).row()
    .text(newStyle === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `inline_set_${buttonId}_danger`).row()
    .text(newStyle === null ? "✅ ⚪ Default" : "⚪ Default (No Color)", `inline_set_${buttonId}_default`).row()
    .text("🔄 Reset this Button", `inline_reset_${buttonId}`).row()
    .text("🔙 Back", `inline_scr_${encodeURIComponent(meta.screen)}`);
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

// Reset all inline button styles
bot.callbackQuery("inline_reset_all", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await InlineStyle.deleteMany({});
  await ctx.answerCallbackQuery({ text: "🔄 All inline styles reset to default!", show_alert: true });
  await ctx.editMessageText(await getInlineStylesText(), {
    parse_mode: "Markdown",
    reply_markup: await getInlineStylesKeyboard()
  }).catch(() => {});
});

// ============================================================
// 📊 ALL USERS BALANCE LIST
// ============================================================
bot.callbackQuery("adm_all_balances", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();

  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) {
    return ctx.reply("📊 No users found.", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
  }

  let totalBalance = 0;
  let msg = `📊 *All Users Balance List*\n\n━━━━━━━━━━━━━━━━━━━━\n`;
  let chunks = [];
  let current = msg;

  users.forEach((u, idx) => {
    totalBalance += u.balance;
    let line = `\`${idx + 1}.\` 🆔 \`${u.userId}\`\n    💰 ₹${u.balance.toFixed(2)}\n\n`;
    if (current.length + line.length > 3500) { chunks.push(current); current = ""; }
    current += line;
  });

  let summary = `━━━━━━━━━━━━━━━━━━━━\n👥 *Total Users:* \`${users.length}\`\n💵 *Total Balance:* \`₹${totalBalance.toFixed(2)}\``;
  if (current.length + summary.length > 4000) { chunks.push(current); current = summary; }
  else current += summary;
  chunks.push(current);

  let kb = new InlineKeyboard().text("🔙 Back to Admin", "admin");
  for (let i = 0; i < chunks.length; i++) {
    if (i === chunks.length - 1) await ctx.reply(chunks[i], { parse_mode: "Markdown", reply_markup: kb });
    else await ctx.reply(chunks[i], { parse_mode: "Markdown" });
  }
});

// ============================================================
// 💬 SET SUPPORT ID
// ============================================================
bot.callbackQuery("adm_set_support", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let currentSupport = await getConfig("support_username", "Not Set");
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `💬 *Set Customer Support*\n\n` +
    `Current: \`${currentSupport}\`\n\n` +
    `Send:\n• Username (e.g. \`@MySupport\`)\n• Or User ID (e.g. \`8061612320\`)`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({});
  let kb = new InlineKeyboard();
  if (tasks.length === 0) kb.text("📂 No Tasks Found", "noop").row();
  else tasks.forEach(t => {
    kb.text(`📄 ${t.title}`, `view_task_${t.taskId}`)
      .text("✏️", `edit_task_${t.taskId}`)
      .text("🗑️", `del_task_${t.taskId}`).row();
  });
  kb.text("➕ Add New Task", "adm_create_task").row();
  kb.text("➕ Add Channel For Task Alert", "adm_add_task_channel").row();
  kb.text("🔙 Back", "admin");
  let taskText = "💡 *Here You Can Manage Your Tasks*\n\nSelect A Task To View, Edit, Or Delete It.";
  if (ctx.callbackQuery) await ctx.editMessageText(taskText, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
  else await ctx.reply(taskText, { reply_markup: kb, parse_mode: "Markdown" });
}

bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await renderTaskManager(ctx);
});

bot.callbackQuery(/^view_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found!", show_alert: true });
  let msg = `📋 *Task Details*\n\n` +
            `🆔 ID: ${task.taskId}\n` +
            `📌 Title: ${task.title}\n` +
            `💰 Reward: ₹${task.reward}\n` +
            `🔗 Link: ${task.link}\n` +
            `⏱️ Time Limit: ${task.timeLimitMinutes > 0 ? task.timeLimitMinutes + ' Minutes' : 'Not Set'}\n` +
            `🔔 Alert Status: ${task.alertEnabled ? '✅ ON' : '❌ OFF'}\n` +
            `📢 Alert Channel: ${task.alertChannel}`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit Task", `edit_task_${task.taskId}`)
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back to Tasks", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^edit_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("edit_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found!", show_alert: true });
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back to Tasks", "adm_tasks_manager");
  let msg = `✏️ *Edit Task: ${task.title}*\n\nChoose what you want to modify:`;
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^toggle_t_alert_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("toggle_t_alert_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found!", show_alert: true });
  task.alertEnabled = !task.alertEnabled;
  await task.save();
  await ctx.answerCallbackQuery({ text: `Alert ${task.alertEnabled ? 'ON' : 'OFF'}` });
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back to Tasks", "adm_tasks_manager");
  let msg = `✏️ *Edit Task: ${task.title}*\n\nChoose what you want to modify:`;
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^set_t_time_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("set_t_time_", "");
  userState[ctx.from.id] = `WAITING_FOR_TASK_TIME_${tId}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`⏱️ Set Time Limit for Task (\`${tId}\`):\n\nSend minutes (e.g. \`60\`, or \`0\` to disable):`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`),
    parse_mode: "Markdown"
  });
});

bot.callbackQuery(/^del_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  await Task.deleteOne({ taskId: tId });
  await ctx.answerCallbackQuery({ text: "Task deleted!" });
  await renderTaskManager(ctx);
});

bot.callbackQuery("adm_add_task_channel", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  userState[ctx.from.id] = "WAITING_FOR_TASK_ALERT_CHANNEL";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("📢 *Add Channel For Task Alert*\n\nSend channel username or ID (e.g. `@TaskAlertChannel` or `-1001234567890`):", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager"),
    parse_mode: "Markdown"
  });
});

// ============================================================
// 👑 OTHER ADMIN CALLBACKS
// ============================================================
bot.callbackQuery("adm_add_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_rem_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_user_tracker", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 Send User ID to track:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_min_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Send new Minimum:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_max_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Send new Maximum:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Send Payout Channel:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_reset_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Send UserID to reset:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await getConfig("forced_channels", []);
  userState[ctx.from.id] = "WAITING_FOR_CHANNEL_ADD";
  await ctx.editMessageText(`📢 Channels: ${channels.join(", ") || "None"}\n\nSend channel to add or "clear":`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});
bot.callbackQuery("adm_create_task", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText("📋 Format: TaskID | Title | Reward | Link", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});
bot.callbackQuery("adm_create_gift", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_GIFT_CREATE";
  await ctx.editMessageText("🎁 Format: CODE Amount MaxUses", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_broadcast", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText("📢 Send broadcast message:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_admins", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let admins = await getConfig("admins", []);
  userState[ctx.from.id] = "WAITING_FOR_ADMIN_ID";
  await ctx.editMessageText(`👥 Admins: ${admins.join(", ") || "None"}\n\nSend UserID to add/remove:`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
  });
});
bot.callbackQuery("adm_transfer", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  userState[ctx.from.id] = "WAITING_FOR_NEW_OWNER";
  await ctx.editMessageText("👑 Send new Owner UserID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

// ============================================================
// 🔍 USER TRACKER CALLBACKS
// ============================================================
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `📊 *Balance Record (ID: ${targetId})*\n\n`;
  if (history.length === 0) msg += "No records.";
  else history.forEach((h, idx) => {
    let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. *${h.action}*: ₹${h.amount} (${dateStr})\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_back_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `🏧 *Withdraw History (ID: ${targetId})*\n\n`;
  if (withdrawals.length === 0) msg += "No records.";
  else withdrawals.forEach((w, idx) => {
    let dateStr = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. ₹${w.amount} | ${w.method}\n   ${w.status} | ${dateStr}\n\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_back_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_ref_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return ctx.answerCallbackQuery({ text: "User not found!", show_alert: true });
  let kb = new InlineKeyboard()
    .text("📜 Balance Record", `track_bal_${targetId}`).row()
    .text("🏧 Withdraw History", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(generateTrackerText(targetUser), { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^track_back_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_back_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return ctx.answerCallbackQuery({ text: "User not found!", show_alert: true });
  let kb = new InlineKeyboard()
    .text("📜 Balance Record", `track_bal_${targetId}`).row()
    .text("🏧 Withdraw History", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(generateTrackerText(targetUser), { reply_markup: kb }).catch(() => {});
});

// ============================================================
// 🏧 WITHDRAWAL CALLBACKS
// ============================================================
bot.callbackQuery(/^conf_wd_/, async (ctx) => {
  let dataParts = ctx.callbackQuery.data.replace("conf_wd_", "").split("_");
  let amount = parseFloat(dataParts[dataParts.length - 1]);
  let method = dataParts.slice(0, dataParts.length - 1).join(" ");
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient balance!", show_alert: true });

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let details = "";
  if (method === "Wallet") details = user.walletAccount;
  else if (method === "UPI") details = user.upiId;
  else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
  else if (method === "Amazon") details = user.amazonEmail;
  else if (method === "Redeem Code") details = user.redeemCodeAddr;

  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  await Withdrawal.create({ withdrawalId, userId, amount, method, details });

  await ctx.answerCallbackQuery({ text: "Submitted!" });
  await ctx.editMessageText(`✅ Withdrawal of ₹${amount} via ${method} submitted!\nRequest ID: #${withdrawalId}\nStatus: Pending.`);

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    // Build admin buttons with styles
    let approveBtn = await ibtn("task_approve", "✅ Approve", `wd_app_${withdrawalId}`);
    let rejectBtn  = await ibtn("task_reject",  "❌ Reject",  `wd_rej_${withdrawalId}`);
    let adminKb = buildIKB([[approveBtn, rejectBtn]]);
    try {
      await ctx.api.sendMessage(payoutChannel, `🔔 Withdrawal #${withdrawalId}\n\n👤 ${userId}\n💰 ₹${amount}\n💳 ${method}\n📋 ${details}`, { reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled." });
  await ctx.editMessageText("❌ Withdrawal cancelled.");
});

bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  wd.status = "Approved"; await wd.save();
  await ctx.answerCallbackQuery({ text: "Approved!" });
  await ctx.editMessageText(`✅ Withdrawal #${wId} *APPROVED*`, { parse_mode: "Markdown" }).catch(() => {});
  try {
    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    await ctx.api.sendMessage(wd.userId, `💸 Payment Successful!\n\n₹${wd.amount}\n${wd.method}`, {
      reply_markup: new InlineKeyboard().webApp("🚀 Check Status", `${serverUrl}/receipt/${wd.withdrawalId}`)
    });
  } catch (e) {}
});

bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  wd.status = "Rejected"; await wd.save();
  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Withdrawal Refunded`, wd.amount);
  await ctx.answerCallbackQuery({ text: "Rejected & Refunded!" });
  await ctx.editMessageText(`❌ Withdrawal #${wId} *REJECTED*`, { parse_mode: "Markdown" }).catch(() => {});
  try { await ctx.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`); } catch (e) {}
});

// ============================================================
// 📋 TASK SUBMISSION APPROVAL
// ============================================================
bot.callbackQuery(/^task_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_app_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });
  sub.status = "Approved"; await sub.save();
  let user = await getUser(sub.userId);
  user.balance += sub.reward;
  await user.save();
  await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
  let task = await Task.findOne({ taskId: sub.taskId });
  if (task && !task.completedUsers.includes(sub.userId)) {
    task.completedUsers.push(sub.userId);
    await task.save();
  }
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED* by ${ctx.from.first_name || "Admin"}`,
    parse_mode: "Markdown"
  }).catch(() => {});
  try {
    await ctx.api.sendMessage(sub.userId,
      `🎉 *Payment Received Successfully!*\n\n📌 Task: *${sub.taskTitle}*\n💰 Reward: *₹${sub.reward}*\n✅ Status: *Approved*`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {}
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });
  sub.status = "Rejected"; await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED* by ${ctx.from.first_name || "Admin"}`,
    parse_mode: "Markdown"
  }).catch(() => {});
  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ *Task Rejected!*\n\n📌 Task: *${sub.taskTitle}*\n💰 Reward: *₹${sub.reward}*\n\nYour proof was not valid.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {}
});

// ============================================================
// 💬 TEXT HANDLER
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    if (text === "❌ Cancel Task") {
      delete userState[userId];
      await ctx.reply("❌ Task cancelled. Start again anytime.", { reply_markup: buildMainKeyboard() });
      return;
    }

    if (state === "WAITING_FOR_SUPPORT_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let cleanId = text.trim();
      if (!cleanId) return ctx.reply("❌ Invalid!");
      await setConfig("support_username", cleanId);
      return ctx.reply(`✅ Customer Support updated to: ${cleanId}`);
    }

    if (state.startsWith("WAITING_FOR_TASK_TIME_") && (await isAdmin(userId))) {
      let tId = state.replace("WAITING_FOR_TASK_TIME_", "");
      delete userState[userId];
      let mins = parseInt(text, 10);
      if (isNaN(mins)) return ctx.reply("❌ Invalid!");
      await Task.findOneAndUpdate({ taskId: tId }, { timeLimitMinutes: mins });
      return ctx.reply(`✅ Time limit updated to ${mins} min.`);
    }

    if (state === "WAITING_FOR_TASK_ALERT_CHANNEL" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("default_task_alert_channel", text);
      return ctx.reply(`✅ Task Alert Channel set to: ${text}`);
    }

    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid ID!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User ${targetId} not found!`);
      let kb = new InlineKeyboard()
        .text("📜 Balance Record", `track_bal_${targetId}`).row()
        .text("🏧 Withdraw History", `track_wd_${targetId}`).row()
        .text("🔄 Refresh", `track_ref_${targetId}`).row()
        .text("🔙 Back", "admin");
      return ctx.reply(generateTrackerText(targetUser), { reply_markup: kb });
    }

    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let updated = await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amount } }, { new: true, upsert: true });
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
      return ctx.reply(`✅ Added ₹${amount} to ${targetId}. New: ₹${updated.balance.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let targetUser = await getUser(targetId);
      let newBal = Math.max(0, targetUser.balance - amount);
      targetUser.balance = newBal;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
      return ctx.reply(`✅ Removed ₹${amount}. New: ₹${newBal.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("min_withdraw", amt);
      return ctx.reply(`✅ Min withdraw set to ₹${amt}`);
    }
    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("max_withdraw", amt);
      return ctx.reply(`✅ Max withdraw set to ₹${amt}`);
    }
    if (state === "WAITING_FOR_P_CHAN" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("payout_channel", text);
      return ctx.reply(`✅ Payout channel: ${text}`);
    }
    if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      await User.findOneAndUpdate({ userId: targetId }, { balance: 0 });
      await logBalanceHistory(targetId, "Admin Reset Balance", 0);
      return ctx.reply(`✅ Balance reset for ${targetId}.`);
    }
    if (state === "WAITING_FOR_CHANNEL_ADD" && (await isAdmin(userId))) {
      delete userState[userId];
      if (text.toLowerCase() === "clear") {
        await setConfig("forced_channels", []);
        return ctx.reply("✅ All channels cleared.");
      }
      let channels = await getConfig("forced_channels", []);
      if (!channels.includes(text)) channels.push(text);
      await setConfig("forced_channels", channels);
      return ctx.reply(`✅ Channel ${text} added.`);
    }
    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
      let defaultAlertCh = await getConfig("default_task_alert_channel", "Not Set");
      await Task.create({ taskId: parts[0], title: parts[1], reward: parseFloat(parts[2]), link: parts[3], alertChannel: defaultAlertCh });
      return ctx.reply(`✅ Task '${parts[1]}' created!`);
    }
    if (state === "WAITING_FOR_GIFT_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(" ");
      if (parts.length < 3) return ctx.reply("❌ Use: CODE Amount MaxUses");
      await GiftCode.create({ code: parts[0], amount: parseFloat(parts[1]), maxUses: parseInt(parts[2], 10) });
      return ctx.reply(`✅ Gift Code '${parts[0]}' created!`);
    }
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      let count = 0;
      for (let u of allUsers) {
        try { await ctx.api.sendMessage(u.userId, text); count++; } catch (e) {}
      }
      return ctx.reply(`✅ Broadcast sent to ${count} users!`);
    }
    if (state === "WAITING_FOR_ADMIN_ID" && userId === (await getConfig("owner_id", MAIN_OWNER_ID))) {
      delete userState[userId];
      let adminId = parseInt(text, 10);
      if (isNaN(adminId)) return ctx.reply("❌ Invalid!");
      let admins = await getConfig("admins", []);
      if (admins.includes(adminId)) {
        admins = admins.filter(id => id !== adminId);
        await setConfig("admins", admins);
        return ctx.reply(`✅ Admin ${adminId} removed.`);
      } else {
        admins.push(adminId);
        await setConfig("admins", admins);
        return ctx.reply(`✅ Admin ${adminId} added.`);
      }
    }
    if (state === "WAITING_FOR_NEW_OWNER") {
      delete userState[userId];
      let newOwnerId = parseInt(text, 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
      await setConfig("owner_id", newOwnerId);
      return ctx.reply(`👑 Ownership transferred to ${newOwnerId}!`);
    }

    if (state === "SET_WALLET_ACC") { delete userState[userId]; await User.findOneAndUpdate({ userId }, { walletAccount: text }); return ctx.reply(`✅ Wallet updated: ${text}`); }
    if (state === "SET_UPI_ACC") { delete userState[userId]; await User.findOneAndUpdate({ userId }, { upiId: text }); return ctx.reply(`✅ UPI updated: ${text}`); }
    if (state === "SET_BANK_ACC") {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 3) return ctx.reply("❌ Use: AccNo | IFSC | BankName");
      await User.findOneAndUpdate({ userId }, { bankAccNo: parts[0], bankIfsc: parts[1], bankName: parts[2] });
      return ctx.reply(`✅ Bank updated!`);
    }
    if (state === "SET_AMAZON_ACC") { delete userState[userId]; await User.findOneAndUpdate({ userId }, { amazonEmail: text }); return ctx.reply(`✅ Amazon email: ${text}`); }
    if (state === "SET_REDEEM_ACC") { delete userState[userId]; await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text }); return ctx.reply(`✅ Redeem address: ${text}`); }

    if (state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 1);
      let maxW = await getConfig("max_withdraw", 100);
      if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) return ctx.reply("❌ Invalid amount!");
      if (user.balance < amount) return ctx.reply("❌ Insufficient balance!");

      let details = "";
      if (method === "Wallet") details = user.walletAccount;
      else if (method === "UPI") details = user.upiId;
      else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
      else if (method === "Amazon") details = user.amazonEmail;
      else if (method === "Redeem Code") details = user.redeemCodeAddr;

      let confirmMsg = `📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: ${details}\nAmount: ₹${amount}\n\nConfirm?`;
      let safeMethod = method.replace(/ /g, "_");
      let confirmBtn = await ibtn("confirm_wd", "✅ Confirm", `conf_wd_${safeMethod}_${amount}`);
      let cancelBtn  = await ibtn("cancel_wd",  "❌ Cancel",  "canc_wd");
      let kb = buildIKB([[confirmBtn, cancelBtn]]);
      return ctx.reply(confirmMsg, { reply_markup: kb, parse_mode: "Markdown" });
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
      if (transfers.length === 0 || sender.balance < totalCost) return ctx.reply("❌ Invalid or insufficient balance!");
      sender.balance -= totalCost;
      await sender.save();
      await logBalanceHistory(userId, "P2P Transfer Sent", -totalCost);

      let summary = "✅ P2P Transfer Successful:\n";
      for (let t of transfers) {
        let receiver = await User.findOne({ $or: [{ walletId: t.targetIdOrWallet }, { userId: parseInt(t.targetIdOrWallet, 10) || 0 }] });
        if (receiver && receiver.userId !== sender.userId) {
          receiver.balance += t.amount;
          await receiver.save();
          await logBalanceHistory(receiver.userId, "P2P Received", t.amount);
          summary += `➡️ ₹${t.amount} to ${t.targetIdOrWallet}\n`;
          try { await ctx.api.sendMessage(receiver.userId, `🎉 Received *₹${t.amount}* via P2P!`, { parse_mode: "Markdown" }); } catch (e) {}
        } else {
          sender.balance += t.amount;
          await sender.save();
          summary += `⚠️ ${t.targetIdOrWallet} not found (Refunded)\n`;
        }
      }
      return ctx.reply(summary);
    }

    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOne({ code: text });
      if (!gift || gift.usedUsers.includes(userId) || gift.usedUsers.length >= gift.maxUses) return ctx.reply("🚫 Invalid or expired gift code!");
      gift.usedUsers.push(userId);
      await gift.save();
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Gift redeemed! Added ₹${gift.amount}.`);
    }
  }

  // ============================================================
  // 🔀 NORMAL BUTTON MENU ROUTING
  // ============================================================
  let user = await getUser(userId);

  if (text === "🚀 My Balance") {
    let msg =
      `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
      `🔵 Wallet ID ➝ \`${userId}\`\n` +
      `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
      `Built with security you can Trust.\n` +
      `Support that responds promptly.`;
    let bs  = await ibtn("balance_statement",    "📊 Balance Statement", "balance_statement");
    let cs  = await ibtn("customer_support",     "💬 Customer Support",  "customer_support");
    let rf  = await ibtn("refresh_balance_only", "🔄 Refresh",           "refresh_balance_only");
    let lf  = await ibtn("live_fund",            "💰 Live Fund",         "live_fund");
    let kb = buildIKB([[bs, cs], [rf], [lf]]);
    return ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
  }
  else if (text === "📋 Task Earn") {
    let tasks = await Task.find({});
    if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available.");
    let rows = [];
    for (let t of tasks) {
      let btn = await ibtn("open_task_link", `📌 ${t.title} (₹${t.reward})`, `do_task_${t.taskId}`);
      rows.push([btn]);
    }
    return ctx.reply("📋 *Available Tasks:*\n\nTap to view details.", { reply_markup: buildIKB(rows), parse_mode: "Markdown" });
  }
  else if (text === "🎁 Gift Code") {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code To Claim Reward!");
  }
  else if (text === "💸 P2P Transfer") {
    userState[userId] = "WAITING_FOR_P2P";
    let msg = `💸 P2P Transfer\n\nFormat:\nWalletID_or_UserID-Amount`;
    let kb = buildIKB([[{ text: "👥 Select User", callback_data: "p2p_select_user" }]]);
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === "💳 Payout Method") {
    let msg = `💳 Payout Method\n\nWallet: ${user.walletAccount}\nUPI: ${user.upiId}\nBank: ${user.bankAccNo !== "Not Set" ? `${user.bankAccNo}, ${user.bankIfsc}` : "Not Set"}\nAmazon: ${user.amazonEmail}\nRedeem: ${user.redeemCodeAddr}`;
    let sw = await ibtn("set_wallet", "🌐 Set Wallet", "set_wallet");
    let su = await ibtn("set_upi",    "⚡ Set UPI",    "set_upi");
    let sb = await ibtn("set_bank",   "🏦 Set Bank",   "set_bank");
    let sa = await ibtn("set_amazon", "📧 Set Amazon", "set_amazon");
    let sr = await ibtn("set_redeem", "🎁 Set Redeem", "set_redeem");
    let kb = buildIKB([[sw], [su], [sb], [sa], [sr]]);
    return ctx.reply(msg, { reply_markup: kb });
  }
  else if (text === "🏦 Withdraw") {
    let minW = await getConfig("min_withdraw", 1);
    let maxW = await getConfig("max_withdraw", 100);
    let msg = `🏦 Withdraw\n\nBalance: ₹${user.balance.toFixed(2)}\nMin: ₹${minW} | Max: ₹${maxW}`;
    let ww = await ibtn("wd_wallet", "🌐 Wallet",      "wd_wallet");
    let wu = await ibtn("wd_upi",    "⚡ UPI",          "wd_upi");
    let wb = await ibtn("wd_bank",   "🏦 Bank",        "wd_bank");
    let wa = await ibtn("wd_amazon", "📧 Amazon",      "wd_amazon");
    let wr = await ibtn("wd_redeem", "🎁 Redeem Code", "wd_redeem");
    let kb = buildIKB([[ww, wu], [wb, wa], [wr]]);
    return ctx.reply(msg, { reply_markup: kb });
  }
  else {
    let gift = await GiftCode.findOne({ code: text });
    if (gift) {
      if (gift.usedUsers.includes(userId)) return ctx.reply("❌ Already used!");
      if (gift.usedUsers.length >= gift.maxUses) return ctx.reply("❌ Expired!");
      gift.usedUsers.push(userId);
      await gift.save();
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Added ₹${gift.amount}!`);
    }
    return next();
  }
});

// ============================================================
// 📸 PHOTO HANDLER — Task Proof Submission
// ============================================================
bot.on("message:photo", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state || !state.startsWith("WAITING_TASK_PHOTO_")) return;

  let taskId = state.replace("WAITING_TASK_PHOTO_", "");
  let task = await Task.findOne({ taskId });
  if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }
  if (task.completedUsers.includes(userId)) { delete userState[userId]; return ctx.reply("❌ Already completed!"); }

  let photo = ctx.message.photo[ctx.message.photo.length - 1];
  let submissionId = Math.floor(100000 + Math.random() * 900000).toString();

  await TaskSubmission.create({
    submissionId, userId,
    userName: ctx.from.first_name || "User",
    taskId: task.taskId,
    taskTitle: task.title,
    reward: task.reward,
    photoFileId: photo.file_id,
    status: "Pending"
  });

  delete userState[userId];

  await ctx.reply(
    `⏳ *Please wait...*\n\n📸 Your proof has been submitted!\n📌 Task: *${task.title}*\n💰 Reward: *₹${task.reward}*\n\n🕐 Admin will verify your submission shortly.`,
    { parse_mode: "Markdown", reply_markup: buildMainKeyboard() }
  );

  let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
    ? task.alertChannel
    : await getConfig("default_task_alert_channel", null);

  if (alertChannel && alertChannel !== "Not Set") {
    let caption =
      `📸 *New Task Submission!*\n\n` +
      `👤 Name: ${ctx.from.first_name || "User"}\n` +
      `🆔 User ID: \`${userId}\`\n` +
      `📌 Task: *${task.title}*\n` +
      `💰 Reward: *₹${task.reward}*\n` +
      `📅 Date: ${new Date().toLocaleString('en-IN')}\n\n` +
      `👇 Use buttons below to Approve/Reject`;
    let approveBtn = await ibtn("task_approve", "✅ Approve", `task_app_${submissionId}`);
    let rejectBtn  = await ibtn("task_reject",  "❌ Reject",  `task_rej_${submissionId}`);
    let kb = buildIKB([[approveBtn, rejectBtn]]);
    try {
      await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb });
    } catch (e) { console.error("Alert send failed:", e); }
  }
});

// ============================================================
// 📋 TASK CLICK — Show details, ask for photo proof
// ============================================================
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found!", show_alert: true });
  let userId = ctx.from.id;
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "Already completed!", show_alert: true });
  await ctx.answerCallbackQuery();

  let detailsMsg =
    `📋 *Task Details*\n\n` +
    `📌 *Title:* ${task.title}\n` +
    `💰 *Reward:* ₹${task.reward}\n` +
    `🔗 *Link:* ${task.link}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📸 *How to complete:*\n\n` +
    `1️⃣ Click the link below and complete the task\n` +
    `2️⃣ Take a screenshot as proof\n` +
    `3️⃣ Send the *last screenshot* here\n\n` +
    `⏳ *Please wait...* Admin will verify and credit ₹${task.reward} to your balance.`;

  let openBtn   = await iurl("open_task_link", "🔗 Open Task Link", task.link);
  let cancelBtn = await ibtn("cancel_task",    "❌ Cancel Task",    `cancel_task_${taskId}`);
  let kb = buildIKB([[openBtn], [cancelBtn]]);

  await ctx.reply(detailsMsg, { parse_mode: "Markdown", reply_markup: kb });
  userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;
  await ctx.reply("📸 *Send your screenshot now...*", {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel Task").resized()
  });
});

bot.callbackQuery(/^cancel_task_/, async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.answerCallbackQuery({ text: "Cancelled!" });
  await ctx.editMessageText("❌ Task cancelled. Start again anytime.").catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: buildMainKeyboard() });
});

// ============================================================
// 💰 MY BALANCE — Refresh, Statement, Back, Live Fund
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery("🔄 Balance Refreshed!");
  let msg =
    `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
    `🔵 Wallet ID ➝ \`${ctx.from.id}\`\n` +
    `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
    `Built with security you can Trust.\n` +
    `Support that responds promptly.`;
  let bs = await ibtn("balance_statement",    "📊 Balance Statement", "balance_statement");
  let cs = await ibtn("customer_support",     "💬 Customer Support",  "customer_support");
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh",           "refresh_balance_only");
  let lf = await ibtn("live_fund",            "💰 Live Fund",         "live_fund");
  let kb = buildIKB([[bs, cs], [rf], [lf]]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30);
  let user = await getUser(userId);
  let msg = `📊 *Balance Statement*\n\n🆔 User ID: \`${userId}\`\n💰 Current Balance: *₹${user.balance.toFixed(2)}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (history.length === 0) {
    msg += `📭 No transactions found.\n\nStart earning with tasks!`;
  } else {
    let totalIn = 0, totalOut = 0;
    history.forEach((h) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      msg += `${icon} *${h.action}*\n   ${sign}₹${h.amount.toFixed(2)} • ${dateStr}\n\n`;
      if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount);
    });
    msg += `━━━━━━━━━━━━━━━━━━━━\n🟢 Total Earned: *₹${totalIn.toFixed(2)}*\n🔴 Total Spent: *₹${totalOut.toFixed(2)}*`;
  }
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh", "balance_statement");
  let bk = await ibtn("back_to_balance",      "🔙 Back",    "back_to_balance");
  let kb = buildIKB([[rf], [bk]]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery();
  let msg =
    `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
    `🔵 Wallet ID ➝ \`${ctx.from.id}\`\n` +
    `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
    `Built with security you can Trust.\n` +
    `Support that responds promptly.`;
  let bs = await ibtn("balance_statement",    "📊 Balance Statement", "balance_statement");
  let cs = await ibtn("customer_support",     "💬 Customer Support",  "customer_support");
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh",           "refresh_balance_only");
  let lf = await ibtn("live_fund",            "💰 Live Fund",         "live_fund");
  let kb = buildIKB([[bs, cs], [rf], [lf]]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("customer_support", async (ctx) => {
  await ctx.answerCallbackQuery();
  let supportId = await getConfig("support_username", null);
  if (!supportId || supportId === "Not Set" || supportId === "") {
    return ctx.reply(`💬 *Customer Support*\n\n⚠️ Support contact not set yet.`, { parse_mode: "Markdown" });
  }
  let link;
  if (/^\d+$/.test(supportId)) link = `tg://user?id=${supportId}`;
  else link = `https://t.me/${supportId.replace('@', '')}`;
  let kb = buildIKB([[{ text: "💬 Contact Support", url: link }]]);
  await ctx.reply(`💬 *Customer Support*\n\nClick the button below to contact our support team.\n\n🕐 We usually respond within a few minutes.`, { parse_mode: "Markdown", reply_markup: kb });
});

// ============================================================
// 💰 LIVE FUND — Show total balance of ALL users
// ============================================================
bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading Live Fund...");
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });

  let msg =
    `💰 *Live Fund Report*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 *Total Users:* \`${users.length}\`\n` +
    `💵 *Total Balance:* \`₹${totalBalance.toFixed(2)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🕐 Last Updated: ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n\n` +
    `_Live balance — automatically updated_`;

  let rf = await ibtn("live_fund",        "🔄 Refresh Live Fund", "live_fund");
  let bk = await ibtn("back_to_balance",  "🔙 Back to Balance",   "back_to_balance");
  let kb = buildIKB([[rf], [bk]]);

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🎯 P2P / PAYOUT / WITHDRAW CALLBACKS
// ============================================================
bot.callbackQuery("p2p_select_user", async (ctx) => {
  await ctx.answerCallbackQuery();
  let users = await User.find({ userId: { $ne: ctx.from.id } }).limit(10);
  if (users.length === 0) return ctx.reply("❌ No users found!");
  let rows = [];
  users.forEach(u => { rows.push([{ text: `Wallet: ${u.walletId} (ID: ${u.userId})`, callback_data: `p2p_target_${u.walletId}` }]); });
  await ctx.reply("👥 Select user:", { reply_markup: buildIKB(rows) });
});

bot.callbackQuery(/^p2p_target_/, async (ctx) => {
  let targetWallet = ctx.callbackQuery.data.replace("p2p_target_", "");
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_P2P";
  await ctx.reply(`💡 Wallet: ${targetWallet}\n\nSend: \`${targetWallet}-Amount\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("set_wallet", async (ctx) => { userState[ctx.from.id] = "SET_WALLET_ACC"; await ctx.answerCallbackQuery(); await ctx.reply("🌐 Send Wallet details:"); });
bot.callbackQuery("set_upi", async (ctx) => { userState[ctx.from.id] = "SET_UPI_ACC"; await ctx.answerCallbackQuery(); await ctx.reply("⚡ Send UPI ID:"); });
bot.callbackQuery("set_bank", async (ctx) => { userState[ctx.from.id] = "SET_BANK_ACC"; await ctx.answerCallbackQuery(); await ctx.reply("🏦 Format: AccNo | IFSC | BankName"); });
bot.callbackQuery("set_amazon", async (ctx) => { userState[ctx.from.id] = "SET_AMAZON_ACC"; await ctx.answerCallbackQuery(); await ctx.reply("📧 Send Amazon email:"); });
bot.callbackQuery("set_redeem", async (ctx) => { userState[ctx.from.id] = "SET_REDEEM_ACC"; await ctx.answerCallbackQuery(); await ctx.reply("🎁 Send Redeem address:"); });

async function promptWithdrawalAmount(ctx, method) {
  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 1);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[ctx.from.id] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => { await promptWithdrawalAmount(ctx, "Wallet"); });
bot.callbackQuery("wd_upi", async (ctx) => { await promptWithdrawalAmount(ctx, "UPI"); });
bot.callbackQuery("wd_bank", async (ctx) => { await promptWithdrawalAmount(ctx, "Bank"); });
bot.callbackQuery("wd_amazon", async (ctx) => { await promptWithdrawalAmount(ctx, "Amazon"); });
bot.callbackQuery("wd_redeem", async (ctx) => { await promptWithdrawalAmount(ctx, "Redeem Code"); });

// ============================================================
// 🚀 FINAL START
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Connected!");
    bot.start({ onStart: (info) => console.log(`🚀 Bot @${info.username} running!`) });
  })
  .catch((err) => console.error("❌ DB Error:", err));
