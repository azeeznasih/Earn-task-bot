// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + GATEWAY SYSTEM
// grammy ^1.35.1 | mongoose ^8.13.0 | express ^4.21.2
// Part 1 of 8 — Foundation
// ============================================================
require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, InputFile } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");

// ============================================================
// ⚡ CACHE
// ============================================================
const cache = {
  config: {},
  admins: [],
  adminsTime: 0,
  ownerId: null
};

// ============================================================
// 🌐 EXPRESS SETUP
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));

// ✅ CORS — Mini App fix
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

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
// 🔄 RERENDER HELPER (Avoid "registering listeners" error)
// ============================================================
async function rerender(ctx, callbackData) {
  try {
    const fakeUpdate = {
      update_id: Date.now() + Math.floor(Math.random() * 1000),
      callback_query: {
        id: "rerender_" + Date.now(),
        from: ctx.from,
        chat_instance: "rerender",
        data: callbackData,
        message: ctx.callbackQuery?.message || ctx.message
      }
    };
    await bot.handleUpdate(fakeUpdate);
  } catch (e) {
    console.error("rerender error:", e.message);
  }
}

// ============================================================
// 🗄️ MONGOOSE SCHEMAS
// ============================================================

// ---------- USER ----------
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
  // ✅ Gateway user data
  gatewayName: { type: String, default: "" },
  gatewayUpi: { type: String, default: "" },
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// ---------- USER PREFERENCES (Per-user customization) ----------
const userPreferenceSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  keyboardLayout: { type: Array, default: null },
  inlineMenus: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});
const UserPreference = mongoose.models.UserPreference || mongoose.model("UserPreference", userPreferenceSchema);

// ---------- BOT ADMIN (with permissions toggle) ----------
const botAdminSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: Number, default: null },
  isActive: { type: Boolean, default: true },
  disabledAt: { type: Date, default: null },
  disabledBy: { type: Number, default: null }
});
const BotAdmin = mongoose.models.BotAdmin || mongoose.model("BotAdmin", botAdminSchema);

// ---------- TASK ----------
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
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

// ---------- GIFT CODE ----------
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

// ---------- TASK SUBMISSION ----------
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
const TaskSubmission = mongoose.models.TaskSubmission || mongoose.model("TaskSubmission", taskSubmissionSchema);

// ---------- WITHDRAWAL ----------
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

// ---------- BALANCE HISTORY ----------
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

// ---------- MANUAL ADD FUND ----------
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

// ---------- RECEIVED PAYMENT (MacroDroid) ----------
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

// ---------- UPI DEPOSIT ----------
const upiPaymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  utr: { type: String, default: "" },
  upiId: { type: String, required: true },
  status: { type: String, default: "Pending" },
  source: { type: String, default: "bot" },
  verifiedAt: { type: Date, default: null },
  approvedBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const UPIPayment = mongoose.models.UPIPayment || mongoose.model("UPIPayment", upiPaymentSchema);

// ---------- CHANNEL ----------
const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  inviteLink: { type: String, required: true },
  displayName: { type: String, default: "" },
  subscriberCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  addedAt: { type: Date, default: Date.now }
});
const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

// ---------- CONFIG ----------
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});
const Config = mongoose.models.Config || mongoose.model("Config", configSchema);

// ---------- GATEWAY (URL-based) ----------
const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  type: { type: String, default: "deposit" }, // deposit | withdraw | both
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);

// ---------- VERIFICATION ----------
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
    
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    if (Number(userId) === Number(ownerId)) return true;
    
    let botAdmin = await BotAdmin.findOne({ userId, isActive: true });
    if (botAdmin) return true;
    
    let admins = await getConfig("admins", []);
    if (Array.isArray(admins) && admins.some(id => Number(id) === Number(userId))) return true;
    
    return false;
  } catch (e) {
    return false;
  }
}

async function isAdminDisabled(userId) {
  try {
    let botAdmin = await BotAdmin.findOne({ userId, isActive: false });
    return !!botAdmin;
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
  let str = String(upi);
  let parts = str.split('@');
  if (parts.length !== 2) {
    return str.length > 6 ? str.substring(0, 3) + '****' + str.substring(str.length - 2) : '****';
  }
  let name = parts[0], domain = parts[1];
  let maskedName = name.length > 3 ? name.substring(0, 3) + '****' : name.substring(0, 2) + '***';
  let maskedDomain = domain.length > 3 ? domain.substring(0, 3) + '***' : domain.substring(0, 2) + '**';
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
  let maskedAcc = str.length > 8 ? str.substring(0, 4) + '****' + str.substring(str.length - 4) : '****';
  let maskedIfsc = ifsc;
  if (ifsc && ifsc !== "Not Set") {
    let ifscStr = String(ifsc);
    maskedIfsc = ifscStr.length > 6 ? ifscStr.substring(0, 4) + '****' : '****';
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

function calculateTax(amount) {
  return { tax: 0, afterTax: amount };
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
// 📝 DEFAULT CONFIG VALUES
// ============================================================
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: "📋 BOT TASK",        key: "btn_tasks",    row: 0 },
  { name: "💸 MY BALANCE",      key: "btn_balance",  row: 1 },
  { name: "⚡ QUICK PAY",        key: "btn_quickpay", row: 1 },
  { name: "🎁 GIFT CODE",       key: "btn_gift",     row: 2 },
  { name: "💳 PAYMENT METHOD",  key: "btn_payout",   row: 2 },
  { name: "🚀 WITHDRAW",        key: "btn_withdraw", row: 3 }
];

const DEFAULT_BALANCE_TEXT = {
  welcome: "⭐ Welcome To Bot!",
  walletId: "🔵 Wallet ID ➝",
  balance: "🧾 Balance ➝",
  footer: "❝ Built with security you can Trust.\nSupport that responds promptly ❞"
};

// ============================================================
// 🎨 STYLE COLORS
// ============================================================
const INLINE_STYLE_COLORS = {
  primary: { label: "Blue",  emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger:  { label: "Red",   emoji: "🔴" },
  white:   { label: "White", emoji: "⚪" }
};

const STYLE_COLORS = INLINE_STYLE_COLORS;

// ============================================================
// 📝 PART 1 END
// ============================================================

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
      .provider-text{font-size:13px;color:#8a9ba8;}
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
// ✅ CUSTOM API — MacroDroid UTR Injection
// ============================================================
app.post("/api/add-payment", async (req, res) => {
  try {
    const { utr, amount, secret_key, raw_sms } = req.body;

    const validKey = await getConfig("auto_upi_api_key", "DEFAULT_SECRET_KEY");
    if (secret_key !== validKey) {
      return res.status(403).json({ success: false, message: "Invalid Secret Key" });
    }

    if (!utr || !amount) {
      return res.status(400).json({ success: false, message: "UTR and Amount required" });
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

    console.log(`✅ Payment Recorded — UTR: ${cleanUtr}, ₹${amt}`);
    res.json({ success: true, message: "Payment recorded", utr: cleanUtr });
  } catch (e) {
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
// 🌐 GATEWAY PAYMENT PROCESSOR
// ============================================================
async function processGatewayPayment(data) {
  const {
    gatewayKey,
    upi = '',
    wallet = '',
    number = '',
    amount = 0,
    comment = 'Telegram Transaction',
    userId = '',
    orderId = '',
    txnId = '',
    timestamp = Date.now()
  } = data;

  let gateway = await Gateway.findOne({ name: gatewayKey, isActive: true });
  if (!gateway || !gateway.url) {
    return { status: 'error', message: 'Gateway missing or inactive.' };
  }

  let finalUrl = gateway.url
    .replace(/{number}/g, encodeURIComponent(number))
    .replace(/{wallet}/g, encodeURIComponent(wallet || number))
    .replace(/{upi}/g, encodeURIComponent(upi || number))
    .replace(/{amount}/g, encodeURIComponent(amount))
    .replace(/{comment}/g, encodeURIComponent(comment))
    .replace(/{userId}/g, encodeURIComponent(userId))
    .replace(/{orderId}/g, encodeURIComponent(orderId))
    .replace(/{txnId}/g, encodeURIComponent(txnId))
    .replace(/{timestamp}/g, encodeURIComponent(timestamp));

  console.log(`🌐 Gateway [${gatewayKey}] URL:`, finalUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(finalUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` };
    }

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {
      return { status: 'error', message: 'Invalid response', rawResponse: text.substring(0, 300) };
    }

    const isSuccess =
      json.status === 'success' ||
      json.status === 'Success' ||
      json.status === 'SUCCESS' ||
      json.success === true;

    if (isSuccess) {
      return {
        status: 'success',
        data: json,
        txnNumber: json.txn_id || json.txnNumber || json.transaction_id || null
      };
    }

    return { status: 'failed', message: json.message || json.error || 'Gateway failed', data: json };
  } catch (error) {
    console.error('❌ Gateway Error:', error.message);
    if (error.name === 'AbortError') {
      return { status: 'error', message: 'Gateway timeout (30s)' };
    }
    return { status: 'error', message: error.message };
  }
}

// ============================================================
// 📱 MINI APP PAGE ROUTES
// ============================================================
app.get("/miniapp", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/miniapp/addfund", (req, res) => res.sendFile(path.join(__dirname, "public", "addfund.html")));
app.get("/miniapp/withdraw", (req, res) => res.sendFile(path.join(__dirname, "public", "withdraw.html")));
app.get("/miniapp/task", (req, res) => res.sendFile(path.join(__dirname, "public", "task.html")));
app.get("/miniapp/pay", (req, res) => res.sendFile(path.join(__dirname, "public", "pay.html")));
app.get("/miniapp/profile", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/miniapp/verify", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/miniapp/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// ============================================================
// 📱 MINI APP APIs
// ============================================================

// ----- USER INFO -----
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
        joined: user.createdAt,
        linkedInfo,
        walletAccount: user.walletAccount,
        upiId: user.upiId,
        bankAccNo: user.bankAccNo,
        bankIfsc: user.bankIfsc,
        amazonEmail: user.amazonEmail,
        redeemCodeAddr: user.redeemCodeAddr,
        gatewayName: user.gatewayName,
        gatewayUpi: user.gatewayUpi
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- PROFILE PHOTO -----
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

// ----- IS ADMIN -----
app.get("/miniapp/api/is-admin/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let isAdminUser = await isAdmin(userId);
    res.json({ success: true, isAdmin: isAdminUser });
  } catch (e) { res.json({ success: false, isAdmin: false }); }
});

// ----- PAYMENT METHODS -----
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

// ----- TASKS LIST -----
app.get("/miniapp/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({});
    res.json({ success: true, tasks });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- TOTAL BALANCE -----
app.get("/miniapp/api/total-balance", async (req, res) => {
  try {
    const users = await User.find({});
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    res.json({ success: true, totalBalance, totalUsers: users.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- CHECK USER (Quick Pay) -----
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
      user: {
        userId: user.userId,
        firstName: user.firstName,
        username: user.username,
        balance: user.balance,
        photoUrl
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- QUICK PAY (with admin special) -----
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

    // ✅ Admin special — no balance check
    const isAdminUser = await isAdmin(sId);

    if (!isAdminUser && sender.balance < amt) {
      return res.json({ success: false, error: "Insufficient balance" });
    }

    let wasNegative = sender.balance < amt;

    sender.balance -= amt;
    receiver.balance += amt;
    await sender.save();
    await receiver.save();

    // History
    if (isAdminUser && wasNegative) {
      await logBalanceHistory(sId, `Admin Add Fund - Quick Pay to ${rId}`, -amt);
    } else if (isAdminUser) {
      await logBalanceHistory(sId, `Admin Quick Pay to ${rId}`, -amt);
    } else {
      await logBalanceHistory(sId, `Quick Pay to ${rId}`, -amt);
    }
    await logBalanceHistory(rId, `Quick Pay from ${isAdminUser ? "Admin" : sId}`, amt);

    try {
      await bot.api.sendMessage(rId,
        `🎉 Payment Received!\n\n` +
        `👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n` +
        `🆔 <code>${sId}</code>\n` +
        `💰 ₹${amt.toFixed(2)}\n\n` +
        `💵 Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true, newBalance: sender.balance, wasNegative, isAdmin: isAdminUser });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- UPDATE PAYMENT -----
app.post("/miniapp/api/update-payment", async (req, res) => {
  try {
    const { userId, field, value } = req.body;
    const uid = parseInt(userId, 10);
    const allowed = ["walletAccount", "upiId", "bankAccNo", "bankIfsc", "amazonEmail", "redeemCodeAddr", "gatewayName", "gatewayUpi"];
    if (!allowed.includes(field)) return res.json({ success: false, error: "Invalid field" });

    const update = {};
    update[field] = value;
    await User.findOneAndUpdate({ userId: uid }, update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 🌐 GATEWAY APIs
// ============================================================
app.get("/miniapp/api/gateways", async (req, res) => {
  try {
    const type = req.query.type || "deposit";
    let gateways;
    if (type === "all") {
      gateways = await Gateway.find({ isActive: true });
    } else {
      gateways = await Gateway.find({
        isActive: true,
        type: { $in: [type, "both"] }
      });
    }
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/gateway/pay", async (req, res) => {
  try {
    const { userId, gatewayKey, amount, upi, name } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });

    let user = await getUser(uid);

    // ✅ First time — save name/UPI
    if (name && !user.gatewayName) {
      user.gatewayName = name.trim();
    }
    if (upi) {
      user.gatewayUpi = upi.trim();
      // Also save to walletAccount if not set
      if (!user.walletAccount || user.walletAccount === "Not Set") {
        user.walletAccount = upi.trim();
      }
    }
    await user.save();

    // Call gateway
    let result = await processGatewayPayment({
      gatewayKey,
      upi: upi || user.gatewayUpi,
      wallet: upi || user.gatewayUpi,
      number: upi || user.gatewayUpi,
      amount: amt,
      comment: `Deposit by ${user.gatewayName || "User"}`,
      userId: uid,
      orderId: `DEP${Date.now()}`
    });

    if (result.status === 'success') {
      // Credit balance
      user.balance += amt;
      await user.save();
      await logBalanceHistory(uid, `Gateway Deposit (${gatewayKey})`, amt);

      // Notify payout channel
      const payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel) {
        try {
          await bot.api.sendMessage(payoutChannel,
            `💰 <b>Gateway Deposit!</b>\n\n` +
            `<b>User:</b> ${user.firstName || "User"}\n` +
            `<b>ID:</b> <code>${uid}</code>\n` +
            `<b>Gateway:</b> ${gatewayKey}\n` +
            `<b>Amount:</b> ₹${amt}\n` +
            `<b>UPI:</b> <code>${user.gatewayUpi}</code>`,
            { parse_mode: "HTML" });
        } catch (e) { }
      }

      // Notify user on bot
      try {
        const styledTitle = toSmallCaps("Deposit Auto-Approved!");
        const styledAdded = toSmallCaps("Added:");
        await bot.api.sendMessage(uid,
          `💫 ✅ ${styledTitle}\n\n` +
          `💰 ${styledAdded} ₹${amt}\n` +
          `🌐 Gateway: ${gatewayKey}\n\n` +
          `💵 New Balance: ₹${user.balance.toFixed(2)}`,
          { parse_mode: "Markdown" });
      } catch (e) { }

      res.json({ success: true, message: "Payment successful", newBalance: user.balance });
    } else {
      res.json({ success: false, error: result.message || "Gateway failed" });
    }
  } catch (e) {
    console.error("Gateway pay error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🚀 WITHDRAW (Mini App — with validation)
// ============================================================
app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    // ✅ Validation — method linked?
    let details = "";
    let gatewayForMethod = null;
    
    if (method === "Wallet") {
      // Check if any active "wallet-replace" gateway exists
      let activeGw = await Gateway.findOne({ isActive: true, type: { $in: ["both", "withdraw"] } });
      if (activeGw) {
        details = user.gatewayUpi || user.walletAccount;
      } else {
        details = user.walletAccount;
      }
    } else if (method === "UPI") {
      details = user.upiId;
    } else if (method === "Bank") {
      details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
    } else if (method === "Auto UPI") {
      details = user.gatewayUpi || user.upiId;
      gatewayForMethod = await Gateway.findOne({ isActive: true, type: "withdraw" });
    } else {
      // Custom gateway method
      let gw = await Gateway.findOne({ name: method, isActive: true });
      if (gw) {
        details = user.gatewayUpi || user.walletAccount;
        gatewayForMethod = gw;
      } else {
        return res.json({ success: false, error: "Invalid method" });
      }
    }

    if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
      return res.json({
        success: false,
        error: `${method} not linked! Please add it first.`,
        needsLink: true,
        method: method
      });
    }

    // ✅ Min/Max check
    const minW = await getConfig("min_withdraw", 10);
    const maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amt) || amt < minW || amt > maxW) {
      return res.json({ success: false, error: `Min ₹${minW} | Max ₹${maxW}` });
    }
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    // ✅ Deduct balance
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${method} (MiniApp)`, -amt);

    let prevCount = await Withdrawal.countDocuments({ userId: uid });
    let userWithdrawalCount = prevCount + 1;

    const withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ Auto gateway processing?
    if (gatewayForMethod) {
      // Direct auto process
      let result = await processGatewayPayment({
        gatewayKey: gatewayForMethod.name,
        upi: details,
        wallet: details,
        number: details,
        amount: amt,
        comment: `Withdrawal #${userWithdrawalCount}`,
        userId: uid,
        orderId: withdrawalId
      });

      if (result.status === 'success') {
        let txnNumber = result.txnNumber || generateTxnNumber();
        await Withdrawal.create({
          withdrawalId, userId: uid, userWithdrawalCount,
          amount: amt, method, details, status: "Approved",
          gateway: gatewayForMethod.name, txnNumber,
          approvedBy: "Auto Gateway", approvedAt: new Date()
        });

        try {
          await bot.api.sendMessage(uid,
            `🎁Your Withdrawal of Rs.${amt.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
            `🏦 Destination ==> ${details}\n` +
            `🚀Transaction ID ==> ${txnNumber}\n` +
            `🗓 Date ==> ${formatDateTime(new Date())}\n\n` +
            `✅Please Check Your ${gatewayForMethod.name} Account!`);
        } catch (e) { }

        return res.json({ success: true, autoProcessed: true, withdrawalId, txnNumber });
      } else {
        // Refund
        user.balance += amt;
        user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amt);
        await user.save();
        await logBalanceHistory(uid, `Withdrawal Failed (Refunded)`, amt);
        return res.json({ success: false, error: `Gateway: ${result.message}` });
      }
    }

    // ✅ Manual — create pending
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
          `⚠️ New ${method.toUpperCase()} Payout Request! (#${userWithdrawalCount})\n\n` +
          `User : ${uid}\n` +
          `Request Amount : ₹${amt}\n` +
          `Amount After Tax (${tax.toFixed(1)}) : ₹${afterTax}\n` +
          `${method} : ${details}\n` +
          `Transaction ID : -`,
          { reply_markup: adminKb });
      } catch (e) { }
    }

    res.json({ success: true, withdrawalId });
  } catch (e) {
    console.error("Withdraw error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ----- SUBMIT TASK -----
app.post("/miniapp/api/submit-task", async (req, res) => {
  try {
    const { userId, taskId, photoBase64 } = req.body;
    if (!userId || !taskId || !photoBase64) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) {
      return res.json({ success: false, error: "Already completed!" });
    }

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
      `📸 *New Task Submission (MiniApp)!*\n\n👤 ${userName}\n🆔 \`${uid}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*`;
    const kb = new InlineKeyboard()
      .text("✅ Approve", `task_app_${submissionId}`)
      .text("❌ Reject", `task_rej_${submissionId}`);

    let sentMsg;
    try {
      sentMsg = await bot.api.sendPhoto(alertChannel, new InputFile(buffer, "proof.jpg"), {
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

    res.json({ success: true, submissionId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ----- SUBMIT REFER -----
app.post("/miniapp/api/submit-refer", async (req, res) => {
  try {
    const { userId, taskId, referValue } = req.body;
    if (!userId || !taskId || !referValue) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) {
      return res.json({ success: false, error: "Already completed!" });
    }

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
      `📸 *Task Submission (Refer)*\n\n👤 *${userName}*\n🆔 \`${uid}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 \`${referValue}\``;

    let kb = new InlineKeyboard()
      .text("✅ Approve", `task_app_${submissionId}`)
      .text("❌ Reject", `task_rej_${submissionId}`);

    try {
      await bot.api.sendMessage(alertChannel, caption, { parse_mode: "Markdown", reply_markup: kb });
    } catch (e) {
      return res.json({ success: false, error: "Failed: " + e.message });
    }

    res.json({ success: true, submissionId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 💠 UPI SETTINGS API
// ============================================================
app.get("/miniapp/api/upi-settings", async (req, res) => {
  try {
    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    const upiId = await getConfig("auto_upi_id", "nasih@fam");
    const enabled = await getConfig("auto_upi_enabled", true);

    res.json({ success: true, min: minAmt, max: maxAmt, upiId, enabled });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 💠 UPI VERIFY API (Auto + Manual)
// ============================================================
app.post("/miniapp/api/upi/verify", async (req, res) => {
  try {
    const { userId, amount, utr, upiId } = req.body;
    if (!userId || !amount || !utr) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const cleanUtr = String(utr).trim().replace(/\s/g, "");

    if (cleanUtr.length < 10 || cleanUtr.length > 25 || !/^\d+$/.test(cleanUtr)) {
      return res.json({ success: false, error: "Invalid UTR format" });
    }

    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    if (isNaN(amt) || amt < minAmt || amt > maxAmt) {
      return res.json({ success: false, error: `Amount must be ₹${minAmt}-₹${maxAmt}` });
    }

    const existingUsed = await UPIPayment.findOne({ utr: cleanUtr, status: "Approved" });
    if (existingUsed) {
      return res.json({ success: false, error: "This UTR has already been used" });
    }

    const autoEnabled = await getConfig("auto_verify_enabled", true);
    const manualEnabled = await getConfig("manual_verify_enabled", true);
    if (!autoEnabled && !manualEnabled) {
      return res.json({ success: false, error: "Add Fund is temporarily disabled" });
    }

    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const user = await getUser(uid);

    if (autoEnabled) {
      const receivedPayment = await ReceivedPayment.findOne({ utr: cleanUtr, status: "UNUSED" });

      if (receivedPayment && Math.abs(receivedPayment.amount - amt) <= 0.5) {
        receivedPayment.status = "USED";
        receivedPayment.usedByUserId = uid;
        receivedPayment.usedAt = new Date();
        await receivedPayment.save();

        await UPIPayment.create({
          orderId, userId: uid, amount: amt,
          utr: cleanUtr, upiId: upiId || await getConfig("auto_upi_id", "nasih@fam"),
          status: "Approved", source: "miniapp-auto",
          verifiedAt: new Date(), approvedBy: "Auto (MacroDroid)"
        });

        user.balance += amt;
        await user.save();
        await logBalanceHistory(uid, `UPI Deposit (Auto UTR: ${cleanUtr})`, amt);

        const payoutChannel = await getConfig("payout_channel", null);
        if (payoutChannel) {
          try {
            await bot.api.sendMessage(payoutChannel,
              `💰 <b>New UPI Deposit (Auto)!</b>\n\n` +
              `<b>User:</b> ${user.firstName || "User"}\n` +
              `<b>ID:</b> <code>${uid}</code>\n` +
              `<b>Amount:</b> ₹${amt}\n` +
              `<b>UTR:</b> <code>${cleanUtr}</code>`,
              { parse_mode: "HTML" });
          } catch (e) { }
        }

        try {
          const styledTitle = toSmallCaps("Deposit Auto-Approved!");
          const styledAdded = toSmallCaps("Added:");
          const styledUTR = toSmallCaps("UTR:");
          await bot.api.sendMessage(uid,
            `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${amt}\n🔐 ${styledUTR} ${cleanUtr}`,
            { parse_mode: "Markdown" });
        } catch (e) { }

        return res.json({ success: true, mode: "auto", newBalance: user.balance });
      }

      if (!manualEnabled) {
        return res.json({ success: false, error: "Payment not found. Please wait." });
      }
    }

    if (manualEnabled) {
      await UPIPayment.create({
        orderId, userId: uid, amount: amt,
        utr: cleanUtr, upiId: upiId || await getConfig("auto_upi_id", "nasih@fam"),
        status: "Pending", source: "miniapp-manual"
      });

      const payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel) {
        const kb = new InlineKeyboard()
          .text("✅ Approve", `upi_app_${orderId}`)
          .text("❌ Reject", `upi_rej_${orderId}`);

        try {
          await bot.api.sendMessage(payoutChannel,
            `💰 <b>UPI Deposit Request</b>\n\n` +
            `<b>User:</b> ${user.firstName || "User"}\n` +
            `<b>ID:</b> <code>${uid}</code>\n` +
            `<b>Amount:</b> ₹${amt}\n` +
            `<b>UTR:</b> <code>${cleanUtr}</code>\n` +
            `<b>Order:</b> <code>${orderId}</code>`,
            { parse_mode: "HTML", reply_markup: kb });
        } catch (e) { }
      }

      return res.json({ success: true, mode: "manual", newBalance: user.balance });
    }

    return res.json({ success: false, error: "No verify mode enabled" });
  } catch (e) {
    console.error("UPI verify error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// ✅ VERIFICATION APIs
// ============================================================
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
    } catch (e) { }

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
      return res.json({ success: false, verified: false, reason: verifyRec.reason });
    }

    verifyRec.verified = true;
    verifyRec.reason = "";
    verifyRec.deviceHash = deviceHash;
    verifyRec.verifiedAt = new Date();
    await verifyRec.save();

    res.json({ success: true, verified: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 📝 PART 2 END
// ============================================================

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

    // Force Join
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

    // ✅ Get channel for welcome message
    let welcomeChannelLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

    let welcomeText =
      `💫 <b>Welcome To Task Payment Bot!</b>\n\n` +
      `To Know How To Earn → <a href="${welcomeChannelLink}">CLICK HERE</a>`;

    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(userId), parse_mode: "HTML" });
    } catch (htmlErr) {
      await ctx.reply(`👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome!`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }

    // ❌ REMOVED — Open Mini App message (linked in sidebar)

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
  await ctx.reply("👋 Welcome!", { reply_markup: await buildKeyboardFromLayout(ctx.from.id) });
});

// ============================================================
// 🎨 BUILD KEYBOARD FROM LAYOUT (User-specific)
// ============================================================
async function buildKeyboardFromLayout(userId) {
  let userPref = await UserPreference.findOne({ userId });
  let layout;
  
  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    layout = userPref.keyboardLayout;
  } else {
    layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  }
  
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
// ✅ BUILD STYLED INLINE KEYBOARD
// ============================================================
async function buildStyledKb(buttons, userId = null) {
  let styleMap = await getConfig("inline_button_styles", {});
  let names = await getConfig("inline_button_names", {});
  
  // ✅ User-specific overrides (if any)
  if (userId) {
    let userPref = await UserPreference.findOne({ userId });
    if (userPref && userPref.inlineMenus && userPref.inlineMenus.styles) {
      // Merge user styles
      styleMap = { ...styleMap, ...userPref.inlineMenus.styles };
    }
  }

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
// 🔧 HELPER: Get user-specific keyboard layout
// ============================================================
async function getCurrentKeyboardLayoutForUser(userId) {
  let userPref = await UserPreference.findOne({ userId });
  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    return userPref.keyboardLayout;
  }
  return await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
}

// ============================================================
// 🔧 isWithdrawEnabled helper
// ============================================================
async function isWithdrawEnabled(method) {
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  return toggles[method.toLowerCase()] !== false;
}

// ============================================================
// 💾 saveCodes helper
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
  let title = type === "amazon" ? "Amazon Codes" : "Redeem Codes";
  let summary = `${icon} *${title} Added*\n\n`;
  if (added.length > 0) summary += `✅ Added (${added.length}):\n${added.join("\n")}\n\n`;
  if (failed.length > 0) summary += `❌ Failed (${failed.length}):\n${failed.map(f => `• ${f}`).join("\n")}\n\n`;
  summary += `📊 Added: ${added.length} | ❌ Failed: ${failed.length}`;

  await ctx.reply(summary, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", type === "amazon" ? "adm_amazon" : "adm_create_gift")
  });
}

// ============================================================
// 💬 MESSAGE TEXT HANDLER
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    // ❌ Cancel
    if (text === "❌ Cancel") {
      delete userState[userId];
      await ctx.reply("❌ Cancelled.", { reply_markup: await buildKeyboardFromLayout(userId) });
      return;
    }

    // ═══════════════════════════════════════════════════════
    // 🌐 GATEWAY FIRST-TIME SETUP
    // ═══════════════════════════════════════════════════════
    if (state === "GATEWAY_WAIT_NAME") {
      delete userState[userId];
      let name = text.trim();
      if (!name || name.length < 2) return ctx.reply("❌ Invalid name!");
      
      let user = await getUser(userId);
      user.gatewayName = name;
      await user.save();
      
      userState[userId] = "GATEWAY_WAIT_UPI";
      return ctx.reply(
        `✅ Name saved: ${name}\n\n📝 Enter your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
      );
    }

    if (state === "GATEWAY_WAIT_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format! Must contain @");
      
      let user = await getUser(userId);
      user.gatewayUpi = upi;
      if (!user.walletAccount || user.walletAccount === "Not Set") {
        user.walletAccount = upi;
      }
      await user.save();
      
      return ctx.reply(
        `✅ UPI saved: <code>${upi}</code>\n\n` +
        `Now you can use Add Fund & Withdraw!`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) }
      );
    }

    // ═══════════════════════════════════════════════════════
    // 💠 UPI DEPOSIT — Amount
    // ═══════════════════════════════════════════════════════
    if (state === "UPI_WAIT_AMOUNT") {
      delete userState[userId];
      let amt = parseFloat(text);
      let minAmt = await getConfig("auto_upi_min", 5);
      let maxAmt = await getConfig("auto_upi_max", 200);

      if (isNaN(amt) || amt < minAmt || amt > maxAmt) {
        return ctx.reply(`❌ Amount must be between ₹${minAmt} and ₹${maxAmt}`);
      }

      let upiId = await getConfig("auto_upi_id", "nasih@fam");
      let orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

      await UPIPayment.create({
        orderId, userId, amount: amt, upiId, status: "Pending", source: "bot"
      });

      userState[userId] = `UPI_WAIT_UTR_${orderId}_${amt}`;

      const styledEnter = toSmallCaps("After Payment, Send UTR:");
      const styledTap = toSmallCaps("(Tap UPI to copy)");

      return ctx.reply(
        `✅ Amount Set: ₹${amt}\n\n` +
        `📱 Pay to UPI: \`${upiId}\`\n` +
        `${styledTap}\n\n` +
        `🔐 ${styledEnter}\n\n` +
        `🆔 Order: \`${orderId}\``,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel")
        }
      );
    }

    // ═══════════════════════════════════════════════════════
    // 💠 UPI DEPOSIT — UTR
    // ═══════════════════════════════════════════════════════
    if (state && state.startsWith("UPI_WAIT_UTR_")) {
      let parts = state.replace("UPI_WAIT_UTR_", "").split("_");
      let orderId = parts[0];
      let amount = parseFloat(parts[1]);
      delete userState[userId];

      let utr = text.trim().replace(/\s/g, "");
      if (utr.length < 10 || utr.length > 25 || !/^\d+$/.test(utr)) {
        return ctx.reply(`❌ *Invalid UTR*\n\nSend correct 12-digit UTR.`, { parse_mode: "Markdown" });
      }

      let existingUsed = await UPIPayment.findOne({ utr, status: "Approved" });
      if (existingUsed) return ctx.reply("❌ UTR already used!");

      await ctx.reply("⏳ Verifying your payment...");

      let autoEnabled = await getConfig("auto_verify_enabled", true);
      let manualEnabled = await getConfig("manual_verify_enabled", true);

      if (!autoEnabled && !manualEnabled) {
        return ctx.reply("❌ Add Fund temporarily disabled.");
      }

      let user = await getUser(userId);

      // ✅ AUTO VERIFY
      if (autoEnabled) {
        let receivedPayment = await ReceivedPayment.findOne({ utr, status: "UNUSED" });

        if (receivedPayment && Math.abs(receivedPayment.amount - amount) <= 0.5) {
          receivedPayment.status = "USED";
          receivedPayment.usedByUserId = userId;
          receivedPayment.usedAt = new Date();
          await receivedPayment.save();

          let payment = await UPIPayment.findOne({ orderId });
          if (payment) {
            payment.utr = utr;
            payment.status = "Approved";
            payment.verifiedAt = new Date();
            payment.approvedBy = "Auto (MacroDroid)";
            await payment.save();
          }

          user.balance += amount;
          await user.save();
          await logBalanceHistory(userId, `UPI Deposit (Auto UTR: ${utr})`, amount);

          const styledTitle = toSmallCaps("Deposit Auto-Approved!");
          const styledAdded = toSmallCaps("Added:");
          const styledUTR = toSmallCaps("UTR:");

          await ctx.reply(
            `💫 ✅ ${styledTitle}\n\n` +
            `💰 ${styledAdded} ₹${amount}\n` +
            `🔐 ${styledUTR} ${utr}`,
            { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) }
          );

          // Payout notification
          let payoutChannel = await getConfig("payout_channel", null);
          if (payoutChannel) {
            try {
              await ctx.api.sendMessage(payoutChannel,
                `💰 <b>New UPI Deposit (Auto)!</b>\n\n` +
                `<b>User:</b> ${user.firstName || "User"}\n` +
                `<b>ID:</b> <code>${userId}</code>\n` +
                `<b>Amount:</b> ₹${amount}\n` +
                `<b>UTR:</b> <code>${utr}</code>`,
                { parse_mode: "HTML" });
            } catch (e) {}
          }
          return;
        }

        if (!manualEnabled) {
          return ctx.reply(`❌ *Payment Not Found*\n\nUTR: \`${utr}\``, { parse_mode: "Markdown" });
        }
      }

      // ⏳ MANUAL
      if (manualEnabled) {
        let payment = await UPIPayment.findOne({ orderId });
        if (payment) {
          payment.utr = utr;
          payment.status = "Pending";
          payment.source = "bot-manual";
          await payment.save();
        }

        let payoutChannel = await getConfig("payout_channel", null);
        if (payoutChannel) {
          let kb = new InlineKeyboard()
            .text("✅ Approve", `upi_app_${orderId}`)
            .text("❌ Reject", `upi_rej_${orderId}`);

          try {
            await ctx.api.sendMessage(payoutChannel,
              `💰 <b>UPI Deposit Request (Manual)</b>\n\n` +
              `<b>User:</b> ${user.firstName || "User"}\n` +
              `<b>ID:</b> <code>${userId}</code>\n` +
              `<b>Amount:</b> ₹${amount}\n` +
              `<b>UTR:</b> <code>${utr}</code>`,
              { parse_mode: "HTML", reply_markup: kb });
          } catch (e) {}
        }

        return ctx.reply(
          `⏳ *Deposit Pending*\n\n💰 ₹${amount}\n🔐 \`${utr}\`\n\n🕐 Admin will verify.`,
          { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) }
        );
      }
    }

    // ═══════════════════════════════════════════════════════
    // 🚀 WITHDRAW — Add method (if not linked)
    // ═══════════════════════════════════════════════════════
    if (state === "WD_ADD_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format!");
      
      let user = await getUser(userId);
      user.upiId = upi;
      await user.save();
      
      return ctx.reply(
        `✅ UPI Saved!\n\n📌 <code>${upi}</code>\n\nNow you can withdraw via UPI.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🚀 Withdraw Now", "wd_upi")
            .row()
            .text("🔙 Main Menu", "back_to_balance")
        }
      );
    }

    if (state === "WD_ADD_WALLET") {
      delete userState[userId];
      let wallet = text.trim();
      
      let user = await getUser(userId);
      user.walletAccount = wallet;
      await user.save();
      
      return ctx.reply(
        `✅ Wallet Saved!\n\n📌 <code>${wallet}</code>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🚀 Withdraw Now", "wd_wallet")
            .row()
            .text("🔙 Main Menu", "back_to_balance")
        }
      );
    }

    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(
        `✅ Account: <code>${text.trim()}</code>\n\n📝 Send IFSC Code:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
      );
    }

    if (state.startsWith("WD_ADD_BANK_IFSC_")) {
      let accNo = state.replace("WD_ADD_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      
      let user = await getUser(userId);
      user.bankAccNo = accNo;
      user.bankIfsc = ifsc;
      await user.save();
      
      return ctx.reply(
        `✅ Bank Saved!\n\n🏦 <code>${accNo}</code>\n🔢 <code>${ifsc}</code>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🚀 Withdraw Now", "wd_bank")
            .row()
            .text("🔙 Main Menu", "back_to_balance")
        }
      );
    }

    // ═══════════════════════════════════════════════════════
    // 🚀 WITHDRAW AMOUNT
    // ═══════════════════════════════════════════════════════
    if (state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 10);
      let maxW = await getConfig("max_withdraw", 10000);
      if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
        return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
      }
      if (user.balance < amount) return ctx.reply("❌ Insufficient!");

      let details = "";
      if (method === "Wallet") details = user.walletAccount;
      else if (method === "UPI") details = user.upiId;
      else if (method === "Bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;

      userState[userId] = `WD_CONFIRM_${method}_${amount}`;

      let kb = new InlineKeyboard()
        .text("✅ Confirm", `conf_wd_${method}_${amount}`)
        .text("❌ Cancel", "canc_wd");

      return ctx.reply(
        `📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: \`${details}\`\nAmount: ₹${amount}\n\nConfirm?`,
        { reply_markup: kb, parse_mode: "Markdown" }
      );
    }

    // ═══════════════════════════════════════════════════════
    // ⚡ QUICK PAY — User ID
    // ═══════════════════════════════════════════════════════
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
      return ctx.reply(
        `👤 *${receiver.firstName || "User"}*\n🆔 \`${receiver.userId}\`\n\n💰 Send Amount:\n\n💵 Your Balance: ₹${sender.balance.toFixed(2)}`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel") }
      );
    }

    // ═══════════════════════════════════════════════════════
    // ⚡ QUICK PAY — Amount
    // ═══════════════════════════════════════════════════════
    if (state === "QP_WAIT_AMOUNT") {
      let amt = parseFloat(text.trim());
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid amount!");

      let sender = await getUser(userId);
      let isAdminUser = await isAdmin(userId);

      // ✅ Regular user check
      if (!isAdminUser && sender.balance < amt) {
        return ctx.reply(
          `❌ *Insufficient Balance!*\n\n` +
          `💵 Your: ₹${sender.balance.toFixed(2)}\n` +
          `💰 Required: ₹${amt}\n\n` +
          `Please add funds first.`,
          { parse_mode: "Markdown" }
        );
      }

      // ✅ Admin — no check (allowed even if 0)

      let cacheObj = global.quickPayCache?.[userId];
      if (!cacheObj) return ctx.reply("❌ Session expired!");

      let receiver = await User.findOne({ userId: cacheObj.receiverId });
      if (!receiver) return ctx.reply("❌ Receiver not found!");

      userState[userId] = `QP_CONFIRM_${cacheObj.receiverId}_${amt}`;

      // ✅ Different format based on role
      let msg;
      if (isAdminUser) {
        // Admin — only receiver balance shown
        msg =
          `⚠️ Confirm Payment\n\n` +
          `👤 ${receiver.firstName || "User"}\n` +
          `🆔 <code>${receiver.userId}</code>\n` +
          `💰 Amount: ₹${amt}\n\n` +
          `📊 Balance Update:\n` +
          `💰 Receiver: ₹${receiver.balance.toFixed(2)} → ₹${(receiver.balance + amt).toFixed(2)}`;
      } else {
        // Normal user — both
        msg =
          `⚠️ Confirm Payment\n\n` +
          `👤 ${receiver.firstName || "User"}\n` +
          `🆔 <code>${receiver.userId}</code>\n` +
          `💰 Amount: ₹${amt}\n\n` +
          `📊 Balance Update:\n` +
          `💵 Your: ₹${sender.balance.toFixed(2)} → ₹${(sender.balance - amt).toFixed(2)}\n` +
          `💰 Receiver: ₹${receiver.balance.toFixed(2)} → ₹${(receiver.balance + amt).toFixed(2)}`;
      }

      return ctx.reply(msg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirm", "qp_confirm")
          .text("❌ Cancel", "qp_cancel")
      });
    }

    // ═══════════════════════════════════════════════════════
    // 🎁 GIFT CODE REDEEM
    // ═══════════════════════════════════════════════════════
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
      return ctx.reply(`🎉 Gift redeemed! Added ₹${gift.amount}.`);
    }

    // ═══════════════════════════════════════════════════════
    // 💳 PAYMENT METHOD SETTING (Profile)
    // ═══════════════════════════════════════════════════════
    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
      return ctx.reply(`✅ Wallet: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ UPI: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 Send IFSC Code`, { reply_markup: new Keyboard().text("❌ Cancel").resized() });
    }
    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim() });
      return ctx.reply(`✅ Bank updated!`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "SET_AMAZON_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text.trim() });
      return ctx.reply(`✅ Email: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "SET_REDEEM_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text.trim() });
      return ctx.reply(`✅ Redeem: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }

    // ═══════════════════════════════════════════════════════
    // 🔧 ADMIN STATES
    // ═══════════════════════════════════════════════════════
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      return ctx.reply(`🙇‍♂️ USER DETAILS\n\n🚻 ${targetUser.firstName || "Unknown"}\n🆔 ${targetUser.userId}\n💰 ₹${targetUser.balance.toFixed(2)}`, {
        reply_markup: new InlineKeyboard().text("🔙 Back", "admin")
      });
    }

    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split(/\s+/);
      let targetId = parseInt(parts[0], 10);
      let amount = parseFloat(parts[1]);
      if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: UserID Amount");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) {
        targetUser = await User.create({ userId: targetId, firstName: "Unknown", balance: amount });
        await logBalanceHistory(targetId, "Admin Added Balance (New)", amount);
        return ctx.reply(`✅ Added ₹${amount} to new user ${targetId}.`);
      }
      targetUser.balance += amount;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
      return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

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

    // User detail — Remove balance
    if (state.startsWith("UREM_WAIT_")) {
      let targetId = parseInt(state.replace("UREM_WAIT_", ""), 10);
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply("❌ User not found!");
      targetUser.balance = Math.max(0, targetUser.balance - amount);
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
      
      try {
        await ctx.api.sendMessage(targetId,
          `💰 Balance Updated!\n\n📉 Removed: ₹${amount}\n💵 New Balance: ₹${targetUser.balance.toFixed(2)}`);
      } catch (e) {}
      
      return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, {
        reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`)
      });
    }

    // User detail — Add balance
    if (state.startsWith("UADD_WAIT_")) {
      let targetId = parseInt(state.replace("UADD_WAIT_", ""), 10);
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply("❌ User not found!");
      targetUser.balance += amount;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
      
      try {
        await ctx.api.sendMessage(targetId,
          `💰 Balance Updated!\n\n🟢 Added: ₹${amount}\n💵 New Balance: ₹${targetUser.balance.toFixed(2)}`);
      } catch (e) {}
      
      return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, {
        reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`)
      });
    }

    // User detail — Send message
    if (state.startsWith("UMSG_WAIT_")) {
      let targetId = parseInt(state.replace("UMSG_WAIT_", ""), 10);
      delete userState[userId];
      try {
        await ctx.api.sendMessage(targetId,
          `📨 Message from Admin:\n\n${text}`);
        return ctx.reply(`✅ Sent to ${targetId}`, {
          reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${targetId}`)
        });
      } catch (e) {
        return ctx.reply(`❌ Failed: ${e.message}`);
      }
    }

    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("min_withdraw", amt);
      return ctx.reply(`✅ Min: ₹${amt}`);
    }
    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await setConfig("max_withdraw", amt);
      return ctx.reply(`✅ Max: ₹${amt}`);
    }
    if (state === "WAITING_FOR_P_CHAN" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("payout_channel", text);
      return ctx.reply(`✅ Payout Channel: ${text}`);
    }
    if (state === "WAITING_FOR_SUPPORT_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("support_username", text.trim());
      return ctx.reply(`✅ Support: ${text.trim()}`);
    }

    // Edit footer text
    if (state === "WAITING_BALANCE_FOOTER" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("balance_footer_text", text);
      return ctx.reply(`✅ Footer updated!\n\n📌 Preview:\n${text}`, {
        reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings")
      });
    }

    if (state === "WAITING_BALANCE_WELCOME" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("balance_welcome_text", text);
      return ctx.reply(`✅ Welcome text updated!`);
    }

    // UPI Settings
    if (state === "UPI_SET_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("auto_upi_id", text.trim());
      return ctx.reply(`✅ UPI ID: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_addfund_menu") });
    }
    if (state === "UPI_SET_MIN" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid");
      await setConfig("auto_upi_min", amt);
      return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_addfund_menu") });
    }
    if (state === "UPI_SET_MAX" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid");
      await setConfig("auto_upi_max", amt);
      return ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_addfund_menu") });
    }

    // Add Admin
    if (state === "WAITING_ADMIN_ADD" && (await isOwner(userId))) {
      delete userState[userId];
      let newAdminId = parseInt(text.trim(), 10);
      if (isNaN(newAdminId)) return ctx.reply("❌ Invalid!");
      if (newAdminId === userId) return ctx.reply("❌ You are owner!");
      
      let targetUser = await User.findOne({ userId: newAdminId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      
      await BotAdmin.findOneAndUpdate(
        { userId: newAdminId },
        { addedAt: new Date(), addedBy: userId, isActive: true },
        { upsert: true }
      );
      
      return ctx.reply(`✅ Admin Added!\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newAdminId}\``, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔙 Back", "adm_admins")
      });
    }

    // Send message to admin
    if (state.startsWith("WAITING_MSG_ADMIN_") && (await isOwner(userId))) {
      let adminId = parseInt(state.replace("WAITING_MSG_ADMIN_", ""), 10);
      delete userState[userId];
      try {
        await ctx.api.sendMessage(adminId, `💬 *Message from Owner:*\n\n${text}`, { parse_mode: "Markdown" });
        return ctx.reply(`✅ Sent!`, { parse_mode: "Markdown" });
      } catch (e) {
        return ctx.reply("❌ Failed!");
      }
    }

    // Transfer Ownership
    if (state === "WAITING_NEW_OWNER" && (await isOwner(userId))) {
      delete userState[userId];
      let newOwnerId = parseInt(text.trim(), 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: newOwnerId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      let kb = new InlineKeyboard()
        .text("✅ Yes, Transfer", `admin_transfer_confirm_${newOwnerId}`).row()
        .text("❌ Cancel", "adm_admins");
      return ctx.reply(`⚠️ *Confirm Transfer*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newOwnerId}\`\n\nSure?`, {
        parse_mode: "Markdown", reply_markup: kb
      });
    }

    // Setup Channel
    if (state === "SETUP_CH_WAIT" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length !== 2) return ctx.reply("❌ Format: `ChannelID | InviteLink`", { parse_mode: "Markdown" });
      
      let channelId = parts[0];
      let inviteLink = parts[1];
      
      if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) {
        return ctx.reply("❌ Invalid Channel ID!");
      }
      if (!inviteLink.startsWith("https://t.me/")) {
        return ctx.reply("❌ Invalid Invite Link!");
      }
      
      let channelTitle = "";
      try {
        let chatInfo = await ctx.api.getChat(channelId);
        channelTitle = chatInfo.title || channelId;
        
        let botInfo = await ctx.api.getMe();
        let botMember = await ctx.api.getChatMember(channelId, botInfo.id);
        if (!["administrator", "creator"].includes(botMember.status)) {
          return ctx.reply("❌ Bot must be admin in channel!");
        }
      } catch (e) {
        return ctx.reply(`❌ Cannot access channel: ${e.message}`);
      }
      
      await setConfig("welcome_channel_id", channelId);
      await setConfig("welcome_channel_link", inviteLink);
      await setConfig("welcome_channel_name", channelTitle);
      
      return ctx.reply(
        `✅ Channel Added!\n\n` +
        `📢 ID: <code>${channelId}</code>\n` +
        `📛 Name: ${channelTitle}\n` +
        `🔗 Link: ${inviteLink}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("🔙 Back", "adm_setup_channel")
        }
      );
    }

    // Broadcast
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      global.broadcastCache = global.broadcastCache || {};
      global.broadcastCache[userId] = { text };

      return ctx.reply(
        `📢 *Broadcast Preview*\n\n${text}\n\n👥 Recipients: ${allUsers.length}\n\nConfirm?`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("✅ Confirm", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel")
        }
      );
    }

    // Create Task
    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
      await Task.create({
        taskId: parts[0], title: parts[1],
        reward: parseFloat(parts[2]), link: parts[3],
        alertChannel: await getConfig("default_task_alert_channel", "Not Set")
      });
      return ctx.reply(`✅ Task '${parts[1]}' created!`);
    }

    // Gift codes
    if (state === "WAITING_REDEEM_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      return await saveCodes(text, "redeem", ctx);
    }
    if (state === "WAITING_AMAZON_CODES" && (await isAdmin(userId))) {
      delete userState[userId];
      return await saveCodes(text, "amazon", ctx);
    }

    // Gift code edit
    if (state.startsWith("WAITING_GC_AMT_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_GC_AMT_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "redeem" }, { amount: amt });
      return ctx.reply(`✅ Amount: ₹${amt}`);
    }
    if (state.startsWith("WAITING_GC_MAX_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_GC_MAX_", "");
      delete userState[userId];
      let maxUses = parseInt(text);
      if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "redeem" }, { maxUses });
      return ctx.reply(`✅ Max: ${maxUses}`);
    }
    if (state.startsWith("WAITING_AMZ_AMT_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_AMZ_AMT_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "amazon" }, { amount: amt });
      return ctx.reply(`✅ Amount: ₹${amt}`);
    }
    if (state.startsWith("WAITING_AMZ_MAX_") && (await isAdmin(userId))) {
      let code = state.replace("WAITING_AMZ_MAX_", "");
      delete userState[userId];
      let maxUses = parseInt(text);
      if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
      await GiftCode.updateOne({ code, type: "amazon" }, { maxUses });
      return ctx.reply(`✅ Max: ${maxUses}`);
    }

    // User message
    if (state === "WAITING_FOR_USER_MESSAGE" && (await isAdmin(userId))) {
      delete userState[userId];
      let parts = text.split("|").map(p => p.trim());
      if (parts.length < 2) return ctx.reply(`❌ Format: \`UserID | Message\``, { parse_mode: "Markdown" });
      let targetId = parseInt(parts[0], 10);
      let message = parts.slice(1).join("|").trim();
      if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");
      try {
        await ctx.api.sendMessage(targetId, `📨 *Admin Message*\n\n${message}`, { parse_mode: "Markdown" });
        return ctx.reply(`✅ Sent to \`${targetId}\`!`, { parse_mode: "Markdown" });
      } catch (e) {
        return ctx.reply(`❌ Failed: ${e.message}`);
      }
    }

    // Gateway setup
    if (state === "WAITING_GW_NAME" && (await isAdmin(userId))) {
      delete userState[userId];
      let gwName = text.trim().toUpperCase();
      userState[userId] = `WAITING_GW_URL_${gwName}`;
      return ctx.reply(`🌐 Gateway: ${gwName}\n\n📝 Send Gateway URL:\n\n⚠️ Placeholders: {upi} {wallet} {amount} {userId} {orderId}`, {
        reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu")
      });
    }
    if (state.startsWith("WAITING_GW_URL_") && (await isAdmin(userId))) {
      let gwName = state.replace("WAITING_GW_URL_", "");
      delete userState[userId];
      let url = text.trim();
      if (!url.startsWith("http")) return ctx.reply("❌ Invalid URL!");
      
      await Gateway.create({ name: gwName, url, type: "deposit", isActive: false });
      return ctx.reply(`✅ Gateway Saved!\n\n📛 ${gwName}\n🔗 ${url.substring(0, 60)}...`, {
        reply_markup: new InlineKeyboard().text("🔙 Back", "adm_gateway_menu")
      });
    }
  }

  // ============================================================
  // 🔀 BUTTON ROUTING
  // ============================================================
  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  // 💸 MY BALANCE
  if (matchedKey === "btn_balance" || /balance/i.test(text)) {
    try {
      let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
      let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

      let msg =
        `${welcomeText}\n\n` +
        `<blockquote>` +
        `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
        `${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}` +
        `</blockquote>\n\n` +
        `<blockquote>${footerText}</blockquote>`;

      let buttons = [];
      
      let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
      if (autoUPIEnabled) {
        buttons.push([{ text: "➕ Add Fund", callback_data: "add_fund_btn" }]);
      }
      
      buttons.push([
        { text: "📊 Balance Statement", callback_data: "balance_statement" },
        { text: "💬 Customer Support", callback_data: "customer_support" }
      ]);
      buttons.push([
        { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
        { text: "💰 Live Fund", callback_data: "live_fund" }
      ]);
      buttons.push([{ text: "⚙️ Settings", callback_data: "user_settings" }]);

      try {
        return await ctx.reply(msg, {
          reply_markup: await buildStyledKb(buttons, userId),
          parse_mode: "HTML"
        });
      } catch (htmlErr) {
        console.error("HTML parse error:", htmlErr.message);
        let plainMsg =
          `${welcomeText}\n\n` +
          `${DEFAULT_BALANCE_TEXT.walletId} ${userId}\n` +
          `${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}\n\n` +
          footerText;
        return await ctx.reply(plainMsg, {
          reply_markup: await buildStyledKb(buttons, userId)
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
    tasks.forEach(t => {
      taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]);
    });
    return ctx.reply("📋 *Available Tasks:*", { reply_markup: await buildStyledKb(taskButtons, userId), parse_mode: "Markdown" });
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
      `✨ *Choose Payment Method*\n\n👛 *Wallet* - ${fmt(user.walletAccount)}\n\n⚡ *UPI* - ${fmt(user.upiId)}\n\n🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}`;
    return ctx.reply(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "🌐 Wallet", callback_data: "set_wallet" }, { text: "⚡ UPI", callback_data: "set_upi" }],
        [{ text: "🏦 Bank", callback_data: "set_bank" }]
      ], userId),
      parse_mode: "Markdown"
    });
  }

  // 🚀 WITHDRAW
  else if (matchedKey === "btn_withdraw" || /withdraw/i.test(text)) {
    // ✅ Get active gateways for withdraw
    let withdrawGateways = await Gateway.find({
      isActive: true,
      type: { $in: ["withdraw", "both"] }
    });

    let buttons = [];
    
    // If gateways exist, show gateway names instead of "Wallet"
    if (withdrawGateways.length > 0) {
      for (let gw of withdrawGateways) {
        buttons.push([{ text: `🌐 ${gw.name}`, callback_data: `wd_gw_${gw.name}` }]);
      }
    } else {
      // Fallback to default Wallet
      let walletOn = await isWithdrawEnabled("wallet");
      buttons.push([{ text: `${walletOn ? "🌐 Wallet" : "🔴 Wallet OFF"}`, callback_data: "wd_wallet" }]);
    }

    let upiOn = await isWithdrawEnabled("upi");
    let bankOn = await isWithdrawEnabled("bank");

    buttons.push([
      { text: `${upiOn ? "⚡ UPI" : "🔴 UPI OFF"}`, callback_data: "wd_upi" },
      { text: `${bankOn ? "🏦 Bank" : "🔴 Bank OFF"}`, callback_data: "wd_bank" }
    ]);

    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, {
      reply_markup: await buildStyledKb(buttons, userId),
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
      `⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}\n\n🕐 Admin will verify.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) }
    );

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);

    if (alertChannel && alertChannel !== "Not Set") {
      let caption = `📸 *New Task Submission!*\n\n👤 ${ctx.from.first_name || "User"}\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*`;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
  }
});

// ============================================================
// 📝 PART 3 END
// ============================================================

// ============================================================
// 🎯 BALANCE CALLBACKS
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery("🔄 Refreshed!");

  try {
    let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

    let msg =
      `${welcomeText}\n\n` +
      `<blockquote>` +
      `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
      `${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}` +
      `</blockquote>\n\n` +
      `<blockquote>${footerText}</blockquote>`;

    let buttons = [];
    let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
    if (autoUPIEnabled) buttons.push([{ text: "➕ Add Fund", callback_data: "add_fund_btn" }]);
    buttons.push([
      { text: "📊 Balance Statement", callback_data: "balance_statement" },
      { text: "💬 Customer Support", callback_data: "customer_support" }
    ]);
    buttons.push([
      { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
      { text: "💰 Live Fund", callback_data: "live_fund" }
    ]);
    buttons.push([{ text: "⚙️ Settings", callback_data: "user_settings" }]);

    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb(buttons, userId),
      parse_mode: "HTML"
    }).catch(() => {});
  } catch (e) { console.error(e); }
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery();

  try {
    let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

    let msg =
      `${welcomeText}\n\n` +
      `<blockquote>` +
      `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
      `${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}` +
      `</blockquote>\n\n` +
      `<blockquote>${footerText}</blockquote>`;

    let buttons = [];
    let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
    if (autoUPIEnabled) buttons.push([{ text: "➕ Add Fund", callback_data: "add_fund_btn" }]);
    buttons.push([
      { text: "📊 Balance Statement", callback_data: "balance_statement" },
      { text: "💬 Customer Support", callback_data: "customer_support" }
    ]);
    buttons.push([
      { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
      { text: "💰 Live Fund", callback_data: "live_fund" }
    ]);
    buttons.push([{ text: "⚙️ Settings", callback_data: "user_settings" }]);

    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb(buttons, userId),
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
    msg += `━━━━━━━━━━━━━━━━━━━━\n🟢 Earned: ₹${totalIn.toFixed(2)}\n🔴 Spent: ₹${totalOut.toFixed(2)}`;
  }

  let kb = await buildStyledKb([
    [{ text: "🔄 Refresh", callback_data: "balance_statement" }],
    [{ text: "🔙 Back", callback_data: "back_to_balance" }]
  ], userId);

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("customer_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let supportId = await getConfig("support_username", null);
  if (!supportId || supportId === "Not Set") {
    return ctx.reply(`💬 *Support*\n\n⚠️ Not set.`, { parse_mode: "Markdown" });
  }
  let link = /^\d+$/.test(supportId) ? `tg://user?id=${supportId}` : `https://t.me/${supportId.replace('@', '')}`;
  await ctx.reply(`💬 *Support*\n\nClick below:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💬 Contact Support", link) });
});

bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading...");
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });
  let msg = `💰 *Live Fund Report*\n\n👥 Users: \`${users.length}\`\n💵 Total: \`₹${totalBalance.toFixed(2)}\``;
  let kb = await buildStyledKb([
    [{ text: "🔄 Refresh", callback_data: "live_fund" }],
    [{ text: "🔙 Back", callback_data: "back_to_balance" }]
  ], ctx.from.id);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ✅ ADD FUND BUTTON
// ============================================================
bot.callbackQuery("add_fund_btn", async (ctx) => {
  let userId = ctx.from.id;
  let autoEnabled = await getConfig("auto_upi_enabled", true);
  if (!autoEnabled) return ctx.answerCallbackQuery({ text: "❌ Auto UPI OFF!", show_alert: true });

  let upiId = await getConfig("auto_upi_id", "nasih@fam");
  let minAmt = await getConfig("auto_upi_min", 5);
  let maxAmt = await getConfig("auto_upi_max", 200);

  await ctx.answerCallbackQuery();

  const styledTitle = toSmallCaps("Auto UPI Deposit");
  const styledEnter = toSmallCaps("Enter The Amount You Wish To Deposit:");
  const styledMust = toSmallCaps("Amount Must Be Between");

  const msg =
    `💠 ${styledTitle}\n\n` +
    `✨ ${styledEnter}\n` +
    `${styledMust} ₹${minAmt} ᴀɴᴅ ₹${maxAmt}\n\n` +
    `📌 UPI: \`${upiId}\``;

  userState[userId] = "UPI_WAIT_AMOUNT";

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel")
  });
});

bot.callbackQuery("add_fund_cancel", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🌐 GATEWAY USER CALLBACKS
// ============================================================
bot.callbackQuery(/^gw_user_/, async (ctx) => {
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("gw_user_", "");
  let user = await getUser(userId);
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway not found", show_alert: true });

  // ✅ First time — prompt name
  if (!user.gatewayName) {
    await ctx.answerCallbackQuery();
    userState[userId] = `GATEWAY_WAIT_NAME_${gwName}`;
    return ctx.editMessageText(
      `📝 First Time Setup\n\n` +
      `Please enter your Name:`,
      { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
    ).catch(() => {});
  }

  // ✅ Name exists but no UPI
  if (!user.gatewayUpi) {
    await ctx.answerCallbackQuery();
    userState[userId] = `GATEWAY_WAIT_UPI_${gwName}`;
    return ctx.editMessageText(
      `📝 Enter your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
    ).catch(() => {});
  }

  // ✅ Already setup — go to amount
  await ctx.answerCallbackQuery();
  userState[userId] = `GATEWAY_WAIT_AMOUNT_${gwName}`;
  await ctx.editMessageText(
    `💠 ${gateway.name} Payment\n\n` +
    `👤 ${user.gatewayName}\n` +
    `📱 UPI: <code>${user.gatewayUpi}</code>\n\n` +
    `💰 Enter Amount:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

// ============================================================
// 💠 UPI ADMIN APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^upi_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_app_", "");
  let payment = await UPIPayment.findOne({ orderId });
  if (!payment || payment.status === "Approved") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  payment.status = "Approved";
  payment.verifiedAt = new Date();
  payment.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  await payment.save();

  let user = await getUser(payment.userId);
  user.balance += payment.amount;
  await user.save();
  await logBalanceHistory(payment.userId, `UPI Deposit (Manual)`, payment.amount);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  await ctx.editMessageText(
    (ctx.callbackQuery.message.text || "") + `\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name || "Admin"}`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  const styledTitle = toSmallCaps("Deposit Auto-Approved!");
  const styledAdded = toSmallCaps("Added:");
  const styledUTR = toSmallCaps("UTR:");

  try {
    await ctx.api.sendMessage(payment.userId,
      `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${payment.amount}\n🔐 ${styledUTR} ${payment.utr}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^upi_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_rej_", "");
  let payment = await UPIPayment.findOne({ orderId });
  if (!payment || payment.status === "Rejected") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  payment.status = "Rejected";
  payment.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  await payment.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText(
    (ctx.callbackQuery.message.text || "") + `\n\n❌ <b>REJECTED</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});
});

// ============================================================
// ⚡ QUICK PAY — Confirm/Cancel
// ============================================================
bot.callbackQuery("qp_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  await ctx.editMessageText("❌ *Cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildKeyboardFromLayout(userId) });
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
  let isAdminUser = await isAdmin(userId);

  if (!receiver) return ctx.answerCallbackQuery({ text: "❌ Receiver not found!", show_alert: true });
  
  if (!isAdminUser && sender.balance < amount) {
    return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });
  }

  await ctx.answerCallbackQuery({ text: "⏳ Sending..." });

  let wasNegative = sender.balance < amount;

  sender.balance -= amount;
  receiver.balance += amount;
  await sender.save();
  await receiver.save();

  // History
  if (isAdminUser && wasNegative) {
    await logBalanceHistory(sender.userId, `Admin Add Fund - Quick Pay to ${receiver.userId}`, -amount);
  } else if (isAdminUser) {
    await logBalanceHistory(sender.userId, `Admin Quick Pay to ${receiver.userId}`, -amount);
  } else {
    await logBalanceHistory(sender.userId, `Quick Pay to ${receiver.userId}`, -amount);
  }
  await logBalanceHistory(receiver.userId, `Quick Pay from ${isAdminUser ? "Admin" : sender.userId}`, amount);

  // ✅ Sender message
  let successMsg;
  if (isAdminUser && wasNegative) {
    successMsg =
      `✅ Payment Successful!\n\n` +
      `👤 To: ${receiver.firstName || "User"}\n` +
      `🆔 <code>${receiver.userId}</code>\n` +
      `💰 Amount: ₹${amount.toFixed(2)}\n\n` +
      `⚠️ Admin Add Fund Used\n` +
      `📊 Admin Balance: ${sender.balance < 0 ? "-" : ""}₹${Math.abs(sender.balance).toFixed(2)}`;
  } else {
    successMsg =
      `✅ Payment Successful!\n\n` +
      `👤 To: ${receiver.firstName || "User"}\n` +
      `🆔 <code>${receiver.userId}</code>\n` +
      `💰 Amount: ₹${amount.toFixed(2)}\n\n` +
      `💵 New Balance: ₹${sender.balance.toFixed(2)}`;
  }

  await ctx.editMessageText(successMsg, { parse_mode: "HTML" }).catch(() => {});

  // ✅ Receiver notification
  try {
    await ctx.api.sendMessage(receiver.userId,
      `🎉 Payment Received!\n\n` +
      `👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n` +
      `🆔 <code>${sender.userId}</code>\n` +
      `💰 ₹${amount.toFixed(2)}\n\n` +
      `💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
      { parse_mode: "HTML" });
  } catch (e) {}
});

// ============================================================
// ⚙️ USER SETTINGS
// ============================================================
bot.callbackQuery("user_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  
  let text =
    `⚙️ Settings\n\n` +
    `🎨 Customize Your Bot\n\n` +
    `Your changes affect only your view.`;

  let kb = new InlineKeyboard()
    .text("📱 Reply Keyboard", "uset_reply_kb").row()
    .text("🎨 Inline Buttons", "uset_inline_kb").row()
    .text("💳 Edit Payment Method", "uset_edit_payment").row()
    .text("🔄 Reset to Default", "uset_reset").row()
    .text("🔙 Back", "back_to_balance");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

// ----- Edit Payment Method (from Settings) -----
bot.callbackQuery("uset_edit_payment", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let user = await getUser(userId);

  let text =
    `💳 Your Payment Methods\n\n` +
    `👛 Wallet: <code>${user.walletAccount || "Not Set"}</code>\n` +
    `⚡ UPI: <code>${user.upiId || "Not Set"}</code>\n` +
    `🏦 Bank: <code>${user.bankAccNo || "Not Set"}</code>\n\n` +
    `👇 Click to edit:`;

  let kb = new InlineKeyboard()
    .text("👛 Edit Wallet", "uset_edit_wallet").row()
    .text("⚡ Edit UPI", "uset_edit_upi").row()
    .text("🏦 Edit Bank", "uset_edit_bank").row()
    .text("🔙 Back", "user_settings");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery("uset_edit_wallet", async (ctx) => {
  let userId = ctx.from.id;
  userState[userId] = "USET_WAIT_WALLET";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `👛 Edit Wallet\n\n📝 Send your wallet number:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }
  ).catch(() => {});
});

bot.callbackQuery("uset_edit_upi", async (ctx) => {
  let userId = ctx.from.id;
  userState[userId] = "USET_WAIT_UPI";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `⚡ Edit UPI\n\n📝 Send your UPI ID:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }
  ).catch(() => {});
});

bot.callbackQuery("uset_edit_bank", async (ctx) => {
  let userId = ctx.from.id;
  userState[userId] = "USET_WAIT_BANK_ACCNO";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `🏦 Edit Bank\n\n📝 Send Account Number:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }
  ).catch(() => {});
});

// ----- Reply Keyboard Customizer -----
bot.callbackQuery("uset_reply_kb", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let layout = await getCurrentKeyboardLayoutForUser(userId);

  let text = `📱 Reply Keyboard\n\n`;
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      text += `Row ${r}: ${rowButtons.map(b => b.name).join(" | ")}\n`;
    }
  }
  text += `\n👇 Click to edit:`;

  let kb = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    kb.text(layout[i].name, `uset_kb_edit_${i}`).row();
  }
  kb.text("🔄 Reset", "uset_reset_kb").row();
  kb.text("🔙 Back", "user_settings");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_edit_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;

  let btn = layout[idx];
  let text =
    `✏️ Edit: ${btn.name}\n\n` +
    `📛 Current: ${btn.name}\n` +
    `📍 Row: ${btn.row}\n\n` +
    `Choose action:`;

  let kb = new InlineKeyboard()
    .text("📝 Rename", `uset_kb_rename_${idx}`).row()
    .text("⬆️ Up", `uset_kb_up_${idx}`)
    .text("⬇️ Down", `uset_kb_down_${idx}`).row()
    .text("⬅️ Left", `uset_kb_left_${idx}`)
    .text("➡️ Right", `uset_kb_right_${idx}`).row()
    .text("🗑️ Remove", `uset_kb_del_${idx}`).row()
    .text("🔙 Back", "uset_reply_kb");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_rename_", ""), 10);
  userState[userId] = `USET_WAIT_KB_RENAME_${idx}`;
  await ctx.editMessageText(`📝 Send new name:`, {
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_reply_kb")
  }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_up_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_up_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  if (layout[idx].row > 0) layout[idx].row -= 1;
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "⬆️ Moved up" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_down_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_down_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].row += 1;
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "⬇️ Moved down" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_left_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_left_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx <= 0 || idx >= layout.length) return;
  if (layout[idx].row === layout[idx - 1].row) {
    let temp = layout[idx];
    layout[idx] = layout[idx - 1];
    layout[idx - 1] = temp;
    await saveUserKeyboard(userId, layout);
  }
  ctx.answerCallbackQuery({ text: "⬅️ Moved" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_right_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_right_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx >= layout.length - 1) return;
  if (layout[idx].row === layout[idx + 1].row) {
    let temp = layout[idx];
    layout[idx] = layout[idx + 1];
    layout[idx + 1] = temp;
    await saveUserKeyboard(userId, layout);
  }
  ctx.answerCallbackQuery({ text: "➡️ Moved" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_del_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_del_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  layout.splice(idx, 1);
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "🗑️ Removed" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery("uset_reset_kb", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🔄 Reset!" });
  let userId = ctx.from.id;
  await UserPreference.updateOne({ userId }, { $unset: { keyboardLayout: "" } });
  await rerender(ctx, "uset_reply_kb");
});

// ----- Inline Buttons Customizer -----
bot.callbackQuery("uset_inline_kb", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let text = `🎨 Inline Buttons\n\n👇 Which menu to customize?`;
  let kb = new InlineKeyboard()
    .text("💰 Balance Menu", "uset_inline_balance").row()
    .text("🚀 Withdraw Menu", "uset_inline_withdraw").row()
    .text("💳 Payment Menu", "uset_inline_payment").row()
    .text("🔙 Back", "user_settings");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_inline_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let menuKey = ctx.callbackQuery.data.replace("uset_inline_", "");
  let styleMap = await getConfig("inline_button_styles", {});

  let buttons = [];
  if (menuKey === "balance") {
    buttons = [
      { key: "add_fund_btn", name: "➕ Add Fund" },
      { key: "balance_statement", name: "📊 Statement" },
      { key: "customer_support", name: "💬 Support" },
      { key: "refresh_balance_only", name: "🔄 Refresh" },
      { key: "live_fund", name: "💰 Live Fund" }
    ];
  } else if (menuKey === "withdraw") {
    buttons = [
      { key: "wd_wallet", name: "🌐 Wallet" },
      { key: "wd_upi", name: "⚡ UPI" },
      { key: "wd_bank", name: "🏦 Bank" },
      { key: "canc_wd", name: "❌ Cancel" }
    ];
  } else if (menuKey === "payment") {
    buttons = [
      { key: "set_wallet", name: "🌐 Wallet" },
      { key: "set_upi", name: "⚡ UPI" },
      { key: "set_bank", name: "🏦 Bank" }
    ];
  }

  let text = `🎨 ${menuKey.toUpperCase()} Menu\n\n👇 Click a button to set color:`;
  let kb = new InlineKeyboard();
  for (let b of buttons) {
    let cur = styleMap[b.key] || "none";
    let icon = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? INLINE_STYLE_COLORS[cur].emoji : "⚫";
    kb.text(`${icon} ${b.name}`, `uset_color_${b.key}`).row();
  }
  kb.text("🔙 Back", "uset_inline_kb");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_color_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let btnKey = ctx.callbackQuery.data.replace("uset_color_", "");
  let styleMap = await getConfig("inline_button_styles", {});
  let cur = styleMap[btnKey] || "none";

  let text = `🎨 Set Color\n\n📌 ${btnKey}\n🎨 Current: ${cur}`;
  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = cur === key ? "✅ " : "";
    kb.text(`${mark}${info.emoji} ${info.label}`, `uset_setcolor_${btnKey}_${key}`).row();
  }
  kb.text(`${cur === "none" ? "✅ " : ""}⚫ Default`, `uset_setcolor_${btnKey}_none`).row();
  kb.text("🔙 Back", "uset_inline_kb");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_setcolor_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("uset_setcolor_", "").split("_");
  let colorKey = parts.pop();
  let btnKey = parts.join("_");

  let styleMap = await getConfig("inline_button_styles", {});
  if (colorKey === "none") {
    delete styleMap[btnKey];
  } else if (INLINE_STYLE_COLORS[colorKey]) {
    styleMap[btnKey] = colorKey;
  }
  await setConfig("inline_button_styles", styleMap);

  ctx.answerCallbackQuery({ text: "✅ Applied!" });
  await rerender(ctx, "uset_inline_kb");
});

// ----- Reset All -----
bot.callbackQuery("uset_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `🔄 Reset to Default?\n\nThis will remove ALL your customizations.`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Yes, Reset", "uset_reset_confirm")
        .text("❌ Cancel", "user_settings")
    }
  ).catch(() => {});
});

bot.callbackQuery("uset_reset_confirm", async (ctx) => {
  let userId = ctx.from.id;
  await UserPreference.deleteOne({ userId });
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await ctx.editMessageText(
    `✅ Reset Complete!\n\nYour layout is back to default.`,
    { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
  ).catch(() => {});
});

// ============================================================
// 🔧 SAVE USER KEYBOARD
// ============================================================
async function saveUserKeyboard(userId, layout) {
  await UserPreference.findOneAndUpdate(
    { userId },
    { keyboardLayout: layout, updatedAt: new Date() },
    { upsert: true }
  );
}

// ============================================================
// 🚀 WITHDRAW CALLBACKS (with validation)
// ============================================================
async function promptWithdrawWithValidation(ctx, method) {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  
  // ✅ Check if method linked
  let details = "";
  let needsLinkState = "";
  
  if (method === "Wallet") {
    details = user.walletAccount;
    needsLinkState = "WD_ADD_WALLET";
  } else if (method === "UPI") {
    details = user.upiId;
    needsLinkState = "WD_ADD_UPI";
  } else if (method === "Bank") {
    details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
    needsLinkState = "WD_ADD_BANK_ACCNO";
  }
  
  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery({ text: `❌ ${method} Not Linked!`, show_alert: true });
    
    let kb = new InlineKeyboard()
      .text(`⚡ Add ${method} Now`, `wd_add_${method.toLowerCase()}_start`)
      .row()
      .text("🔙 Back", "back_to_balance");
    
    return ctx.reply(
      `❌ *${method} Not Linked!*\n\n` +
      `📝 To withdraw via ${method}, you need to add it first.\n\n` +
      `👇 Click below:`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }
  
  // Min/max check
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  
  userState[userId] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => { await promptWithdrawWithValidation(ctx, "Wallet"); });
bot.callbackQuery("wd_upi", async (ctx) => { await promptWithdrawWithValidation(ctx, "UPI"); });
bot.callbackQuery("wd_bank", async (ctx) => { await promptWithdrawWithValidation(ctx, "Bank"); });

// Gateway withdraw method
bot.callbackQuery(/^wd_gw_/, async (ctx) => {
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("wd_gw_", "");
  let user = await getUser(userId);
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway not found", show_alert: true });
  
  let details = user.gatewayUpi || user.walletAccount;
  
  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery({ text: `❌ ${gwName} not linked!`, show_alert: true });
    
    let kb = new InlineKeyboard()
      .text(`⚡ Add UPI for ${gwName}`, `wd_add_gw_start_${gwName}`)
      .row()
      .text("🔙 Back", "back_to_balance");
    
    return ctx.reply(
      `❌ *${gwName} Not Linked!*\n\n` +
      `📝 To withdraw via ${gwName}, add your UPI first.\n\n` +
      `👇 Click below:`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }
  
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  
  userState[userId] = `WD_GW_AMT_${gwName}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🌐 Withdraw via ${gwName}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
});

// Add method prompts
bot.callbackQuery("wd_add_wallet_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  userState[userId] = "WD_ADD_WALLET";
  await ctx.editMessageText(
    `👛 Add Wallet\n\n📝 Send your wallet number:`,
    { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

bot.callbackQuery("wd_add_upi_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  userState[userId] = "WD_ADD_UPI";
  await ctx.editMessageText(
    `⚡ Add UPI\n\n📝 Send your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

bot.callbackQuery("wd_add_bank_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  userState[userId] = "WD_ADD_BANK_ACCNO";
  await ctx.editMessageText(
    `🏦 Add Bank\n\n📝 Send Account Number:`,
    { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

bot.callbackQuery(/^wd_add_gw_start_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("wd_add_gw_start_", "");
  userState[userId] = `WD_ADD_GW_UPI_${gwName}`;
  await ctx.editMessageText(
    `⚡ Add UPI for ${gwName}\n\n📝 Send your UPI ID:`,
    { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

// ============================================================
// 💳 SET PAYMENT METHODS (Profile)
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

  // ✅ Check if gateway exists for this method
  let gatewayForMethod = await Gateway.findOne({ name: method, isActive: true });
  
  if (gatewayForMethod) {
    // Auto process via gateway
    await ctx.answerCallbackQuery({ text: "⏳ Processing via gateway..." });
    
    let result = await processGatewayPayment({
      gatewayKey: gatewayForMethod.name,
      upi: details,
      wallet: details,
      number: details,
      amount: amount,
      comment: `Withdrawal #${userWithdrawalCount}`,
      userId: userId,
      orderId: withdrawalId
    });

    if (result.status === 'success') {
      let txnNumber = result.txnNumber || generateTxnNumber();
      await Withdrawal.create({
        withdrawalId, userId, userWithdrawalCount,
        amount, method, details, status: "Approved",
        gateway: gatewayForMethod.name, txnNumber,
        approvedBy: "Auto Gateway", approvedAt: new Date()
      });

      await ctx.editMessageText(
        `✅ *Withdrawal Successful!*\n\n💰 ₹${amount}\n🌐 Gateway: ${gatewayForMethod.name}\n🚀 TXN: \`${txnNumber}\``,
        { parse_mode: "Markdown" }
      ).catch(() => {});

      try {
        await ctx.api.sendMessage(userId,
          `🎁Your Withdrawal of Rs.${amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
          `🏦 Destination ==> ${details}\n` +
          `🚀Transaction ID ==> ${txnNumber}\n\n` +
          `✅Please Check Your ${gatewayForMethod.name} Account!`);
      } catch (e) {}
      return;
    } else {
      // Refund
      user.balance += amount;
      user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
      await user.save();
      await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);
      
      return ctx.editMessageText(
        `❌ *Gateway Failed!*\n\n📛 ${result.message}\n\n💵 Amount refunded.`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  }

  // ✅ Manual withdrawal
  await Withdrawal.create({
    withdrawalId, userId, userWithdrawalCount,
    amount, method, details
  });

  await ctx.answerCallbackQuery({ text: "Submitted!" });
  await ctx.editMessageText(
    `✅ Withdrawal of ₹${amount} via ${method} submitted!\n\n🆔 #${userWithdrawalCount}\n⏳ Pending`,
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
        `⚠️ New ${method.toUpperCase()} Payout Request! (#${userWithdrawalCount})\n\n` +
        `User : ${userId}\n` +
        `Request Amount : ₹${amount}\n` +
        `Amount After Tax (${tax.toFixed(1)}) : ₹${afterTax}\n` +
        `${method} : ${details}\n` +
        `Transaction ID : -`,
        { reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 💰 WITHDRAWAL APPROVE/REJECT (with gateway + mask)
// ============================================================
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

  let txnNumber = generateTxnNumber();
  let gateway = await Gateway.findOne({ isActive: true });
  let gatewayName = gateway ? gateway.name : "TASK EARN";

  // ✅ Try gateway API
  if (gateway) {
    let result = await processGatewayPayment({
      gatewayKey: gateway.name,
      upi: wd.details,
      wallet: wd.details,
      number: wd.details,
      amount: wd.amount,
      comment: `Withdrawal #${wd.userWithdrawalCount}`,
      userId: wd.userId,
      orderId: wd.withdrawalId
    });

    if (result.status === 'success') {
      txnNumber = result.txnNumber || txnNumber;
    } else if (result.status === 'error') {
      // Network error — let admin retry
      return ctx.editMessageText(
        `❌ *Gateway Error!*\n\n🌐 ${gateway.name}\n📛 ${result.message}\n\n💡 Retry or Manual approve.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔁 Retry", `wd_app_${wId}`)
            .text("✅ Manual", `wd_manual_${wId}`)
        }
      ).catch(() => {});
    }
    // If failed/error — still allow manual approve below
  }

  wd.status = "Approved";
  wd.gateway = gatewayName;
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  // ✅ MASK after approval
  let maskedDetails = maskDetails(wd.method, wd.details);
  let { tax, afterTax } = calculateTax(wd.amount);
  let displayCount = wd.userWithdrawalCount || 1;

  let updatedMsg =
    `⚠️ New ${wd.method.toUpperCase()} Payout Request! (#${displayCount})\n\n` +
    `User : ${wd.userId}\n` +
    `Request Amount : ₹${wd.amount}\n` +
    `Amount After Tax (${tax.toFixed(1)}) : ₹${afterTax}\n` +
    `${wd.method} : ${maskedDetails}\n` +
    `Transaction ID : ${txnNumber}\n\n` +
    `✅ Approved by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}`;

  await ctx.editMessageText(updatedMsg).catch(() => {});

  let accountType = wd.method;
  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

  try {
    await ctx.api.sendMessage(wd.userId,
      `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
      `🏦 Destination ==> ${wd.details}\n` +
      `🚀Transaction ID ==> ${txnNumber}\n` +
      `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
      `✅Please Check Your ${accountType} Account!`,
      { reply_markup: new InlineKeyboard().url("🚀 Check Status", receiptUrl) });
  } catch (e) {}
});

bot.callbackQuery(/^wd_manual_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_manual_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "✅ Manual" });

  let txnNumber = generateTxnNumber();
  wd.status = "Approved";
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let maskedDetails = maskDetails(wd.method, wd.details);
  let displayCount = wd.userWithdrawalCount || 1;

  await ctx.editMessageText(
    `⚠️ New ${wd.method.toUpperCase()} Payout Request! (#${displayCount})\n\n` +
    `User : ${wd.userId}\n` +
    `Request Amount : ₹${wd.amount}\n` +
    `${wd.method} : ${maskedDetails}\n` +
    `Transaction ID : ${txnNumber}\n\n` +
    `✅ Approved by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}`
  ).catch(() => {});

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

  try {
    await ctx.api.sendMessage(wd.userId,
      `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
      `🏦 Destination ==> ${wd.details}\n` +
      `🚀Transaction ID ==> ${txnNumber}\n\n` +
      `✅Please Check Your ${wd.method} Account!`,
      { reply_markup: new InlineKeyboard().url("🚀 Check Status", receiptUrl) });
  } catch (e) {}
});

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
  let displayCount = wd.userWithdrawalCount || 1;

  await ctx.editMessageText(
    `⚠️ New ${wd.method.toUpperCase()} Payout Request! (#${displayCount})\n\n` +
    `User : ${wd.userId}\n` +
    `Request Amount : ₹${wd.amount}\n` +
    `${wd.method} : ${maskedDetails}\n` +
    `Transaction ID : -\n\n` +
    `❌ Rejected by ${wd.approvedBy} at ${formatDateTime(wd.approvedAt)}`
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId,
      `❌ *Withdrawal Rejected!*\n\n💰 ₹${wd.amount}\n\n💵 Refunded: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📋 TASK APPROVE/REJECT
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
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ APPROVED`,
  }).catch(() => {});

  try {
    await ctx.api.sendMessage(sub.userId, `🎉 *Task Approved!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`, { parse_mode: "Markdown" });
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
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ REJECTED`,
  }).catch(() => {});
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

  for (let u of allUsers) {
    try {
      await ctx.api.sendMessage(u.userId, cacheObj.text);
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }

  await ctx.editMessageText(
    `✅ *Broadcast Complete!*\n\n✅ Sent: ${count}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  delete userState[ctx.from.id];
  if (global.broadcastCache) delete global.broadcastCache[ctx.from.id];
  await ctx.editMessageText("❌ *Cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 📝 PART 4 END
// ============================================================

// ============================================================
// 🚀 /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  
  // Check if disabled
  let disabled = await isAdminDisabled(userId);
  if (disabled) {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId });
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    let ownerUsername = ownerUser?.username ? `@${ownerUser.username}` : null;
    
    return ctx.reply(
      `❌ ADMIN ACCESS DISABLED\n\n` +
      `Your admin permissions have been disabled by the Owner.\n\n` +
      `📝 Your admin access to this bot has been temporarily revoked. You cannot use admin features until the Owner re-enables your access.\n\n` +
      `📞 Contact Owner: ${ownerUsername || ownerName}\n` +
      `🆔 Owner ID: ${ownerId}\n\n` +
      `If you believe this is a mistake, please contact the Owner directly.`,
      { reply_markup: new InlineKeyboard().text("🏠 Back to Main Menu", "back_to_balance") }
    );
  }
  
  if (!(await isAdmin(userId))) return ctx.reply("❌ Not an admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 10);
  let maxW = await getConfig("max_withdraw", 10000);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let userCount = await User.countDocuments({});
  let activeAdmins = await BotAdmin.countDocuments({ isActive: true });
  let verifyEnabled = await getConfig("verification_enabled", false);
  let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
  let autoVerify = await getConfig("auto_verify_enabled", true);
  let manualVerify = await getConfig("manual_verify_enabled", true);
  let activeGw = await Gateway.findOne({ isActive: true });

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🌐 *Gateway:* ${activeGw ? "`" + activeGw.name + "`" : "❌ None"}\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `💠 *Auto UPI:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢" : "🔴"} | ✋ Manual: ${manualVerify ? "🟢" : "🔴"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${activeAdmins}\n\n` +
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
      { text: "📊 Add Fund", callback_data: "adm_addfund_menu" },
      { text: "🌐 Gateway", callback_data: "adm_gateway_menu" }
    ],
    [
      { text: "📢 Broadcast", callback_data: "adm_broadcast" },
      { text: "💬 User Message", callback_data: "adm_user_message" }
    ],
    [
      { text: "👑 Admins", callback_data: "adm_admins" },
      { text: "✅ Verification", callback_data: "adm_verification" }
    ],
    [
      { text: "🎨 Theme", callback_data: "adm_customize_theme" },
      { text: "🖌️ Inline Styles", callback_data: "adm_edit_styles" }
    ],
    [
      { text: "💸 Withdraw Toggle", callback_data: "adm_withdraw_toggle" },
      { text: "📢 Setup Channel", callback_data: "adm_setup_channel" }
    ],
    [
      { text: "⚙️ Settings", callback_data: "adm_settings" },
      { text: "🔄 Reset Balance", callback_data: "adm_reset_all_bal" }
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

  await ctx.editMessageText(`💰 *Balance Management*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: `UserID Amount`", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: `UserID Amount`", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

bot.callbackQuery("adm_reset_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Send UserID to reset:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

// ============================================================
// 📊 ALL USERS BALANCE (Pagination + Inline buttons)
// ============================================================
const USERS_PER_PAGE = 30;

bot.callbackQuery("adm_all_balances", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAllBalances(ctx, 1);
});

bot.callbackQuery(/^balpage_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let page = parseInt(ctx.match[1], 10);
  await renderAllBalances(ctx, page);
});

async function renderAllBalances(ctx, page = 1) {
  let users = await User.find({}).sort({ balance: -1 });
  let totalUsers = users.length;
  let totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
  let totalPages = Math.ceil(totalUsers / USERS_PER_PAGE) || 1;
  
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  let startIdx = (page - 1) * USERS_PER_PAGE;
  let endIdx = startIdx + USERS_PER_PAGE;
  let pageUsers = users.slice(startIdx, endIdx);

  let text =
    `📊 All Users Balance\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 Total Users: ${totalUsers}\n` +
    `💰 Total Balance: ₹${totalBalance.toFixed(2)}\n` +
    `📄 Page ${page}/${totalPages}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard();
  
  if (pageUsers.length === 0) {
    kb.text("📭 No Users", "noop").row();
  } else {
    for (let u of pageUsers) {
      let name = u.firstName || "User";
      let shortName = name.length > 8 ? name.substring(0, 8) + ".." : name;
      let balStr = `₹${u.balance.toFixed(2)}`;
      
      kb
        .text(`👤 ${shortName}`, `user_detail_${u.userId}`)
        .text(`${u.userId}`, `copy_id_${u.userId}`)
        .text(`💰 ${balStr}`, `user_detail_${u.userId}`)
        .row();
    }
  }

  // Pagination
  let navRow = [];
  if (page > 1) navRow.push({ text: "◀️ Back", callback_data: `balpage_${page - 1}` });
  navRow.push({ text: `${page}/${totalPages}`, callback_data: "noop" });
  if (page < totalPages) navRow.push({ text: "Next ▶️", callback_data: `balpage_${page + 1}` });
  if (navRow.length > 0) kb.row(...navRow);
  
  kb.row({ text: "🔙 Main Menu", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
}

// Copy user ID
bot.callbackQuery(/^copy_id_/, async (ctx) => {
  let uid = ctx.callbackQuery.data.replace("copy_id_", "");
  await ctx.answerCallbackQuery({ text: `ID: ${uid}`, show_alert: true });
});

// ============================================================
// 👤 USER DETAIL VIEW
// ============================================================
bot.callbackQuery(/^user_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_detail_", ""), 10);
  await renderUserDetail(ctx, uid);
});

async function renderUserDetail(ctx, uid) {
  let user = await User.findOne({ userId: uid });
  if (!user) return ctx.answerCallbackQuery({ text: "❌ User not found", show_alert: true });

  let withdrawCount = await Withdrawal.countDocuments({ userId: uid });
  let depositCount = await UPIPayment.countDocuments({ userId: uid });
  let balanceHistoryCount = await BalanceHistory.countDocuments({ userId: uid });

  let text =
    `👤 USER DETAILS\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 Name: ${user.firstName || "Unknown"}\n` +
    `🆔 User ID: <code>${user.userId}</code>\n` +
    `📛 Username: ${user.username ? "@" + user.username : "Not Set"}\n\n` +
    `💰 Balance: ₹${user.balance.toFixed(2)}\n` +
    `🏧 Withdrawn: ₹${(user.withdrawnTotal || 0).toFixed(2)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📅 Joined: ${new Date(user.createdAt).toLocaleDateString('en-IN')}`;

  let kb = new InlineKeyboard()
    .text(`💰 Withdraw (${withdrawCount})`, `uhist_wd_${uid}`).row()
    .text(`💰 Deposit (${depositCount})`, `uhist_dp_${uid}`).row()
    .text(`💰 Balance History (${balanceHistoryCount})`, `uhist_bal_${uid}`).row()
    .row()
    .text("📉 Remove Balance", `urem_bal_${uid}`)
    .text("➕ Add Balance", `uadd_bal_${uid}`).row()
    .text("💬 Send Message", `umsg_${uid}`).row()
    .text("🔍 Full Tracker", `track_ref_${uid}`).row()
    .text("🔙 Back to List", "adm_all_balances");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
}

// ============================================================
// 📜 USER HISTORY VIEWS
// ============================================================

// Withdraw history
bot.callbackQuery(/^uhist_wd_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("uhist_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(20);
  
  if (withdrawals.length === 0) {
    return ctx.editMessageText(
      `💰 Withdraw History\n\n🆔 ${uid}\n\n📭 No withdrawals found.`,
      { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`) }
    ).catch(() => {});
  }

  let text = `💰 WITHDRAW HISTORY\n\n👤 User: ${uid}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  let total = 0;
  
  withdrawals.forEach((w, i) => {
    let statusIcon = w.status === "Approved" ? "🟢" : (w.status === "Rejected" ? "🔴" : "🟡");
    let dateStr = new Date(w.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    text += `${i + 1}. ₹${w.amount} · ${w.method}\n   ${statusIcon} ${w.status} · ${dateStr}\n\n`;
    total += w.amount;
  });
  
  text += `━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${withdrawals.length}\n💵 Sum: ₹${total.toFixed(2)}`;

  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`)
  }).catch(() => {});
});

// Deposit history
bot.callbackQuery(/^uhist_dp_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("uhist_dp_", ""), 10);
  let deposits = await UPIPayment.find({ userId: uid }).sort({ createdAt: -1 }).limit(20);
  
  if (deposits.length === 0) {
    return ctx.editMessageText(
      `💰 Deposit History\n\n🆔 ${uid}\n\n📭 No deposits found.`,
      { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`) }
    ).catch(() => {});
  }

  let text = `💰 DEPOSIT HISTORY\n\n👤 User: ${uid}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  let total = 0;
  
  deposits.forEach((d, i) => {
    let statusIcon = d.status === "Approved" ? "🟢" : (d.status === "Rejected" ? "🔴" : "🟡");
    let dateStr = new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    text += `${i + 1}. ₹${d.amount} · ${d.source}\n   ${statusIcon} ${d.status}\n   UTR: \`${d.utr || "N/A"}\`\n   ${dateStr}\n\n`;
    if (d.status === "Approved") total += d.amount;
  });
  
  text += `━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${deposits.length}\n💵 Approved: ₹${total.toFixed(2)}`;

  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// Balance history
bot.callbackQuery(/^uhist_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("uhist_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(30);
  let user = await User.findOne({ userId: uid });
  
  let text = `💰 BALANCE HISTORY\n\n👤 User: ${uid}\n💰 Current: ₹${(user?.balance || 0).toFixed(2)}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (history.length === 0) {
    text += `📭 No transactions.`;
  } else {
    let totalIn = 0, totalOut = 0;
    history.forEach((h) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      text += `${icon} ${sign}₹${h.amount.toFixed(2)} · ${h.action}\n   ${dateStr}\n\n`;
      if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount);
    });
    text += `━━━━━━━━━━━━━━━━━━━━\n🟢 In: ₹${totalIn.toFixed(2)}\n🔴 Out: ₹${totalOut.toFixed(2)}`;
  }

  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`)
  }).catch(() => {});
});

// ============================================================
// 📉 REMOVE BALANCE (From user detail)
// ============================================================
bot.callbackQuery(/^urem_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("urem_bal_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return ctx.answerCallbackQuery({ text: "❌ Not found", show_alert: true });

  userState[ctx.from.id] = `UREM_WAIT_${uid}`;
  await ctx.editMessageText(
    `📉 Remove Balance\n\n👤 User: ${user.firstName || "Unknown"}\n🆔 <code>${uid}</code>\n💰 Current: ₹${user.balance.toFixed(2)}\n\n📝 Send amount to remove:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }
  ).catch(() => {});
});

// ============================================================
// ➕ ADD BALANCE (From user detail)
// ============================================================
bot.callbackQuery(/^uadd_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("uadd_bal_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return ctx.answerCallbackQuery({ text: "❌ Not found", show_alert: true });

  userState[ctx.from.id] = `UADD_WAIT_${uid}`;
  await ctx.editMessageText(
    `➕ Add Balance\n\n👤 User: ${user.firstName || "Unknown"}\n🆔 <code>${uid}</code>\n💰 Current: ₹${user.balance.toFixed(2)}\n\n📝 Send amount to add:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }
  ).catch(() => {});
});

// ============================================================
// 💬 SEND MESSAGE TO USER
// ============================================================
bot.callbackQuery(/^umsg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("umsg_", ""), 10);
  userState[ctx.from.id] = `UMSG_WAIT_${uid}`;
  await ctx.editMessageText(
    `💬 Send Message to User ${uid}\n\n📝 Send your message:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }
  ).catch(() => {});
});

// ============================================================
// 🔍 FULL TRACKER
// ============================================================
bot.callbackQuery(/^track_ref_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;

  let linkedWalletInfo = u.walletAccount !== "Not Set" ? u.walletAccount :
                         (u.upiId !== "Not Set" ? u.upiId :
                         (u.bankAccNo !== "Not Set" ? `${u.bankAccNo} (${u.bankIfsc})` :
                         (u.amazonEmail !== "Not Set" ? u.amazonEmail : "Not Linked")));

  let msg =
    `🙇‍♂️ USER DETAILS\n\n` +
    `🚻 User: ${u.firstName || "Unknown"}\n` +
    `🆔 User ID: <code>${u.userId}</code>\n` +
    `💰 Balance: ₹${u.balance.toFixed(2)}\n` +
    `🏧 Withdrawn: ₹${(u.withdrawnTotal || 0).toFixed(2)}\n` +
    `🎴 Linked: ${linkedWalletInfo}`;

  let kb = new InlineKeyboard()
    .text("📜 Balance Record", `track_bal_${uid}`).row()
    .text("🏧 Withdraw History", `track_wd_${uid}`).row()
    .text("🔄 Refresh", `track_ref_${uid}`).row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^track_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `📊 Balance Record (${targetId})\n\n`;
  if (history.length === 0) msg += "No records.";
  else history.forEach((h, idx) => {
    let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. ${h.action}: ₹${h.amount} (${dateStr})\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`) }).catch(() => {});
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `🏧 Withdraw History (${targetId})\n\n`;
  if (withdrawals.length === 0) msg += "No records.";
  else withdrawals.forEach((w, idx) => {
    let dateStr = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. ₹${w.amount} | ${w.method}\n   ${w.status} | ${dateStr}\n\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`) }).catch(() => {});
});

// ============================================================
// 👥 USERS MENU
// ============================================================
bot.callbackQuery("adm_users_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let totalUsers = await User.countDocuments({});
  let banned = await User.countDocuments({ isBanned: true });

  let kb = await buildStyledKb([
    [{ text: "🔍 User Tracker", callback_data: "adm_user_tracker" }],
    [{ text: "📊 All Balances", callback_data: "adm_all_balances" }],
    [{ text: "📢 Broadcast", callback_data: "adm_broadcast" }],
    [{ text: "🔙 Back", callback_data: "admin" }]
  ]);

  await ctx.editMessageText(
    `👥 *User Management*\n\nTotal: ${totalUsers}\nBanned: ${banned}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery("adm_user_tracker", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 Send User ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_users_menu") });
});

// ============================================================
// 📢 BROADCAST
// ============================================================
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText(`📢 Send broadcast message:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});

bot.callbackQuery("adm_user_message", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  await ctx.editMessageText(`💬 Format: \`UserID | Message\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});

// ============================================================
// 📢 SETUP CHANNEL
// ============================================================
bot.callbackQuery("adm_setup_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderSetupChannelPanel(ctx);
});

async function renderSetupChannelPanel(ctx) {
  let channelId = await getConfig("welcome_channel_id", null);
  let channelLink = await getConfig("welcome_channel_link", null);
  let channelName = await getConfig("welcome_channel_name", "Not Set");

  let text = `📢 Setup Channel\n\n`;
  if (channelId && channelLink) {
    text += `📌 Current:\n`;
    text += `   ID: <code>${channelId}</code>\n`;
    text += `   Name: ${channelName}\n`;
    text += `   Link: ${channelLink}\n\n`;
    text += `⚙️ Actions:`;
  } else {
    text += `❌ No channel configured.\n\nAdd channel to show in /start message.`;
  }

  let kb = new InlineKeyboard();
  if (channelId) {
    kb.text("✏️ Change Channel", "setup_ch_add").row();
    kb.text("👁️ Preview Start", "setup_ch_preview").row();
    kb.text("🗑️ Remove Channel", "setup_ch_remove").row();
  } else {
    kb.text("➕ Add Channel", "setup_ch_add").row();
  }
  kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
}

bot.callbackQuery("setup_ch_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "SETUP_CH_WAIT";
  await ctx.editMessageText(
    `📢 Add Channel\n\n` +
    `Format: <code>ChannelID | InviteLink</code>\n\n` +
    `Example:\n<code>@mychannel | https://t.me/mychannel</code>\n\n` +
    `📝 Send now:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_setup_channel") }
  );
});

bot.callbackQuery("setup_ch_preview", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let channelLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

  let previewText =
    `📱 PREVIEW START MESSAGE\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💫 <b>Welcome To Task Payment Bot!</b>\n\n` +
    `To Know How To Earn → <a href="${channelLink}">CLICK HERE</a>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 "CLICK HERE" links to:\n${channelLink}`;

  await ctx.editMessageText(previewText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Back", "adm_setup_channel")
  }).catch(() => {});
});

bot.callbackQuery("setup_ch_remove", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await setConfig("welcome_channel_id", "");
  await setConfig("welcome_channel_link", "https://t.me/yourchannel");
  await setConfig("welcome_channel_name", "");
  await ctx.answerCallbackQuery({ text: "🗑️ Removed!" });
  await renderSetupChannelPanel(ctx);
});

// ============================================================
// 🎁 GIFT CODE MANAGEMENT (Redeem)
// ============================================================
bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20);
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let notifEnabled = await getConfig("gift_notification_enabled", true);

  let text = `🎁 Gift Codes\n\nTotal: ${totalCodes}\nNotif: ${notifEnabled ? "✅" : "❌"}\n\n👇 Click code to edit:`;

  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb.text(notifEnabled ? "🔕 Notif OFF" : "🔔 Notif ON", "gc_notif_toggle").row();
  kb.text("➕ Add Codes", "adm_redeem_add").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  let claimed = gc.usedUsers.length;
  let available = gc.maxUses - claimed;

  let text =
    `🎁 Code: <code>${gc.code}</code>\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💰 Amount: ₹${gc.amount}\n\n📊 Status:\n` +
    `   ✅ Claimed: ${claimed}\n   📊 Available: ${available}\n   👥 Total: ${gc.maxUses}`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit", `gc_edit_${gc.code}`)
    .text("📋 Claim View", `gc_claim_${gc.code}`).row()
    .text("🗑️ Delete", `gc_del_${gc.code}`).row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  let text = `✏️ Edit Code\n\nCode: <code>${gc.code}</code>\n💰 Amount: ₹${gc.amount}\n👥 Max: ${gc.maxUses}`;

  let kb = new InlineKeyboard()
    .text("💰 Edit Amount", `gc_edit_amt_${code}`).row()
    .text("👥 Edit Max Uses", `gc_edit_max_${code}`).row()
    .text("🔙 Back", `gc_view_${code}`);

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_GC_AMT_${code}`;
  await ctx.editMessageText(`✏️ Send new amount:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_edit_${code}`) });
});

bot.callbackQuery(/^gc_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_max_", "");
  userState[ctx.from.id] = `WAITING_GC_MAX_${code}`;
  await ctx.editMessageText(`✏️ Send new max uses:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_edit_${code}`) });
});

bot.callbackQuery(/^gc_claim_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_claim_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  if (gc.usedUsers.length === 0) {
    return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
  }

  let text = `📋 Claims for <code>${code}</code> (${gc.usedUsers.length})\n\n`;
  for (let uid of gc.usedUsers.slice(0, 20)) {
    let u = await User.findOne({ userId: uid });
    text += `👤 ${u ? (u.firstName || "User") : "Unknown"} — <code>${uid}</code>\n`;
  }

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`), parse_mode: "HTML" }).catch(() => {});
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

// ============================================================
// 📧 AMAZON MANAGEMENT
// ============================================================
bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAmazonPanel(ctx);
});

async function renderAmazonPanel(ctx) {
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(20);
  let totalCodes = await GiftCode.countDocuments({ type: "amazon" });
  let notifEnabled = await getConfig("amazon_notification_enabled", true);

  let text = `📧 Amazon Codes\n\nTotal: ${totalCodes}\nNotif: ${notifEnabled ? "✅" : "❌"}\n\n👇 Click to edit:`;

  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `amz_view_${c.code}`).row();
  }
  kb.text(notifEnabled ? "🔕 Notif OFF" : "🔔 Notif ON", "amz_notif_toggle").row();
  kb.text("➕ Add Codes", "adm_amazon_add").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
}

bot.callbackQuery(/^amz_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_view_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" });
  if (!gc) return;

  let claimed = gc.usedUsers.length;
  let available = gc.maxUses - claimed;

  let text =
    `📧 Code: <code>${gc.code}</code>\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💰 Amount: ₹${gc.amount}\n\n📊 Status:\n` +
    `   ✅ Claimed: ${claimed}\n   📊 Available: ${available}\n   👥 Total: ${gc.maxUses}`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit", `amz_edit_${gc.code}`)
    .text("📋 Claim View", `amz_claim_${gc.code}`).row()
    .text("🗑️ Delete", `amz_del_${gc.code}`).row()
    .text("🔙 Back", "adm_amazon");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^amz_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" });
  if (!gc) return;

  let text = `✏️ Edit Amazon Code\n\nCode: <code>${gc.code}</code>\n💰 Amount: ₹${gc.amount}\n👥 Max: ${gc.maxUses}`;

  let kb = new InlineKeyboard()
    .text("💰 Edit Amount", `amz_edit_amt_${code}`).row()
    .text("👥 Edit Max Uses", `amz_edit_max_${code}`).row()
    .text("🔙 Back", `amz_view_${code}`);

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^amz_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_AMZ_AMT_${code}`;
  await ctx.editMessageText(`✏️ Send new amount:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `amz_edit_${code}`) });
});

bot.callbackQuery(/^amz_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_max_", "");
  userState[ctx.from.id] = `WAITING_AMZ_MAX_${code}`;
  await ctx.editMessageText(`✏️ Send new max uses:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `amz_edit_${code}`) });
});

bot.callbackQuery(/^amz_claim_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_claim_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" });
  if (!gc) return;

  if (gc.usedUsers.length === 0) {
    return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_view_${code}`) });
  }

  let text = `📋 Claims for <code>${code}</code> (${gc.usedUsers.length})\n\n`;
  for (let uid of gc.usedUsers.slice(0, 20)) {
    let u = await User.findOne({ userId: uid });
    text += `👤 ${u ? (u.firstName || "User") : "Unknown"} — <code>${uid}</code>\n`;
  }

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_view_${code}`), parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^amz_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let code = ctx.callbackQuery.data.replace("amz_del_", "");
  await GiftCode.deleteOne({ code, type: "amazon" });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderAmazonPanel(ctx);
});

bot.callbackQuery("amz_notif_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("amazon_notification_enabled", true);
  await setConfig("amazon_notification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🔔 ON" : "🔕 OFF" });
  await renderAmazonPanel(ctx);
});

// Add codes prompts
bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.editMessageText(
    `➕ Add Redeem Codes\n\n📝 Format: <code>CODE AMOUNT</code>\n\nExample:\n<code>WELCOME100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_create_gift") }
  );
});

bot.callbackQuery("adm_amazon_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_AMAZON_CODES";
  await ctx.editMessageText(
    `➕ Add Amazon Codes\n\n📝 Format: <code>CODE AMOUNT</code>\n\nExample:\n<code>AMZ100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon") }
  );
});

// ============================================================
// 📝 PART 5 END
// ============================================================

// ============================================================
// 💠 AUTO UPI SETTINGS PANEL
// ============================================================
bot.callbackQuery("adm_addfund_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let upiId = await getConfig("auto_upi_id", "nasih@fam");
  let minAmt = await getConfig("auto_upi_min", 5);
  let maxAmt = await getConfig("auto_upi_max", 200);
  let enabled = await getConfig("auto_upi_enabled", true);
  let autoVerify = await getConfig("auto_verify_enabled", true);
  let manualVerify = await getConfig("manual_verify_enabled", true);
  let apiKey = await getConfig("auto_upi_api_key", "DEFAULT_SECRET_KEY");

  let modeText = "";
  if (autoVerify && manualVerify) modeText = "🔄 Auto + Manual";
  else if (autoVerify) modeText = "🤖 Auto Only";
  else if (manualVerify) modeText = "✋ Manual Only";
  else modeText = "❌ Both OFF";

  let text =
    `💠 Auto UPI Settings\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 UPI ID: <code>${upiId}</code>\n` +
    `📉 Min: ₹${minAmt}\n` +
    `📈 Max: ₹${maxAmt}\n` +
    `🔐 API Key: <code>${apiKey.substring(0, 12)}...</code>\n\n` +
    `⚙️ Mode: ${modeText}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢" : "🔴"}\n` +
    `  ✋ Manual: ${manualVerify ? "🟢" : "🔴"}\n\n` +
    `🔘 Status: ${enabled ? "🟢 Active" : "🔴 Disabled"}`;

  let kb = new InlineKeyboard()
    .text("📌 UPI ID", "upiset_id")
    .text("📉 Min", "upiset_min")
    .text("📈 Max", "upiset_max").row()
    .text(`${autoVerify ? "🤖 Auto: ON" : "🤖 Auto: OFF"}`, "upiset_toggle_auto").row()
    .text(`${manualVerify ? "✋ Manual: ON" : "✋ Manual: OFF"}`, "upiset_toggle_manual").row()
    .text("🔐 Generate API Key", "upiset_apikey").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "upiset_toggle").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery("upiset_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_ID";
  await ctx.reply("📌 Send new UPI ID:");
});

bot.callbackQuery("upiset_min", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MIN";
  await ctx.reply("📉 Send min amount:");
});

bot.callbackQuery("upiset_max", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MAX";
  await ctx.reply("📈 Send max amount:");
});

bot.callbackQuery("upiset_apikey", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let newKey = "KEY_" + crypto.randomBytes(16).toString("hex");
  await setConfig("auto_upi_api_key", newKey);
  await ctx.reply(
    `🔐 New API Key Generated!\n\n<code>${newKey}</code>\n\n⚠️ Save this!\n\n💡 Use in MacroDroid POST request.`,
    { parse_mode: "HTML" }
  );
  await rerender(ctx, "adm_addfund_menu");
});

bot.callbackQuery("upiset_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_upi_enabled", true);
  await setConfig("auto_upi_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await rerender(ctx, "adm_addfund_menu");
});

bot.callbackQuery("upiset_toggle_auto", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_verify_enabled", true);
  await setConfig("auto_verify_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🤖 Auto ON" : "🤖 Auto OFF" });
  await rerender(ctx, "adm_addfund_menu");
});

bot.callbackQuery("upiset_toggle_manual", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("manual_verify_enabled", true);
  await setConfig("manual_verify_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✋ Manual ON" : "✋ Manual OFF" });
  await rerender(ctx, "adm_addfund_menu");
});

// ============================================================
// ⚙️ SETTINGS PANEL
// ============================================================
bot.callbackQuery("adm_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 10);
  let maxW = await getConfig("max_withdraw", 10000);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");

  let text =
    `⚙️ Settings\n\n` +
    `🤖 Bot: ${botActive ? "✅" : "❌"}\n` +
    `💸 Min WD: ₹${minW}\n` +
    `💰 Max WD: ₹${maxW}\n` +
    `📢 Payout: <code>${pChannel}</code>\n` +
    `💬 Support: <code>${supportId}</code>`;

  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Bot OFF" : "🟢 Bot ON", "adm_toggle_bot").row()
    .text("📉 Min WD", "adm_set_min_w")
    .text("📈 Max WD", "adm_set_max_w").row()
    .text("📢 Payout Channel", "adm_set_p_chan").row()
    .text("💬 Support ID", "adm_set_support").row()
    .text("📝 Edit Balance Text", "adm_edit_bal_text").row()
    .text("💬 Edit Footer Text", "adm_edit_footer").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery("adm_toggle_bot", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("bot_active", true);
  await setConfig("bot_active", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await rerender(ctx, "adm_settings");
});

bot.callbackQuery("adm_set_min_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Send min withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_max_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Send max withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Send payout channel ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.editMessageText("💬 Send support username or ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

// Edit footer text
bot.callbackQuery("adm_edit_footer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

  userState[ctx.from.id] = "WAITING_BALANCE_FOOTER";
  await ctx.editMessageText(
    `💬 Edit Footer Text\n\n📌 Current:\n${current}\n\n📝 Send new text:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_settings") }
  );
});

// Edit balance welcome text
bot.callbackQuery("adm_edit_bal_text", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);

  userState[ctx.from.id] = "WAITING_BALANCE_WELCOME";
  await ctx.editMessageText(
    `📝 Edit Balance Welcome Text\n\n📌 Current:\n${current}\n\n📝 Send new text:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_settings") }
  );
});

// ============================================================
// 💸 WITHDRAW TOGGLE
// ============================================================
bot.callbackQuery("adm_withdraw_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });

  let kb = new InlineKeyboard()
    .text(`${toggles.wallet ? "✅" : "🔴"} Wallet`, "wt_toggle_wallet").row()
    .text(`${toggles.upi ? "✅" : "🔴"} UPI`, "wt_toggle_upi").row()
    .text(`${toggles.bank ? "✅" : "🔴"} Bank`, "wt_toggle_bank").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText("💸 Withdraw Toggle", { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^wt_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("wt_toggle_", "");
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  toggles[method] = !toggles[method];
  await setConfig("withdraw_toggles", toggles);
  await ctx.answerCallbackQuery({ text: toggles[method] ? "✅ ON" : "🔴 OFF" });
  await rerender(ctx, "adm_withdraw_toggle");
});

// ============================================================
// 👑 ADMINS MANAGEMENT (with Permissions)
// ============================================================
bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let ownerUser = await User.findOne({ userId: ownerId });
  let admins = await BotAdmin.find({}).sort({ addedAt: -1 });

  let text =
    `👑 Admin Management\n\n` +
    `👑 Owner: <code>${ownerId}</code> (${ownerUser?.firstName || "Owner"})\n\n` +
    `📊 Total Admins: ${admins.length}\n\n` +
    `👇 Click admin:`;

  let kb = new InlineKeyboard();

  if (admins.length === 0) {
    kb.text("📂 No Admins Yet", "noop").row();
  } else {
    for (let a of admins) {
      let u = await User.findOne({ userId: a.userId });
      let name = u ? (u.firstName || "User") : "Unknown";
      let status = a.isActive ? "🟢" : "🔴";
      kb.text(`${status} 👤 ${name} — ${a.userId}`, `admin_view_${a.userId}`).row();
    }
  }

  kb.text("➕ Add New Admin", "admin_add").row();
  kb.text("👑 Transfer Ownership", "admin_transfer").row();
  kb.text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^admin_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_view_", ""), 10);
  let adminUser = await User.findOne({ userId: adminId });
  let botAdmin = await BotAdmin.findOne({ userId: adminId });
  if (!adminUser) return;

  let status = botAdmin?.isActive ? "🟢 ACTIVE" : "🔴 DISABLED";

  let text =
    `👤 Admin Details\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📛 Name: ${adminUser.firstName || "Unknown"}\n` +
    `🆔 User ID: <code>${adminId}</code>\n` +
    `📛 Username: ${adminUser.username ? "@" + adminUser.username : "Not Set"}\n` +
    `💰 Balance: ₹${adminUser.balance.toFixed(2)}\n\n` +
    `📅 Added: ${botAdmin?.addedAt ? new Date(botAdmin.addedAt).toLocaleDateString('en-IN') : "N/A"}\n\n` +
    `⚡ Status: ${status}`;

  let kb = new InlineKeyboard();

  if (botAdmin?.isActive) {
    kb.text("🔴 Disable Access", `admin_disable_${adminId}`).row();
  } else {
    kb.text("🟢 Enable Access", `admin_enable_${adminId}`).row();
  }

  kb.text("💬 Send Message", `admin_msg_${adminId}`).row()
    .text("🔍 View Tracker", `track_ref_${adminId}`).row()
    .text("🗑️ Remove Admin", `admin_remove_${adminId}`).row()
    .text("🔙 Back", "adm_admins");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

// Disable admin access
bot.callbackQuery(/^admin_disable_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_disable_", ""), 10);

  let botAdmin = await BotAdmin.findOne({ userId: adminId });
  if (!botAdmin) return;

  botAdmin.isActive = false;
  botAdmin.disabledAt = new Date();
  botAdmin.disabledBy = ctx.from.id;
  await botAdmin.save();

  await ctx.answerCallbackQuery({ text: "🔴 Disabled!" });

  // Notify the disabled admin
  try {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let owner = await User.findOne({ userId: ownerId });
    let ownerName = owner?.username ? `@${owner.username}` : (owner?.firstName || "Owner");

    await ctx.api.sendMessage(adminId,
      `❌ ADMIN ACCESS DISABLED\n\n` +
      `Your admin permissions have been disabled by the Owner.\n\n` +
      `📞 Contact Owner: ${ownerName}\n\n` +
      `If you believe this is a mistake, please contact the Owner directly.`
    );
  } catch (e) {}

  await rerender(ctx, `admin_view_${adminId}`);
});

// Enable admin access
bot.callbackQuery(/^admin_enable_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_enable_", ""), 10);

  let botAdmin = await BotAdmin.findOne({ userId: adminId });
  if (!botAdmin) return;

  botAdmin.isActive = true;
  botAdmin.disabledAt = null;
  botAdmin.disabledBy = null;
  await botAdmin.save();

  await ctx.answerCallbackQuery({ text: "🟢 Enabled!" });

  try {
    await ctx.api.sendMessage(adminId, `✅ Your admin access has been RE-ENABLED by the Owner!`);
  } catch (e) {}

  await rerender(ctx, `admin_view_${adminId}`);
});

bot.callbackQuery(/^admin_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_remove_", ""), 10);

  await BotAdmin.deleteOne({ userId: adminId });

  await ctx.answerCallbackQuery({ text: "🗑️ Removed!" });

  try {
    await ctx.api.sendMessage(adminId, `❌ Your admin access has been removed.`);
  } catch (e) {}

  await rerender(ctx, "adm_admins");
});

bot.callbackQuery(/^admin_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_msg_", ""), 10);
  userState[ctx.from.id] = `WAITING_MSG_ADMIN_${adminId}`;
  await ctx.editMessageText(`💬 Send message to <code>${adminId}</code>:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", `admin_view_${adminId}`) });
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(`➕ Add New Admin\n\n📝 Send User ID:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

bot.callbackQuery("admin_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(`👑 Transfer Ownership\n\n⚠️ You will lose owner access!\n\n📝 Send new Owner User ID:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

// Transfer confirm
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
// ✅ VERIFICATION
// ============================================================
bot.callbackQuery("adm_verification", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let verifyEnabled = await getConfig("verification_enabled", false);
  let verifiedCount = await Verification.countDocuments({ verified: true });
  let totalUsers = await User.countDocuments({});

  let text =
    `✅ Verification\n\n` +
    `Status: ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `Verified: ${verifiedCount}/${totalUsers}`;

  let kb = new InlineKeyboard()
    .text(verifyEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await rerender(ctx, "adm_verification");
});

// ============================================================
// 🌐 GATEWAY MANAGEMENT
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let gateways = await Gateway.find({}).sort({ createdAt: -1 });
  let activeGW = await Gateway.findOne({ isActive: true });

  let text = `🌐 Gateway Management\n\nActive: ${activeGW ? activeGW.name : "None"}\nTotal: ${gateways.length}`;
  let kb = new InlineKeyboard();

  for (let gw of gateways) {
    let typeIcon = gw.type === "deposit" ? "💰" : (gw.type === "withdraw" ? "⚡" : "🔄");
    kb.text(`${gw.isActive ? "✅" : "⚪"} ${typeIcon} ${gw.name}`, `gw_view_${gw.name}`).row();
  }

  kb.text("➕ Add Gateway", "gw_add").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("gw_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_GW_NAME";
  await ctx.editMessageText("🌐 Send Gateway name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") });
});

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwName = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name: gwName });
  if (!gw) return;

  let typeLabel = gw.type === "deposit" ? "💰 Deposit" : (gw.type === "withdraw" ? "⚡ Withdraw" : "🔄 Both");

  let text =
    `🌐 ${gw.name}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔗 URL:\n<code>${gw.url}</code>\n\n` +
    `⚙️ Type: ${typeLabel}\n` +
    `🔘 Status: ${gw.isActive ? "🟢 Active" : "⚪ Inactive"}`;

  let kb = new InlineKeyboard();
  if (gw.isActive) kb.text("🔴 Deactivate", `gw_deactivate_${gw.name}`).row();
  else kb.text("🟢 Activate", `gw_activate_${gw.name}`).row();
  kb.text("✏️ Edit Type", `gw_edittype_${gw.name}`).row();
  kb.text("🗑️ Delete", `gw_del_${gw.name}`).row();
  kb.text("🔙 Back", "adm_gateway_menu");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery(/^gw_activate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_activate_", "");
  await Gateway.updateOne({ name: gwName }, { isActive: true });
  await ctx.answerCallbackQuery({ text: `✅ ${gwName} activated!` });
  await rerender(ctx, "adm_gateway_menu");
});

bot.callbackQuery(/^gw_deactivate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_deactivate_", "");
  await Gateway.updateOne({ name: gwName }, { isActive: false });
  await ctx.answerCallbackQuery({ text: `🔴 Deactivated!` });
  await rerender(ctx, "adm_gateway_menu");
});

bot.callbackQuery(/^gw_edittype_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwName = ctx.callbackQuery.data.replace("gw_edittype_", "");
  let gw = await Gateway.findOne({ name: gwName });
  if (!gw) return;

  let kb = new InlineKeyboard()
    .text(`${gw.type === "deposit" ? "✅ " : ""}💰 Deposit`, `gw_settype_${gwName}_deposit`).row()
    .text(`${gw.type === "withdraw" ? "✅ " : ""}⚡ Withdraw`, `gw_settype_${gwName}_withdraw`).row()
    .text(`${gw.type === "both" ? "✅ " : ""}🔄 Both`, `gw_settype_${gwName}_both`).row()
    .text("🔙 Back", `gw_view_${gwName}`);

  await ctx.editMessageText(`✏️ Change Type for ${gw.name}:`, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^gw_settype_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("gw_settype_", "").split("_");
  let type = parts.pop();
  let gwName = parts.join("_");

  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await Gateway.updateOne({ name: gwName }, { type });
  await ctx.answerCallbackQuery({ text: `✅ Type: ${type}` });
  await rerender(ctx, `gw_view_${gwName}`);
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name: gwName });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await rerender(ctx, "adm_gateway_menu");
});

// ============================================================
// 🔄 RESET ALL BALANCE
// ============================================================
bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let userCount = await User.countDocuments({});

  let kb = new InlineKeyboard()
    .text("✅ Yes, Reset All", "adm_reset_all_confirm").row()
    .text("❌ Cancel", "admin");

  await ctx.editMessageText(
    `⚠️ RESET ALL BALANCES\n\nUsers: ${userCount}\n\nThis will reset EVERYONE's balance to ₹0!\n\nConfirm?`,
    { reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await ctx.editMessageText("✅ All balances reset to ₹0", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// 🎨 THEME MANAGEMENT (Reply Keyboard)
// ============================================================
bot.callbackQuery("adm_customize_theme", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);

  let text = "🎨 Theme - Reply Keyboard\n\n";
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      text += `Row ${r}: ${rowButtons.map(b => b.name).join(" | ")}\n`;
    }
  }

  let kb = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    kb.text(`✏️ ${layout[i].name}`, `theme_edit_${i}`).row();
  }
  kb.text("➕ Add Button", "theme_add").row();
  kb.text("♻️ Reset to Default", "theme_reset").row();
  kb.text("⚠️ Force Update All Users", "theme_force_update").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("theme_reset", async (ctx) => {
  ctx.answerCallbackQuery({ text: "♻️ Reset!" });
  await setConfig("keyboard_layout", JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT)));
  await rerender(ctx, "adm_customize_theme");
});

bot.callbackQuery("theme_force_update", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let userCount = await UserPreference.countDocuments({});

  await ctx.editMessageText(
    `⚠️ FORCE UPDATE ALL USERS\n\n` +
    `This will:\n✅ Apply new layout to ALL users\n❌ Delete user customizations\n\n` +
    `📊 Users affected: ${userCount}\n\nConfirm?`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Yes, Force Update", "theme_force_confirm")
        .text("❌ Cancel", "adm_customize_theme")
    }
  ).catch(() => {});
});

bot.callbackQuery("theme_force_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Updating..." });

  let result = await UserPreference.deleteMany({});

  await ctx.editMessageText(
    `✅ FORCE UPDATE COMPLETE!\n\n👥 Users: ${result.deletedCount}\n📊 All customizations deleted`,
    { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_customize_theme") }
  ).catch(() => {});
});

bot.callbackQuery("theme_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "THEME_WAIT_ADD";
  await ctx.editMessageText("➕ Send new button name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme") });
});

bot.callbackQuery(/^theme_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.callbackQuery.data.replace("theme_edit_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;

  let btn = layout[idx];
  let text = `✏️ Edit Button\n\n📛 ${btn.name}\n📍 Row ${btn.row}`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `theme_rename_${idx}`).row()
    .text("⬆️ Up", `theme_up_${idx}`).text("⬇️ Down", `theme_down_${idx}`).row()
    .text("🗑️ Delete", `theme_del_${idx}`).row()
    .text("🔙 Back", "adm_customize_theme");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^theme_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let idx = parseInt(ctx.callbackQuery.data.replace("theme_rename_", ""), 10);
  userState[ctx.from.id] = `THEME_WAIT_RENAME_${idx}`;
  await ctx.editMessageText("📝 Send new name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_theme") });
});

bot.callbackQuery(/^theme_up_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("theme_up_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (layout[idx].row > 0) layout[idx].row -= 1;
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "adm_customize_theme");
});

bot.callbackQuery(/^theme_down_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("theme_down_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  layout[idx].row += 1;
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_customize_theme");
});

bot.callbackQuery(/^theme_del_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("theme_del_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  layout.splice(idx, 1);
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "🗑️" });
  await rerender(ctx, "adm_customize_theme");
});

// ============================================================
// 🖌️ INLINE STYLES MANAGEMENT
// ============================================================
bot.callbackQuery("adm_edit_styles", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let styleMap = await getConfig("inline_button_styles", {});
  let text = `🖌️ Inline Button Colors\n\nColored: ${Object.keys(styleMap).length}\n\n👇 Click to change:`;

  let buttons = [
    { key: "add_fund_btn", name: "➕ Add Fund" },
    { key: "balance_statement", name: "📊 Statement" },
    { key: "customer_support", name: "💬 Support" },
    { key: "refresh_balance_only", name: "🔄 Refresh" },
    { key: "live_fund", name: "💰 Live Fund" },
    { key: "user_settings", name: "⚙️ Settings" },
    { key: "wd_wallet", name: "🌐 Wallet WD" },
    { key: "wd_upi", name: "⚡ UPI WD" },
    { key: "wd_bank", name: "🏦 Bank WD" },
    { key: "canc_wd", name: "❌ Cancel" }
  ];

  let kb = new InlineKeyboard();
  for (let b of buttons) {
    let cur = styleMap[b.key] || "none";
    let icon = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? INLINE_STYLE_COLORS[cur].emoji : "⚫";
    kb.text(`${icon} ${b.name}`, `istyle_${b.key}`).row();
  }
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^istyle_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let btnKey = ctx.callbackQuery.data.replace("istyle_", "");
  if (btnKey === "edit_styles") return;

  let styleMap = await getConfig("inline_button_styles", {});
  let cur = styleMap[btnKey] || "none";
  let curLabel = (cur !== "none" && INLINE_STYLE_COLORS[cur]) ? `${INLINE_STYLE_COLORS[cur].emoji} ${INLINE_STYLE_COLORS[cur].label}` : "⚫ Default";

  let text = `🎨 Set Color\n\n📌 ${btnKey}\n🎨 Current: ${curLabel}`;
  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(INLINE_STYLE_COLORS)) {
    let mark = cur === key ? "✅ " : "";
    kb.text(`${mark}${info.emoji} ${info.label}`, `isetc_${btnKey}_${key}`).row();
  }
  kb.text(`${cur === "none" ? "✅ " : ""}⚫ Default`, `isetc_${btnKey}_none`).row();
  kb.text("🔙 Back", "adm_edit_styles");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^isetc_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("isetc_", "").split("_");
  let colorKey = parts.pop();
  let btnKey = parts.join("_");

  let styleMap = await getConfig("inline_button_styles", {});
  if (colorKey === "none") {
    delete styleMap[btnKey];
  } else if (INLINE_STYLE_COLORS[colorKey]) {
    styleMap[btnKey] = colorKey;
  }
  await setConfig("inline_button_styles", styleMap);

  ctx.answerCallbackQuery({ text: "✅ Applied!" });
  await rerender(ctx, "adm_edit_styles");
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
            .text("🗑️", `del_task_${t.taskId}`).row();
  });
  keyboard.text("➕ Add New Task", "adm_create_task").row();
  keyboard.text("🔙 Back", "admin");
  let taskText = "💡 *Manage Tasks*";

  if (ctx.callbackQuery) {
    await ctx.editMessageText(taskText, { reply_markup: keyboard, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(taskText, { reply_markup: keyboard, parse_mode: "Markdown" });
  }
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
  let msg = `📋 *Task Details*\n\n🆔 ${task.taskId}\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}`;
  let kb = new InlineKeyboard()
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^del_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  await Task.deleteOne({ taskId: tId });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderTaskManager(ctx);
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText(
    `➕ *New Task*\n\nFormat: \`TaskID | Title | Reward | Link\`\n\nExample:\n\`T1 | Subscribe | 10 | https://t.me/channel\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") }
  );
});

// ============================================================
// 📝 PART 6 END
// ============================================================

// ============================================================
// 💰 ADD FUND (Manual) — Admin
// ============================================================
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
      `💰 Add Fund Request\n\n👤 ${req.userName}\n🆔 <code>${req.userId}</code>\n💵 ₹${req.amount}\n💳 ${req.method}`;

    if (req.proofFileId && !req.proofFileId.startsWith("REFER:")) {
      try { await ctx.replyWithPhoto(req.proofFileId, { caption, parse_mode: "HTML", reply_markup: kb }); } catch (e) {
        await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb });
      }
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb });
    }
  }
});

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

  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ APPROVED by ${req.approvedBy}`
  }).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `✅ *Add Fund Approved!*\n\n💰 ₹${req.amount}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
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

  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ REJECTED`
  }).catch(() => {});
});

// ============================================================
// 🎁 REDEEM (from Gift code) — Admin
// ============================================================
bot.callbackQuery("adm_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let mode = await getConfig("redeem_mode", "manual");
  let codeCount = await GiftCode.countDocuments({ type: "redeem" });

  let text =
    `🎁 Redeem Code\n\n` +
    `Mode: ${mode === "manual" ? "📝 Manual" : "⚡ Auto"}\n` +
    `Total Codes: ${codeCount}`;

  let kb = new InlineKeyboard()
    .text(mode === "manual" ? "⚡ Auto" : "📝 Manual", "toggle_redeem_mode").row()
    .text("➕ Add Codes", "adm_redeem_add").row()
    .text("📋 View All Codes", "adm_create_gift").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("toggle_redeem_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("redeem_mode", "manual");
  let newMode = current === "manual" ? "auto" : "manual";
  await setConfig("redeem_mode", newMode);
  await ctx.answerCallbackQuery({ text: `Switched to ${newMode.toUpperCase()}` });
  await rerender(ctx, "adm_redeem");
});

// ============================================================
// 🎁 REDEEM WITHDRAW (user)
// ============================================================
bot.callbackQuery("wd_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let user = await getUser(userId);

  if (!user.redeemCodeAddr || user.redeemCodeAddr === "Not Set") {
    return ctx.answerCallbackQuery({ text: "⚠️ Set Redeem Code first!", show_alert: true });
  }

  let mode = await getConfig("redeem_mode", "manual");
  let amounts = [10, 50, 100, 200, 500];
  let kb = new InlineKeyboard();
  for (let i = 0; i < amounts.length; i += 3) {
    let row = amounts.slice(i, i + 3);
    row.forEach(a => { kb = kb.text(`₹${a}`, `rdm_amt_redeem_${a}`); });
    kb = kb.row();
  }
  kb = kb.text("🔙 Cancel", "canc_rdm");

  await ctx.reply(
    `🎁 Redeem Code\n\n💰 Balance: ₹${user.balance.toFixed(2)}\n📌 Mode: ${mode === "manual" ? "Manual" : "Auto"}\n\n👇 Choose:`,
    { reply_markup: kb }
  );
});

bot.callbackQuery(/^rdm_amt_redeem_/, async (ctx) => {
  let amount = parseFloat(ctx.callbackQuery.data.replace("rdm_amt_redeem_", ""));
  let userId = ctx.from.id;
  let user = await getUser(userId);

  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  let mode = await getConfig("redeem_mode", "manual");
  await ctx.answerCallbackQuery();

  if (mode === "auto") {
    let gift = await GiftCode.findOneAndUpdate(
      { type: "redeem", amount, usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!gift) {
      return ctx.editMessageText(`❌ No codes available for ₹${amount}!`, {
        reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance")
      });
    }

    user.balance -= amount;
    await user.save();
    await logBalanceHistory(userId, `Redeem Auto (${gift.code})`, -amount);

    await ctx.editMessageText(
      `✅ *Redeem Code Assigned!*\n\n📌 <code>${gift.code}</code>\n💰 ₹${gift.amount}\n\n💵 Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
    );
  } else {
    // Manual — request to admin
    let requestId = Math.floor(100000 + Math.random() * 900000).toString();
    let RedeemRequest = mongoose.models.RedeemRequest || mongoose.model("RedeemRequest", new mongoose.Schema({
      requestId: { type: String, required: true, unique: true },
      userId: { type: Number, required: true },
      userName: { type: String, default: "" },
      userEmail: { type: String, default: "" },
      amount: { type: Number, required: true },
      type: { type: String, required: true },
      status: { type: String, default: "Pending" },
      assignedCode: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now }
    }));

    await RedeemRequest.create({
      requestId, userId, userName: user.firstName || "User",
      userEmail: user.redeemCodeAddr,
      amount, type: "redeem", status: "Pending"
    });

    await ctx.editMessageText(
      `⏳ *Request Submitted!*\n\n📌 Redeem Code\n💰 ₹${amount}\n🆔 \`${requestId}\`\n\n🕐 Admin will process shortly.`,
      { parse_mode: "Markdown" }
    );

    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      let msg = `🔔 *Redeem Request*\n\n👤 ${user.firstName || "User"}\n🆔 \`${user.userId}\`\n💰 ₹${amount}\n📧 \`${user.redeemCodeAddr}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `rdm_app_${requestId}`)
        .text("❌ Reject", `rdm_rej_${requestId}`);
      try { await ctx.api.sendMessage(payoutChannel, msg, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
  }
});

// ============================================================
// 🎁 REDEEM approve/reject (admin)
// ============================================================
bot.callbackQuery(/^rdm_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_app_", "");
  let RedeemRequest = mongoose.models.RedeemRequest;
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  userState[ctx.from.id] = `WAITING_RDM_CODE_${reqId}`;
  await ctx.answerCallbackQuery({ text: "Send code" });

  let icon = req.type === "amazon" ? "📧" : "🎁";
  await ctx.reply(
    `📝 Send code for user:\n\n🆔 <code>${req.userId}</code>\n💰 ₹${req.amount}\n${icon} ${req.type}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", `rdm_rej_${reqId}`) }
  );
});

bot.callbackQuery(/^rdm_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_rej_", "");
  let RedeemRequest = mongoose.models.RedeemRequest;
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  await req.save();
  delete userState[ctx.from.id];

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ REJECTED`).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Request Rejected*\n\n🆔 \`${req.requestId}\`\n💰 ₹${req.amount}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🎁 REDEEM code entry by admin (from text handler)
// ============================================================
// (Handled in Part 3 text handler for WAITING_RDM_CODE_)

// ============================================================
// 💰 WITHDRAWAL PENDING (From Mini App)
// ============================================================
// Handled by bot callbacks wd_app / wd_rej above

// ============================================================
// 📝 PART 7 END
// ============================================================

// ============================================================
// 🚀 FINAL START — Mongoose + Bot with 409 Retry
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err.message));

let botRetryCount = 0;
const MAX_BOT_RETRIES = 15;

async function startBotSafe() {
  try {
    await bot.start({
      onStart: (info) => {
        console.log(`🚀 Bot @${info.username} running!`);
        botRetryCount = 0;
      }
    });
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error("❌ Bot start error:", errMsg);

    if (errMsg.includes("409") || errMsg.includes("Conflict")) {
      botRetryCount++;
      if (botRetryCount <= MAX_BOT_RETRIES) {
        console.log(`⚠️ 409 Conflict. Retry ${botRetryCount}/${MAX_BOT_RETRIES} in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        return startBotSafe();
      }
    }

    console.error("❌ Bot failed after max retries. Exiting...");
    process.exit(1);
  }
}

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
    await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    await getConfig("welcome_channel_link", "https://t.me/yourchannel");

    // API Key
    let apiKey = await getConfig("auto_upi_api_key", null);
    if (!apiKey) {
      apiKey = "KEY_" + crypto.randomBytes(16).toString("hex");
      await setConfig("auto_upi_api_key", apiKey);
      console.log("🔐 Generated new API Key:", apiKey);
    }

    // Wait for old instance to die
    console.log("⏳ Waiting 8s for cleanup...");
    await new Promise(r => setTimeout(r, 8000));

    console.log("🔐 API Secret Key:", apiKey);
    console.log("📡 Custom API: POST /api/add-payment");
    console.log("📡 Test API: POST /api/test-utr");
    console.log(`🌐 Mini App: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/miniapp`);

    await startBotSafe();
  })
  .catch((err) => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

// ============================================================
// 👑 MINI APP — ADMIN APIs
// ============================================================

// ---------- PENDING WITHDRAWALS ----------
app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try {
    const wds = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals: wds });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- APPROVE WITHDRAWAL ----------
app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    let txnNumber = generateTxnNumber();
    wd.status = "Approved";
    wd.txnNumber = txnNumber;
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    let accountType = wd.method;
    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${wd.details}\n` +
        `🚀Transaction ID ==> ${txnNumber}\n` +
        `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
        `✅Please Check Your ${accountType} Account!`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- REJECT WITHDRAWAL ----------
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

// ---------- PENDING ADD FUNDS ----------
app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, addFunds: afs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- APPROVE ADD FUND ----------
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
        `✅ *Add Fund Approved!*\n\n💰 ₹${af.amount}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- REJECT ADD FUND ----------
app.post("/miniapp/api/admin/reject-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    af.status = "Rejected";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    try {
      await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- PENDING SUBMISSIONS ----------
app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, submissions: subs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- APPROVE SUBMISSION ----------
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

// ---------- REJECT SUBMISSION ----------
app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    sub.status = "Rejected";
    await sub.save();

    try {
      await bot.api.sendMessage(sub.userId,
        `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- PENDING UPI DEPOSITS ----------
app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try {
    const pending = await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, payments: pending });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- APPROVE UPI DEPOSIT ----------
app.post("/miniapp/api/admin/approve-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Approved") return res.json({ success: false, error: "Already processed" });

    payment.status = "Approved";
    payment.verifiedAt = new Date();
    payment.approvedBy = "MiniApp Admin";
    await payment.save();

    let user = await getUser(payment.userId);
    user.balance += payment.amount;
    await user.save();
    await logBalanceHistory(payment.userId, `UPI Deposit (Manual)`, payment.amount);

    try {
      const styledTitle = toSmallCaps("Deposit Auto-Approved!");
      const styledAdded = toSmallCaps("Added:");
      const styledUTR = toSmallCaps("UTR:");
      await bot.api.sendMessage(payment.userId,
        `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${payment.amount}\n🔐 ${styledUTR} ${payment.utr}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- REJECT UPI DEPOSIT ----------
app.post("/miniapp/api/admin/reject-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Rejected") return res.json({ success: false, error: "Already processed" });

    payment.status = "Rejected";
    payment.approvedBy = "MiniApp Admin";
    await payment.save();

    try {
      await bot.api.sendMessage(payment.userId,
        `❌ *Deposit Rejected*\n\n💰 ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\``,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ALL USERS ----------
app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: User Detail ----------
app.get("/miniapp/api/admin/user-detail/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });
    
    const withdrawCount = await Withdrawal.countDocuments({ userId: uid });
    const depositCount = await UPIPayment.countDocuments({ userId: uid });
    const balanceHistoryCount = await BalanceHistory.countDocuments({ userId: uid });
    
    res.json({
      success: true,
      user,
      counts: { withdraw: withdrawCount, deposit: depositCount, balanceHistory: balanceHistoryCount }
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: User withdrawals history ----------
app.get("/miniapp/api/admin/user-withdrawals/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: User deposits history ----------
app.get("/miniapp/api/admin/user-deposits/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const deposits = await UPIPayment.find({ userId: uid }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, deposits });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: User balance history ----------
app.get("/miniapp/api/admin/user-balance-history/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, history });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Remove balance ----------
app.post("/miniapp/api/admin/remove-balance", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });
    
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });
    
    user.balance = Math.max(0, user.balance - amt);
    await user.save();
    await logBalanceHistory(uid, "Admin Removed Balance", -amt);
    
    try {
      await bot.api.sendMessage(uid,
        `💰 Balance Updated!\n\n📉 Removed: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`);
    } catch (e) {}
    
    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Add balance ----------
app.post("/miniapp/api/admin/add-balance", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });
    
    let user = await User.findOne({ userId: uid });
    if (!user) {
      user = await User.create({ userId: uid, firstName: "Unknown", balance: amt });
    } else {
      user.balance += amt;
      await user.save();
    }
    await logBalanceHistory(uid, "Admin Added Balance", amt);
    
    try {
      await bot.api.sendMessage(uid,
        `💰 Balance Updated!\n\n🟢 Added: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`);
    } catch (e) {}
    
    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Send message ----------
app.post("/miniapp/api/admin/send-message", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const uid = parseInt(userId, 10);
    
    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });
    
    try {
      await bot.api.sendMessage(uid, `📨 Message from Admin:\n\n${message}`);
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: "Failed to send" });
    }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Gateway management ----------
app.get("/miniapp/api/admin/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({}).sort({ createdAt: -1 });
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/create", async (req, res) => {
  try {
    const { name, url, type } = req.body;
    if (!name || !url) return res.json({ success: false, error: "Missing fields" });
    
    let existing = await Gateway.findOne({ name: name.toUpperCase() });
    if (existing) return res.json({ success: false, error: "Gateway exists" });
    
    await Gateway.create({
      name: name.toUpperCase(),
      url: url.trim(),
      type: type || "deposit",
      isActive: false
    });
    
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/toggle/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const gw = await Gateway.findOne({ name });
    if (!gw) return res.json({ success: false, error: "Not found" });
    
    gw.isActive = !gw.isActive;
    await gw.save();
    
    res.json({ success: true, isActive: gw.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/delete/:name", async (req, res) => {
  try {
    const name = req.params.name;
    await Gateway.deleteOne({ name });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Settings ----------
app.get("/miniapp/api/admin/settings", async (req, res) => {
  try {
    const settings = {
      min_withdraw: await getConfig("min_withdraw", 10),
      max_withdraw: await getConfig("max_withdraw", 10000),
      tax_percent: await getConfig("tax_percent", 0),
      payout_channel: await getConfig("payout_channel", "Not Set"),
      support_username: await getConfig("support_username", "Not Set"),
      bot_active: await getConfig("bot_active", true),
      auto_upi_enabled: await getConfig("auto_upi_enabled", true),
      verification_enabled: await getConfig("verification_enabled", false),
      balance_footer_text: await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer),
      welcome_channel_link: await getConfig("welcome_channel_link", "")
    };
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/settings/update", async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = [
      "min_withdraw", "max_withdraw", "tax_percent",
      "payout_channel", "support_username", "bot_active",
      "auto_upi_enabled", "verification_enabled", "balance_footer_text",
      "welcome_channel_link"
    ];
    if (!allowed.includes(key)) return res.json({ success: false, error: "Invalid key" });
    
    await setConfig(key, value);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ADMIN: Broadcast ----------
app.post("/miniapp/api/admin/broadcast", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });

    const users = await User.find({});
    let sent = 0, failed = 0;

    for (let u of users) {
      try {
        await bot.api.sendMessage(u.userId, message);
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { failed++; }
    }

    res.json({ success: true, sent, failed, total: users.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🌐 EXPRESS SERVER START — CRITICAL FIX
// ============================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT} on 0.0.0.0`);
});

// Auto-ping every 5 minutes
setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

// ============================================================
// ✅ END OF FILE
// ============================================================
console.log("✅ bot.js loaded — Complete bot with all features");
