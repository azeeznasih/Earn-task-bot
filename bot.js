// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + CUSTOM UPI (MacroDroid)
// grammy ^1.35.1 | mongoose ^8.13.0 | express ^4.21.2
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
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

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

// ---------- ✅ RECEIVED PAYMENT (MacroDroid) ----------
const receivedPaymentSchema = new mongoose.Schema({
  utr: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "UNUSED" }, // UNUSED | USED | EXPIRED
  usedByUserId: { type: Number, default: null },
  usedAt: { type: Date, default: null },
  source: { type: String, default: "MacroDroid" },
  rawSms: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24h auto-expire
});
const ReceivedPayment = mongoose.models.ReceivedPayment || mongoose.model("ReceivedPayment", receivedPaymentSchema);

// ---------- ✅ UPI DEPOSIT (User Pending) ----------
const upiPaymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  utr: { type: String, default: "" },
  upiId: { type: String, required: true },
  status: { type: String, default: "Pending" }, // Pending | Approved | Rejected
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

// ---------- GATEWAY ----------
const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  url: { type: String, required: true },
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

function calculateTax(amount) {
  let taxPercent = 0;
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
// 📝 DEFAULT TEXTS
// ============================================================
const DEFAULT_TEXTS = {
  start_welcome: "💫 <b>Welcome To Task Payment Bot!</b>\n\nTo Know How To Earn → <a href=\"https://t.me/yourchannel\">CLICK HERE</a>",
  balance_title: "<blockquote>⭐ <b>Welcome To Bot!</b> ❞</blockquote>",
  balance_body: "🔵 <b>Wallet ID:</b> <code>{userId}</code>\n🧾 <b>Balance:</b> <b>₹{balance}</b>",
  balance_footer: "<blockquote><i>Built with security you can Trust.</i></blockquote>",
  cancel_text: "❌ Cancelled.",
  back_text: "🏠 Main Menu"
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
// 💳 AUTO UPI HELPERS
// ============================================================
async function createUPIOrder(userId, amount, upiId) {
  const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payment = await UPIPayment.create({
    orderId, userId, amount, upiId, status: "Pending"
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

    // Security check
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

    // Check if UTR already exists
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

// ============================================================
// ✅ TEST API — Admin can manually add UTR for testing
// ============================================================
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
// 📱 MINI APP APIs
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
        joined: user.createdAt,
        linkedInfo,
        walletAccount: user.walletAccount,
        upiId: user.upiId,
        bankAccNo: user.bankAccNo,
        bankIfsc: user.bankIfsc,
        amazonEmail: user.amazonEmail,
        redeemCodeAddr: user.redeemCodeAddr
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
        `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 ₹${amt.toFixed(2)}\n\n💵 Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) { }

    res.json({ success: true });
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
// 💠 UPI SETTINGS API (Mini App-ന്)
// ============================================================
app.get("/miniapp/api/upi-settings", async (req, res) => {
  try {
    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    const upiId = await getConfig("auto_upi_id", "nasih@fam");
    const enabled = await getConfig("auto_upi_enabled", true);

    res.json({
      success: true,
      min: minAmt,
      max: maxAmt,
      upiId: upiId,
      enabled: enabled
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 💠 UPI VERIFY API — Auto + Manual Logic
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

    // Validate UTR
    if (cleanUtr.length < 10 || cleanUtr.length > 25 || !/^\d+$/.test(cleanUtr)) {
      return res.json({ success: false, error: "Invalid UTR format" });
    }

    // Validate amount
    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    if (isNaN(amt) || amt < minAmt || amt > maxAmt) {
      return res.json({ success: false, error: `Amount must be ₹${minAmt}-₹${maxAmt}` });
    }

    // Check duplicate UTR
    const existingUsed = await UPIPayment.findOne({ utr: cleanUtr, status: "Approved" });
    if (existingUsed) {
      return res.json({ success: false, error: "This UTR has already been used" });
    }

    // Get verify modes
    const autoEnabled = await getConfig("auto_verify_enabled", true);
    const manualEnabled = await getConfig("manual_verify_enabled", true);

    if (!autoEnabled && !manualEnabled) {
      return res.json({ success: false, error: "Add Fund is temporarily disabled" });
    }

    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const user = await getUser(uid);

    // ✅ AUTO VERIFY (if enabled)
    if (autoEnabled) {
      const receivedPayment = await ReceivedPayment.findOne({
        utr: cleanUtr,
        status: "UNUSED"
      });

      if (receivedPayment) {
        // Check amount match
        if (Math.abs(receivedPayment.amount - amt) > 0.5) {
          // Amount mismatch - try manual if enabled
          if (!manualEnabled) {
            return res.json({
              success: false,
              error: `Amount mismatch. Expected ₹${receivedPayment.amount}, got ₹${amt}`
            });
          }
        } else {
          // ✅ MATCH — Auto approve
          receivedPayment.status = "USED";
          receivedPayment.usedByUserId = uid;
          receivedPayment.usedAt = new Date();
          await receivedPayment.save();

          const payment = await UPIPayment.create({
            orderId, userId: uid, amount: amt,
            utr: cleanUtr, upiId: upiId || await getConfig("auto_upi_id", "nasih@fam"),
            status: "Approved", source: "miniapp-auto",
            verifiedAt: new Date(), approvedBy: "Auto (MacroDroid)"
          });

          user.balance += amt;
          await user.save();

          await logBalanceHistory(uid, `UPI Deposit (Auto UTR: ${cleanUtr})`, amt);

          // Payout notification
          const payoutChannel = await getConfig("payout_channel", null);
          if (payoutChannel) {
            try {
              await bot.api.sendMessage(payoutChannel,
                `💰 <b>New UPI Deposit (Auto-Approved)!</b>\n\n` +
                `<b>👤 User:</b> ${user.firstName || "User"}\n` +
                `<b>🆔 ID:</b> <code>${uid}</code>\n` +
                `<b>💵 Amount:</b> ₹${amt}\n` +
                `<b>🔐 UTR:</b> <code>${cleanUtr}</code>\n` +
                `<b>✅ Status:</b> Auto-Approved\n` +
                `<b>📅 Date:</b> ${new Date().toLocaleString('en-IN')}`,
                { parse_mode: "HTML" });
            } catch (e) { }
          }

          // User notify (bot)
          try {
            const styledTitle = toSmallCaps("Deposit Auto-Approved!");
            const styledAdded = toSmallCaps("Added:");
            const styledUTR = toSmallCaps("UTR:");
            await bot.api.sendMessage(uid,
              `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${amt}\n🔐 ${styledUTR} ${cleanUtr}`,
              { parse_mode: "Markdown" });
          } catch (e) { }

          return res.json({
            success: true,
            mode: "auto",
            message: "Deposit approved automatically",
            newBalance: user.balance
          });
        }
      }
      // If no match and manual disabled → fail
      if (!manualEnabled) {
        return res.json({ success: false, error: "Payment not found. Please wait and try again." });
      }
    }

    // ✅ MANUAL VERIFY (if enabled)
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
            `💰 <b>UPI Deposit Request (Manual)</b>\n\n` +
            `<b>👤 User:</b> ${user.firstName || "User"}\n` +
            `<b>🆔 ID:</b> <code>${uid}</code>\n` +
            `<b>💵 Amount:</b> ₹${amt}\n` +
            `<b>🔐 UTR:</b> <code>${cleanUtr}</code>\n` +
            `<b>🆔 Order:</b> <code>${orderId}</code>\n` +
            `<b>⏳ Status:</b> Pending Approval\n` +
            `<b>📅 Date:</b> ${new Date().toLocaleString('en-IN')}`,
            { parse_mode: "HTML", reply_markup: kb });
        } catch (e) { }
      }

      return res.json({
        success: true,
        mode: "manual",
        message: "Pending admin approval",
        newBalance: user.balance
      });
    }

    return res.json({ success: false, error: "No verify mode enabled" });
  } catch (e) {
    console.error("UPI verify error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 📝 PART 1 END
// ============================================================
// Part 2-ൽ തുടരും: Bot commands, handlers, UPI flows
// ============================================================

// ============================================================
// 🤖 BOT COMMANDS & HANDLERS
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

    // Force Join check
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
    try { await ctx.reply(`❌ Error: ${err.message}`); } catch (e) {}
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

    // ═══════════════════════════════════════════════════════
    // 💠 AUTO UPI DEPOSIT — Amount Input
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
      let payment = await createUPIOrder(userId, amt, upiId);

      userState[userId] = `UPI_WAIT_UTR_${payment.orderId}_${amt}`;

      const styledEnter = toSmallCaps("After Payment, Send UTR:");
      const styledTap = toSmallCaps("(Tap UPI to copy)");

      const msg =
        `✅ Amount Set: ₹${amt}\n\n` +
        `📱 Pay to UPI: \`${upiId}\`\n` +
        `${styledTap}\n\n` +
        `🔐 ${styledEnter}\n\n` +
        `🆔 Order: \`${payment.orderId}\``;

      return ctx.reply(msg, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel")
      });
    }

    // ═══════════════════════════════════════════════════════
    // 💠 AUTO UPI DEPOSIT — UTR Input (Auto + Manual)
    // ═══════════════════════════════════════════════════════
    if (state && state.startsWith("UPI_WAIT_UTR_")) {
      let parts = state.replace("UPI_WAIT_UTR_", "").split("_");
      let orderId = parts[0];
      let amount = parseFloat(parts[1]);
      delete userState[userId];

      let utr = text.trim().replace(/\s/g, "");

      if (utr.length < 10 || utr.length > 25 || !/^\d+$/.test(utr)) {
        return ctx.reply(`❌ *Invalid UTR*\n\nUTR usually 12 digits. Please send correct UTR.`, { parse_mode: "Markdown" });
      }

      // Check duplicate UTR
      let existingUsed = await UPIPayment.findOne({ utr, status: "Approved" });
      if (existingUsed) {
        return ctx.reply("❌ This UTR has already been used!");
      }

      await ctx.reply("⏳ Verifying your payment...");

      let autoEnabled = await getConfig("auto_verify_enabled", true);
      let manualEnabled = await getConfig("manual_verify_enabled", true);

      if (!autoEnabled && !manualEnabled) {
        return ctx.reply("❌ Add Fund is temporarily disabled.");
      }

      let user = await getUser(userId);

      // ✅ AUTO VERIFY
      if (autoEnabled) {
        let receivedPayment = await ReceivedPayment.findOne({ utr, status: "UNUSED" });

        if (receivedPayment) {
          // Amount check
          if (Math.abs(receivedPayment.amount - amount) <= 0.5) {
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
            } else {
              await UPIPayment.create({
                orderId, userId, amount, utr,
                upiId: await getConfig("auto_upi_id", "nasih@fam"),
                status: "Approved", source: "bot-auto",
                verifiedAt: new Date(), approvedBy: "Auto (MacroDroid)"
              });
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
              { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
            );

            // Payout notification
            let payoutChannel = await getConfig("payout_channel", null);
            if (payoutChannel) {
              try {
                await ctx.api.sendMessage(payoutChannel,
                  `💰 <b>New UPI Deposit (Auto)!</b>\n\n` +
                  `<b>👤 User:</b> ${user.firstName || "User"}\n` +
                  `<b>🆔 ID:</b> <code>${userId}</code>\n` +
                  `<b>💵 Amount:</b> ₹${amount}\n` +
                  `<b>🔐 UTR:</b> <code>${utr}</code>\n` +
                  `<b>✅ Status:</b> Auto-Approved\n` +
                  `<b>📅 Date:</b> ${new Date().toLocaleString('en-IN')}`,
                  { parse_mode: "HTML" });
              } catch (e) {}
            }
            return;
          }
        }

        // Auto failed — fallback to manual if enabled
        if (!manualEnabled) {
          return ctx.reply(
            `❌ *Payment Not Found*\n\n🔐 UTR: \`${utr}\`\n\n💡 Please check UTR and try again.`,
            { parse_mode: "Markdown" }
          );
        }
      }

      // ⏳ MANUAL VERIFY (fallback)
      if (manualEnabled) {
        let payment = await UPIPayment.findOne({ orderId });
        if (payment) {
          payment.utr = utr;
          payment.status = "Pending";
          payment.source = "bot-manual";
          await payment.save();
        } else {
          await UPIPayment.create({
            orderId, userId, amount, utr,
            upiId: await getConfig("auto_upi_id", "nasih@fam"),
            status: "Pending", source: "bot-manual"
          });
        }

        // Notify admin
        let payoutChannel = await getConfig("payout_channel", null);
        if (payoutChannel) {
          let kb = new InlineKeyboard()
            .text("✅ Approve", `upi_app_${orderId}`)
            .text("❌ Reject", `upi_rej_${orderId}`);

          try {
            await ctx.api.sendMessage(payoutChannel,
              `💰 <b>UPI Deposit Request (Manual)</b>\n\n` +
              `<b>👤 User:</b> ${user.firstName || "User"}\n` +
              `<b>🆔 ID:</b> <code>${userId}</code>\n` +
              `<b>💵 Amount:</b> ₹${amount}\n` +
              `<b>🔐 UTR:</b> <code>${utr}</code>\n` +
              `<b>🆔 Order:</b> <code>${orderId}</code>\n` +
              `<b>⏳ Status:</b> Pending Approval`,
              { parse_mode: "HTML", reply_markup: kb });
          } catch (e) {}
        }

        return ctx.reply(
          `⏳ *Deposit Pending*\n\n💰 Amount: ₹${amount}\n🔐 UTR: \`${utr}\`\n\n🕐 Admin will verify shortly.`,
          { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
        );
      }
    }

    // ═══════════════════════════════════════════════════════
    // ⚙️ UPI ADMIN SETTINGS
    // ═══════════════════════════════════════════════════════
    if (state === "UPI_SET_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("auto_upi_id", text.trim());
      return ctx.reply(`✅ UPI ID: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_auto_upi") });
    }
    if (state === "UPI_SET_MIN" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid");
      await setConfig("auto_upi_min", amt);
      return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_auto_upi") });
    }
    if (state === "UPI_SET_MAX" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 1) return ctx.reply("❌ Invalid");
      await setConfig("auto_upi_max", amt);
      return ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_auto_upi") });
    }

    // ═══════════════════════════════════════════════════════
    // 🔐 UPI API SECRET KEY
    // ═══════════════════════════════════════════════════════
    if (state === "UPI_SET_APIKEY" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("auto_upi_api_key", text.trim());
      return ctx.reply(`✅ API Key updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_auto_upi") });
    }

    // ═══════════════════════════════════════════════════════
    // 💰 WITHDRAW AMOUNT
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

      let confirmMsg = `📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: ${details}\nAmount: ₹${amount}\n\nConfirm?`;
      let safeMethod = method.replace(/ /g, "_");
      let kb = new InlineKeyboard()
        .text("✅ Confirm", `conf_wd_${safeMethod}_${amount}`)
        .text("❌ Cancel", "canc_wd");
      return ctx.reply(confirmMsg, { reply_markup: kb, parse_mode: "Markdown" });
    }

    // ═══════════════════════════════════════════════════════
    // ⚡ QUICK PAY
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

    if (state === "QP_WAIT_AMOUNT") {
      let amt = parseFloat(text.trim());
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid amount!");

      let sender = await getUser(userId);
      if (sender.balance < amt) return ctx.reply(`❌ Insufficient!`);

      let cacheObj = global.quickPayCache?.[userId];
      if (!cacheObj) return ctx.reply("❌ Session expired!");

      let receiver = await User.findOne({ userId: cacheObj.receiverId });
      if (!receiver) return ctx.reply("❌ Receiver not found!");

      userState[userId] = `QP_CONFIRM_${cacheObj.receiverId}_${amt}`;

      return ctx.reply(
        `⚠️ *Confirm Payment*\n\n👤 To: ${receiver.firstName || "User"}\n🆔 \`${receiver.userId}\`\n💰 ₹${amt}\n\n💵 Your Balance: ₹${sender.balance.toFixed(2)}\n💸 After: ₹${(sender.balance - amt).toFixed(2)}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("✅ Confirm", "qp_confirm").text("❌ Cancel", "qp_cancel")
        }
      );
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
    // 💳 PAYMENT METHOD SETTING
    // ═══════════════════════════════════════════════════════
    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
      return ctx.reply(`✅ Wallet: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ UPI: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
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
      return ctx.reply(`✅ Bank: \`${accNo}\`\n\`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_AMAZON_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text.trim() });
      return ctx.reply(`✅ Email: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }
    if (state === "SET_REDEEM_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text.trim() });
      return ctx.reply(`✅ Redeem Code: \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() });
    }

    // ═══════════════════════════════════════════════════════
    // 🔍 ADMIN — User Tracker
    // ═══════════════════════════════════════════════════════
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      let kb = new InlineKeyboard()
        .text("🔙 Back", "admin");
      let msg =
        `🙇‍♂️ USER DETAILS\n\n` +
        `🚻 User: ${targetUser.firstName || "Unknown"}\n` +
        `🆔 ID: ${targetUser.userId}\n` +
        `💰 Balance: ₹${targetUser.balance.toFixed(2)}\n` +
        `🏧 Withdrawn: ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}`;
      return ctx.reply(msg, { reply_markup: kb });
    }

    // ═══════════════════════════════════════════════════════
    // 💰 ADMIN — Add Balance
    // ═══════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════
    // ➖ ADMIN — Remove Balance
    // ═══════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════
    // ⚙️ ADMIN — Settings
    // ═══════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════
    // 📋 ADMIN — Create Task
    // ═══════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════
    // 📢 ADMIN — Broadcast
    // ═══════════════════════════════════════════════════════
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let allUsers = await User.find({});
      global.broadcastCache = global.broadcastCache || {};
      global.broadcastCache[userId] = { text };

      return ctx.reply(
        `📢 *Broadcast Preview*\n\n━━━━━━━━━━━━━━━━━━━━\n\n${text}\n\n━━━━━━━━━━━━━━━━━━━━\n\n👥 *Recipients:* ${allUsers.length}\n\n👇 Confirm?`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("✅ Confirm", "broadcast_confirm")
            .text("❌ Cancel", "broadcast_cancel")
        }
      );
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

  // 💸 MY BALANCE
  if (matchedKey === "btn_balance" || /balance/i.test(text)) {
    try {
      let title = DEFAULT_TEXTS.balance_title;
      let body = DEFAULT_TEXTS.balance_body.replace(/{userId}/g, userId).replace(/{balance}/g, user.balance.toFixed(2));
      let footer = DEFAULT_TEXTS.balance_footer;
      let msg = `${title}\n\n${body}\n\n${footer}`;

      try {
        return await ctx.reply(msg, {
          reply_markup: await buildStyledKb([
            [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
            [
              { text: "📊 Balance Statement", callback_data: "balance_statement" },
              { text: "💬 Support", callback_data: "customer_support" }
            ],
            [
              { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
              { text: "💰 Live Fund", callback_data: "live_fund" }
            ]
          ]),
          parse_mode: "HTML"
        });
      } catch (htmlErr) {
        let plainMsg = `━━━━━━ 💳 Wallet Overview ━━━━━━\n\n🔵 Wallet ID ➝ ${userId}\n🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\nBuilt with security you can Trust.`;
        return await ctx.reply(plainMsg, {
          reply_markup: await buildStyledKb([
            [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
            [
              { text: "📊 Balance Statement", callback_data: "balance_statement" },
              { text: "💬 Support", callback_data: "customer_support" }
            ],
            [
              { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
              { text: "💰 Live Fund", callback_data: "live_fund" }
            ]
          ])
        });
      }
    } catch (err) {
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
      `✨ *Choose Payment Method*\n\n👛 *Wallet* - ${fmt(user.walletAccount)}\n\n⚡ *UPI* - ${fmt(user.upiId)}\n\n🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}`;
    return ctx.reply(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "🌐 Wallet", callback_data: "set_wallet" }, { text: "⚡ UPI", callback_data: "set_upi" }],
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

    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, {
      reply_markup: await buildStyledKb([
        [
          { text: `${walletOn ? "🌐 Wallet" : "🔴 Wallet OFF"}`, callback_data: "wd_wallet" },
          { text: `${upiOn ? "⚡ UPI" : "🔴 UPI OFF"}`, callback_data: "wd_upi" }
        ],
        [{ text: `${bankOn ? "🏦 Bank" : "🔴 Bank OFF"}`, callback_data: "wd_bank" }]
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
// 📸 PHOTO HANDLER (Task Submissions)
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
      `⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout() }
    );

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);

    if (alertChannel && alertChannel !== "Not Set") {
      let caption =
        `📸 *New Task Submission!*\n\n👤 ${ctx.from.first_name || "User"}\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*`;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
  }
});

// ============================================================
// ✅ ADD FUND BUTTON (Bot — Auto UPI)
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
// 💠 UPI ADMIN APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^upi_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_app_", "");
  let payment = await UPIPayment.findOne({ orderId });
  if (!payment || payment.status === "Approved") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });

  let result = await approveUPIPayment(orderId, payment.utr || "", `@${ctx.from.username || "Admin"}`);
  if (!result) return ctx.answerCallbackQuery({ text: "Failed!", show_alert: true });

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
  if (!payment || payment.status === "Rejected") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });

  payment.status = "Rejected";
  await payment.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText(
    (ctx.callbackQuery.message.text || "") + `\n\n❌ <b>REJECTED</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(payment.userId,
      `❌ *Deposit Rejected*\n\n💰 Amount: ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\`\n\n💬 Contact support.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
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
    `✅ *Payment Successful!*\n\n👤 To: ${receiver.firstName || "User"}\n💰 ₹${amount.toFixed(2)}\n\n💵 Balance: ₹${sender.balance.toFixed(2)}`,
    { parse_mode: "Markdown" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(receiver.userId,
      `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 ₹${amount.toFixed(2)}`,
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

  let detailsMsg = `📋 *Task Details*\n\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 *${task.link}*\n\n📸 Click link, take screenshot, send here.`;

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
// 📊 BALANCE / SUPPORT / LIVE FUND
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery("🔄 Refreshed!");

  try {
    let body = DEFAULT_TEXTS.balance_body.replace(/{userId}/g, userId).replace(/{balance}/g, user.balance.toFixed(2));
    let msg = `${DEFAULT_TEXTS.balance_title}\n\n${body}\n\n${DEFAULT_TEXTS.balance_footer}`;
    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
        [
          { text: "📊 Balance Statement", callback_data: "balance_statement" },
          { text: "💬 Support", callback_data: "customer_support" }
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
    msg += `━━━━━━━━━━━━━━━━━━━━\n🟢 Earned: ₹${totalIn.toFixed(2)}\n🔴 Spent: ₹${totalOut.toFixed(2)}`;
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
    let body = DEFAULT_TEXTS.balance_body.replace(/{userId}/g, userId).replace(/{balance}/g, user.balance.toFixed(2));
    let msg = `${DEFAULT_TEXTS.balance_title}\n\n${body}\n\n${DEFAULT_TEXTS.balance_footer}`;
    await ctx.editMessageText(msg, {
      reply_markup: await buildStyledKb([
        [{ text: "➕ Add Fund", callback_data: "add_fund_btn" }],
        [
          { text: "📊 Balance Statement", callback_data: "balance_statement" },
          { text: "💬 Support", callback_data: "customer_support" }
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
  if (!supportId || supportId === "Not Set") return ctx.reply(`💬 *Support*\n\n⚠️ Support not set.`, { parse_mode: "Markdown" });
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
async function isWithdrawEnabled(method) {
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  return toggles[method.toLowerCase()] !== false;
}

async function promptWithdrawalAmount(ctx, method) {
  let toggleKey = method.toLowerCase();
  if (!(await isWithdrawEnabled(toggleKey))) {
    return ctx.answerCallbackQuery({ text: `❌ ${method} OFF!`, show_alert: true });
  }

  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[ctx.from.id] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => { await promptWithdrawalAmount(ctx, "Wallet"); });
bot.callbackQuery("wd_upi", async (ctx) => { await promptWithdrawalAmount(ctx, "UPI"); });
bot.callbackQuery("wd_bank", async (ctx) => { await promptWithdrawalAmount(ctx, "Bank"); });

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
    try {
      await ctx.api.sendMessage(payoutChannel,
        `⚠️ <b>New ${method.toUpperCase()} Payout Request!</b>\n\n` +
        `<b>User:</b> <code>${userId}</code>\n` +
        `<b>Amount:</b> ₹${amount}\n` +
        `<b>${method}:</b> <code>${details}</code>`,
        { parse_mode: "HTML", reply_markup: adminKb });
    } catch (e) {}
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 💰 WITHDRAWAL APPROVE
// ============================================================
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

  let txnNumber = generateTxnNumber();
  wd.status = "Approved";
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  await ctx.editMessageText(
    `⚠️ <b>Payout Request</b>\n\n<b>User:</b> <code>${wd.userId}</code>\n<b>Amount:</b> ₹${wd.amount}\n<b>TXN:</b> <code>${txnNumber}</code>\n✅ <b>Approved by ${wd.approvedBy}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  let accountType = wd.method === "UPI" ? "UPI" : (wd.method === "Wallet" ? "Wallet" : "Bank");
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

// ============================================================
// ❌ WITHDRAWAL REJECT
// ============================================================
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
  await ctx.editMessageText(
    `⚠️ <b>Payout Request</b>\n\n<b>User:</b> <code>${wd.userId}</code>\n<b>Amount:</b> ₹${wd.amount}\n\n❌ <b>REJECTED</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId,
      `❌ *Withdrawal Rejected!*\n\n💰 ₹${wd.amount}\n\n💵 Refunded: ₹${user.balance.toFixed(2)}`,
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
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED*`,
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
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  sub.status = "Rejected";
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED*`,
    parse_mode: "Markdown"
  }).catch(() => {});

  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ *Task Rejected!*\n\n📌 *${sub.taskTitle}*`,
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
// 📝 PART 2 END
// ============================================================

// ============================================================
// 🚀 /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
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
  let admins = await getConfig("admins", []);
  let adminCount = admins.length + 1;
  let verifyEnabled = await getConfig("verification_enabled", false);
  let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
  let autoVerify = await getConfig("auto_verify_enabled", true);
  let manualVerify = await getConfig("manual_verify_enabled", true);

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `💠 *Auto UPI:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢" : "🔴"} | ✋ Manual: ${manualVerify ? "🟢" : "🔴"}\n` +
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
      { text: "💠 Auto UPI", callback_data: "adm_auto_upi" },
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
// 💠 AUTO UPI SETTINGS PANEL
// ============================================================
bot.callbackQuery("adm_auto_upi", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

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
    `💠 *Auto UPI Settings*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 *UPI ID:* \`${upiId}\`\n` +
    `📉 *Min:* ₹${minAmt}\n` +
    `📈 *Max:* ₹${maxAmt}\n` +
    `🔐 *API Key:* \`${apiKey.substring(0, 12)}...\`\n\n` +
    `⚙️ *Verify Mode:* ${modeText}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢 ON" : "🔴 OFF"}\n` +
    `  ✋ Manual: ${manualVerify ? "🟢 ON" : "🔴 OFF"}\n\n` +
    `🔘 *Status:* ${enabled ? "🟢 Active" : "🔴 Disabled"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(`📌 UPI ID`, "upiset_id")
    .text(`📉 Min`, "upiset_min")
    .text(`📈 Max`, "upiset_max").row()
    .text(`${autoVerify ? "🤖 Auto: ON" : "🤖 Auto: OFF"}`, "upiset_toggle_auto").row()
    .text(`${manualVerify ? "✋ Manual: ON" : "✋ Manual: OFF"}`, "upiset_toggle_manual").row()
    .text(`🔐 API Key`, "upiset_apikey").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "upiset_toggle").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("upiset_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_ID";
  await ctx.reply("📌 Send new UPI ID (e.g., `nasih@fam`):", { parse_mode: "Markdown" });
});

bot.callbackQuery("upiset_min", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MIN";
  await ctx.reply("📉 Send new minimum amount:");
});

bot.callbackQuery("upiset_max", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MAX";
  await ctx.reply("📈 Send new maximum amount:");
});

bot.callbackQuery("upiset_apikey", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let newKey = "KEY_" + crypto.randomBytes(16).toString("hex");
  await setConfig("auto_upi_api_key", newKey);
  await ctx.reply(
    `🔐 *New API Key Generated!*\n\n\`${newKey}\`\n\n⚠️ *Save this!* Won't show again.\n\n💡 Use this in MacroDroid POST request.`,
    { parse_mode: "Markdown" }
  );
  await bot.callbackQuery("adm_auto_upi", ctx);
});

bot.callbackQuery("upiset_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_upi_enabled", true);
  await setConfig("auto_upi_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await bot.callbackQuery("adm_auto_upi", ctx);
});

bot.callbackQuery("upiset_toggle_auto", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_verify_enabled", true);
  await setConfig("auto_verify_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🤖 Auto ON" : "🤖 Auto OFF" });
  await bot.callbackQuery("adm_auto_upi", ctx);
});

bot.callbackQuery("upiset_toggle_manual", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("manual_verify_enabled", true);
  await setConfig("manual_verify_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✋ Manual ON" : "✋ Manual OFF" });
  await bot.callbackQuery("adm_auto_upi", ctx);
});

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

bot.callbackQuery("adm_all_balances", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) return ctx.reply("📊 No users.");

  let totalBalance = 0;
  let chunks = [];
  let current = `📊 *All Users Balance*\n\n`;
  users.forEach((u, idx) => {
    totalBalance += u.balance;
    let line = `\`${idx + 1}.\` \`${u.userId}\` — ₹${u.balance.toFixed(2)}\n`;
    if (current.length + line.length > 3500) { chunks.push(current); current = ""; }
    current += line;
  });
  current += `\n━━━━━━━━━━━━━━━━━━━━\n👥 Total: ${users.length}\n💵 Sum: ₹${totalBalance.toFixed(2)}`;
  chunks.push(current);

  let kb = new InlineKeyboard().text("🔙 Back", "admin");
  for (let i = 0; i < chunks.length; i++) {
    if (i === chunks.length - 1) await ctx.reply(chunks[i], { parse_mode: "Markdown", reply_markup: kb });
    else await ctx.reply(chunks[i], { parse_mode: "Markdown" });
  }
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
  await ctx.editMessageText(`📢 *Send Message:*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});

bot.callbackQuery("adm_user_message", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  await ctx.editMessageText(
    `💬 *Send to User*\n\nFormat: \`UserID | Message\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") }
  ).catch(() => {});
});

// ============================================================
// ⚙️ ADMIN SETTINGS
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
    `⚙️ *Settings*\n\n` +
    `🤖 Bot: ${botActive ? "✅" : "❌"}\n` +
    `💸 Min WD: ₹${minW}\n` +
    `💰 Max WD: ₹${maxW}\n` +
    `📢 Payout: \`${pChannel}\`\n` +
    `💬 Support: \`${supportId}\``;

  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Bot OFF" : "🟢 Bot ON", "adm_toggle_bot").row()
    .text("📉 Min WD", "adm_set_min_w")
    .text("📈 Max WD", "adm_set_max_w").row()
    .text("📢 Payout Channel", "adm_set_p_chan").row()
    .text("💬 Support ID", "adm_set_support").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_toggle_bot", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("bot_active", true);
  await setConfig("bot_active", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await bot.callbackQuery("adm_settings", ctx);
});

bot.callbackQuery("adm_set_min_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Send min withdraw amount:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_max_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Send max withdraw amount:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Send payout channel (e.g., `-1001234567890`):", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.editMessageText("💬 Send support (username or ID):", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

// ============================================================
// 💸 WITHDRAW TOGGLE
// ============================================================
async function isWithdrawEnabled(method) {
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  return toggles[method.toLowerCase()] !== false;
}

async function toggleWithdraw(method) {
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  toggles[method.toLowerCase()] = !toggles[method.toLowerCase()];
  await setConfig("withdraw_toggles", toggles);
  return toggles[method.toLowerCase()];
}

bot.callbackQuery("adm_withdraw_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });

  let kb = new InlineKeyboard()
    .text(`${toggles.wallet ? "✅" : "🔴"} Wallet`, "wt_toggle_wallet").row()
    .text(`${toggles.upi ? "✅" : "🔴"} UPI`, "wt_toggle_upi").row()
    .text(`${toggles.bank ? "✅" : "🔴"} Bank`, "wt_toggle_bank").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText("💸 *Withdraw Toggle*", { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^wt_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("wt_toggle_", "");
  let newState = await toggleWithdraw(method);
  await ctx.answerCallbackQuery({ text: newState ? `✅ ${method} ON` : `🔴 ${method} OFF` });
  await bot.callbackQuery("adm_withdraw_toggle", ctx);
});

// ============================================================
// 🎁 GIFT CODE MANAGEMENT
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

  let text = `🎁 *Gift Codes*\n\nTotal: ${totalCodes}\nNotif: ${notifEnabled ? "✅" : "❌"}`;

  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    kb = kb.text(`${c.usedUsers.length >= c.maxUses ? "❌" : "✅"} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb = kb.text(notifEnabled ? "🔕 Notif OFF" : "🔔 Notif ON", "gc_notif_toggle").row();
  kb = kb.text("➕ Add Code", "adm_redeem_add").row();
  kb = kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  let kb = new InlineKeyboard()
    .text("✏️ Amount", `gc_edit_amt_${gc.code}`)
    .text("👥 Max", `gc_edit_max_${gc.code}`).row()
    .text("🗑️ Delete", `gc_del_${gc.code}`).row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(
    `🎁 *Code:* \`${gc.code}\`\n\n💰 ₹${gc.amount}\n👥 Max: ${gc.maxUses}\n✅ Claimed: ${gc.usedUsers.length}`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery(/^gc_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_GC_AMT_${code}`;
  await ctx.editMessageText("✏️ Send new amount:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_max_", "");
  userState[ctx.from.id] = `WAITING_GC_MAX_${code}`;
  await ctx.editMessageText("✏️ Send new max uses:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
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

bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.editMessageText(
    `➕ *Add Codes*\n\nFormat: \`CODE AMOUNT\`\n\nExample:\n\`WELCOME100 100\`\n\`BONUS50 50\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_create_gift") }
  ).catch(() => {});
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

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
  await ctx.editMessageText("💡 *Manage Tasks*", { reply_markup: keyboard, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^view_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let kb = new InlineKeyboard()
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(
    `📋 *${task.title}*\n\n💰 ₹${task.reward}\n🔗 ${task.link}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
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
    `➕ *New Task*\n\nFormat: \`TaskID | Title | Reward | Link\`\n\nExample:\n\`T1 | Subscribe Channel | 10 | https://t.me/channel\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") }
  );
});

// ============================================================
// 🌐 GATEWAY MANAGEMENT
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let gateways = await Gateway.find({});
  let activeGW = await Gateway.findOne({ isActive: true });

  let kb = new InlineKeyboard();
  for (let gw of gateways) {
    kb.text(`${gw.isActive ? "✅" : "⚪"} ${gw.name}`, `gw_view_${gw.name}`).row();
  }
  kb.text("➕ Add Gateway", "gw_add").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(
    `🌐 *Gateway Management*\n\nActive: ${activeGW ? activeGW.name : "None"}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
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

  let kb = new InlineKeyboard();
  if (gw.isActive) kb.text("🔴 Deactivate", `gw_deactivate_${gw.name}`).row();
  else kb.text("🟢 Activate", `gw_activate_${gw.name}`).row();
  kb.text("🗑️ Delete", `gw_del_${gw.name}`).row();
  kb.text("🔙 Back", "adm_gateway_menu");

  await ctx.editMessageText(
    `🌐 *${gw.name}*\n\nStatus: ${gw.isActive ? "✅ Active" : "⚪ Inactive"}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery(/^gw_activate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_activate_", "");
  await Gateway.updateMany({}, { isActive: false });
  await Gateway.updateOne({ name: gwName }, { isActive: true });
  await ctx.answerCallbackQuery({ text: `✅ ${gwName}` });
  await bot.callbackQuery("adm_gateway_menu", ctx);
});

bot.callbackQuery(/^gw_deactivate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_deactivate_", "");
  await Gateway.updateOne({ name: gwName }, { isActive: false });
  await ctx.answerCallbackQuery({ text: `🔴 OFF` });
  await bot.callbackQuery("adm_gateway_menu", ctx);
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name: gwName });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await bot.callbackQuery("adm_gateway_menu", ctx);
});

// ============================================================
// 👑 ADMINS
// ============================================================
bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;

  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let admins = await getConfig("admins", []);

  let kb = new InlineKeyboard();
  for (let adminId of admins) {
    let adminUser = await User.findOne({ userId: adminId });
    let displayName = adminUser ? (adminUser.firstName || "User") : "Unknown";
    kb.text(`👤 ${displayName} — ${adminId}`, `admin_view_${adminId}`).row();
  }
  kb.text("➕ Add Admin", "admin_add").row();
  kb.text("👑 Transfer Ownership", "admin_transfer").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(
    `👑 *Admins*\n\nOwner: \`${ownerId}\`\nTotal: ${admins.length}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText("➕ Send new admin User ID:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

bot.callbackQuery("admin_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText("👑 Send new owner User ID:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

bot.callbackQuery(/^admin_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_view_", ""), 10);
  let adminUser = await User.findOne({ userId: adminId });
  if (!adminUser) return;

  let kb = new InlineKeyboard()
    .text("🗑️ Remove", `admin_remove_${adminId}`).row()
    .text("🔙 Back", "adm_admins");

  await ctx.editMessageText(
    `👤 ${adminUser.firstName || "Unknown"}\n🆔 \`${adminId}\`\n💰 ₹${adminUser.balance.toFixed(2)}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery(/^admin_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_remove_", ""), 10);
  let admins = await getConfig("admins", []);
  admins = admins.filter(id => Number(id) !== Number(adminId));
  await setConfig("admins", admins);
  cache.admins = admins;
  cache.adminsTime = Date.now();
  await ctx.answerCallbackQuery({ text: "🗑️ Removed!" });
  await bot.callbackQuery("adm_admins", ctx);
});

// ============================================================
// ✅ VERIFICATION
// ============================================================
bot.callbackQuery("adm_verification", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let verifyEnabled = await getConfig("verification_enabled", false);

  let kb = new InlineKeyboard()
    .text(verifyEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(
    `✅ *Verification*\n\nStatus: ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await bot.callbackQuery("adm_verification", ctx);
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
    `⚠️ *RESET ALL BALANCES*\n\nUsers: ${userCount}\n\nThis will reset EVERYONE's balance to ₹0!\n\nConfirm?`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await ctx.editMessageText("✅ *All balances reset to ₹0*", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// 📊 ADD FUND ADMIN MENU
// ============================================================
bot.callbackQuery("adm_addfund_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let pendingCount = await AddFund.countDocuments({ status: "Pending" });

  let kb = new InlineKeyboard()
    .text(`📋 Pending (${pendingCount})`, "addfund_pending").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(
    `📊 *Add Fund (Manual)*\n\nPending: ${pendingCount}`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("addfund_pending", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let pending = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(10);
  if (pending.length === 0) return ctx.reply("📋 No pending.");

  for (let req of pending) {
    let kb = new InlineKeyboard()
      .text("✅ Approve", `af_app_${req.requestId}`)
      .text("❌ Reject", `af_rej_${req.requestId}`);

    let caption = `💰 *#${req.requestId}*\n\n👤 ${req.userName}\n🆔 \`${req.userId}\`\n💵 ₹${req.amount}\n💳 ${req.method}`;

    if (req.proofFileId && !req.proofFileId.startsWith("REFER:")) {
      try { await ctx.replyWithPhoto(req.proofFileId, { caption, parse_mode: "Markdown", reply_markup: kb }); }
      catch (e) { await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb }); }
    } else {
      await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });
    }
  }
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
  req.approvedAt = new Date();
  await req.save();

  let user = await getUser(req.userId);
  user.balance += req.amount;
  await user.save();
  await logBalanceHistory(req.userId, `Add Fund Approved (#${reqId})`, req.amount);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED*`,
    parse_mode: "Markdown"
  }).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `✅ *Add Fund Approved!*\n\n💰 ₹${req.amount} added\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^af_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_rej_", "");
  let req = await AddFund.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  req.approvedAt = new Date();
  await req.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED*`,
    parse_mode: "Markdown"
  }).catch(() => {});
});

// ============================================================
// 📝 PART 3 END
// ============================================================

// ============================================================
// 🚀 FINAL START — Mongoose Connect + Bot Start
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");

    // Clean old config
    let oldChannels = await getConfig("forced_channels", null);
    if (oldChannels && Array.isArray(oldChannels) && oldChannels.length > 0) {
      await setConfig("forced_channels", []);
      console.log("🧹 Old config cleaned!");
    }

    // Init default configs
    await getConfig("auto_upi_id", "nasih@fam");
    await getConfig("auto_upi_min", 5);
    await getConfig("auto_upi_max", 200);
    await getConfig("auto_upi_enabled", true);
    await getConfig("auto_verify_enabled", true);
    await getConfig("manual_verify_enabled", true);
    await getConfig("min_withdraw", 10);
    await getConfig("max_withdraw", 10000);

    // Generate API key if not set
    let apiKey = await getConfig("auto_upi_api_key", null);
    if (!apiKey) {
      apiKey = "KEY_" + crypto.randomBytes(16).toString("hex");
      await setConfig("auto_upi_api_key", apiKey);
      console.log("🔐 Generated new API Key:", apiKey);
    }

    // Start bot
    bot.start({
      onStart: (info) => {
        console.log(`🚀 Bot @${info.username} running!`);
        console.log(`🔐 API Secret Key: ${apiKey}`);
        console.log(`📡 Custom API: POST /api/add-payment`);
        console.log(`📡 Test API: POST /api/test-utr`);
        console.log(`🌐 Mini App: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/miniapp`);
      }
    });
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
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- APPROVE WITHDRAWAL ----------
app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

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

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${wd.details}\n` +
        `🚀Transaction ID ==> ${txnNumber}\n` +
        `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
        `✅Please Check Your ${accountType} Account!`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- REJECT WITHDRAWAL ----------
app.post("/miniapp/api/admin/reject-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

    wd.status = "Rejected";
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    // Refund
    let user = await getUser(wd.userId);
    user.balance += wd.amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
    await user.save();
    await logBalanceHistory(wd.userId, "Withdrawal Refunded", wd.amount);

    try {
      await bot.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- PENDING ADD FUNDS (Manual) ----------
app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, addFunds: afs });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- APPROVE ADD FUND ----------
app.post("/miniapp/api/admin/approve-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

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
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- REJECT ADD FUND ----------
app.post("/miniapp/api/admin/reject-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

    af.status = "Rejected";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    try {
      await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- PENDING TASK SUBMISSIONS ----------
app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, submissions: subs });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- APPROVE SUBMISSION ----------
app.post("/miniapp/api/admin/approve-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

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
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- REJECT SUBMISSION ----------
app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") {
      return res.json({ success: false, error: "Already processed" });
    }

    sub.status = "Rejected";
    await sub.save();

    try {
      await bot.api.sendMessage(sub.userId,
        `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- PENDING UPI DEPOSITS (Manual) ----------
app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try {
    const pending = await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, payments: pending });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- APPROVE UPI DEPOSIT ----------
app.post("/miniapp/api/admin/approve-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Approved") {
      return res.json({ success: false, error: "Already processed" });
    }

    let result = await approveUPIPayment(payment.orderId, payment.utr || "", "MiniApp Admin");
    if (!result) {
      return res.json({ success: false, error: "Failed" });
    }

    try {
      const styledTitle = toSmallCaps("Deposit Auto-Approved!");
      const styledAdded = toSmallCaps("Added:");
      const styledUTR = toSmallCaps("UTR:");

      await bot.api.sendMessage(payment.userId,
        `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${payment.amount}\n🔐 ${styledUTR} ${payment.utr}`,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- REJECT UPI DEPOSIT ----------
app.post("/miniapp/api/admin/reject-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Rejected") {
      return res.json({ success: false, error: "Already processed" });
    }

    payment.status = "Rejected";
    payment.approvedBy = "MiniApp Admin";
    await payment.save();

    try {
      await bot.api.sendMessage(payment.userId,
        `❌ *Deposit Rejected*\n\n💰 ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\``,
        { parse_mode: "Markdown" });
    } catch (e) {}

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ---------- ALL USERS ----------
app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🎉 END OF FILE — Bot + Server + Custom API + Mini App
// ============================================================
console.log("✅ bot.js loaded — Bot + Server + Custom API + Mini App");
