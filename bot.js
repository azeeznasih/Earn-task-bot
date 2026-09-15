// ============================================================
// 🤖 TELEGRAM PAYMENT TASK BOT + MINI APP — FULL FIXED VERSION
// grammy ^1.35.1 | mongoose ^8.13.0 | express ^4.21.2
// ============================================================
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ============================================================
// ⚡ CACHE
// ============================================================
const cache = {
  config: {},
  layout: null,
  admins: [],
  adminsTime: 0,
  ownerId: null
};

// ============================================================
// 🌐 EXPRESS
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/miniapp", express.static(path.join(__dirname, "public")));

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ============================================================
// 🗄️ EARLY SCHEMAS (for receipt)
// ============================================================
const withdrawalSchema = new mongoose.Schema({
  withdrawalId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userWithdrawalCount: { type: Number, default: 1 },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, required: true },
  details: { type: String, required: true },
  status: { type: String, default: "Pending" },
  gateway: { type: String, default: "" },
  txnNumber: { type: String, default: "" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
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
  try { await BalanceHistory.create({ userId, action, amount }); } catch (e) { console.error("logBalanceHistory:", e.message); }
}

const addFundSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  amount: { type: Number, required: true },
  method: { type: String, default: "UPI" },
  methodKey: { type: String, default: "" },
  proofFileId: { type: String, default: "" },
  status: { type: String, default: "Pending" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AddFund = mongoose.models.AddFund || mongoose.model("AddFund", addFundSchema);

// ============================================================
// 🧾 RECEIPT PAGE
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

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt - #${escapeHtml(wd.withdrawalId)}</title>
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
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${escapeHtml(wd.method.toUpperCase())} / ${escapeHtml(wd.details)}</span></div>
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value">TXN${escapeHtml(wd.withdrawalId)}</span></div>
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
  code: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, default: "redeem" },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] },
  notificationEnabled: { type: Boolean, default: true },
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

const redeemRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  status: { type: String, default: "Pending" },
  assignedCode: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  inviteLink: { type: String, required: true },
  displayName: { type: String, default: "" },
  subscriberCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  addedAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const verificationSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  deviceHash: { type: String, default: "" },
  verified: { type: Boolean, default: false },
  reason: { type: String, default: "" },
  verifiedAt: { type: Date, default: null }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);
const GiftCode = mongoose.models.GiftCode || mongoose.model("GiftCode", giftCodeSchema);
const TaskSubmission = mongoose.models.TaskSubmission || mongoose.model("TaskSubmission", taskSubmissionSchema);
const RedeemRequest = mongoose.models.RedeemRequest || mongoose.model("RedeemRequest", redeemRequestSchema);
const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);
const Config = mongoose.models.Config || mongoose.model("Config", configSchema);
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);
const Verification = mongoose.models.Verification || mongoose.model("Verification", verificationSchema);

// ============================================================
// 🔧 HELPERS
// ============================================================
async function getConfig(key, defaultValue) {
  if (cache.config[key] !== undefined) return cache.config[key];
  let conf = await Config.findOne({ key });
  let value = conf ? conf.value : defaultValue;
  cache.config[key] = value;
  return value;
}
async function setConfig(key, value) {
  cache.config[key] = value;
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}
async function isAdmin(userId) {
  try {
    if (Number(userId) === Number(MAIN_OWNER_ID)) return true;
    let now = Date.now();
    if (!cache.admins || (now - cache.adminsTime) > 30000) {
      cache.admins = await getConfig("admins", []);
      cache.ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
      cache.adminsTime = now;
    }
    if (Number(userId) === Number(cache.ownerId)) return true;
    if (Array.isArray(cache.admins) && cache.admins.some(id => Number(id) === Number(userId))) return true;
    return false;
  } catch (e) { return false; }
}
async function isOwner(userId) {
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  return Number(userId) === Number(ownerId) || Number(userId) === Number(MAIN_OWNER_ID);
}
async function getUser(userId) {
  return await User.findOneAndUpdate(
    { userId },
    { $setOnInsert: { walletId: userId.toString() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
async function checkForceJoin(ctx) {
  let channels = await Channel.find({ isActive: true });
  if (!channels || channels.length === 0) return true;
  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch.channelId, ctx.from.id);
      if (["left", "kicked", "restricted"].includes(member.status)) return false;
    } catch (e) { }
  }
  return true;
}
function generateTrackerText(targetUser) {
  let linkedWalletInfo = targetUser.walletAccount !== "Not Set" ? targetUser.walletAccount :
                         (targetUser.upiId !== "Not Set" ? targetUser.upiId :
                         (targetUser.bankAccNo !== "Not Set" ? `${targetUser.bankAccNo} (${targetUser.bankIfsc})` :
                         (targetUser.amazonEmail !== "Not Set" ? targetUser.amazonEmail :
                         (targetUser.redeemCodeAddr !== "Not Set" ? targetUser.redeemCodeAddr : "Not Linked"))));
  return `🙇‍♂️ Uꜱᴇʀ Dᴇᴛᴀɪʟꜱ\n\n` +
         `🚻 Usᴇʀ : ${targetUser.firstName || "Unknown"}\n` +
         `🆔 Usᴇʀ ID : ${targetUser.userId}\n` +
         `💵 Bᴀʟᴀɴᴄᴇ : ₹${targetUser.balance.toFixed(2)}\n` +
         `🏧 Wɪᴛʜᴅʀᴀᴡɴ : ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}\n` +
         `🎴 Lɪɴᴋᴇᴅ : ${linkedWalletInfo}\n` +
         `👩‍💻 Rᴇғᴇʀʀᴇᴅ Bʏ : ${targetUser.referredBy || "Aᴜᴛᴏ"}`;
}

// 🎭 Mask Functions
function maskUPI(upi) {
  if (!upi || upi === "Not Set") return upi;
  let str = String(upi);
  let parts = str.split('@');
  if (parts.length !== 2) return str.length > 4 ? str.substring(0, 4) + '****' : str.substring(0, 2) + '****';
  let name = parts[0], domain = parts[1];
  let maskedName = name.length > 3 ? name.substring(0, 3) + '****' : name.substring(0, 1) + '****';
  let maskedDomain = domain.length > 3 ? domain.substring(0, 3) + '***' : '***';
  return maskedName + '@' + maskedDomain;
}
function maskWallet(wallet) {
  if (!wallet || wallet === "Not Set") return wallet;
  let str = String(wallet);
  if (str.length <= 4) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 2);
}
function maskBank(accNo, ifsc) {
  if (!accNo || accNo === "Not Set") return accNo;
  let str = String(accNo);
  let maskedAcc = str.length > 8 ? str.substring(0, 4) + '****' + str.substring(str.length - 4) : '****' + str.substring(str.length - 2);
  let maskedIfsc = ifsc;
  if (ifsc && ifsc !== "Not Set") {
    let ifscStr = String(ifsc);
    maskedIfsc = ifscStr.length > 6 ? ifscStr.substring(0, 4) + '****' + ifscStr.substring(ifscStr.length - 3) : '****';
  }
  return `${maskedAcc} (${maskedIfsc})`;
}
function maskEmail(email) {
  if (!email || email === "Not Set") return email;
  let parts = String(email).split('@');
  if (parts.length !== 2) return '****';
  let name = parts[0], domain = parts[1];
  let maskedName = name.length > 4 ? name.substring(0, 4) + '****' : name.substring(0, 2) + '****';
  let maskedDomain = domain.length > 5 ? domain.substring(0, 3) + '***' : '***';
  return maskedName + '@' + maskedDomain;
}
function maskRedeem(code) {
  if (!code || code === "Not Set") return code;
  let str = String(code);
  if (str.length <= 6) return str.substring(0, 2) + '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 3);
}
function maskDetails(method, details) {
  if (method === "UPI") return maskUPI(details);
  if (method === "Wallet") return maskWallet(details);
  if (method === "Bank") {
    let parts = String(details).split(',').map(s => s.trim());
    return maskBank(parts[0], parts[1]);
  }
  if (method === "Amazon") return maskEmail(details);
  if (method === "Redeem") return maskRedeem(details);
  return maskUPI(details);
}

function generateTxnNumber() {
  let num = '';
  for (let i = 0; i < 20; i++) num += Math.floor(Math.random() * 10);
  return num;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function buildGatewayUrl(template, data) {
  return String(template)
    .replace(/{upi}/g, encodeURIComponent(data.upi || ''))
    .replace(/{amount}/g, encodeURIComponent(data.amount || ''))
    .replace(/{comment}/g, encodeURIComponent(data.comment || ''))
    .replace(/{userId}/g, encodeURIComponent(data.userId || ''))
    .replace(/{orderId}/g, encodeURIComponent(data.orderId || ''));
}

function calculateTax(amount) {
  let taxPercent = 0;
  let tax = (amount * taxPercent) / 100;
  return { tax, afterTax: amount - tax };
}

async function callGatewayApi(gateway, data) {
  try {
    const url = buildGatewayUrl(gateway.url, data);
    console.log("🌐 Gateway:", url);
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (json && (json.status === 'success' || json.success === true || json.status === 'Success')) {
      return { success: true, data: json };
    }
    return { success: false, error: (json && json.message) || text || "API failed" };
  } catch (e) { return { success: false, error: e.message }; }
}

// ============================================================
// 📝 DEFAULT TEXTS (hardcoded — no editing)
// ============================================================
const DEFAULT_TEXTS = {
  start_welcome: "💫 <b>Welcome To Task Payment Bot!</b>\n\nTo Know How To Earn → <a href=\"https://t.me/yourchannel\">CLICK HERE</a>",
  balance_title: "<blockquote>⭐ <b>Welcome To Bot!</b> ❞</blockquote>",
  balance_body: "🔵 <b>Wallet ID:</b> <code>{userId}</code>\n🧾 <b>Balance:</b> <b>₹{balance}</b>",
  balance_footer: "<blockquote><i>Built with security you can Trust.</i></blockquote>",
  cancel_text: "❌ Cancelled.",
  back_text: "🏠 Main Menu"
};

// Simple getter — no DB, no editing
function getText(key, defaultText) {
  return DEFAULT_TEXTS[key] || defaultText;
}

// 🔤 Small Caps
function toSmallCaps(text) {
  const map = {
    'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ',
    'j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ',
    's':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'
  };
  return String(text).split('').map(c => map[c.toLowerCase()] || c).join('');
}

// 💰 Add Fund Methods
async function getAddFundMethods() {
  let methods = await getConfig("add_fund_methods", []);
  if (!Array.isArray(methods)) methods = [];
  return methods;
}
async function saveAddFundMethods(methods) {
  await setConfig("add_fund_methods", methods);
}
async function getMethodByKey(key) {
  let methods = await getAddFundMethods();
  return methods.find(m => m.key === key);
}
async function addMethod(method) {
  let methods = await getAddFundMethods();
  methods.push(method);
  await saveAddFundMethods(methods);
}
async function updateMethod(key, updates) {
  let methods = await getAddFundMethods();
  let idx = methods.findIndex(m => m.key === key);
  if (idx === -1) return false;
  methods[idx] = { ...methods[idx], ...updates };
  await saveAddFundMethods(methods);
  return true;
}
async function deleteMethod(key) {
  let methods = await getAddFundMethods();
  methods = methods.filter(m => m.key !== key);
  await saveAddFundMethods(methods);
}

// ============================================================
// 🎨 STYLE COLORS (emoji only — for reference in admin UI)
// ============================================================
const STYLE_COLORS = {
  primary: { label: "Blue",  emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger:  { label: "Red",   emoji: "🔴" },
  white:   { label: "White", emoji: "⚪" }
};

const INLINE_STYLE_COLORS = {
  primary: { label: "Blue",  emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger:  { label: "Red",   emoji: "🔴" },
  white:   { label: "White", emoji: "⚪" }
};

// ============================================================
// 🎨 KEYBOARD
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
  if (cache.layout) return cache.layout;
  let layout = await getConfig("keyboard_layout", null);
  if (!layout || !Array.isArray(layout) || layout.length === 0) {
    layout = JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT));
    await setConfig("keyboard_layout", layout);
  }
  cache.layout = layout;
  return layout;
}

async function buildKeyboardFromLayout() {
  let layout = await getCurrentKeyboardLayout();
  let keyboardRows = [];
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      // ✅ ReplyKeyboardButton — only "text" field allowed
      let row = rowButtons.map(btn => ({ text: btn.name }));
      keyboardRows.push(row);
    }
  }
  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    is_persistent: false,
    one_time_keyboard: false
  };
}

// ✅ FIXED: Only valid Telegram InlineKeyboard fields
async function buildStyledKb(buttons) {
  let styleMap = await getConfig("inline_button_styles", {});
  let names = await getConfig("inline_button_names", {});

  let styled = buttons.map(row =>
    row.map(btn => {
      let newBtn = { text: btn.text };
      if (btn.callback_data) newBtn.callback_data = btn.callback_data;
      if (btn.url) newBtn.url = btn.url;
      if (btn.web_app) newBtn.web_app = btn.web_app;

      // Emoji prefix instead of unsupported "style" field
      if (btn.callback_data && styleMap[btn.callback_data]) {
        let colorKey = styleMap[btn.callback_data];
        if (colorKey !== "none" && INLINE_STYLE_COLORS[colorKey]) {
          newBtn.text = `${INLINE_STYLE_COLORS[colorKey].emoji} ${newBtn.text}`;
        }
      }

      // Custom button name override
      if (btn.callback_data && names[btn.callback_data]) {
        newBtn.text = names[btn.callback_data];
      }

      return newBtn;
    })
  );
  return { inline_keyboard: styled };
}

// ============================================================
// 🎯 MINI APP API ENDPOINTS
// ============================================================

app.get("/miniapp/api/user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, error: "User not found" });

    let linkedInfo = "Not Linked";
    if (user.walletAccount && user.walletAccount !== "Not Set") linkedInfo = `Wallet: ${user.walletAccount}`;
    else if (user.upiId && user.upiId !== "Not Set") linkedInfo = `UPI: ${user.upiId}`;
    else if (user.bankAccNo && user.bankAccNo !== "Not Set") linkedInfo = `Bank: ${user.bankAccNo}`;

    res.json({
      success: true,
      user: {
        userId: user.userId,
        firstName: user.firstName,
        username: user.username,
        balance: user.balance,
        withdrawnTotal: user.withdrawnTotal,
        blockedRefs: user.blockedRefs,
        referredBy: user.referredBy,
        joined: user.createdAt,
        linkedInfo
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/profile-photo/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
    if (photos.total_count === 0) return res.json({ success: false });
    let fileId = photos.photos[0][0].file_id;
    let file = await bot.api.getFile(fileId);
    let photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    res.json({ success: true, photoUrl });
  } catch (e) { res.json({ success: false }); }
});

app.get("/miniapp/api/is-admin/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let isAdminUser = await isAdmin(userId);
    res.json({ success: true, isAdmin: isAdminUser });
  } catch (e) { res.json({ success: false, isAdmin: false }); }
});

app.get("/miniapp/api/payment-methods/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, error: "User not found" });

    const methods = [
      { name: "Wallet", icon: "👛", value: user.walletAccount || "Not Set" },
      { name: "UPI", icon: "⚡", value: user.upiId || "Not Set" },
      { name: "Bank", icon: "🏦", value: (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo} (${user.bankIfsc})` : "Not Set" },
      { name: "Amazon", icon: "📧", value: user.amazonEmail || "Not Set" },
      { name: "Redeem Code", icon: "🎁", value: user.redeemCodeAddr || "Not Set" }
    ];
    res.json({ success: true, methods });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({});
    res.json({ success: true, tasks });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/total-balance", async (req, res) => {
  try {
    const users = await User.find({});
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    res.json({ success: true, totalBalance, totalUsers: users.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/check-user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, error: "User not found" });

    let photoUrl = null;
    try {
      let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
      if (photos.total_count > 0) {
        let fileId = photos.photos[0][0].file_id;
        let file = await bot.api.getFile(fileId);
        photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      }
    } catch (e) {}

    res.json({
      success: true,
      user: { userId: user.userId, firstName: user.firstName, username: user.username, photoUrl }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/quick-pay", async (req, res) => {
  try {
    const { senderId, receiverId, amount } = req.body;
    const sId = parseInt(senderId, 10);
    const rId = parseInt(receiverId, 10);
    const amt = parseFloat(amount);

    if (sId === rId) return res.json({ success: false, error: "Cannot send to yourself!" });
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });

    const sender = await User.findOne({ userId: sId });
    const receiver = await User.findOne({ userId: rId });
    if (!sender) return res.json({ success: false, error: "Sender not found" });
    if (!receiver) return res.json({ success: false, error: "Receiver not found" });
    if (sender.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    sender.balance -= amt;
    receiver.balance += amt;
    await sender.save();
    await receiver.save();

    await logBalanceHistory(sId, `Quick Pay to ${rId}`, -amt);
    await logBalanceHistory(rId, `Quick Pay from ${sId}`, amt);

    try {
      await bot.api.sendMessage(rId,
        `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 Amount: ₹${amt.toFixed(2)}\n\n💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true, message: "Payment sent!" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/update-payment", async (req, res) => {
  try {
    const { userId, field, value } = req.body;
    const uid = parseInt(userId, 10);
    const allowed = ["walletAccount", "upiId", "bankAccNo", "bankIfsc", "amazonEmail", "redeemCodeAddr"];
    if (!allowed.includes(field)) return res.json({ success: false, error: "Invalid field" });

    const update = {};
    update[field] = value;
    await User.findOneAndUpdate({ userId: uid }, update);
    res.json({ success: true, message: "Updated!" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    const minW = await getConfig("min_withdraw", 1);
    const maxW = await getConfig("max_withdraw", 100);
    if (isNaN(amt) || amt < minW || amt > maxW) return res.json({ success: false, error: `Min ₹${minW} | Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    let details = "";
    if (method === "Wallet") details = user.walletAccount;
    else if (method === "UPI") details = user.upiId;
    else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
    else return res.json({ success: false, error: "Invalid method" });

    if (!details || details === "Not Set") return res.json({ success: false, error: `${method} not linked!` });

    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${method} (MiniApp)`, -amt);

    let prevCount = await Withdrawal.countDocuments({ userId: uid });
    let userWithdrawalCount = prevCount + 1;

    const withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
    await Withdrawal.create({
      withdrawalId, userId: uid, userWithdrawalCount,
      amount: amt, method, details
    });

    const payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      const adminKb = new InlineKeyboard()
        .text("✅ Approve", `wd_app_${withdrawalId}`)
        .text("❌ Reject", `wd_rej_${withdrawalId}`);

      let { tax, afterTax } = calculateTax(amt);

      try {
        await bot.api.sendMessage(payoutChannel,
          `⚠️ <b>New ${method.toUpperCase()} Payout Request!</b> (#${userWithdrawalCount})\n\n` +
          `<b>User :</b> <code>${uid}</code>\n` +
          `<b>Request Amount :</b> ₹${amt}\n` +
          `<b>Amount After Tax (${tax.toFixed(1)}) :</b> ₹${afterTax}\n` +
          `<b>${method} :</b> <code>${details}</code>`,
          { parse_mode: "HTML", reply_markup: adminKb });
      } catch (e) {}
    }

    res.json({ success: true, withdrawalId, message: `Withdrawal of ₹${amt} submitted!` });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/submit-task", async (req, res) => {
  try {
    const { userId, taskId, photoBase64 } = req.body;
    if (!userId || !taskId || !photoBase64) return res.json({ success: false, error: "Missing fields" });

    const uid = parseInt(userId, 10);
    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed!" });

    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await User.findOne({ userId: uid });
    const userName = user ? (user.firstName || "User") : "User";

    const alertChannel = (task.alertChannel && task.alertChannel !== "Not Set")
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);

    if (!alertChannel || alertChannel === "Not Set") {
      return res.json({ success: false, error: "Task alert channel not set." });
    }

    const caption =
      `📸 *New Task Submission (MiniApp)!*\n\n👤 ${userName}\n🆔 \`${uid}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n📅 ${new Date().toLocaleString('en-IN')}`;
    const kb = new InlineKeyboard()
      .text("✅ Approve", `task_app_${submissionId}`)
      .text("❌ Reject", `task_rej_${submissionId}`);

    let sentMsg;
    try {
      sentMsg = await bot.api.sendPhoto(alertChannel, new (require("grammy").InputFile)(buffer, "proof.jpg"), {
        caption, parse_mode: "Markdown", reply_markup: kb
      });
    } catch (e) {
      return res.json({ success: false, error: "Failed: " + e.message });
    }

    const photoFileId = sentMsg.photo[sentMsg.photo.length - 1].file_id;

    await TaskSubmission.create({
      submissionId, userId: uid, userName,
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId, status: "Pending"
    });

    res.json({ success: true, submissionId, message: "Screenshot submitted!" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/submit-refer", async (req, res) => {
  try {
    const { userId, taskId, referValue } = req.body;
    if (!userId || !taskId || !referValue) return res.json({ success: false, error: "Missing fields" });

    const uid = parseInt(userId, 10);
    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed!" });

    const submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await User.findOne({ userId: uid });
    const userName = user ? (user.firstName || "User") : "User";

    const alertChannel = (task.alertChannel && task.alertChannel !== "Not Set")
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);

    if (!alertChannel || alertChannel === "Not Set") {
      return res.json({ success: false, error: "Task alert channel not set." });
    }

    await TaskSubmission.create({
      submissionId, userId: uid, userName,
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward,
      photoFileId: `REFER: ${referValue}`,
      status: "Pending"
    });

    let caption =
      `📸 *Task Submission (Refer)*\n\n` +
      `👤 *${userName}*\n` +
      `🆔 \`${uid}\`\n` +
      `📌 *${task.title}*\n` +
      `💰 *₹${task.reward}*\n` +
      `🔗 \`${referValue}\`\n` +
      `📅 ${new Date().toLocaleString('en-IN')}`;

    let kb = new InlineKeyboard()
      .text("✅ Approve", `task_app_${submissionId}`)
      .text("❌ Reject", `task_rej_${submissionId}`);

    try {
      await bot.api.sendMessage(alertChannel, caption, { parse_mode: "Markdown", reply_markup: kb });
    } catch (e) {
      return res.json({ success: false, error: "Failed: " + e.message });
    }

    res.json({ success: true, submissionId, message: "Refer ID submitted!" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/verify/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, error: "User not found" });

    let verifyEnabled = await getConfig("verification_enabled", false);

    let verifyRec = await Verification.findOne({ userId });
    if (!verifyRec) verifyRec = await Verification.create({ userId, verified: false });

    let userPhotoUrl = null;
    try {
      let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
      if (photos.total_count > 0) {
        let fileId = photos.photos[0][0].file_id;
        let file = await bot.api.getFile(fileId);
        userPhotoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      }
    } catch (e) {}

    let botPhotoUrl = await getConfig("bot_photo_url", null);
    let botName = await getConfig("bot_name", "TASK EARN BOT");

    let verified = verifyRec.verified;
    let reason = verifyRec.reason || "";

    if (!verifyEnabled) { verified = true; reason = "Verification disabled"; }

    res.json({
      success: true, userId: user.userId, firstName: user.firstName, username: user.username,
      userPhotoUrl, botPhotoUrl, botName, verified, reason, verifyEnabled
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/verify/submit", async (req, res) => {
  try {
    const { userId, deviceHash } = req.body;
    const uid = parseInt(userId, 10);
    if (!uid || !deviceHash) return res.json({ success: false, error: "Missing fields" });

    let existingDevice = await Verification.findOne({ deviceHash, userId: { $ne: uid }, verified: true });

    let verifyRec = await Verification.findOne({ userId: uid });
    if (!verifyRec) verifyRec = await Verification.create({ userId: uid });

    if (existingDevice) {
      verifyRec.verified = false;
      verifyRec.reason = "This device has already been used by another account.";
      verifyRec.deviceHash = deviceHash;
      await verifyRec.save();
      return res.json({ success: false, verified: false, reason: "This device has already been used by another account." });
    }

    verifyRec.verified = true;
    verifyRec.reason = "";
    verifyRec.deviceHash = deviceHash;
    verifyRec.verifiedAt = new Date();
    await verifyRec.save();

    res.json({ success: true, verified: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/miniapp/task", (req, res) => res.sendFile(path.join(__dirname, "public", "task.html")));
app.get("/miniapp/pay", (req, res) => res.sendFile(path.join(__dirname, "public", "pay.html")));
app.get("/miniapp/profile", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/miniapp/verify", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/miniapp/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// ============================================================
// 🎨 CUSTOMIZE THEME
// ============================================================
async function getManageText() {
  let layout = await getCurrentKeyboardLayout();
  let text = "⚙️ *Manage Keyboard Layout:*\n\n✏️ Click on button name.\n\n━━━━━━━━━━━━━━━━━━━━\n\n";
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

  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    rowButtons.forEach(btn => {
      let idx = layout.indexOf(btn);
      kb = kb.text(btn.name, `theme_edit_${idx}`)
             .text("⬆️", `theme_rowup_${r}`)
             .text("⬇️", `theme_rowdown_${r}`).row();
    });
  }

  for (let i = 0; i < layout.length; i++) {
    let btn = layout[i];
    kb = kb.text(btn.name, `theme_edit_${i}`)
           .text("⬆️", `theme_btnup_${i}`)
           .text("⬇️", `theme_btndown_${i}`)
           .text("🎯", `theme_move_${i}`).row();
  }

  kb = kb.text("🎨 Set Button Colors", "theme_colors_menu").row();
  kb = kb.text("♻️ Reset Keyboard", "theme_reset").row();
  kb = kb.text("🎨 Update All Users", "theme_update_all").row();
  kb = kb.text("➕ Add New Button", "theme_add_btn").row();
  kb = kb.text("🔙 Back to Admin", "admin");
  return kb;
}

bot.callbackQuery("adm_customize_theme", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await ctx.editMessageText(await getManageText(), {
    parse_mode: "Markdown",
    reply_markup: await getManageKeyboard()
  }).catch(() => {});
});

bot.callbackQuery(/^theme_edit_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let styleLabel = (btn.style && STYLE_COLORS[btn.style]) ? `${STYLE_COLORS[btn.style].emoji} ${STYLE_COLORS[btn.style].label}` : "⚪ Default";
  let text = `✏️ *Edit Button #${idx + 1}*\n\n📝 Name: \`${btn.name}\`\n📍 Row: ${btn.row}\n🎨 Style: ${styleLabel}`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `theme_rename_${idx}`).row()
    .text("🎨 Set Color", `theme_setcolor_${idx}`).row()
    .text("🗑️ Delete", `theme_del_${idx}`).row()
    .text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^theme_rename_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  userState[ctx.from.id] = `THEME_WAIT_RENAME_${idx}`;
  await ctx.editMessageText(`📝 Send new name for this button:`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme")
  }).catch(() => {});
});

bot.callbackQuery(/^theme_setcolor_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return;

  let btn = layout[idx];
  let current = btn.style || "none";
  let currentLabel = (current !== "none" && STYLE_COLORS[current]) ? `${STYLE_COLORS[current].emoji} ${STYLE_COLORS[current].label}` : "⚪ Default";

  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(STYLE_COLORS)) {
    let mark = current === key ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `theme_color_set_${idx}_${key}`).row();
  }
  kb = kb.text(`${current === "none" ? "✅ " : ""}⚪ Default`, `theme_color_set_${idx}_none`).row();
  kb = kb.text("🔙 Back", `theme_edit_${idx}`);

  await ctx.editMessageText(
    `🎨 *Set Color for Button*\n\n📌 \`${btn.name}\`\n🎨 Current: ${currentLabel}\n\n👇 Choose:`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery(/^theme_color_set_(\d+)_(.+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let colorKey = ctx.match[2];
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return;

  if (colorKey === "none") {
    layout[idx].style = "none";
    // Remove emoji prefix
    layout[idx].name = layout[idx].name.replace(/^[🔵🟢🔴⚪]\s*/, "");
  } else if (STYLE_COLORS[colorKey]) {
    layout[idx].style = colorKey;
    let cleanName = layout[idx].name.replace(/^[🔵🟢🔴⚪]\s*/, "");
    layout[idx].name = `${STYLE_COLORS[colorKey].emoji} ${cleanName}`;
  } else {
    return ctx.answerCallbackQuery({ text: "❌ Invalid!", show_alert: true });
  }

  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.answerCallbackQuery({ text: colorKey === "none" ? "⚪ Removed!" : `${STYLE_COLORS[colorKey].emoji} Applied!` });

  let btn = layout[idx];
  let current = btn.style || "none";
  let currentLabel = (current !== "none" && STYLE_COLORS[current]) ? `${STYLE_COLORS[current].emoji} ${STYLE_COLORS[current].label}` : "⚪ Default";

  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(STYLE_COLORS)) {
    let mark = current === key ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `theme_color_set_${idx}_${key}`).row();
  }
  kb = kb.text(`${current === "none" ? "✅ " : ""}⚪ Default`, `theme_color_set_${idx}_none`).row();
  kb = kb.text("🔙 Back", `theme_edit_${idx}`);

  await ctx.editMessageText(
    `🎨 *Set Color for Button*\n\n📌 \`${btn.name}\`\n🎨 Current: ${currentLabel}\n\n👇 Choose:`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("theme_colors_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let layout = await getCurrentKeyboardLayout();
  let coloredCount = layout.filter(b => b.style && b.style !== "none").length;
  let text = `🎨 *Set Button Colors*\n\n📋 Total: ${layout.length}\n🎨 Colored: ${coloredCount}\n\n👇 Click a button:`;

  let kb = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    let btn = layout[i];
    let styleLabel = (btn.style && btn.style !== "none" && STYLE_COLORS[btn.style]) ? STYLE_COLORS[btn.style].emoji : "⚪";
    kb = kb.text(`${styleLabel} ${btn.name}`, `theme_setcolor_${i}`).row();
  }
  kb = kb.text("🗑️ Remove All Colors", "theme_remove_all").row();
  kb = kb.text("🔙 Back to Theme", "adm_customize_theme");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("theme_remove_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let layout = await getCurrentKeyboardLayout();
  let coloredCount = layout.filter(b => b.style && b.style !== "none").length;
  if (coloredCount === 0) return ctx.answerCallbackQuery({ text: "📭 No colors set!", show_alert: true });

  let kb = new InlineKeyboard()
    .text("✅ Yes, Remove All", "theme_remove_all_confirm").row()
    .text("❌ Cancel", "theme_colors_menu");

  await ctx.editMessageText(
    `⚠️ *Remove All Reply Keyboard Colors?*\n\n📊 Total: ${coloredCount}\n\n👇 Confirm?`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("theme_remove_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let layout = await getCurrentKeyboardLayout();
  let coloredCount = layout.filter(b => b.style && b.style !== "none").length;
  layout.forEach(b => {
    b.style = "none";
    b.name = b.name.replace(/^[🔵🟢🔴⚪]\s*/, "");
  });
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.answerCallbackQuery({ text: `🗑️ Removed ${coloredCount} colors!` });
  await ctx.editMessageText(
    `✅ *All Colors Removed!*\n\n📊 Removed: ${coloredCount}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "theme_colors_menu") }
  ).catch(() => {});
});

bot.callbackQuery(/^theme_del_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Deleted!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return;
  layout.splice(idx, 1);
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_rowup_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "⬆️ Moved!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let row = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (row <= 0) return;
  layout.forEach(b => { if (b.row === row) b.row -= 1; else if (b.row === row - 1) b.row += 1; });
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_rowdown_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "⬇️ Moved!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let row = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  let maxRow = Math.max(...layout.map(b => b.row));
  if (row >= maxRow) return;
  layout.forEach(b => { if (b.row === row) b.row += 1; else if (b.row === row + 1) b.row -= 1; });
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_btnup_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "⬆️ Moved!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx <= 0) return;
  let temp = layout[idx]; layout[idx] = layout[idx - 1]; layout[idx - 1] = temp;
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_btndown_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "⬇️ Moved!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx >= layout.length - 1) return;
  let temp = layout[idx]; layout[idx] = layout[idx + 1]; layout[idx + 1] = temp;
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^theme_move_(\d+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let idx = parseInt(ctx.match[1], 10);
  let layout = await getCurrentKeyboardLayout();
  if (idx < 0 || idx >= layout.length) return;

  let btn = layout[idx];
  userState[ctx.from.id] = `THEME_WAIT_MOVE_${idx}`;
  await ctx.answerCallbackQuery();

  let maxRow = Math.max(...layout.map(b => b.row));
  let rowInfo = "";
  for (let r = 0; r <= maxRow; r++) {
    let count = layout.filter(b => b.row === r).length;
    let marker = (r === btn.row) ? "👉" : "  ";
    rowInfo += `${marker} Row ${r}: ${count}\n`;
  }

  await ctx.editMessageText(
    `🎯 *Move Button*\n\n📌 \`${btn.name}\`\n📍 Row: ${btn.row}\n\n📋 Rows:\n${rowInfo}\n\n👉 Send target row number:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme") }
  ).catch(() => {});
});

bot.callbackQuery("theme_add_btn", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "THEME_WAIT_ADD";
  await ctx.editMessageText("➕ Send new button name:", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme")
  }).catch(() => {});
});

bot.callbackQuery("theme_reset", async (ctx) => {
  ctx.answerCallbackQuery({ text: "♻️ Reset!", show_alert: true }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let layout = JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT));
  await setConfig("keyboard_layout", layout);
  cache.layout = layout;
  await ctx.editMessageText(await getManageText(), { parse_mode: "Markdown", reply_markup: await getManageKeyboard() }).catch(() => {});
});

bot.callbackQuery("theme_update_all", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  ctx.answerCallbackQuery({ text: "⏳ Updating..." }).catch(() => {});
  let allUsers = await User.find({});
  let count = 0, failed = 0;
  let newKb = await buildKeyboardFromLayout();
  for (let u of allUsers) {
    try {
      await ctx.api.sendMessage(u.userId, "🎨 *Keyboard Updated!*", { parse_mode: "Markdown", reply_markup: newKb });
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  await ctx.reply(`📊 *Report*\n\n✅ Updated: \`${count}\`\n❌ Failed: \`${failed}\`\n👥 Total: \`${allUsers.length}\``, { parse_mode: "Markdown" });
});

// ============================================================
// 🖌️ EDIT INLINE STYLES — Per-Button
// ============================================================
async function renderEditStylesPanel(ctx) {
  let styleMap = await getConfig("inline_button_styles", {});
  let totalCount = Object.keys(styleMap).length;

  let text =
    `🖌️ *Inline Button Colors*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Colored:* ${totalCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 *Click a button:*\n\n` +
    `🔵 Blue  🟢 Green  🔴 Red  ⚪ White  ⚫ Default`;

  let buttons = [
    { key: "add_fund_btn", name: "➕ Add Fund" },
    { key: "balance_statement", name: "📊 Balance Statement" },
    { key: "customer_support", name: "💬 Support" },
    { key: "refresh_balance_only", name: "🔄 Refresh" },
    { key: "live_fund", name: "💰 Live Fund" },
    { key: "back_to_balance", name: "🔙 Back" },
    { key: "wd_wallet", name: "🌐 Wallet WD" },
    { key: "wd_upi", name: "⚡ UPI WD" },
    { key: "wd_bank", name: "🏦 Bank WD" },
    { key: "wd_redeem", name: "🎁 Redeem WD" },
    { key: "wd_amazon", name: "📧 Amazon WD" },
    { key: "set_wallet", name: "🌐 Set Wallet" },
    { key: "set_upi", name: "⚡ Set UPI" },
    { key: "set_bank", name: "🏦 Set Bank" },
    { key: "canc_wd", name: "❌ Cancel WD" },
    { key: "canc_rdm", name: "❌ Cancel Redeem" },
    { key: "check_join", name: "✅ Check Join" },
    { key: "afm_add", name: "➕ Add Method" },
    { key: "broadcast_confirm", name: "✅ Broadcast Yes" },
    { key: "broadcast_cancel", name: "❌ Broadcast No" }
  ];

  let kb = new InlineKeyboard();
  for (let b of buttons) {
    let cur = styleMap[b.key] || "none";
    let icon = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? INLINE_STYLE_COLORS[cur].emoji : "⚫";
    kb = kb.text(`${icon} ${b.name}`, `istyle_btn_${b.key}`).row();
  }
  kb = kb.text("📝 Edit Button Names", "istyle_edit_names").row();
  kb = kb.text("🎨 Preview", "istyle_preview").row();
  kb = kb.text("🗑️ Remove All Colors", "istyle_remove_all").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("adm_edit_styles", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderEditStylesPanel(ctx);
});

bot.callbackQuery(/^istyle_btn_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let btnKey = ctx.callbackQuery.data.replace("istyle_btn_", "");
  let styleMap = await getConfig("inline_button_styles", {});
  let cur = styleMap[btnKey] || "none";
  let curLabel = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? `${INLINE_STYLE_COLORS[cur].emoji} ${INLINE_STYLE_COLORS[cur].label}` : "⚫ Default";

  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = cur === key ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `istyle_set_${btnKey}_${key}`).row();
  }
  kb = kb.text(`${cur === "none" ? "✅ " : ""}⚫ Default`, `istyle_set_${btnKey}_none`).row();
  kb = kb.text("🔙 Back", "adm_edit_styles");

  await ctx.editMessageText(
    `🖌️ *Set Color*\n\n📌 \`${btnKey}\`\n🎨 Current: ${curLabel}\n\n👇 Choose:`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery(/^istyle_set_(.+)_(primary|success|danger|white|none)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.match[1];
  let colorKey = ctx.match[2];
  let styleMap = await getConfig("inline_button_styles", {});

  if (colorKey === "none") {
    delete styleMap[btnKey];
    await setConfig("inline_button_styles", styleMap);
    await ctx.answerCallbackQuery({ text: "⚫ Removed" });
  } else if (INLINE_STYLE_COLORS[colorKey]) {
    styleMap[btnKey] = colorKey;
    await setConfig("inline_button_styles", styleMap);
    await ctx.answerCallbackQuery({ text: `${INLINE_STYLE_COLORS[colorKey].emoji} Applied!` });
  } else {
    return ctx.answerCallbackQuery({ text: "❌ Invalid!", show_alert: true });
  }

  let cur = styleMap[btnKey] || "none";
  let curLabel = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? `${INLINE_STYLE_COLORS[cur].emoji} ${INLINE_STYLE_COLORS[cur].label}` : "⚫ Default";

  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = cur === key ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `istyle_set_${btnKey}_${key}`).row();
  }
  kb = kb.text(`${cur === "none" ? "✅ " : ""}⚫ Default`, `istyle_set_${btnKey}_none`).row();
  kb = kb.text("🔙 Back", "adm_edit_styles");

  await ctx.editMessageText(
    `🖌️ *Set Color*\n\n📌 \`${btnKey}\`\n🎨 Current: ${curLabel}\n\n👇 Choose:`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("istyle_preview", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let kb = await buildStyledKb([
    [
      { text: "✅ Confirm", callback_data: "preview_yes" },
      { text: "❌ Cancel", callback_data: "preview_no" }
    ],
    [{ text: "ℹ️ Info", callback_data: "preview_info" }],
    [{ text: "⚪ White", callback_data: "preview_white" }],
    [{ text: "🔙 Back", callback_data: "adm_edit_styles" }]
  ]);

  await ctx.reply(`🎨 *Preview*\n\n💡 Colors shown as emoji prefix.`, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery("preview_yes", async (ctx) => ctx.answerCallbackQuery({ text: "🟢 Success!" }));
bot.callbackQuery("preview_no", async (ctx) => ctx.answerCallbackQuery({ text: "🔴 Danger!" }));
bot.callbackQuery("preview_info", async (ctx) => ctx.answerCallbackQuery({ text: "🔵 Primary!" }));
bot.callbackQuery("preview_white", async (ctx) => ctx.answerCallbackQuery({ text: "⚪ White!" }));

bot.callbackQuery("istyle_remove_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let styleMap = await getConfig("inline_button_styles", {});
  let totalCount = Object.keys(styleMap).length;
  if (totalCount === 0) return ctx.answerCallbackQuery({ text: "📭 No colors set!", show_alert: true });

  let kb = new InlineKeyboard()
    .text("✅ Yes, Remove All", "istyle_remove_all_confirm").row()
    .text("❌ Cancel", "adm_edit_styles");

  await ctx.editMessageText(
    `⚠️ *Remove ALL Inline Colors?*\n\n📊 Total: ${totalCount}\n\n👇 Confirm?`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("istyle_remove_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let styleMap = await getConfig("inline_button_styles", {});
  let totalCount = Object.keys(styleMap).length;
  await setConfig("inline_button_styles", {});
  await ctx.answerCallbackQuery({ text: `🗑️ Removed ${totalCount} colors!` });
  await renderEditStylesPanel(ctx);
});

// ============================================================
// 📝 EDIT BUTTON NAMES
// ============================================================
bot.callbackQuery("istyle_edit_names", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderButtonNamesPanel(ctx);
});

async function renderButtonNamesPanel(ctx) {
  let names = await getConfig("inline_button_names", {});

  let buttons = [
    { key: "add_fund_btn", default: "➕ Add Fund" },
    { key: "balance_statement", default: "📊 Balance Statement" },
    { key: "customer_support", default: "💬 Customer Support" },
    { key: "refresh_balance_only", default: "🔄 Refresh" },
    { key: "live_fund", default: "💰 Live Fund" },
    { key: "back_to_balance", default: "🔙 Back" },
    { key: "wd_wallet", default: "🌐 Wallet" },
    { key: "wd_upi", default: "⚡ UPI" },
    { key: "wd_bank", default: "🏦 Bank" },
    { key: "wd_redeem", default: "🎁 Redeem" },
    { key: "wd_amazon", default: "📧 Amazon" },
    { key: "canc_wd", default: "❌ Cancel" },
    { key: "canc_rdm", default: "❌ Cancel" },
    { key: "check_join", default: "✅ Check Join" }
  ];

  let text =
    `📝 *Edit Button Names*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 *Click a button:*\n\n` +
    `✏️ *Custom:* ${Object.keys(names).length}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard();
  for (let b of buttons) {
    let curName = names[b.key] || b.default;
    let shortName = curName.length > 25 ? curName.substring(0, 25) + "..." : curName;
    let isCustom = names[b.key] ? "✏️" : "⚪";
    kb = kb.text(`${isCustom} ${shortName}`, `ibtn_edit_${b.key}`).row();
  }
  kb = kb.text("🔙 Back", "adm_edit_styles");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery(/^ibtn_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let btnKey = ctx.callbackQuery.data.replace("ibtn_edit_", "");
  let names = await getConfig("inline_button_names", {});
  let curName = names[btnKey] || "(Default)";

  userState[ctx.from.id] = `WAITING_IBTN_NAME_${btnKey}`;

  await ctx.editMessageText(
    `📝 *Edit Button Name*\n\n🔑 \`${btnKey}\`\n📌 Current: \`${curName}\`\n\n📝 Send new name:\n\n💡 Type "reset" to restore`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "istyle_edit_names") }
  ).catch(() => {});
});

// ============================================================
// 💸 WITHDRAW TOGGLE
// ============================================================
async function isWithdrawEnabled(method) {
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  return toggles[method.toLowerCase()] !== false;
}

async function toggleWithdraw(method) {
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  toggles[method.toLowerCase()] = !toggles[method.toLowerCase()];
  await setConfig("withdraw_toggles", toggles);
  return toggles[method.toLowerCase()];
}

async function renderWithdrawTogglePanel(ctx) {
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });

  let onCount = Object.values(toggles).filter(v => v === true).length;

  let text =
    `💸 *Withdraw Toggle*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ *ON:* ${onCount}\n🔴 *OFF:* ${5 - onCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(`${toggles.wallet ? "✅" : "🔴"} Wallet — ${toggles.wallet ? "ON" : "OFF"}`, "wt_toggle_wallet").row()
    .text(`${toggles.upi ? "✅" : "🔴"} UPI — ${toggles.upi ? "ON" : "OFF"}`, "wt_toggle_upi").row()
    .text(`${toggles.bank ? "✅" : "🔴"} Bank — ${toggles.bank ? "ON" : "OFF"}`, "wt_toggle_bank").row()
    .text(`${toggles.amazon ? "✅" : "🔴"} Amazon — ${toggles.amazon ? "ON" : "OFF"}`, "wt_toggle_amazon").row()
    .text(`${toggles.redeem ? "✅" : "🔴"} Redeem — ${toggles.redeem ? "ON" : "OFF"}`, "wt_toggle_redeem").row()
    .text("🔄 Refresh", "adm_withdraw_toggle").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("adm_withdraw_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderWithdrawTogglePanel(ctx);
});

bot.callbackQuery(/^wt_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("wt_toggle_", "");
  let newState = await toggleWithdraw(method);
  await ctx.answerCallbackQuery({ text: newState ? `✅ ${method} ON` : `🔴 ${method} OFF` });
  await renderWithdrawTogglePanel(ctx);
});

// ============================================================
// 👑 ADMIN PANEL — "Edit Texts" REMOVED
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.reply("❌ Not an admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let userCount = await User.countDocuments({});
  let admins = await getConfig("admins", []);
  let adminCount = admins.length + 1;
  let activeGateway = await Gateway.findOne({ isActive: true });
  let verifyEnabled = await getConfig("verification_enabled", false);

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🌐 *Gateway:* ${activeGateway ? "`" + activeGateway.name + "`" : "❌ None"}\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${adminCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let rawButtons = [
    [
      { text: "💰 Balance", callback_data: "adm_balance_menu" },
      { text: "👥 Users", callback_data: "adm_users_menu" }
    ],
    [
      { text: "📋 Tasks", callback_data: "adm_tasks_manager" },
      { text: "🎁 Gifts", callback_data: "adm_create_gift" }
    ],
    [
      { text: "📧 Amazon", callback_data: "adm_amazon" },
      { text: "🎁 Redeem", callback_data: "adm_redeem" }
    ],
    [
      { text: "🌐 Gateway", callback_data: "adm_gateway_menu" },
      { text: "📢 Broadcast", callback_data: "adm_broadcast" }
    ],
    [
      { text: "💬 User Message", callback_data: "adm_user_message" },
      { text: "👑 Admins", callback_data: "adm_admins" }
    ],
    [
      { text: "✅ Verification", callback_data: "adm_verification" },
      { text: "🎨 Theme", callback_data: "adm_customize_theme" }
    ],
    [
      { text: "🖌️ Inline Styles", callback_data: "adm_edit_styles" }
    ],
    [
      { text: "💸 Withdraw Toggle", callback_data: "adm_withdraw_toggle" },
      { text: "📊 Add Fund", callback_data: "adm_addfund_menu" }
    ],
    [
      { text: "🔄 Reset Balance", callback_data: "adm_reset_all_bal" },
      { text: "⚙️ Settings", callback_data: "adm_settings" }
    ],
    [{ text: "🔄 Refresh Panel", callback_data: "admin" }]
  ];

  let styledKb = await buildStyledKb(rawButtons);

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(panelText, { reply_markup: styledKb, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(panelText, { reply_markup: styledKb, parse_mode: "Markdown" });
  }
}

bot.callbackQuery("admin", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await sendAdminPanel(ctx, true);
});

bot.callbackQuery("noop", async (ctx) => ctx.answerCallbackQuery());

// ============================================================
// 💰 BALANCE MENU
// ============================================================
bot.callbackQuery("adm_balance_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let kb = await buildStyledKb([
    [
      { text: "➕ Add Balance", callback_data: "adm_add_bal" },
      { text: "➖ Remove Balance", callback_data: "adm_rem_bal" }
    ],
    [{ text: "🔄 Reset User Balance", callback_data: "adm_reset_bal" }],
    [{ text: "📊 All User Balances", callback_data: "adm_all_balances" }],
    [{ text: "🔙 Back", callback_data: "admin" }]
  ]);

  await ctx.editMessageText(
    `💰 *Balance Management*\n\n━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

// ============================================================
// 👥 USERS MENU
// ============================================================
bot.callbackQuery("adm_users_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let totalUsers = await User.countDocuments({});
  let banned = await User.countDocuments({ isBanned: true });
  let active = totalUsers - banned;

  let kb = await buildStyledKb([
    [{ text: "🔍 User Tracker", callback_data: "adm_user_tracker" }],
    [{ text: "📊 All Balances", callback_data: "adm_all_balances" }],
    [{ text: "📢 Broadcast", callback_data: "adm_broadcast" }],
    [{ text: "🔙 Back", callback_data: "admin" }]
  ]);

  await ctx.editMessageText(
    `👥 *User Management*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 Total: ${totalUsers}\n✅ Active: ${active}\n🚫 Banned: ${banned}\n\n━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

// ============================================================
// 👑 ADMINS
// ============================================================
async function renderAdminsPanel(ctx) {
  if (!(await isOwner(ctx.from.id))) return;

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let admins = await getConfig("admins", []);
  let ownerUser = await User.findOne({ userId: ownerId });
  let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";

  let text =
    `👑 *Admin Management*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👑 *Owner:* \`${ownerId}\`\n📛 ${ownerName}\n\n` +
    `📊 *Total Admins:* ${admins.length}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n💡 Click admin:`;

  let kb = new InlineKeyboard();

  if (admins.length === 0) {
    kb = kb.text("📂 No Admins Yet", "noop").row();
  } else {
    for (let adminId of admins) {
      let adminUser = await User.findOne({ userId: adminId });
      let displayName = adminUser ? (adminUser.firstName || "User") : "Unknown";
      kb = kb.text(`👤 ${displayName} — ${adminId}`, `admin_view_${adminId}`).row();
    }
  }

  kb = kb.text("➕ Add New Admin", "admin_add").row();
  kb = kb.text("👑 Transfer Ownership", "admin_transfer").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
  }
}

bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  await renderAdminsPanel(ctx);
});

bot.callbackQuery(/^admin_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_view_", ""), 10);
  let adminUser = await User.findOne({ userId: adminId });
  if (!adminUser) return;

  let text =
    `👤 *Admin Details*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 *Name:* ${adminUser.firstName || "Unknown"}\n` +
    `🆔 *User ID:* \`${adminId}\`\n` +
    `📛 *Username:* ${adminUser.username ? "@" + adminUser.username : "Not Set"}\n` +
    `💰 *Balance:* ₹${adminUser.balance.toFixed(2)}\n` +
    `⚡ *Role:* 👑 Admin\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .url("👤 Open Profile", `tg://user?id=${adminId}`).row()
    .text("💬 Send Message", `admin_msg_${adminId}`).row()
    .text("🔍 View Tracker", `track_ref_${adminId}`).row()
    .text("🗑️ Remove Admin", `admin_remove_${adminId}`).row()
    .text("🔙 Back to Admins", "adm_admins");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admin_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_remove_", ""), 10);

  let admins = await getConfig("admins", []);
  admins = admins.filter(id => Number(id) !== Number(adminId));
  await setConfig("admins", admins);
  cache.admins = admins;
  cache.adminsTime = Date.now();

  await ctx.answerCallbackQuery({ text: "🗑️ Admin removed!" });
  await renderAdminsPanel(ctx);
});

bot.callbackQuery(/^admin_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_msg_", ""), 10);
  userState[ctx.from.id] = `WAITING_MSG_ADMIN_${adminId}`;
  await ctx.editMessageText(
    `💬 *Send Message*\n\nTo: \`${adminId}\`\n\nSend your message:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `admin_view_${adminId}`) }
  ).catch(() => {});
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(
    `➕ *Add New Admin*\n\n📝 Send User ID:\n\n⚠️ User must have started the bot!`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") }
  ).catch(() => {});
});

bot.callbackQuery("admin_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(
    `👑 *Transfer Ownership*\n\n⚠️ *WARNING!*\n\n• You will lose owner access\n• Cannot be undone!\n\n📝 Send new Owner User ID:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") }
  ).catch(() => {});
});

// ============================================================
// ✅ VERIFICATION
// ============================================================
async function renderVerificationPanel(ctx) {
  let verifyEnabled = await getConfig("verification_enabled", false);
  let totalUsers = await User.countDocuments({});
  let verifiedUsers = await Verification.countDocuments({ verified: true });
  let unverifiedUsers = totalUsers - verifiedUsers;
  let botPhotoUrl = await getConfig("bot_photo_url", null);
  let botName = await getConfig("bot_name", "TASK EARN BOT");

  let text =
    `✅ *Verification*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔘 *Status:* ${verifyEnabled ? "✅ ON" : "❌ OFF"}\n` +
    `👥 *Total:* ${totalUsers}\n✅ *Verified:* ${verifiedUsers}\n❌ *Unverified:* ${unverifiedUsers}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n📛 *Bot Name:* ${botName}\n🖼️ *Bot Photo:* ${botPhotoUrl ? "✅ Set" : "❌ Not Set"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(verifyEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row()
    .text("📛 Set Bot Name", "verify_set_name").row()
    .text("🖼️ Set Bot Photo URL", "verify_set_photo").row()
    .text("📋 Verified Users", "verify_list_users").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("adm_verification", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderVerificationPanel(ctx);
});

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !current);
  await ctx.answerCallbackQuery({ text: !current ? "✅ Verification ON" : "❌ Verification OFF" });
  await renderVerificationPanel(ctx);
});

bot.callbackQuery("verify_set_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_NAME";
  await ctx.editMessageText(
    `📛 *Set Bot Name*\n\nSend the bot name:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_verification") }
  ).catch(() => {});
});

bot.callbackQuery("verify_set_photo", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_PHOTO";
  await ctx.editMessageText(
    `🖼️ *Set Bot Photo URL*\n\nSend image URL:\n\n📌 Example: \`https://i.imgur.com/xxxxx.png\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_verification") }
  ).catch(() => {});
});

bot.callbackQuery("verify_list_users", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let verified = await Verification.find({ verified: true }).sort({ verifiedAt: -1 }).limit(50);
  if (verified.length === 0) {
    return ctx.reply("📋 No verified users yet.", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification") });
  }

  let text = `📋 *Verified Users (${verified.length})*\n\n`;
  for (let v of verified) {
    let u = await User.findOne({ userId: v.userId });
    let name = u ? (u.firstName || "User") : "Unknown";
    text += `✅ ${name} — \`${v.userId}\`\n`;
  }

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification") });
});

// ============================================================
// 💰 ADD FUND MANAGEMENT
// ============================================================
async function renderAddFundPanel(ctx) {
  let methods = await getAddFundMethods();
  let addFundEnabled = await getConfig("add_fund_enabled", true);
  let pendingCount = await AddFund.countDocuments({ status: "Pending" });
  let approvedCount = await AddFund.countDocuments({ status: "Approved" });

  let text =
    `💰 *Add Fund Management*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔘 *Status:* ${addFundEnabled ? "✅ ON" : "❌ OFF"}\n` +
    `📊 *Methods:* ${methods.length}\n` +
    `⏳ *Pending:* ${pendingCount}\n` +
    `✅ *Approved:* ${approvedCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n💡 *Click method to edit:*`;

  let kb = new InlineKeyboard();
  for (let m of methods) {
    let colorIcon = (m.color && INLINE_STYLE_COLORS[m.color]) ? INLINE_STYLE_COLORS[m.color].emoji : "⚪";
    kb = kb.text(`${colorIcon} ${m.name} — ₹${m.min || 1}-₹${m.max || 1000}`, `afm_view_${m.key}`).row();
  }
  kb = kb.text("➕ Add New Method", "afm_add").row();
  kb = kb.text(addFundEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "addfund_toggle").row();
  kb = kb.text("📋 Pending Requests", "addfund_pending").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("adm_addfund_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAddFundPanel(ctx);
});

bot.callbackQuery("addfund_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("add_fund_enabled", true);
  await setConfig("add_fund_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ Add Fund ON" : "❌ Add Fund OFF" });
  await renderAddFundPanel(ctx);
});

bot.callbackQuery("afm_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AFM_WAIT_NAME";
  global.afmTemp = global.afmTemp || {};
  global.afmTemp[ctx.from.id] = {};
  await ctx.editMessageText(
    `➕ *Add New Method*\n\n📝 *Step 1/5:* Send Method Name\n\n📌 Example: \`UPI\`, \`Wallet\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") }
  ).catch(() => {});
});

bot.callbackQuery(/^afm_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_view_", "");
  let m = await getMethodByKey(key);
  if (!m) return;

  let colorLabel = (m.color && INLINE_STYLE_COLORS[m.color]) ? `${INLINE_STYLE_COLORS[m.color].emoji} ${INLINE_STYLE_COLORS[m.color].label}` : "⚪ Default";

  let text =
    `💠 *${m.name}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 *Name:* ${m.name}\n🔑 *Key:* \`${m.key}\`\n` +
    `💳 *Address:* \`${m.address || "Not Set"}\`\n` +
    `🖼️ *Photo:* ${m.photo ? "✅" : "❌"}\n` +
    `🎨 *Color:* ${colorLabel}\n` +
    `📉 *Min:* ₹${m.min || 1}\n📈 *Max:* ₹${m.max || 1000}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Name", `afm_edit_name_${m.key}`)
    .text("💳 Address", `afm_edit_addr_${m.key}`).row()
    .text("🖼️ Photo", `afm_edit_photo_${m.key}`)
    .text("🎨 Color", `afm_edit_color_${m.key}`).row()
    .text("📉 Min", `afm_edit_min_${m.key}`)
    .text("📈 Max", `afm_edit_max_${m.key}`).row()
    .text("🗑️ Delete", `afm_del_${m.key}`).row()
    .text("🔙 Back", "adm_addfund_menu");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^afm_edit_name_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_name_", "");
  userState[ctx.from.id] = `AFM_EDIT_NAME_${key}`;
  await ctx.editMessageText(`✏️ Send new name:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_addr_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_addr_", "");
  userState[ctx.from.id] = `AFM_EDIT_ADDR_${key}`;
  await ctx.editMessageText(`💳 Send UPI ID / Wallet Number:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_photo_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_photo_", "");
  userState[ctx.from.id] = `AFM_EDIT_PHOTO_${key}`;
  await ctx.editMessageText(`🖼️ Send image URL:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_color_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_color_", "");
  let m = await getMethodByKey(key);
  if (!m) return;

  let current = m.color || "none";
  let kb = new InlineKeyboard();
  for (let [cKey, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = current === cKey ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `afm_color_set_${key}_${cKey}`).row();
  }
  kb = kb.text(`${current === "none" ? "✅ " : ""}⚪ Default`, `afm_color_set_${key}_none`).row();
  kb = kb.text("🔙 Back", `afm_view_${key}`);

  await ctx.editMessageText(`🎨 Choose Color:`, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^afm_color_set_(.+)_(primary|success|danger|white|none)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🎨 Applied!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.match[1];
  let colorKey = ctx.match[2];
  await updateMethod(key, { color: colorKey });
  let m = await getMethodByKey(key);
  if (!m) return;

  let current = m.color || "none";
  let kb = new InlineKeyboard();
  for (let [cKey, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = current === cKey ? "✅ " : "";
    kb = kb.text(`${mark}${info.emoji} ${info.label}`, `afm_color_set_${key}_${cKey}`).row();
  }
  kb = kb.text(`${current === "none" ? "✅ " : ""}⚪ Default`, `afm_color_set_${key}_none`).row();
  kb = kb.text("🔙 Back", `afm_view_${key}`);

  await ctx.editMessageText(`🎨 Choose Color:`, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^afm_edit_min_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_min_", "");
  userState[ctx.from.id] = `AFM_EDIT_MIN_${key}`;
  await ctx.editMessageText(`📉 Send min amount:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_max_", "");
  userState[ctx.from.id] = `AFM_EDIT_MAX_${key}`;
  await ctx.editMessageText(`📈 Send max amount:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_del_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Deleted!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_del_", "");
  await deleteMethod(key);
  await renderAddFundPanel(ctx);
});

bot.callbackQuery("addfund_pending", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let pending = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(20);
  if (pending.length === 0) {
    return ctx.reply("📋 No pending requests.", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_addfund_menu") });
  }

  for (let req of pending) {
    let kb = new InlineKeyboard()
      .text("✅ Approve", `af_app_${req.requestId}`)
      .text("❌ Reject", `af_rej_${req.requestId}`);

    let caption =
      `💰 *Add Fund Request*\n\n👤 ${req.userName}\n🆔 \`${req.userId}\`\n💵 ₹${req.amount}\n💳 ${req.method}\n📅 ${new Date(req.createdAt).toLocaleString('en-IN')}`;

    if (req.proofFileId && !req.proofFileId.startsWith("REFER:")) {
      try { await ctx.replyWithPhoto(req.proofFileId, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {
        await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });
      }
    } else {
      await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });
    }
  }
});

// ============================================================
// ⚙️ ADMIN SETTINGS
// ============================================================
async function renderSettingsPanel(ctx) {
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let channelCount = await Channel.countDocuments({});

  let text =
    `⚙️ *Admin Settings*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Bot:* ${botActive ? "✅" : "❌"}\n` +
    `💸 *Min WD:* ₹${minW}\n💰 *Max WD:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `📢 *Force Join:* ${channelCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_bot").row()
    .text("📉 Min Withdraw", "adm_set_min_w")
    .text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Payout Channel", "adm_set_p_chan")
    .text("📢 Force Join", "adm_channels").row()
    .text("💬 Support ID", "adm_set_support").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderSettingsPanel(ctx);
});

bot.callbackQuery("adm_toggle_bot", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("bot_active", true);
  await setConfig("bot_active", !current);
  await ctx.answerCallbackQuery({ text: !current ? "✅ Bot ON" : "❌ Bot OFF" });
  await renderSettingsPanel(ctx);
});

bot.callbackQuery("adm_set_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.editMessageText("💬 Send Support ID:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings")
  }).catch(() => {});
});

// ============================================================
// 🌐 GATEWAY MANAGEMENT
// ============================================================
async function renderGatewayPanel(ctx) {
  let gateways = await Gateway.find({}).sort({ createdAt: -1 });
  let activeGW = await Gateway.findOne({ isActive: true });

  let text =
    `🌐 *Gateway Management*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 *Active:* ${activeGW ? "`" + activeGW.name + "`" : "❌ None"}\n` +
    `📊 *Total:* ${gateways.length}\n\n💡 Click a gateway:`;

  let kb = new InlineKeyboard();
  for (let gw of gateways) {
    let icon = gw.isActive ? "✅" : "⚪";
    kb = kb.text(`${icon} ${gw.name}`, `gw_view_${gw.name}`).row();
  }
  kb = kb.text("➕ Add New Gateway", "gw_add").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayPanel(ctx);
});

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwName = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name: gwName });
  if (!gw) return;

  let shortUrl = gw.url.length > 60 ? gw.url.substring(0, 60) + "..." : gw.url;

  let text =
    `🌐 *Gateway: ${gw.name}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 *Name:* \`${gw.name}\`\n🔗 *URL:* \`${shortUrl}\`\n` +
    `⚡ *Status:* ${gw.isActive ? "✅ Active" : "⚪ Inactive"}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard();
  if (gw.isActive) kb = kb.text("🔴 Deactivate", `gw_deactivate_${gw.name}`).row();
  else kb = kb.text("🟢 Activate", `gw_activate_${gw.name}`).row();
  kb = kb.text("✏️ Edit URL", `gw_edit_${gw.name}`).row();
  kb = kb.text("🗑️ Delete", `gw_del_${gw.name}`).row();
  kb = kb.text("🔙 Back", "adm_gateway_menu");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("gw_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_GW_NAME";
  await ctx.editMessageText(
    `➕ *Add New Gateway*\n\n📝 Send Gateway Name:\n\n📌 Example: \`ULTRA\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") }
  ).catch(() => {});
});

bot.callbackQuery(/^gw_activate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_activate_", "");
  await Gateway.updateMany({}, { isActive: false });
  await Gateway.updateOne({ name: gwName }, { isActive: true });
  await ctx.answerCallbackQuery({ text: `✅ ${gwName} activated!` });
  await renderGatewayPanel(ctx);
});

bot.callbackQuery(/^gw_deactivate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_deactivate_", "");
  await Gateway.updateOne({ name: gwName }, { isActive: false });
  await ctx.answerCallbackQuery({ text: `🔴 Deactivated!` });
  await renderGatewayPanel(ctx);
});

bot.callbackQuery(/^gw_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwName = ctx.callbackQuery.data.replace("gw_edit_", "");
  userState[ctx.from.id] = `WAITING_GW_URL_${gwName}`;
  await ctx.editMessageText(
    `✏️ *Edit Gateway URL*\n\n📛 \`${gwName}\`\n\nSend new URL:\n\n⚠️ Placeholders:\n\`{upi}\` \`{amount}\` \`{comment}\` \`{userId}\` \`{orderId}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gw_view_${gwName}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name: gwName });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderGatewayPanel(ctx);
});

// ============================================================
// 📢 MANAGE CHANNELS
// ============================================================
async function renderChannelsPanel(ctx) {
  let channels = await Channel.find({}).sort({ addedAt: -1 });

  let text =
    `📢 *Manage Channels*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Total:* ${channels.length}\n\n💡 Click:`;

  let kb = new InlineKeyboard();
  for (let ch of channels) {
    let status = ch.isActive ? "✅" : "❌";
    let count = ch.subscriberCount || 0;
    let safeId = ch.channelId.replace('@', '').replace(/-/g, '');
    kb = kb.text(`${status} ${ch.channelId} — ${count}`, `ch_view_${safeId}`).row();
  }
  kb = kb.text("➕ Add New Channel", "ch_add").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderChannelsPanel(ctx);
});

bot.callbackQuery("ch_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_CHANNEL_ADD";
  await ctx.editMessageText(
    `➕ *Add Channel*\n\n📝 Format:\n\`ChannelID | InviteLink\`\n\n📌 Example:\n\`@mychannel | https://t.me/+abc123\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_channels") }
  ).catch(() => {});
});

bot.callbackQuery(/^ch_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_view_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;

  let subCount = ch.subscriberCount;
  let title = ch.displayName;
  try {
    let chatInfo = await ctx.api.getChat(ch.channelId);
    subCount = chatInfo.member_count || subCount;
    title = chatInfo.title || title;
  } catch (e) {}

  let statusIcon = ch.isActive ? "✅ Active" : "❌ Inactive";
  let text =
    `📢 *${ch.channelId}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 *Title:* ${title}\n🆔 *Channel:* \`${ch.channelId}\`\n` +
    `🔗 *Link:* ${ch.inviteLink}\n👥 *Subs:* ${subCount}\n` +
    `⚡ *Status:* ${statusIcon}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Rename", `ch_rename_${safeId}`).row()
    .text("🔗 Update Link", `ch_link_${safeId}`).row()
    .text(ch.isActive ? "🔴 Deactivate" : "🟢 Activate", `ch_toggle_${safeId}`).row()
    .text("🗑️ Delete", `ch_del_${safeId}`).row()
    .text("🔙 Back", "adm_channels");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^ch_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_rename_", "");
  userState[ctx.from.id] = `WAITING_CH_RENAME_${safeId}`;
  await ctx.editMessageText(`✏️ Send new display name:`, {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `ch_view_${safeId}`)
  }).catch(() => {});
});

bot.callbackQuery(/^ch_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_link_", "");
  userState[ctx.from.id] = `WAITING_CH_LINK_${safeId}`;
  await ctx.editMessageText(`🔗 Send new link:`, {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `ch_view_${safeId}`)
  }).catch(() => {});
});

bot.callbackQuery(/^ch_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let safeId = ctx.callbackQuery.data.replace("ch_toggle_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;
  ch.isActive = !ch.isActive;
  await ch.save();
  await ctx.answerCallbackQuery({ text: ch.isActive ? "🟢 Activated!" : "🔴 Deactivated!" });
  await renderChannelsPanel(ctx);
});

bot.callbackQuery(/^ch_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let safeId = ctx.callbackQuery.data.replace("ch_del_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;
  await Channel.deleteOne({ channelId: ch.channelId });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderChannelsPanel(ctx);
});

// ============================================================
// 💬 TEXT HANDLER — ALL STATES
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    // ❌ Cancel
    if (text === "❌ Cancel") {
      delete userState[userId];
      await ctx.reply("❌ Cancelled.", { reply_markup: await buildKeyboardFromLayout() });
      return;
    }

    // 🎨 THEME — Rename
    if (state.startsWith("THEME_WAIT_RENAME_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("THEME_WAIT_RENAME_", ""), 10);
      delete userState[userId];
      let layout = await getCurrentKeyboardLayout();
      if (idx < 0 || idx >= layout.length) return ctx.reply("❌ Button not found!");
      // Preserve color emoji prefix
      let existingStyle = layout[idx].style;
      let prefix = (existingStyle && STYLE_COLORS[existingStyle]) ? `${STYLE_COLORS[existingStyle].emoji} ` : "";
      let cleanText = text.replace(/^[🔵🟢🔴⚪]\s*/, "");
      layout[idx].name = prefix + cleanText;
      await setConfig("keyboard_layout", layout);
      cache.layout = layout;
      return ctx.reply(`✅ Renamed to: ${layout[idx].name}`);
    }

    // 🎨 THEME — Add
    if (state === "THEME_WAIT_ADD" && (await isAdmin(userId))) {
      delete userState[userId];
      let layout = await getCurrentKeyboardLayout();
      let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
      layout.push({ name: text, key: `custom_${Date.now()}`, row: maxRow, style: "none" });
      await setConfig("keyboard_layout", layout);
      cache.layout = layout;
      return ctx.reply(`✅ New button added: ${text}`);
    }

    // 🎨 THEME — Move
    if (state.startsWith("THEME_WAIT_MOVE_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("THEME_WAIT_MOVE_", ""), 10);
      delete userState[userId];
      let newRow = parseInt(text.trim(), 10);
      if (isNaN(newRow) || newRow < 0) return ctx.reply("❌ Invalid!");
      let layout = await getCurrentKeyboardLayout();
      if (idx < 0 || idx >= layout.length) return ctx.reply("❌ Button not found!");
      let btnName = layout[idx].name;
      layout[idx].row = newRow;
      await setConfig("keyboard_layout", layout);
      cache.layout = layout;
      return ctx.reply(`✅ Moved \`${btnName}\` to Row ${newRow}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎨 Back to Theme", "adm_customize_theme") });
    }

    // 📝 INLINE BUTTON NAME
    if (state.startsWith("WAITING_IBTN_NAME_") && (await isAdmin(userId))) {
      let btnKey = state.replace("WAITING_IBTN_NAME_", "");
      delete userState[userId];
      let names = await getConfig("inline_button_names", {});

      if (text.toLowerCase() === "reset") {
        delete names[btnKey];
        await setConfig("inline_button_names", names);
        return ctx.reply(`✅ Reset to default!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "istyle_edit_names") });
      }

      names[btnKey] = text.trim();
      await setConfig("inline_button_names", names);
      return ctx.reply(`✅ Button name updated!\n\n🔑 \`${btnKey}\`\n📌 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "istyle_edit_names") });
    }

    // 💰 AFM — Name
    if (state === "AFM_WAIT_NAME" && (await isAdmin(userId))) {
      delete userState[userId];
      let name = text.trim();
      if (!name) return ctx.reply("❌ Invalid!");
      global.afmTemp[userId] = { name, key: name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now().toString(36) };
      userState[userId] = "AFM_WAIT_ADDRESS";
      return ctx.reply(`✅ Name: ${name}\n\n📝 Step 2/5: Send UPI ID / Wallet Number`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") });
    }

    if (state === "AFM_WAIT_ADDRESS" && (await isAdmin(userId))) {
      delete userState[userId];
      global.afmTemp[userId].address = text.trim();
      userState[userId] = "AFM_WAIT_PHOTO";
      return ctx.reply(`✅ Address saved!\n\n📝 Step 3/5: Send Photo URL\n\n💡 Type "skip" to skip`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") });
    }

    if (state === "AFM_WAIT_PHOTO" && (await isAdmin(userId))) {
      delete userState[userId];
      global.afmTemp[userId].photo = (text.toLowerCase() === "skip") ? "" : text.trim();
      userState[userId] = "AFM_WAIT_MIN";
      return ctx.reply(`✅ Photo Set!\n\n📝 Step 4/5: Send Min Amount\n\n📌 Example: \`1\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") });
    }

    if (state === "AFM_WAIT_MIN" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid!");
      global.afmTemp[userId].min = amt;
      userState[userId] = "AFM_WAIT_MAX";
      return ctx.reply(`✅ Min: ₹${amt}\n\n📝 Step 5/5: Send Max Amount\n\n📌 Example: \`1000\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") });
    }

    if (state === "AFM_WAIT_MAX" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid!");
      let temp = global.afmTemp[userId] || {};
      temp.max = amt;
      temp.color = "none";
      temp.createdAt = new Date().toISOString();
      await addMethod(temp);
      delete global.afmTemp[userId];
      return ctx.reply(`✅ Method Added!\n\n📛 ${temp.name}\n💳 \`${temp.address}\`\n📉 ₹${temp.min} - 📈 ₹${temp.max}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back to Add Fund", "adm_addfund_menu") });
    }

    // 💰 AFM Edits
    if (state.startsWith("AFM_EDIT_NAME_") && (await isAdmin(userId))) {
      let key = state.replace("AFM_EDIT_NAME_", "");
      delete userState[userId];
      await updateMethod(key, { name: text.trim() });
      return ctx.reply(`✅ Name updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `afm_view_${key}`) });
    }

    if (state.startsWith("AFM_EDIT_ADDR_") && (await isAdmin(userId))) {
      let key = state.replace("AFM_EDIT_ADDR_", "");
      delete userState[userId];
      await updateMethod(key, { address: text.trim() });
      return ctx.reply(`✅ Address updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `afm_view_${key}`) });
    }

    if (state.startsWith("AFM_EDIT_PHOTO_") && (await isAdmin(userId))) {
      let key = state.replace("AFM_EDIT_PHOTO_", "");
      delete userState[userId];
      await updateMethod(key, { photo: text.trim() });
      return ctx.reply(`✅ Photo updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `afm_view_${key}`) });
    }

    if (state.startsWith("AFM_EDIT_MIN_") && (await isAdmin(userId))) {
      let key = state.replace("AFM_EDIT_MIN_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid!");
      await updateMethod(key, { min: amt });
      return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `afm_view_${key}`) });
    }

    if (state.startsWith("AFM_EDIT_MAX_") && (await isAdmin(userId))) {
      let key = state.replace("AFM_EDIT_MAX_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid!");
      await updateMethod(key, { max: amt });
      return ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `afm_view_${key}`) });
    }

    // 💰 ADD FUND — Amount
    if (state.startsWith("AFM_WAIT_AMOUNT_")) {
      let key = state.replace("AFM_WAIT_AMOUNT_", "");
      let m = await getMethodByKey(key);
      if (!m) { delete userState[userId]; return ctx.reply("❌ Method not found!"); }

      let amt = parseFloat(text);
      let minAmt = m.min || 1;
      let maxAmt = m.max || 1000;

      if (isNaN(amt) || amt < minAmt || amt > maxAmt) {
        return ctx.reply(`❌ Amount must be between ₹${minAmt} and ₹${maxAmt}`);
      }

      global.afmUserCache = global.afmUserCache || {};
      global.afmUserCache[userId] = { methodKey: key, amount: amt };
      userState[userId] = "AFM_WAIT_SCREENSHOT";

      await ctx.reply(
        `✅ Amount Set: ₹${amt}\n\n━━━━━━━━━━━━━━━━━━━━\n\n📌 ${m.name}: \`${m.address || "Not Set"}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\n📸 Now Send Your Payment Screenshot`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel") }
      );
      return;
    }

    // 🌐 GATEWAY — Name
    if (state === "WAITING_GW_NAME" && (await isAdmin(userId))) {
      delete userState[userId];
      let gwName = text.trim().toUpperCase();
      let existing = await Gateway.findOne({ name: gwName });
      if (existing) return ctx.reply(`❌ Gateway exists!`);
      userState[userId] = `WAITING_GW_URL_${gwName}`;
      return ctx.reply(`🌐 Gateway: ${gwName}\n\n📝 Send Gateway URL:\n\n⚠️ Placeholders: {upi} {amount} {comment} {userId} {orderId}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") });
    }

    if (state.startsWith("WAITING_GW_URL_") && (await isAdmin(userId))) {
      let gwName = state.replace("WAITING_GW_URL_", "");
      delete userState[userId];
      let url = text.trim();
      if (!url.startsWith("http")) return ctx.reply("❌ Invalid URL!");
      let existing = await Gateway.findOne({ name: gwName });
      if (existing) { existing.url = url; await existing.save(); }
      else { await Gateway.create({ name: gwName, url, isActive: false }); }
      return ctx.reply(`✅ Gateway Saved!\n\n📛 \`${gwName}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🌐 Gateway Menu", "adm_gateway_menu") });
    }

    // ✅ Verification Bot Name
    if (state === "WAITING_VERIFY_BOT_NAME" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("bot_name", text.trim());
      return ctx.reply(`✅ Bot Name set: ${text.trim()}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification") });
    }

    if (state === "WAITING_VERIFY_BOT_PHOTO" && (await isAdmin(userId))) {
      delete userState[userId];
      if (!text.startsWith("http")) return ctx.reply("❌ Invalid URL!");
      await setConfig("bot_photo_url", text.trim());
      return ctx.reply(`✅ Bot Photo URL set!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification") });
    }

    // 💬 Support ID
    if (state === "WAITING_FOR_SUPPORT_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("support_username", text.trim());
      return ctx.reply(`✅ Support updated: ${text.trim()}`);
    }

    // ⏱️ Task Time
    if (state.startsWith("WAITING_FOR_TASK_TIME_") && (await isAdmin(userId))) {
      let tId = state.replace("WAITING_FOR_TASK_TIME_", "");
      delete userState[userId];
      let mins = parseInt(text, 10);
      if (isNaN(mins)) return ctx.reply("❌ Invalid!");
      await Task.findOneAndUpdate({ taskId: tId }, { timeLimitMinutes: mins });
      return ctx.reply(`✅ Time limit: ${mins} min.`);
    }

    // 📢 Task Alert Channel
    if (state === "WAITING_FOR_TASK_ALERT_CHANNEL" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("default_task_alert_channel", text);
      return ctx.reply(`✅ Alert Channel set: ${text}`);
    }

    // 🔍 Tracker
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      let kb = new InlineKeyboard()
        .text("📜 Balance Record", `track_bal_${targetId}`).row()
        .text("🏧 Withdraw History", `track_wd_${targetId}`).row()
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
      if (!targetUser) {
        targetUser = await User.create({
          userId: targetId,
          firstName: "Unknown",
          balance: amount,
          referredBy: "Admin Added (Not Started)"
        });
        await logBalanceHistory(targetId, "Admin Added Balance (New)", amount);
        return ctx.reply(`✅ Added ₹${amount} to new user ${targetId}.\n\nBalance: ₹${amount.toFixed(2)}`);
      }
      targetUser.balance += amount;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
      return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    // ➖ Remove Balance
    if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(/\s+/);
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      targetUser.balance = Math.max(0, targetUser.balance - amount);
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
      return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("min_withdraw", amt);
      return ctx.reply(`✅ Min withdraw: ₹${amt}`);
    }
    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("max_withdraw", amt);
      return ctx.reply(`✅ Max withdraw: ₹${amt}`);
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

    // 📋 Create Task
    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
      let defaultAlertCh = await getConfig("default_task_alert_channel", "Not Set");
      await Task.create({ taskId: parts[0], title: parts[1], reward: parseFloat(parts[2]), link: parts[3], alertChannel: defaultAlertCh });
      return ctx.reply(`✅ Task '${parts[1]}' created!`);
    }

    // 📢 Broadcast Preview
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      userState[userId] = `CONFIRM_BROADCAST_${Date.now()}`;
      global.broadcastCache = global.broadcastCache || {};
      global.broadcastCache[userId] = { text };

      let preview =
        `📢 *Broadcast Preview*\n\n━━━━━━━━━━━━━━━━━━━━\n\n${text}\n\n━━━━━━━━━━━━━━━━━━━━\n\n👥 *Recipients:* ${allUsers.length}\n\n👇 Confirm?`;

      return ctx.reply(preview, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirm", "broadcast_confirm")
          .text("❌ Cancel", "broadcast_cancel")
      });
    }

    // 👑 Add Admin
    if (state === "WAITING_ADMIN_ADD" && (await isOwner(userId))) {
      delete userState[userId];
      let newAdminId = parseInt(text.trim(), 10);
      if (isNaN(newAdminId)) return ctx.reply("❌ Invalid!");
      if (newAdminId === userId) return ctx.reply("❌ You are owner!");
      let admins = await getConfig("admins", []);
      if (admins.some(id => Number(id) === Number(newAdminId))) return ctx.reply("❌ Already admin!");
      let targetUser = await User.findOne({ userId: newAdminId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      admins.push(Number(newAdminId));
      await setConfig("admins", admins);
      cache.admins = admins;
      cache.adminsTime = Date.now();

      await ctx.reply(`✅ Admin Added!\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newAdminId}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_admins") });
      try {
        await ctx.api.sendMessage(newAdminId, `🎉 *Congratulations!*\n\nYou are now an Admin!\n\nUse /admin to access.`, { parse_mode: "Markdown" });
      } catch (e) {}
      return;
    }

    // 💬 Send Message to Admin
    if (state.startsWith("WAITING_MSG_ADMIN_") && (await isOwner(userId))) {
      let adminId = parseInt(state.replace("WAITING_MSG_ADMIN_", ""), 10);
      delete userState[userId];
      try {
        await ctx.api.sendMessage(adminId, `💬 *Message from Owner:*\n\n${text}`, { parse_mode: "Markdown" });
        return ctx.reply(`✅ Sent to \`${adminId}\`!`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_admins") });
      } catch (e) { return ctx.reply("❌ Failed!"); }
    }

    // 💬 USER MESSAGE
    if (state === "WAITING_FOR_USER_MESSAGE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 2) return ctx.reply(`❌ Format: \`UserID | Message\``, { parse_mode: "Markdown" });
      let targetId = parseInt(parts[0], 10);
      let message = parts.slice(1).join("|").trim();
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");

      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);

      try {
        let userMsg = `📨 *Admin Message*\n\n━━━━━━━━━━━━━━━━━━━━\n\n${message}\n\n━━━━━━━━━━━━━━━━━━━━\n\n👤 From: Admin\n📅 ${new Date().toLocaleString('en-IN')}`;
        await ctx.api.sendMessage(targetId, userMsg, { parse_mode: "Markdown" });
        return ctx.reply(`✅ Sent to \`${targetId}\`!`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
      } catch (e) {
        return ctx.reply(`❌ Failed: ${e.message}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
      }
    }

    // 👑 Transfer Ownership
    if (state === "WAITING_NEW_OWNER" && (await isOwner(userId))) {
      delete userState[userId];
      let newOwnerId = parseInt(text.trim(), 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: newOwnerId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      let kb = new InlineKeyboard()
        .text("✅ Yes, Transfer", `admin_transfer_confirm_${newOwnerId}`).row()
        .text("❌ Cancel", "adm_admins");
      await ctx.reply(`⚠️ *Confirm Transfer*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newOwnerId}\`\n\nSure?`, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    // 📢 Add Channel
    if (state === "WAITING_CHANNEL_ADD" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length !== 2) return ctx.reply(`❌ Use: \`ChannelID | InviteLink\``, { parse_mode: "Markdown" });
      let channelId = parts[0], inviteLink = parts[1];
      if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) return ctx.reply("❌ Invalid Channel ID!");
      if (!inviteLink.startsWith("https://t.me/")) return ctx.reply("❌ Invalid Invite Link!");
      let existing = await Channel.findOne({ channelId });
      if (existing) return ctx.reply(`❌ Exists!`);

      let isBotAdmin = false, channelTitle = "", subCount = 0;
      try {
        let chatInfo = await ctx.api.getChat(channelId);
        channelTitle = chatInfo.title || channelId;
        subCount = chatInfo.member_count || 0;
        let botInfo = await ctx.api.getMe();
        let botMember = await ctx.api.getChatMember(channelId, botInfo.id);
        if (["administrator", "creator"].includes(botMember.status)) isBotAdmin = true;
      } catch (e) { return ctx.reply(`❌ Cannot access channel!`); }
      if (!isBotAdmin) return ctx.reply(`❌ Bot not admin!`);
      await Channel.create({ channelId, inviteLink, displayName: channelTitle, subscriberCount: subCount, isActive: true });
      return ctx.reply(`✅ *Channel Added!*\n\n📢 \`${channelId}\`\n📛 ${channelTitle}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_channels") });
    }

    // ✏️ Rename Channel
    if (state.startsWith("WAITING_CH_RENAME_") && (await isAdmin(userId))) {
      let safeId = state.replace("WAITING_CH_RENAME_", "");
      delete userState[userId];
      let channels = await Channel.find({});
      let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
      if (!ch) return ctx.reply("❌ Not found!");
      ch.displayName = text.trim();
      await ch.save();
      return ctx.reply(`✅ Renamed!`);
    }

    // 🔗 Update Channel Link
    if (state.startsWith("WAITING_CH_LINK_") && (await isAdmin(userId))) {
      let safeId = state.replace("WAITING_CH_LINK_", "");
      delete userState[userId];
      if (!text.startsWith("https://t.me/")) return ctx.reply("❌ Invalid link!");
      let channels = await Channel.find({});
      let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
      if (!ch) return ctx.reply("❌ Not found!");
      ch.inviteLink = text.trim();
      await ch.save();
      return ctx.reply(`✅ Link updated!`);
    }

    // 💳 SET PAYMENT METHODS
    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
      return ctx.reply(`✅ Wallet Updated!\n\n👛 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ UPI Updated!\n\n⚡ \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 Send IFSC Code`, { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() });
    }
    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim() });
      return ctx.reply(`✅ Bank Updated!\n\n🏦 \`${accNo}\`\n🔢 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_AMAZON_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text.trim() });
      return ctx.reply(`✅ Email Updated!\n\n📧 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_REDEEM_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text.trim() });
      return ctx.reply(`✅ Redeem Code Updated!\n\n🎁 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }

    // ⚡ QUICK PAY — User ID
    if (state === "QP_WAIT_USERID") {
      let targetId = parseInt(text.trim(), 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");

      let receiver = await User.findOne({ userId: targetId });
      if (!receiver) return ctx.reply(`❌ User \`${targetId}\` not found!`, { parse_mode: "Markdown" });
      if (targetId === userId) return ctx.reply("❌ Cannot send to yourself!");

      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { receiverId: targetId };
      userState[userId] = "QP_WAIT_AMOUNT";

      let sender = await getUser(userId);
      return ctx.reply(`👤 *${receiver.firstName || "User"}*\n🆔 \`${receiver.userId}\`\n\n💰 Send Amount:\n\n💵 Your Balance: ₹${sender.balance.toFixed(2)}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel") });
    }

    // ⚡ QUICK PAY — Amount
    if (state === "QP_WAIT_AMOUNT") {
      let amt = parseFloat(text.trim());
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid amount!");

      let sender = await getUser(userId);
      if (sender.balance < amt) return ctx.reply(`❌ Insufficient! Balance: ₹${sender.balance.toFixed(2)}`);

      let cacheObj = global.quickPayCache?.[userId];
      if (!cacheObj) return ctx.reply("❌ Session expired!");

      let receiver = await User.findOne({ userId: cacheObj.receiverId });
      if (!receiver) return ctx.reply("❌ Receiver not found!");

      userState[userId] = `QP_CONFIRM_${cacheObj.receiverId}_${amt}`;

      let confirmMsg =
        `⚠️ *Confirm Payment*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 To: ${receiver.firstName || "User"}\n` +
        `🆔 \`${receiver.userId}\`\n` +
        `💰 Amount: ₹${amt}\n\n` +
        `💵 Your Balance: ₹${sender.balance.toFixed(2)}\n` +
        `💸 After Payment: ₹${(sender.balance - amt).toFixed(2)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      return ctx.reply(confirmMsg, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirm", "qp_confirm")
          .text("❌ Cancel", "qp_cancel")
      });
    }

    // 🚀 WITHDRAW amount
    if (state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 1);
      let maxW = await getConfig("max_withdraw", 100);
      if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
        return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
      }
      if (user.balance < amount) return ctx.reply("❌ Insufficient!");

      let details = "";
      if (method === "Wallet") details = user.walletAccount;
      else if (method === "UPI") details = user.upiId;
      else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;

      let confirmMsg = `📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: ${details}\nAmount: ₹${amount}\n\nConfirm?`;
      let safeMethod = method.replace(/ /g, "_");
      let kb = new InlineKeyboard()
        .text("✅ Confirm", `conf_wd_${safeMethod}_${amount}`)
        .text("❌ Cancel", "canc_wd");
      return ctx.reply(confirmMsg, { reply_markup: kb, parse_mode: "Markdown" });
    }

    // 🎁 Gift redeem
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOneAndUpdate(
        { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
        { $push: { usedUsers: userId } },
        { new: true }
      );
      if (!gift) return ctx.reply("🚫 Invalid or expired!");
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);

      let notifEnabled = await getConfig("gift_notification_enabled", true);
      if (notifEnabled) {
        let payoutChannel = await getConfig("payout_channel", null);
        if (payoutChannel) {
          try {
            await ctx.api.sendMessage(payoutChannel,
              `🎁 <b>Gift Code Claimed!</b>\n\n` +
              `👤 <b>User:</b> ${user.firstName || "User"}\n` +
              `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
              `🎁 <b>Code:</b> <code>${gift.code}</code>\n` +
              `💰 <b>Amount:</b> ₹${gift.amount}\n` +
              `💵 <b>New Balance:</b> ₹${user.balance.toFixed(2)}\n` +
              `📊 <b>Progress:</b> ${gift.usedUsers.length}/${gift.maxUses}\n` +
              `📅 <b>Date:</b> ${new Date().toLocaleString('en-IN')}`,
              { parse_mode: "HTML" });
          } catch (e) {}
        }
      }
      return ctx.reply(`🎉 Gift redeemed! Added ₹${gift.amount}.`);
    }

    // 📧 Amazon codes
    if (state === "WAITING_AMAZON_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      await saveCodes(text, "amazon", ctx);
      return;
    }

    // 🎁 Redeem codes
    if (state === "WAITING_REDEEM_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      await saveCodes(text, "redeem", ctx);
      return;
    }

    // 🎁 Redeem request code entry
    if (state.startsWith("WAITING_RDM_CODE_") && (await isAdmin(userId))) {
      let reqId = state.replace("WAITING_RDM_CODE_", "");
      delete userState[userId];
      let req = await RedeemRequest.findOne({ requestId: reqId });
      if (!req || req.status !== "Pending") return ctx.reply("❌ Not found!");

      let assignedCode = text.trim();
      req.assignedCode = assignedCode;
      req.status = "Approved";
      await req.save();

      let user = await getUser(req.userId);
      user.balance -= req.amount;
      if (user.balance < 0) user.balance = 0;
      await user.save();
      let name = req.type === "amazon" ? "Amazon Gift Code" : "Redeem Code";
      await logBalanceHistory(req.userId, `${name} Manual (${assignedCode})`, -req.amount);

      await ctx.reply(`✅ Code Sent!\n\n👤 \`${req.userId}\`\n💰 ₹${req.amount}\n🎁 \`${assignedCode}\``, { parse_mode: "Markdown" });

      try {
        await ctx.api.sendMessage(req.userId, `✅ *${name} Assigned!*\n\n📌 \`${assignedCode}\`\n💰 ₹${req.amount}\n\n👆 Double-tap to copy!`, { parse_mode: "Markdown" });
      } catch (e) {}
      return;
    }

    // 🔢 Gift Code admin edit
    if (state.startsWith("WAITING_GC_AMT_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_GC_AMT_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "redeem" }, { amount: amt });
      return ctx.reply(`✅ Amount updated to ₹${amt}!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
    }

    if (state.startsWith("WAITING_GC_MAX_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_GC_MAX_", "");
      delete userState[userId];
      let maxUses = parseInt(text);
      if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "redeem" }, { maxUses });
      return ctx.reply(`✅ Max uses updated to ${maxUses}!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
    }
  }

  // ============================================================
  // 🔀 BUTTON ROUTING
  // ============================================================
  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayout();
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  // 💸 MY BALANCE — robust matching
  if (matchedKey === "btn_balance" || /balance/i.test(text)) {
    console.log("💰 Balance:", userId);

    try {
      let title = getText("balance_title", DEFAULT_TEXTS.balance_title);
      let body = getText("balance_body", DEFAULT_TEXTS.balance_body);
      let footer = getText("balance_footer", DEFAULT_TEXTS.balance_footer);

      title = String(title || "");
      body = String(body || "");
      footer = String(footer || "");
      body = body.replace(/{userId}/g, String(userId)).replace(/{balance}/g, user.balance.toFixed(2));

      let msg = `${title}\n\n${body}\n\n${footer}`;

      try {
        return await ctx.reply(msg, {
          reply_markup: await buildStyledKb([
            [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
            [
              { text: "📊 Balance Statement", callback_data: "balance_statement" },
              { text: "💬 Customer Support", callback_data: "customer_support" }
            ],
            [
              { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
              { text: "💰 Live Fund", callback_data: "live_fund" }
            ]
          ]),
          parse_mode: "HTML"
        });
      } catch (htmlErr) {
        console.log("⚠️ HTML fail, fallback:", htmlErr.message);
        let plainMsg =
          `━━━━━━ 💳 Wallet Overview ━━━━━━\n\n` +
          `🔵 Wallet ID ➝ ${userId}\n` +
          `🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\n` +
          `Built with security you can Trust.`;
        return await ctx.reply(plainMsg, {
          reply_markup: await buildStyledKb([
            [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
            [
              { text: "📊 Balance Statement", callback_data: "balance_statement" },
              { text: "💬 Customer Support", callback_data: "customer_support" }
            ],
            [
              { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
              { text: "💰 Live Fund", callback_data: "live_fund" }
            ]
          ])
        });
      }
    } catch (err) {
      console.error("❌ Balance err:", err);
      return ctx.reply(`❌ Error: ${err.message}`);
    }
  }

  // 📋 BOT TASK
  else if (matchedKey === "btn_tasks" || /task/i.test(text)) {
    let tasks = await Task.find({});
    if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available.");
    let taskButtons = [];
    tasks.forEach(t => { taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]); });
    return ctx.reply("📋 *Available Tasks:*", { reply_markup: await buildStyledKb(taskButtons), parse_mode: "Markdown" });
  }

  // 🎁 GIFT CODE
  else if (matchedKey === "btn_gift" || /gift/i.test(text)) {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code To Claim Reward!");
  }

  // ⚡ QUICK PAY
  else if (matchedKey === "btn_quickpay" || /quick.*pay/i.test(text)) {
    userState[userId] = "QP_WAIT_USERID";
    return ctx.reply(`💸 *Quick Pay*\n\n📱 Send Receiver User ID:`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel")
    });
  }

  // 💳 PAYMENT METHOD
  else if (matchedKey === "btn_payout" || /payment.*method/i.test(text)) {
    let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `\`${val}\`` : `\`Not Set\``;
    let msg =
      `✨ *Choose Payment Method*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👛 *Wallet* - ${fmt(user.walletAccount)}\n\n` +
      `⚡ *UPI* - ${fmt(user.upiId)}\n\n` +
      `🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━`;
    return ctx.reply(msg, {
      reply_markup: await buildStyledKb([
        [
          { text: "🌐 Wallet", callback_data: "set_wallet" },
          { text: "⚡ UPI", callback_data: "set_upi" }
        ],
        [{ text: "🏦 Bank", callback_data: "set_bank" }]
      ]),
      parse_mode: "Markdown"
    });
  }

  // 🚀 WITHDRAW
  else if (matchedKey === "btn_withdraw" || /withdraw/i.test(text)) {
    let walletOn = await isWithdrawEnabled("wallet");
    let upiOn = await isWithdrawEnabled("upi");
    let bankOn = await isWithdrawEnabled("bank");
    let amazonOn = await isWithdrawEnabled("amazon");
    let redeemOn = await isWithdrawEnabled("redeem");

    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, {
      reply_markup: await buildStyledKb([
        [
          { text: `${walletOn ? "🌐 Wallet" : "🔴 Wallet OFF"}`, callback_data: "wd_wallet" },
          { text: `${upiOn ? "⚡ UPI" : "🔴 UPI OFF"}`, callback_data: "wd_upi" }
        ],
        [
          { text: `${bankOn ? "🏦 Bank" : "🔴 Bank OFF"}`, callback_data: "wd_bank" },
          { text: `${redeemOn ? "🎁 Redeem" : "🔴 Redeem OFF"}`, callback_data: "wd_redeem" }
        ],
        [{ text: `${amazonOn ? "📧 Amazon" : "🔴 Amazon OFF"}`, callback_data: "wd_amazon" }]
      ]),
      parse_mode: "Markdown"
    });
  }

  // 🎁 Fallback gift
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
// 📸 PHOTO HANDLER
// ============================================================
bot.on("message:photo", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];

  // ═══ TASK PHOTO ═══
  if (state && state.startsWith("WAITING_TASK_PHOTO_")) {
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
      `⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
    );

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);

    if (alertChannel && alertChannel !== "Not Set") {
      let caption =
        `📸 *New Task Submission!*\n\n👤 ${ctx.from.first_name || "User"}\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n📅 ${new Date().toLocaleString('en-IN')}`;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
    return;
  }

  // ═══ ADD FUND SCREENSHOT ═══
  if (state === "AFM_WAIT_SCREENSHOT") {
    let cacheObj = global.afmUserCache?.[userId];
    if (!cacheObj) { delete userState[userId]; return ctx.reply("❌ Session expired!"); }

    let m = await getMethodByKey(cacheObj.methodKey);
    if (!m) { delete userState[userId]; return ctx.reply("❌ Method not found!"); }

    let photo = ctx.message.photo[ctx.message.photo.length - 1];

    delete userState[userId];
    if (global.afmUserCache) delete global.afmUserCache[userId];

    let user = await getUser(userId);
    let requestId = Math.floor(100000 + Math.random() * 900000).toString();

    await AddFund.create({
      requestId, userId,
      userName: user.firstName || "User",
      amount: cacheObj.amount,
      method: m.name,
      methodKey: m.key,
      proofFileId: photo.file_id,
      status: "Pending"
    });

    await ctx.reply(
      `✅ *Request Submitted!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n💰 Amount: ₹${cacheObj.amount}\n💳 Method: ${m.name}\n🆔 \`${requestId}\`\n\n⏳ Admin will approve shortly.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
    );

    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      let kb = new InlineKeyboard()
        .text("✅ Approve", `af_app_${requestId}`)
        .text("❌ Reject", `af_rej_${requestId}`);

      let caption =
        `💰 <b>Add Fund Request</b> (#${requestId})\n\n` +
        `<b>User :</b> ${user.firstName || "User"}\n` +
        `<b>User ID :</b> <code>${userId}</code>\n` +
        `<b>Amount :</b> ₹${cacheObj.amount}\n` +
        `<b>Method :</b> ${m.name}\n` +
        `<b>Address :</b> <code>${m.address || "Not Set"}</code>`;

      try {
        await ctx.api.sendPhoto(payoutChannel, photo.file_id, { caption, parse_mode: "HTML", reply_markup: kb });
      } catch (e) {}
    }
    return;
  }
});

// ============================================================
// ⚡ QUICK PAY — CONFIRM/CANCEL
// ============================================================
bot.callbackQuery("qp_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  await ctx.editMessageText("❌ *Quick Pay cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildKeyboardFromLayout() });
});

bot.callbackQuery("qp_confirm", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state || !state.startsWith("QP_CONFIRM_")) return ctx.answerCallbackQuery({ text: "❌ Expired!", show_alert: true });

  let parts = state.replace("QP_CONFIRM_", "").split("_");
  let targetId = parseInt(parts[0], 10);
  let amount = parseFloat(parts[1]);

  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];

  let sender = await getUser(userId);
  let receiver = await User.findOne({ userId: targetId });
  if (!receiver) return ctx.answerCallbackQuery({ text: "❌ Receiver not found!", show_alert: true });
  if (sender.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  await ctx.answerCallbackQuery({ text: "⏳ Sending..." });

  sender.balance -= amount;
  receiver.balance += amount;
  await sender.save();
  await receiver.save();

  await logBalanceHistory(sender.userId, `Quick Pay to ${receiver.userId}`, -amount);
  await logBalanceHistory(receiver.userId, `Quick Pay from ${sender.userId}`, amount);

  await ctx.editMessageText(
    `✅ *Payment Successful!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👤 To: ${receiver.firstName || "User"}\n🆔 \`${receiver.userId}\`\n💰 Amount: ₹${amount.toFixed(2)}\n\n💵 New Balance: ₹${sender.balance.toFixed(2)}\n\n━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "Markdown" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(receiver.userId,
      `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 ₹${amount.toFixed(2)}\n\n💵 Balance: ₹${receiver.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📋 TASK CLICK
// ============================================================
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  let userId = ctx.from.id;
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "Already done!", show_alert: true });
  await ctx.answerCallbackQuery();

  let detailsMsg =
    `📋 *Task Details*\n\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 *${task.link}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n📸 How to complete:\n1️⃣ Click the link\n2️⃣ Take screenshot\n3️⃣ Send here\n\n⏳ Admin will verify.`;

  return ctx.reply(detailsMsg, {
    reply_markup: await buildStyledKb([
      [{ text: "🔗 Open Task Link", url: task.link }],
      [{ text: "❌ Cancel Task", callback_data: `cancel_task_${taskId}` }]
    ]),
    parse_mode: "Markdown"
  }).then(async () => {
    userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;
    await ctx.reply("📸 *Send your screenshot now...*", { parse_mode: "Markdown" });
  });
});

bot.callbackQuery(/^cancel_task_/, async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.answerCallbackQuery({ text: "Cancelled!" });
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildKeyboardFromLayout() });
});

// ============================================================
// 📊 BALANCE / SUPPORT / LIVE
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery("🔄 Refreshed!");

  try {
    let title = getText("balance_title", DEFAULT_TEXTS.balance_title);
    let body = getText("balance_body", DEFAULT_TEXTS.balance_body);
    let footer = getText("balance_footer", DEFAULT_TEXTS.balance_footer);
    body = String(body).replace(/{userId}/g, userId).replace(/{balance}/g, user.balance.toFixed(2));
    let msg = `${title}\n\n${body}\n\n${footer}`;
    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
        [
          { text: "📊 Balance Statement", callback_data: "balance_statement" },
          { text: "💬 Customer Support", callback_data: "customer_support" }
        ],
        [
          { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
          { text: "💰 Live Fund", callback_data: "live_fund" }
        ]
      ]),
      parse_mode: "HTML"
    }).catch(() => {});
  } catch (e) {}
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30);
  let user = await getUser(userId);
  let msg = `📊 *Balance Statement*\n\n🆔 \`${userId}\`\n💰 *₹${user.balance.toFixed(2)}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (history.length === 0) msg += `📭 No transactions.`;
  else {
    let totalIn = 0, totalOut = 0;
    history.forEach((h) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      msg += `${icon} *${h.action}*\n   ${sign}₹${h.amount.toFixed(2)} • ${dateStr}\n\n`;
      if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount);
    });
    msg += `━━━━━━━━━━━━━━━━━━━━\n🟢 *Earned:* ₹${totalIn.toFixed(2)}\n🔴 *Spent:* ₹${totalOut.toFixed(2)}`;
  }
  let kb = await buildStyledKb([
    [{ text: "🔄 Refresh", callback_data: "balance_statement" }],
    [{ text: "🔙 Back", callback_data: "back_to_balance" }]
  ]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery();

  try {
    let title = getText("balance_title", DEFAULT_TEXTS.balance_title);
    let body = getText("balance_body", DEFAULT_TEXTS.balance_body);
    let footer = getText("balance_footer", DEFAULT_TEXTS.balance_footer);
    body = String(body).replace(/{userId}/g, userId).replace(/{balance}/g, user.balance.toFixed(2));
    let msg = `${title}\n\n${body}\n\n${footer}`;
    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
        [
          { text: "📊 Balance Statement", callback_data: "balance_statement" },
          { text: "💬 Customer Support", callback_data: "customer_support" }
        ],
        [
          { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
          { text: "💰 Live Fund", callback_data: "live_fund" }
        ]
      ]),
      parse_mode: "HTML"
    }).catch(() => {});
  } catch (e) {}
});

bot.callbackQuery("customer_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let supportId = await getConfig("support_username", null);
  if (!supportId || supportId === "Not Set") return ctx.reply(`💬 *Customer Support*\n\n⚠️ Support not set.`, { parse_mode: "Markdown" });
  let link = /^\d+$/.test(supportId) ? `tg://user?id=${supportId}` : `https://t.me/${supportId.replace('@', '')}`;
  let kb = new InlineKeyboard().url("💬 Contact Support", link);
  await ctx.reply(`💬 *Customer Support*\n\nClick below:`, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading...");
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });
  let msg =
    `💰 *Live Fund Report*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👥 *Users:* \`${users.length}\`\n💵 *Total:* \`₹${totalBalance.toFixed(2)}\`\n\n━━━━━━━━━━━━━━━━━━━━`;
  let kb = await buildStyledKb([
    [{ text: "🔄 Refresh", callback_data: "live_fund" }],
    [{ text: "🔙 Back", callback_data: "back_to_balance" }]
  ]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 💳 SET PAYMENT METHODS
// ============================================================
bot.callbackQuery("set_wallet", async (ctx) => {
  userState[ctx.from.id] = "SET_WALLET_ACC";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`🌐 *Send Wallet ID*`, { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() });
});
bot.callbackQuery("set_upi", async (ctx) => {
  userState[ctx.from.id] = "SET_UPI_ACC";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`⚡ *Send UPI Address*`, { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() });
});
bot.callbackQuery("set_bank", async (ctx) => {
  userState[ctx.from.id] = "SET_BANK_ACCNO";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`🏦 *Send Account Number*`, { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() });
});

// ============================================================
// 🚀 WITHDRAW HANDLERS
// ============================================================
async function promptWithdrawalAmount(ctx, method) {
  let toggleKey = method.toLowerCase();
  if (!(await isWithdrawEnabled(toggleKey))) {
    return ctx.answerCallbackQuery({ text: `❌ ${method} OFF!`, show_alert: true });
  }

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
bot.callbackQuery("wd_amazon", async (ctx) => {
  if (!(await isWithdrawEnabled("amazon"))) return ctx.answerCallbackQuery({ text: "❌ Amazon OFF!", show_alert: true });
  await handleRedeemWithdraw(ctx, "amazon");
});
bot.callbackQuery("wd_redeem", async (ctx) => {
  if (!(await isWithdrawEnabled("redeem"))) return ctx.answerCallbackQuery({ text: "❌ Redeem OFF!", show_alert: true });
  await handleRedeemWithdraw(ctx, "redeem");
});

// ============================================================
// 🎁 REDEEM/AMAZON WITHDRAW
// ============================================================
async function handleRedeemWithdraw(ctx, type) {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let icon = type === "amazon" ? "📧" : "🎁";
  let name = type === "amazon" ? "Amazon Gift Code" : "Redeem Code";

  let amounts = [10, 50, 100, 200, 500];
  let kb = new InlineKeyboard();
  for (let i = 0; i < amounts.length; i += 3) {
    let row = amounts.slice(i, i + 3);
    row.forEach(a => { kb = kb.text(`₹${a}`, `rdm_amt_${type}_${a}`); });
    kb = kb.row();
  }
  kb = kb.text("🔙 Cancel", "canc_rdm");

  await ctx.answerCallbackQuery();
  await ctx.reply(`${icon} *${name}*\n\n💰 Balance: ₹${user.balance.toFixed(2)}\n\n👇 Choose:`, { parse_mode: "Markdown", reply_markup: kb });
}

bot.callbackQuery(/^rdm_amt_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("rdm_amt_", "").split("_");
  let type = parts[0];
  let amount = parseFloat(parts[1]);
  let userId = ctx.from.id;
  let user = await getUser(userId);

  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  let mode = await getConfig(type === "amazon" ? "amazon_mode" : "redeem_mode", "manual");
  let icon = type === "amazon" ? "📧" : "🎁";
  let name = type === "amazon" ? "Amazon Gift Code" : "Redeem Code";

  if (type === "amazon" && (!user.amazonEmail || user.amazonEmail === "Not Set")) return ctx.answerCallbackQuery({ text: "⚠️ Set Amazon email first!", show_alert: true });
  if (type === "redeem" && (!user.redeemCodeAddr || user.redeemCodeAddr === "Not Set")) return ctx.answerCallbackQuery({ text: "⚠️ Set Redeem Code first!", show_alert: true });
  await ctx.answerCallbackQuery();

  if (mode === "auto") {
    let gift = await GiftCode.findOneAndUpdate(
      { type, amount, usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } },
      { new: true, sort: { createdAt: 1 } }
    );
    if (!gift) return ctx.editMessageText(`❌ No codes available!`, { parse_mode: "Markdown" });

    user.balance -= amount;
    await user.save();
    await logBalanceHistory(userId, `${name} Auto (${gift.code})`, -amount);

    await ctx.editMessageText(
      `✅ *${name} Assigned!*\n\n📌 \`${gift.code}\`\n💰 ₹${gift.amount}\n\n💵 Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
    );
    return;
  }

  let requestId = Math.floor(100000 + Math.random() * 900000).toString();
  await RedeemRequest.create({
    requestId, userId, userName: user.firstName || "User",
    userEmail: type === "amazon" ? user.amazonEmail : user.redeemCodeAddr,
    amount, type, status: "Pending"
  });

  await ctx.editMessageText(
    `⏳ *Request Submitted!*\n\n📌 ${name}\n💰 ₹${amount}\n🆔 \`${requestId}\``,
    { parse_mode: "Markdown" }
  );

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    let msg = `🔔 *${name} Request*\n\n👤 ${user.firstName || "User"}\n🆔 \`${user.userId}\`\n💰 ₹${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `rdm_app_${requestId}`)
      .text("❌ Reject", `rdm_rej_${requestId}`);
    try { await ctx.api.sendMessage(payoutChannel, msg, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
  }
});

bot.callbackQuery("canc_rdm", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🎁 ADD FUND — Method Select / Cancel
// ============================================================
bot.callbackQuery("add_fund_btn", async (ctx) => {
  let userId = ctx.from.id;
  let addFundEnabled = await getConfig("add_fund_enabled", true);
  if (!addFundEnabled) return ctx.answerCallbackQuery({ text: "❌ Add Fund is OFF!", show_alert: true });

  let methods = await getAddFundMethods();
  if (methods.length === 0) return ctx.answerCallbackQuery({ text: "❌ No methods set!", show_alert: true });

  await ctx.answerCallbackQuery();

  let kb = new InlineKeyboard();
  for (let m of methods) {
    kb = kb.text(`${m.name}`, `afm_user_${m.key}`).row();
  }
  kb = kb.text("❌ Cancel", "add_fund_cancel");

  await ctx.reply(`🍊 *Select A Method To Add Fund:*`, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^afm_user_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let key = ctx.callbackQuery.data.replace("afm_user_", "");
  let m = await getMethodByKey(key);
  if (!m) return ctx.reply("❌ Method not found!");

  let userId = ctx.from.id;

  if (m.photo) {
    try { await ctx.replyWithPhoto(m.photo, { caption: `💠 *${m.name}*`, parse_mode: "Markdown" }); } catch (e) {}
  }

  let styledDeposit = toSmallCaps("Deposit");
  let styledEnter = toSmallCaps("Enter the amount you wish to deposit:");
  let styledMust = toSmallCaps("Amount Must Be Between");

  let msg =
    `💠 ${m.name.toUpperCase()} ${styledDeposit}\n\n` +
    `✨ ${styledEnter}\n` +
    `${styledMust} ₹${m.min || 1} ᴀɴᴅ ₹${m.max || 1000}\n\n` +
    `📌 ${m.name}: \`${m.address || "Not Set"}\``;

  userState[userId] = `AFM_WAIT_AMOUNT_${key}`;

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel")
  });
});

bot.callbackQuery("add_fund_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.afmUserCache) delete global.afmUserCache[userId];
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🏧 WITHDRAWAL CONFIRM
// ============================================================
bot.callbackQuery(/^conf_wd_/, async (ctx) => {
  let dataParts = ctx.callbackQuery.data.replace("conf_wd_", "").split("_");
  let amount = parseFloat(dataParts[dataParts.length - 1]);
  let method = dataParts.slice(0, dataParts.length - 1).join(" ");
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let details = "";
  if (method === "Wallet") details = user.walletAccount;
  else if (method === "UPI") details = user.upiId;
  else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;

  let prevCount = await Withdrawal.countDocuments({ userId });
  let userWithdrawalCount = prevCount + 1;

  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  await Withdrawal.create({
    withdrawalId, userId, userWithdrawalCount,
    amount, method, details
  });

  await ctx.answerCallbackQuery({ text: "Submitted!" });
  await ctx.editMessageText(
    `✅ Withdrawal of ₹${amount} via ${method} submitted!\n\n🆔 #${userWithdrawalCount}\n⏳ Status: Pending`,
    { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
  ).catch(() => {});

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel) {
    let adminKb = new InlineKeyboard()
      .text("✅ Approve", `wd_app_${withdrawalId}`)
      .text("❌ Reject", `wd_rej_${withdrawalId}`);

    let { tax, afterTax } = calculateTax(amount);

    try {
      await ctx.api.sendMessage(payoutChannel,
        `⚠️ <b>New ${method.toUpperCase()} Payout Request!</b> (#${userWithdrawalCount})\n\n` +
        `<b>User :</b> <code>${userId}</code>\n` +
        `<b>Request Amount :</b> ₹${amount}\n` +
        `<b>Amount After Tax (${tax.toFixed(1)}) :</b> ₹${afterTax}\n` +
        `<b>${method} :</b> <code>${details}</code>`,
        { parse_mode: "HTML", reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Withdrawal cancelled.").catch(() => {});
});

// ============================================================
// 🌐 WITHDRAWAL APPROVE
// ============================================================
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

  let gateway = await Gateway.findOne({ isActive: true });
  if (!gateway) {
    await manualApprove(ctx, wd);
    return;
  }

  let result = await callGatewayApi(gateway, {
    upi: wd.details,
    amount: wd.amount,
    comment: `Withdrawal #${wd.userWithdrawalCount || wId}`,
    userId: wd.userId,
    orderId: wId
  });

  if (!result.success) {
    await ctx.reply(
      `❌ *Gateway API Failed!*\n\n🌐 Gateway: \`${gateway.name}\`\n📛 Error: ${result.error}\n\n💡 Try again or manual approve.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔁 Retry", `wd_app_${wId}`).text("✅ Manual", `wd_manual_${wId}`) }
    );
    return;
  }

  let txnNumber = result.data?.txn_id || result.data?.txnNumber || generateTxnNumber();
  wd.status = "Approved";
  wd.gateway = gateway.name;
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let maskedDetails = maskDetails(wd.method, wd.details);
  let { tax, afterTax } = calculateTax(wd.amount);
  let displayCount = wd.userWithdrawalCount || wId;

  let updatedChannelMsg =
    `⚠️ <b>New ${wd.method.toUpperCase()} Payout Request!</b> (#${displayCount})\n\n` +
    `<b>User :</b> <code>${wd.userId}</code>\n` +
    `<b>Request Amount :</b> ₹${wd.amount}\n` +
    `<b>Amount After Tax (${tax.toFixed(1)}) :</b> ₹${afterTax}\n` +
    `<b>${wd.method} :</b> <code>${maskedDetails}</code>\n` +
    `<b>Transaction ID :</b> <code>${txnNumber}</code>\n` +
    `<b>Gateway :</b> ${gateway.name}\n\n` +
    `✅ <b>Approved by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}</b>`;

  await ctx.editMessageText(updatedChannelMsg, { parse_mode: "HTML" }).catch(() => {});
  await sendSuccessMessage(ctx, wd, gateway.name, txnNumber);
});

bot.callbackQuery(/^wd_manual_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_manual_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "✅ Manual approving..." });
  await manualApprove(ctx, wd);
});

async function manualApprove(ctx, wd) {
  let txnNumber = generateTxnNumber();
  let gateway = await Gateway.findOne({ isActive: true });
  let gatewayName = gateway ? gateway.name : "TASK EARN";

  wd.status = "Approved";
  wd.gateway = gatewayName;
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let maskedDetails = maskDetails(wd.method, wd.details);
  let { tax, afterTax } = calculateTax(wd.amount);
  let displayCount = wd.userWithdrawalCount || wd.withdrawalId;

  let channelMsg =
    `⚠️ <b>New ${wd.method.toUpperCase()} Payout Request!</b> (#${displayCount})\n\n` +
    `<b>User :</b> <code>${wd.userId}</code>\n` +
    `<b>Request Amount :</b> ₹${wd.amount}\n` +
    `<b>Amount After Tax (${tax.toFixed(1)}) :</b> ₹${afterTax}\n` +
    `<b>${wd.method} :</b> <code>${maskedDetails}</code>\n` +
    `<b>Transaction ID :</b> <code>${txnNumber}</code>\n\n` +
    `✅ <b>Approved by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}</b>`;

  await ctx.editMessageText(channelMsg, { parse_mode: "HTML" }).catch(() => {});
  await sendSuccessMessage(ctx, wd, gatewayName, txnNumber);
}

async function sendSuccessMessage(ctx, wd, gatewayName, txnNumber) {
  let amount = wd.amount.toFixed(2);
  let destination = wd.details || wd.userId;
  let dateStr = formatDateTime(wd.approvedAt || new Date());

  let accountType = wd.method === "UPI" ? "UPI" : (wd.method === "Wallet" ? "Wallet" : (wd.method === "Bank" ? "Bank" : (wd.method === "Amazon" ? "Amazon" : "Redeem")));

  let userMsg =
    `🎁Your Withdrawal of Rs.${amount} is Successfully Processed!🔥🔥\n\n` +
    `🏦 Destination ==> ${destination}\n` +
    `🚀Transaction ID ==> ${txnNumber}\n` +
    `🗓 Date ==> ${dateStr}\n\n` +
    `✅Please Check Your ${gatewayName} ${accountType} Account!`;

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

  let kb = new InlineKeyboard().url("🚀 Check Status", receiptUrl);

  try {
    await ctx.api.sendMessage(wd.userId, userMsg, { reply_markup: kb });
  } catch (e) { console.error("User notify:", e.message); }
}

bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  wd.status = "Rejected";
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Withdrawal Refunded`, wd.amount);

  await ctx.answerCallbackQuery({ text: "Rejected & Refunded!" });

  let maskedDetails = maskDetails(wd.method, wd.details);
  let displayCount = wd.userWithdrawalCount || wId;

  let rejectMsg =
    `⚠️ <b>Payout Request</b> (#${displayCount})\n\n` +
    `<b>User :</b> <code>${wd.userId}</code>\n` +
    `<b>Amount :</b> ₹${wd.amount}\n` +
    `<b>${wd.method} :</b> <code>${maskedDetails}</code>\n\n` +
    `❌ <b>REJECTED by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}</b>`;

  await ctx.editMessageText(rejectMsg, { parse_mode: "HTML" }).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId,
      `❌ *Withdrawal Rejected!*\n\n🆔 \`#${displayCount}\`\n💰 ₹${wd.amount}\n\n💵 Refunded.\n\nNew Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
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
  sub.status = "Approved";
  await sub.save();
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
      `🎉 *Payment Received!*\n\n📌 *${sub.taskTitle}*\n💰 *₹${sub.reward}*\n✅ Approved`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });
  sub.status = "Rejected";
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED*`,
    parse_mode: "Markdown"
  }).catch(() => {});
  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ *Task Rejected!*\n\n📌 *${sub.taskTitle}*\n💰 *₹${sub.reward}*\n\nProof not valid.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📢 BROADCAST
// ============================================================
bot.callbackQuery("broadcast_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "❌ Expired!", show_alert: true });

  delete userState[userId];
  delete global.broadcastCache[userId];

  await ctx.answerCallbackQuery({ text: "⏳ Broadcasting..." });

  let allUsers = await User.find({});
  let count = 0, failed = 0;
  let sentMsgIds = [];
  let bcId = Date.now().toString();

  for (let u of allUsers) {
    try {
      let sent = await ctx.api.sendMessage(u.userId, cacheObj.text);
      sentMsgIds.push({ userId: u.userId, messageId: sent.message_id });
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }

  global.broadcastRecords = global.broadcastRecords || {};
  global.broadcastRecords[bcId] = sentMsgIds;

  await ctx.editMessageText(
    `✅ *Broadcast Complete!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Sent: ${count}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}\n\n` +
    `🆔 \`${bcId}\`\n\n━━━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🗑️ Remove Broadcast", `broadcast_remove_${bcId}`).row()
        .text("🔙 Back to Admin", "admin")
    }
  ).catch(() => {});
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.broadcastCache) delete global.broadcastCache[userId];
  await ctx.editMessageText("❌ *Broadcast cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^broadcast_remove_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let bcId = ctx.callbackQuery.data.replace("broadcast_remove_", "");
  await ctx.answerCallbackQuery({ text: "🗑️ Removing..." });

  let sentMsgIds = global.broadcastRecords?.[bcId];
  if (!sentMsgIds || sentMsgIds.length === 0) {
    return ctx.editMessageText("❌ *Record not found.*", { parse_mode: "Markdown" }).catch(() => {});
  }

  let removed = 0, failed = 0;
  for (let item of sentMsgIds) {
    try {
      await ctx.api.deleteMessage(item.userId, item.messageId);
      removed++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }

  delete global.broadcastRecords[bcId];

  await ctx.editMessageText(
    `🗑️ *Broadcast Removed!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n✅ Removed: ${removed}\n❌ Failed: ${failed}\n🆔 \`${bcId}\`\n\n━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back to Admin", "admin") }
  ).catch(() => {});
});

// ============================================================
// 💰 ADD FUND APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^af_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_app_", "");
  let req = await AddFund.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Approved";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();

  let user = await getUser(req.userId);
  user.balance += req.amount;
  await user.save();
  await logBalanceHistory(req.userId, `Add Fund Approved (#${reqId})`, req.amount);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${req.userName}\n` +
    `<b>User ID :</b> <code>${req.userId}</code>\n` +
    `<b>Amount :</b> ₹${req.amount}\n` +
    `<b>Method :</b> ${req.method}\n\n` +
    `✅ <b>Approved by ${req.approvedBy} at ${formatDateTime(req.approvedAt)}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => {});
  });

  try {
    await ctx.api.sendMessage(req.userId,
      `✅ *Add Fund Approved!*\n\n💰 ₹${req.amount} added\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^af_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_rej_", "");
  let req = await AddFund.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${req.userName}\n` +
    `<b>User ID :</b> <code>${req.userId}</code>\n` +
    `<b>Amount :</b> ₹${req.amount}\n` +
    `<b>Method :</b> ${req.method}\n\n` +
    `❌ <b>Rejected by ${req.approvedBy} at ${formatDateTime(req.approvedAt)}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => {});
  });

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Add Fund Rejected*\n\n💰 ₹${req.amount}\n\nContact support.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🎁 REDEEM APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^rdm_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_app_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  userState[ctx.from.id] = `WAITING_RDM_CODE_${reqId}`;
  await ctx.answerCallbackQuery({ text: "Send code" });

  let icon = req.type === "amazon" ? "📧" : "🎁";
  await ctx.reply(
    `📝 *Send code for user:*\n\n🆔 \`${req.userId}\`\n💰 ₹${req.amount}\n${icon} ${req.type}\n\n👉 Send:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `rdm_rej_${reqId}`) }
  );
});

bot.callbackQuery(/^rdm_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_rej_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  await req.save();
  delete userState[ctx.from.id];

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ *REJECTED*`).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Request Rejected*\n\n🆔 \`${req.requestId}\`\n💰 ₹${req.amount}\n\nContact support.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 👑 ADMIN CALLBACKS
// ============================================================
bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});
bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});
bot.callbackQuery("adm_user_tracker", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 Send User ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_users_menu") });
});
bot.callbackQuery("adm_set_min_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Min Withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});
bot.callbackQuery("adm_set_max_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Max Withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});
bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Payout Channel:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});
bot.callbackQuery("adm_reset_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Send UserID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText(`📢 *Broadcast Message*\n\nSend the message:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});
bot.callbackQuery("adm_user_message", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  await ctx.editMessageText(`💬 *Send Message to User*\n\n📝 Format:\n\`UserID | Message\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") }).catch(() => {});
});

// ============================================================
// 🔍 USER TRACKER
// ============================================================
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `📊 *Balance Record (${targetId})*\n\n`;
  if (history.length === 0) msg += "No records.";
  else history.forEach((h, idx) => {
    let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. *${h.action}*: ₹${h.amount} (${dateStr})\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `🏧 *Withdraw History (${targetId})*\n\n`;
  if (withdrawals.length === 0) msg += "No records.";
  else withdrawals.forEach((w, idx) => {
    let dateStr = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. ₹${w.amount} | ${w.method}\n   ${w.status} | ${dateStr}\n\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_ref_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return;
  let kb = new InlineKeyboard()
    .text("📜 Balance", `track_bal_${targetId}`).row()
    .text("🏧 Withdraw", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(generateTrackerText(targetUser), { reply_markup: kb }).catch(() => {});
});

// ============================================================
// 📊 ALL USERS BALANCE
// ============================================================
bot.callbackQuery("adm_all_balances", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) return ctx.reply("📊 No users.");

  let totalBalance = 0;
  let chunks = [];
  let current = `📊 *All Users Balance List*\n\n━━━━━━━━━━━━━━━━━━━━\n`;

  users.forEach((u, idx) => {
    totalBalance += u.balance;
    let line = `\`${idx + 1}.\` 🆔 \`${u.userId}\`\n    💰 ₹${u.balance.toFixed(2)}\n\n`;
    if (current.length + line.length > 3500) { chunks.push(current); current = ""; }
    current += line;
  });

  let summary = `━━━━━━━━━━━━━━━━━━━━\n👥 Total: \`${users.length}\`\n💵 Balance: \`₹${totalBalance.toFixed(2)}\``;
  if (current.length + summary.length > 4000) { chunks.push(current); current = summary; }
  else current += summary;
  chunks.push(current);

  let kb = new InlineKeyboard().text("🔙 Back", "admin");
  for (let i = 0; i < chunks.length; i++) {
    if (i === chunks.length - 1) await ctx.reply(chunks[i], { parse_mode: "Markdown", reply_markup: kb });
    else await ctx.reply(chunks[i], { parse_mode: "Markdown" });
  }
});

// ============================================================
// 🔄 RESET ALL BALANCE
// ============================================================
bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let userCount = await User.countDocuments({});
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance || 0; });

  let text =
    `⚠️ *RESET ALL BALANCES* ⚠️\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 Users: \`${userCount}\`\n💰 Balance: \`₹${totalBalance.toFixed(2)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n⚠️ WARNING!\n\n• ALL balances → ₹0\n• Cannot be undone!\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n👇 Confirm?`;

  let kb = new InlineKeyboard()
    .text("✅ Yes, Reset All", "adm_reset_all_confirm").row()
    .text("❌ Cancel", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });

  let users = await User.find({});
  let totalBalanceBefore = 0;
  users.forEach(u => { totalBalanceBefore += u.balance || 0; });
  let totalUsers = users.length;

  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });

  for (let u of users) {
    if (u.balance && u.balance > 0) {
      try { await logBalanceHistory(u.userId, "Admin: Global Reset", -u.balance); } catch (e) {}
    }
  }

  let text =
    `✅ *ALL BALANCES RESET!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 Users: \`${totalUsers}\`\n💰 Before: \`₹${totalBalanceBefore.toFixed(2)}\`\n` +
    `💵 After: \`₹0.00\`\n\n━━━━━━━━━━━━━━━━━━━━`;

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// 👑 TRANSFER OWNERSHIP CONFIRM
// ============================================================
bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);

  let currentOwner = ctx.from.id;
  let admins = await getConfig("admins", []);
  if (!admins.some(id => Number(id) === Number(currentOwner))) admins.push(Number(currentOwner));
  await setConfig("admins", admins);
  await setConfig("owner_id", newOwnerId);
  cache.admins = admins;
  cache.ownerId = newOwnerId;
  cache.adminsTime = Date.now();

  await ctx.answerCallbackQuery({ text: "👑 Transferred!" });
  await ctx.editMessageText(
    `✅ *Ownership Transferred!*\n\n👑 New Owner: \`${newOwnerId}\``,
    { parse_mode: "Markdown" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(newOwnerId,
      `👑 *Congratulations!*\n\nYou are now the *Owner*!\n\nUse /admin to access.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({});
  let keyboard = new InlineKeyboard();
  if (tasks.length === 0) keyboard.text("📂 No Tasks", "noop").row();
  else tasks.forEach(t => {
    keyboard.text(`📄 ${t.title}`, `view_task_${t.taskId}`)
            .text("✏️", `edit_task_${t.taskId}`)
            .text("🗑️", `del_task_${t.taskId}`).row();
  });
  keyboard.text("➕ Add New Task", "adm_create_task").row();
  keyboard.text("➕ Add Channel For Task Alert", "adm_add_task_channel").row();
  keyboard.text("🔙 Back", "admin");
  let taskText = "💡 *Manage Tasks*\n\nSelect a task:";
  if (ctx.callbackQuery) await ctx.editMessageText(taskText, { reply_markup: keyboard, parse_mode: "Markdown" }).catch(() => {});
  else await ctx.reply(taskText, { reply_markup: keyboard, parse_mode: "Markdown" });
}

bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

bot.callbackQuery(/^view_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let msg = `📋 *Task Details*\n\n🆔 ${task.taskId}\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}\n⏱️ ${task.timeLimitMinutes > 0 ? task.timeLimitMinutes + ' min' : 'Not Set'}\n🔔 ${task.alertEnabled ? '✅ ON' : '❌ OFF'}`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit", `edit_task_${task.taskId}`)
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^edit_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("edit_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(`✏️ *Edit Task: ${task.title}*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^toggle_t_alert_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("toggle_t_alert_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  task.alertEnabled = !task.alertEnabled;
  await task.save();
  await ctx.answerCallbackQuery({ text: `Alert ${task.alertEnabled ? 'ON' : 'OFF'}` });
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(`✏️ *Edit Task: ${task.title}*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^set_t_time_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("set_t_time_", "");
  userState[ctx.from.id] = `WAITING_FOR_TASK_TIME_${tId}`;
  await ctx.editMessageText(`⏱️ Set Time Limit:\n\nSend minutes:`, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`), parse_mode: "Markdown"
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
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_ALERT_CHANNEL";
  await ctx.editMessageText("📢 *Add Task Alert Channel*\n\nSend channel ID:", {
    reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager"), parse_mode: "Markdown"
  });
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText("📋 Format: TaskID | Title | Reward | Link", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});

// ============================================================
// 📧 AMAZON PANEL
// ============================================================
async function renderAmazonPanel(ctx) {
  let mode = await getConfig("amazon_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";
  let codeCount = await GiftCode.countDocuments({ type: "amazon" });
  let availableCount = await GiftCode.countDocuments({ type: "amazon", $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } });

  let msg =
    `📧 *Amazon Gift Code*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📌 Mode: ${toggleLabel}\n📦 Total: ${codeCount}\n✅ Available: ${availableCount}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(toggleLabel === "📝 Manual" ? "⚡ Auto" : "📝 Manual", "toggle_amazon_mode").row()
    .text("➕ Add Code", "adm_amazon_add").row()
    .text("📋 View All Codes", "adm_amazon_list").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
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
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_AMAZON_CODES";
  await ctx.editMessageText(`➕ *Add Amazon Code*\n\n📝 Format: \`CODE AMOUNT\`\n\n📌 Example: \`AMZ100 100\``, {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon")
  }).catch(() => {});
});

bot.callbackQuery("adm_amazon_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(50);
  if (codes.length === 0) return ctx.reply("📦 No Amazon codes yet.");
  let text = `📋 *Amazon Codes (${codes.length})*\n\n`;
  codes.forEach((c, i) => {
    let used = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    text += `${i+1}. ${used} \`${c.code}\` — ₹${c.amount}\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_amazon") });
});

// ============================================================
// 🎁 REDEEM PANEL
// ============================================================
async function renderRedeemPanel(ctx) {
  let mode = await getConfig("redeem_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";
  let codeCount = await GiftCode.countDocuments({ type: "redeem" });
  let availableCount = await GiftCode.countDocuments({ type: "redeem", $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } });

  let msg =
    `🎁 *Redeem Code*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📌 Mode: ${toggleLabel}\n📦 Total: ${codeCount}\n✅ Available: ${availableCount}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(toggleLabel === "📝 Manual" ? "⚡ Auto" : "📝 Manual", "toggle_redeem_mode").row()
    .text("➕ Add Code", "adm_redeem_add").row()
    .text("📋 View All Codes", "adm_redeem_list").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
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
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.editMessageText(`➕ *Add Redeem Code*\n\n📝 Format: \`CODE AMOUNT\``, {
    parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_redeem")
  }).catch(() => {});
});

bot.callbackQuery("adm_redeem_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(50);
  if (codes.length === 0) return ctx.reply("📦 No Redeem codes yet.");
  let text = `📋 *Redeem Codes (${codes.length})*\n\n`;
  codes.forEach((c, i) => {
    let used = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    text += `${i+1}. ${used} \`${c.code}\` — ₹${c.amount}\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem") });
});

// ============================================================
// 💾 SHARED: Save Codes
// ============================================================
async function saveCodes(text, type, ctx) {
  let lines = text.trim().split("\n").filter(l => l.trim() !== "");
  let added = [], failed = [];

  for (let line of lines) {
    let parts = line.trim().split(/\s+/);
    if (parts.length !== 2) { failed.push(`${line} (invalid)`); continue; }
    let code = parts[0].trim();
    let amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) { failed.push(`${line} (invalid)`); continue; }
    let existing = await GiftCode.findOne({ code, type });
    if (existing) { failed.push(`${code} (exists)`); continue; }
    await GiftCode.create({ code, amount, type, maxUses: 1, usedUsers: [] });
    added.push(`✅ \`${code}\` → ₹${amount}`);
  }

  let icon = type === "amazon" ? "📧" : "🎁";
  let title = type === "amazon" ? "Amazon Gift Codes" : "Redeem Codes";
  let summary = `${icon} *${title} Added*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (added.length > 0) summary += `✅ Added (${added.length}):\n${added.join("\n")}\n\n`;
  if (failed.length > 0) summary += `❌ Failed (${failed.length}):\n${failed.map(f => `• ${f}`).join("\n")}\n\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n\n📊 Added: ${added.length}\n❌ Failed: ${failed.length}`;

  await ctx.reply(summary, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", type === "amazon" ? "adm_amazon" : "adm_redeem")
  });
}

// ============================================================
// 🚀 /START COMMAND
// ============================================================
bot.command("start", async (ctx) => {
  try {
    console.log("🚀 /start:", ctx.from.id);
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
        `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n💰 ₹${user.balance.toFixed(2)}\n📅 ${new Date().toLocaleString('en-IN')}`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      try { await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb }); } catch (e) {}
    }

    if (user.isBanned) return ctx.reply("❌ You are banned from using this bot.");

    let verifyEnabled = await getConfig("verification_enabled", false);
    if (verifyEnabled) {
      let verifyRec = await Verification.findOne({ userId });
      if (!verifyRec || !verifyRec.verified) {
        let miniAppUrl = process.env.MINIAPP_URL || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/miniapp/verify` : null);
        if (miniAppUrl) {
          return ctx.reply(
            `✅ *Verification Required*\n\n🔒 Please verify your device.\n\n👇 Click below:`,
            { parse_mode: "Markdown", reply_markup: new InlineKeyboard().webApp("✅ Verify Now", miniAppUrl) }
          );
        }
      }
    }

    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) {
      let channels = await Channel.find({ isActive: true });
      let keyboard = new InlineKeyboard();
      channels.forEach((ch) => {
        keyboard.url(`📢 Join ${ch.displayName || ch.channelId}`, ch.inviteLink).row();
      });
      keyboard.text("✅ I have Joined", "check_join");
      let joinText = await getConfig("text_forced_join",
        "⚠️ *You must join our channels to use this bot!*");
      return ctx.reply(joinText, { reply_markup: keyboard, parse_mode: "Markdown" });
    }

    let welcomeText = DEFAULT_TEXTS.start_welcome;
    try {
      let template = getText("start_welcome", DEFAULT_TEXTS.start_welcome);
      welcomeText = String(template || DEFAULT_TEXTS.start_welcome).replace(/{name}/g, ctx.from.first_name || "User");
    } catch (e) {
      welcomeText = DEFAULT_TEXTS.start_welcome;
    }

    let miniAppUrl = process.env.MINIAPP_URL || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/miniapp` : null);

    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(), parse_mode: "HTML" });
    } catch (htmlErr) {
      console.log("⚠️ /start HTML fail:", htmlErr.message);
      await ctx.reply(`👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome! Use buttons below:`, { reply_markup: await buildKeyboardFromLayout() });
    }

    if (miniAppUrl) {
      await ctx.reply("📱 *Open Mini App:*", {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().webApp("🚀 Open Mini App", miniAppUrl)
      }).catch(() => {});
    }
  } catch (err) {
    console.error("❌ /start err:", err);
    try { await ctx.reply(`❌ Error: ${err.message}`); } catch (e) {}
  }
});

bot.callbackQuery("check_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ Join all channels first!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  let welcomeText = "👋 Welcome!";
  try {
    let template = getText("start_welcome", DEFAULT_TEXTS.start_welcome);
    welcomeText = String(template).replace(/{name}/g, ctx.from.first_name || "User");
  } catch (e) { welcomeText = "👋 Welcome!"; }
  await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(), parse_mode: "HTML" }).catch(async () => {
    await ctx.reply("👋 Welcome!", { reply_markup: await buildKeyboardFromLayout() });
  });
});

// ============================================================
// 🎁 GIFT CODE MANAGEMENT
// ============================================================
async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(30);
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let notifEnabled = await getConfig("gift_notification_enabled", true);

  let text =
    `🎁 *Gift Code Management*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Total: ${totalCodes}\n🔔 Notif: ${notifEnabled ? "✅" : "❌"}\n\n💡 Click code:`;

  let kb = new InlineKeyboard();
  for (let c of codes) {
    let icon = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    kb = kb.text(`${icon} ${shortCode} — ₹${c.amount} (${c.usedUsers.length}/${c.maxUses})`, `gc_view_${c.code}`).row();
  }
  kb = kb.text(notifEnabled ? "🔕 OFF" : "🔔 ON", "gc_notif_toggle").row();
  kb = kb.text("➕ Add Code", "adm_redeem_add").row();
  kb = kb.text("📊 Claims Report", "gc_claims_report").row();
  kb = kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  let text =
    `🎁 *Code: \`${gc.code}\`*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💰 Amount: ₹${gc.amount}\n👥 Max: ${gc.maxUses}\n✅ Claimed: ${gc.usedUsers.length}\n📊 Remaining: ${gc.maxUses - gc.usedUsers.length}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Amount", `gc_edit_amt_${gc.code}`)
    .text("👥 Max", `gc_edit_max_${gc.code}`).row()
    .text("📋 Claims", `gc_claims_${gc.code}`).row()
    .text("🗑️ Delete", `gc_del_${gc.code}`).row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_GC_AMT_${code}`;
  await ctx.editMessageText(`✏️ Send new amount:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_max_", "");
  userState[ctx.from.id] = `WAITING_GC_MAX_${code}`;
  await ctx.editMessageText(`✏️ Send new max uses:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_claims_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_claims_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  if (gc.usedUsers.length === 0) return ctx.reply(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });

  let text = `📋 *Claims for \`${code}\` (${gc.usedUsers.length})*\n\n`;
  for (let uid of gc.usedUsers.slice(0, 50)) {
    let u = await User.findOne({ userId: uid });
    text += `👤 ${u ? (u.firstName || "User") : "Unknown"} — \`${uid}\`\n`;
  }
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let code = ctx.callbackQuery.data.replace("gc_del_", "");
  await GiftCode.deleteOne({ code, type: "redeem" });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderGiftCodePanel(ctx);
});

bot.callbackQuery("gc_notif_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("gift_notification_enabled", true);
  await setConfig("gift_notification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🔔 ON" : "🔕 OFF" });
  await renderGiftCodePanel(ctx);
});

bot.callbackQuery("gc_claims_report", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20);
  let totalClaims = 0;
  let text = `📊 *Gift Code Claims Report*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let c of codes) {
    totalClaims += c.usedUsers.length;
    text += `🎁 \`${c.code}\` (₹${c.amount})\n   ✅ ${c.usedUsers.length}/${c.maxUses}\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n📊 Total Claims: ${totalClaims}\n🎁 Codes: ${codes.length}`;
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_create_gift") }).catch(() => {});
});

// ============================================================
// 🚀 FINAL START
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");
    let oldChannels = await getConfig("forced_channels", null);
    if (oldChannels && Array.isArray(oldChannels) && oldChannels.length > 0) {
      await setConfig("forced_channels", []);
      console.log("🧹 Old config cleaned!");
    }
    bot.start({ onStart: (info) => console.log(`🚀 Bot @${info.username} running!`) });
  })
  .catch((err) => console.error("❌ DB Error:", err));

// ============================================================
// 👑 MINI APP — ADMIN APIs
// ============================================================

app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try {
    const wds = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals: wds });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    let txnNumber = generateTxnNumber();
    let gateway = await Gateway.findOne({ isActive: true });
    let gatewayName = gateway ? gateway.name : "TASK EARN";

    wd.status = "Approved";
    wd.gateway = gatewayName;
    wd.txnNumber = txnNumber;
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${wd.details}\n` +
        `🚀Transaction ID ==> ${txnNumber}\n` +
        `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
        `✅Please Check Your ${gatewayName} Account!`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    wd.status = "Rejected";
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    let user = await getUser(wd.userId);
    user.balance += wd.amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
    await user.save();
    await logBalanceHistory(wd.userId, "Withdrawal Refunded", wd.amount);

    try {
      await bot.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, addFunds: afs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    af.status = "Approved";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    let user = await getUser(af.userId);
    user.balance += af.amount;
    await user.save();
    await logBalanceHistory(af.userId, `Add Fund Approved (#${af.requestId})`, af.amount);

    try {
      await bot.api.sendMessage(af.userId,
        `✅ *Add Fund Approved!*\n\n💰 ₹${af.amount} added\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    af.status = "Rejected";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    try {
      await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}\n\nContact support.`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, submissions: subs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    sub.status = "Approved";
    await sub.save();

    let user = await getUser(sub.userId);
    user.balance += sub.reward;
    await user.save();
    await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
    await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });

    try {
      await bot.api.sendMessage(sub.userId,
        `🎉 *Payment Received!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}\n✅ Approved`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    sub.status = "Rejected";
    await sub.save();

    try {
      await bot.api.sendMessage(sub.userId,
        `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}\n\nProof not valid.`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});
