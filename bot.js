// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + CUSTOM UPI (Complete Updated)
// ============================================================
require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, InputFile } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

// ============================================================
// 📸 MULTER SETUP (Task Screenshot Upload)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ============================================================
// ⚡ CACHE
// ============================================================
const cache = {
  config: {},
  admins: [],
  adminsTime: 0,
  ownerId: null,
  layout: null
};

// ============================================================
// 🌐 EXPRESS SETUP
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/miniapp", express.static(path.join(__dirname, "public")));

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
// 🗄️ SCHEMAS
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
  amazonEmail: { type: String, default: "Not Set" },
  redeemCodeAddr: { type: String, default: "Not Set" },
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// ✅ UPDATED Task Schema — taskType + steps
const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  reward: { type: Number, required: true },
  link: { type: String, required: true },
  taskType: { type: String, default: "photo" }, // "photo" | "refer"
  steps: {
    type: [String],
    default: [
      "Click the link below",
      "Complete the task",
      "Take screenshot & submit"
    ]
  },
  timeLimitMinutes: { type: Number, default: 0 },
  alertEnabled: { type: Boolean, default: true },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] }
});
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

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
const GiftCode = mongoose.models.GiftCode || mongoose.model("GiftCode", giftCodeSchema);

const taskSubmissionSchema = new mongoose.Schema({
  submissionId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  taskId: { type: String, required: true },
  taskTitle: { type: String, required: true },
  reward: { type: Number, required: true },
  photoFileId: { type: String, required: true },
  referralLink: { type: String, default: "" }, // ✅ NEW
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});
const TaskSubmission = mongoose.models.TaskSubmission || mongoose.model("TaskSubmission", taskSubmissionSchema);

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
  try {
    await BalanceHistory.create({ userId, action, amount });
  } catch (e) {
    console.error("logBalanceHistory:", e.message);
  }
}

const addFundSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  amount: { type: Number, required: true },
  method: { type: String, default: "UPI" },
  methodKey: { type: String, default: "" },
  upiId: { type: String, default: "" },
  utr: { type: String, default: "" },
  proofFileId: { type: String, default: "" },
  status: { type: String, default: "Pending" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AddFund = mongoose.models.AddFund || mongoose.model("AddFund", addFundSchema);

const receivedPaymentSchema = new mongoose.Schema({
  utr: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "UNUSED" },
  usedByUserId: { type: Number, default: null },
  usedAt: { type: Date, default: null },
  source: { type: String, default: "MacroDroid" },
  rawSms: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const ReceivedPayment = mongoose.models.ReceivedPayment || mongoose.model("ReceivedPayment", receivedPaymentSchema);

const upiPaymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  utr: { type: String, default: "" },
  upiId: { type: String, required: true },
  walletKey: { type: String, default: "default" },
  status: { type: String, default: "Pending" },
  source: { type: String, default: "bot" },
  verifiedAt: { type: Date, default: null },
  approvedBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const UPIPayment = mongoose.models.UPIPayment || mongoose.model("UPIPayment", upiPaymentSchema);

const upiWalletSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  upiId: { type: String, default: "" },
  mode: { type: String, default: "auto" },
  minAmount: { type: Number, default: 5 },
  maxAmount: { type: Number, default: 200 },
  validityMinutes: { type: Number, default: 30 },
  token: { type: String, default: "" },
  apiKey: { type: String, default: "" },
  apiUrl: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const UPIWallet = mongoose.models.UPIWallet || mongoose.model("UPIWallet", upiWalletSchema);

const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  inviteLink: { type: String, required: true },
  displayName: { type: String, default: "" },
  subscriberCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  addedAt: { type: Date, default: Date.now }
});
const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});
const Config = mongoose.models.Config || mongoose.model("Config", configSchema);

const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);

const verificationSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  deviceHash: { type: String, default: "" },
  verified: { type: Boolean, default: false },
  reason: { type: String, default: "" },
  verifiedAt: { type: Date, default: null }
});
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
  } catch (e) {
    return false;
  }
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

// ============================================================
// 🎭 MASK FUNCTIONS
// ============================================================
function maskUPI(upi) {
  if (!upi || upi === "Not Set") return upi;
  let parts = String(upi).split('@');
  if (parts.length !== 2) return String(upi).length > 4 ? String(upi).substring(0, 4) + '****' : '****';
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

function maskDetails(method, details) {
  if (method === "UPI") return maskUPI(details);
  if (method === "Wallet") return maskWallet(details);
  if (method === "Bank") {
    let parts = String(details).split(',').map(s => s.trim());
    return maskBank(parts[0], parts[1]);
  }
  if (method === "Amazon") return maskEmail(details);
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

// ============================================================
// 🔤 SMALL CAPS
// ============================================================
function toSmallCaps(text) {
  const map = {
    'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ',
    'j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ',
    's':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'
  };
  return String(text).split('').map(c => map[c.toLowerCase()] || c).join('');
}

// ============================================================
// 📝 DEFAULT TEXTS
// ============================================================
const DEFAULT_TEXTS = {
  start_welcome: "💫 <b>Welcome To Task Payment Bot!</b>\n\nTo Know How To Earn → <a href=\"https://t.me/yourchannel\">CLICK HERE</a>",
  balance_title: "<blockquote>⭐ <b>Welcome To Bot!</b> ❞</blockquote>",
  balance_body: "🔵 <b>Wallet ID:</b> <code>{userId}</code>\n🧾 <b>Balance:</b> <b>₹{balance}</b>",
  balance_footer: "<blockquote><i>Built with security you can Trust.</i></blockquote>"
};

// ============================================================
// 🎨 INLINE STYLE COLORS
// ============================================================
const INLINE_STYLE_COLORS = {
  primary: { label: "Blue",  emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger:  { label: "Red",   emoji: "🔴" },
  white:   { label: "White", emoji: "⚪" }
};

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

// ============================================================
// ✅ BUILD STYLED KEYBOARD
// ============================================================
async function buildStyledKb(buttons) {
  let styleMap = await getConfig("inline_button_styles", {});
  let names = await getConfig("inline_button_names", {});

  let styled = buttons.map(row =>
    row.map(btn => {
      let newBtn = { text: btn.text };
      if (btn.callback_data) newBtn.callback_data = btn.callback_data;
      if (btn.url) newBtn.url = btn.url;
      if (btn.web_app) newBtn.web_app = btn.web_app;

      if (btn.callback_data && styleMap[btn.callback_data]) {
        let colorKey = styleMap[btn.callback_data];
        if (colorKey !== "none" && INLINE_STYLE_COLORS[colorKey]) {
          newBtn.text = `${INLINE_STYLE_COLORS[colorKey].emoji} ${newBtn.text}`;
        }
      }

      if (btn.callback_data && names[btn.callback_data]) {
        newBtn.text = names[btn.callback_data];
      }

      return newBtn;
    })
  );
  return { inline_keyboard: styled };
}

// ============================================================
// 💳 UPI HELPERS
// ============================================================
async function createUPIOrder(userId, amount, upiId, walletKey = "default") {
  const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payment = await UPIPayment.create({
    orderId, userId, amount, upiId, walletKey, status: "Pending"
  });
  return payment;
}

async function approveUPIPayment(orderId, utr, approvedBy = "Auto") {
  const payment = await UPIPayment.findOne({ orderId });
  if (!payment || payment.status === "Approved") return null;

  payment.utr = utr;
  payment.status = "Approved";
  payment.verifiedAt = new Date();
  payment.approvedBy = approvedBy;
  await payment.save();

  const user = await getUser(payment.userId);
  user.balance += payment.amount;
  await user.save();

  await logBalanceHistory(payment.userId, `UPI Deposit (UTR: ${utr})`, payment.amount);

  return payment;
}

// ============================================================
// 🧾 RECEIPT PAGE
// ============================================================
app.get("/receipt/:id", async (req, res) => {
  try {
    let wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd) {
      return res.status(404).send("<h2 style='color:white;background:#111;text-align:center;padding:50px;'>Receipt not found!</h2>");
    }

    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId });
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";

    let isSuccess = wd.status === "Approved";
    let isFailed = wd.status === "Rejected";
    let statusTitle = isSuccess ? "TRANSFER COMPLETE" : (isFailed ? "TRANSFER FAILED" : "TRANSFER PENDING");
    let statusSubtitle = isSuccess ? "FUNDS CREDITED" : (isFailed ? "TRANSACTION REJECTED" : "PROCESSING PAYMENT");
    let accentColor = isSuccess ? "#00ffcc" : (isFailed ? "#ff4d4d" : "#ffa500");
    let iconSvg = isSuccess ? "&#10003;" : (isFailed ? "&#10005;" : "&#8943;");

    let displayTxn = wd.txnNumber && wd.txnNumber !== "" ? wd.txnNumber : wd.withdrawalId;
    let gatewayDisplay = wd.gateway && wd.gateway !== "" ? wd.gateway : "TASK EARN";
    let approvedBy = wd.approvedBy && wd.approvedBy !== "" ? wd.approvedBy : "-";
    let displayDate = wd.approvedAt ? new Date(wd.approvedAt) : new Date(wd.createdAt);

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt #${escapeHtml(wd.withdrawalId)}</title>
    <style>
      body{background:#0b0e14;color:#fff;font-family:'Segoe UI',sans-serif;margin:0;padding:20px;display:flex;align-items:center;justify-content:center;min-height:100vh;}
      .container{background:#151a21;border-radius:20px;padding:30px;max-width:420px;width:100%;text-align:center;border:1px solid #222c37;}
      .icon-box{width:70px;height:70px;background:rgba(0,255,204,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;color:${accentColor};border:2px solid ${accentColor};}
      .title{font-size:20px;font-weight:bold;color:${accentColor};letter-spacing:1px;}
      .subtitle{font-size:12px;color:#8a9ba8;margin:5px 0 25px;}
      .card-box{background:#1e2530;border-radius:15px;padding:20px;margin-bottom:20px;}
      .amount-label{font-size:11px;color:#8a9ba8;text-transform:uppercase;}
      .amount-val{font-size:32px;font-weight:bold;margin-top:8px;}
      .info-row{background:#151a21;border-radius:10px;padding:12px 15px;margin-top:10px;display:flex;justify-content:space-between;font-size:13px;gap:10px;}
      .info-title{color:#8a9ba8;flex-shrink:0;}
      .info-value{color:#fff;font-weight:500;text-align:right;word-break:break-all;}
      .info-value.mono{font-family:'Courier New',monospace;color:#00ffcc;font-size:12px;}
      .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-top:5px;}
      .status-pending{background:rgba(255,165,0,0.15);color:#ffa500;border:1px solid #ffa500;}
      .status-approved{background:rgba(0,255,204,0.15);color:#00ffcc;border:1px solid #00ffcc;}
      .status-rejected{background:rgba(255,77,77,0.15);color:#ff4d4d;border:1px solid #ff4d4d;}
      .close-btn{background:#2a3443;color:#fff;border:none;width:100%;padding:14px;border-radius:12px;font-size:14px;font-weight:bold;cursor:pointer;margin-top:15px;}
      .provider-footer{margin-top:22px;padding-top:18px;border-top:1px solid #222c37;text-align:center;}
      .provider-text{font-size:13px;color:#8a9ba8;letter-spacing:0.3px;}
      .provider-name{color:#00ffcc;font-weight:700;text-decoration:none;border-bottom:1px dashed #00ffcc;padding-bottom:2px;}
    </style></head><body>
    <div class="container">
      <div class="icon-box">${iconSvg}</div>
      <div class="title">${statusTitle}</div>
      <div class="subtitle">${statusSubtitle}</div>
      <div class="card-box"><div class="amount-label">WITHDRAWAL AMOUNT</div><div class="amount-val">₹ ${wd.amount.toFixed(2)}</div></div>
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${escapeHtml(wd.method.toUpperCase())}</span></div>
      <div class="info-row"><span class="info-title">DESTINATION</span><span class="info-value">${escapeHtml(wd.details)}</span></div>
      <div class="info-row"><span class="info-title">TXN ID</span><span class="info-value mono">${escapeHtml(displayTxn)}</span></div>
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value mono">TXN${escapeHtml(wd.withdrawalId)}</span></div>
      <div class="info-row"><span class="info-title">GATEWAY</span><span class="info-value">${escapeHtml(gatewayDisplay)}</span></div>
      <div class="info-row"><span class="info-title">APPROVED BY</span><span class="info-value">${escapeHtml(approvedBy)}</span></div>
      <div class="info-row"><span class="info-title">DATE</span><span class="info-value">${displayDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
      <div style="margin-top:15px;"><span class="status-badge status-${wd.status.toLowerCase()}">${wd.status.toUpperCase()}</span></div>
      <button class="close-btn" onclick="window.close()">CLOSE & RETURN</button>
      <div class="provider-footer">
        <div class="provider-text">Provided by <a href="tg://user?id=${ownerId}" class="provider-name" target="_blank">${escapeHtml(ownerName)}</a></div>
      </div>
    </div></body></html>`;
    res.send(html);
  } catch (e) {
    res.status(500).send("Error");
  }
});

app.get("/", (req, res) => res.send("Bot Server Live!"));

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

// ============================================================
// ✅ CUSTOM API — MacroDroid Payment Injection
// ============================================================
app.post("/api/add-payment", async (req, res) => {
  try {
    const { utr, amount, secret_key, raw_sms } = req.body;

    const validKey = await getConfig("auto_upi_api_key", "DEFAULT_SECRET_KEY");
    if (secret_key !== validKey) {
      console.log("❌ Invalid secret key attempt");
      return res.status(403).json({ success: false, message: "Invalid Secret Key" });
    }

    if (!utr || !amount) {
      return res.status(400).json({ success: false, message: "UTR and Amount are required" });
    }

    const cleanUtr = String(utr).trim();
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const existing = await ReceivedPayment.findOne({ utr: cleanUtr });
    if (existing) {
      return res.json({ success: true, message: "Already recorded", utr: cleanUtr });
    }

    await ReceivedPayment.create({
      utr: cleanUtr,
      amount: amt,
      status: "UNUSED",
      source: "MacroDroid",
      rawSms: raw_sms || ""
    });

    console.log(`✅ Payment Recorded — UTR: ${cleanUtr}, Amount: ₹${amt}`);
    res.json({ success: true, message: "Payment recorded successfully", utr: cleanUtr });
  } catch (e) {
    console.error("API error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post("/api/test-utr", async (req, res) => {
  try {
    const { utr, amount, secret_key } = req.body;
    const validKey = await getConfig("auto_upi_api_key", "DEFAULT_SECRET_KEY");
    if (secret_key !== validKey) {
      return res.status(403).json({ success: false, message: "Invalid Secret Key" });
    }

    if (!utr || !amount) return res.status(400).json({ success: false, message: "Missing fields" });

    await ReceivedPayment.findOneAndUpdate(
      { utr: String(utr).trim() },
      { amount: parseFloat(amount), status: "UNUSED", source: "Manual Test" },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Test UTR added" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// 📱 MINI APP PAGE ROUTES
// ============================================================
app.get("/miniapp", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/miniapp/addfund", (req, res) => res.sendFile(path.join(__dirname, "public", "addfund.html")));
app.get("/miniapp/task", (req, res) => res.sendFile(path.join(__dirname, "public", "task.html")));
app.get("/miniapp/pay", (req, res) => res.sendFile(path.join(__dirname, "public", "pay.html")));
app.get("/miniapp/profile", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/miniapp/verify", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/miniapp/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// ============================================================
// 🎨 CONFIG API — UPDATED (addFundEnabled added)
// ============================================================
app.get("/miniapp/api/config", async (req, res) => {
  try {
    const btn_home = await getConfig("btn_home", "HOME");
    const btn_task = await getConfig("btn_task", "TASK");
    const btn_pay = await getConfig("btn_pay", "PAY");
    const btn_profile = await getConfig("btn_profile", "PROFILE");
    const appLogo = await getConfig("app_logo", "Task Earn Bot");
    const supportUsername = await getConfig("support_username", null);
    const addFundEnabled = await getConfig("add_fund_enabled", true); // ✅ NEW

    let botUsername = "";
    try {
      const me = await bot.api.getMe();
      botUsername = me.username;
    } catch (e) {}

    res.json({
      success: true,
      config: {
        btn_home, btn_task, btn_pay, btn_profile,
        appLogo, supportUsername, botUsername,
        addFundEnabled
      }
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 📱 MINI APP APIs — USER
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

    // ✅ NEW — Count tasks & referrals
    const totalTasks = await TaskSubmission.countDocuments({ userId, status: "Approved" });
    const totalReferrals = await User.countDocuments({ referredBy: userId });

    res.json({
      success: true,
      user: {
        userId: user.userId,
        firstName: user.firstName,
        username: user.username,
        balance: user.balance,
        withdrawnTotal: user.withdrawnTotal,
        joined: user.createdAt,
        linkedInfo,
        walletAccount: user.walletAccount,
        upiId: user.upiId,
        bankAccNo: user.bankAccNo,
        bankIfsc: user.bankIfsc,
        amazonEmail: user.amazonEmail,
        redeemCodeAddr: user.redeemCodeAddr,
        totalTasks,
        totalReferrals,
        referredBy: user.referredBy || null,
        isBanned: user.isBanned || false
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 📜 USER HISTORY API — NEW
// ============================================================
app.get("/miniapp/api/user/:userId/history", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit) || 20;
    const history = await BalanceHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, history });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
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
    let isOwnerUser = await isOwner(userId);
    res.json({ success: true, isAdmin: isAdminUser, isOwner: isOwnerUser });
  } catch (e) { res.json({ success: false, isAdmin: false, isOwner: false }); }
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
      { name: "Redeem", icon: "🎁", value: user.redeemCodeAddr || "Not Set" }
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
    } catch (e) { }

    res.json({
      success: true,
      user: { userId: user.userId, firstName: user.firstName, username: user.username, photoUrl }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// ⚡ QUICK PAY API — UPDATED (Both Notify)
// ============================================================
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

    // Transfer
    sender.balance -= amt;
    receiver.balance += amt;
    await sender.save();
    await receiver.save();

    await logBalanceHistory(sId, `Quick Pay to ${receiver.firstName || rId} (${rId})`, -amt);
    await logBalanceHistory(rId, `Quick Pay from ${sender.firstName || sId} (${sId})`, amt);

    // ✅ SENDER Notification
    try {
      await bot.api.sendMessage(sId,
        `✅ <b>Payment Sent Successfully!</b>\n\n` +
        `👤 <b>To:</b> ${receiver.firstName || "User"}\n` +
        `🆔 <b>User ID:</b> <code>${rId}</code>\n` +
        `💰 <b>Sent:</b> ₹${amt.toFixed(2)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 <b>Your New Balance:</b> ₹${sender.balance.toFixed(2)}\n` +
        `🕐 ${new Date().toLocaleString('en-IN')}`,
        { parse_mode: "HTML" });
    } catch (e) {
      console.error("Sender notify error:", e.message);
    }

    // ✅ RECEIVER Notification
    try {
      await bot.api.sendMessage(rId,
        `🎉 <b>Money Received!</b>\n\n` +
        `👤 <b>From:</b> ${sender.firstName || "User"}\n` +
        `🆔 <b>User ID:</b> <code>${sId}</code>\n` +
        `💰 <b>Received:</b> ₹${amt.toFixed(2)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 <b>Your New Balance:</b> ₹${receiver.balance.toFixed(2)}\n` +
        `🕐 ${new Date().toLocaleString('en-IN')}`,
        { parse_mode: "HTML" });
    } catch (e) {
      console.error("Receiver notify error:", e.message);
    }

    res.json({
      success: true,
      newBalance: sender.balance,
      receiverName: receiver.firstName || "User"
    });
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
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 🚀 WITHDRAW INFO API — NEW
// ============================================================
app.get("/miniapp/api/withdraw-info/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, error: "User not found" });

    const toggles = await getConfig("withdraw_toggles", {
      wallet: true, upi: true, bank: true, amazon: true, redeem: true
    });

    const minWithdraw = await getConfig("min_withdraw", 10);
    const maxWithdraw = await getConfig("max_withdraw", 10000);

    res.json({
      success: true,
      user: {
        walletAccount: user.walletAccount,
        upiId: user.upiId,
        bankAccNo: user.bankAccNo,
        amazonEmail: user.amazonEmail,
        redeemCodeAddr: user.redeemCodeAddr
      },
      methods: toggles,
      minWithdraw,
      maxWithdraw
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🚀 WITHDRAW API — NEW
// ============================================================
app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;

    if (!userId || !amount || !method) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);

    // Check toggle
    let toggleKey = method.toLowerCase();
    let toggles = await getConfig("withdraw_toggles", {
      wallet: true, upi: true, bank: true, amazon: true, redeem: true
    });
    if (toggles[toggleKey] === false) {
      return res.json({ success: false, error: `${method} is currently OFF` });
    }

    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    const minW = await getConfig("min_withdraw", 10);
    const maxW = await getConfig("max_withdraw", 10000);
    if (amt < minW || amt > maxW) {
      return res.json({ success: false, error: `Amount must be ₹${minW}-₹${maxW}` });
    }

    // Details
    let details = "";
    if (method === "Wallet") details = user.walletAccount;
    else if (method === "UPI") details = user.upiId;
    else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
    else if (method === "Amazon") details = user.amazonEmail;
    else if (method === "Redeem") details = user.redeemCodeAddr;

    if (!details || details === "Not Set") {
      return res.json({ success: false, error: `${method} not set. Set it first.` });
    }

    // Deduct balance
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${method}`, -amt);

    // Create withdrawal
    const prevCount = await Withdrawal.countDocuments({ userId: uid });
    const withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

    await Withdrawal.create({
      withdrawalId, userId: uid,
      userWithdrawalCount: prevCount + 1,
      amount: amt, method, details
    });

    // Notify payment channel
    const payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      const kb = new InlineKeyboard()
        .text("✅ Approve", `wd_app_${withdrawalId}`)
        .text("❌ Reject", `wd_rej_${withdrawalId}`);

      try {
        await bot.api.sendMessage(payoutChannel,
          `⚠️ <b>New ${method.toUpperCase()} Withdrawal!</b>\n\n` +
          `<b>👤 User:</b> ${user.firstName || "User"}\n` +
          `<b>🆔 ID:</b> <code>${uid}</code>\n` +
          `<b>💰 Amount:</b> ₹${amt}\n` +
          `<b>📌 ${method}:</b> <code>${details}</code>\n` +
          `<b>🆔 ID:</b> <code>${withdrawalId}</code>`,
          { parse_mode: "HTML", reply_markup: kb });
      } catch (e) {
        console.error("Channel notify error:", e.message);
      }
    }

    res.json({ success: true, withdrawalId });
  } catch (e) {
    console.error("Withdraw error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 📸 TASK SUBMIT API (Photo) — NEW
// ============================================================
app.post("/miniapp/api/task/submit", upload.single('photo'), async (req, res) => {
  try {
    const { userId, taskId, referralLink } = req.body;
    const photo = req.file;

    if (!userId || !taskId || !photo) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed" });

    // Upload to Telegram
    const inputFile = new InputFile(photo.buffer, 'screenshot.jpg');

    let fileId = "";
    try {
      const sentMsg = await bot.api.sendPhoto(MAIN_OWNER_ID, inputFile);
      fileId = sentMsg.photo[sentMsg.photo.length - 1].file_id;
      await bot.api.deleteMessage(MAIN_OWNER_ID, sentMsg.message_id).catch(() => {});
    } catch (e) {
      console.error("Photo upload error:", e.message);
      return res.json({ success: false, error: "Upload failed" });
    }

    const submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    await TaskSubmission.create({
      submissionId, userId: uid,
      userName: user.firstName || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward,
      photoFileId: fileId,
      referralLink: referralLink || "",
      status: "Pending"
    });

    // Send to alert channel
    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel
      : await getConfig("payout_channel", null);

    if (alertChannel && alertChannel !== "Not Set" && alertChannel) {
      const kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);

      const caption =
        `📸 *New Task Submission!*\n\n` +
        `👤 *Name:* ${user.firstName || "User"}\n` +
        `🆔 *User ID:* \`${uid}\`\n` +
        `📋 *Task:* ${task.title}\n` +
        `💰 *Reward:* ₹${task.reward}\n` +
        (referralLink ? `🔗 *Referral:* \`${referralLink}\`\n` : '') +
        `🎫 *Submission:* \`${submissionId}\`\n` +
        `📅 *Date:* ${new Date().toLocaleString('en-IN')}`;

      try {
        await bot.api.sendPhoto(alertChannel, fileId, {
          caption, parse_mode: "Markdown", reply_markup: kb
        });
      } catch (e) {
        console.error("Alert channel error:", e.message);
      }
    }

    res.json({ success: true, submissionId });
  } catch (e) {
    console.error("Task submit error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🔗 REFER SUBMIT API — NEW
// ============================================================
app.post("/miniapp/api/submit-refer", async (req, res) => {
  try {
    const { userId, taskId, referValue } = req.body;

    if (!userId || !taskId || !referValue) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed" });

    const submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    await TaskSubmission.create({
      submissionId, userId: uid,
      userName: user.firstName || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward,
      photoFileId: `REFER:${referValue}`,
      referralLink: referValue,
      status: "Pending"
    });

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel
      : await getConfig("payout_channel", null);

    if (alertChannel && alertChannel !== "Not Set" && alertChannel) {
      const kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);

      const caption =
        `🔗 *New Refer Submission!*\n\n` +
        `👤 *Name:* ${user.firstName || "User"}\n` +
        `🆔 *User ID:* \`${uid}\`\n` +
        `📋 *Task:* ${task.title}\n` +
        `💰 *Reward:* ₹${task.reward}\n` +
        `🔗 *Refer:* \`${referValue}\`\n` +
        `🎫 *Submission:* \`${submissionId}\`\n` +
        `📅 *Date:* ${new Date().toLocaleString('en-IN')}`;

      try {
        await bot.api.sendMessage(alertChannel, caption, {
          parse_mode: "Markdown", reply_markup: kb
        });
      } catch (e) {
        console.error("Alert channel error:", e.message);
      }
    }

    res.json({ success: true, submissionId });
  } catch (e) {
    console.error("Refer submit error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 💰 ADD FUND TOGGLE API — NEW
// ============================================================
app.post("/miniapp/api/admin/toggle-addfund", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!(await isAdmin(userId))) {
      return res.json({ success: false, error: "Unauthorized" });
    }

    let current = await getConfig("add_fund_enabled", true);
    await setConfig("add_fund_enabled", !current);

    res.json({ success: true, enabled: !current });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 💠 MULTI-WALLET APIs
// ============================================================
app.get("/miniapp/api/wallets", async (req, res) => {
  try {
    const wallets = await UPIWallet.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({
      success: true,
      wallets: wallets.map(w => ({
        key: w.key, name: w.name, mode: w.mode,
        minAmount: w.minAmount, maxAmount: w.maxAmount,
        validityMinutes: w.validityMinutes, upiId: w.upiId
      }))
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/wallets/:key", async (req, res) => {
  try {
    const w = await UPIWallet.findOne({ key: req.params.key, isActive: true });
    if (!w) return res.json({ success: false, error: "Wallet not found" });
    res.json({
      success: true,
      wallet: {
        key: w.key, name: w.name, mode: w.mode,
        minAmount: w.minAmount, maxAmount: w.maxAmount,
        validityMinutes: w.validityMinutes, upiId: w.upiId
      }
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/deposit", async (req, res) => {
  try {
    // ✅ Check if add fund is enabled
    const addFundEnabled = await getConfig("add_fund_enabled", true);
    if (!addFundEnabled) {
      return res.json({
        success: false,
        error: "Add Fund is temporarily disabled. Please try again later."
      });
    }

    const { userId, walletKey, amount, utr, upiId } = req.body;

    if (!userId || !walletKey || !amount || !utr) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const cleanUtr = String(utr).trim().replace(/\s/g, "");

    const wallet = await UPIWallet.findOne({ key: walletKey, isActive: true });
    if (!wallet) return res.json({ success: false, error: "Wallet not found" });

    if (cleanUtr.length < 8 || cleanUtr.length > 30) {
      return res.json({ success: false, error: "Invalid UTR format" });
    }

    if (isNaN(amt) || amt < wallet.minAmount || amt > wallet.maxAmount) {
      return res.json({ success: false, error: `Amount must be ₹${wallet.minAmount}-₹${wallet.maxAmount}` });
    }

    const existingUsed = await UPIPayment.findOne({ utr: cleanUtr, status: "Approved" });
    if (existingUsed) {
      return res.json({ success: false, error: "This UTR has already been used" });
    }

    const user = await getUser(uid);
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // AUTO MODE
    if (wallet.mode === "auto") {
      const receivedPayment = await ReceivedPayment.findOne({ utr: cleanUtr, status: "UNUSED" });

      if (receivedPayment && Math.abs(receivedPayment.amount - amt) <= 0.5) {
        receivedPayment.status = "USED";
        receivedPayment.usedByUserId = uid;
        receivedPayment.usedAt = new Date();
        await receivedPayment.save();

        await UPIPayment.create({
          orderId, userId: uid, amount: amt, utr: cleanUtr,
          upiId: upiId || wallet.upiId, walletKey: wallet.key,
          status: "Approved", source: "miniapp-auto",
          verifiedAt: new Date(), approvedBy: "Auto"
        });

        user.balance += amt;
        await user.save();
        await logBalanceHistory(uid, `UPI Deposit (${wallet.name}) UTR: ${cleanUtr}`, amt);

        const payoutChannel = await getConfig("payout_channel", null);
        if (payoutChannel) {
          try {
            await bot.api.sendMessage(payoutChannel,
              `💰 <b>Auto Deposit Approved!</b>\n\n` +
              `<b>👤 User:</b> ${user.firstName || "User"}\n` +
              `<b>🆔 ID:</b> <code>${uid}</code>\n` +
              `<b>💵 Amount:</b> ₹${amt}\n` +
              `<b>💠 Wallet:</b> ${wallet.name}\n` +
              `<b>🔐 UTR:</b> <code>${cleanUtr}</code>\n` +
              `<b>📅 Date:</b> ${new Date().toLocaleString('en-IN')}`,
              { parse_mode: "HTML" });
          } catch (e) {}
        }

        try {
          const styledTitle = toSmallCaps("Deposit Approved!");
          const styledAdded = toSmallCaps("Added:");
          const styledUTR = toSmallCaps("UTR:");
          await bot.api.sendMessage(uid,
            `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${amt}\n🔐 ${styledUTR} ${cleanUtr}`,
            { parse_mode: "Markdown" });
        } catch (e) {}

        return res.json({
          success: true, mode: "auto",
          message: "Deposit approved automatically",
          newBalance: user.balance
        });
      }

      return res.json({
        success: false,
        error: "Payment not found. Please wait 1-2 minutes and try again."
      });
    }

    // MANUAL MODE
    if (wallet.mode === "manual") {
      const requestId = Math.floor(100000 + Math.random() * 900000).toString();

      await AddFund.create({
        requestId, userId: uid,
        userName: user.firstName || "User",
        amount: amt, method: wallet.name, methodKey: wallet.key,
        upiId: upiId || wallet.upiId, utr: cleanUtr,
        status: "Pending"
      });

      const payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel) {
        const kb = new InlineKeyboard()
          .text("✅ Approve", `af_app_${requestId}`)
          .text("❌ Reject", `af_rej_${requestId}`);

        try {
          await bot.api.sendMessage(payoutChannel,
            `💰 <b>Manual Deposit Request</b>\n\n` +
            `<b>👤 User:</b> ${user.firstName || "User"}\n` +
            `<b>🆔 ID:</b> <code>${uid}</code>\n` +
            `<b>💵 Amount:</b> ₹${amt}\n` +
            `<b>💠 Wallet:</b> ${wallet.name}\n` +
            `<b>🔐 UTR:</b> <code>${cleanUtr}</code>\n` +
            `<b>🆔 Request:</b> <code>${requestId}</code>\n` +
            `<b>⏳ Status:</b> Pending Approval`,
            { parse_mode: "HTML", reply_markup: kb });
        } catch (e) {}
      }

      return res.json({
        success: true, mode: "manual",
        message: "Pending admin approval",
        requestId, newBalance: user.balance
      });
    }

    return res.json({ success: false, error: "Invalid wallet mode" });
  } catch (e) {
    console.error("Deposit error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🎨 ADMIN CONFIG APIs — NEW
// ============================================================
app.post("/miniapp/api/admin/save-config", async (req, res) => {
  try {
    const { userId, key, value } = req.body;

    if (!(await isAdmin(userId))) {
      return res.json({ success: false, error: "Unauthorized" });
    }

    const allowed = ["app_logo", "btn_home", "btn_task", "btn_pay", "btn_profile"];
    if (!allowed.includes(key)) {
      return res.json({ success: false, error: "Invalid key" });
    }

    await setConfig(key, value);

    // Clear layout cache
    if (key.startsWith("btn_") || key === "app_logo") {
      cache.layout = null;
    }

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 👑 ADMIN LIST API — NEW
// ============================================================
app.get("/miniapp/api/admin/list", async (req, res) => {
  try {
    const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    const adminIds = await getConfig("admins", []);

    let result = [];

    let ownerUser = await User.findOne({ userId: ownerId });
    result.push({
      userId: ownerId,
      name: ownerUser?.firstName || "Owner",
      role: "owner"
    });

    for (let id of adminIds) {
      let u = await User.findOne({ userId: id });
      result.push({
        userId: id,
        name: u?.firstName || "Admin",
        role: "admin"
      });
    }

    res.json({ success: true, admins: result, ownerId });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 👑 ADMIN ADD/REMOVE APIs — NEW
// ============================================================
app.post("/miniapp/api/admin/add", async (req, res) => {
  try {
    const { userId, requesterId } = req.body;

    if (!(await isOwner(requesterId))) {
      return res.json({ success: false, error: "Owner only" });
    }

    const newAdminId = parseInt(userId, 10);
    if (isNaN(newAdminId)) return res.json({ success: false, error: "Invalid User ID" });

    let admins = await getConfig("admins", []);
    if (admins.some(id => Number(id) === newAdminId)) {
      return res.json({ success: false, error: "Already an admin" });
    }

    admins.push(newAdminId);
    await setConfig("admins", admins);
    cache.admins = admins;
    cache.adminsTime = Date.now();

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post("/miniapp/api/admin/remove/:userId", async (req, res) => {
  try {
    const { requesterId } = req.body;
    if (!(await isOwner(requesterId))) {
      return res.json({ success: false, error: "Owner only" });
    }

    const adminId = parseInt(req.params.userId, 10);
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    if (adminId === ownerId) {
      return res.json({ success: false, error: "Cannot remove owner" });
    }

    let admins = await getConfig("admins", []);
    admins = admins.filter(id => Number(id) !== adminId);
    await setConfig("admins", admins);
    cache.admins = admins;
    cache.adminsTime = Date.now();

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 👑 MINI APP ADMIN APIs (Pending/Approve/Reject)
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

    let accountType = wd.method === "UPI" ? "UPI" : (wd.method === "Wallet" ? "Wallet" : "Bank");
    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${wd.details}\n` +
        `🚀Transaction ID ==> ${txnNumber}\n` +
        `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
        `✅Please Check Your ${accountType} Account!`,
        { reply_markup: new InlineKeyboard().url("🚀 Check Status", receiptUrl) });
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
      await bot.api.sendMessage(wd.userId,
        `❌ *Withdrawal Rejected!*\n\n💰 ₹${wd.amount}\n\n💵 Refunded: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
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

    if (af.utr) {
      await UPIPayment.updateMany({ utr: af.utr }, { status: "Approved", verifiedAt: new Date(), approvedBy: "MiniApp Admin" });
    }

    const styledTitle = toSmallCaps("Ur Work Approved!");
    const styledAdded = toSmallCaps("Added:");

    try {
      await bot.api.sendMessage(af.userId,
        `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${af.amount}\n💵 Balance: ₹${user.balance.toFixed(2)}`,
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

    if (af.utr) {
      await UPIPayment.updateMany({ utr: af.utr }, { status: "Rejected" });
    }

    try {
      await bot.api.sendMessage(af.userId,
        `❌ *Deposit Rejected*\n\n💰 ₹${af.amount}\n\n💬 Contact support.`,
        { parse_mode: "Markdown" });
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
        `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}`,
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

// ============================================================
// ═══════════════ PART 2 — BOT COMMANDS ═══════════════
// ============================================================

bot.command("start", async (ctx) => {
  try {
    delete userState[ctx.from.id];
    let userId = ctx.from.id;

    // ✅ Handle referral
    let startPayload = ctx.match;
    if (startPayload && startPayload.startsWith("ref_")) {
      let referrerId = parseInt(startPayload.replace("ref_", ""), 10);
      if (!isNaN(referrerId) && referrerId !== userId) {
        let existingUser = await User.findOne({ userId });
        if (!existingUser) {
          let newUser = await getUser(userId);
          newUser.referredBy = referrerId;
          await newUser.save();
        }
      }
    }

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

    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) {
      let channels = await Channel.find({ isActive: true });
      let keyboard = new InlineKeyboard();
      channels.forEach((ch) => {
        keyboard.url(`📢 Join ${ch.displayName || ch.channelId}`, ch.inviteLink).row();
      });
      keyboard.text("✅ I have Joined", "check_join");
      return ctx.reply("⚠️ *You must join our channels to use this bot!*", { reply_markup: keyboard, parse_mode: "Markdown" });
    }

    let welcomeText = DEFAULT_TEXTS.start_welcome;
    let miniAppUrl = process.env.MINIAPP_URL || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/miniapp` : null);

    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(), parse_mode: "HTML" });
    } catch (htmlErr) {
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
  }
});

bot.callbackQuery("check_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ Join all channels first!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("👋 Welcome!", { reply_markup: await buildKeyboardFromLayout() });
});

// ============================================================
// 📸 TASK APPROVAL — Handle both photo and refer
// ============================================================
bot.callbackQuery(/^task_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_app_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  sub.status = "Approved";
  await sub.save();
  let user = await getUser(sub.userId);
  user.balance += sub.reward;
  await user.save();
  await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
  await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  // Handle photo vs refer
  if (sub.photoFileId && sub.photoFileId.startsWith("REFER:")) {
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || "") + `\n\n✅ *APPROVED*`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
  } else {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED*`,
      parse_mode: "Markdown"
    }).catch(() => {});
  }

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
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  sub.status = "Rejected";
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  if (sub.photoFileId && sub.photoFileId.startsWith("REFER:")) {
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || "") + `\n\n❌ *REJECTED*`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
  } else {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED*`,
      parse_mode: "Markdown"
    }).catch(() => {});
  }

  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ *Task Rejected!*\n\n📌 *${sub.taskTitle}*`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🚀 FINAL START
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");

    // Init defaults
    await getConfig("auto_upi_id", "nasih@fam");
    await getConfig("auto_upi_min", 5);
    await getConfig("auto_upi_max", 200);
    await getConfig("auto_upi_enabled", true);
    await getConfig("auto_verify_enabled", true);
    await getConfig("manual_verify_enabled", true);
    await getConfig("min_withdraw", 10);
    await getConfig("max_withdraw", 10000);
    await getConfig("add_fund_enabled", true); // ✅ NEW

    // Generate API key
    let apiKey = await getConfig("auto_upi_api_key", null);
    if (!apiKey) {
      apiKey = "KEY_" + crypto.randomBytes(16).toString("hex");
      await setConfig("auto_upi_api_key", apiKey);
      console.log("🔐 Generated API Key:", apiKey);
    }

    // Default wallet
    let walletCount = await UPIWallet.countDocuments({});
    if (walletCount === 0) {
      await UPIWallet.create({
        key: "ultra_auto",
        name: "Ultra Pay",
        upiId: await getConfig("auto_upi_id", "nasih@fam"),
        mode: "auto",
        minAmount: 5, maxAmount: 200, validityMinutes: 30,
        isActive: true
      });
      console.log("💠 Default wallet created");
    }

    bot.start({
      onStart: (info) => {
        console.log(`🚀 Bot @${info.username} running!`);
        console.log(`✅ All systems ready!`);
      }
    });
  })
  .catch((err) => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

app.listen(PORT, () => {
  console.log(`🌐 Express on port ${PORT}`);
});

console.log("✅ bot.js loaded!");
