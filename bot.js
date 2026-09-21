// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + GATEWAY SYSTEM
// Complete Working Bot - All Features
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
// 🔄 RERENDER HELPER
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
  gatewayName: { type: String, default: "" },
  gatewayUpi: { type: String, default: "" },
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  referredBy: { type: String, default: "Auto Started" },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const userPreferenceSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  keyboardLayout: { type: Array, default: null },
  inlineMenus: { type: Object, default: {} },
  adminPanelLayout: { type: Array, default: null },
  updatedAt: { type: Date, default: Date.now }
});
const UserPreference = mongoose.models.UserPreference || mongoose.model("UserPreference", userPreferenceSchema);

const botAdminSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: Number, default: null },
  isActive: { type: Boolean, default: true },
  disabledAt: { type: Date, default: null },
  disabledBy: { type: Number, default: null }
});
const BotAdmin = mongoose.models.BotAdmin || mongoose.model("BotAdmin", botAdminSchema);

const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  reward: { type: Number, required: true },
  link: { type: String, required: true },
  taskType: { type: String, default: "photo" },
  timeLimitMinutes: { type: Number, default: 0 },
  alertEnabled: { type: Boolean, default: true },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now }
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

const adminLogSchema = new mongoose.Schema({
  adminId: { type: Number, required: true },
  adminName: { type: String, default: "" },
  action: { type: String, required: true },
  details: { type: String, default: "" },
  amount: { type: Number, default: 0 },
  targetUserId: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AdminLog = mongoose.models.AdminLog || mongoose.model("AdminLog", adminLogSchema);

async function logAdminAction(adminId, adminName, action, details = "", amount = 0, targetUserId = null) {
  try {
    await AdminLog.create({ adminId, adminName, action, details, amount, targetUserId });
  } catch (e) {
    console.error("logAdminAction:", e.message);
  }
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
  status: { type: String, default: "Pending" },
  source: { type: String, default: "bot" },
  verifiedAt: { type: Date, default: null },
  approvedBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const UPIPayment = mongoose.models.UPIPayment || mongoose.model("UPIPayment", upiPaymentSchema);

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
  type: { type: String, default: "deposit" },
  isActive: { type: Boolean, default: false },
  token: { type: String, default: "" },
  key: { type: String, default: "" },
  payto: { type: String, default: "" },
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
const RedeemRequest = mongoose.models.RedeemRequest || mongoose.model("RedeemRequest", redeemRequestSchema);

const withdrawSettingsSchema = new mongoose.Schema({
  method: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  minAmount: { type: Number, default: 10 },
  maxAmount: { type: Number, default: 10000 },
  taxPercent: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});
const WithdrawSettings = mongoose.models.WithdrawSettings || mongoose.model("WithdrawSettings", withdrawSettingsSchema);

const liveFundSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main_fund" },
  totalFund: { type: Number, default: 0 },
  usedFund: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
const LiveFund = mongoose.models.LiveFund || mongoose.model("LiveFund", liveFundSchema);

const broadcastSchema = new mongoose.Schema({
  broadcastId: { type: String, required: true, unique: true },
  adminId: { type: Number, required: true },
  adminName: { type: String, default: "" },
  messageType: { type: String, default: "text" },
  content: { type: String, default: "" },
  fileId: { type: String, default: "" },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  timeTaken: { type: Number, default: 0 },
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});
const Broadcast = mongoose.models.Broadcast || mongoose.model("Broadcast", broadcastSchema);

const newUserLogSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  firstName: { type: String, default: "" },
  username: { type: String, default: "" },
  startTime: { type: Date, default: Date.now }
});
const NewUserLog = mongoose.models.NewUserLog || mongoose.model("NewUserLog", newUserLogSchema);

// ============================================================
// 🔧 HELPERS & FUNCTIONS
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
  } catch (e) { return false; }
}

async function isAdminDisabled(userId) {
  try {
    let botAdmin = await BotAdmin.findOne({ userId, isActive: false });
    return !!botAdmin;
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

function halfMaskUPI(upi) {
  if (!upi || upi === "Not Set") return upi;
  let str = String(upi).trim();
  let parts = str.split('@');
  if (parts.length !== 2) {
    if (str.length <= 4) return str.substring(0, 1) + '***';
    return str.substring(0, 3) + '***' + str.substring(str.length - 2);
  }
  let name = parts[0];
  let domain = parts[1];
  let maskedName = name.length <= 3 ? name.substring(0, 1) + '***' : name.substring(0, 3) + '***';
  return `${maskedName}@${domain}`;
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

function halfMaskBank(accNo) {
  if (!accNo || accNo === "Not Set") return accNo;
  let str = String(accNo).trim();
  if (str.length <= 6) return str.substring(0, 2) + '***';
  return str.substring(0, 4) + '***' + str.substring(str.length - 4);
}

function halfMaskWallet(wallet) {
  if (!wallet || wallet === "Not Set") return wallet;
  let str = String(wallet).trim();
  if (str.length <= 6) return str.substring(0, 2) + '***';
  return str.substring(0, 4) + '***' + str.substring(str.length - 2);
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

function halfMaskDetails(method, details) {
  if (method === "UPI") return halfMaskUPI(details);
  if (method === "Bank") {
    let parts = String(details).split(',').map(s => s.trim());
    let maskedAcc = halfMaskBank(parts[0]);
    return maskedAcc + (parts[1] ? ` (${parts[1]})` : '');
  }
  if (method === "Wallet") return halfMaskWallet(details);
  if (method === "Amazon") return halfMaskUPI(details);
  return halfMaskUPI(details);
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

function convertOwnerLink(input) {
  let str = String(input || "").trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('tg://')) return str;
  if (str.startsWith('@')) return `https://t.me/${str.substring(1)}`;
  if (/^\d+$/.test(str)) return `tg://user?id=${str}`;
  return `https://t.me/${str}`;
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
// 📝 DEFAULT CONFIG
// ============================================================
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: "📋 BOT TASK",        key: "btn_tasks",    row: 0 },
  { name: "💸 MY BALANCE",      key: "btn_balance",  row: 0 },
  { name: "🎁 GIFT CODE",       key: "btn_gift",     row: 1 },
  { name: "⚡ QUICK PAY",        key: "btn_quickpay", row: 1 },
  { name: "💳 PAYOUT METHOD",   key: "btn_payout",   row: 2 },
  { name: "🚀 WITHDRAW",        key: "btn_withdraw", row: 2 }
];

const DEFAULT_ADMIN_PANEL_LAYOUT = [
  { name: "👮 Add/Remove Admins Permission", key: "adm_permissions",   row: 0 },
  { name: "👑 Transfer Ownership",           key: "adm_transfer",      row: 1 },
  { name: "💰 Set Withdraw Tax",             key: "adm_set_wd_tax",    row: 1 },
  { name: "💠 Verification Mode",            key: "adm_verification_mode", row: 2 },
  { name: "👮 Manage Admins",                key: "adm_admins",        row: 2 },
  { name: "🚫 Manage Ban Users",             key: "adm_manage_ban",    row: 3 },
  { name: "🤖 Bot Status",                   key: "adm_bot_status",    row: 3 },
  { name: "✅ Verify User",                  key: "adm_verify_user",   row: 4 },
  { name: "🚫 Manage Ban Wallet",            key: "adm_manage_ban_wallet", row: 4 },
  { name: "💸 Withdraw Status",              key: "adm_wd_status",     row: 5 },
  { name: "➕ Add Balance",                  key: "adm_add_bal",       row: 5 },
  { name: "➖ Remove Balance",               key: "adm_rem_bal",       row: 6 },
  { name: "⚡ Manage Your Channels",         key: "adm_manage_channels", row: 6 },
  { name: "⚠️ Reset Balance",                key: "adm_reset_all_bal", row: 7 },
  { name: "🎨 Customize Your Theme",         key: "adm_customize_theme", row: 7 },
  { name: "💳 Manage Add Fund",              key: "adm_addfund_menu",  row: 8 },
  { name: "📢 Broadcast",                    key: "adm_broadcast",     row: 8 },
  { name: "💬 Talk With User",               key: "adm_talk_user",     row: 9 },
  { name: "📊 Manage Withdraw",              key: "adm_manage_withdraw", row: 9 },
  { name: "🔍 Find User Details",            key: "adm_find_user",     row: 10 },
  { name: "📊 Status",                       key: "adm_status",        row: 10 },
  { name: "🆕 New Users",                    key: "adm_new_users",     row: 11 },
  { name: "⚡ Quick Pay",                    key: "adm_quick_pay",     row: 11 },
  { name: "🔗 Gateway Steps",                key: "adm_gateway_menu",  row: 12 },
  { name: "🎁 Gift Codes",                   key: "adm_create_gift",   row: 12 },
  { name: "🔔 New User Notification",        key: "adm_user_notif",    row: 13 },
  { name: "🎁 Manage Redeem Codes",          key: "adm_redeem",        row: 13 },
  { name: "📧 Manage Amazon Codes",          key: "adm_amazon",        row: 14 },
  { name: "📋 Manage Tasks",                 key: "adm_tasks_manager", row: 14 },
  { name: "🚀 Recent Admin Actions",         key: "adm_recent_actions", row: 15 },
  { name: "🔄 Refresh Panel",                key: "admin",             row: 15 }
];

const DEFAULT_BALANCE_TEXT = {
  welcome: "⭐ Welcome To Bot!",
  walletId: "🔵 Wallet ID ➝",
  balance: "🧾 Balance ➝",
  footer: "❝ Built with security you can Trust.\nSupport that responds promptly ❞"
};

const INLINE_STYLE_COLORS = {
  primary: { label: "Blue",  emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger:  { label: "Red",   emoji: "🔴" },
  white:   { label: "White", emoji: "⚪" }
};

const STYLE_COLORS = INLINE_STYLE_COLORS;

// ============================================================
// 🔧 BUILD KEYBOARD HELPERS
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

async function buildStyledKb(buttons, userId = null) {
  let styleMap = await getConfig("inline_button_styles", {});
  let names = await getConfig("inline_button_names", {});

  if (userId) {
    let userPref = await UserPreference.findOne({ userId });
    if (userPref && userPref.inlineMenus && userPref.inlineMenus.styles) {
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

async function getCurrentKeyboardLayoutForUser(userId) {
  let userPref = await UserPreference.findOne({ userId });
  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    return userPref.keyboardLayout;
  }
  return await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
}

async function getCurrentAdminPanelLayout() {
  return await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
}

async function isWithdrawEnabled(method) {
  let setting = await WithdrawSettings.findOne({ method: method.toLowerCase() });
  if (setting) return setting.isActive;
  let toggles = await getConfig("withdraw_toggles", { wallet: true, upi: true, bank: true });
  return toggles[method.toLowerCase()] !== false;
}

async function saveUserKeyboard(userId, layout) {
  await UserPreference.findOneAndUpdate(
    { userId },
    { keyboardLayout: layout, updatedAt: new Date() },
    { upsert: true }
  );
}

async function saveUserAdminPanelLayout(userId, layout) {
  await UserPreference.findOneAndUpdate(
    { userId },
    { adminPanelLayout: layout, updatedAt: new Date() },
    { upsert: true }
  );
}

// ✅ NEW — Check if Gateway (Ultra Pay) is linked
async function isGatewayLinked() {
  try {
    let gw = await Gateway.findOne({ name: "ULTRAPAY" });
    if (gw && gw.token && gw.key && gw.isActive) return true;
    let urlGw = await Gateway.findOne({ name: "URL_GATEWAY" });
    if (urlGw && urlGw.url && urlGw.isActive) return true;
    return false;
  } catch (e) { return false; }
}

// ✅ NEW — Get active gateway (Ultra Pay or URL Gateway)
async function getActiveGateway() {
  try {
    let gw = await Gateway.findOne({ name: "ULTRAPAY", isActive: true });
    if (gw && gw.token && gw.key) return gw;
    let urlGw = await Gateway.findOne({ name: "URL_GATEWAY", isActive: true });
    if (urlGw && urlGw.url) return urlGw;
    return null;
  } catch (e) { return null; }
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
    let ownerName = await getConfig("owner_display_name", null);
    let ownerLink = await getConfig("owner_display_link", null);

    if (!ownerName) {
      let ownerUser = await User.findOne({ userId: ownerId });
      ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    }
    if (!ownerLink) {
      ownerLink = ownerId.toString();
    }

    let finalOwnerLink = convertOwnerLink(ownerLink);

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
      .amount-val{font-size:32px;font-weight:bold;margin-top:8px;cursor:pointer;user-select:all;}
      .info-row{background:#151a21;border-radius:10px;padding:12px 15px;margin-top:10px;display:flex;justify-content:space-between;font-size:13px;gap:10px;}
      .info-title{color:#8a9ba8;flex-shrink:0;}
      .info-value{color:#fff;font-weight:500;text-align:right;word-break:break-all;cursor:pointer;user-select:all;}
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
      <div class="card-box"><div class="amount-label">WITHDRAWAL AMOUNT</div><div class="amount-val" onclick="copyText('${wd.amount.toFixed(2)}')">₹ ${wd.amount.toFixed(2)}</div></div>
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${escapeHtml(wd.method.toUpperCase())}</span></div>
      <div class="info-row"><span class="info-title">DESTINATION</span><span class="info-value" onclick="copyText('${escapeHtml(wd.details)}')">${escapeHtml(wd.details)}</span></div>
      <div class="info-row"><span class="info-title">TXN ID</span><span class="info-value mono" onclick="copyText('${escapeHtml(displayTxn)}')">${escapeHtml(displayTxn)}</span></div>
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value mono" onclick="copyText('TXN${escapeHtml(wd.withdrawalId)}')">TXN${escapeHtml(wd.withdrawalId)}</span></div>
      <div class="info-row"><span class="info-title">GATEWAY</span><span class="info-value">${escapeHtml(gatewayDisplay)}</span></div>
      <div class="info-row"><span class="info-title">APPROVED BY</span><span class="info-value" onclick="copyText('${escapeHtml(approvedBy)}')">${escapeHtml(approvedBy)}</span></div>
      <div class="info-row"><span class="info-title">DATE</span><span class="info-value" onclick="copyText('${displayDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}')">${displayDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
      <div style="margin-top:15px;"><span class="status-badge status-${wd.status.toLowerCase()}">${wd.status.toUpperCase()}</span></div>
      <button class="close-btn" onclick="window.close()">CLOSE & RETURN</button>
      <div class="provider-footer">
        <div class="provider-text">Provided by <a href="${finalOwnerLink}" class="provider-name" target="_blank">${escapeHtml(ownerName)}</a></div>
      </div>
    </div>
    <script>
      function copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
          let t = document.createElement('div');
          t.textContent = '✅ Copied!';
          t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#00ffcc;color:#000;padding:10px 20px;border-radius:10px;font-weight:bold;z-index:9999;';
          document.body.appendChild(t);
          setTimeout(() => t.remove(), 1500);
        });
      }
    </script>
    </body></html>`;
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
      utr: cleanUtr, amount: amt, status: "UNUSED",
      source: "MacroDroid", rawSms: raw_sms || ""
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
// 🌐 GATEWAY PAYMENT PROCESSOR (Ultra Pay + URL Gateway)
// ============================================================
async function processGatewayPayment(data) {
  const {
    gatewayKey, upi = '', wallet = '', number = '',
    amount = 0, comment = 'Telegram Transaction',
    userId = '', orderId = '', txnId = '', timestamp = Date.now()
  } = data;

  let gateway = await Gateway.findOne({ name: gatewayKey, isActive: true });
  if (!gateway || !gateway.url) {
    return { status: 'error', message: 'Gateway missing or inactive.' };
  }

  // Build URL from placeholders
  let finalUrl = gateway.url
    .replace(/{number}/g, encodeURIComponent(number))
    .replace(/{wallet}/g, encodeURIComponent(wallet || number))
    .replace(/{upi}/g, encodeURIComponent(upi || number))
    .replace(/{amount}/g, encodeURIComponent(amount))
    .replace(/{comment}/g, encodeURIComponent(comment))
    .replace(/{userId}/g, encodeURIComponent(userId))
    .replace(/{orderId}/g, encodeURIComponent(orderId))
    .replace(/{txnId}/g, encodeURIComponent(txnId))
    .replace(/{timestamp}/g, encodeURIComponent(timestamp))
    .replace(/{token}/g, encodeURIComponent(gateway.token || ''))
    .replace(/{key}/g, encodeURIComponent(gateway.key || ''))
    .replace(/{payto}/g, encodeURIComponent(gateway.payto || ''));

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
      json.status === 'success' || json.status === 'Success' ||
      json.status === 'SUCCESS' || json.success === true;

    if (isSuccess) {
      return {
        status: 'success',
        data: json,
        txnNumber: json.txn_id || json.txnNumber || json.transaction_id || null,
        rawResponse: text
      };
    }
    return { status: 'failed', message: json.message || json.error || 'Gateway failed', data: json, rawResponse: text };
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
app.get("/miniapp/history", (req, res) => res.sendFile(path.join(__dirname, "public", "history.html")));

// ============================================================
// 📱 MINI APP — USER APIs
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
        redeemCodeAddr: user.redeemCodeAddr,
        gatewayName: user.gatewayName,
        gatewayUpi: user.gatewayUpi,
        isBanned: user.isBanned
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
    let isOwnerUser = await isOwner(userId);
    res.json({ success: true, isAdmin: isAdminUser, isOwner: isOwnerUser });
  } catch (e) { res.json({ success: false, isAdmin: false }); }
});

app.get("/miniapp/api/config", async (req, res) => {
  try {
    const config = {
      appLogo: await getConfig("app_logo", "Task Earn Bot"),
      btn_home: await getConfig("btn_home", "HOME"),
      btn_task: await getConfig("btn_task", "TASK"),
      btn_pay: await getConfig("btn_pay", "PAY"),
      btn_profile: await getConfig("btn_profile", "PROFILE"),
      botUsername: await getConfig("bot_username", ""),
      minWithdraw: await getConfig("min_withdraw", 10),
      maxWithdraw: await getConfig("max_withdraw", 10000),
      supportUsername: await getConfig("support_username", "Not Set"),
      ownerId: await getConfig("owner_id", MAIN_OWNER_ID),
      ownerDisplayName: await getConfig("owner_display_name", null),
      ownerDisplayLink: await getConfig("owner_display_link", null)
    };
    res.json({ success: true, config });
  } catch (e) { res.json({ success: false, error: e.message }); }
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

// ============================================================
// ⚡ QUICK PAY API (Mini App)
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
    if (receiver.isBanned) return res.json({ success: false, error: "Receiver is banned" });

    const isAdminUser = await isAdmin(sId);
    if (!isAdminUser && sender.balance < amt) {
      return res.json({ success: false, error: "Insufficient balance" });
    }

    const taxEnabled = await getConfig("quick_pay_tax_enabled", false);
    const taxPercent = await getConfig("quick_pay_tax_percent", 0);
    let taxAmount = 0;
    let receiverAmount = amt;
    if (taxEnabled && taxPercent > 0) {
      taxAmount = (amt * taxPercent) / 100;
      receiverAmount = amt - taxAmount;
    }

    let wasNegative = sender.balance < amt;

    sender.balance -= amt;
    receiver.balance += receiverAmount;
    await sender.save();
    await receiver.save();

    if (taxAmount > 0) {
      const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
      await User.findOneAndUpdate({ userId: ownerId }, { $inc: { balance: taxAmount } });
      await logBalanceHistory(ownerId, `Quick Pay Tax from ${sId}`, taxAmount);
    }

    if (isAdminUser && wasNegative) {
      await logBalanceHistory(sId, `Admin Add Fund - Quick Pay to ${rId}`, -amt);
    } else if (isAdminUser) {
      await logBalanceHistory(sId, `Admin Quick Pay to ${rId}`, -amt);
    } else {
      await logBalanceHistory(sId, `Quick Pay to ${rId}${taxAmount > 0 ? ` (Tax: ₹${taxAmount.toFixed(2)})` : ''}`, -amt);
    }
    await logBalanceHistory(rId, `Quick Pay from ${isAdminUser ? "Admin" : sId}`, receiverAmount);

    try {
      await bot.api.sendMessage(rId,
        `🎉 *Payment Received!*\n\n` +
        `👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n` +
        `🆔 \`${sId}\`\n` +
        `💰 ₹${receiverAmount.toFixed(2)}${taxAmount > 0 ? ` (Tax: ₹${taxAmount.toFixed(2)})` : ''}\n\n` +
        `💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) { }

    res.json({ success: true, newBalance: sender.balance, wasNegative, isAdmin: isAdminUser, tax: taxAmount });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

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
// 🌐 GATEWAY APIs (Mini App)
// ============================================================
app.get("/miniapp/api/gateways", async (req, res) => {
  try {
    const type = req.query.type || "deposit";
    let gateways;
    if (type === "all") {
      gateways = await Gateway.find({ isActive: true });
    } else {
      gateways = await Gateway.find({ isActive: true, type: { $in: [type, "both"] } });
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
    if (name && !user.gatewayName) user.gatewayName = name.trim();
    if (upi) {
      user.gatewayUpi = upi.trim();
      if (!user.walletAccount || user.walletAccount === "Not Set") user.walletAccount = upi.trim();
    }
    await user.save();

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
      user.balance += amt;
      await user.save();
      await logBalanceHistory(uid, `Gateway Deposit (${gatewayKey})`, amt);

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

      try {
        const styledTitle = toSmallCaps("Deposit Auto-Approved!");
        const styledAdded = toSmallCaps("Added:");
        await bot.api.sendMessage(uid,
          `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${amt}\n🌐 Gateway: ${gatewayKey}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
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
// 💠 UPI SETTINGS + VERIFY APIs
// ============================================================
app.get("/miniapp/api/upi-settings", async (req, res) => {
  try {
    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    const upiId = await getConfig("auto_upi_id", "nasih@fam");
    const enabled = await getConfig("auto_upi_enabled", true);
    res.json({ success: true, min: minAmt, max: maxAmt, upiId, enabled });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
// 📜 USER HISTORY API
// ============================================================
app.get("/miniapp/api/user/:userId/history", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit, 10) || 100;
    const [withdrawals, deposits, transfers, balanceHistory] = await Promise.all([
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(100),
      UPIPayment.find({ userId, status: "Approved" }).sort({ createdAt: -1 }).limit(100),
      BalanceHistory.find({ userId, action: { $regex: /Quick Pay|Admin Quick Pay/i } }).sort({ createdAt: -1 }).limit(100),
      BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(200)
    ]);
    let allHistory = [];
    withdrawals.forEach(w => {
      allHistory.push({
        action: `Withdrawal (${w.method})`,
        amount: -w.amount,
        status: w.status === "Approved" ? "success" : (w.status === "Rejected" ? "failed" : "pending"),
        detail: `To: ${w.details}`,
        txnId: w.txnNumber || w.withdrawalId,
        createdAt: w.createdAt
      });
    });
    deposits.forEach(d => {
      allHistory.push({
        action: `Deposit (${d.source || "UPI"})`,
        amount: d.amount, status: "success",
        detail: d.utr ? `UTR: ${d.utr}` : "",
        txnId: d.orderId, createdAt: d.createdAt
      });
    });
    transfers.forEach(t => {
      let isSent = t.amount < 0;
      allHistory.push({
        action: isSent ? "Payment Sent" : "Payment Received",
        amount: t.amount, status: "success",
        detail: t.action, txnId: "", createdAt: t.createdAt
      });
    });
    balanceHistory.forEach(b => {
      if (b.action.match(/Withdrawn|Quick Pay|Deposit|UPI Deposit/i)) return;
      allHistory.push({
        action: b.action, amount: b.amount,
        status: "success", detail: "", txnId: "", createdAt: b.createdAt
      });
    });
    allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let paginated = allHistory.slice(0, limit);
    res.json({ success: true, history: paginated, total: allHistory.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 👑 MINI APP ADMIN APIs
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
    wd.status = "Approved";
    wd.txnNumber = txnNumber;
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    await LiveFund.findOneAndUpdate(
      { key: "main_fund" },
      { $inc: { usedFund: wd.amount } },
      { upsert: true }
    );

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

app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
        `✅ *Add Fund Approved!*\n\n💰 ₹${af.amount}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
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
      await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}`);
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
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try {
    const pending = await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, payments: pending });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
      welcome_channel_link: await getConfig("welcome_channel_link", ""),
      auto_upi_id: await getConfig("auto_upi_id", "nasih@fam"),
      auto_upi_min: await getConfig("auto_upi_min", 5),
      auto_upi_max: await getConfig("auto_upi_max", 200),
      auto_verify_enabled: await getConfig("auto_verify_enabled", true),
      manual_verify_enabled: await getConfig("manual_verify_enabled", true),
      quick_pay_tax_enabled: await getConfig("quick_pay_tax_enabled", false),
      quick_pay_tax_percent: await getConfig("quick_pay_tax_percent", 0)
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
      "welcome_channel_link", "auto_upi_id", "auto_upi_min", "auto_upi_max",
      "auto_verify_enabled", "manual_verify_enabled",
      "quick_pay_tax_enabled", "quick_pay_tax_percent"
    ];
    if (!allowed.includes(key)) return res.json({ success: false, error: "Invalid key" });
    await setConfig(key, value);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
      await NewUserLog.findOneAndUpdate(
        { userId },
        { firstName: ctx.from.first_name || "", username: ctx.from.username || "", startTime: new Date() },
        { upsert: true }
      );

      let nameStr = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim() || "No Name";
      let usernameStr = ctx.from.username ? `@${ctx.from.username}` : "No Username";
      let notifMsg =
        `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n💰 ₹${user.balance.toFixed(2)}\n📅 ${new Date().toLocaleString('en-IN')}`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      let newUserNotif = await getConfig("new_user_notif", true);
      if (newUserNotif) {
        try { await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb }); } catch (e) {}
      }
    }

    if (user.isBanned) return ctx.reply("❌ You are banned from using this bot.");

    let botActive = await getConfig("bot_active", true);
    if (!botActive) {
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser) {
        let botOffText = await getConfig("bot_off_text", "🤖 Bot is currently OFF\n\nPlease try again later.");
        return ctx.reply(botOffText);
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
      return ctx.reply("⚠️ *You must join our channels to use this bot!*", { reply_markup: keyboard, parse_mode: "Markdown" });
    }

    let welcomeChannelLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

    let welcomeText =
      `💫 <b>Welcome To Task Payment Bot!</b>\n\n` +
      `To Know How To Earn → <a href="${welcomeChannelLink}">CLICK HERE</a>`;

    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(userId), parse_mode: "HTML" });
    } catch (htmlErr) {
      await ctx.reply(`👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome!`, { reply_markup: await buildKeyboardFromLayout(userId) });
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
  await ctx.reply("👋 Welcome!", { reply_markup: await buildKeyboardFromLayout(ctx.from.id) });
});

// ============================================================
// 💾 SAVE CODES HELPER
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
    if (text === "❌ Cancel") {
      delete userState[userId];
      await ctx.reply("❌ Cancelled.", { reply_markup: await buildKeyboardFromLayout(userId) });
      return;
    }

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
      if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format!");
      let user = await getUser(userId);
      user.gatewayUpi = upi;
      if (!user.walletAccount || user.walletAccount === "Not Set") user.walletAccount = upi;
      await user.save();
      return ctx.reply(`✅ UPI saved: <code>${upi}</code>`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
    }

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
        `✅ Amount Set: ₹${amt}\n\n📱 Pay to UPI: \`${upiId}\`\n${styledTap}\n\n🔐 ${styledEnter}\n\n🆔 Order: \`${orderId}\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel") }
      );
    }

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
      if (!autoEnabled && !manualEnabled) return ctx.reply("❌ Add Fund temporarily disabled.");
      let user = await getUser(userId);
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
            `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${amount}\n🔐 ${styledUTR} ${utr}`,
            { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) }
          );
          return;
        }
        if (!manualEnabled) {
          return ctx.reply(`❌ *Payment Not Found*\n\nUTR: \`${utr}\``, { parse_mode: "Markdown" });
        }
      }
    }

    if (state === "WD_ADD_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format!");
      let user = await getUser(userId);
      user.upiId = upi;
      await user.save();
      return ctx.reply(`✅ UPI Saved!\n\n📌 <code>${upi}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Withdraw Now", "wd_upi").row().text("🔙 Main Menu", "back_to_balance") });
    }
    if (state === "WD_ADD_WALLET") {
      delete userState[userId];
      let wallet = text.trim();
      let user = await getUser(userId);
      user.walletAccount = wallet;
      await user.save();
      return ctx.reply(`✅ Wallet Saved!\n\n📌 <code>${wallet}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Withdraw Now", "wd_wallet").row().text("🔙 Main Menu", "back_to_balance") });
    }
    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`✅ Account: <code>${text.trim()}</code>\n\n📝 Send IFSC Code:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") });
    }
    if (state.startsWith("WD_ADD_BANK_IFSC_")) {
      let accNo = state.replace("WD_ADD_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      let user = await getUser(userId);
      user.bankAccNo = accNo;
      user.bankIfsc = ifsc;
      await user.save();
      return ctx.reply(`✅ Bank Saved!\n\n🏦 <code>${accNo}</code>\n🔢 <code>${ifsc}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Withdraw Now", "wd_bank").row().text("🔙 Main Menu", "back_to_balance") });
    }

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
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser && sender.balance < amt) {
        return ctx.reply(`❌ *Insufficient Balance!*\n\n💵 Your: ₹${sender.balance.toFixed(2)}\n💰 Required: ₹${amt}`, { parse_mode: "Markdown" });
      }
      let cacheObj = global.quickPayCache?.[userId];
      if (!cacheObj) return ctx.reply("❌ Session expired!");
      let receiver = await User.findOne({ userId: cacheObj.receiverId });
      if (!receiver) return ctx.reply("❌ Receiver not found!");
      userState[userId] = `QP_CONFIRM_${cacheObj.receiverId}_${amt}`;

      let taxEnabled = await getConfig("quick_pay_tax_enabled", false);
      let taxPercent = await getConfig("quick_pay_tax_percent", 0);
      let taxAmt = 0;
      if (taxEnabled && taxPercent > 0) taxAmt = (amt * taxPercent) / 100;
      let receiverAmt = amt - taxAmt;

      let msg = `⚠️ Confirm Payment\n\n👤 ${receiver.firstName || "User"}\n🆔 <code>${receiver.userId}</code>\n💰 Amount: ₹${amt}`;
      if (taxAmt > 0) msg += `\n💸 Tax (${taxPercent}%): ₹${taxAmt.toFixed(2)}`;
      msg += `\n\n📊 Balance Update:\n💵 Your: ₹${sender.balance.toFixed(2)} → ₹${(sender.balance - amt).toFixed(2)}\n💰 Receiver: ₹${receiver.balance.toFixed(2)} → ₹${(receiver.balance + receiverAmt).toFixed(2)}`;

      return ctx.reply(msg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("✅ Confirm", "qp_confirm").text("❌ Cancel", "qp_cancel")
      });
    }

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
  }

  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

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

      return await ctx.reply(msg, {
        reply_markup: await buildStyledKb(buttons, userId),
        parse_mode: "HTML"
      });
    } catch (err) {
      return ctx.reply(`❌ Error: ${err.message}`);
    }
  }
  else if (matchedKey === "btn_tasks" || /task/i.test(text)) {
    try {
      let tasks = await Task.find({});
      if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available.");
      let taskButtons = [];
      tasks.forEach(t => {
        taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]);
      });
      return ctx.reply("📋 *Available Tasks:*", {
        reply_markup: await buildStyledKb(taskButtons, userId),
        parse_mode: "Markdown"
      });
    } catch (e) {
      return ctx.reply("❌ Error loading tasks.");
    }
  }
  else if (matchedKey === "btn_gift" || /gift/i.test(text)) {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code To Claim Reward!");
  }
  else if (matchedKey === "btn_quickpay" || /quick.*pay/i.test(text)) {
    userState[userId] = "QP_WAIT_USERID";
    return ctx.reply(`💸 *Quick Pay*\n\n📱 Send Receiver User ID:`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel")
    });
  }
  else if (matchedKey === "btn_payout" || /payout.*method/i.test(text)) {
    // ✅ NEW — Only show Wallet if Gateway (Token + Key) is configured
    let gatewayLinked = await isGatewayLinked();
    let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `\`${val}\`` : `\`Not Set\``;

    let msg = `✨ *Choose Payout Method*\n\n`;
    let buttons = [];

    if (gatewayLinked) {
      let activeGw = await getActiveGateway();
      let gwName = activeGw ? activeGw.name : "Ultra Pay";
      msg += `⚡ *${gwName}* - ${fmt(user.gatewayUpi || user.walletAccount)}\n\n`;
      msg += `👛 *Wallet* - ${fmt(user.walletAccount)}\n\n`;
      buttons.push([{ text: `⚡ ${gwName}`, callback_data: "set_gateway_upi" }]);
    }

    msg += `⚡ *UPI* - ${fmt(user.upiId)}\n\n`;
    msg += `🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}`;

    let row = [];
    if (gatewayLinked) row.push({ text: "🌐 Wallet", callback_data: "set_wallet" });
    row.push({ text: "⚡ UPI", callback_data: "set_upi" });
    buttons.push(row);
    buttons.push([{ text: "🏦 Bank", callback_data: "set_bank" }]);

    return ctx.reply(msg, {
      reply_markup: await buildStyledKb(buttons, userId),
      parse_mode: "Markdown"
    });
  }
  else if (matchedKey === "btn_withdraw" || /withdraw/i.test(text)) {
    // ✅ NEW — Only show Wallet if Gateway linked
    let gatewayLinked = await isGatewayLinked();
    let buttons = [];

    if (gatewayLinked) {
      let activeGw = await getActiveGateway();
      let gwName = activeGw ? activeGw.name : "Ultra Pay";
      buttons.push([{ text: `⚡ ${gwName}`, callback_data: `wd_gateway_withdraw` }]);
    }

    let upiOn = await isWithdrawEnabled("upi");
    let bankOn = await isWithdrawEnabled("bank");
    buttons.push([
      { text: `${upiOn ? "⚡ UPI" : "🔴 UPI OFF"}`, callback_data: "wd_upi" },
      { text: `${bankOn ? "🏦 Bank" : "🔴 Bank OFF"}`, callback_data: "wd_bank" }
    ]);

    if (gatewayLinked) {
      buttons.push([{ text: "🌐 Wallet", callback_data: "wd_wallet" }]);
    }

    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, {
      reply_markup: await buildStyledKb(buttons, userId),
      parse_mode: "Markdown"
    });
  }
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
      `${welcomeText}\n\n<blockquote>${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}</blockquote>\n\n<blockquote>${footerText}</blockquote>`;
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
    await ctx.editMessageText(msg, { reply_markup: await buildStyledKb(buttons, userId), parse_mode: "HTML" }).catch(() => {});
  } catch (e) {}
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery();
  try {
    let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    let msg =
      `${welcomeText}\n\n<blockquote>${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n${DEFAULT_BALANCE_TEXT.balance} ₹${user.balance.toFixed(2)}</blockquote>\n\n<blockquote>${footerText}</blockquote>`;
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
    await ctx.editMessageText(msg, { reply_markup: await buildStyledKb(buttons, userId), parse_mode: "HTML" }).catch(() => {});
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

  let liveFund = await LiveFund.findOne({ key: "main_fund" });
  let fundText = "";
  if (liveFund && liveFund.isActive) {
    let running = (liveFund.totalFund || 0) - (liveFund.usedFund || 0);
    fundText = `\n\n💠 *Live Fund:*\n💰 Set Fund: ₹${(liveFund.totalFund || 0).toFixed(2)}\n📉 Running: ₹${running.toFixed(2)}\n📊 Used: ₹${(liveFund.usedFund || 0).toFixed(2)}`;
  }

  let msg = `💰 *Live Fund Report*\n\n👥 Users: \`${users.length}\`\n💵 Total: \`₹${totalBalance.toFixed(2)}\`${fundText}`;
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
    `💠 ${styledTitle}\n\n✨ ${styledEnter}\n${styledMust} ₹${minAmt} ᴀɴᴅ ₹${maxAmt}\n\n📌 UPI: \`${upiId}\``;
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
// 🎯 TASK DO / APPROVE / REJECT
// ============================================================
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "❌ Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) {
    return ctx.answerCallbackQuery({ text: "❌ Already completed!", show_alert: true });
  }
  await ctx.answerCallbackQuery();

  let taskType = task.taskType || "photo";
  if (taskType === "refer") {
    userState[userId] = `TASK_REFER_${taskId}`;
    await ctx.editMessageText(
      `📋 *${task.title}*\n💰 Reward: ₹${task.reward}\n🔗 Link: ${task.link}\n\n📝 Send your referral code/ID:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task") }
    );
  } else {
    userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;
    await ctx.editMessageText(
      `📋 *${task.title}*\n💰 Reward: ₹${task.reward}\n🔗 Link: ${task.link}\n\n📸 Complete the task and send screenshot:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task") }
    );
  }
});

bot.callbackQuery("canc_task", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Approved", `${sub.taskTitle}`, sub.reward, sub.userId);
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Rejected", `${sub.taskTitle}`, sub.reward, sub.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ REJECTED`,
  }).catch(() => {});
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "UPI Deposit Approved", `₹${payment.amount}`, payment.amount, payment.userId);
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n✅ <b>APPROVED</b>`, { parse_mode: "HTML" }).catch(() => {});
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
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ <b>REJECTED</b>`, { parse_mode: "HTML" }).catch(() => {});
});

// ============================================================
// ⚡ QUICK PAY CONFIRM
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
  if (!isAdminUser && sender.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  await ctx.answerCallbackQuery({ text: "⏳ Sending..." });

  const taxEnabled = await getConfig("quick_pay_tax_enabled", false);
  const taxPercent = await getConfig("quick_pay_tax_percent", 0);
  let taxAmount = 0;
  let receiverAmount = amount;
  if (taxEnabled && taxPercent > 0) {
    taxAmount = (amount * taxPercent) / 100;
    receiverAmount = amount - taxAmount;
  }

  let senderBefore = sender.balance;
  let receiverBefore = receiver.balance;

  sender.balance -= amount;
  receiver.balance += receiverAmount;
  await sender.save();
  await receiver.save();

  await logBalanceHistory(sender.userId, `Quick Pay to ${receiver.userId}`, -amount);
  await logBalanceHistory(receiver.userId, `Quick Pay from ${sender.userId}`, receiverAmount);

  let successMsg =
    `✅ *QUICK PAY SUCCESSFUL*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *To:* ${receiver.firstName || "User"}\n` +
    `🆔 \`${receiver.userId}\`\n\n` +
    `💰 *Amount:* ₹${amount.toFixed(2)}\n` +
    `\n💵 *Your Balance:* ₹${senderBefore.toFixed(2)} → ₹${sender.balance.toFixed(2)}\n` +
    `💰 *Receiver:* ₹${receiverBefore.toFixed(2)} → ₹${receiver.balance.toFixed(2)}\n\n` +
    `🕐 ${formatDateTime(new Date())}`;

  await ctx.editMessageText(successMsg, { parse_mode: "Markdown" }).catch(() => {});
  try {
    await ctx.api.sendMessage(receiver.userId,
      `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 ₹${receiverAmount.toFixed(2)}\n\n💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// ⚙️ USER SETTINGS
// ============================================================
bot.callbackQuery("user_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let text = `⚙️ Settings\n\n🎨 Customize Your Bot\n\nYour changes affect only your view.`;
  let kb = new InlineKeyboard()
    .text("📱 Reply Keyboard", "uset_reply_kb").row()
    .text("🎨 Inline Buttons", "uset_inline_kb").row()
    .text("💳 Edit Payment Method", "uset_edit_payment").row()
    .text("🔄 Reset to Default", "uset_reset").row()
    .text("🔙 Back", "back_to_balance");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("uset_edit_payment", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let text =
    `💳 Your Payment Methods\n\n👛 Wallet: <code>${user.walletAccount || "Not Set"}</code>\n⚡ UPI: <code>${user.upiId || "Not Set"}</code>\n🏦 Bank: <code>${user.bankAccNo || "Not Set"}</code>\n\n👇 Click to edit:`;
  let kb = new InlineKeyboard()
    .text("👛 Edit Wallet", "uset_edit_wallet").row()
    .text("⚡ Edit UPI", "uset_edit_upi").row()
    .text("🏦 Edit Bank", "uset_edit_bank").row()
    .text("🔙 Back", "user_settings");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
});

bot.callbackQuery("uset_edit_wallet", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_WALLET";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`👛 Edit Wallet\n\n📝 Send your wallet number:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }).catch(() => {});
});

bot.callbackQuery("uset_edit_upi", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_UPI";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`⚡ Edit UPI\n\n📝 Send your UPI ID:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }).catch(() => {});
});

bot.callbackQuery("uset_edit_bank", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_BANK_ACCNO";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`🏦 Edit Bank\n\n📝 Send Account Number:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") }).catch(() => {});
});

bot.callbackQuery("uset_reply_kb", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let text = `📱 *Reply Keyboard*\n\n`;
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) text += `Row ${r}: ${rowButtons.map(b => b.name).join(" | ")}\n`;
  }
  text += `\n👇 Click to edit:`;
  let kb = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) kb.text(layout[i].name, `uset_kb_edit_${i}`).row();
  kb.text("🔄 Reset", "uset_reset_kb").row();
  kb.text("🔙 Back", "user_settings");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("uset_reset_kb", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🔄 Reset!" });
  let userId = ctx.from.id;
  await UserPreference.updateOne({ userId }, { $unset: { keyboardLayout: "" } });
  await rerender(ctx, "uset_reply_kb");
});

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

bot.callbackQuery("uset_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `🔄 Reset to Default?\n\nThis will remove ALL your customizations.`,
    { reply_markup: new InlineKeyboard().text("✅ Yes, Reset", "uset_reset_confirm").text("❌ Cancel", "user_settings") }
  ).catch(() => {});
});

bot.callbackQuery("uset_reset_confirm", async (ctx) => {
  let userId = ctx.from.id;
  await UserPreference.deleteOne({ userId });
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await ctx.editMessageText(`✅ Reset Complete!\n\nYour layout is back to default.`, { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }).catch(() => {});
});

// ============================================================
// 🚀 WITHDRAW CALLBACKS (Gateway-aware)
// ============================================================
async function promptWithdrawWithValidation(ctx, method) {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let details = "";
  if (method === "Wallet") details = user.walletAccount;
  else if (method === "UPI") details = user.upiId;
  else if (method === "Bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";

  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery({ text: `❌ ${method} Not Linked!`, show_alert: true });
    let kb = new InlineKeyboard()
      .text(`⚡ Add ${method} Now`, `wd_add_${method.toLowerCase()}_start`)
      .row()
      .text("🔙 Back", "back_to_balance");
    return ctx.reply(`❌ *${method} Not Linked!*\n\n📝 To withdraw via ${method}, you need to add it first.\n\n👇 Click below:`,
      { parse_mode: "Markdown", reply_markup: kb });
  }
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[userId] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => { await promptWithdrawWithValidation(ctx, "Wallet"); });
bot.callbackQuery("wd_upi", async (ctx) => { await promptWithdrawWithValidation(ctx, "UPI"); });
bot.callbackQuery("wd_bank", async (ctx) => { await promptWithdrawWithValidation(ctx, "Bank"); });

// ✅ NEW — Ultra Pay / Gateway Withdraw
bot.callbackQuery("wd_gateway_withdraw", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let gateway = await getActiveGateway();
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway not configured!", show_alert: true });

  let gwName = gateway.name === "ULTRAPAY" ? "Ultra Pay" : gateway.name;
  let details = user.gatewayUpi || user.walletAccount;

  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery();
    userState[userId] = "GATEWAY_WAIT_UPI";
    return ctx.reply(
      `⚡ *${gwName} - First Time Setup*\n\n📝 Enter your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
    );
  }

  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });

  userState[userId] = "WD_GW_AMT";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `⚡ *Withdraw via ${gwName}*\n\n👛 Destination: \`${details}\`\n💰 Balance: ₹${user.balance.toFixed(2)}\n\n👉 Enter amount to withdraw:`,
    { parse_mode: "Markdown" }
  );
});

// ✅ NEW — Gateway UPI Setup (from Payout Method)
bot.callbackQuery("set_gateway_upi", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let gateway = await getActiveGateway();
  let gwName = gateway ? (gateway.name === "ULTRAPAY" ? "Ultra Pay" : gateway.name) : "Ultra Pay";

  userState[userId] = "GATEWAY_WAIT_UPI";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⚡ *${gwName} Setup*\n\n📝 Enter your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
  ).catch(() => {});
});

bot.callbackQuery("wd_add_wallet_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_WALLET";
  await ctx.editMessageText(`👛 Add Wallet\n\n📝 Send your wallet number:`, { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }).catch(() => {});
});
bot.callbackQuery("wd_add_upi_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_UPI";
  await ctx.editMessageText(`⚡ Add UPI\n\n📝 Send your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }).catch(() => {});
});
bot.callbackQuery("wd_add_bank_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_BANK_ACCNO";
  await ctx.editMessageText(`🏦 Add Bank\n\n📝 Send Account Number:`, { reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }).catch(() => {});
});

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
// ⏳ ANIMATED PROCESSING HELPER
// ============================================================
async function animateProcessing(ctx, chatId, messageId, steps, delayMs = 700) {
  for (let i = 0; i < steps.length; i++) {
    let text = `⏳ *Processing via Ultra Pay...*\n\n`;
    for (let j = 0; j < steps.length; j++) {
      let icon = j < i ? "✅" : (j === i ? "🔵" : "⚪");
      text += `${icon} ${steps[j]}\n`;
    }
    try {
      await ctx.api.editMessageText(chatId, messageId, text, { parse_mode: "Markdown" });
    } catch (e) {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  // Final: All completed
  let finalText = `⏳ *Processing via Ultra Pay...*\n\n`;
  for (let j = 0; j < steps.length; j++) {
    finalText += `✅ ${steps[j]}\n`;
  }
  try {
    await ctx.api.editMessageText(chatId, messageId, finalText, { parse_mode: "Markdown" });
  } catch (e) {}
}

// ============================================================
// 🏧 WITHDRAWAL CONFIRM (AUTO GATEWAY ONLY)
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

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

  // Try gateway first
  let gatewayForMethod = await Gateway.findOne({ name: method, isActive: true });

  if (gatewayForMethod) {
    await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

    // Send processing message
    let msg = await ctx.reply("⏳ *Processing via Gateway...*", { parse_mode: "Markdown" });

    // Animate
    await animateProcessing(ctx, ctx.chat.id, msg.message_id, [
      "Preparing withdrawal",
      "Connecting to gateway",
      "Processing payment",
      "Finalizing"
    ]);

    let result = await processGatewayPayment({
      gatewayKey: gatewayForMethod.name,
      upi: details, wallet: details, number: details,
      amount: amount,
      comment: `Withdrawal #${userWithdrawalCount}`,
      userId: userId, orderId: withdrawalId
    });

    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

    if (result.status === 'success') {
      let txnNumber = result.txnNumber || generateTxnNumber();
      await Withdrawal.create({
        withdrawalId, userId, userWithdrawalCount,
        amount, method, details, status: "Approved",
        gateway: gatewayForMethod.name, txnNumber,
        approvedBy: "Auto Gateway", approvedAt: new Date()
      });
      await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });

      // Final success message to user
      try {
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id,
          `✅ *Withdrawal Successful!*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💰 *Amount:* ₹${amount.toFixed(2)}\n` +
          `⚡ *Gateway:* ${gatewayForMethod.name}\n` +
          `🚀 *TXN:* \`${txnNumber}\`\n` +
          `📅 *Date:* ${formatDateTime(new Date())}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✅ Please Check Your ${gatewayForMethod.name} Account!`,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("📄 Check Receipt", receiptUrl) }
        );
      } catch (e) {}

      // Payout Channel — New format
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel) {
        let maskedAddr = halfMaskDetails("UPI", details);
        let newBalance = user.balance.toFixed(2);
        let gwResponse = JSON.stringify(result.data || {});
        if (gwResponse.length > 200) gwResponse = gwResponse.substring(0, 200) + "...";

        let channelMsg =
          `✅ New Withdrawal Processed ✅\n\n` +
          `🟢 User : ${userId}\n` +
          `✌️ Remaining Balance :- ${newBalance}\n\n` +
          `🚀 Amount : ${amount} INR (-)\n` +
          `⛔ Address : ${maskedAddr}\n\n` +
          `💡 Bot: @${ctx.me.username}\n\n` +
          `⚠️ ${gatewayForMethod.name} Response: ${gwResponse}`;

        let channelKb = new InlineKeyboard().url("📊 Check Statement", receiptUrl);

        try {
          await ctx.api.sendMessage(payoutChannel, channelMsg, {
            reply_markup: channelKb,
            disable_web_page_preview: true
          });
        } catch (e) { console.error("Channel send error:", e.message); }
      }

      return;
    } else {
      // Failed — refund
      user.balance += amount;
      user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
      await user.save();
      await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);

      await ctx.api.editMessageText(ctx.chat.id, msg.message_id,
        `❌ *Gateway Failed!*\n\n` +
        `📛 Error: ${result.message}\n\n` +
        `💵 Amount refunded to your balance.\n` +
        `💰 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});

      // Notify channel
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel) {
        let maskedAddr = halfMaskDetails("UPI", details);
        let gwResponse = JSON.stringify(result.data || { message: result.message });
        if (gwResponse.length > 200) gwResponse = gwResponse.substring(0, 200) + "...";

        let channelMsg =
          `❌ New Withdrawal Failed ❌\n\n` +
          `🟢 User : ${userId}\n` +
          `✌️ Remaining Balance :- ${user.balance.toFixed(2)}\n\n` +
          `🚀 Amount : ${amount} INR (Refunded)\n` +
          `⛔ Address : ${maskedAddr}\n\n` +
          `💡 Bot: @${ctx.me.username}\n\n` +
          `⚠️ ${gatewayForMethod.name} Response: ${gwResponse}`;

        try {
          await ctx.api.sendMessage(payoutChannel, channelMsg, { disable_web_page_preview: true });
        } catch (e) {}
      }
      return;
    }
  }

  // No gateway — basic refund logic (should not normally happen)
  user.balance += amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
  await user.save();
  await ctx.answerCallbackQuery({ text: "❌ Gateway not available!" });
  await ctx.editMessageText("❌ Gateway not available. Amount refunded.").catch(() => {});
});

// ✅ NEW — Gateway Withdraw Confirm (Ultra Pay)
bot.callbackQuery(/^conf_gw_wd_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("conf_gw_wd_", "").split("_");
  let amount = parseFloat(parts[parts.length - 1]);
  let gwName = parts.slice(0, parts.length - 1).join("_");
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  let details = user.gatewayUpi || user.walletAccount;
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway missing", show_alert: true });

  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${gwName}`, -amount);

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

  // Send processing message
  let msg = await ctx.reply("⏳ *Processing via Gateway...*", { parse_mode: "Markdown" });

  await animateProcessing(ctx, ctx.chat.id, msg.message_id, [
    "Preparing withdrawal",
    "Connecting to gateway",
    "Processing payment",
    "Finalizing"
  ]);

  let result = await processGatewayPayment({
    gatewayKey: gateway.name,
    upi: details, wallet: details, number: details,
    amount: amount,
    comment: `Withdrawal #${userWithdrawalCount}`,
    userId: userId, orderId: withdrawalId
  });

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  if (result.status === 'success') {
    let txnNumber = result.txnNumber || generateTxnNumber();
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount,
      amount, method: gwName, details, status: "Approved",
      gateway: gateway.name, txnNumber,
      approvedBy: "Auto Gateway", approvedAt: new Date()
    });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });

    await ctx.api.editMessageText(ctx.chat.id, msg.message_id,
      `✅ *Withdrawal Successful!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 *Amount:* ₹${amount.toFixed(2)}\n` +
      `⚡ *Gateway:* ${gwName}\n` +
      `🚀 *TXN:* \`${txnNumber}\`\n` +
      `📅 *Date:* ${formatDateTime(new Date())}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Please Check Your ${gwName} Account!`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("📄 Check Receipt", receiptUrl) }
    ).catch(() => {});

    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      let maskedAddr = halfMaskDetails("UPI", details);
      let gwResponse = JSON.stringify(result.data || {});
      if (gwResponse.length > 200) gwResponse = gwResponse.substring(0, 200) + "...";

      let channelMsg =
        `✅ New Withdrawal Processed ✅\n\n` +
        `🟢 User : ${userId}\n` +
        `✌️ Remaining Balance :- ${user.balance.toFixed(2)}\n\n` +
        `🚀 Amount : ${amount} INR (-)\n` +
        `⛔ Address : ${maskedAddr}\n\n` +
        `💡 Bot: @${ctx.me.username}\n\n` +
        `⚠️ ${gwName} Response: ${gwResponse}`;

      let channelKb = new InlineKeyboard().url("📊 Check Statement", receiptUrl);

      try {
        await ctx.api.sendMessage(payoutChannel, channelMsg, {
          reply_markup: channelKb,
          disable_web_page_preview: true
        });
      } catch (e) {}
    }
  } else {
    user.balance += amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
    await user.save();
    await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);

    await ctx.api.editMessageText(ctx.chat.id, msg.message_id,
      `❌ *Gateway Failed!*\n\n` +
      `📛 Error: ${result.message}\n\n` +
      `💵 Amount refunded. Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" }
    ).catch(() => {});

    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel) {
      let maskedAddr = halfMaskDetails("UPI", details);
      let gwResponse = JSON.stringify(result.data || { message: result.message });
      if (gwResponse.length > 200) gwResponse = gwResponse.substring(0, 200) + "...";

      let channelMsg =
        `❌ New Withdrawal Failed ❌\n\n` +
        `🟢 User : ${userId}\n` +
        `✌️ Remaining Balance :- ${user.balance.toFixed(2)}\n\n` +
        `🚀 Amount : ${amount} INR (Refunded)\n` +
        `⛔ Address : ${maskedAddr}\n\n` +
        `💡 Bot: @${ctx.me.username}\n\n` +
        `⚠️ ${gwName} Response: ${gwResponse}`;

      try {
        await ctx.sendMessage(payoutChannel, channelMsg, { disable_web_page_preview: true });
      } catch (e) {}
    }
  }
});

bot.callbackQuery("canc_wd", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🚀 /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  let disabled = await isAdminDisabled(userId);
  if (disabled) {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId });
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    return ctx.reply(
      `❌ ADMIN ACCESS DISABLED\n\n` +
      `Your admin permissions have been disabled by the Owner.\n\n` +
      `📞 Contact Owner: ${ownerName}\n🆔 Owner ID: ${ownerId}`,
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
  let activeGw = await getActiveGateway();
  let quickTaxEnabled = await getConfig("quick_pay_tax_enabled", false);
  let quickTaxPercent = await getConfig("quick_pay_tax_percent", 0);

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Bot Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🔗 *Gateway:* ${activeGw ? "`" + activeGw.name + "`" : "❌ None"}\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `💠 *Auto UPI:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢" : "🔴"} | ✋ Manual: ${manualVerify ? "🟢" : "🔴"}\n` +
    `⚡ *Quick Pay Tax:* ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 OFF"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${activeAdmins}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let rawButtons = [
    [{ text: "👮 Add/Remove Admins Permission", callback_data: "adm_permissions" }],
    [
      { text: "👑 Transfer Ownership", callback_data: "adm_transfer" },
      { text: "💰 Set Withdraw Tax", callback_data: "adm_set_wd_tax" }
    ],
    [
      { text: "💠 Verification Mode", callback_data: "adm_verification_mode" },
      { text: "👮 Manage Admins", callback_data: "adm_admins" }
    ],
    [
      { text: "🚫 Manage Ban Users", callback_data: "adm_manage_ban" },
      { text: "🤖 Bot Status", callback_data: "adm_bot_status" }
    ],
    [
      { text: "✅ Verify User", callback_data: "adm_verify_user" },
      { text: "🚫 Manage Ban Wallet", callback_data: "adm_manage_ban_wallet" }
    ],
    [
      { text: "💸 Withdraw Status", callback_data: "adm_wd_status" },
      { text: "➕ Add Balance", callback_data: "adm_add_bal" }
    ],
    [
      { text: "➖ Remove Balance", callback_data: "adm_rem_bal" },
      { text: "⚡ Manage Your Channels", callback_data: "adm_manage_channels" }
    ],
    [
      { text: "⚠️ Reset Balance", callback_data: "adm_reset_all_bal" },
      { text: "🎨 Customize Your Theme", callback_data: "adm_customize_theme" }
    ],
    [
      { text: "💳 Manage Add Fund", callback_data: "adm_addfund_menu" },
      { text: "📢 Broadcast", callback_data: "adm_broadcast" }
    ],
    [
      { text: "💬 Talk With User", callback_data: "adm_talk_user" },
      { text: "📊 Manage Withdraw", callback_data: "adm_manage_withdraw" }
    ],
    [
      { text: "🔍 Find User Details", callback_data: "adm_find_user" },
      { text: "📊 Status", callback_data: "adm_status" }
    ],
    [
      { text: "🆕 New Users", callback_data: "adm_new_users" },
      { text: "⚡ Quick Pay", callback_data: "adm_quick_pay" }
    ],
    [
      { text: "🔗 Gateway Steps", callback_data: "adm_gateway_menu" },
      { text: "🎁 Gift Codes", callback_data: "adm_create_gift" }
    ],
    [
      { text: "🔔 New User Notification", callback_data: "adm_user_notif" },
      { text: "🎁 Manage Redeem Codes", callback_data: "adm_redeem" }
    ],
    [
      { text: "📧 Manage Amazon Codes", callback_data: "adm_amazon" },
      { text: "📋 Manage Tasks", callback_data: "adm_tasks_manager" }
    ],
    [
      { text: "🚀 Recent Admin Actions", callback_data: "adm_recent_actions" },
      { text: "🔄 Refresh Panel", callback_data: "admin" }
    ]
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
// 📊 STATUS CALLBACK
// ============================================================
bot.callbackQuery("adm_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `📊 *Status*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose option:*`;
  let kb = new InlineKeyboard()
    .text("🔴 Live Balance Tracker", "status_live_tracker").row()
    .text("👥 Users List", "status_users_list")
    .text("💰 Live Fund", "status_live_fund").row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("status_live_tracker", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderLiveBalanceTracker(ctx, 0);
});

async function renderLiveBalanceTracker(ctx, page = 0) {
  let perPage = 10;
  let totalUsers = await User.countDocuments({});
  let totalPages = Math.ceil(totalUsers / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = Math.max(0, totalPages - 1);

  let users = await User.find({})
    .sort({ createdAt: -1 })
    .skip(page * perPage)
    .limit(perPage);

  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;

  let text =
    `🔴 *Live Balance Tracker*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 *Total Users:* ${totalUsers}\n` +
    `💰 *Total Balance:* ₹${totalBalance.toFixed(2)}\n` +
    `📄 *Page:* ${page + 1}/${totalPages || 1}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 *Click user:*`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 12);
    kb.text(`👤 ${name}`, `livebd_name_${u.userId}`)
      .text(`🆔 ${u.userId}`, `livebd_copy_${u.userId}`)
      .text(`💰 ₹${u.balance.toFixed(0)}`, `livebd_bal_${u.userId}`)
      .row();
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️ Back", callback_data: `status_lb_page_${page - 1}` });
  navRow.push({ text: "🔄 Refresh", callback_data: `status_lb_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "Next ➡️", callback_data: `status_lb_page_${page + 1}` });
  kb.row(...navRow);
  kb.row({ text: "🏠 Admin Panel", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^status_lb_page_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let page = parseInt(ctx.callbackQuery.data.replace("status_lb_page_", ""), 10);
  await renderLiveBalanceTracker(ctx, page);
});

bot.callbackQuery(/^livebd_name_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("livebd_name_", ""), 10);
  await ctx.reply(`👤 Open Profile:`, {
    reply_markup: new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${uid}`).row().text("🔙 Back", "status_live_tracker")
  });
});

bot.callbackQuery(/^livebd_copy_/, async (ctx) => {
  let uid = ctx.callbackQuery.data.replace("livebd_copy_", "");
  await ctx.answerCallbackQuery({ text: `🆔 ${uid}`, show_alert: true });
});

bot.callbackQuery(/^livebd_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("livebd_bal_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return;
  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pendingCount = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejectedCount = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });
  let totalWd = await Withdrawal.aggregate([
    { $match: { userId: uid, status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  let text =
    `👤 *User Balance Details*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *Name:* ${user.firstName || "User"}\n` +
    `🆔 *ID:* \`${uid}\`\n` +
    `💰 *Balance:* ₹${user.balance.toFixed(2)}\n` +
    `📤 *Total Withdrawn:* ₹${(totalWd[0]?.total || 0).toFixed(2)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Approved: ${approvedCount}\n` +
    `⏳ Pending: ${pendingCount}\n` +
    `❌ Rejected: ${rejectedCount}`;

  let kb = new InlineKeyboard()
    .text("📜 Withdraw History", `user_wd_hist_${uid}`)
    .text("🚀 Withdraw", `user_wd_start_${uid}`).row()
    .text("💰 Balance History", `user_bal_hist_${uid}`).row()
    .text("🔙 Back", "status_live_tracker");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 👥 USERS LIST
// ============================================================
bot.callbackQuery("status_users_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderUsersList(ctx, 0);
});

async function renderUsersList(ctx, page = 0) {
  let perPage = 10;
  let totalUsers = await User.countDocuments({});
  let totalPages = Math.ceil(totalUsers / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = Math.max(0, totalPages - 1);

  let users = await User.find({})
    .sort({ createdAt: -1 })
    .skip(page * perPage)
    .limit(perPage);

  let activeCount = await User.countDocuments({ isBanned: false });
  let bannedCount = await User.countDocuments({ isBanned: true });
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;

  let text =
    `👥 *Users List*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Total:* ${totalUsers}\n` +
    `✅ *Active:* ${activeCount}\n` +
    `🚫 *Banned:* ${bannedCount}\n` +
    `💰 *Total Balance:* ₹${totalBalance.toFixed(2)}\n` +
    `📄 *Page:* ${page + 1}/${totalPages || 1}`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 12);
    let status = u.isBanned ? "🚫" : "✅";
    kb.text(`${status} ${name}`, `userslist_view_${u.userId}`).row();
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️ Back", callback_data: `status_ul_page_${page - 1}` });
  navRow.push({ text: "🔄 Refresh", callback_data: `status_ul_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "Next ➡️", callback_data: `status_ul_page_${page + 1}` });
  kb.row(...navRow);
  kb.row({ text: "🏠 Admin Panel", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^status_ul_page_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let page = parseInt(ctx.callbackQuery.data.replace("status_ul_page_", ""), 10);
  await renderUsersList(ctx, page);
});

bot.callbackQuery(/^userslist_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("userslist_view_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return;
  let text =
    `👤 *User Details*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *Name:* ${user.firstName || "User"}\n` +
    `🆔 *ID:* \`${uid}\`\n` +
    `📛 *Username:* ${user.username ? "@" + user.username : "None"}\n` +
    `💰 *Balance:* ₹${user.balance.toFixed(2)}\n` +
    `📤 *Withdrawn:* ₹${(user.withdrawnTotal || 0).toFixed(2)}\n` +
    `📊 *Status:* ${user.isBanned ? "🚫 Banned" : "✅ Active"}\n` +
    `📅 *Joined:* ${formatDateTime(user.createdAt)}`;
  let kb = new InlineKeyboard()
    .text("🔙 Back", "status_users_list")
    .text("🏠 Admin Panel", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 💰 LIVE FUND (Admin)
// ============================================================
bot.callbackQuery("status_live_fund", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let fund = await LiveFund.findOne({ key: "main_fund" });
  if (!fund) fund = await LiveFund.create({ key: "main_fund" });

  let totalUsers = await User.countDocuments({});
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;

  let totalWdArr = await Withdrawal.aggregate([
    { $match: { status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let totalWd = totalWdArr[0]?.total || 0;

  let running = (fund.totalFund || 0) - (fund.usedFund || 0);
  let usedPercent = fund.totalFund > 0 ? ((fund.usedFund / fund.totalFund) * 100).toFixed(1) : 0;

  let text =
    `💰 *Live Fund*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🏦 *Bot Total Fund:* ₹${totalBalance.toFixed(2)}\n` +
    `📤 *Total Paid Out:* ₹${totalWd.toFixed(2)}\n` +
    `👥 *Total Users:* ${totalUsers}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚙️ *Running Fund System*\n` +
    `📊 Status: ${fund.isActive ? "🟢 ON" : "🔴 OFF"}\n` +
    `💰 Set Fund: ₹${(fund.totalFund || 0).toFixed(2)}\n` +
    `📉 Running: ₹${running.toFixed(2)}\n` +
    `📤 Used: ₹${(fund.usedFund || 0).toFixed(2)} (${usedPercent}%)`;

  let kb = new InlineKeyboard()
    .text("✏️ Set Fund", "livefund_set").row()
    .text(fund.isActive ? "🔴 Turn OFF" : "🟢 Turn ON", "livefund_toggle").row()
    .text("🔄 Reset Fund", "livefund_reset").row()
    .text("📤 View Payouts", "livefund_payouts").row()
    .text("🔙 Back", "adm_status");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("livefund_set", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "LIVEFUND_WAIT_AMOUNT";
  await ctx.editMessageText("💰 *Set Live Fund*\n\n📝 Send amount:\n\nExample: `10000`",
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "status_live_fund") }).catch(() => {});
});

bot.callbackQuery("livefund_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let fund = await LiveFund.findOne({ key: "main_fund" });
  if (!fund) fund = await LiveFund.create({ key: "main_fund" });
  fund.isActive = !fund.isActive;
  fund.updatedAt = new Date();
  await fund.save();
  await ctx.answerCallbackQuery({ text: fund.isActive ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "status_live_fund");
});

bot.callbackQuery("livefund_reset", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await LiveFund.findOneAndUpdate({ key: "main_fund" }, { totalFund: 0, usedFund: 0, updatedAt: new Date() }, { upsert: true });
  await ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "status_live_fund");
});

bot.callbackQuery("livefund_payouts", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let recent = await Withdrawal.find({ status: "Approved" }).sort({ approvedAt: -1 }).limit(10);
  let text = `📤 *Recent Payouts*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (recent.length === 0) text += `📭 No payouts yet.`;
  else {
    for (let w of recent) {
      let u = await User.findOne({ userId: w.userId });
      text += `👤 ${u?.firstName || "User"} — ₹${w.amount.toFixed(2)}\n`;
      text += `🆔 \`${w.userId}\` | ${formatDateTime(w.approvedAt || w.createdAt)}\n\n`;
    }
  }
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "status_live_fund"), parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🆕 NEW USERS
// ============================================================
bot.callbackQuery("adm_new_users", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderNewUsers(ctx, 0);
});

async function renderNewUsers(ctx, page = 0) {
  let perPage = 10;
  let totalUsers = await User.countDocuments({});
  let totalPages = Math.ceil(totalUsers / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = Math.max(0, totalPages - 1);

  let users = await User.find({})
    .sort({ createdAt: -1 })
    .skip(page * perPage)
    .limit(perPage);

  let today = new Date();
  today.setHours(0, 0, 0, 0);
  let weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let todayCount = await User.countDocuments({ createdAt: { $gte: today } });
  let weekCount = await User.countDocuments({ createdAt: { $gte: weekAgo } });

  let text =
    `🆕 *New Users*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Total Users:* ${totalUsers}\n` +
    `📅 *Today:* ${todayCount}\n` +
    `📅 *This Week:* ${weekCount}\n` +
    `📄 *Page:* ${page + 1}/${totalPages || 1}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 *Click any user:*`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 15);
    kb.text(`👤 ${name} — 🆔 ${u.userId}`, `newuser_detail_${u.userId}`).row();
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️ Back", callback_data: `newusers_page_${page - 1}` });
  navRow.push({ text: "🔄 Refresh", callback_data: `newusers_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "Next ➡️", callback_data: `newusers_page_${page + 1}` });
  kb.row(...navRow);
  kb.row({ text: "🏠 Admin Panel", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^newusers_page_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let page = parseInt(ctx.callbackQuery.data.replace("newusers_page_", ""), 10);
  await renderNewUsers(ctx, page);
});

bot.callbackQuery(/^newuser_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("newuser_detail_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return ctx.answerCallbackQuery({ text: "User not found", show_alert: true });

  let text =
    `👤 *User Details*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *Name:* ${u.firstName || "Unknown"}\n` +
    `🆔 *User ID:* \`${u.userId}\`\n` +
    `📛 *Username:* ${u.username ? "@" + u.username : "No username"}\n\n` +
    `🕐 *Started Bot:*\n${formatDateTime(u.createdAt)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("🔙 Back", "adm_new_users")
    .text("🏠 Admin Panel", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🎨 CUSTOMIZE YOUR THEME
// ============================================================
bot.callbackQuery("adm_customize_theme", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text =
    `🎨 *Customize Your Theme*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 *Choose what to customize:*`;
  let kb = new InlineKeyboard()
    .text("🎨 Admin Panel Customizing", "adm_panel_custom").row()
    .text("⌨️ Keyboard Buttons Customizing & Edit", "adm_keyboard_custom").row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_panel_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAdminPanelCustom(ctx);
});

async function renderAdminPanelCustom(ctx) {
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;

  let text =
    `🎨 *Admin Panel Customizing*\n\n` +
    `📝 To Rename, Simply Click On The Button Name.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) text += `${rowButtons.map(b => b.name).join(" | ")}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n` + `🔄 *Row Customize:*\n`;

  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let firstName = rowButtons[0].name;
      let shortName = firstName.length > 12 ? firstName.substring(0, 12) + ".." : firstName;
      kb.text(`${shortName}`, `admrow_first_${r}`)
        .text("⬆️ Row", `admrow_up_${r}`)
        .text("⬇️ Row", `admrow_down_${r}`)
        .row();
    }
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n🎯 *Btn Customize:*\n`;
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});

  let kb2 = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    let shortName = layout[i].name.length > 12 ? layout[i].name.substring(0, 12) + ".." : layout[i].name;
    kb2.text(`${shortName}`, `admbtn_edit_${i}`)
      .text("⬆️ Btn", `admbtn_up_${i}`)
      .text("⬇️ Btn", `admbtn_down_${i}`)
      .text("📥 Move", `admbtn_move_${i}`)
      .row();
  }
  kb2.row({ text: "♻️ Reset Admin Panel", callback_data: "admpanel_reset" });
  kb2.row({ text: "🎨 Update for All Admins", callback_data: "admpanel_update_all" });
  kb2.row({ text: "🔙 Back", callback_data: "adm_customize_theme" });

  await ctx.reply("🎯 *Btn Customize:*", { reply_markup: kb2, parse_mode: "Markdown" });
}

bot.callbackQuery(/^admrow_up_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("admrow_up_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (r <= 0) return ctx.answerCallbackQuery({ text: "Already top!", show_alert: true });
  layout.forEach(b => {
    if (b.row === r) b.row = r - 1;
    else if (b.row === r - 1) b.row = r;
  });
  await setConfig("admin_panel_layout", layout);
  ctx.answerCallbackQuery({ text: "⬆️ Moved" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery(/^admrow_down_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("admrow_down_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  if (r >= maxRow) return ctx.answerCallbackQuery({ text: "Already bottom!", show_alert: true });
  layout.forEach(b => {
    if (b.row === r) b.row = r + 1;
    else if (b.row === r + 1) b.row = r;
  });
  await setConfig("admin_panel_layout", layout);
  ctx.answerCallbackQuery({ text: "⬇️ Moved" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery(/^admbtn_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_edit_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let text = `✏️ *Edit Button*\n\n📛 ${btn.name}\n📍 Row: ${btn.row}\n\n👇 Choose:`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `admbtn_rename_${idx}`).row()
    .text("🔙 Back", "adm_panel_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admbtn_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_rename_", ""), 10);
  userState[ctx.from.id] = `ADM_BTN_RENAME_${idx}`;
  await ctx.editMessageText("📝 Send new name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_panel_custom") }).catch(() => {});
});

bot.callbackQuery(/^admbtn_up_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_up_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx <= 0) return ctx.answerCallbackQuery({ text: "Top!", show_alert: true });
  if (layout[idx].row === layout[idx - 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx - 1]; layout[idx - 1] = temp;
    await setConfig("admin_panel_layout", layout);
  }
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery(/^admbtn_down_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_down_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx >= layout.length - 1) return ctx.answerCallbackQuery({ text: "Bottom!", show_alert: true });
  if (layout[idx].row === layout[idx + 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx + 1]; layout[idx + 1] = temp;
    await setConfig("admin_panel_layout", layout);
  }
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery(/^admbtn_move_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_move_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  let btn = layout[idx];
  let text = `📥 *Move Button*\n\n📛 ${btn.name}\n📍 Current Row: ${btn.row}\n\n👉 Choose new row:`;
  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    if (r === btn.row) continue;
    kb.text(`Row ${r + 1}`, `admbtn_moveto_${idx}_${r}`).row();
  }
  kb.text("🔙 Back", "adm_panel_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admbtn_moveto_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("admbtn_moveto_", "").split("_");
  let idx = parseInt(parts[0], 10);
  let newRow = parseInt(parts[1], 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].row = newRow;
  await setConfig("admin_panel_layout", layout);
  ctx.answerCallbackQuery({ text: "✅ Moved!" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery("admpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `⚠️ *Reset Admin Panel?*\n\nThis will restore the original layout.\n\n[✅ Confirm] [❌ Cancel]`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "admpanel_reset_yes").text("❌ Cancel", "adm_panel_custom") }
  ).catch(() => {});
});

bot.callbackQuery("admpanel_reset_yes", async (ctx) => {
  await setConfig("admin_panel_layout", JSON.parse(JSON.stringify(DEFAULT_ADMIN_PANEL_LAYOUT)));
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "adm_panel_custom");
});

bot.callbackQuery("admpanel_update_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let admins = await BotAdmin.find({ isActive: true });
  let total = admins.length + 1;
  await ctx.editMessageText(
    `⚠️ *Update for All Admins?*\n\n👥 Total: ${total} admins\n\nThis will update every admin's panel.\n\n[✅ Confirm] [❌ Cancel]`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "admpanel_update_yes").text("❌ Cancel", "adm_panel_custom") }
  ).catch(() => {});
});

bot.callbackQuery("admpanel_update_yes", async (ctx) => {
  ctx.answerCallbackQuery({ text: "⏳ Updating..." });
  let startTime = Date.now();
  let admins = await BotAdmin.find({ isActive: true });
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let messageSendEnabled = await getConfig("admin_panel_msg_send", true);
  let updateMsg = await getConfig("admin_panel_update_msg", "🎨 Admin Panel Updated!\nYour panel has been updated.");

  let sent = 0, failed = 0;
  let allIds = [ownerId, ...admins.map(a => a.userId)];
  let uniqueIds = [...new Set(allIds)];

  for (let id of uniqueIds) {
    try {
      if (messageSendEnabled) await bot.api.sendMessage(id, updateMsg);
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  let text =
    `✅ *Update Complete!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Success: ${sent}\n` +
    `❌ Failed: ${failed}\n` +
    `👥 Total: ${uniqueIds.length}\n\n` +
    `⏱️ Time: ${timeTaken}s`;

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_panel_custom"), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_keyboard_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderKeyboardCustom(ctx);
});

async function renderKeyboardCustom(ctx) {
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;

  let text =
    `⌨️ *Keyboard Buttons Customizing & Edit*\n\n` +
    `📝 To Rename, Simply Click On The Button Name.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) text += `${rowButtons.map(b => b.name).join(" | ")}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n🔄 *Row Customize:*`;

  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let shortName = rowButtons[0].name.length > 12 ? rowButtons[0].name.substring(0, 12) + ".." : rowButtons[0].name;
      kb.text(shortName, `kbrow_first_${r}`)
        .text("⬆️ Row", `kbrow_up_${r}`)
        .text("⬇️ Row", `kbrow_down_${r}`)
        .row();
    }
  }

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});

  let kb2 = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    let shortName = layout[i].name.length > 12 ? layout[i].name.substring(0, 12) + ".." : layout[i].name;
    kb2.text(shortName, `kbbtn_edit_${i}`)
      .text("⬆️ Btn", `kbbtn_up_${i}`)
      .text("⬇️ Btn", `kbbtn_down_${i}`)
      .text("📥 Move", `kbbtn_move_${i}`)
      .row();
  }
  kb2.row({ text: "♻️ Reset Keyboard to Default", callback_data: "kbpanel_reset" });
  kb2.row({ text: "🎨 Update Keyboard for All Users", callback_data: "kbpanel_update_all" });
  kb2.row({ text: "🔔 Update Message Send", callback_data: "kbpanel_msg_toggle" });
  kb2.row({ text: "🔙 Back", callback_data: "adm_customize_theme" });

  await ctx.reply("🎯 *Btn Customize:*", { reply_markup: kb2, parse_mode: "Markdown" });
}

bot.callbackQuery(/^kbrow_up_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("kbrow_up_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (r <= 0) return ctx.answerCallbackQuery({ text: "Already top!", show_alert: true });
  layout.forEach(b => {
    if (b.row === r) b.row = r - 1;
    else if (b.row === r - 1) b.row = r;
  });
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery(/^kbrow_down_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("kbrow_down_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  if (r >= maxRow) return ctx.answerCallbackQuery({ text: "Already bottom!", show_alert: true });
  layout.forEach(b => {
    if (b.row === r) b.row = r + 1;
    else if (b.row === r + 1) b.row = r;
  });
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery(/^kbbtn_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_edit_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let text = `✏️ *Edit Button*\n\n📛 ${btn.name}\n📍 Row: ${btn.row}\n\n👇 Choose:`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `kbbtn_rename_${idx}`).row()
    .text("🔙 Back", "adm_keyboard_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbbtn_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_rename_", ""), 10);
  userState[ctx.from.id] = `KB_BTN_RENAME_${idx}`;
  await ctx.editMessageText("📝 Send new name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_keyboard_custom") }).catch(() => {});
});

bot.callbackQuery(/^kbbtn_up_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_up_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx <= 0) return ctx.answerCallbackQuery({ text: "Top!", show_alert: true });
  if (layout[idx].row === layout[idx - 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx - 1]; layout[idx - 1] = temp;
    await setConfig("keyboard_layout", layout);
  }
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery(/^kbbtn_down_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_down_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx >= layout.length - 1) return ctx.answerCallbackQuery({ text: "Bottom!", show_alert: true });
  if (layout[idx].row === layout[idx + 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx + 1]; layout[idx + 1] = temp;
    await setConfig("keyboard_layout", layout);
  }
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery(/^kbbtn_move_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_move_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  let btn = layout[idx];
  let text = `📥 *Move Button*\n\n📛 ${btn.name}\n📍 Current Row: ${btn.row}\n\n👉 Choose new row:`;
  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    if (r === btn.row) continue;
    kb.text(`Row ${r + 1}`, `kbbtn_moveto_${idx}_${r}`).row();
  }
  kb.text("🔙 Back", "adm_keyboard_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbbtn_moveto_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("kbbtn_moveto_", "").split("_");
  let idx = parseInt(parts[0], 10);
  let newRow = parseInt(parts[1], 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].row = newRow;
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "✅ Moved!" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery("kbpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(
    `⚠️ *Reset Keyboard?*\n\nThis will restore the original layout.\n\n[✅ Confirm] [❌ Cancel]`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "kbpanel_reset_yes").text("❌ Cancel", "adm_keyboard_custom") }
  ).catch(() => {});
});

bot.callbackQuery("kbpanel_reset_yes", async (ctx) => {
  await setConfig("keyboard_layout", JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT)));
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery("kbpanel_update_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let totalUsers = await User.countDocuments({});
  await ctx.editMessageText(
    `⚠️ *Update Keyboard for All Users?*\n\n👥 Total: ${totalUsers} users\n\nThis will update everyone's keyboard.\n\n[✅ Confirm] [❌ Cancel]`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "kbpanel_update_yes").text("❌ Cancel", "adm_keyboard_custom") }
  ).catch(() => {});
});

bot.callbackQuery("kbpanel_update_yes", async (ctx) => {
  ctx.answerCallbackQuery({ text: "⏳ Updating..." });
  let startTime = Date.now();
  let users = await User.find({});
  let messageSendEnabled = await getConfig("kb_update_msg_send", true);
  let updateMsg = await getConfig("kb_update_msg", "🎨 Keyboard Updated!\nYour keyboard has been updated successfully.");

  let sent = 0, failed = 0;
  for (let u of users) {
    try {
      if (messageSendEnabled) await bot.api.sendMessage(u.userId, updateMsg);
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  let text =
    `✅ *Update Complete!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Success: ${sent}\n` +
    `❌ Failed: ${failed}\n` +
    `👥 Total: ${users.length}\n\n` +
    `⏱️ Time: ${timeTaken}s`;

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_keyboard_custom"), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("kbpanel_msg_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("kb_update_msg_send", true);
  let msg = await getConfig("kb_update_msg", "🎨 Keyboard Updated!\nYour keyboard has been updated successfully.");
  let text =
    `🔔 *Update Message Send*\n\n` +
    `📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}\n\n` +
    `📝 Current Message:\n"${msg}"`;
  let kb = new InlineKeyboard()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "kbmsg_toggle").row()
    .text("✏️ Edit Message", "kbmsg_edit").row()
    .text("🔙 Back", "adm_keyboard_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("kbmsg_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("kb_update_msg_send", true);
  await setConfig("kb_update_msg_send", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "kbpanel_msg_toggle");
});

bot.callbackQuery("kbmsg_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "KB_MSG_EDIT";
  await ctx.editMessageText("📝 Send new update message:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "kbpanel_msg_toggle") }).catch(() => {});
});

// ============================================================
// 👮 ADMIN PERMISSIONS PANEL
// ============================================================
bot.callbackQuery("adm_permissions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

async function renderPermissionsPanel(ctx) {
  const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  const ownerUser = await User.findOne({ userId: ownerId });
  const admins = await BotAdmin.find({}).sort({ addedAt: -1 });
  let text = `👮 *Admin Permissions*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `👑 *Owner:* ${ownerUser?.firstName || "Owner"}\n🆔 \`${ownerId}\`\n\n`;
  text += `📊 *Total Admins:* ${admins.length}\n\n👇 Click to toggle:`;
  let kb = new InlineKeyboard();
  for (let a of admins) {
    let u = await User.findOne({ userId: a.userId });
    let name = u ? (u.firstName || "User") : "Unknown";
    let status = a.isActive ? "🟢" : "🔴";
    kb.text(`${status} ${name} — ${a.userId}`, `adm_perm_toggle_${a.userId}`).row();
  }
  kb.text("➕ Add New Admin", "admin_add").row();
  kb.text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^adm_perm_toggle_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("adm_perm_toggle_", ""), 10);
  let admin = await BotAdmin.findOne({ userId: adminId });
  if (!admin) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  admin.isActive = !admin.isActive;
  if (!admin.isActive) { admin.disabledAt = new Date(); admin.disabledBy = ctx.from.id; }
  else { admin.disabledAt = null; admin.disabledBy = null; }
  await admin.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", admin.isActive ? "Admin Enabled" : "Admin Disabled", `${adminId}`, 0, adminId);
  await ctx.answerCallbackQuery({ text: admin.isActive ? "🟢 Enabled" : "🔴 Disabled" });
  await renderPermissionsPanel(ctx);
});

// ============================================================
// 👑 TRANSFER OWNERSHIP
// ============================================================
bot.callbackQuery("adm_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(
    `👑 *Transfer Ownership*\n\n⚠️ You will become an Admin.\n\n📝 Send new Owner User ID:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") }
  );
});

bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);
  let currentOwner = ctx.from.id;
  await BotAdmin.findOneAndUpdate(
    { userId: currentOwner },
    { addedAt: new Date(), addedBy: currentOwner, isActive: true },
    { upsert: true }
  );
  await setConfig("owner_id", newOwnerId);
  cache.ownerId = newOwnerId;
  await logAdminAction(currentOwner, ctx.from.first_name || "Owner", "Ownership Transferred", `New owner: ${newOwnerId}`, 0, newOwnerId);
  await ctx.answerCallbackQuery({ text: "👑 Transferred!" });
  await ctx.editMessageText(`✅ *Ownership Transferred!*\n\n👑 New Owner: \`${newOwnerId}\``, { parse_mode: "Markdown" }).catch(() => {});
  try {
    await ctx.api.sendMessage(newOwnerId, `👑 *Congratulations!*\n\nYou are now the *Owner*!\n\nUse /admin to access.`, { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 💰 SET WITHDRAW TAX
// ============================================================
bot.callbackQuery("adm_set_wd_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("tax_percent", 0);
  let kb = new InlineKeyboard()
    .text("✏️ Set Tax %", "adm_set_tax_val").row()
    .text("🔄 Reset to 0%", "adm_reset_tax").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(
    `💰 *Set Withdraw Tax*\n\n📊 Current: \`${cur}%\`\n\n👇 Choose action:`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery("adm_set_tax_val", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_TAX_PERCENT";
  await ctx.editMessageText("📝 Send tax percentage (0-50):", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_set_wd_tax") });
});

bot.callbackQuery("adm_reset_tax", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("tax_percent", 0);
  await rerender(ctx, "adm_set_wd_tax");
});

// ============================================================
// 💠 VERIFICATION MODE
// ============================================================
bot.callbackQuery("adm_verification_mode", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let verifyEnabled = await getConfig("verification_enabled", false);
  let kb = new InlineKeyboard()
    .text(verifyEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(
    `💠 *Verification Mode*\n\n📊 Status: ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await rerender(ctx, "adm_verification_mode");
});

// ============================================================
// 🤖 BOT STATUS
// ============================================================
bot.callbackQuery("adm_bot_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let botActive = await getConfig("bot_active", true);
  let offText = await getConfig("bot_off_text", "🤖 Bot is currently OFF\n\nPlease try again later.");
  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_bot_toggle").row()
    .text("✏️ Edit OFF Message", "adm_edit_bot_off").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(
    `🤖 *Bot Status*\n\n📊 Status: ${botActive ? "🟢 Active" : "🔴 Off"}\n\n📝 OFF Message:\n${offText}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery("adm_bot_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("bot_active", true);
  await setConfig("bot_active", !cur);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", !cur ? "Bot Activated" : "Bot Deactivated", "", 0, null);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 Bot ON" : "🔴 Bot OFF" });
  await rerender(ctx, "adm_bot_status");
});

bot.callbackQuery("adm_edit_bot_off", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_BOT_OFF_TEXT";
  await ctx.editMessageText("📝 Send new Bot OFF message:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_bot_status") });
});

// ============================================================
// 👮 MANAGE ADMINS
// ============================================================
bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(`➕ Add New Admin\n\n📝 Send User ID:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

// ============================================================
// 🚫 MANAGE BAN USERS
// ============================================================
bot.callbackQuery("adm_manage_ban", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let bannedUsers = await User.find({ isBanned: true }).limit(20);
  let text = `🚫 *Manage Ban Users*\n\n📊 Total Banned: ${bannedUsers.length}\n\n`;
  bannedUsers.forEach((u, i) => {
    text += `${i + 1}. 👤 ${u.firstName || "User"} — \`${u.userId}\`\n`;
  });
  let kb = new InlineKeyboard()
    .text("➕ Ban New User", "adm_ban_new").row()
    .text("🔓 Unban User", "adm_unban_user").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text || "No banned users", { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_ban_new", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_USER_WAIT";
  await ctx.editMessageText("🚫 Send User ID to BAN:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_ban") });
});

bot.callbackQuery("adm_unban_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UNBAN_USER_WAIT";
  await ctx.editMessageText("🔓 Send User ID to UNBAN:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_ban") });
});

// ============================================================
// 🚫 MANAGE BAN WALLET
// ============================================================
bot.callbackQuery("adm_manage_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let unlimitedWallet = await getConfig("unlimited_wallet", false);
  let onetimeWallet = await getConfig("onetime_wallet", false);
  let text =
    `🚫 *Manage Ban Wallet*\n\n` +
    `♾️ Unlimited: ${unlimitedWallet ? "🟢 ON" : "🔴 OFF"}\n` +
    `⏱️ One-Time: ${onetimeWallet ? "🟢 ON" : "🔴 OFF"}\n\n` +
    `👇 Choose action:`;
  let kb = new InlineKeyboard()
    .text("🚫 Ban Wallet", "adm_ban_wallet").row()
    .text(unlimitedWallet ? "♾️ Unlimited: ON" : "♾️ Unlimited: OFF", "adm_unlimited_wallet").row()
    .text(onetimeWallet ? "⏱️ One-Time: ON" : "⏱️ One-Time: OFF", "adm_onetime_wallet").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_WALLET_WAIT";
  await ctx.editMessageText("🚫 Send Wallet ID to BAN:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_ban_wallet") });
});

bot.callbackQuery("adm_unlimited_wallet", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("unlimited_wallet", false);
  await setConfig("unlimited_wallet", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "♾️ ON" : "❌ OFF" });
  await rerender(ctx, "adm_manage_ban_wallet");
});

bot.callbackQuery("adm_onetime_wallet", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("onetime_wallet", false);
  await setConfig("onetime_wallet", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "⏱️ ON" : "❌ OFF" });
  await rerender(ctx, "adm_manage_ban_wallet");
});

// ============================================================
// 💸 WITHDRAW STATUS
// ============================================================
bot.callbackQuery("adm_wd_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let totalWd = await Withdrawal.countDocuments({ status: "Approved" });
  let totalAmt = await Withdrawal.aggregate([
    { $match: { status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let total = totalAmt[0]?.total || 0;
  let text = `💸 *Withdraw Status*\n\n📊 Total Withdrawals: ${totalWd}\n💰 Total Amount: ₹${total.toFixed(2)}`;
  let kb = new InlineKeyboard()
    .text("📊 Manage Withdraw", "adm_manage_withdraw").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 💰 BALANCE MENU
// ============================================================
bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: `UserID Amount`", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: `UserID Amount`", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userCount = await User.countDocuments({});
  let kb = new InlineKeyboard().text("✅ Yes, Reset All", "adm_reset_all_confirm").row().text("❌ Cancel", "admin");
  await ctx.editMessageText(
    `⚠️ RESET ALL BALANCES\n\nUsers: ${userCount}\n\nThis will reset EVERYONE's balance to ₹0!\n\nConfirm?`,
    { reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Reset All Balances", "All users", 0, null);
  await ctx.editMessageText("✅ All balances reset to ₹0", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// ⚡ MANAGE CHANNELS
// ============================================================
bot.callbackQuery("adm_manage_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true });
  let text = `⚡ *Manage Your Channels*\n\n📊 Total: ${channels.length}\n\n`;
  channels.forEach((ch, i) => {
    text += `${i + 1}. 📢 ${ch.displayName || ch.channelId}\n🔗 ${ch.inviteLink}\n\n`;
  });
  let kb = new InlineKeyboard()
    .text("➕ Add Channel", "adm_add_channel").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text || "No channels", { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_add_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_CHANNEL_WAIT";
  await ctx.editMessageText(
    `📢 *Add Channel*\n\nFormat: <code>ChannelID | InviteLink</code>\n\nExample:\n<code>@mychannel | https://t.me/mychannel</code>\n\n📝 Send now:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_channels") }
  );
});

// ============================================================
// 📢 BROADCAST
// ============================================================
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BROADCAST_WAIT_MSG";
  let msgEnabled = await getConfig("broadcast_msg_send", true);
  await ctx.editMessageText(
    `📢 *Broadcast*\n\n` +
    `Send Your Broadcast Message\n\n` +
    `📝 Forward any message (text/photo/video) here.\n\n` +
    `🔔 Notify Users: ${msgEnabled ? "🟢 ON" : "🔴 OFF"}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔔 Toggle Notify", "broadcast_notify_toggle").row().text("🔙 Back", "admin") }
  ).catch(() => {});
});

bot.callbackQuery("broadcast_notify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("broadcast_msg_send", true);
  await setConfig("broadcast_msg_send", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_broadcast");
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  delete userState[ctx.from.id];
  if (global.broadcastCache) delete global.broadcastCache[ctx.from.id];
  await ctx.editMessageText("❌ *Cancelled.*", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

bot.callbackQuery("broadcast_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "❌ Expired!", show_alert: true });
  delete userState[userId];
  delete global.broadcastCache[userId];
  await ctx.answerCallbackQuery({ text: "⏳ Broadcasting..." });

  let startTime = Date.now();
  let allUsers = await User.find({});
  let messageSendEnabled = await getConfig("broadcast_msg_send", true);
  let count = 0, failed = 0;

  for (let u of allUsers) {
    try {
      if (!messageSendEnabled) { count++; continue; }
      if (cacheObj.type === "photo") {
        await ctx.api.sendPhoto(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
      } else if (cacheObj.type === "video") {
        await ctx.api.sendVideo(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
      } else if (cacheObj.type === "document") {
        await ctx.api.sendDocument(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
      } else {
        await ctx.api.sendMessage(u.userId, cacheObj.content || "");
      }
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  let broadcastId = Math.floor(100000 + Math.random() * 900000).toString();
  await Broadcast.create({
    broadcastId, adminId: userId,
    adminName: ctx.from.first_name || "Admin",
    messageType: cacheObj.type || "text",
    content: cacheObj.content || "",
    fileId: cacheObj.fileId || "",
    sentCount: count, failedCount: failed,
    totalCount: allUsers.length,
    timeTaken: parseFloat(timeTaken),
    status: "Completed"
  });

  let text =
    `✅ *Broadcast Complete!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Sent: ${count}\n` +
    `❌ Failed: ${failed}\n` +
    `👥 Total: ${allUsers.length}\n\n` +
    `⏱️ Time: ${timeTaken}s\n` +
    `📅 ${formatDateTime(new Date())}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("🗑️ Remove Broadcast", `broadcast_remove_${broadcastId}`).row()
    .text("🏠 Admin Panel", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^broadcast_remove_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let broadcastId = ctx.callbackQuery.data.replace("broadcast_remove_", "");
  let bc = await Broadcast.findOne({ broadcastId });
  if (!bc) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  let kb = new InlineKeyboard()
    .text("✅ Yes, Remove", `broadcast_remove_yes_${broadcastId}`)
    .text("❌ Cancel", "admin");
  await ctx.editMessageText(
    `⚠️ *Remove Broadcast?*\n\nThis will try to delete message from all users.\n\n📊 Sent: ${bc.sentCount}\n\nConfirm?`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery(/^broadcast_remove_yes_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "🗑️ Removing..." });
  let broadcastId = ctx.callbackQuery.data.replace("broadcast_remove_yes_", "");
  let bc = await Broadcast.findOne({ broadcastId });
  if (!bc) return;
  bc.status = "Removed";
  await bc.save();
  await ctx.editMessageText(
    `✅ *Broadcast Removed!*\n\n🗑️ Marked as removed.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

bot.on("message:photo", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "photo", fileId: photo.file_id, caption };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard()
      .text("✅ Confirm", "broadcast_confirm")
      .text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(
      `📢 *Broadcast Preview*\n\n📸 Photo\n📝 Caption: ${caption || "(none)"}\n\n👥 Recipients: ${totalUsers}\n\nConfirm?`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
    return;
  }
  return next();
});

// ============================================================
// 💬 TALK WITH USER
// ============================================================
bot.callbackQuery("adm_talk_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  await ctx.editMessageText(`💬 Format: \`UserID | Message\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});

// ============================================================
// 📊 MANAGE WITHDRAW
// ============================================================
bot.callbackQuery("adm_manage_withdraw", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderManageWithdraw(ctx);
});

async function renderManageWithdraw(ctx) {
  let settings = await WithdrawSettings.find({});
  if (settings.length === 0) {
    const defaults = [
      { method: "upi", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
      { method: "bank", isActive: true, minAmount: 100, maxAmount: 50000, taxPercent: 0 },
      { method: "wallet", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
      { method: "amazon", isActive: false, minAmount: 100, maxAmount: 5000, taxPercent: 0 },
      { method: "redeem", isActive: false, minAmount: 50, maxAmount: 2000, taxPercent: 0 }
    ];
    for (let d of defaults) await WithdrawSettings.create(d);
    settings = await WithdrawSettings.find({});
  }

  let text = `📊 *Manage Withdraw*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  let kb = new InlineKeyboard();

  let methods = ["upi", "bank", "wallet", "amazon", "redeem"];
  let emojis = { upi: "⚡", bank: "🏦", wallet: "🌐", amazon: "📧", redeem: "🎁" };

  for (let m of methods) {
    let s = settings.find(x => x.method === m);
    if (!s) continue;
    let status = s.isActive ? "🟢 ON" : "🔴 OFF";
    kb.text(`${emojis[m]} ${m.toUpperCase()} — ${status}`, `admwd_edit_${m}`).row();
  }

  kb.row({ text: "🔙 Back to Admin", callback_data: "admin" });
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^admwd_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_edit_", "");
  let s = await WithdrawSettings.findOne({ method });
  if (!s) return;

  let emojis = { upi: "⚡", bank: "🏦", wallet: "🌐", amazon: "📧", redeem: "🎁" };
  let text =
    `${emojis[method]} *Edit ${method.toUpperCase()}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 Status: ${s.isActive ? "🟢 ON" : "🔴 OFF"}\n` +
    `📉 Min: ₹${s.minAmount}\n` +
    `📈 Max: ₹${s.maxAmount}\n` +
    `💸 Tax: ${s.taxPercent}%`;

  let kb = new InlineKeyboard()
    .text("📉 Set Min", `admwd_min_${method}`)
    .text("📈 Set Max", `admwd_max_${method}`).row()
    .text("💸 Set Tax", `admwd_tax_${method}`).row()
    .text(s.isActive ? "🔴 Turn OFF" : "🟢 Turn ON", `admwd_toggle_${method}`).row()
    .text("🔙 Back", "adm_manage_withdraw");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admwd_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("admwd_toggle_", "");
  let s = await WithdrawSettings.findOne({ method });
  if (!s) return;
  s.isActive = !s.isActive;
  s.updatedAt = new Date();
  await s.save();
  await ctx.answerCallbackQuery({ text: s.isActive ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, `admwd_edit_${method}`);
});

bot.callbackQuery(/^admwd_min_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_min_", "");
  userState[ctx.from.id] = `ADMWD_MIN_${method}`;
  await ctx.editMessageText("📉 Send min amount:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `admwd_edit_${method}`) }).catch(() => {});
});

bot.callbackQuery(/^admwd_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_max_", "");
  userState[ctx.from.id] = `ADMWD_MAX_${method}`;
  await ctx.editMessageText("📈 Send max amount:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `admwd_edit_${method}`) }).catch(() => {});
});

bot.callbackQuery(/^admwd_tax_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_tax_", "");
  userState[ctx.from.id] = `ADMWD_TAX_${method}`;
  await ctx.editMessageText("💸 Send tax % (0-50):", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `admwd_edit_${method}`) }).catch(() => {});
});

// ============================================================
// 🔍 FIND USER
// ============================================================
bot.callbackQuery("adm_find_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 *Find User Details*\n\n📝 Send User ID:", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

bot.callbackQuery(/^user_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_detail_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;

  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let totalWdArr = await Withdrawal.aggregate([
    { $match: { userId: uid, status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let totalWd = totalWdArr[0]?.total || 0;

  let text =
    `🔍 *User Details*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *Name:* ${u.firstName || "User"}\n` +
    `🆔 *ID:* \`${uid}\`\n` +
    `📛 *Username:* ${u.username ? "@" + u.username : "None"}\n\n` +
    `💰 *Balance:* ₹${u.balance.toFixed(2)}\n` +
    `💸 *Total Withdrawn:* ₹${totalWd.toFixed(2)}\n` +
    `📊 *Withdraw Count:* ${approvedCount}\n\n` +
    `📅 *Joined:* ${formatDateTime(u.createdAt)}`;

  let kb = new InlineKeyboard()
    .text("🔗 Linked Withdraw", `user_linked_${uid}`).row()
    .text("📜 Withdraw History", `user_wd_hist_${uid}`).row()
    .text("💰 Balance History", `user_bal_hist_${uid}`).row()
    .text("➕ Add Balance", `user_add_bal_${uid}`)
    .text("➖ Remove Balance", `user_rem_bal_${uid}`).row()
    .text("💬 Send Message", `user_send_msg_${uid}`)
    .text("🚫 Ban/Unban", `user_ban_${uid}`).row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_linked_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_linked_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;
  let text =
    `🔗 *Linked Withdraw Methods*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 ${u.firstName || "User"}\n` +
    `🆔 \`${uid}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ *UPI:* \`${u.upiId || "Not Set"}\`\n\n` +
    `🏦 *Bank:* \`${u.bankAccNo || "Not Set"}\`\n\n` +
    `🌐 *Wallet:* \`${u.walletAccount || "Not Set"}\`\n\n` +
    `📧 *Amazon:* \`${u.amazonEmail || "Not Set"}\`\n\n` +
    `🎁 *Redeem:* \`${u.redeemCodeAddr || "Not Set"}\``;
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_wd_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_hist_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(10);
  let totalArr = await Withdrawal.aggregate([
    { $match: { userId: uid, status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let total = totalArr[0]?.total || 0;
  let approved = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pending = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejected = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });

  let text =
    `📜 *Withdraw History*\n\n` +
    `👤 ${uid}\n\n` +
    `💰 Total: ₹${total.toFixed(2)}\n` +
    `✅ ${approved} | ⏳ ${pending} | ❌ ${rejected}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (withdrawals.length === 0) text += "📭 No withdrawals";
  else {
    withdrawals.forEach((w, i) => {
      let icon = w.status === "Approved" ? "✅" : (w.status === "Rejected" ? "❌" : "⏳");
      text += `${i + 1}. ${icon} ₹${w.amount} — ${w.method}\n🕐 ${formatDateTime(w.createdAt)}\n\n`;
    });
  }

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_bal_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_bal_hist_", ""), 10);
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(15);

  let totalCredited = 0, totalDebited = 0;
  for (let h of history) {
    if (h.amount >= 0) totalCredited += h.amount;
    else totalDebited += Math.abs(h.amount);
  }
  let u = await User.findOne({ userId: uid });

  let text =
    `💰 *Balance History*\n\n` +
    `👤 ${uid}\n\n` +
    `📊 Summary:\n` +
    `🟢 Credited: ₹${totalCredited.toFixed(2)}\n` +
    `🔴 Debited: ₹${totalDebited.toFixed(2)}\n` +
    `💵 Current: ₹${(u?.balance || 0).toFixed(2)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (history.length === 0) text += "📭 No transactions";
  else {
    history.forEach((h, i) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      text += `${i + 1}. ${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)}\n🕐 ${formatDateTime(h.createdAt)}\n\n`;
    });
  }

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_add_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_add_bal_", ""), 10);
  userState[ctx.from.id] = `UADD_WAIT_${uid}`;
  await ctx.editMessageText(`➕ Send amount to add to \`${uid}\`:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }).catch(() => {});
});

bot.callbackQuery(/^user_rem_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_rem_bal_", ""), 10);
  userState[ctx.from.id] = `UREM_WAIT_${uid}`;
  await ctx.editMessageText(`➖ Send amount to remove from \`${uid}\`:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }).catch(() => {});
});

bot.callbackQuery(/^user_send_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_send_msg_", ""), 10);
  userState[ctx.from.id] = `UMSG_WAIT_${uid}`;
  await ctx.editMessageText(`💬 Send message to \`${uid}\`:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }).catch(() => {});
});

bot.callbackQuery(/^user_ban_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_ban_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;
  u.isBanned = !u.isBanned;
  await u.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", u.isBanned ? "User Banned" : "User Unbanned", `${uid}`, 0, uid);
  await ctx.answerCallbackQuery({ text: u.isBanned ? "🚫 Banned" : "✅ Unbanned" });
  await rerender(ctx, `user_detail_${uid}`);
});

// ============================================================
// ⚡ QUICK PAY TAX
// ============================================================
bot.callbackQuery("adm_quick_pay", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("quick_pay_tax_enabled", false);
  let percent = await getConfig("quick_pay_tax_percent", 0);
  let text = `⚡ *Quick Pay Tax*\n\n📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}\n💸 Tax: ${percent}%`;
  let kb = new InlineKeyboard()
    .text("💸 Set Tax %", "adm_set_qp_tax").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_qp_tax").row()
    .text("🔄 Reset to 0%", "adm_reset_qp_tax").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_set_qp_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_QUICK_PAY_TAX";
  await ctx.editMessageText("💸 Send tax % (0-50):", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_quick_pay") });
});

bot.callbackQuery("adm_toggle_qp_tax", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("quick_pay_tax_enabled", false);
  await setConfig("quick_pay_tax_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_quick_pay");
});

bot.callbackQuery("adm_reset_qp_tax", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await setConfig("quick_pay_tax_percent", 0);
  await setConfig("quick_pay_tax_enabled", false);
  await ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "adm_quick_pay");
});

// ============================================================
// 🔗 GATEWAY STEPS — NEW SYSTEM
// ============================================================

// --- Main Gateway Steps Menu ---
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  const text = `🔗 *Gateway Steps*\n\nChoose an option below:`;
  const kb = new InlineKeyboard()
    .text("📲 Gateway UPI", "gateway_upi")
    .text("💼 Gateway Wallet", "gateway_wallet")
    .row()
    .text("↩️ Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// --- Gateway UPI (Placeholder) ---
bot.callbackQuery("gateway_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  const kb = new InlineKeyboard().text("↩️ Back", "adm_gateway_menu");
  await ctx.editMessageText(
    `📲 *Gateway UPI*\n\nComing soon...`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

// --- Gateway Wallet Menu ---
bot.callbackQuery("gateway_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  // Check if Ultra Pay is configured
  let gw = await Gateway.findOne({ name: "ULTRAPAY" });
  let isConfigured = gw && gw.token && gw.key;
  let statusIcon = isConfigured ? "🟢" : "🔴";

  const text = `💼 *Gateway Wallet*\n\nChoose an option below:`;
  const kb = new InlineKeyboard()
    .text(`${statusIcon} ⚡ Ultra Pay`, "ultra_pay_menu")
    .row()
    .text("➕ Add Gateway", "add_gateway_url")
    .row()
    .text("↩️ Back", "adm_gateway_menu");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// --- Ultra Pay Settings (Token + Key) ---
bot.callbackQuery("ultra_pay_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let gw = await Gateway.findOne({ name: "ULTRAPAY" });
  let tokenSet = gw?.token && gw.token !== "";
  let keySet = gw?.key && gw.key !== "";
  let isConfigured = tokenSet && keySet;

  const text =
    `⚡ *Ultra Pay Settings*\n\n` +
    `• 🔑 Token: \`${tokenSet ? "Configured" : "Not Set"}\`\n` +
    `• 🗝️ Key: \`${keySet ? "Configured" : "Not Set"}\`\n\n` +
    `📊 Status: ${isConfigured ? "🟢 Active" : "🔴 Not Active"}`;

  const kb = new InlineKeyboard()
    .text("🔑 Set Token", "set_ultra_token")
    .row()
    .text("🗝️ Set Key", "set_ultra_key")
    .row()
    .text("↩️ Back", "gateway_wallet");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// --- Set Ultra Pay Token ---
bot.callbackQuery("set_ultra_token", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AWAITING_ULTRA_TOKEN";
  await ctx.editMessageText("🔑 Send your **Ultra Pay Token**:", {
    reply_markup: new InlineKeyboard().text("↩️ Cancel", "ultra_pay_menu"),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// --- Set Ultra Pay Key ---
bot.callbackQuery("set_ultra_key", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AWAITING_ULTRA_KEY";
  await ctx.editMessageText("🗝️ Send your **Ultra Pay Key**:", {
    reply_markup: new InlineKeyboard().text("↩️ Cancel", "ultra_pay_menu"),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// --- Add Gateway (URL Paste) ---
bot.callbackQuery("add_gateway_url", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AWAITING_GATEWAY_URL";

  let gw = await Gateway.findOne({ name: "URL_GATEWAY" });
  let currentUrl = gw?.url || "Not Set";

  const text =
    `➕ *Add Gateway*\n\n` +
    `Current URL:\n\`${currentUrl}\`\n\n` +
    `Please paste your **full API URL** with placeholders:\n\n` +
    `\`https://ultra-pay.in/APIs/api?token=XXX&key=YYY&paytoNumber={number}&amount={amount}&comment={comment}\`\n\n` +
    `• \`{number}\` → User Wallet/UPI\n` +
    `• \`{amount}\` → Amount\n` +
    `• \`{comment}\` → Comment`;

  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text("↩️ Cancel", "gateway_wallet"),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// ============================================================
// 🔗 GATEWAY STEPS — Text Input Handlers
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  let text = ctx.message.text.trim();

  if (!state) return next();

  // Ultra Pay Token
  if (state === "AWAITING_ULTRA_TOKEN" && (await isAdmin(userId))) {
    delete userState[userId];
    let gw = await Gateway.findOne({ name: "ULTRAPAY" });
    if (!gw) {
      gw = await Gateway.create({
        name: "ULTRAPAY",
        url: "https://ultra-pay.in/APIs/api?token={token}&key={key}&paytoNumber={number}&amount={amount}&comment={comment}",
        type: "both",
        isActive: false,
        token: text,
        key: ""
      });
    } else {
      gw.token = text;
      await gw.save();
    }
    return ctx.reply(`✅ *Ultra Pay Token Saved!*\n\n🔑 \`${text.substring(0, 8)}...\``, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("↩️ Back", "ultra_pay_menu")
    });
  }

  // Ultra Pay Key
  if (state === "AWAITING_ULTRA_KEY" && (await isAdmin(userId))) {
    delete userState[userId];
    let gw = await Gateway.findOne({ name: "ULTRAPAY" });
    if (!gw) {
      gw = await Gateway.create({
        name: "ULTRAPAY",
        url: "https://ultra-pay.in/APIs/api?token={token}&key={key}&paytoNumber={number}&amount={amount}&comment={comment}",
        type: "both",
        isActive: false,
        token: "",
        key: text
      });
    } else {
      gw.key = text;
      await gw.save();
    }

    // Auto-activate if both token + key are set
    if (gw.token && gw.key) {
      gw.isActive = true;
      await gw.save();
    }

    return ctx.reply(
      `✅ *Ultra Pay Key Saved!*\n\n🗝️ \`${text.substring(0, 8)}...\`\n\n${gw.token && gw.key ? "🟢 Ultra Pay is now ACTIVE!" : "⚠️ Token still needed."}`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("↩️ Back", "ultra_pay_menu")
      }
    );
  }

  // Add Gateway URL
  if (state === "AWAITING_GATEWAY_URL" && (await isAdmin(userId))) {
    delete userState[userId];

    if (!text.startsWith("http://") && !text.startsWith("https://")) {
      return ctx.reply("❌ Invalid URL. Must start with `http://` or `https://`.", { parse_mode: "Markdown" });
    }

    if (!text.includes("{number}") || !text.includes("{amount}")) {
      return ctx.reply(
        `⚠️ *URL must include placeholders:*\n\n` +
        `• \`{number}\` → User Wallet\n` +
        `• \`{amount}\` → Amount\n` +
        `• \`{comment}\` → (optional)\n\n` +
        `Please resend with placeholders.`,
        { parse_mode: "Markdown" }
      );
    }

    let gw = await Gateway.findOne({ name: "URL_GATEWAY" });
    if (!gw) {
      await Gateway.create({
        name: "URL_GATEWAY",
        url: text,
        type: "both",
        isActive: true
      });
    } else {
      gw.url = text;
      gw.isActive = true;
      await gw.save();
    }

    return ctx.reply(
      `✅ *Gateway URL Saved!*\n\n` +
      `\`${text}\`\n\n` +
      `🔗 Placeholders will be replaced during payment.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("↩️ Back", "gateway_wallet")
      }
    );
  }

  return next();
});

// ============================================================
// 🎁 GIFT CODES
// ============================================================
bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20);
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let text = `🎁 *Gift Codes*\n\nTotal: ${totalCodes}\n\n👇 Click code to edit:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb.text("➕ Add Codes", "adm_redeem_add").row();
  kb.text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;
  let text = `🎁 Code: <code>${gc.code}</code>\n\n💰 Amount: ₹${gc.amount}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}`;
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
  let kb = new InlineKeyboard()
    .text("💰 Edit Amount", `gc_edit_amt_${code}`).row()
    .text("👥 Edit Max Uses", `gc_edit_max_${code}`).row()
    .text("🔙 Back", `gc_view_${code}`);
  await ctx.editMessageText(`✏️ Edit Code\n\nCode: <code>${gc.code}</code>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
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
  if (!gc || gc.usedUsers.length === 0) return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
  let text = `📋 Claims for <code>${code}</code>\n\n`;
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

bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.editMessageText(
    `➕ Add Redeem Codes\n\n📝 Format: <code>CODE AMOUNT</code>\n\nExample:\n<code>WELCOME100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_create_gift") }
  );
});

// ============================================================
// 📧 AMAZON CODES
// ============================================================
bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAmazonPanel(ctx);
});

async function renderAmazonPanel(ctx) {
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(20);
  let totalCodes = await GiftCode.countDocuments({ type: "amazon" });
  let text = `📧 *Amazon Codes*\n\nTotal: ${totalCodes}\n\n👇 Click code to edit:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `amz_view_${c.code}`).row();
  }
  kb.text("➕ Add Codes", "adm_amazon_add").row();
  kb.text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^amz_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_view_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" });
  if (!gc) return;
  let text = `📧 Code: <code>${gc.code}</code>\n\n💰 Amount: ₹${gc.amount}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}`;
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
  let kb = new InlineKeyboard()
    .text("💰 Edit Amount", `amz_edit_amt_${code}`).row()
    .text("👥 Edit Max Uses", `amz_edit_max_${code}`).row()
    .text("🔙 Back", `amz_view_${code}`);
  await ctx.editMessageText(`✏️ Edit Amazon Code\n\nCode: <code>${gc.code}</code>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
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
  if (!gc || gc.usedUsers.length === 0) return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_view_${code}`) });
  let text = `📋 Claims for <code>${code}</code>\n\n`;
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
// 📋 MANAGE TASKS
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
  let msg = `📋 *Task Details*\n\n🆔 ${task.taskId}\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}\n📸 Type: ${task.taskType || "photo"}\n📢 Alert: ${task.alertChannel || "Not Set"}`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit Title", `task_edit_title_${task.taskId}`).row()
    .text("✏️ Edit Reward", `task_edit_reward_${task.taskId}`).row()
    .text("✏️ Edit Link", `task_edit_link_${task.taskId}`).row()
    .text("✏️ Edit Alert Channel", `task_edit_channel_${task.taskId}`).row()
    .text("🗑️ Delete Task", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^task_edit_title_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_title_", "");
  userState[ctx.from.id] = `TASK_EDIT_TITLE_${tId}`;
  await ctx.editMessageText("📝 Send new title:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_reward_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_reward_", "");
  userState[ctx.from.id] = `TASK_EDIT_REWARD_${tId}`;
  await ctx.editMessageText("📝 Send new reward:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_link_", "");
  userState[ctx.from.id] = `TASK_EDIT_LINK_${tId}`;
  await ctx.editMessageText("📝 Send new link:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_channel_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_channel_", "");
  userState[ctx.from.id] = `TASK_EDIT_CHANNEL_${tId}`;
  await ctx.editMessageText("📝 Send new alert channel:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) });
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
// 🚀 RECENT ADMIN ACTIONS
// ============================================================
bot.callbackQuery("adm_recent_actions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(15);
  let text = `🚀 *Recent Admin Actions*\n\n`;
  if (logs.length === 0) text += "📭 No actions yet.";
  else {
    logs.forEach((log, i) => {
      let dateStr = new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      text += `${i + 1}. 👤 *${log.adminName}*\n   📌 ${log.action}${log.details ? `: ${log.details}` : ''}\n   🕐 ${dateStr}\n\n`;
    });
  }
  let kb = new InlineKeyboard().text("🔄 Refresh", "adm_recent_actions").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🔔 NEW USER NOTIFICATION
// ============================================================
bot.callbackQuery("adm_user_notif", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("new_user_notif", true);
  let kb = new InlineKeyboard().text(enabled ? "🔕 Turn OFF" : "🔔 Turn ON", "adm_toggle_notif").row().text("🔙 Back", "admin");
  await ctx.editMessageText(`🔔 *New User Notification*\n\n📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}`,
    { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_toggle_notif", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("new_user_notif", true);
  await setConfig("new_user_notif", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_user_notif");
});

// ============================================================
// 🎁 REDEEM MODE
// ============================================================
bot.callbackQuery("adm_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let mode = await getConfig("redeem_mode", "manual");
  let codeCount = await GiftCode.countDocuments({ type: "redeem" });
  let text = `🎁 *Redeem Code*\n\nMode: ${mode === "manual" ? "📝 Manual" : "⚡ Auto"}\nTotal Codes: ${codeCount}`;
  let kb = new InlineKeyboard()
    .text(mode === "manual" ? "⚡ Auto" : "📝 Manual", "toggle_redeem_mode").row()
    .text("➕ Add Codes", "adm_redeem_add").row()
    .text("📋 View All Codes", "adm_create_gift").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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
// 📝 ADMIN TEXT HANDLERS
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  let text = ctx.message.text.trim();

  if (!state) return next();

  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    delete userState[userId];
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "text", content: text };
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard()
      .text("✅ Confirm", "broadcast_confirm")
      .text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(
      `📢 *Broadcast Preview*\n\n📝 ${text}\n\n👥 Recipients: ${totalUsers}\n\nConfirm?`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
    return;
  }

  if (state.startsWith("ADM_BTN_RENAME_") && (await isAdmin(userId))) {
    let idx = parseInt(state.replace("ADM_BTN_RENAME_", ""), 10);
    delete userState[userId];
    let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    if (idx < 0 || idx >= layout.length) return;
    layout[idx].name = text;
    await setConfig("admin_panel_layout", layout);
    await ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_panel_custom") });
    return;
  }

  if (state.startsWith("KB_BTN_RENAME_") && (await isAdmin(userId))) {
    let idx = parseInt(state.replace("KB_BTN_RENAME_", ""), 10);
    delete userState[userId];
    let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    if (idx < 0 || idx >= layout.length) return;
    layout[idx].name = text;
    await setConfig("keyboard_layout", layout);
    await ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_keyboard_custom") });
    return;
  }

  if (state === "KB_MSG_EDIT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("kb_update_msg", text);
    await ctx.reply(`✅ Message Updated!\n\n📌 New:\n${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "kbpanel_msg_toggle") });
    return;
  }

  if (state === "LIVEFUND_WAIT_AMOUNT" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid amount!");
    await LiveFund.findOneAndUpdate(
      { key: "main_fund" },
      { totalFund: amt, usedFund: 0, updatedAt: new Date() },
      { upsert: true }
    );
    await ctx.reply(`✅ Fund Set: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "status_live_fund") });
    return;
  }

  if (state.startsWith("ADMWD_MIN_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_MIN_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await WithdrawSettings.findOneAndUpdate({ method }, { minAmount: amt, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    return;
  }

  if (state.startsWith("ADMWD_MAX_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_MAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await WithdrawSettings.findOneAndUpdate({ method }, { maxAmount: amt, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    return;
  }

  if (state.startsWith("ADMWD_TAX_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_TAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await WithdrawSettings.findOneAndUpdate({ method }, { taxPercent: amt, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    return;
  }

  if (state === "WAITING_TAX_PERCENT" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await setConfig("tax_percent", amt);
    await ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_set_wd_tax") });
    return;
  }

  if (state === "WAITING_QUICK_PAY_TAX" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await setConfig("quick_pay_tax_percent", amt);
    await ctx.reply(`✅ Quick Pay Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_quick_pay") });
    return;
  }

  if (state === "WAITING_NEW_OWNER" && (await isOwner(userId))) {
    delete userState[userId];
    let newOwnerId = parseInt(text, 10);
    if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: newOwnerId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    let kb = new InlineKeyboard()
      .text("✅ Yes, Transfer", `admin_transfer_confirm_${newOwnerId}`).row()
      .text("❌ Cancel", "adm_admins");
    await ctx.reply(`⚠️ *Confirm Transfer*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newOwnerId}\`\n\nSure?`, {
      parse_mode: "Markdown", reply_markup: kb
    });
    return;
  }

  if (state === "WAITING_ADMIN_ADD" && (await isOwner(userId))) {
    delete userState[userId];
    let newAdminId = parseInt(text, 10);
    if (isNaN(newAdminId)) return ctx.reply("❌ Invalid!");
    if (newAdminId === userId) return ctx.reply("❌ You are owner!");
    let targetUser = await User.findOne({ userId: newAdminId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    await BotAdmin.findOneAndUpdate(
      { userId: newAdminId },
      { addedAt: new Date(), addedBy: userId, isActive: true },
      { upsert: true }
    );
    await logAdminAction(userId, ctx.from.first_name || "Owner", "Admin Added", `Added ${newAdminId}`, 0, newAdminId);
    await ctx.reply(`✅ Admin Added!\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newAdminId}\``, {
      parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_admins")
    });
    return;
  }

  if (state === "BAN_USER_WAIT" && (await isAdmin(userId))) {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    targetUser.isBanned = true;
    await targetUser.save();
    await logAdminAction(userId, ctx.from.first_name || "Admin", "User Banned", `${targetId}`, 0, targetId);
    try { await ctx.api.sendMessage(targetId, `🚫 You have been banned from using this bot.`); } catch (e) {}
    await ctx.reply(`✅ User ${targetId} BANNED`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban") });
    return;
  }

  if (state === "UNBAN_USER_WAIT" && (await isAdmin(userId))) {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    targetUser.isBanned = false;
    await targetUser.save();
    await logAdminAction(userId, ctx.from.first_name || "Admin", "User Unbanned", `${targetId}`, 0, targetId);
    try { await ctx.api.sendMessage(targetId, `✅ You have been unbanned. Welcome back!`); } catch (e) {}
    await ctx.reply(`✅ User ${targetId} UNBANNED`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban") });
    return;
  }

  if (state === "BAN_WALLET_WAIT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("banned_wallet", text);
    await ctx.reply(`✅ Wallet Banned: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban_wallet") });
    return;
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
    } else {
      targetUser.balance += amount;
      await targetUser.save();
      await logBalanceHistory(targetId, "Admin Added Balance", amount);
    }
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Added Balance", `+₹${amount} to ${targetId}`, amount, targetId);
    await ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    return;
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
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Removed Balance", `-₹${amount} from ${targetId}`, amount, targetId);
    await ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    return;
  }

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
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Added Balance", `+₹${amount} to ${targetId}`, amount, targetId);
    try { await ctx.api.sendMessage(targetId, `💰 Balance Updated!\n\n🟢 Added: ₹${amount}\n💵 New: ₹${targetUser.balance.toFixed(2)}`); } catch (e) {}
    await ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`) });
    return;
  }

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
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Removed Balance", `-₹${amount} from ${targetId}`, amount, targetId);
    try { await ctx.api.sendMessage(targetId, `💰 Balance Updated!\n\n📉 Removed: ₹${amount}\n💵 New: ₹${targetUser.balance.toFixed(2)}`); } catch (e) {}
    await ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`) });
    return;
  }

  if (state.startsWith("UMSG_WAIT_")) {
    let targetId = parseInt(state.replace("UMSG_WAIT_", ""), 10);
    delete userState[userId];
    try {
      await ctx.api.sendMessage(targetId, `📨 Message from Admin:\n\n${text}`);
      await ctx.reply(`✅ Sent to ${targetId}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${targetId}`) });
    } catch (e) {
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
    return;
  }

  if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply(`❌ User not found!`);
    await ctx.reply(`👤 Loading user ${targetId}...`, { reply_markup: new InlineKeyboard().text("👤 View Details", `user_detail_${targetId}`) });
    return;
  }

  if (state === "WAITING_FOR_USER_MESSAGE" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length < 2) return ctx.reply(`❌ Format: \`UserID | Message\``, { parse_mode: "Markdown" });
    let targetId = parseInt(parts[0], 10);
    let message = parts.slice(1).join("|").trim();
    if (isNaN(targetId)) return ctx.reply("❌ Invalid User ID!");
    try {
      await ctx.api.sendMessage(targetId, `📨 *Admin Message*\n\n${message}`, { parse_mode: "Markdown" });
      await ctx.reply(`✅ Sent to \`${targetId}\`!`, { parse_mode: "Markdown" });
    } catch (e) {
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
    return;
  }

  if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
    await Task.create({
      taskId: parts[0], title: parts[1],
      reward: parseFloat(parts[2]), link: parts[3],
      alertChannel: await getConfig("default_task_alert_channel", "Not Set")
    });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Task Created", `${parts[1]}`, parseFloat(parts[2]));
    await ctx.reply(`✅ Task '${parts[1]}' created!`);
    return;
  }

  if (state.startsWith("TASK_EDIT_TITLE_") && (await isAdmin(userId))) {
    let taskId = state.replace("TASK_EDIT_TITLE_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { title: text });
    await ctx.reply(`✅ Title updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    return;
  }
  if (state.startsWith("TASK_EDIT_REWARD_") && (await isAdmin(userId))) {
    let taskId = state.replace("TASK_EDIT_REWARD_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await Task.updateOne({ taskId }, { reward: amt });
    await ctx.reply(`✅ Reward updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    return;
  }
  if (state.startsWith("TASK_EDIT_LINK_") && (await isAdmin(userId))) {
    let taskId = state.replace("TASK_EDIT_LINK_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { link: text });
    await ctx.reply(`✅ Link updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    return;
  }
  if (state.startsWith("TASK_EDIT_CHANNEL_") && (await isAdmin(userId))) {
    let taskId = state.replace("TASK_EDIT_CHANNEL_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { alertChannel: text });
    await ctx.reply(`✅ Alert Channel updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    return;
  }

  if (state === "WAITING_REDEEM_CODES" && (await isAdmin(userId))) {
    delete userState[userId];
    return await saveCodes(text, "redeem", ctx);
  }
  if (state === "WAITING_AMAZON_CODES" && (await isAdmin(userId))) {
    delete userState[userId];
    return await saveCodes(text, "amazon", ctx);
  }
  if (state.startsWith("WAITING_GC_AMT_") && (await isAdmin(userId))) {
    let code = state.replace("WAITING_GC_AMT_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "redeem" }, { amount: amt });
    await ctx.reply(`✅ Amount: ₹${amt}`);
    return;
  }
  if (state.startsWith("WAITING_GC_MAX_") && (await isAdmin(userId))) {
    let code = state.replace("WAITING_GC_MAX_", "");
    delete userState[userId];
    let maxUses = parseInt(text);
    if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "redeem" }, { maxUses });
    await ctx.reply(`✅ Max: ${maxUses}`);
    return;
  }
  if (state.startsWith("WAITING_AMZ_AMT_") && (await isAdmin(userId))) {
    let code = state.replace("WAITING_AMZ_AMT_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "amazon" }, { amount: amt });
    await ctx.reply(`✅ Amount: ₹${amt}`);
    return;
  }
  if (state.startsWith("WAITING_AMZ_MAX_") && (await isAdmin(userId))) {
    let code = state.replace("WAITING_AMZ_MAX_", "");
    delete userState[userId];
    let maxUses = parseInt(text);
    if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "amazon" }, { maxUses });
    await ctx.reply(`✅ Max: ${maxUses}`);
    return;
  }

  if (state === "WAITING_BOT_OFF_TEXT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("bot_off_text", text);
    await ctx.reply(`✅ Bot OFF message updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_bot_status") });
    return;
  }

  if (state === "ADD_CHANNEL_WAIT" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length !== 2) return ctx.reply("❌ Format: `ChannelID | InviteLink`", { parse_mode: "Markdown" });
    let channelId = parts[0];
    let inviteLink = parts[1];
    if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) return ctx.reply("❌ Invalid Channel ID!");
    if (!inviteLink.startsWith("https://t.me/")) return ctx.reply("❌ Invalid Invite Link!");
    let channelTitle = "";
    try {
      let chatInfo = await ctx.api.getChat(channelId);
      channelTitle = chatInfo.title || channelId;
      let botInfo = await ctx.api.getMe();
      let botMember = await ctx.api.getChatMember(channelId, botInfo.id);
      if (!["administrator", "creator"].includes(botMember.status)) return ctx.reply("❌ Bot must be admin in channel!");
    } catch (e) {
      return ctx.reply(`❌ Cannot access: ${e.message}`);
    }
    await Channel.create({ channelId, inviteLink, displayName: channelTitle, isActive: true });
    await ctx.reply(`✅ Channel Added!\n\n📢 ${channelTitle}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
    return;
  }

  if (state.startsWith("ADMUSER_WD_")) {
    let targetId = parseInt(state.replace("ADMUSER_WD_", ""), 10);
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid amount!");
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    if (targetUser.balance < amt) return ctx.reply("❌ User has insufficient balance!");
    targetUser.balance -= amt;
    targetUser.withdrawnTotal = (targetUser.withdrawnTotal || 0) + amt;
    await targetUser.save();
    await logBalanceHistory(targetId, "Admin Manual Withdraw", -amt);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Manual Withdraw", `₹${amt} from ${targetId}`, amt, targetId);
    await ctx.reply(`✅ Manually withdrew ₹${amt} from \`${targetId}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${targetId}`) });
    return;
  }

  // ✅ Ultra Pay / Gateway Withdraw Amount (from userState "WD_GW_AMT")
  if (state === "WD_GW_AMT") {
    delete userState[userId];
    let amount = parseFloat(text);
    let user = await getUser(userId);
    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
      return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
    }
    if (user.balance < amount) return ctx.reply("❌ Insufficient!");

    let gateway = await getActiveGateway();
    if (!gateway) return ctx.reply("❌ Gateway not configured!");

    let details = user.gatewayUpi || user.walletAccount;
    let gwName = gateway.name === "ULTRAPAY" ? "Ultra Pay" : gateway.name;

    userState[userId] = `WD_GW_CONFIRM_${gateway.name}_${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Confirm", `conf_gw_wd_${gateway.name}_${amount}`)
      .text("❌ Cancel", "canc_wd");
    return ctx.reply(
      `📋 *Withdrawal Summary*\n\n` +
      `⚡ Gateway: ${gwName}\n` +
      `💳 Details: \`${details}\`\n` +
      `💰 Amount: ₹${amount}\n\n` +
      `Confirm?`,
      { reply_markup: kb, parse_mode: "Markdown" }
    );
  }

  // Old-style WD_GW_AMT_ (compatibility)
  if (state.startsWith("WD_GW_AMT_")) {
    let gwName = state.replace("WD_GW_AMT_", "");
    delete userState[userId];
    let amount = parseFloat(text);
    let user = await getUser(userId);
    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
      return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
    }
    if (user.balance < amount) return ctx.reply("❌ Insufficient!");
    let details = user.gatewayUpi || user.walletAccount;
    userState[userId] = `WD_GW_CONFIRM_${gwName}_${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Confirm", `conf_gw_wd_${gwName}_${amount}`)
      .text("❌ Cancel", "canc_wd");
    return ctx.reply(
      `📋 *Withdrawal Summary*\n\nGateway: ${gwName}\nDetails: \`${details}\`\nAmount: ₹${amount}\n\nConfirm?`,
      { reply_markup: kb, parse_mode: "Markdown" }
    );
  }

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

  if (state === "GATEWAY_WAIT_UPI" || state.startsWith("GATEWAY_WAIT_UPI_")) {
    delete userState[userId];
    let upi = text.trim();
    if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format!");
    let user = await getUser(userId);
    user.gatewayUpi = upi;
    if (!user.walletAccount || user.walletAccount === "Not Set") user.walletAccount = upi;
    await user.save();

    let gateway = await getActiveGateway();
    let gwName = gateway ? (gateway.name === "ULTRAPAY" ? "Ultra Pay" : gateway.name) : "Ultra Pay";

    return ctx.reply(
      `✅ *UPI Saved for ${gwName}!*\n\n📌 \`${upi}\`\n\nNow you can use ${gwName} for withdrawal.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text(`🚀 Withdraw via ${gwName}`, "wd_gateway_withdraw").row().text("🔙 Main Menu", "back_to_balance")
      }
    );
  }

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

  if (state === "USET_WAIT_WALLET") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
    return ctx.reply(`✅ Wallet saved: <code>${text.trim()}</code>`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
  }
  if (state === "USET_WAIT_UPI") {
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
    return ctx.reply(`✅ UPI saved: <code>${text.trim()}</code>`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
  }
  if (state === "USET_WAIT_BANK_ACCNO") {
    if (!text.trim()) return ctx.reply("❌ Invalid!");
    userState[userId] = `USET_WAIT_BANK_IFSC_${text.trim()}`;
    return ctx.reply(`🏦 Send IFSC Code:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_edit_payment") });
  }
  if (state.startsWith("USET_WAIT_BANK_IFSC_")) {
    let accNo = state.replace("USET_WAIT_BANK_IFSC_", "");
    delete userState[userId];
    await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim().toUpperCase() });
    return ctx.reply(`✅ Bank saved!`, { reply_markup: await buildKeyboardFromLayout(userId) });
  }
  if (state.startsWith("USET_WAIT_KB_RENAME_")) {
    let idx = parseInt(state.replace("USET_WAIT_KB_RENAME_", ""), 10);
    delete userState[userId];
    let layout = await getCurrentKeyboardLayoutForUser(userId);
    if (idx < 0 || idx >= layout.length) return ctx.reply("❌ Invalid");
    layout[idx].name = text.trim();
    await saveUserKeyboard(userId, layout);
    return ctx.reply(`✅ Renamed to: ${text.trim()}`, { reply_markup: await buildKeyboardFromLayout(userId) });
  }

  if (state.startsWith("TASK_REFER_")) {
    let taskId = state.replace("TASK_REFER_", "");
    delete userState[userId];
    let task = await Task.findOne({ taskId });
    if (!task) return ctx.reply("❌ Task not found");
    if (task.completedUsers.includes(userId)) return ctx.reply("❌ Already completed!");
    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    let user = await getUser(userId);
    await TaskSubmission.create({
      submissionId, userId, userName: user.firstName || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: `REFER: ${text.trim()}`, status: "Pending"
    });
    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel : await getConfig("default_task_alert_channel", null);
    if (alertChannel && alertChannel !== "Not Set") {
      let caption = `📸 *Task Submission (Refer)*\n\n👤 *${user.firstName || "User"}*\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 \`${text.trim()}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendMessage(alertChannel, caption, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
    return ctx.reply(`⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
  }

  return next();
});

// ============================================================
// 👤 USER WITHDRAW START (from Live Tracker)
// ============================================================
bot.callbackQuery(/^user_wd_start_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_start_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return ctx.answerCallbackQuery({ text: "User not found", show_alert: true });
  userState[ctx.from.id] = `ADMUSER_WD_${uid}`;
  await ctx.editMessageText(
    `🚀 *Manual Withdraw*\n\n👤 User: ${user.firstName || "User"}\n🆔 \`${uid}\`\n💰 Balance: ₹${user.balance.toFixed(2)}\n\n📝 Send amount to withdraw:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }
  ).catch(() => {});
});

// ============================================================
// 🚀 FINAL BOT STARTUP
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
    await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    await getConfig("welcome_channel_link", "https://t.me/yourchannel");
    await getConfig("bot_active", true);
    await getConfig("quick_pay_tax_enabled", false);
    await getConfig("quick_pay_tax_percent", 0);
    await getConfig("new_user_notif", true);
    await getConfig("broadcast_msg_send", true);
    await getConfig("kb_update_msg_send", true);
    await getConfig("kb_update_msg", "🎨 Keyboard Updated!\nYour keyboard has been updated successfully.");
    await getConfig("admin_panel_msg_send", true);
    await getConfig("admin_panel_update_msg", "🎨 Admin Panel Updated!\nYour panel has been updated.");

    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) await LiveFund.create({ key: "main_fund" });

    let wsCount = await WithdrawSettings.countDocuments({});
    if (wsCount === 0) {
      const defaults = [
        { method: "upi", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
        { method: "bank", isActive: true, minAmount: 100, maxAmount: 50000, taxPercent: 0 },
        { method: "wallet", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
        { method: "amazon", isActive: false, minAmount: 100, maxAmount: 5000, taxPercent: 0 },
        { method: "redeem", isActive: false, minAmount: 50, maxAmount: 2000, taxPercent: 0 }
      ];
      for (let d of defaults) await WithdrawSettings.create(d);
    }

    let apiKey = await getConfig("auto_upi_api_key", null);
    if (!apiKey) {
      apiKey = "KEY_" + crypto.randomBytes(16).toString("hex");
      await setConfig("auto_upi_api_key", apiKey);
      console.log("🔐 Generated new API Key:", apiKey);
    }

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
// 🌐 EXPRESS SERVER START
// ============================================================
let serverStarted = false;

if (!serverStarted) {
  serverStarted = true;

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT} on 0.0.0.0`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} already in use. Retrying in 2s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, "0.0.0.0");
      }, 2000);
    } else {
      console.error('❌ Server error:', err);
    }
  });

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Closing server...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received. Closing server...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

console.log("✅ bot.js loaded — Complete bot with all features");
console.log("✅ Gateway Steps system active!");
console.log("✅ Auto Withdrawal via Ultra Pay / URL Gateway!");
