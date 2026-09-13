// ============================================================
// 🤖 TELEGRAM PAYMENT TASK BOT — LATEST VERSION
// grammy ^1.35.1 | mongoose ^8.13.0 | express ^4.21.2
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

// ---------- Withdrawal Schema (for receipt page) ----------
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

// ---------- Balance History Schema ----------
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
      <div class="card-box"><div class="amount-label">WITHDRAWAL AMOUNT</div><div class="amount-val">₹ ${wd.amount.toFixed(2)}</div></div>
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

// 🎁 GiftCode — supports both "amazon" and "redeem" types
const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, default: "redeem" }, // "amazon" | "redeem"
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now }
});
giftCodeSchema.index({ code: 1, type: 1 }, { unique: true });

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

// 🆕 RedeemRequest — Manual mode requests
const redeemRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  amount: { type: Number, required: true },
  type: { type: String, required: true }, // "amazon" | "redeem"
  status: { type: String, default: "Pending" }, // Pending | Approved | Rejected
  assignedCode: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const TaskSubmission = mongoose.model("TaskSubmission", taskSubmissionSchema);
const RedeemRequest = mongoose.models.RedeemRequest || mongoose.model("RedeemRequest", redeemRequestSchema);
const Config = mongoose.model("Config", configSchema);

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
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  if (userId === ownerId) return true;
  let admins = await getConfig("admins", []);
  return admins.includes(userId);
}
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({
      userId,
      walletId: userId.toString() // Wallet ID = Telegram ID
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
         `🚻 Usᴇʀ : ${targetUser.firstName || "Unknown"}\n` +
         `🆔 Usᴇʀ ID : ${targetUser.userId}\n` +
         `💵 Aᴠᴀɪʟᴀʙʟᴇ Bᴀʟᴀɴᴄᴇ : ₹${targetUser.balance.toFixed(2)}\n` +
         `🏧 Wɪᴛʜᴅʀᴀᴡ Bᴀʟᴀɴᴄᴇ : ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}\n` +
         `⛔ Bʟᴏᴄᴋᴇᴅ Rᴇғᴇʀs : ${targetUser.blockedRefs || 0}\n` +
         `🔗 Rᴇғᴇʀʀᴀls Wɪɴ Lɪɴᴋ : ${targetUser.referralsWithLinkWallet || 0}\n` +
         `🎴 Lɪɴᴋᴇᴅ Aᴄᴄᴏᴜɴᴛ / UPI : ${linkedWalletInfo}\n` +
         `👩‍💻 Rᴇғᴇʀᴇᴅ Bʏ : ${targetUser.referredBy || "Aᴜᴛᴏ Sᴛᴀʀᴛᴇᴅ"}`;
}

// ============================================================
// 🎨 KEYBOARD LAYOUT
// ============================================================
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: "📋 BOT TASK",        key: "btn_tasks",    row: 0 },
  { name: "💸 MY BALANCE",      key: "btn_balance",  row: 1 },
  { name: "⚡ QUICK PAY",        key: "btn_quickpay", row: 1 },
  { name: "🎁 GIFT CODE",       key: "btn_gift",     row: 2 },
  { name: "💳 PAYMENT METHOD",  key: "btn_payout",   row: 2 },
  { name: "🚀 WITHDRAW",        key: "btn_withdraw", row: 3 }
];

async function getCurrentKeyboardLayout() {
  let layout = await getConfig("keyboard_layout", null);
  if (!layout || !Array.isArray(layout) || layout.length === 0) {
    layout = JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT));
    await setConfig("keyboard_layout", layout);
  }
  return layout;
}

// 🎨 Build reply keyboard (raw object — supports native styles later)
async function buildKeyboardFromLayout() {
  let layout = await getCurrentKeyboardLayout();
  let keyboardRows = [];
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;

  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let row = rowButtons.map(btn => ({ text: btn.name }));
      keyboardRows.push(row);
    }
  }

  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    is_persistent: true
  };
}

// ============================================================
// 🎨 CUSTOMIZE THEME PANEL (Keyboard Layout Manager)
// ============================================================
async function getManageText() {
  let layout = await getCurrentKeyboardLayout();
  let text = "⚙️ *Here You Can Manage Your Keyboard Layout:*\n\n" +
             "✏️ To Rename, Simply Click On The Button Name.\n\n" +
             "━━━━━━━━━━━━━━━━━━━━\n\n";
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    rowButtons.forEach(btn => { text += `${btn.name}\n`; });
  }
  text += "\n━━━━━━━━━━━━━━━━━━━━";
  return text;
}

async function getManageKeyboard() {
  let layout = await getCurrentKeyboardLayout();
  let kb = new InlineKeyboard();

  // Row controls: [Btn Name] [⬆️ Row] [⬇️ Row]
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    rowButtons.forEach(btn => {
      let idx = layout.indexOf(btn);
      kb = kb.text(btn.name, `theme_edit_${idx}`)
             .text("⬆️ Row", `theme_rowup_${r}`)
             .text("⬇️ Row", `theme_rowdown_${r}`).row();
    });
  }

  // Btn controls: [Btn Name] [⬆️ Btn] [⬇️ Btn] [🎯 Move]
  for (let i = 0; i < layout.length; i++) {
    let btn = layout[i];
    kb = kb.text(btn.name, `theme_edit_${i}`)
           .text("⬆️ Btn", `theme_btnup_${i}`)
           .text("⬇️ Btn", `theme_btndown_${i}`)
           .text("🎯 Move", `theme_move_${i}`).row();
  }

  kb = kb.text("♻️ Reset Keyboard To Default", "theme_reset").row();
  kb = kb.text("🎨 Update Keyboard For All Users", "theme_update_all").row();
  kb = kb.text("➕ Add New Button", "theme_add_btn").row();
  kb = kb.text("🔙 Back to Admin", "admin");
  return kb;
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

  let keyboard = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("👥 User Tracker", "adm_user_tracker").text("📊 All User Balances", "adm_all_balances").row()
    .text("📉 Min Withdraw", "adm_set_min_w").text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Set Payout Channel", "adm_set_p_chan").text("📢 Manage Channels", "adm_channels").row()
    .text("🔄 Reset Balance", "adm_reset_bal").text("📋 Manage Tasks", "adm_tasks_manager").row()
    .text("🎁 Create Gift", "adm_create_gift").text("📢 Broadcast", "adm_broadcast").row()
    .text("📧 Amazon", "adm_amazon").text("🎁 Redeem Code", "adm_redeem").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🎨 Customize Theme", "adm_customize_theme").row()
    .text("💬 Set Support ID", "adm_set_support").text("🔄 Refresh Panel", "admin");

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(panelText, { reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(panelText, { reply_markup: keyboard });
  }
}

bot.callbackQuery("admin", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery().catch(() => {});
  await sendAdminPanel(ctx, true);
});

// ============================================================
// 🎨 CUSTOMIZE THEME CALLBACKS
// ============================================================
bot.callbackQuery("adm_customize_theme", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getManageText(), {
    parse_mode: "Markdown",
    reply_markup: await getManageKeyboard()
  }).catch(() => {});
});

bot.callbackQuery(/^theme_edit_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  let btn = layout[idx];
  let text = `✏️ *Edit Button #${idx + 1}*\n\n📝 Current Name: \`${btn.name}\`\n📍 Row: ${btn.row}\n\nChoose an action:`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `theme_rename_${idx}`).row()
    .text("🗑️ Delete", `theme_del_${idx}`).row()
    .text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^theme_rename_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  userState[ctx.from.id] = `THEME_WAIT_RENAME_${idx}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📝 Send the new name for this button.\n\nExample: \`🎯 New Name\``, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme")
  }).catch(() => {});
});

bot.callbackQuery(/^theme_del_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });
  layout.splice(idx, 1);
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "🗑️ Button deleted!" });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_rowup_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let row = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (row <= 0) return ctx.answerCallbackQuery({ text: "⚠️ Already at top!", show_alert: true });
  // Move all buttons in this row up by 1
  layout.forEach(b => { if (b.row === row) b.row -= 1; else if (b.row === row - 1) b.row += 1; });
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "⬆️ Row moved up!" });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_rowdown_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let row = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  let maxRow = Math.max(...layout.map(b => b.row));
  if (row >= maxRow) return ctx.answerCallbackQuery({ text: "⚠️ Already at bottom!", show_alert: true });
  layout.forEach(b => { if (b.row === row) b.row += 1; else if (b.row === row + 1) b.row -= 1; });
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "⬇️ Row moved down!" });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_btnup_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx <= 0) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move up!", show_alert: true });
  let temp = layout[idx]; layout[idx] = layout[idx - 1]; layout[idx - 1] = temp;
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "⬆️ Moved up!" });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_btndown_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx >= layout.length - 1) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move down!", show_alert: true });
  let temp = layout[idx]; layout[idx] = layout[idx + 1]; layout[idx + 1] = temp;
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "⬇️ Moved down!" });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_move_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  userState[ctx.from.id] = `THEME_WAIT_MOVE_${idx}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`🎯 Send target position (row button_index).\n\nExample: \`2 0\` = Row 2, first position.`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme")
  }).catch(() => {});
});

bot.callbackQuery("theme_add_btn", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  userState[ctx.from.id] = "THEME_WAIT_ADD";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("➕ Send the new button name:\n\nExample: `🎁 Bonus`", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme")
  }).catch(() => {});
});

bot.callbackQuery("theme_reset", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let layout = JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT));
  await setConfig("keyboard_layout", layout);
  await ctx.answerCallbackQuery({ text: "♻️ Reset to default!", show_alert: true });
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery("theme_update_all", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Updating all users..." });
  let allUsers = await User.find({});
  let count = 0, failed = 0;
  let newKb = await buildKeyboardFromLayout();
  for (let u of allUsers) {
    try {
      await ctx.api.sendMessage(u.userId, "🎨 *Keyboard Updated by Admin!*\n\nYour keyboard has been refreshed automatically.", {
        parse_mode: "Markdown",
        reply_markup: newKb
      });
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  await ctx.reply(`📊 *Keyboard Update Report*\n\n✅ Updated: \`${count}\`\n❌ Failed: \`${failed}\`\n👥 Total: \`${allUsers.length}\``, { parse_mode: "Markdown" });
});

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
    await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout() });
  } catch (err) { console.error("Error /start:", err); }
});

bot.callbackQuery("check_join", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ You have not joined all channels yet!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  let welcomeText = await getConfig("text_welcome", `👋 Welcome back! Choose an option below:`);
  await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout() });
});

// ============================================================
// 📋 TASK MANAGER (Admin)
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({});
  let keyboard = new InlineKeyboard();
  if (tasks.length === 0) keyboard.text("📂 No Tasks Found", "noop").row();
  else tasks.forEach(t => {
    keyboard.text(`📄 ${t.title}`, `view_task_${t.taskId}`)
            .text("✏️", `edit_task_${t.taskId}`)
            .text("🗑️", `del_task_${t.taskId}`).row();
  });
  keyboard.text("➕ Add New Task", "adm_create_task").row();
  keyboard.text("➕ Add Channel For Task Alert", "adm_add_task_channel").row();
  keyboard.text("🔙 Back", "admin");
  let taskText = "💡 *Here You Can Manage Your Tasks*\n\nSelect A Task To View, Edit, Or Delete It.";
  if (ctx.callbackQuery) await ctx.editMessageText(taskText, { reply_markup: keyboard, parse_mode: "Markdown" }).catch(() => {});
  else await ctx.reply(taskText, { reply_markup: keyboard, parse_mode: "Markdown" });
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
// 📧 AMAZON PANEL (Admin) — Manual/Auto Toggle + Add Code
// ============================================================
async function renderAmazonPanel(ctx) {
  let mode = await getConfig("amazon_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";

  let msg =
    `📧 *Amazon Gift Code*\n\n` +
    `Current Mode: *${toggleLabel}*\n\n` +
    `💡 Auto → user-ന് auto code assign\n` +
    `💡 Manual → admin approve ചെയ്യണം`;

  let kb = new InlineKeyboard()
    .text(toggleLabel, "toggle_amazon_mode").row()
    .text("➕ Add Code", "adm_amazon_add").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_amazon", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await renderAmazonPanel(ctx);
});

bot.callbackQuery("toggle_amazon_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("amazon_mode", "manual");
  let newMode = current === "manual" ? "auto" : "manual";
  await setConfig("amazon_mode", newMode);
  await ctx.answerCallbackQuery({ text: `Switched to ${newMode.toUpperCase()}` });
  await renderAmazonPanel(ctx);
});

bot.callbackQuery("adm_amazon_add", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  userState[ctx.from.id] = "WAITING_AMAZON_CODES";
  await ctx.answerCallbackQuery();

  let msg =
    `➕ *Add Amazon Gift Code*\n\n` +
    `📝 *Format:*\n` +
    `\`CODE AMOUNT\`\n\n` +
    `📌 *Examples:*\n` +
    `\`AMZ100 100\`\n` +
    `\`AMZ200 200\`\n\n` +
    `💡 *Multiple codes:* ഓരോ line-ൽ ഒരെണ്ണം\n\n` +
    `👉 *Send your codes now:*`;

  await ctx.editMessageText(msg, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon")
  }).catch(() => {});
});

// ============================================================
// 🎁 REDEEM PANEL (Admin) — Manual/Auto Toggle + Add Code
// ============================================================
async function renderRedeemPanel(ctx) {
  let mode = await getConfig("redeem_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";

  let msg =
    `🎁 *Redeem Code*\n\n` +
    `Current Mode: *${toggleLabel}*\n\n` +
    `💡 Auto → user-ന് auto code assign\n` +
    `💡 Manual → admin approve ചെയ്യണം`;

  let kb = new InlineKeyboard()
    .text(toggleLabel, "toggle_redeem_mode").row()
    .text("➕ Add Code", "adm_redeem_add").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_redeem", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await renderRedeemPanel(ctx);
});

bot.callbackQuery("toggle_redeem_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("redeem_mode", "manual");
  let newMode = current === "manual" ? "auto" : "manual";
  await setConfig("redeem_mode", newMode);
  await ctx.answerCallbackQuery({ text: `Switched to ${newMode.toUpperCase()}` });
  await renderRedeemPanel(ctx);
});

bot.callbackQuery("adm_redeem_add", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.answerCallbackQuery();

  let msg =
    `➕ *Add Redeem Code*\n\n` +
    `📝 *Format:*\n` +
    `\`CODE AMOUNT\`\n\n` +
    `📌 *Examples:*\n` +
    `\`GIFT100 100\`\n` +
    `\`GIFT200 200\`\n\n` +
    `💡 *Multiple codes:* ഓരോ line-ൽ ഒരെണ്ണം\n\n` +
    `👉 *Send your codes now:*`;

  await ctx.editMessageText(msg, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_redeem")
  }).catch(() => {});
});

// ============================================================
// 🎯 SHARED: Save Codes
// ============================================================
async function saveCodes(text, type, ctx) {
  let lines = text.trim().split("\n").filter(l => l.trim() !== "");
  let added = [], failed = [];

  for (let line of lines) {
    let parts = line.trim().split(/\s+/);
    if (parts.length !== 2) { failed.push(`${line} (invalid format)`); continue; }

    let code = parts[0].trim();
    let amount = parseFloat(parts[1]);

    if (isNaN(amount) || amount <= 0) { failed.push(`${line} (invalid amount)`); continue; }

    let existing = await GiftCode.findOne({ code, type });
    if (existing) { failed.push(`${code} (already exists)`); continue; }

    await GiftCode.create({ code, amount, type, maxUses: 1, usedUsers: [] });
    added.push(`✅ \`${code}\` → ₹${amount}`);
  }

  let icon = type === "amazon" ? "📧" : "🎁";
  let title = type === "amazon" ? "Amazon Gift Codes" : "Redeem Codes";

  let summary = `${icon} *${title} Added*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (added.length > 0) summary += `✅ *Added (${added.length}):*\n${added.join("\n")}\n\n`;
  if (failed.length > 0) summary += `❌ *Failed (${failed.length}):*\n${failed.map(f => `• ${f}`).join("\n")}\n\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n\n📊 *Total Added:* ${added.length}\n❌ *Failed:* ${failed.length}`;

  await ctx.reply(summary, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", type === "amazon" ? "adm_amazon" : "adm_redeem")
  });
}

// ============================================================
// 💬 TEXT HANDLER (All States)
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    // 🆕 Cancel button
    if (text === "❌ Cancel") {
      delete userState[userId];
      await ctx.reply("Operation cancelled.", { reply_markup: await buildKeyboardFromLayout() });
      return;
    }

    // 🎨 THEME: Rename
    if (state.startsWith("THEME_WAIT_RENAME_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("THEME_WAIT_RENAME_", ""), 10);
      delete userState[userId];
      let layout = await getCurrentKeyboardLayout();
      if (idx < 0 || idx >= layout.length) return ctx.reply("❌ Button not found!");
      layout[idx].name = text;
      await setConfig("keyboard_layout", layout);
      return ctx.reply(`✅ Button renamed to: ${text}`);
    }

    // 🎨 THEME: Add new
    if (state === "THEME_WAIT_ADD" && (await isAdmin(userId))) {
      delete userState[userId];
      let layout = await getCurrentKeyboardLayout();
      let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
      layout.push({ name: text, key: `custom_${Date.now()}`, row: maxRow });
      await setConfig("keyboard_layout", layout);
      return ctx.reply(`✅ New button added: ${text}`);
    }

    // 🎨 THEME: Move to position
    if (state.startsWith("THEME_WAIT_MOVE_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("THEME_WAIT_MOVE_", ""), 10);
      delete userState[userId];
      let parts = text.split(/\s+/);
      if (parts.length !== 2) return ctx.reply("❌ Format: row position");
      let newRow = parseInt(parts[0], 10);
      if (isNaN(newRow)) return ctx.reply("❌ Invalid row!");
      let layout = await getCurrentKeyboardLayout();
      if (idx < 0 || idx >= layout.length) return ctx.reply("❌ Button not found!");
      layout[idx].row = newRow;
      await setConfig("keyboard_layout", layout);
      return ctx.reply(`✅ Button moved to row ${newRow}`);
    }

    // 💬 Set Support
    if (state === "WAITING_FOR_SUPPORT_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("support_username", text.trim());
      return ctx.reply(`✅ Customer Support updated to: ${text.trim()}`);
    }

    // ⏱️ Task time limit
    if (state.startsWith("WAITING_FOR_TASK_TIME_") && (await isAdmin(userId))) {
      let tId = state.replace("WAITING_FOR_TASK_TIME_", "");
      delete userState[userId];
      let mins = parseInt(text, 10);
      if (isNaN(mins)) return ctx.reply("❌ Invalid!");
      await Task.findOneAndUpdate({ taskId: tId }, { timeLimitMinutes: mins });
      return ctx.reply(`✅ Time limit updated to ${mins} min.`);
    }

    // 📢 Task alert channel
    if (state === "WAITING_FOR_TASK_ALERT_CHANNEL" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("default_task_alert_channel", text);
      return ctx.reply(`✅ Task Alert Channel set to: ${text}`);
    }

    // 🔍 User tracker
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

    // ➕ Add Balance
    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(/\s+/);
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User ${targetId} not found!`);
      targetUser.balance += amount;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
      return ctx.reply(`✅ Added ₹${amount} to ${targetId}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    // ➖ Remove Balance
    if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(/\s+/);
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User ${targetId} not found!`);
      targetUser.balance = Math.max(0, targetUser.balance - amount);
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
      return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    // 📉 Min withdraw
    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("min_withdraw", amt);
      return ctx.reply(`✅ Min withdraw set to ₹${amt}`);
    }

    // 📈 Max withdraw
    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("max_withdraw", amt);
      return ctx.reply(`✅ Max withdraw set to ₹${amt}`);
    }

    // 📢 Payout channel
    if (state === "WAITING_FOR_P_CHAN" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("payout_channel", text);
      return ctx.reply(`✅ Payout channel: ${text}`);
    }

    // 🔄 Reset balance
    if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      await User.findOneAndUpdate({ userId: targetId }, { balance: 0 });
      await logBalanceHistory(targetId, "Admin Reset Balance", 0);
      return ctx.reply(`✅ Balance reset for ${targetId}.`);
    }

    // 📢 Manage channels
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

    // 📋 Create task
    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
      let defaultAlertCh = await getConfig("default_task_alert_channel", "Not Set");
      await Task.create({ taskId: parts[0], title: parts[1], reward: parseFloat(parts[2]), link: parts[3], alertChannel: defaultAlertCh });
      return ctx.reply(`✅ Task '${parts[1]}' created!`);
    }

    // 🎁 Create gift code (legacy)
    if (state === "WAITING_FOR_GIFT_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(/\s+/);
      if (parts.length < 3) return ctx.reply("❌ Use: CODE Amount MaxUses");
      await GiftCode.create({ code: parts[0], amount: parseFloat(parts[1]), maxUses: parseInt(parts[2], 10), type: "redeem" });
      return ctx.reply(`✅ Gift Code '${parts[0]}' created!`);
    }

    // 📢 Broadcast
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      let count = 0, failed = 0;
      for (let u of allUsers) {
        try {
          await ctx.api.sendMessage(u.userId, text);
          count++;
          await new Promise(r => setTimeout(r, 50));
        } catch (e) { failed++; }
      }
      return ctx.reply(`✅ Broadcast Report\n\n✅ Sent: ${count}\n❌ Failed: ${failed}`);
    }

    // 👥 Manage admins
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

    // 👑 Transfer ownership
    if (state === "WAITING_FOR_NEW_OWNER") {
      delete userState[userId];
      let newOwnerId = parseInt(text, 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
      await setConfig("owner_id", newOwnerId);
      return ctx.reply(`👑 Ownership transferred to ${newOwnerId}!`);
    }

    // 💳 SET PAYMENT METHODS
    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
      return ctx.reply(
        `✅ *Wallet ID Updated Successfully!*\n\n🌐 *Your Wallet ID:* \`${text.trim()}\``,
        { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
      );
    }

    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(
        `✅ *UPI Updated Successfully!*\n\n⚡ *Your UPI:* \`${text.trim()}\``,
        { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
      );
    }

    // 🏦 Bank step 1 → step 2
    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid Account Number! Try again.");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(
        `🏦 *Send Your IFSC Code*`,
        { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() }
      );
    }

    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      if (!text.trim()) return ctx.reply("❌ Invalid IFSC Code! Try again.");
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim() });
      return ctx.reply(
        `✅ *Bank Details Updated Successfully!*\n\n🏦 *Account Number:* \`${accNo}\`\n🔢 *IFSC Code:* \`${text.trim()}\``,
        { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
      );
    }

    if (state === "SET_AMAZON_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text.trim() });
      return ctx.reply(
        `✅ *Email Address Updated Successfully!*\n\n📧 *Your Email:* \`${text.trim()}\``,
        { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
      );
    }

    if (state === "SET_REDEEM_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text.trim() });
      return ctx.reply(
        `✅ *Redeem Code Updated Successfully!*\n\n🎁 *Your Redeem Code:* \`${text.trim()}\``,
        { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
      );
    }

    // 🚀 WITHDRAW amount for Wallet/UPI/Bank
    if (state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 1);
      let maxW = await getConfig("max_withdraw", 100);
      if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
        return ctx.reply(`❌ Invalid! Min ₹${minW} | Max ₹${maxW}`);
      }
      if (user.balance < amount) return ctx.reply("❌ Insufficient balance!");

      let details = "";
      if (method === "Wallet") details = user.walletAccount;
      else if (method === "UPI") details = user.upiId;
      else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
      else if (method === "Amazon") details = user.amazonEmail;
      else if (method === "Redeem Code") details = user.redeemCodeAddr;

      let confirmMsg = `📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: ${details}\nAmount: ₹${amount}\n\nConfirm?`;
      let safeMethod = method.replace(/ /g, "_");
      let kb = new InlineKeyboard().text("✅ Confirm", `conf_wd_${safeMethod}_${amount}`).text("❌ Cancel", "canc_wd");
      return ctx.reply(confirmMsg, { reply_markup: kb, parse_mode: "Markdown" });
    }

    // ⚡ P2P (Quick Pay)
    if (state === "WAITING_FOR_P2P") {
      delete userState[userId];
      let sender = await getUser(userId);
      let parts = text.trim().split(/\s+/);
      if (parts.length !== 2) {
        return ctx.reply(
          "❌ *Invalid Format!*\n\n✅ *Correct Format:*\n`UserID Amount`\n\n📌 *Example:*\n`8061612320 50`",
          { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
        );
      }
      let targetId = parseInt(parts[0].trim(), 10);
      let amount = parseFloat(parts[1].trim());

      if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Invalid User ID or Amount!");
      }
      if (sender.balance < amount) {
        return ctx.reply(`❌ Insufficient Balance!\n💵 Your Balance: ₹${sender.balance.toFixed(2)}`);
      }
      if (targetId === sender.userId) return ctx.reply("❌ Cannot send to yourself!");

      let receiver = await User.findOne({ userId: targetId });
      if (!receiver) return ctx.reply(`❌ User \`${targetId}\` not found!`, { parse_mode: "Markdown" });

      sender.balance -= amount;
      await sender.save();
      receiver.balance += amount;
      await receiver.save();

      await logBalanceHistory(sender.userId, `P2P Sent to ${receiver.userId}`, -amount);
      await logBalanceHistory(receiver.userId, `P2P Received from ${sender.userId}`, amount);

      let senderMsg =
        `✅ *Payment Successful!*\n\n━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Sent To:* ${receiver.firstName || "User"}\n` +
        `🆔 *User ID:* \`${receiver.userId}\`\n` +
        `💰 *Amount:* ₹${amount.toFixed(2)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n💵 *Your New Balance:* ₹${sender.balance.toFixed(2)}`;
      await ctx.reply(senderMsg, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });

      let receiverMsg =
        `🎉 *Payment Received!*\n\n━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *From:* ${sender.firstName || "User"}\n` +
        `🆔 *User ID:* \`${sender.userId}\`\n` +
        `💰 *Amount:* ₹${amount.toFixed(2)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n💵 *Your New Balance:* ₹${receiver.balance.toFixed(2)}`;
      try { await ctx.api.sendMessage(receiver.userId, receiverMsg, { parse_mode: "Markdown" }); } catch (e) {}
      return;
    }

    // 🎁 Gift redeem
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOneAndUpdate(
        { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
        { $push: { usedUsers: userId } },
        { new: true }
      );
      if (!gift) return ctx.reply("🚫 Invalid or expired gift code!");
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Gift redeemed! Added ₹${gift.amount}.`);
    }

    // 📧 Amazon codes (admin)
    if (state === "WAITING_AMAZON_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      await saveCodes(text, "amazon", ctx);
      return;
    }

    // 🎁 Redeem codes (admin)
    if (state === "WAITING_REDEEM_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      await saveCodes(text, "redeem", ctx);
      return;
    }
  }

  // ============================================================
  // 🔀 NORMAL BUTTON MENU ROUTING
  // ============================================================
  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayout();
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  // 💸 MY BALANCE
  if (matchedKey === "btn_balance") {
    let msg =
      `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
      `🔵 Wallet ID ➝ \`${userId}\`\n` +
      `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
      `Built with security you can Trust.\nSupport that responds promptly.`;
    let kb = new InlineKeyboard()
      .text("📊 Balance Statement", "balance_statement")
      .text("💬 Customer Support", "customer_support").row()
      .text("🔄 Refresh", "refresh_balance_only")
      .text("💰 Live Fund", "live_fund");
    return ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
  }

  // 📋 BOT TASK
  else if (matchedKey === "btn_tasks") {
    let tasks = await Task.find({});
    if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available.");
    let kb = new InlineKeyboard();
    tasks.forEach(t => { kb.text(`📌 ${t.title} (₹${t.reward})`, `do_task_${t.taskId}`).row(); });
    return ctx.reply("📋 *Available Tasks:*\n\nTap to view details.", { reply_markup: kb, parse_mode: "Markdown" });
  }

  // 🎁 GIFT CODE
  else if (matchedKey === "btn_gift") {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code To Claim Reward!");
  }

  // ⚡ QUICK PAY (P2P)
  else if (matchedKey === "btn_quickpay") {
    userState[userId] = "WAITING_FOR_P2P";
    let msg = `💸 *Quick Pay*\n\n📝 Format:\n\`UserID Amount\`\n\n📌 Example:\n\`8061612320 50\``;
    let kb = new InlineKeyboard().text("👥 Select User", "p2p_select_user");
    return ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
  }

  // 💳 PAYMENT METHOD
  else if (matchedKey === "btn_payout") {
    let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `\`${val}\`` : `\`Not Set\``;
    let walletVal = fmt(user.walletAccount);
    let upiVal = fmt(user.upiId);
    let bankVal = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : `\`Not Set\``;

    let msg =
      `✨ *Choose Desired Payment Method From Below 👇*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👛 *Your Current Wallet* - ${walletVal}\n\n` +
      `⚡ *Your Current UPI* - ${upiVal}\n\n` +
      `🏦 *Your Current Bank* - ${bankVal}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    let kb = new InlineKeyboard()
      .text("🌐 Wallet", "set_wallet")
      .text("⚡ UPI", "set_upi").row()
      .text("🏦 Bank", "set_bank");

    return ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
  }

  // 🚀 WITHDRAW
  else if (matchedKey === "btn_withdraw") {
    let msg = `✨ *Choose Your Withdraw Method:*`;
    let kb = new InlineKeyboard()
      .text("🌐 Wallet", "wd_wallet")
      .text("⚡ UPI", "wd_upi").row()
      .text("🏦 Bank", "wd_bank")
      .text("🎁 Redeem Code", "wd_redeem").row()
      .text("📧 Amazon", "wd_amazon");
    return ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
  }

  // 🎁 Fallback — gift code attempt
  else {
    let gift = await GiftCode.findOneAndUpdate(
      { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } },
      { new: true }
    );
    if (gift) {
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Added ₹${gift.amount}!`);
    }
    return next();
  }
});

// ============================================================
// 📸 PHOTO HANDLER — Task Proof
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
    taskId: task.taskId, taskTitle: task.title,
    reward: task.reward, photoFileId: photo.file_id, status: "Pending"
  });

  delete userState[userId];

  await ctx.reply(
    `⏳ *Please wait...*\n\n📸 Your proof has been submitted!\n📌 Task: *${task.title}*\n💰 Reward: *₹${task.reward}*\n\n🕐 Admin will verify shortly.`,
    { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
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
      `📅 Date: ${new Date().toLocaleString('en-IN')}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `task_app_${submissionId}`)
      .text("❌ Reject", `task_rej_${submissionId}`);
    try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
  }
});

// ============================================================
// 📋 TASK — Show details + Ask for screenshot
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
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📸 *How to complete:*\n\n` +
    `1️⃣ Click the link below\n` +
    `2️⃣ Take a screenshot as proof\n` +
    `3️⃣ Send the *last screenshot* here\n\n` +
    `⏳ Admin will verify and credit ₹${task.reward}`;

  let inlineKb = new InlineKeyboard()
    .url("🔗 Open Task Link", task.link).row()
    .text("❌ Cancel Task", `cancel_task_${taskId}`);

  await ctx.reply(detailsMsg, { parse_mode: "Markdown", reply_markup: inlineKb });
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
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildKeyboardFromLayout() });
});

// ============================================================
// 📊 BALANCE — Statement / Refresh / Live Fund / Support
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery("🔄 Balance Refreshed!");
  let msg =
    `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
    `🔵 Wallet ID ➝ \`${ctx.from.id}\`\n` +
    `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
    `Built with security you can Trust.\nSupport that responds promptly.`;
  let kb = new InlineKeyboard()
    .text("📊 Balance Statement", "balance_statement")
    .text("💬 Customer Support", "customer_support").row()
    .text("🔄 Refresh", "refresh_balance_only")
    .text("💰 Live Fund", "live_fund");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30);
  let user = await getUser(userId);
  let msg = `📊 *Balance Statement*\n\n🆔 User ID: \`${userId}\`\n💰 Current Balance: *₹${user.balance.toFixed(2)}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (history.length === 0) msg += `📭 No transactions found.\n\nStart earning with tasks!`;
  else {
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
  let kb = new InlineKeyboard().text("🔄 Refresh", "balance_statement").row().text("🔙 Back", "back_to_balance");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery();
  let msg =
    `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n` +
    `🔵 Wallet ID ➝ \`${ctx.from.id}\`\n` +
    `🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\n` +
    `Built with security you can Trust.\nSupport that responds promptly.`;
  let kb = new InlineKeyboard()
    .text("📊 Balance Statement", "balance_statement")
    .text("💬 Customer Support", "customer_support").row()
    .text("🔄 Refresh", "refresh_balance_only")
    .text("💰 Live Fund", "live_fund");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("customer_support", async (ctx) => {
  await ctx.answerCallbackQuery();
  let supportId = await getConfig("support_username", null);
  if (!supportId || supportId === "Not Set" || supportId === "") {
    return ctx.reply(`💬 *Customer Support*\n\n⚠️ Support contact not set yet.`, { parse_mode: "Markdown" });
  }
  let link = /^\d+$/.test(supportId) ? `tg://user?id=${supportId}` : `https://t.me/${supportId.replace('@', '')}`;
  let kb = new InlineKeyboard().url("💬 Contact Support", link);
  await ctx.reply(`💬 *Customer Support*\n\nClick below to contact our support team.\n\n🕐 We usually respond within a few minutes.`, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading...");
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });
  let msg =
    `💰 *Live Fund Report*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 *Total Users:* \`${users.length}\`\n` +
    `💵 *Total Balance:* \`₹${totalBalance.toFixed(2)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🕐 ${new Date().toLocaleString('en-IN')}\n\n_Live balance — auto updated_`;
  let kb = new InlineKeyboard().text("🔄 Refresh Live Fund", "live_fund").row().text("🔙 Back to Balance", "back_to_balance");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ⚡ P2P SELECT USER
// ============================================================
bot.callbackQuery("p2p_select_user", async (ctx) => {
  await ctx.answerCallbackQuery();
  let users = await User.find({ userId: { $ne: ctx.from.id } }).limit(10);
  if (users.length === 0) return ctx.reply("❌ No users found!");
  let kb = new InlineKeyboard();
  users.forEach(u => { kb.text(`${u.firstName || "User"} (ID: ${u.userId})`, `p2p_target_${u.userId}`).row(); });
  await ctx.reply("👥 Select user:", { reply_markup: kb });
});

bot.callbackQuery(/^p2p_target_/, async (ctx) => {
  let targetId = ctx.callbackQuery.data.replace("p2p_target_", "");
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_P2P";
  await ctx.reply(`💡 User ID: ${targetId}\n\nSend: \`${targetId} Amount\``, { parse_mode: "Markdown" });
});

// ============================================================
// 💳 SET PAYMENT METHODS — Button handlers
// ============================================================
bot.callbackQuery("set_wallet", async (ctx) => {
  userState[ctx.from.id] = "SET_WALLET_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`🌐 *Send Your Wallet ID*`, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel").resized()
  });
});

bot.callbackQuery("set_upi", async (ctx) => {
  userState[ctx.from.id] = "SET_UPI_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`⚡ *Send Your UPI Address*`, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel").resized()
  });
});

bot.callbackQuery("set_bank", async (ctx) => {
  userState[ctx.from.id] = "SET_BANK_ACCNO";
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 *Send Your Account Number*`, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel").resized()
  });
});

bot.callbackQuery("set_amazon", async (ctx) => {
  userState[ctx.from.id] = "SET_AMAZON_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`📧 *Enter Your Email Address*`, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel").resized()
  });
});

bot.callbackQuery("set_redeem", async (ctx) => {
  userState[ctx.from.id] = "SET_REDEEM_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`🎁 *Enter Your Redeem Code*`, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text("❌ Cancel").resized()
  });
});

// ============================================================
// 🚀 WITHDRAW METHOD HANDLERS
// ============================================================
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
bot.callbackQuery("wd_amazon", async (ctx) => { await handleRedeemWithdraw(ctx, "amazon"); });
bot.callbackQuery("wd_redeem", async (ctx) => { await handleRedeemWithdraw(ctx, "redeem"); });

// ============================================================
// 🎁 REDEEM / AMAZON WITHDRAW (Auto vs Manual)
// ============================================================
async function handleRedeemWithdraw(ctx, type) {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let mode = await getConfig(type === "amazon" ? "amazon_mode" : "redeem_mode", "manual");
  let icon = type === "amazon" ? "📧" : "🎁";
  let name = type === "amazon" ? "Amazon Gift Code" : "Redeem Code";

  // Amount selection (fixed buttons)
  let amounts = [10, 50, 100, 200, 500];

  let kb = new InlineKeyboard();
  for (let i = 0; i < amounts.length; i += 3) {
    let row = amounts.slice(i, i + 3);
    row.forEach(a => { kb = kb.text(`₹${a}`, `rdm_amt_${type}_${a}`); });
    kb = kb.row();
  }
  kb = kb.text("🔙 Cancel", "canc_rdm");

  await ctx.answerCallbackQuery();
  await ctx.reply(
    `${icon} *${name}*\n\n💰 Your Balance: ₹${user.balance.toFixed(2)}\n\n👇 Choose amount:`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

bot.callbackQuery(/^rdm_amt_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("rdm_amt_", "").split("_");
  let type = parts[0]; // "amazon" | "redeem"
  let amount = parseFloat(parts[1]);
  let userId = ctx.from.id;
  let user = await getUser(userId);

  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient balance!", show_alert: true });

  let mode = await getConfig(type === "amazon" ? "amazon_mode" : "redeem_mode", "manual");
  let icon = type === "amazon" ? "📧" : "🎁";
  let name = type === "amazon" ? "Amazon Gift Code" : "Redeem Code";

  // Check if user has email/redeem address set
  if (type === "amazon" && (!user.amazonEmail || user.amazonEmail === "Not Set")) {
    return ctx.answerCallbackQuery({ text: "⚠️ Set your Amazon email first!", show_alert: true });
  }
  if (type === "redeem" && (!user.redeemCodeAddr || user.redeemCodeAddr === "Not Set")) {
    return ctx.answerCallbackQuery({ text: "⚠️ Set your Redeem Code first!", show_alert: true });
  }

  await ctx.answerCallbackQuery();

  // ============ AUTO MODE ============
  if (mode === "auto") {
    let gift = await GiftCode.findOneAndUpdate(
      { type, amount, usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!gift) {
      await ctx.editMessageText(`❌ *No codes available right now!*\n\nPlease wait or contact support.`, { parse_mode: "Markdown" });
      return;
    }

    user.balance -= amount;
    await user.save();
    await logBalanceHistory(userId, `${name} Auto Code (${gift.code})`, -amount);

    // Success message with copyable code
    await ctx.editMessageText(
      `✅ *${name} Assigned!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *Code:* \`${gift.code}\`\n` +
      `💰 *Amount:* ₹${gift.amount}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👆 *Double-tap the code to copy!*\n\n` +
      `💵 *New Balance:* ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
    );

    // Send proof to payout channel (partial hidden)
    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      let hiddenCode = gift.code.length > 8
        ? `${gift.code.substring(0, 4)}****${gift.code.substring(gift.code.length - 4)}`
        : `${gift.code.substring(0, 2)}****`;
      let proofMsg =
        `🔔 *${name} Sent (AUTO)*\n\n` +
        `👤 User: ${user.firstName || "User"}\n` +
        `🆔 ID: \`${user.userId}\`\n` +
        `💰 Amount: ₹${amount}\n` +
        `🎁 Code: \`${hiddenCode}\`\n` +
        `📅 ${new Date().toLocaleString('en-IN')}`;
      try { await ctx.api.sendMessage(payoutChannel, proofMsg, { parse_mode: "Markdown" }); } catch (e) {}
    }
    return;
  }

  // ============ MANUAL MODE ============
  let requestId = Math.floor(100000 + Math.random() * 900000).toString();

  await RedeemRequest.create({
    requestId,
    userId,
    userName: user.firstName || "User",
    userEmail: type === "amazon" ? user.amazonEmail : user.redeemCodeAddr,
    amount,
    type,
    status: "Pending"
  });

  await ctx.editMessageText(
    `⏳ *Request Submitted!*\n\n` +
    `📌 ${name}\n` +
    `💰 Amount: ₹${amount}\n` +
    `🆔 Request ID: \`${requestId}\`\n\n` +
    `👉 Admin will approve & send your code shortly.`,
    { parse_mode: "Markdown" }
  );

  // Send to payout channel
  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    let msg =
      `🔔 *${name} Request*\n\n` +
      `👤 User: ${user.firstName || "User"}\n` +
      `🆔 ID: \`${user.userId}\`\n` +
      `💰 Amount: ₹${amount}\n` +
      `${type === "amazon" ? "📧" : "🎁"} Details: \`${type === "amazon" ? user.amazonEmail : user.redeemCodeAddr}\`\n` +
      `📅 ${new Date().toLocaleString('en-IN')}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `rdm_app_${requestId}`)
      .text("❌ Reject", `rdm_rej_${requestId}`);
    try { await ctx.api.sendMessage(payoutChannel, msg, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
  }
});

bot.callbackQuery("canc_rdm", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled." });
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🎁 MANUAL MODE — Admin Approve / Reject
// ============================================================
bot.callbackQuery(/^rdm_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_app_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });

  // Ask admin for code
  userState[ctx.from.id] = `WAITING_RDM_CODE_${reqId}`;
  await ctx.answerCallbackQuery({ text: "Send the code" });

  let icon = req.type === "amazon" ? "📧" : "🎁";
  await ctx.reply(
    `📝 *Send the code for user:*\n\n` +
    `🆔 User ID: \`${req.userId}\`\n` +
    `💰 Amount: ₹${req.amount}\n` +
    `${icon} Type: ${req.type}\n\n` +
    `👉 *Send the code now:*\n` +
    `_(Or send /skip to use available code automatically)_`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `rdm_rej_${reqId}`) }
  );
});

bot.callbackQuery(/^rdm_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_rej_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });

  req.status = "Rejected";
  await req.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ *REJECTED*`).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Request Rejected*\n\n🆔 Request: \`${req.requestId}\`\n💰 Amount: ₹${req.amount}\n\nPlease contact support for help.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {}
});

// ============================================================
// 🏧 WITHDRAWAL CONFIRM (Wallet/UPI/Bank)
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

  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  await Withdrawal.create({ withdrawalId, userId, amount, method, details });

  await ctx.answerCallbackQuery({ text: "Submitted!" });
  await ctx.editMessageText(`✅ Withdrawal of ₹${amount} via ${method} submitted!\nRequest ID: #${withdrawalId}\nStatus: Pending.`);

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    let adminKb = new InlineKeyboard().text("✅ Approve", `wd_app_${withdrawalId}`).text("❌ Reject", `wd_rej_${withdrawalId}`);
    try {
      await ctx.api.sendMessage(payoutChannel, `🔔 Withdrawal #${withdrawalId}\n\n👤 ${userId}\n💰 ₹${amount}\n💳 ${method}\n📋 ${details}`, { reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled." });
  await ctx.editMessageText("❌ Withdrawal cancelled.").catch(() => {});
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
      reply_markup: new InlineKeyboard().url("🚀 Check Status", `${serverUrl}/receipt/${wd.withdrawalId}`)
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
// 📋 TASK APPROVAL
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
  await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });
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
bot.callbackQuery("adm_set_support", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let currentSupport = await getConfig("support_username", "Not Set");
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `💬 *Set Customer Support*\n\nCurrent: \`${currentSupport}\`\n\nSend:\n• Username (e.g. \`@MySupport\`)\n• Or User ID (e.g. \`8061612320\`)`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

// ============================================================
// 📊 ALL USERS BALANCE LIST
// ============================================================
bot.callbackQuery("adm_all_balances", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) return ctx.reply("📊 No users found.", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });

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
// 🚀 FINAL START
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Connected!");
    bot.start({ onStart: (info) => console.log(`🚀 Bot @${info.username} running!`) });
  })
  .catch((err) => console.error("❌ DB Error:", err));
