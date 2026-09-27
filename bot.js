// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + GATEWAY SYSTEM (Final v3)
// Complete Working Bot - All Features + All Bug Fixes
// ============================================================
require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, InputFile } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

// ============================================================
// ⚡ CACHE
// ============================================================
const configCache = {
  data: {},
  loaded: false,
  lastLoad: 0
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
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  lastName: { type: String, default: "" },
  username: { type: String, default: "" },
  balance: { type: Number, default: 0 },
  walletId: { type: String, default: "" },
  walletAccount: { type: String, default: "Not Set" },
  upiId: { type: String, default: "Not Set" },
  bankAccNo: { type: String, default: "Not Set" },
  bankIfsc: { type: String, default: "Not Set" },
  amazonEmail: { type: String, default: "Not Set" },
  redeemCodeAddr: { type: String, default: "Not Set" },
  gatewayNumbers: { type: Map, of: String, default: {} },
  walletNumber: { type: String, default: "" },
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// ---------- USER PREFERENCE ----------
const userPreferenceSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  keyboardLayout: { type: Array, default: null },
  inlineMenus: { type: Object, default: {} },
  adminPanelLayout: { type: Array, default: null },
  updatedAt: { type: Date, default: Date.now }
});
const UserPreference = mongoose.models.UserPreference || mongoose.model("UserPreference", userPreferenceSchema);

// ---------- BOT ADMIN ----------
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
  taskType: { type: String, default: "photo" },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

// ---------- GIFT CODE ----------
const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, default: "redeem" },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] },
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
  isGateway: { type: Boolean, default: false },
  gatewayName: { type: String, default: "" },
  gatewayResponse: { type: String, default: "" },
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

// ---------- ADMIN LOG ----------
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

// ---------- ADD FUND (MANUAL ONLY) ----------
const addFundSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  amount: { type: Number, required: true },
  utr: { type: String, default: "" },
  photoFileId: { type: String, default: "" },
  status: { type: String, default: "Pending" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AddFund = mongoose.models.AddFund || mongoose.model("AddFund", addFundSchema);

// ---------- UPI PAYMENT ----------
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
  isActive: { type: Boolean, default: true },
  addedAt: { type: Date, default: Date.now }
});
const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

// ---------- SOCIAL LINK ----------
const socialLinkSchema = new mongoose.Schema({
  name: { type: String, required: true },
  link: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
});
const SocialLink = mongoose.models.SocialLink || mongoose.model("SocialLink", socialLinkSchema);

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
  url_template: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Number, default: null },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);

// ---------- WITHDRAW SETTINGS ----------
const withdrawSettingsSchema = new mongoose.Schema({
  method: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  minAmount: { type: Number, default: 10 },
  maxAmount: { type: Number, default: 10000 },
  taxPercent: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});
const WithdrawSettings = mongoose.models.WithdrawSettings || mongoose.model("WithdrawSettings", withdrawSettingsSchema);

// ---------- LIVE FUND ----------
const liveFundSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main_fund" },
  totalFund: { type: Number, default: 0 },
  usedFund: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
const LiveFund = mongoose.models.LiveFund || mongoose.model("LiveFund", liveFundSchema);

// ---------- BROADCAST ----------
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

// ---------- NEW USER LOG ----------
const newUserLogSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  firstName: { type: String, default: "" },
  username: { type: String, default: "" },
  startTime: { type: Date, default: Date.now }
});
const NewUserLog = mongoose.models.NewUserLog || mongoose.model("NewUserLog", newUserLogSchema);

// ============================================================
// 🔧 CONFIG HELPERS
// ============================================================
async function preloadAllConfigs() {
  try {
    let allConfigs = await Config.find({}).lean();
    let newData = {};
    for (let conf of allConfigs) {
      newData[conf.key] = conf.value;
    }
    configCache.data = newData;
    configCache.loaded = true;
    configCache.lastLoad = Date.now();
    console.log(`⚡ Configs preloaded: ${allConfigs.length} keys`);
  } catch (e) {
    console.error("Config preload error:", e.message);
  }
}

async function getConfig(key, defaultValue) {
  if (configCache.data[key] !== undefined) {
    return configCache.data[key];
  }
  let conf = await Config.findOne({ key }).lean();
  let value = conf ? conf.value : defaultValue;
  configCache.data[key] = value;
  return value;
}

async function setConfig(key, value) {
  configCache.data[key] = value;
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}

// ============================================================
// 🔧 ADMIN HELPERS
// ============================================================
async function isAdmin(userId) {
  try {
    if (Number(userId) === Number(MAIN_OWNER_ID)) return true;
    let ownerId = configCache.data["owner_id"] ?? await getConfig("owner_id", MAIN_OWNER_ID);
    if (Number(userId) === Number(ownerId)) return true;
    let botAdmin = await BotAdmin.findOne({ userId, isActive: true }).lean();
    if (botAdmin) return true;
    return false;
  } catch (e) { return false; }
}

async function isAdminDisabled(userId) {
  try {
    let botAdmin = await BotAdmin.findOne({ userId, isActive: false }).lean();
    return !!botAdmin;
  } catch (e) { return false; }
}

async function isOwner(userId) {
  let ownerId = configCache.data["owner_id"] ?? await getConfig("owner_id", MAIN_OWNER_ID);
  return Number(userId) === Number(ownerId) || Number(userId) === Number(MAIN_OWNER_ID);
}

// ============================================================
// 🔧 USER HELPERS
// ============================================================
async function getUser(userId) {
  return await User.findOneAndUpdate(
    { userId },
    { $setOnInsert: { walletId: userId.toString() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function checkForceJoin(ctx) {
  let channels = await Channel.find({ isActive: true }).lean();
  if (!channels || channels.length === 0) return true;

  let bannedAllowed = await getConfig("banned_in_channel_allowed", true);

  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch.channelId, ctx.from.id);

      if (member.status === "kicked") {
        if (bannedAllowed) continue;
        return false;
      }

      if (["left", "restricted"].includes(member.status)) {
        return false;
      }
    } catch (e) { }
  }
  return true;
}

// ============================================================
// 🔧 LOG HELPERS
// ============================================================
async function logBalanceHistory(userId, action, amount) {
  try {
    await BalanceHistory.create({ userId, action, amount });
  } catch (e) {
    console.error("logBalanceHistory:", e.message);
  }
}

async function logAdminAction(adminId, adminName, action, details = "", amount = 0, targetUserId = null) {
  try {
    await AdminLog.create({ adminId, adminName, action, details, amount, targetUserId });
  } catch (e) {
    console.error("logAdminAction:", e.message);
  }
}

// ============================================================
// 🔧 MASK FUNCTIONS
// ============================================================
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

// ============================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================
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

function convertOwnerLink(input) {
  let str = String(input || "").trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('tg://')) return str;
  if (str.startsWith('@')) return `https://t.me/${str.substring(1)}`;
  if (/^\d+$/.test(str)) return `tg://user?id=${str}`;
  return `https://t.me/${str}`;
}

function isValidTelegramID(input) {
  let str = String(input || "").trim();
  if (!str) return false;
  if (str.startsWith("https://t.me/")) return true;
  if (str.startsWith("tg://user?id=")) return true;
  if (/^\d+$/.test(str)) return true;
  let cleanUsername = str.replace(/^@/, '');
  if (/^[a-zA-Z0-9_]{5,32}$/.test(cleanUsername)) return true;
  return false;
}

function toSmallCaps(text) {
  const map = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
    'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
    's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
  };
  return String(text).split('').map(c => map[c.toLowerCase()] || c).join('');
}

// ============================================================
// 📝 DEFAULT CONFIG
// ============================================================
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: "📋 BOT TASK", key: "btn_tasks", row: 0, hidden: false },
  { name: "💸 MY BALANCE", key: "btn_balance", row: 0, hidden: false },
  { name: "🎁 GIFT CODE", key: "btn_gift", row: 1, hidden: false },
  { name: "⚡ QUICK PAY", key: "btn_quickpay", row: 1, hidden: false },
  { name: "💳 PAYOUT METHOD", key: "btn_payout", row: 2, hidden: false },
  { name: "🚀 WITHDRAW", key: "btn_withdraw", row: 2, hidden: false }
];

const DEFAULT_ADMIN_PANEL_LAYOUT = [
  { name: "👮 Add/Remove Admins Permission", key: "adm_permissions", row: 0, hidden: false },
  { name: "👑 Transfer Ownership", key: "adm_transfer", row: 1, hidden: false },
  { name: "💰 Set Withdraw Tax", key: "adm_set_wd_tax", row: 1, hidden: false },
  { name: "🎨 Customize Your Theme", key: "adm_customize_theme", row: 2, hidden: false },
  { name: "👮 Manage Admins", key: "adm_admins", row: 2, hidden: false },
  { name: "🚫 Manage Ban Users", key: "adm_manage_ban", row: 3, hidden: false },
  { name: "🤖 Bot Status", key: "adm_bot_status", row: 3, hidden: false },
  { name: "🚫 Manage Ban Wallet", key: "adm_manage_ban_wallet", row: 4, hidden: false },
  { name: "💸 Withdraw Status", key: "adm_wd_status", row: 4, hidden: false },
  { name: "➕ Add Balance", key: "adm_add_bal", row: 5, hidden: false },
  { name: "➖ Remove Balance", key: "adm_rem_bal", row: 5, hidden: false },
  { name: "⚡ Manage Your Channels", key: "adm_manage_channels", row: 6, hidden: false },
  { name: "⚠️ Reset Balance", key: "adm_reset_all_bal", row: 6, hidden: false },
  { name: "📢 Broadcast", key: "adm_broadcast", row: 7, hidden: false },
  { name: "💬 Talk With User", key: "adm_talk_user", row: 7, hidden: false },
  { name: "📊 Manage Withdraw", key: "adm_manage_withdraw", row: 8, hidden: false },
  { name: "🔍 Find User Details", key: "adm_find_user", row: 8, hidden: false },
  { name: "📊 Status", key: "adm_status", row: 9, hidden: false },
  { name: "🆕 New Users", key: "adm_new_users", row: 9, hidden: false },
  { name: "⚡ Quick Pay", key: "adm_quick_pay", row: 10, hidden: false },
  { name: "🏦 Gateway Setup", key: "adm_gateway_menu", row: 10, hidden: false },
  { name: "🎁 Gift Codes", key: "adm_create_gift", row: 11, hidden: false },
  { name: "🔔 New User Notification", key: "adm_user_notif", row: 11, hidden: false },
  { name: "🎁 Manage Redeem Codes", key: "adm_redeem", row: 12, hidden: false },
  { name: "📧 Manage Amazon Codes", key: "adm_amazon", row: 12, hidden: false },
  { name: "📋 Manage Tasks", key: "adm_tasks_manager", row: 13, hidden: false },
  { name: "💬 Customer Support", key: "adm_support", row: 13, hidden: false },
  { name: "🚀 Recent Admin Actions", key: "adm_recent_actions", row: 14, hidden: false },
  { name: "🔄 Refresh Panel", key: "admin", row: 14, hidden: false }
];

const DEFAULT_BALANCE_TEXT = {
  welcome: "⭐ Welcome To Bot!",
  footer: "❝ Built with security you can Trust.\nSupport that responds promptly ❞"
};

const DEFAULT_START_TEXT = {
  title: "💫 Welcome To Task Payment Bot!",
  linkText: "How To Earn → (((CLICK HERE)))"
};

console.log("✅ Part 1 Loaded — Setup + Schemas + Helpers");
// ============================================================
// 🌐 GATEWAY PAYOUT PROCESSOR
// ============================================================
async function processGatewayPayout({
  bot, userId, amount, gatewayInfo, wallet, channelList = [], showRemainingBalance = true
}) {
  try {
    let urlTemplate = gatewayInfo.url_template || gatewayInfo.url || "";
    let finalUrl = urlTemplate
      .replace(/{wallet}/g, encodeURIComponent(wallet))
      .replace(/{amount}/g, encodeURIComponent(amount))
      .replace(/{userId}/g, encodeURIComponent(userId))
      .replace(/{orderId}/g, encodeURIComponent("WD" + Date.now()))
      .replace(/{txnId}/g, encodeURIComponent("TXN" + Date.now()))
      .replace(/{timestamp}/g, encodeURIComponent(Date.now()));

    console.log(`🌐 Gateway [${gatewayInfo.name}] URL:`, finalUrl);

    let response;
    let resData;
    try {
      response = await axios.get(finalUrl, { timeout: 30000 });
      try { resData = JSON.stringify(response.data); }
      catch (e) { resData = String(response.data); }
    } catch (apiErr) {
      console.error("Gateway API Error:", apiErr.message);
      return { status: 'error', message: apiErr.message || 'Gateway request failed' };
    }

    let isSuccess = false;
    let txnNumber = null;
    try {
      let data = response.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) {} }
      if (data && typeof data === 'object') {
        isSuccess =
          data.status === 'success' || data.status === 'Success' ||
          data.status === 'SUCCESS' || data.success === true ||
          data.status === 'ok' || data.status === 'OK' ||
          data.result === 'ok' || data.result === 'success' ||
          data.code === 200 || data.code === '200';
        txnNumber = data.txn_id || data.txnNumber || data.transaction_id || data.txnId || null;
      }
      if (!isSuccess && resData && /success|completed|done|paid/i.test(resData)) isSuccess = true;
    } catch (parseErr) { console.error("Parse error:", parseErr.message); }

    if (!isSuccess) {
      return { status: 'failed', message: 'Gateway declined the transaction', rawResponse: resData ? resData.substring(0, 300) : '' };
    }

    let user = await User.findOne({ userId });
    if (!user) return { status: 'error', message: 'User not found' };
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
    await user.save();

    let newBalance = user.balance;
    await logBalanceHistory(userId, `Withdrawn via ${gatewayInfo.name}`, -amount);
    let botUsername = bot.botInfo ? bot.botInfo.username : "Bot";

    let msg = `✅ *New Withdrawal Processed* ✅\n\n🟢 *User :* \`${userId}\`\n`;
    if (showRemainingBalance) msg += `🤘 *Remaining Balance :-* \`${newBalance}\`\n`;
    msg += `\n🚀 *Amount :* \`${amount} INR (-)\`\n⛔ *Address :* \`${wallet}\`\n\n💡 *Bot:* @${botUsername}\n\n⚠️ *${gatewayInfo.name} Response:*\n\`${resData}\``;

    for (let ch of channelList) {
      if (!ch) continue;
      try { await bot.api.sendMessage(ch, msg, { parse_mode: "Markdown" }); }
      catch (channelErr) { console.error(`Failed to send to channel ${ch}:`, channelErr.message); }
    }

    return { status: 'success', txnNumber: txnNumber || generateTxnNumber(), rawResponse: resData };
  } catch (e) {
    console.error("Transaction Error:", e.message);
    return { status: 'error', message: e.message };
  }
}

// ============================================================
// 🧾 RECEIPT PAGE
// ============================================================
app.get("/receipt/:id", async (req, res) => {
  try {
    let wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd) return res.status(404).send("<h2 style='color:white;background:#111;text-align:center;padding:50px;'>Receipt not found!</h2>");

    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerName = await getConfig("owner_display_name", null);
    let ownerLink = await getConfig("owner_display_link", null);
    if (!ownerName) {
      let ownerUser = await User.findOne({ userId: ownerId });
      ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    }
    if (!ownerLink) ownerLink = ownerId.toString();
    let finalOwnerLink = convertOwnerLink(ownerLink);

    let isSuccess = wd.status === "Approved";
    let isFailed = wd.status === "Rejected" || wd.status === "Failed";
    let statusTitle = isSuccess ? "TRANSFER COMPLETE" : (isFailed ? "TRANSFER FAILED" : "TRANSFER PENDING");
    let statusSubtitle = isSuccess ? "FUNDS CREDITED" : (isFailed ? "TRANSACTION REJECTED" : "PROCESSING PAYMENT");
    let accentColor = isSuccess ? "#00ffcc" : (isFailed ? "#ff4d4d" : "#ffa500");
    let iconSvg = isSuccess ? "&#10003;" : (isFailed ? "&#10005;" : "&#8943;");

    let displayTxn = wd.txnNumber && wd.txnNumber !== "" ? wd.txnNumber : wd.withdrawalId;
    let gatewayDisplay = wd.gatewayName && wd.gatewayName !== "" ? wd.gatewayName : (wd.isGateway ? "GATEWAY" : "MANUAL");
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
      .status-rejected,.status-failed{background:rgba(255,77,77,0.15);color:#ff4d4d;border:1px solid #ff4d4d;}
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
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value mono">TXN${escapeHtml(wd.withdrawalId)}</span></div>
      <div class="info-row"><span class="info-title">GATEWAY</span><span class="info-value">${escapeHtml(gatewayDisplay)}</span></div>
      <div class="info-row"><span class="info-title">APPROVED BY</span><span class="info-value">${escapeHtml(approvedBy)}</span></div>
      <div class="info-row"><span class="info-title">DATE</span><span class="info-value">${displayDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
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
  } catch (e) { res.status(500).send("Error"); }
});

app.get("/", (req, res) => res.send("Bot Server Live!"));

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

// ============================================================
// 📱 MINI APP PAGE ROUTES
// ============================================================
app.get("/miniapp", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/miniapp/addfund", (req, res) => res.sendFile(path.join(__dirname, "public", "addfund.html")));
app.get("/miniapp/withdraw", (req, res) => res.sendFile(path.join(__dirname, "public", "withdraw.html")));
app.get("/miniapp/task", (req, res) => res.sendFile(path.join(__dirname, "public", "task.html")));
app.get("/miniapp/pay", (req, res) => res.sendFile(path.join(__dirname, "public", "pay.html")));
app.get("/miniapp/profile", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/miniapp/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/miniapp/history", (req, res) => res.sendFile(path.join(__dirname, "public", "history.html")));

// ============================================================
// 🔧 RE-RENDER HELPER
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
// 🔧 KEYBOARD BUILDERS
// ============================================================
async function buildKeyboardFromLayout(userId) {
  let userPref = await UserPreference.findOne({ userId }).lean();
  let layout;

  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    layout = userPref.keyboardLayout;
  } else {
    layout = configCache.data["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
  }

  let keyboardRows = [];
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r && !b.hidden);
    if (rowButtons.length > 0) {
      let row = rowButtons.map(btn => ({ text: btn.name }));
      keyboardRows.push(row);
    }
  }
  if (keyboardRows.length === 0) {
    keyboardRows = [[{ text: "💸 MY BALANCE" }]];
  }
  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    is_persistent: false,
    one_time_keyboard: false
  };
}

async function getCurrentKeyboardLayoutForUser(userId) {
  let userPref = await UserPreference.findOne({ userId }).lean();
  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    return userPref.keyboardLayout;
  }
  return configCache.data["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
}

async function saveUserKeyboard(userId, layout) {
  await UserPreference.findOneAndUpdate(
    { userId },
    { keyboardLayout: layout, updatedAt: new Date() },
    { upsert: true }
  );
}

async function buildStyledKb(buttons) {
  return { inline_keyboard: buttons };
}

// ============================================================
// 🔧 GET ACTIVE BUTTONS
// ============================================================
async function getActiveKeyboardLayout() {
  let layout = configCache.data["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
  return layout.filter(b => !b.hidden);
}

async function getActiveAdminPanelLayout() {
  let layout = configCache.data["admin_panel_layout"] || DEFAULT_ADMIN_PANEL_LAYOUT;
  return layout.filter(b => !b.hidden);
}

console.log("✅ Part 2 Loaded — Gateway + Receipt + Helpers + Keyboards");
// ============================================================
// 📱 MINI APP — USER APIs
// ============================================================

app.get("/miniapp/api/user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId }).lean();
    if (!user) return res.json({ success: false, error: "User not found" });

    let linkedInfo = "Not Linked";
    if (user.walletNumber && user.walletNumber !== "") linkedInfo = `Wallet: ${user.walletNumber}`;
    else if (user.upiId && user.upiId !== "Not Set") linkedInfo = `UPI: ${user.upiId}`;
    else if (user.bankAccNo && user.bankAccNo !== "Not Set") linkedInfo = `Bank: ${user.bankAccNo}`;

    let gwNumbers = {};
    if (user.gatewayNumbers) {
      try { gwNumbers = Object.fromEntries(user.gatewayNumbers); } catch (e) { gwNumbers = {}; }
    }

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
        gatewayNumbers: gwNumbers,
        walletNumber: user.walletNumber || "",
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
    const user = await User.findOne({ userId }).lean();
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
    const tasks = await Task.find({}).lean();
    res.json({ success: true, tasks });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/total-balance", async (req, res) => {
  try {
    const users = await User.find({}).lean();
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    res.json({ success: true, totalBalance, totalUsers: users.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/check-user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId }).lean();
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
// 🆕 GATEWAY APIs
// ============================================================
app.get("/miniapp/api/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({ isActive: true }).lean();
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/gateway/save-number", async (req, res) => {
  try {
    const { userId, gatewayName, number } = req.body;
    const uid = parseInt(userId, 10);
    if (!uid || !gatewayName || !number) return res.json({ success: false, error: "Missing fields" });
    let user = await getUser(uid);
    if (!user.gatewayNumbers) user.gatewayNumbers = new Map();
    user.gatewayNumbers.set(gatewayName, String(number).trim());
    user.markModified('gatewayNumbers');
    if (!user.walletNumber || user.walletNumber === "") user.walletNumber = String(number).trim();
    await user.save();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/gateway/withdraw", async (req, res) => {
  try {
    const { userId, gatewayName, amount } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    if (!uid || !gatewayName || isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid data" });

    const gateway = await Gateway.findOne({ name: gatewayName, isActive: true });
    if (!gateway) return res.json({ success: false, error: "Gateway not found or inactive" });

    let user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    let wallet = "";
    if (user.gatewayNumbers && user.gatewayNumbers.get) {
      wallet = user.gatewayNumbers.get(gatewayName) || "";
    }
    if (!wallet) wallet = user.walletNumber || "";
    if (!wallet) return res.json({ success: false, error: "Please save your number first", needsNumber: true });

    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (amt < minW) return res.json({ success: false, error: `Min ₹${minW}` });
    if (amt > maxW) return res.json({ success: false, error: `Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    user.balance -= amt;
    await user.save();

    let payoutChannel = await getConfig("payout_channel_" + gatewayName.toLowerCase(), null);
    if (!payoutChannel) payoutChannel = await getConfig("payout_channel", null);
    let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];

    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

    let result = await processGatewayPayout({ bot, userId: uid, amount: amt, gatewayInfo: gateway, wallet, channelList, showRemainingBalance: true });

    if (result.status === 'success') {
      let txnNumber = result.txnNumber || generateTxnNumber();
      await Withdrawal.create({
        withdrawalId, userId: uid, userWithdrawalCount, amount: amt,
        method: gatewayName, details: wallet, status: "Approved",
        isGateway: true, gatewayName: gateway.name,
        gatewayResponse: result.rawResponse || "",
        txnNumber, approvedBy: "Auto Gateway", approvedAt: new Date()
      });

      await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amt } }, { upsert: true });

      try {
        await bot.api.sendMessage(uid,
          `✅ *Withdrawal Successful!*\n\n💰 Amount: ₹${amt}\n🌐 Gateway: ${gatewayName}\n📱 To: \`${wallet}\`\n🚀 TXN: \`${txnNumber}\`\n\n✅ Check your ${gatewayName} wallet!`,
          { parse_mode: "Markdown" });
      } catch (e) { }

      return res.json({ success: true, autoProcessed: true, withdrawalId, txnNumber });
    } else {
      user.balance += amt;
      await user.save();
      await logBalanceHistory(uid, `Withdrawal Failed (Refunded)`, amt);
      return res.json({ success: false, error: result.message || "Gateway failed" });
    }
  } catch (e) {
    console.error("Gateway withdraw error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 🚀 WITHDRAW API (Manual Methods — Min/Max FIXED)
// ============================================================
app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    let methodSetting = await WithdrawSettings.findOne({ method: method.toLowerCase() });
    if (methodSetting && !methodSetting.isActive) {
      return res.json({ success: false, error: `${method} is currently OFF` });
    }

    let details = "";
    if (method === "Wallet") details = user.walletAccount;
    else if (method === "UPI") details = user.upiId;
    else if (method === "Bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
    else if (method === "Amazon") details = user.amazonEmail;
    else if (method === "Redeem") details = user.redeemCodeAddr;
    else return res.json({ success: false, error: "Invalid method" });

    if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
      return res.json({ success: false, error: `${method} not linked! Please add it first.`, needsLink: true, method });
    }

    let minW = methodSetting ? methodSetting.minAmount : await getConfig("min_withdraw", 10);
    let maxW = methodSetting ? methodSetting.maxAmount : await getConfig("max_withdraw", 10000);
    if (isNaN(amt) || amt < minW || amt > maxW) {
      return res.json({ success: false, error: `Min ₹${minW} | Max ₹${maxW}` });
    }
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${method} (MiniApp)`, -amt);

    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    const withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

    await Withdrawal.create({
      withdrawalId, userId: uid, userWithdrawalCount,
      amount: amt, method, details, isGateway: false
    });

    let payoutChannel = await getConfig("payout_channel_" + method.toLowerCase(), null);
    if (!payoutChannel) payoutChannel = await getConfig("payout_channel", null);

    if (payoutChannel && payoutChannel !== "Not Set") {
      const adminKb = new InlineKeyboard()
        .text("✅ Approve", `wd_app_${withdrawalId}`)
        .text("❌ Reject", `wd_rej_${withdrawalId}`);
      const userLink = `<a href="tg://user?id=${uid}">${uid}</a>`;
      const hashTag = `<code>(#${userWithdrawalCount})</code>`;
      const methodIcon = method === 'UPI' ? '⚡' : method === 'Bank' ? '🏦' : '🌐';
      try {
        await bot.api.sendMessage(payoutChannel,
          `⚠️ <b>New ${method.toUpperCase()} Payout Request!</b> ${hashTag}\n\n` +
          `👤 <b>User:</b> ${userLink}\n` +
          `💰 <b>Request Amount:</b> <code>₹${amt}</code>\n` +
          `${methodIcon} <b>${method}:</b> <code>${details}</code>\n\n` +
          `📊 <b>Status:</b> ⏳ Pending`,
          { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
      } catch (e) { }
    }

    res.json({ success: true, withdrawalId });
  } catch (e) {
    console.error("Withdraw error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================
// ⚡ QUICK PAY API
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
    if (!isAdminUser && sender.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

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
      await logBalanceHistory(sId, `Quick Pay to ${rId}`, -amt);
    }
    await logBalanceHistory(rId, `Quick Pay from ${isAdminUser ? "Admin" : sId}`, receiverAmount);

    try {
      await bot.api.sendMessage(rId,
        `🎉 *Payment Received!*\n\n👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n🆔 \`${sId}\`\n💰 ₹${receiverAmount.toFixed(2)}\n\n💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) { }

    res.json({ success: true, newBalance: sender.balance, wasNegative, isAdmin: isAdminUser, tax: taxAmount });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/update-payment", async (req, res) => {
  try {
    const { userId, field, value } = req.body;
    const uid = parseInt(userId, 10);
    const allowed = ["walletAccount", "upiId", "bankAccNo", "bankIfsc", "amazonEmail", "redeemCodeAddr", "walletNumber"];
    if (!allowed.includes(field)) return res.json({ success: false, error: "Invalid field" });

    const update = {};
    update[field] = value;
    await User.findOneAndUpdate({ userId: uid }, update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 📸 SUBMIT TASK
// ============================================================
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

    const alertChannel = (task.alertChannel && task.alertChannel !== "Not Set") ? task.alertChannel : await getConfig("default_task_alert_channel", null);
    if (!alertChannel || alertChannel === "Not Set") return res.json({ success: false, error: "Task alert channel not set." });

    const caption = `📸 *New Task Submission (MiniApp)!*\n\n👤 ${userName}\n🆔 \`${uid}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*`;
    const kb = new InlineKeyboard().text("✅ Approve", `task_app_${submissionId}`).text("❌ Reject", `task_rej_${submissionId}`);

    let sentMsg;
    try {
      sentMsg = await bot.api.sendPhoto(alertChannel, new InputFile(buffer, "proof.jpg"), { caption, parse_mode: "Markdown", reply_markup: kb });
    } catch (e) { return res.json({ success: false, error: "Failed: " + e.message }); }

    const photoFileId = sentMsg.photo[sentMsg.photo.length - 1].file_id;
    await TaskSubmission.create({
      submissionId, userId: uid, userName,
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId, status: "Pending"
    });
    res.json({ success: true, submissionId });
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
    const alertChannel = (task.alertChannel && task.alertChannel !== "Not Set") ? task.alertChannel : await getConfig("default_task_alert_channel", null);
    if (!alertChannel || alertChannel === "Not Set") return res.json({ success: false, error: "Task alert channel not set." });

    await TaskSubmission.create({
      submissionId, userId: uid, userName,
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: `REFER: ${referValue}`, status: "Pending"
    });

    let caption = `📸 *Task Submission (Refer)*\n\n👤 *${userName}*\n🆔 \`${uid}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 \`${referValue}\``;
    let kb = new InlineKeyboard().text("✅ Approve", `task_app_${submissionId}`).text("❌ Reject", `task_rej_${submissionId}`);
    try { await bot.api.sendMessage(alertChannel, caption, { parse_mode: "Markdown", reply_markup: kb }); }
    catch (e) { return res.json({ success: false, error: "Failed: " + e.message }); }
    res.json({ success: true, submissionId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 💠 UPI SETTINGS + MANUAL VERIFY (NO AUTO)
// ============================================================
app.get("/miniapp/api/upi-settings", async (req, res) => {
  try {
    const minAmt = await getConfig("auto_upi_min", 5);
    const maxAmt = await getConfig("auto_upi_max", 200);
    const upiId = await getConfig("auto_upi_id", "payzy@upi");
    const enabled = await getConfig("auto_upi_enabled", true);
    res.json({ success: true, min: minAmt, max: maxAmt, upiId, enabled });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/upi/verify", async (req, res) => {
  try {
    const { userId, amount, utr, upiId } = req.body;
    if (!userId || !amount || !utr) return res.json({ success: false, error: "Missing fields" });
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
    if (existingUsed) return res.json({ success: false, error: "This UTR has already been used" });

    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const user = await getUser(uid);

    await UPIPayment.create({
      orderId, userId: uid, amount: amt,
      utr: cleanUtr, upiId: upiId || await getConfig("auto_upi_id", "payzy@upi"),
      status: "Pending", source: "miniapp-manual"
    });

    let payoutChannel = await getConfig("payout_channel_upi", null);
    if (!payoutChannel) payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel && payoutChannel !== "Not Set") {
      const kb = new InlineKeyboard().text("✅ Approve", `upi_app_${orderId}`).text("❌ Reject", `upi_rej_${orderId}`);
      try {
        await bot.api.sendMessage(payoutChannel,
          `💰 <b>UPI Deposit Request</b>\n\n<b>User:</b> ${user.firstName || "User"}\n<b>ID:</b> <code>${uid}</code>\n<b>Amount:</b> ₹${amt}\n<b>UTR:</b> <code>${cleanUtr}</code>\n<b>Order:</b> <code>${orderId}</code>`,
          { parse_mode: "HTML", reply_markup: kb });
      } catch (e) { }
    }
    return res.json({ success: true, mode: "manual", newBalance: user.balance });
  } catch (e) {
    console.error("UPI verify error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 📜 USER HISTORY API
// ============================================================
app.get("/miniapp/api/user/:userId/history", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit, 10) || 100;
    const [withdrawals, deposits, transfers, balanceHistory] = await Promise.all([
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      UPIPayment.find({ userId, status: "Approved" }).sort({ createdAt: -1 }).limit(100).lean(),
      BalanceHistory.find({ userId, action: { $regex: /Quick Pay|Admin Quick Pay/i } }).sort({ createdAt: -1 }).limit(100).lean(),
      BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(200).lean()
    ]);
    let allHistory = [];
    withdrawals.forEach(w => {
      allHistory.push({
        action: `Withdrawal (${w.method})`,
        amount: -w.amount,
        status: w.status === "Approved" ? "success" : (w.status === "Rejected" || w.status === "Failed" ? "failed" : "pending"),
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

console.log("✅ Part 3 Loaded — Mini App User APIs");
// ============================================================
// 👑 MINI APP ADMIN APIs
// ============================================================

// ---------- PENDING WITHDRAWALS ----------
app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try {
    const wds = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
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

    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n🏦 Destination ==> ${wd.details}\n🚀Transaction ID ==> ${txnNumber}\n🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n✅Please Check Your ${wd.method} Account!`);
    } catch (e) { }
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
    try { await bot.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- PENDING ADD FUNDS ----------
app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
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
      await bot.api.sendMessage(af.userId, `✅ *Add Fund Approved!*\n\n💰 ₹${af.amount}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown" });
    } catch (e) { }
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
    try { await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}`); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- PENDING TASK SUBMISSIONS ----------
app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
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
      await bot.api.sendMessage(sub.userId, `🎉 *Payment Received!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}\n✅ Approved`, { parse_mode: "Markdown" });
    } catch (e) { }
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
      await bot.api.sendMessage(sub.userId, `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`, { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- PENDING UPI PAYMENTS ----------
app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try {
    const pending = await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, payments: pending });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
      const styledTitle = toSmallCaps("Deposit Approved!");
      const styledAdded = toSmallCaps("Added:");
      const styledUTR = toSmallCaps("UTR:");
      await bot.api.sendMessage(payment.userId,
        `💫 ✅ ${styledTitle}\n\n💰 ${styledAdded} ₹${payment.amount}\n🔐 ${styledUTR} ${payment.utr}`,
        { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Rejected") return res.json({ success: false, error: "Already processed" });
    payment.status = "Rejected";
    payment.approvedBy = "MiniApp Admin";
    await payment.save();
    try {
      await bot.api.sendMessage(payment.userId, `❌ *Deposit Rejected*\n\n💰 ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\``, { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- ALL USERS ----------
app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100).lean();
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-detail/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId: uid }).lean();
    if (!user) return res.json({ success: false, error: "User not found" });
    const [withdrawCount, approvedCount, rejectedCount, pendingCount, depositCount, balanceHistoryCount] = await Promise.all([
      Withdrawal.countDocuments({ userId: uid }),
      Withdrawal.countDocuments({ userId: uid, status: "Approved" }),
      Withdrawal.countDocuments({ userId: uid, status: "Rejected" }),
      Withdrawal.countDocuments({ userId: uid, status: "Pending" }),
      UPIPayment.countDocuments({ userId: uid }),
      BalanceHistory.countDocuments({ userId: uid })
    ]);
    res.json({
      success: true, user,
      counts: { withdraw: withdrawCount, approved: approvedCount, rejected: rejectedCount, pending: pendingCount, deposit: depositCount, balanceHistory: balanceHistoryCount }
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-withdrawals/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, withdrawals });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-deposits/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const deposits = await UPIPayment.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, deposits });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-balance-history/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, history });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- BALANCE MANAGEMENT ----------
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
    try { await bot.api.sendMessage(uid, `💰 Balance Updated!\n\n📉 Removed: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`); } catch (e) { }
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
    try { await bot.api.sendMessage(uid, `💰 Balance Updated!\n\n🟢 Added: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`); } catch (e) { }
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
    } catch (e) { res.json({ success: false, error: "Failed to send" }); }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- GATEWAY ADMIN ----------
app.get("/miniapp/api/admin/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/create", async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.json({ success: false, error: "Missing fields" });
    let existing = await Gateway.findOne({ name: name.toUpperCase() });
    if (existing) return res.json({ success: false, error: "Gateway exists" });
    await Gateway.create({ name: name.toUpperCase(), url: url.trim(), url_template: url.trim(), isActive: true });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/toggle/:name", async (req, res) => {
  try {
    const gw = await Gateway.findOne({ name: req.params.name });
    if (!gw) return res.json({ success: false, error: "Not found" });
    gw.isActive = !gw.isActive;
    gw.updatedAt = new Date();
    await gw.save();
    res.json({ success: true, isActive: gw.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/delete/:name", async (req, res) => {
  try {
    await Gateway.deleteOne({ name: req.params.name });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ⚙️ SETTINGS APIs
// ============================================================
app.get("/miniapp/api/admin/settings", async (req, res) => {
  try {
    const settings = {
      min_withdraw: await getConfig("min_withdraw", 10),
      max_withdraw: await getConfig("max_withdraw", 10000),
      tax_percent: await getConfig("tax_percent", 0),
      payout_channel: await getConfig("payout_channel", "Not Set"),
      payout_channel_upi: await getConfig("payout_channel_upi", "Not Set"),
      payout_channel_wallet: await getConfig("payout_channel_wallet", "Not Set"),
      payout_channel_bank: await getConfig("payout_channel_bank", "Not Set"),
      payout_channel_amazon: await getConfig("payout_channel_amazon", "Not Set"),
      payout_channel_redeem: await getConfig("payout_channel_redeem", "Not Set"),
      addfund_channel: await getConfig("addfund_channel", "Not Set"),
      support_username: await getConfig("support_username", "Not Set"),
      bot_active: await getConfig("bot_active", true),
      auto_upi_enabled: await getConfig("auto_upi_enabled", true),
      balance_footer_text: await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer),
      balance_welcome_text: await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome),
      start_title_text: await getConfig("start_title_text", DEFAULT_START_TEXT.title),
      start_link_text: await getConfig("start_link_text", DEFAULT_START_TEXT.linkText),
      welcome_channel_link: await getConfig("welcome_channel_link", ""),
      auto_upi_id: await getConfig("auto_upi_id", "payzy@upi"),
      auto_upi_min: await getConfig("auto_upi_min", 5),
      auto_upi_max: await getConfig("auto_upi_max", 200),
      quick_pay_tax_enabled: await getConfig("quick_pay_tax_enabled", false),
      quick_pay_tax_percent: await getConfig("quick_pay_tax_percent", 0),
      owner_display_name: await getConfig("owner_display_name", null),
      owner_display_link: await getConfig("owner_display_link", null)
    };
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/settings/update", async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = [
      "min_withdraw", "max_withdraw", "tax_percent",
      "payout_channel", "payout_channel_upi", "payout_channel_wallet",
      "payout_channel_bank", "payout_channel_amazon", "payout_channel_redeem",
      "addfund_channel", "support_username", "bot_active",
      "auto_upi_enabled", "balance_footer_text", "balance_welcome_text",
      "start_title_text", "start_link_text", "welcome_channel_link",
      "auto_upi_id", "auto_upi_min", "auto_upi_max",
      "quick_pay_tax_enabled", "quick_pay_tax_percent",
      "owner_display_name", "owner_display_link"
    ];
    if (!allowed.includes(key)) return res.json({ success: false, error: "Invalid key" });
    await setConfig(key, value);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/broadcast", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });
    const users = await User.find({}).lean();
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
// 👑 ADMIN LIST / LOGS
// ============================================================
app.get("/miniapp/api/admin/list", async (req, res) => {
  try {
    const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    const ownerUser = await User.findOne({ userId: ownerId }).lean();
    const admins = await BotAdmin.find({}).sort({ addedAt: -1 }).lean();
    let list = [{ userId: ownerId, name: ownerUser?.firstName || "Owner", role: "owner" }];
    for (let a of admins) {
      let u = await User.findOne({ userId: a.userId }).lean();
      list.push({ userId: a.userId, name: u?.firstName || "Admin", role: a.isActive ? "admin" : "disabled" });
    }
    res.json({ success: true, admins: list });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/add", async (req, res) => {
  try {
    const { userId: newAdminId, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    const nId = parseInt(newAdminId, 10);
    if (!(await isOwner(reqId))) return res.json({ success: false, error: "Owner only" });
    const targetUser = await User.findOne({ userId: nId });
    if (!targetUser) return res.json({ success: false, error: "User not found" });
    await BotAdmin.findOneAndUpdate({ userId: nId }, { addedAt: new Date(), addedBy: reqId, isActive: true }, { upsert: true });
    await logAdminAction(reqId, "Owner", "Admin Added", `Added ${nId}`, 0, nId);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/remove/:id", async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.json({ success: false, error: "Owner only" });
    await BotAdmin.deleteOne({ userId: adminId });
    await logAdminAction(reqId, "Owner", "Admin Removed", `Removed ${adminId}`, 0, adminId);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/toggle-admin/:id", async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.json({ success: false, error: "Owner only" });
    const admin = await BotAdmin.findOne({ userId: adminId });
    if (!admin) return res.json({ success: false, error: "Admin not found" });
    admin.isActive = !admin.isActive;
    if (!admin.isActive) { admin.disabledAt = new Date(); admin.disabledBy = reqId; }
    else { admin.disabledAt = null; admin.disabledBy = null; }
    await admin.save();
    await logAdminAction(reqId, "Owner", admin.isActive ? "Admin Enabled" : "Admin Disabled", `${adminId}`, 0, adminId);
    res.json({ success: true, isActive: admin.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/transfer-owner", async (req, res) => {
  try {
    const { newOwnerId, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    const nId = parseInt(newOwnerId, 10);
    if (!(await isOwner(reqId))) return res.json({ success: false, error: "Owner only" });
    const targetUser = await User.findOne({ userId: nId });
    if (!targetUser) return res.json({ success: false, error: "User not found" });
    await BotAdmin.findOneAndUpdate({ userId: reqId }, { addedAt: new Date(), addedBy: reqId, isActive: true }, { upsert: true });
    await setConfig("owner_id", nId);
    await logAdminAction(reqId, "Owner", "Ownership Transferred", `New owner: ${nId}`, 0, nId);
    try { await bot.api.sendMessage(nId, `👑 Congratulations! You are now the OWNER of this bot!`); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 📊 ADMIN LOGS
// ============================================================
app.get("/miniapp/api/admin/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, logs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🌐 STATEMENTS
// ============================================================
app.get("/miniapp/api/admin/statements", async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    let query = {};
    if (filter === "approved") query.status = "Approved";
    else if (filter === "rejected") query.status = "Rejected";
    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 }).limit(100).lean();
    let results = [];
    for (let w of withdrawals) {
      const user = await User.findOne({ userId: w.userId }).lean();
      results.push({
        withdrawalId: w.withdrawalId, userId: w.userId,
        userName: user?.firstName || "User", username: user?.username || "",
        amount: w.amount, method: w.method, status: w.status,
        txnNumber: w.txnNumber, createdAt: w.createdAt, approvedAt: w.approvedAt,
        receiptUrl: `/receipt/${w.withdrawalId}`
      });
    }
    res.json({ success: true, statements: results, total: results.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/owner-info/save", async (req, res) => {
  try {
    const { userId: requesterId, name, link } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.json({ success: false, error: "Admin only" });
    if (name !== undefined) await setConfig("owner_display_name", name);
    if (link !== undefined) await setConfig("owner_display_link", link);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/owner-info", async (req, res) => {
  try {
    const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    const ownerUser = await User.findOne({ userId: ownerId }).lean();
    let name = await getConfig("owner_display_name", null);
    let link = await getConfig("owner_display_link", null);
    if (!name) name = ownerUser?.firstName || "Owner";
    if (!link) link = ownerId.toString();
    res.json({ success: true, name, link, ownerId });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 💰 LIVE FUND
// ============================================================
app.get("/miniapp/api/admin/live-fund", async (req, res) => {
  try {
    let fund = await LiveFund.findOne({ key: "main_fund" }).lean();
    if (!fund) fund = await LiveFund.create({ key: "main_fund" });
    res.json({ success: true, fund });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/live-fund/set", async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) return res.json({ success: false, error: "Invalid amount" });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { totalFund: amt, usedFund: 0, updatedAt: new Date() }, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/live-fund/toggle", async (req, res) => {
  try {
    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) fund = await LiveFund.create({ key: "main_fund" });
    fund.isActive = !fund.isActive;
    fund.updatedAt = new Date();
    await fund.save();
    res.json({ success: true, isActive: fund.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 📊 WITHDRAW SETTINGS
// ============================================================
app.get("/miniapp/api/admin/withdraw-settings", async (req, res) => {
  try {
    let settings = await WithdrawSettings.find({}).lean();
    if (settings.length === 0) {
      const methods = [
        { method: "upi", minAmount: 10, maxAmount: 10000, isActive: true },
        { method: "bank", minAmount: 100, maxAmount: 50000, isActive: true },
        { method: "wallet", minAmount: 10, maxAmount: 10000, isActive: true },
        { method: "amazon", minAmount: 100, maxAmount: 5000, isActive: false },
        { method: "redeem", minAmount: 50, maxAmount: 2000, isActive: false }
      ];
      for (let m of methods) await WithdrawSettings.create(m);
      settings = await WithdrawSettings.find({}).lean();
    }
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/withdraw-settings/update", async (req, res) => {
  try {
    const { method, isActive, minAmount, maxAmount, taxPercent } = req.body;
    if (!method) return res.json({ success: false, error: "Method required" });
    let update = {};
    if (isActive !== undefined) update.isActive = isActive;
    if (minAmount !== undefined) update.minAmount = parseFloat(minAmount);
    if (maxAmount !== undefined) update.maxAmount = parseFloat(maxAmount);
    if (taxPercent !== undefined) update.taxPercent = parseFloat(taxPercent);
    update.updatedAt = new Date();
    await WithdrawSettings.findOneAndUpdate({ method: method.toLowerCase() }, update, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🆕 NEW USERS
// ============================================================
app.get("/miniapp/api/admin/new-users", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const users = await User.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    const total = await User.countDocuments({});
    let today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = await User.countDocuments({ createdAt: { $gte: today } });
    let weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    res.json({ success: true, users, total, todayCount, weekCount });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🔴 LIVE BALANCE TRACKER (SORTED BY BALANCE)
// ============================================================
app.get("/miniapp/api/admin/live-balance", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 0;
    const perPage = 10;
    const users = await User.find({})
      .sort({ balance: -1, createdAt: -1 })
      .skip(page * perPage)
      .limit(perPage)
      .lean();
    const total = await User.countDocuments({});
    const totalBalance = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
    res.json({
      success: true, users,
      total, totalBalance: totalBalance[0]?.total || 0,
      page, totalPages: Math.ceil(total / perPage)
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

console.log("✅ Part 4 Loaded — Mini App Admin APIs");
// ============================================================
// 🚀 /START COMMAND
// ============================================================
bot.command("start", async (ctx) => {
  try {
    delete userState[ctx.from.id];
    let userId = ctx.from.id;
    let existingUser = await User.findOne({ userId }).lean();
    let isNewUser = !existingUser;

    let user = await getUser(userId);
    user.firstName = ctx.from.first_name || "";
    user.lastName = ctx.from.last_name || "";
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
      let notifMsg = `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n💰 ₹${user.balance.toFixed(2)}\n📅 ${new Date().toLocaleString('en-IN')}`;
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

    // Force Join Check
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) return sendForceJoinMessage(ctx);

    // Start Message (Editable)
    let titleText = await getConfig("start_title_text", DEFAULT_START_TEXT.title);
    let linkText = await getConfig("start_link_text", DEFAULT_START_TEXT.linkText);
    let welcomeLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

    let welcomeText = `${titleText}\n\n<a href="${welcomeLink}">${linkText}</a>`;

    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(userId), parse_mode: "HTML" });
    } catch (htmlErr) {
      await ctx.reply(`${titleText}\n\n${linkText}\n${welcomeLink}`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }
  } catch (err) {
    console.error("❌ /start err:", err);
    try { await ctx.reply(`❌ Error: ${err.message}`); } catch (e) {}
  }
});

// ============================================================
// 🔒 FORCE JOIN MESSAGE
// ============================================================
async function sendForceJoinMessage(ctx) {
  let channels = await Channel.find({ isActive: true }).lean();
  let keyboard = new InlineKeyboard();
  channels.forEach((ch) => {
    keyboard.url(`📢 Join ${ch.displayName || ch.channelId}`, ch.inviteLink).row();
  });
  keyboard.text("✅ I have Joined", "check_join");
  return ctx.reply("⚠️ *You must join our channels to use this bot!*\n\n👇 Join all channels below:",
    { reply_markup: keyboard, parse_mode: "Markdown" });
}

bot.callbackQuery("check_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ Please join all channels first!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("✅ Verified! Welcome 👋", { reply_markup: await buildKeyboardFromLayout(ctx.from.id) });
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
// 🚀 WITHDRAW MENU BUILDER
// ============================================================
async function buildWithdrawMenu() {
  let buttons = [];

  // 1. Active Gateways
  let gateways = await Gateway.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  for (let gw of gateways) {
    buttons.push([{ text: `${gw.name}`, callback_data: `wd_gw_${gw.name}` }]);
  }

  // 2. Manual Methods
  let enabledMethods = [];

  let upiWs = await WithdrawSettings.findOne({ method: "upi" }).lean();
  if (upiWs ? upiWs.isActive : true) enabledMethods.push({ label: "UPI", cb: "wd_upi" });

  let bankWs = await WithdrawSettings.findOne({ method: "bank" }).lean();
  if (bankWs ? bankWs.isActive : true) enabledMethods.push({ label: "Bank", cb: "wd_bank" });

  let walletWs = await WithdrawSettings.findOne({ method: "wallet" }).lean();
  if (walletWs ? walletWs.isActive : true) enabledMethods.push({ label: "Wallet", cb: "wd_wallet" });

  let amazonWs = await WithdrawSettings.findOne({ method: "amazon" }).lean();
  if (amazonWs && amazonWs.isActive) enabledMethods.push({ label: "Amazon", cb: "wd_amazon" });

  let redeemWs = await WithdrawSettings.findOne({ method: "redeem" }).lean();
  if (redeemWs && redeemWs.isActive) enabledMethods.push({ label: "Redeem", cb: "wd_redeem" });

  for (let i = 0; i < enabledMethods.length; i += 2) {
    let row = [{ text: enabledMethods[i].label, callback_data: enabledMethods[i].cb }];
    if (enabledMethods[i + 1]) row.push({ text: enabledMethods[i + 1].label, callback_data: enabledMethods[i + 1].cb });
    buttons.push(row);
  }

  buttons.push([{ text: "🔙 Back", callback_data: "back_to_balance" }]);
  return buttons;
}

// ============================================================
// 💰 BALANCE PAGE
// ============================================================
async function sendBalancePage(ctx, edit = false) {
  let userId = ctx.from.id;
  let user = await getUser(userId);

  let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

  let msg = `${welcomeText}\n\n🔵 Wallet ID ➝ <code>${userId}</code>\n🧾 Balance ➝ <code>₹${user.balance.toFixed(2)}</code>\n\n<blockquote>${footerText}</blockquote>`;

  let buttons = [];
  let autoUPIEnabled = await getConfig("auto_upi_enabled", true);
  if (autoUPIEnabled) buttons.push([{ text: "➕ Add Fund", callback_data: "add_fund_btn" }]);
  buttons.push([
    { text: "📊 Balance Statement", callback_data: "balance_statement" },
    { text: "💬 Support", callback_data: "customer_support" }
  ]);
  buttons.push([
    { text: "🔄 Refresh", callback_data: "refresh_balance_only" },
    { text: "💰 Live Fund", callback_data: "live_fund" }
  ]);
  buttons.push([{ text: "⚙️ Settings", callback_data: "user_settings" }]);

  let kb = await buildStyledKb(buttons);

  try {
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" });
    } else {
      await ctx.reply(msg, { reply_markup: kb, parse_mode: "HTML" });
    }
  } catch (htmlErr) {
    let plainMsg = `${welcomeText}\n\n🔵 Wallet ID ➝ ${userId}\n🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\n${footerText}`;
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(plainMsg, { reply_markup: kb }).catch(() => {});
    } else {
      await ctx.reply(plainMsg, { reply_markup: kb });
    }
  }
}

// ============================================================
// 📢 PAYOUT METHOD PAGE
// ============================================================
async function sendPayoutMethodPage(ctx, edit = false) {
  let userId = ctx.from.id;
  let user = await getUser(userId);

  let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `\`${val}\`` : `\`Not Set\``;
  let gwNumStr = user.walletNumber && user.walletNumber !== "" ? `\`${user.walletNumber}\`` : `\`Not Set\``;

  let msg = `✨ *Payout Method*\n\n📱 *Set Wallet* - ${gwNumStr}\n\n`;

  let upiWs = await WithdrawSettings.findOne({ method: "upi" }).lean();
  let bankWs = await WithdrawSettings.findOne({ method: "bank" }).lean();
  let walletWs = await WithdrawSettings.findOne({ method: "wallet" }).lean();

  let showUPI = upiWs ? upiWs.isActive : true;
  let showBank = bankWs ? bankWs.isActive : true;
  let showWallet = walletWs ? walletWs.isActive : true;

  if (showWallet) msg += `👛 *Wallet* - ${fmt(user.walletAccount)}\n\n`;
  if (showUPI) msg += `⚡ *UPI* - ${fmt(user.upiId)}\n\n`;
  if (showBank) msg += `🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}`;

  let payoutKb = new InlineKeyboard();
  payoutKb.text("📱 Set Wallet", "set_wallet_number").row();

  let row1 = [];
  if (showWallet) row1.push({ text: "🌐 Wallet", callback_data: "set_wallet" });
  if (showUPI) row1.push({ text: "⚡ UPI", callback_data: "set_upi" });
  if (row1.length > 0) payoutKb.row(...row1);

  if (showBank) payoutKb.text("🏦 Bank", "set_bank").row();

  payoutKb.text("🔙 Back", "back_to_balance");

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: payoutKb, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(msg, { reply_markup: payoutKb, parse_mode: "Markdown" });
  }
}

// ============================================================
// 💬 USER TEXT HANDLER
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

    // ---------- Set Wallet Number ----------
    if (state === "SET_WALLET_NUMBER") {
      delete userState[userId];
      let number = text.trim();
      if (!number || number.length < 5 || !/^[0-9+\-\s]+$/.test(number)) {
        return ctx.reply("❌ Invalid number! Send digits only.", { reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
      }
      let user = await getUser(userId);
      user.walletNumber = number;
      await user.save();
      await ctx.reply(`✅ *Wallet Number Saved!*\n\n📱 \`${number}\`\n\n✨ This number will be used for all gateways.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
      return;
    }

    // ---------- Gateway Number ----------
    if (state.startsWith("GW_NUMBER_")) {
      let gwName = state.replace("GW_NUMBER_", "");
      let number = text.trim();
      if (!number || number.length < 5) return ctx.reply("❌ Invalid number! Try again.");
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) { delete userState[userId]; return ctx.reply("❌ Gateway not found."); }
      let user = await getUser(userId);
      if (!user.gatewayNumbers) user.gatewayNumbers = new Map();
      user.gatewayNumbers.set(gwName, number);
      user.markModified('gatewayNumbers');
      if (!user.walletNumber || user.walletNumber === "") user.walletNumber = number;
      await user.save();
      userState[userId] = `GW_AMOUNT_${gwName}`;
      return ctx.reply(`💰 Enter Withdraw Amount`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "wd_cancel") });
    }

    // ---------- Gateway Amount ----------
    if (state.startsWith("GW_AMOUNT_")) {
      let gwName = state.replace("GW_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount!");

      let user = await getUser(userId);
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) return ctx.reply("❌ Gateway not found.");

      let minW = await getConfig("min_withdraw", 10);
      let maxW = await getConfig("max_withdraw", 10000);
      if (amount < minW) return ctx.reply(`❌ Minimum: ₹${minW}`);
      if (amount > maxW) return ctx.reply(`❌ Maximum: ₹${maxW}`);
      if (user.balance < amount) return ctx.reply(`❌ Insufficient balance! Your balance: ₹${user.balance.toFixed(2)}`);

      let wallet = "";
      if (user.gatewayNumbers && user.gatewayNumbers.get) wallet = user.gatewayNumbers.get(gwName) || "";
      if (!wallet) wallet = user.walletNumber || "";

      let taxPercent = await getConfig("tax_percent", 0);
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) { taxAmount = (amount * taxPercent) / 100; receiveAmount = amount - taxAmount; }

      let confirmMsg = `🤘Withdrawal Confirmation\n\n🔰 Amount : ${amount} INR\n⭐️ You receive : ${receiveAmount.toFixed(2)} INR ( Tax : ₹${taxAmount.toFixed(2)} )\n\n🗳️ 📥${gwName} Wallet : ${wallet}\n✌️Confirm Your Transaction By Clicking On '✅ Confirm'`;

      userState[userId] = `GW_CONFIRM_${gwName}_${amount}`;
      return ctx.reply(confirmMsg, { reply_markup: new InlineKeyboard().text("✅ Confirm", `gw_conf_yes_${gwName}_${amount}`).text("❌ Cancel", `gw_conf_no`) });
    }

    // ---------- Manual Amount ----------
    if (state.startsWith("MANUAL_AMOUNT_")) {
      let method = state.replace("MANUAL_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount!");

      let user = await getUser(userId);
      let details = "";
      if (method === "wallet") details = user.walletAccount;
      else if (method === "upi") details = user.upiId;
      else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
      else if (method === "amazon") details = user.amazonEmail;
      else if (method === "redeem") details = user.redeemCodeAddr;

      if (!details || details === "Not Set" || details.includes("Not Set")) return ctx.reply(`❌ ${method} not linked! Please add it first.`);

      let ws = await WithdrawSettings.findOne({ method: method }).lean();
      let minW = ws ? ws.minAmount : await getConfig("min_withdraw", 10);
      let maxW = ws ? ws.maxAmount : await getConfig("max_withdraw", 10000);
      if (amount < minW) return ctx.reply(`❌ Minimum: ₹${minW}`);
      if (amount > maxW) return ctx.reply(`❌ Maximum: ₹${maxW}`);
      if (user.balance < amount) return ctx.reply(`❌ Insufficient balance! Your balance: ₹${user.balance.toFixed(2)}`);

      let taxPercent = await getConfig("tax_percent", 0);
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) { taxAmount = (amount * taxPercent) / 100; receiveAmount = amount - taxAmount; }

      let methodIcon = method === "upi" ? "⚡" : (method === "bank" ? "🏦" : (method === "wallet" ? "🌐" : (method === "amazon" ? "📧" : "🎁")));
      let methodLabel = method === "upi" ? "UPI" : (method === "bank" ? "Bank" : (method === "wallet" ? "Wallet" : (method === "amazon" ? "Amazon" : "Redeem")));

      let confirmMsg = `🤘Withdrawal Confirmation\n\n🔰 Amount : ${amount} INR\n⭐️ You receive : ${receiveAmount.toFixed(2)} INR ( Tax : ₹${taxAmount.toFixed(2)} )\n\n🗳️ ${methodIcon} ${methodLabel} : ${details}\n✌️Confirm Your Transaction By Clicking On '✅ Confirm'`;

      userState[userId] = `MANUAL_CONFIRM_${method}_${amount}`;
      return ctx.reply(confirmMsg, { reply_markup: new InlineKeyboard().text("✅ Confirm", `man_conf_yes_${method}_${amount}`).text("❌ Cancel", `man_conf_no`) });
    }

    // ---------- UPI Deposit Amount ----------
    if (state === "UPI_WAIT_AMOUNT") {
      delete userState[userId];
      let amt = parseFloat(text);
      let minAmt = await getConfig("auto_upi_min", 5);
      let maxAmt = await getConfig("auto_upi_max", 200);
      if (isNaN(amt) || amt < minAmt || amt > maxAmt) return ctx.reply(`❌ Amount must be between ₹${minAmt} and ₹${maxAmt}`);
      let upiId = await getConfig("auto_upi_id", "payzy@upi");
      let orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
      await UPIPayment.create({ orderId, userId, amount: amt, upiId, status: "Pending", source: "bot" });
      userState[userId] = `UPI_WAIT_UTR_${orderId}_${amt}`;
      const styledEnter = toSmallCaps("After Payment, Send UTR:");
      const styledTap = toSmallCaps("(Tap UPI to copy)");
      const styledPhoto = toSmallCaps("Also Send Screenshot:");
      return ctx.reply(
        `✅ Amount Set: ₹${amt}\n\n📱 Pay to UPI: \`${upiId}\`\n${styledTap}\n\n🔐 ${styledEnter}\n📸 ${styledPhoto}\n\n🆔 Order: \`${orderId}\`\n\n💡 Send photo with UTR in caption`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel") }
      );
    }

    // ---------- Withdraw Add Methods ----------
    if (state === "WD_ADD_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply("❌ Invalid UPI format!");
      let user = await getUser(userId);
      user.upiId = upi;
      await user.save();
      return ctx.reply(`✅ UPI Saved!\n\n📌 <code>${upi}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") });
    }
    if (state === "WD_ADD_WALLET") {
      delete userState[userId];
      let wallet = text.trim();
      let user = await getUser(userId);
      user.walletAccount = wallet;
      await user.save();
      return ctx.reply(`✅ Wallet Saved!\n\n📌 <code>${wallet}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") });
    }
    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`✅ Account: <code>${text.trim()}</code>\n\n📝 Send IFSC Code:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_withdraw") });
    }
    if (state.startsWith("WD_ADD_BANK_IFSC_")) {
      let accNo = state.replace("WD_ADD_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      let user = await getUser(userId);
      user.bankAccNo = accNo;
      user.bankIfsc = ifsc;
      await user.save();
      return ctx.reply(`✅ Bank Saved!\n\n🏦 <code>${accNo}</code>\n🔢 <code>${ifsc}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") });
    }

    // ---------- Quick Pay v3 ----------
    if (state === "QP_WAIT_USERID") {
      delete userState[userId];
      let lines = text.trim().split("\n").map(l => l.trim()).filter(l => l !== "");
      if (lines.length === 0) return ctx.reply("❌ No data provided!");
      if (lines.length > 10) return ctx.reply("❌ Maximum 10 payments at once!");

      let parsed = [];
      let errors = [];

      for (let line of lines) {
        let parts = line.split(/\s+/);
        if (parts.length < 2) { errors.push(`❌ ${line} (invalid format)`); continue; }
        let userInput = parts[0].trim();
        let amtStr = parts[parts.length - 1];
        let amt = parseFloat(amtStr);
        if (isNaN(amt) || amt <= 0) { errors.push(`❌ ${line} (invalid amount)`); continue; }

        let receiver = null;
        let targetId = parseInt(userInput, 10);
        if (!isNaN(targetId) && targetId > 0 && /^\d+$/.test(userInput)) {
          receiver = await User.findOne({ userId: targetId }).lean();
        }
        if (!receiver) {
          let cleanUsername = userInput.replace(/^@/, '').toLowerCase();
          receiver = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }).lean();
        }
        if (!receiver) { errors.push(`❌ ${userInput} (not found)`); continue; }
        if (receiver.userId === userId) { errors.push(`❌ Cannot send to yourself`); continue; }

        parsed.push({ receiver, amount: amt });
      }

      if (errors.length > 0) {
        return ctx.reply(`⚠️ *Some errors:*\n\n${errors.join("\n")}\n\n📝 *Format:*\n\`@username 100\`\n\`9876543210 50\``,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "qp_cancel") });
      }
      if (parsed.length === 0) return ctx.reply(`❌ No valid payments!`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "qp_cancel") });

      let totalAmount = parsed.reduce((sum, p) => sum + p.amount, 0);
      let sender = await getUser(userId);
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser && sender.balance < totalAmount) {
        return ctx.reply(`❌ *Insufficient Balance!*\n\n💵 Your: ₹${sender.balance.toFixed(2)}\n💰 Required: ₹${totalAmount.toFixed(2)}`, { parse_mode: "Markdown" });
      }

      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { payments: parsed };

      let paymentList = "";
      parsed.forEach((p, i) => {
        paymentList += `\n${i + 1}. 👤 ${p.receiver.firstName || "User"}\n   🆔 \`${p.receiver.userId}\`${p.receiver.username ? ` (@${p.receiver.username})` : ''}\n   💰 ₹${p.amount}\n`;
      });

      let msg = `⚠️ *Confirm Payment*\n\n━━━━━━━━━━━━━━━━━━━━\n📊 *Payments:*${paymentList}\n━━━━━━━━━━━━━━━━━━━━\n💰 *Total:* ₹${totalAmount.toFixed(2)}\n\n💵 *Your Balance:* ₹${sender.balance.toFixed(2)}\n💵 *After:* ₹${(sender.balance - totalAmount).toFixed(2)}`;

      userState[userId] = `QP_CONFIRM_MULTI`;
      return ctx.reply(msg, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "qp_confirm_multi").text("❌ Cancel", "qp_cancel") });
    }

    // ---------- Gift Code Redeem ----------
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOneAndUpdate(
        { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
        { $push: { usedUsers: userId } }, { new: true }
      );
      if (!gift) return ctx.reply("🚫 Invalid or expired!");
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 Gift redeemed! Added ₹${gift.amount}.`);
    }

    // ---------- Payment Methods ----------
    if (state === "SET_WALLET_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text.trim() });
      return ctx.reply(`✅ Wallet Saved!\n\n📌 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
    }
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ UPI Saved!\n\n📌 \`${text.trim()}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
    }
    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 Send IFSC Code:`, { reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
    }
    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim() });
      return ctx.reply(`✅ Bank Saved!\n\n📌 \`${accNo}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") });
    }

    // ---------- USET ----------
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

    // ---------- Task Refer ----------
    if (state.startsWith("TASK_REFER_")) {
      let taskId = state.replace("TASK_REFER_", "");
      delete userState[userId];
      let task = await Task.findOne({ taskId });
      if (!task) return ctx.reply("❌ Task not found");
      if (task.completedUsers.includes(userId)) return ctx.reply("❌ Already completed!");
      let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
      let user = await getUser(userId);
      await TaskSubmission.create({ submissionId, userId, userName: user.firstName || "User", taskId: task.taskId, taskTitle: task.title, reward: task.reward, photoFileId: `REFER: ${text.trim()}`, status: "Pending" });
      let alertChannel = task.alertChannel && task.alertChannel !== "Not Set" ? task.alertChannel : await getConfig("default_task_alert_channel", null);
      if (alertChannel && alertChannel !== "Not Set") {
        let caption = `📸 *Task Submission (Refer)*\n\n👤 *${user.firstName || "User"}*\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*\n🔗 \`${text.trim()}\``;
        let kb = new InlineKeyboard().text("✅ Approve", `task_app_${submissionId}`).text("❌ Reject", `task_rej_${submissionId}`);
        try { await ctx.api.sendMessage(alertChannel, caption, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
      }
      return ctx.reply(`⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}`, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }
  }

  // ============================================================
  // 🔀 BUTTON ROUTING (EXACT MATCH ONLY)
  // ============================================================
  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name && !b.hidden);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  // Force Join for Keyboard Buttons
  let isAdminUser = await isAdmin(userId);
  if (matchedKey && !isAdminUser) {
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) return sendForceJoinMessage(ctx);
  }

  if (matchedKey === "btn_balance") {
    try { await sendBalancePage(ctx, false); } catch (err) { return ctx.reply(`❌ Error: ${err.message}`); }
  }
  else if (matchedKey === "btn_tasks") {
    try {
      let tasks = await Task.find({}).lean();
      if (!tasks || tasks.length === 0) return ctx.reply("📋 No tasks available.");
      let taskButtons = [];
      tasks.forEach(t => taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]));
      return ctx.reply("📋 *Available Tasks:*", { reply_markup: await buildStyledKb(taskButtons), parse_mode: "Markdown" });
    } catch (e) { return ctx.reply("❌ Error loading tasks."); }
  }
  else if (matchedKey === "btn_gift") {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code To Claim Reward!");
  }
  else if (matchedKey === "btn_quickpay") {
    userState[userId] = "QP_WAIT_USERID";
    return ctx.reply(`💸 *Quick Pay*\n\n📝 Format:\n\`@username 100\`\n\`9876543210 50\`\n\n(One payment per line)`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel") });
  }
  else if (matchedKey === "btn_payout") {
    return sendPayoutMethodPage(ctx, false);
  }
  else if (matchedKey === "btn_withdraw") {
    let buttons = await buildWithdrawMenu();
    if (buttons.length <= 1) return ctx.reply(`✨ *Choose Your Withdraw Method:*\n\n❌ No withdraw methods available.`, { parse_mode: "Markdown" });
    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, { reply_markup: await buildStyledKb(buttons), parse_mode: "Markdown" });
  }
  else {
    let gift = await GiftCode.findOneAndUpdate(
      { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } }, { new: true }
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

console.log("✅ Part 5 Loaded — /start + Force-Join + Text Handler + Balance + Withdraw + Quick Pay v3");
// ============================================================
// 📸 PHOTO HANDLER (Task Submission + UPI Deposit)
// ============================================================
bot.on("message:photo", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];

  // ---------- Task Photo ----------
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

    await ctx.reply(`⏳ *Submitted!*\n\n📌 ${task.title}\n💰 ₹${task.reward}\n\n🕐 Admin will verify.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set" ? task.alertChannel : await getConfig("default_task_alert_channel", null);
    if (alertChannel && alertChannel !== "Not Set") {
      let caption = `📸 *New Task Submission!*\n\n👤 ${ctx.from.first_name || "User"}\n🆔 \`${userId}\`\n📌 *${task.title}*\n💰 *₹${task.reward}*`;
      let kb = new InlineKeyboard().text("✅ Approve", `task_app_${submissionId}`).text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) { }
    }
    return;
  }

  // ---------- UPI Deposit (Photo + UTR caption) ----------
  if (state && state.startsWith("UPI_WAIT_UTR_")) {
    let parts = state.replace("UPI_WAIT_UTR_", "").split("_");
    let orderId = parts[0];
    let amount = parseFloat(parts[1]);

    let caption = (ctx.message.caption || "").trim().replace(/\s/g, "");
    if (caption.length < 10 || caption.length > 25 || !/^\d+$/.test(caption)) {
      return ctx.reply(`❌ *Invalid UTR*\n\nSend photo with valid UTR in caption (10-25 digits).`, { parse_mode: "Markdown" });
    }

    delete userState[userId];
    let utr = caption;

    let existingUsed = await UPIPayment.findOne({ utr, status: "Approved" });
    if (existingUsed) return ctx.reply("❌ This UTR has already been used!");

    await ctx.reply("⏳ Verifying your payment...");

    let user = await getUser(userId);
    let photo = ctx.message.photo[ctx.message.photo.length - 1];

    // Manual verify only
    let payment = await UPIPayment.findOne({ orderId });
    if (payment) {
      payment.utr = utr;
      payment.status = "Pending";
      payment.source = "bot-manual";
      await payment.save();
    }

    let afReqId = Math.floor(100000 + Math.random() * 900000).toString();
    await AddFund.create({
      requestId: afReqId, userId, userName: user.firstName || "User",
      amount: amount, utr: utr, photoFileId: photo.file_id, status: "Pending"
    });

    let targetChannel = await getConfig("addfund_channel", null);
    let pendingCount = await AddFund.countDocuments({ status: "Pending" });
    let userCount = await AddFund.countDocuments({ userId: userId });

    let kb = new InlineKeyboard().text("✅ Approve", `upi_app_${orderId}`).text("❌ Reject", `upi_rej_${orderId}`);

    let captionMsg =
      `💰 <b>New UPI Deposit Request</b>\n\n` +
      `👤 <b>User:</b> ${user.firstName || "User"}\n` +
      `🆔 <b>ID:</b> <code>${userId}</code>\n` +
      `💰 <b>Amount:</b> ₹${amount}\n` +
      `🔐 <b>UTR:</b> <code>${utr}</code>\n` +
      `🆔 <b>Order:</b> <code>${orderId}</code>\n\n` +
      `📊 <b>Total Pending:</b> ${pendingCount}\n` +
      `📊 <b>This User's:</b> ${userCount}`;

    if (targetChannel && targetChannel !== "Not Set") {
      try { await ctx.api.sendPhoto(targetChannel, photo.file_id, { caption: captionMsg, parse_mode: "HTML", reply_markup: kb }); } catch (e) { }
    } else {
      try { await ctx.api.sendPhoto(MAIN_OWNER_ID, photo.file_id, { caption: captionMsg, parse_mode: "HTML", reply_markup: kb }); } catch (e) { }
    }

    return ctx.reply(`⏳ *Deposit Pending*\n\n💰 ₹${amount}\n🔐 \`${utr}\`\n\n🕐 Admin will verify.`,
      { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
  }

  return next();
});

// ============================================================
// 🎯 BALANCE CALLBACKS
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  await ctx.answerCallbackQuery("🔄 Refreshed!");
  try { await sendBalancePage(ctx, true); } catch (e) {}
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  try { await sendBalancePage(ctx, true); } catch (e) {}
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
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

bot.callbackQuery("customer_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let supportInput = await getConfig("support_username", null);
  if (!supportInput || supportInput === "Not Set") {
    return ctx.reply(`💬 *Support*\n\n⚠️ Support not set. Please contact admin.`, { parse_mode: "Markdown" });
  }
  let link = convertOwnerLink(supportInput);
  await ctx.reply(`💬 *Support*\n\nClick below to contact:`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().url("💬 Contact Support", link)
  });
});

// ---------- LIVE FUND (User View) ----------
bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading...");
  let users = await User.find({}).lean();
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });

  let liveFund = await LiveFund.findOne({ key: "main_fund" }).lean();
  let fundText = "";
  if (liveFund && liveFund.isActive) {
    let running = (liveFund.totalFund || 0) - (liveFund.usedFund || 0);
    fundText = `\n\n💠 *Live Fund:*\n💰 Set Fund: ₹${(liveFund.totalFund || 0).toFixed(2)}\n📉 Running: ₹${running.toFixed(2)}\n📊 Used: ₹${(liveFund.usedFund || 0).toFixed(2)}`;
  }

  let msg = `💰 *Live Fund Report*\n\n👥 Users: \`${users.length}\`\n💵 Total: \`₹${totalBalance.toFixed(2)}\`${fundText}`;
  let kb = await buildStyledKb([
    [{ text: "🔄 Refresh", callback_data: "live_fund" }],
    [{ text: "🔙 Back", callback_data: "back_to_balance" }]
  ]);
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ✅ ADD FUND BUTTON
// ============================================================
bot.callbackQuery("add_fund_btn", async (ctx) => {
  let userId = ctx.from.id;
  let autoEnabled = await getConfig("auto_upi_enabled", true);
  if (!autoEnabled) return ctx.answerCallbackQuery({ text: "❌ Add Fund OFF!", show_alert: true });
  let upiId = await getConfig("auto_upi_id", "payzy@upi");
  let minAmt = await getConfig("auto_upi_min", 5);
  let maxAmt = await getConfig("auto_upi_max", 200);
  await ctx.answerCallbackQuery();
  const styledTitle = toSmallCaps("Manual UPI Deposit");
  const styledEnter = toSmallCaps("Enter The Amount You Wish To Deposit:");
  const styledMust = toSmallCaps("Amount Must Be Between");
  const msg = `💠 ${styledTitle}\n\n✨ ${styledEnter}\n${styledMust} ₹${minAmt} ᴀɴᴅ ₹${maxAmt}\n\n📌 UPI: \`${upiId}\``;
  userState[userId] = "UPI_WAIT_AMOUNT";
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel") });
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
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "❌ Already completed!", show_alert: true });
  await ctx.answerCallbackQuery();

  let taskType = task.taskType || "photo";
  if (taskType === "refer") {
    userState[userId] = `TASK_REFER_${taskId}`;
    await ctx.editMessageText(`📋 *${task.title}*\n💰 Reward: ₹${task.reward}\n🔗 Link: ${task.link}\n\n📝 Send your referral code/ID:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task") });
  } else {
    userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;
    await ctx.editMessageText(`📋 *${task.title}*\n💰 Reward: ₹${task.reward}\n🔗 Link: ${task.link}\n\n📸 Complete the task and send screenshot:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task") });
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
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ APPROVED` }).catch(() => {});
  try { await ctx.api.sendMessage(sub.userId, `🎉 *Task Approved!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`, { parse_mode: "Markdown" }); } catch (e) {}
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
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ REJECTED` }).catch(() => {});
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
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ <b>APPROVED</b>`, parse_mode: "HTML" }).catch(() => {});
  try { await ctx.api.sendMessage(payment.userId, `💫 ✅ Deposit Approved!\n\n💰 ₹${payment.amount}\n🔐 UTR: ${payment.utr}`, { parse_mode: "Markdown" }); } catch (e) {}
  await AddFund.findOneAndUpdate({ userId: payment.userId, utr: payment.utr, status: "Pending" },
    { status: "Approved", approvedBy: ctx.from.username || ctx.from.first_name || "Admin", approvedAt: new Date() });
});

bot.callbackQuery(/^upi_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_rej_", "");
  let payment = await UPIPayment.findOne({ orderId });
  if (!payment || payment.status === "Rejected") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  payment.status = "Rejected";
  payment.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  await payment.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "UPI Deposit Rejected", `₹${payment.amount}`, payment.amount, payment.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ <b>REJECTED</b>`, parse_mode: "HTML" }).catch(() => {});
  await AddFund.findOneAndUpdate({ userId: payment.userId, utr: payment.utr, status: "Pending" },
    { status: "Rejected", approvedBy: ctx.from.username || ctx.from.first_name || "Admin", approvedAt: new Date() });
  try { await ctx.api.sendMessage(payment.userId, `❌ *Deposit Rejected*\n\n💰 ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\``, { parse_mode: "Markdown" }); } catch (e) {}
});

// ============================================================
// ⚡ QUICK PAY CONFIRM (v3 Multi-user)
// ============================================================
bot.callbackQuery("qp_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  await ctx.editMessageText("❌ *Quick Pay Cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildKeyboardFromLayout(userId) });
});

bot.callbackQuery("qp_confirm_multi", async (ctx) => {
  let userId = ctx.from.id;
  let cacheObj = global.quickPayCache?.[userId];
  if (!cacheObj || !cacheObj.payments || cacheObj.payments.length === 0) {
    return ctx.answerCallbackQuery({ text: "❌ Expired!", show_alert: true });
  }

  let payments = cacheObj.payments;
  let totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  delete userState[userId];
  delete global.quickPayCache[userId];

  let sender = await getUser(userId);
  let isAdminUser = await isAdmin(userId);

  if (!isAdminUser && sender.balance < totalAmount) {
    return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });
  }

  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });

  const taxEnabled = await getConfig("quick_pay_tax_enabled", false);
  const taxPercent = await getConfig("quick_pay_tax_percent", 0);
  let taxAmount = 0;
  if (taxEnabled && taxPercent > 0) taxAmount = (totalAmount * taxPercent) / 100;

  let wasNegative = sender.balance < totalAmount;
  let senderBefore = sender.balance;
  let senderBalanceBefore = sender.balance;

  sender.balance -= totalAmount;
  await sender.save();

  if (taxAmount > 0) {
    const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    await User.findOneAndUpdate({ userId: ownerId }, { $inc: { balance: taxAmount } });
    await logBalanceHistory(ownerId, `Quick Pay Tax from ${userId}`, taxAmount);
  }

  let resultList = [];
  for (let p of payments) {
    let receiver = await User.findOne({ userId: p.receiver.userId });
    if (!receiver) continue;
    let before = receiver.balance;
    receiver.balance += p.amount;
    await receiver.save();
    await logBalanceHistory(receiver.userId, `Quick Pay from ${isAdminUser ? "Admin" : sender.userId}`, p.amount);

    resultList.push({
      userId: receiver.userId,
      username: receiver.username || "",
      amount: p.amount,
      before: before,
      after: receiver.balance
    });

    try {
      await ctx.api.sendMessage(receiver.userId,
        `🎉 *Payment Received!*\n\n👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n🆔 \`${sender.userId}\`\n💰 ₹${p.amount.toFixed(2)}\n\n💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) {}
  }

  if (isAdminUser && wasNegative) {
    await logBalanceHistory(sender.userId, `Admin Add Fund - Quick Pay (${payments.length} payments)`, -totalAmount);
  } else if (isAdminUser) {
    await logBalanceHistory(sender.userId, `Admin Quick Pay (${payments.length} payments)`, -totalAmount);
  } else {
    await logBalanceHistory(sender.userId, `Quick Pay (${payments.length} payments)`, -totalAmount);
  }

  // Build success message
  let listMsg = "";
  resultList.forEach((r, i) => {
    listMsg += `\n  ${i + 1}.  USER ID : ${r.userId}${r.username ? ` (@${r.username})` : ''}\n   Amount: ₹${r.amount} ✅\n`;
  });

  let recBalLines = "";
  resultList.forEach(r => {
    recBalLines += `💰 Receiver Balance : ₹${r.before.toFixed(2)} → ₹${r.after.toFixed(2)}\n`;
  });

  let successMsg =
    `✅ QUICK PAY SUCCESSFUL ✅\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    listMsg +
    `\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    recBalLines +
    `Your Balance : ₹${senderBalanceBefore.toFixed(2)} → ₹${sender.balance.toFixed(2)}`;

  await ctx.editMessageText(successMsg, { parse_mode: "HTML" }).catch(() => {});
});

// ============================================================
// 🚀 GATEWAY WITHDRAW CALLBACKS
// ============================================================
bot.callbackQuery(/^wd_gw_/, async (ctx) => {
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("wd_gw_", "");
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway not found", show_alert: true });

  let user = await getUser(userId);
  let savedNumber = "";
  if (user.gatewayNumbers && user.gatewayNumbers.get) savedNumber = user.gatewayNumbers.get(gwName) || "";
  if (!savedNumber) savedNumber = user.walletNumber || "";

  await ctx.answerCallbackQuery();

  if (!savedNumber) {
    userState[userId] = `GW_NUMBER_${gwName}`;
    return ctx.reply(`📱 Enter Your Number\n\nPlease enter your ${gwName} wallet number:`,
      { reply_markup: new InlineKeyboard().text("🔙 Cancel", "wd_cancel") });
  }

  userState[userId] = `GW_AMOUNT_${gwName}`;
  await ctx.reply(`💰 Enter Withdraw Amount`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "wd_cancel") });
});

bot.callbackQuery(/^gw_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let parts = ctx.callbackQuery.data.replace("gw_conf_yes_", "").split("_");
  let amount = parseFloat(parts.pop());
  let gwName = parts.join("_");

  let user = await getUser(userId);
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway not found", show_alert: true });
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient balance!", show_alert: true });

  let wallet = "";
  if (user.gatewayNumbers && user.gatewayNumbers.get) wallet = user.gatewayNumbers.get(gwName) || "";
  if (!wallet) wallet = user.walletNumber || "";
  if (!wallet) return ctx.answerCallbackQuery({ text: "❌ Number not saved!", show_alert: true });

  delete userState[userId];
  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });
  await ctx.editMessageText("⏳ Processing your withdrawal...\n\nPlease wait...").catch(() => {});

  user.balance -= amount;
  await user.save();

  let payoutChannel = await getConfig("payout_channel_" + gwName.toLowerCase(), null);
  if (!payoutChannel) payoutChannel = await getConfig("payout_channel", null);
  let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

  let result = await processGatewayPayout({ bot, userId, amount, gatewayInfo: gateway, wallet, channelList, showRemainingBalance: true });

  if (result.status === 'success') {
    let txnNumber = result.txnNumber || generateTxnNumber();
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount, amount,
      method: gwName, details: wallet, status: "Approved",
      isGateway: true, gatewayName: gateway.name,
      gatewayResponse: result.rawResponse || "",
      txnNumber, approvedBy: "Auto Gateway", approvedAt: new Date()
    });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });
    try {
      await ctx.api.sendMessage(userId,
        `✅ *Withdrawal Successful!*\n\n💰 ₹${amount}\n🌐 ${gwName}\n📱 \`${wallet}\`\n🚀 TXN: \`${txnNumber}\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") });
    } catch (e) {}
    await ctx.editMessageText(`✅ *Withdrawal Successful!*\n\n💰 ₹${amount}\n🌐 ${gwName}\n📱 \`${wallet}\`\n🚀 TXN: \`${txnNumber}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }).catch(() => {});
  } else {
    user.balance += amount;
    await user.save();
    await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount, amount,
      method: gwName, details: wallet, status: "Failed",
      isGateway: true, gatewayName: gateway.name,
      gatewayResponse: result.message || "Failed",
      approvedBy: "Auto Gateway", approvedAt: new Date()
    });
    await ctx.editMessageText(`❌ *Withdrawal Failed!*\n\n📛 ${result.message || "Gateway error"}\n\n💵 ₹${amount} refunded.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }).catch(() => {});
  }
});

// ✅ Cancel → Withdraw Menu
bot.callbackQuery("gw_conf_no", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled" }).catch(() => {});
  let buttons = await buildWithdrawMenu();
  return ctx.editMessageText(`✨ *Choose Your Withdraw Method:*`, { reply_markup: await buildStyledKb(buttons), parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🚀 MANUAL WITHDRAW CALLBACKS
// ============================================================
bot.callbackQuery(/^wd_(wallet|upi|bank|amazon|redeem)$/, async (ctx) => {
  let userId = ctx.from.id;
  let method = ctx.callbackQuery.data.replace("wd_", "");
  let user = await getUser(userId);

  let ws = await WithdrawSettings.findOne({ method });
  if (ws && !ws.isActive) return ctx.answerCallbackQuery({ text: `❌ ${method} is OFF`, show_alert: true });

  let details = "";
  if (method === "wallet") details = user.walletAccount;
  else if (method === "upi") details = user.upiId;
  else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;

  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery({ text: `❌ ${method} not linked!`, show_alert: true });
    let kb = new InlineKeyboard().text(`⚡ Add ${method.toUpperCase()} Now`, `wd_add_${method}_start`).row().text("🔙 Back", "back_to_withdraw");
    return ctx.reply(`❌ *${method.toUpperCase()} Not Linked!*\n\n📝 To withdraw via ${method}, you need to add it first.\n\n👇 Click below:`,
      { parse_mode: "Markdown", reply_markup: kb });
  }

  let minW = ws ? ws.minAmount : await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });

  userState[userId] = `MANUAL_AMOUNT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`💰 Enter Withdraw Amount`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "wd_cancel") });
});

bot.callbackQuery(/^man_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let parts = ctx.callbackQuery.data.replace("man_conf_yes_", "").split("_");
  let amount = parseFloat(parts.pop());
  let method = parts.join("_");

  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient balance!", show_alert: true });

  let details = "";
  if (method === "wallet") details = user.walletAccount;
  else if (method === "upi") details = user.upiId;
  else if (method === "bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;

  delete userState[userId];
  await ctx.answerCallbackQuery({ text: "⏳ Submitting..." });

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  let methodDisplay = method.charAt(0).toUpperCase() + method.slice(1);

  await Withdrawal.create({ withdrawalId, userId, userWithdrawalCount, amount, method: methodDisplay, details, status: "Pending", isGateway: false });

  let payoutChannel = await getConfig("payout_channel_" + method, null);
  if (!payoutChannel) payoutChannel = await getConfig("payout_channel", null);

  if (payoutChannel && payoutChannel !== "Not Set") {
    let adminKb = new InlineKeyboard().text("✅ Approve", `wd_app_${withdrawalId}`).text("❌ Reject", `wd_rej_${withdrawalId}`);
    const userLink = `<a href="tg://user?id=${userId}">${userId}</a>`;
    const hashTag = `<code>(#${userWithdrawalCount})</code>`;
    const methodIcon = method === "upi" ? "⚡" : method === "bank" ? "🏦" : method === "wallet" ? "🌐" : method === "amazon" ? "📧" : "🎁";
    try {
      await ctx.api.sendMessage(payoutChannel,
        `⚠️ <b>New ${methodDisplay.toUpperCase()} Payout Request!</b> ${hashTag}\n\n👤 <b>User:</b> ${userLink}\n💰 <b>Request Amount:</b> <code>₹${amount}</code>\n${methodIcon} <b>${methodDisplay}:</b> <code>${details}</code>\n\n📊 <b>Status:</b> ⏳ Pending`,
        { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
    } catch (e) {}
  }

  let buttons = await buildWithdrawMenu();
  await ctx.editMessageText(`✅ *Withdrawal Submitted!*\n\n💰 ₹${amount}\n${methodDisplay}: \`${details}\`\n🆔 Request: #${userWithdrawalCount}\n\n⏳ Pending admin approval.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") }).catch(() => {});
});

// ✅ Cancel → Withdraw Menu
bot.callbackQuery("man_conf_no", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled" }).catch(() => {});
  let buttons = await buildWithdrawMenu();
  return ctx.editMessageText(`✨ *Choose Your Withdraw Method:*`, { reply_markup: await buildStyledKb(buttons), parse_mode: "Markdown" }).catch(() => {});
});

// ✅ Cancel → Withdraw Menu
bot.callbackQuery("wd_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "❌ Cancelled" }).catch(() => {});
  let buttons = await buildWithdrawMenu();
  return ctx.reply(`✨ *Choose Your Withdraw Method:*`, { reply_markup: await buildStyledKb(buttons), parse_mode: "Markdown" });
});

// ✅ Back to Withdraw Menu
bot.callbackQuery("back_to_withdraw", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery().catch(() => {});
  let buttons = await buildWithdrawMenu();
  return ctx.editMessageText(`✨ *Choose Your Withdraw Method:*`, { reply_markup: await buildStyledKb(buttons), parse_mode: "Markdown" }).catch(() => {});
});

// ✅ Back to Payout Method
bot.callbackQuery("btn_payout_back", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  return sendPayoutMethodPage(ctx, true);
});

// ---------- Add Manual Method ----------
bot.callbackQuery("wd_add_wallet_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_WALLET";
  await ctx.editMessageText(`🌐 Add Wallet\n\n📝 Send your wallet number:`, { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") }).catch(() => {});
});
bot.callbackQuery("wd_add_upi_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_UPI";
  await ctx.editMessageText(`⚡ Add UPI\n\n📝 Send your UPI ID:\n\n📌 Example: <code>yourname@upi</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") }).catch(() => {});
});
bot.callbackQuery("wd_add_bank_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  userState[ctx.from.id] = "WD_ADD_BANK_ACCNO";
  await ctx.editMessageText(`🏦 Add Bank\n\n📝 Send Account Number:`, { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_withdraw") }).catch(() => {});
});

// ---------- Payment Method Setters ----------
bot.callbackQuery("set_wallet_number", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let cur = user.walletNumber && user.walletNumber !== "" ? user.walletNumber : "Not Set";
  userState[userId] = "SET_WALLET_NUMBER";
  await ctx.editMessageText(`📱 *Set Wallet Number*\n\n📌 Current: \`${cur}\`\n\n📝 Send your new number:\n\n✨ This number will be used for all gateways.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "btn_payout_back") }).catch(() => {});
});

bot.callbackQuery("set_wallet", async (ctx) => {
  userState[ctx.from.id] = "SET_WALLET_ACC";
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`🌐 *Send Wallet Number*`, { parse_mode: "Markdown", reply_markup: new Keyboard().text("❌ Cancel").resized() });
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
// ⚙️ USER SETTINGS
// ============================================================
bot.callbackQuery("user_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let text = `⚙️ Settings\n\n🎨 Customize Your Bot\n\nYour changes affect only your view.`;
  let kb = new InlineKeyboard().text("📱 Reply Keyboard", "uset_reply_kb").row().text("🎨 Inline Buttons", "uset_inline_kb").row()
    .text("💳 Edit Payment Method", "uset_edit_payment").row().text("🔄 Reset to Default", "uset_reset").row().text("🔙 Back", "back_to_balance");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("uset_edit_payment", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let text = `💳 Your Payment Methods\n\n👛 Wallet: <code>${user.walletAccount || "Not Set"}</code>\n⚡ UPI: <code>${user.upiId || "Not Set"}</code>\n🏦 Bank: <code>${user.bankAccNo || "Not Set"}</code>\n\n👇 Click to edit:`;
  let kb = new InlineKeyboard().text("👛 Edit Wallet", "uset_edit_wallet").row().text("⚡ Edit UPI", "uset_edit_upi").row().text("🏦 Edit Bank", "uset_edit_bank").row().text("🔙 Back", "user_settings");
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

// ---------- USER KEYBOARD CUSTOMIZER ----------
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
  kb.text("🔄 Reset", "uset_reset_kb").row().text("🔙 Back", "user_settings");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_edit_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let text = `✏️ Edit: ${btn.name}\n\n📛 Current: ${btn.name}\n📍 Row: ${btn.row}\n\nChoose action:`;
  let kb = new InlineKeyboard().text("📝 Rename", `uset_kb_rename_${idx}`).row()
    .text("⬆️ Up", `uset_kb_up_${idx}`).text("⬇️ Down", `uset_kb_down_${idx}`).row()
    .text("⬅️ Left", `uset_kb_left_${idx}`).text("➡️ Right", `uset_kb_right_${idx}`).row()
    .text("🗑️ Remove", `uset_kb_del_${idx}`).row().text("🔙 Back", "uset_reply_kb");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_rename_", ""), 10);
  userState[userId] = `USET_WAIT_KB_RENAME_${idx}`;
  await ctx.editMessageText(`📝 Send new name:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "uset_reply_kb") }).catch(() => {});
});

bot.callbackQuery(/^uset_kb_up_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_up_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  if (layout[idx].row > 0) layout[idx].row -= 1;
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_down_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_down_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].row += 1;
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_left_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_left_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx <= 0 || idx >= layout.length) return;
  if (layout[idx].row === layout[idx - 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx - 1]; layout[idx - 1] = temp;
    await saveUserKeyboard(userId, layout);
  }
  ctx.answerCallbackQuery({ text: "⬅️" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_right_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_right_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx >= layout.length - 1) return;
  if (layout[idx].row === layout[idx + 1].row) {
    let temp = layout[idx]; layout[idx] = layout[idx + 1]; layout[idx + 1] = temp;
    await saveUserKeyboard(userId, layout);
  }
  ctx.answerCallbackQuery({ text: "➡️" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery(/^uset_kb_del_/, async (ctx) => {
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_del_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  layout.splice(idx, 1);
  await saveUserKeyboard(userId, layout);
  ctx.answerCallbackQuery({ text: "🗑️" });
  await rerender(ctx, "uset_reply_kb");
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
  let kb = new InlineKeyboard().text("💰 Balance Menu", "uset_inline_balance").row().text("🚀 Withdraw Menu", "uset_inline_withdraw").row().text("💳 Payment Menu", "uset_inline_payment").row().text("🔙 Back", "user_settings");
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
      { key: "wd_cancel", name: "❌ Cancel" }
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
    let icon = (cur !== "none" && STYLE_COLORS[cur]) ? STYLE_COLORS[cur].emoji : "⚫";
    kb.text(`${icon} ${b.name}`, `uset_color_${b.key}`).row();
  }
  kb.text("🔙 Back", "uset_inline_kb");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

const STYLE_COLORS = {
  primary: { label: "Blue", emoji: "🔵" },
  success: { label: "Green", emoji: "🟢" },
  danger: { label: "Red", emoji: "🔴" },
  white: { label: "White", emoji: "⚪" }
};

bot.callbackQuery(/^uset_color_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let btnKey = ctx.callbackQuery.data.replace("uset_color_", "");
  let styleMap = await getConfig("inline_button_styles", {});
  let cur = styleMap[btnKey] || "none";
  let text = `🎨 Set Color\n\n📌 ${btnKey}\n🎨 Current: ${cur}`;
  let kb = new InlineKeyboard();
  for (let [key, info] of Object.entries(STYLE_COLORS)) {
    let mark = cur === key ? "✅ " : "";
    kb.text(`${mark}${info.emoji} ${info.label}`, `uset_setcolor_${btnKey}_${key}`).row();
  }
  kb.text(`${cur === "none" ? "✅ " : ""}⚫ Default`, `uset_setcolor_${btnKey}_none`).row().text("🔙 Back", "uset_inline_kb");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^uset_setcolor_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("uset_setcolor_", "").split("_");
  let colorKey = parts.pop();
  let btnKey = parts.join("_");
  let styleMap = await getConfig("inline_button_styles", {});
  if (colorKey === "none") delete styleMap[btnKey];
  else if (STYLE_COLORS[colorKey]) styleMap[btnKey] = colorKey;
  await setConfig("inline_button_styles", styleMap);
  ctx.answerCallbackQuery({ text: "✅ Applied!" });
  await rerender(ctx, "uset_inline_kb");
});

bot.callbackQuery("uset_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`🔄 Reset to Default?\n\nThis will remove ALL your customizations.`,
    { reply_markup: new InlineKeyboard().text("✅ Yes, Reset", "uset_reset_confirm").text("❌ Cancel", "user_settings") }).catch(() => {});
});

bot.callbackQuery("uset_reset_confirm", async (ctx) => {
  let userId = ctx.from.id;
  await UserPreference.deleteOne({ userId });
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await ctx.editMessageText(`✅ Reset Complete!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }).catch(() => {});
});

// ============================================================
// 🏧 WITHDRAWAL APPROVE / REJECT (Admin)
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Withdrawal Approved", `WD #${wId}`, wd.amount, wd.userId);
  await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;
  await ctx.editMessageText(`✅ <b>Withdrawal Approved!</b>\n\n💰 ₹${wd.amount}\n🚀 TXN: <code>${txnNumber}</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) }).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId,
      `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n🏦 Destination ==> ${wd.details}\n🚀Transaction ID ==> ${txnNumber}\n🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n✅Please Check Your ${wd.method} Account!`,
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Withdrawal Rejected", `WD #${wId}`, wd.amount, wd.userId);

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Withdrawal Refunded`, wd.amount);

  await ctx.answerCallbackQuery({ text: "Rejected & Refunded!" });
  await ctx.editMessageText(`❌ <b>Withdrawal Rejected!</b>\n\n💰 ₹${wd.amount}\n💵 Refunded to user.`, { parse_mode: "HTML" }).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId, `❌ *Withdrawal Rejected!*\n\n💰 ₹${wd.amount}\n\n💵 Refunded: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown" });
  } catch (e) {}
});

console.log("✅ Part 6 Loaded — User Callbacks (Balance, Withdraw, Back System, Quick Pay v3, Settings)");
// ============================================================
// 🚀 /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  let disabled = await isAdminDisabled(userId);
  if (disabled) {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId }).lean();
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    return ctx.reply(`❌ ADMIN ACCESS DISABLED\n\nYour admin permissions have been disabled by the Owner.\n\n📞 Contact Owner: ${ownerName}\n🆔 Owner ID: ${ownerId}`,
      { reply_markup: new InlineKeyboard().text("🏠 Back to Main Menu", "back_to_balance") });
  }
  if (!(await isAdmin(userId))) return ctx.reply("❌ Not an admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let [userCount, activeAdmins, gatewayCount] = await Promise.all([
    User.countDocuments({}),
    BotAdmin.countDocuments({ isActive: true }),
    Gateway.countDocuments({ isActive: true })
  ]);

  let botActive = configCache.data["bot_active"] ?? true;
  let minW = configCache.data["min_withdraw"] ?? 10;
  let maxW = configCache.data["max_withdraw"] ?? 10000;
  let pChannel = configCache.data["payout_channel"] ?? "Not Set";
  let supportId = configCache.data["support_username"] ?? "Not Set";
  let autoUPIEnabled = configCache.data["auto_upi_enabled"] ?? true;
  let quickTaxEnabled = configCache.data["quick_pay_tax_enabled"] ?? false;
  let quickTaxPercent = configCache.data["quick_pay_tax_percent"] ?? 0;

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Bot Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🌐 *Gateways:* ${gatewayCount} active\n` +
    `💠 *Add Fund:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `⚡ *Quick Pay Tax:* ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 OFF"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${activeAdmins}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  // Dynamic layout — filter hidden
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  let visibleLayout = layout.filter(b => !b.hidden);

  let rawButtons = [];
  let maxRow = visibleLayout.length > 0 ? Math.max(...visibleLayout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = visibleLayout.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let row = rowButtons.map(btn => ({ text: btn.name, callback_data: btn.key }));
      rawButtons.push(row);
    }
  }

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
// 👮 ADMIN PERMISSIONS (Add / Toggle / Remove)
// ============================================================
bot.callbackQuery("adm_permissions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

async function renderPermissionsPanel(ctx) {
  const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  const ownerUser = await User.findOne({ userId: ownerId }).lean();
  const admins = await BotAdmin.find({}).sort({ addedAt: -1 }).lean();

  let text = `👮 *Admin Permissions*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `👑 *Owner:* ${ownerUser?.firstName || "Owner"}\n🆔 \`${ownerId}\`\n\n`;
  text += `📊 *Total Admins:* ${admins.length}\n\n👇 Click to toggle / remove:`;

  let kb = new InlineKeyboard();
  for (let a of admins) {
    let u = await User.findOne({ userId: a.userId }).lean();
    let name = u ? (u.firstName || "User") : "Unknown";
    let status = a.isActive ? "🟢" : "🔴";
    kb.text(`${status} ${name} — ${a.userId}`, `adm_perm_toggle_${a.userId}`).row();
    kb.text("🗑️ Remove", `adm_perm_remove_${a.userId}`).row();
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

bot.callbackQuery(/^adm_perm_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("adm_perm_remove_", ""), 10);
  let admin = await BotAdmin.findOne({ userId: adminId });
  if (!admin) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  await BotAdmin.deleteOne({ userId: adminId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", "Admin Removed", `${adminId}`, 0, adminId);
  await ctx.answerCallbackQuery({ text: "🗑️ Removed!" });
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(
    `➕ *Add New Admin*\n\n📝 Send User ID or @username:\n\nExample:\n\`123456789\`\n\`@username\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_permissions") }
  );
});

// ============================================================
// 👑 TRANSFER OWNERSHIP
// ============================================================
bot.callbackQuery("adm_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(`👑 *Transfer Ownership*\n\n⚠️ You will become an Admin.\n\n📝 Send new Owner User ID:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") });
});

bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);
  let currentOwner = ctx.from.id;
  await BotAdmin.findOneAndUpdate({ userId: currentOwner }, { addedAt: new Date(), addedBy: currentOwner, isActive: true }, { upsert: true });
  await setConfig("owner_id", newOwnerId);
  await logAdminAction(currentOwner, ctx.from.first_name || "Owner", "Ownership Transferred", `New owner: ${newOwnerId}`, 0, newOwnerId);
  await ctx.answerCallbackQuery({ text: "👑 Transferred!" });
  await ctx.editMessageText(`✅ *Ownership Transferred!*\n\n👑 New Owner: \`${newOwnerId}\``, { parse_mode: "Markdown" }).catch(() => {});
  try { await ctx.api.sendMessage(newOwnerId, `👑 *Congratulations!*\n\nYou are now the *Owner*!`, { parse_mode: "Markdown" }); } catch (e) {}
});

// ============================================================
// 🏦 GATEWAY SETUP
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayMenu(ctx);
});

async function renderGatewayMenu(ctx) {
  let gateways = await Gateway.find({}).sort({ createdAt: -1 }).lean();
  let total = gateways.length;
  let active = gateways.filter(g => g.isActive).length;

  let text = `🏦 *Gateway Setup*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Total: ${total} | 🟢 ON: ${active}\n\n`;
  if (total === 0) text += `❌ No gateways configured.\n\nClick "➕ Add New Gateway" to create one.`;
  else {
    gateways.forEach((g, i) => {
      text += `${i + 1}. 🌐 ${g.name}\n   ${g.isActive ? "🟢 ON" : "🔴 OFF"}\n   🔗 ${(g.url_template || g.url).substring(0, 35)}...\n\n`;
    });
  }
  text += `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard().text("➕ Add New Gateway", "gw_add_new").row();
  for (let g of gateways) {
    let icon = g.isActive ? "🟢" : "🔴";
    kb.text(`${icon} ${g.name}`, `gw_view_${g.name}`).row();
  }
  kb.row({ text: "🔙 Back to Admin", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("gw_add_new", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "GW_WAIT_NAME_V2";
  await ctx.editMessageText(`🏦 Add New Gateway\n\n📝 Send Gateway Name:`,
    { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") }).catch(() => {});
});

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name }).lean();
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });

  let urlShow = gw.url_template || gw.url || "";
  let text = `🏦 *Gateway: ${gw.name}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🔗 URL:\n\`${urlShow}\`\n\n📊 Status: ${gw.isActive ? "🟢 ON" : "🔴 OFF"}\n📅 Created: ${formatDateTime(gw.createdAt)}\n\n💡 Placeholders:\n• \`{wallet}\` — User's number\n• \`{amount}\` — Withdraw amount\n• \`{userId}\` — User's ID`;

  let kb = new InlineKeyboard()
    .text(gw.isActive ? "🔴 Turn OFF" : "🟢 Turn ON", `gw_toggle_${gw.name}`).row()
    .text("✏️ Edit URL", `gw_edit_${gw.name}`).row()
    .text("🗑️ Delete Gateway", `gw_del_${gw.name}`).row()
    .text("🔙 Back", "adm_gateway_menu");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^gw_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_toggle_", "");
  let gw = await Gateway.findOne({ name });
  if (!gw) return;
  gw.isActive = !gw.isActive;
  gw.updatedAt = new Date();
  await gw.save();
  await ctx.answerCallbackQuery({ text: gw.isActive ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, `gw_view_${name}`);
});

bot.callbackQuery(/^gw_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_edit_", "");
  userState[ctx.from.id] = `GW_EDIT_URL_${name}`;
  let gw = await Gateway.findOne({ name }).lean();
  await ctx.editMessageText(`✏️ *Edit Gateway URL*\n\n📛 ${name}\n\n📝 Current:\n\`${gw.url}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\nSend new URL template:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gw_view_${name}`) }).catch(() => {});
});

// ✅ INSTANT DELETE (No confirm)
bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Gateway Deleted", name, 0, null);
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderGatewayMenu(ctx);
});

// ============================================================
// 📊 MANAGE WITHDRAW (Manual + Min/Max)
// ============================================================
bot.callbackQuery("adm_manage_withdraw", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderManageWithdraw(ctx);
});

async function renderManageWithdraw(ctx) {
  let settings = await WithdrawSettings.find({}).lean();
  if (settings.length === 0) {
    const defaults = [
      { method: "upi", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
      { method: "bank", isActive: true, minAmount: 100, maxAmount: 50000, taxPercent: 0 },
      { method: "wallet", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
      { method: "amazon", isActive: false, minAmount: 100, maxAmount: 5000, taxPercent: 0 },
      { method: "redeem", isActive: false, minAmount: 50, maxAmount: 2000, taxPercent: 0 }
    ];
    for (let d of defaults) await WithdrawSettings.create(d);
    settings = await WithdrawSettings.find({}).lean();
  }

  let gateways = await Gateway.find({}).sort({ createdAt: 1 }).lean();
  let activeGateways = gateways.filter(g => g.isActive);

  let text = `📊 *Manage Withdraw*\n\n━━━━━━━━━━━━━━━━━━━━\n\n💳 *Manual Methods:*\n\n`;
  let emojis = { upi: "⚡", bank: "🏦", wallet: "🌐", amazon: "📧", redeem: "🎁" };
  let methods = ["upi", "bank", "wallet", "amazon", "redeem"];
  for (let m of methods) {
    let s = settings.find(x => x.method === m);
    if (!s) continue;
    text += `${emojis[m]} ${m.toUpperCase()} — ${s.isActive ? "🟢 ON" : "🔴 OFF"}\n   Min: ₹${s.minAmount} | Max: ₹${s.maxAmount}\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n\n🌐 *Auto Wallet (Gateways):*\n\n`;
  if (activeGateways.length === 0) text += `❌ None\n`;
  else { for (let g of activeGateways) text += `🌐 ${g.name} — 🟢 ON\n`; }

  let kb = new InlineKeyboard();
  for (let m of methods) {
    let s = settings.find(x => x.method === m);
    if (!s) continue;
    let icon = s.isActive ? "🟢" : "🔴";
    kb.text(`${icon} ${emojis[m]} ${m.toUpperCase()}`, `admwd_toggle_${m}`).row();
  }
  kb.row({ text: "⚙️ Edit Settings", callback_data: "admwd_settings_menu" });
  kb.row({ text: "🏦 Gateway Setup", callback_data: "adm_gateway_menu" });
  kb.row({ text: "🔙 Back to Admin", callback_data: "admin" });

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^admwd_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("admwd_toggle_", "");
  let s = await WithdrawSettings.findOne({ method });
  if (!s) s = await WithdrawSettings.create({ method, isActive: true });
  else { s.isActive = !s.isActive; s.updatedAt = new Date(); await s.save(); }
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Method Toggled", `${method} → ${s.isActive ? "ON" : "OFF"}`, 0, null);
  await ctx.answerCallbackQuery({ text: s.isActive ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_manage_withdraw");
});

bot.callbackQuery("admwd_settings_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `⚙️ *Edit Settings*\n\n👇 Choose a method to edit:`;
  let kb = new InlineKeyboard();
  let emojis = { upi: "⚡", bank: "🏦", wallet: "🌐", amazon: "📧", redeem: "🎁" };
  for (let m of ["upi", "bank", "wallet", "amazon", "redeem"]) kb.text(`${emojis[m]} ${m.toUpperCase()}`, `admwd_edit_${m}`).row();
  kb.row({ text: "🔙 Back", callback_data: "adm_manage_withdraw" });
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admwd_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_edit_", "");
  let s = await WithdrawSettings.findOne({ method }).lean();
  if (!s) s = await WithdrawSettings.create({ method, isActive: true });

  let emojis = { upi: "⚡", bank: "🏦", wallet: "🌐", amazon: "📧", redeem: "🎁" };
  let text = `${emojis[method]} *Edit ${method.toUpperCase()}*\n\n📊 Status: ${s.isActive ? "🟢 ON" : "🔴 OFF"}\n📉 Min: ₹${s.minAmount}\n📈 Max: ₹${s.maxAmount}\n💸 Tax: ${s.taxPercent}%`;

  let kb = new InlineKeyboard()
    .text("📉 Set Min", `admwd_min_${method}`).text("📈 Set Max", `admwd_max_${method}`).row()
    .text("💸 Set Tax", `admwd_tax_${method}`).row()
    .text(s.isActive ? "🔴 Turn OFF" : "🟢 Turn ON", `admwd_toggle_${method}`).row()
    .text("🔙 Back", "admwd_settings_menu");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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
// ⚡ MANAGE CHANNELS (Full 8 Features)
// ============================================================
bot.callbackQuery("adm_manage_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderManageChannels(ctx);
});

async function renderManageChannels(ctx) {
  let channels = await Channel.find({ isActive: true }).lean();
  let socialLinks = await SocialLink.find({}).lean();
  let payoutChannels = {};
  for (let m of ["upi", "wallet", "bank", "amazon", "redeem"]) {
    let ch = await getConfig("payout_channel_" + m, null);
    if (ch && ch !== "Not Set") payoutChannels[m] = ch;
  }

  let bannedAllowed = await getConfig("banned_in_channel_allowed", true);
  let nonAdminBypass = await getConfig("non_admin_channels_bypass", true);
  let showMode = await getConfig("show_mode", "all");

  let text = `⚡ *Manage Your Channels*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (channels.length === 0 && socialLinks.length === 0 && Object.keys(payoutChannels).length === 0) {
    text += `⚠️ No Channels Or Social Links Added Yet.\n\n💡 Click 'Add Channels' Or 'Add Social Link' To Add New Channels And Social Links.\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  } else {
    if (channels.length > 0) {
      text += `📢 *CHANNELS (${channels.length}):*\n\n`;
      channels.forEach((ch, i) => {
        text += `${i + 1}. ${ch.displayName || ch.channelId}\n   🔗 ${ch.inviteLink}\n\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    if (Object.keys(payoutChannels).length > 0) {
      text += `💰 *PAYOUT CHANNELS:*\n\n`;
      let icons = { upi: "⚡", wallet: "🌐", bank: "🏦", amazon: "📧", redeem: "🎁" };
      for (let [m, ch] of Object.entries(payoutChannels)) {
        text += `${icons[m] || "🌐"} ${m.toUpperCase()}: \`${ch}\`\n`;
      }
      text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    if (socialLinks.length > 0) {
      text += `🔗 *SOCIAL LINKS:*\n\n`;
      socialLinks.forEach(s => { text += `• ${s.name}\n  🔗 ${s.link}\n`; });
      text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
  }

  let kb = new InlineKeyboard();
  kb.text("➕ Add Channels", "adm_add_channel").row();
  kb.text("➕ Add Payout Channel", "adm_add_payout_channel").row();
  kb.text("➕ Add Social Media Links", "adm_add_social_link").row();
  kb.text("📢 Broadcast To Channels", "adm_broadcast_channels").row();

  // Channel remove buttons
  if (channels.length > 0) {
    for (let ch of channels) {
      let shortName = (ch.displayName || ch.channelId).substring(0, 18);
      kb.text(`🗑️ ${shortName}`, `ch_del_${ch.channelId}`).row();
    }
  }

  // Social link remove buttons
  if (socialLinks.length > 0) {
    for (let s of socialLinks) {
      let shortName = s.name.substring(0, 18);
      kb.text(`🗑️ ${shortName}`, `sl_del_${s._id}`).row();
    }
  }

  kb.text(`⚡ New User Join Channels ~ ${showMode === "all" ? "✅ ON" : "❌ OFF"}`, "adm_new_user_join").row();
  kb.text(`🛡️ Banned In Channel ~ ${bannedAllowed ? "✅ Allowed" : "❌ Not Allowed"}`, "adm_banned_in_channel").row();
  kb.text(`⚙️ Non-Admin Channels ~ ${nonAdminBypass ? "🟢 Bypass" : "🔴 Not Bypass"}`, "adm_non_admin_channels").row();
  kb.text(`⚪ Show Mode: ${showMode === "all" ? "All Channels" : "Selected Only"}`, "adm_show_mode").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_add_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_CHANNEL_WAIT";
  await ctx.editMessageText(
    `📢 *Add Channel*\n\nFormat: <code>ChannelID | InviteLink</code>\n\nExample:\n<code>@mychannel | https://t.me/mychannel</code>\n\n📝 Send now:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_channels") }
  );
});

bot.callbackQuery(/^ch_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let chId = ctx.callbackQuery.data.replace("ch_del_", "");
  await Channel.deleteOne({ channelId: chId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Channel Deleted", chId, 0, null);
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderManageChannels(ctx);
});

// ============================================================
// 💰 ADD PAYOUT CHANNEL (Method-wise)
// ============================================================
bot.callbackQuery("adm_add_payout_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let kb = new InlineKeyboard()
    .text("⚡ UPI", "adm_set_payout_upi").row()
    .text("🌐 Wallet", "adm_set_payout_wallet").row()
    .text("🏦 Bank", "adm_set_payout_bank").row()
    .text("📧 Amazon", "adm_set_payout_amazon").row()
    .text("🎁 Redeem", "adm_set_payout_redeem").row()
    .text("🔙 Back", "adm_manage_channels");
  await ctx.editMessageText(`💰 *Add Payout Channel*\n\n👇 Choose method:`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^adm_set_payout_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("adm_set_payout_", "");
  let current = await getConfig("payout_channel_" + method, "Not Set");
  userState[ctx.from.id] = `SET_PAYOUT_CHANNEL_${method}`;
  await ctx.editMessageText(
    `💰 *Set ${method.toUpperCase()} Payout Channel*\n\n📌 Current: \`${current}\`\n\n📝 Send channel ID:\n\nExample:\n\`@upi_payouts\`\n\`-1001234567890\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_add_payout_channel") }
  );
});

// ============================================================
// 🔗 ADD SOCIAL LINK
// ============================================================
bot.callbackQuery("adm_add_social_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_SOCIAL_LINK";
  await ctx.editMessageText(
    `🔗 *Add Social Media Link*\n\nFormat: <code>Name | Link</code>\n\nExamples:\n<code>YouTube | https://youtube.com/@channel</code>\n<code>Instagram | https://instagram.com/username</code>\n\n📝 Send now:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_channels") }
  );
});

bot.callbackQuery(/^sl_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let id = ctx.callbackQuery.data.replace("sl_del_", "");
  await SocialLink.deleteOne({ _id: id });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Social Link Deleted", id, 0, null);
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderManageChannels(ctx);
});

// ============================================================
// 📢 BROADCAST TO CHANNELS
// ============================================================
bot.callbackQuery("adm_broadcast_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true }).lean();
  if (channels.length === 0) return ctx.answerCallbackQuery({ text: "❌ No channels added!", show_alert: true });

  let text = `📢 *Broadcast To Channels*\n\n📊 Total: ${channels.length}\n\n`;
  channels.forEach((ch, i) => { text += `${i + 1}. ${ch.displayName || ch.channelId}\n`; });
  text += `\n📝 Send your broadcast message:`;

  userState[ctx.from.id] = "BROADCAST_TO_CHANNELS";
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_manage_channels") });
});

// ============================================================
// 🎛️ CHANNEL TOGGLES (Simple)
// ============================================================
bot.callbackQuery("adm_banned_in_channel", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("banned_in_channel_allowed", true);
  await setConfig("banned_in_channel_allowed", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ Allowed" : "❌ Not Allowed" });
  await rerender(ctx, "adm_manage_channels");
});

bot.callbackQuery("adm_non_admin_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("non_admin_channels_bypass", true);
  await setConfig("non_admin_channels_bypass", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 Bypass" : "🔴 Not Bypass" });
  await rerender(ctx, "adm_manage_channels");
});

bot.callbackQuery("adm_show_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("show_mode", "all");
  await setConfig("show_mode", cur === "all" ? "selected" : "all");
  await ctx.answerCallbackQuery({ text: cur === "all" ? "Selected Only" : "All Channels" });
  await rerender(ctx, "adm_manage_channels");
});

// ⚡ New User Join — Click shows Live Status Page
bot.callbackQuery("adm_new_user_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderNewUserJoinStatus(ctx);
});

async function renderNewUserJoinStatus(ctx) {
  let channels = await Channel.find({ isActive: true }).lean();
  let forceJoinEnabled = await getConfig("force_join_enabled", true);

  let text = `📊 *NEW USER JOIN CHANNELS*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `⚡ *Status:* ${forceJoinEnabled ? "✅ ON" : "❌ OFF"}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (channels.length === 0) {
    text += `⚠️ No channels added yet.\n\n💡 Click 'Add Channels' first.\n\n`;
  } else {
    for (let ch of channels) {
      let count = 0;
      try {
        let chatInfo = await ctx.api.getChat(ch.channelId);
        count = chatInfo.member_count || 0;
      } catch (e) { }
      text += `📢 ${ch.displayName || ch.channelId}\n   👥 🔵 ${count.toLocaleString()} Subscribers\n\n`;
    }
  }

  let totalUsers = await User.countDocuments({});
  let today = new Date(); today.setHours(0, 0, 0, 0);
  let weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  let todayCount = await User.countDocuments({ createdAt: { $gte: today } });
  let weekCount = await User.countDocuments({ createdAt: { $gte: weekAgo } });

  text += `━━━━━━━━━━━━━━━━━━━━\n\n📈 *NEW USERS:*\n\n   📅 Last 24h: ${todayCount}\n   📅 Last 7d: ${weekCount}\n   📅 Total: ${totalUsers}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("🔄 Refresh", "adm_new_user_join").row()
    .text("🔗 Preview User View", "adm_preview_user_join").row()
    .text(forceJoinEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_force_join").row()
    .text("🔙 Back", "adm_manage_channels");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_preview_user_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true }).lean();
  let kb = new InlineKeyboard();
  channels.forEach((ch) => { kb.url(`📢 ${ch.displayName || ch.channelId}`, ch.inviteLink).row(); });
  kb.text("✅ I Have Joined", "check_join_preview").row();
  kb.text("🔙 Back", "adm_new_user_join");
  await ctx.editMessageText(`📢 *JOIN ALL CHANNELS (Preview)*\n\n👇 This is what users see:`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("check_join_preview", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "✅ Preview mode", show_alert: true });
});

bot.callbackQuery("adm_toggle_force_join", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("force_join_enabled", true);
  await setConfig("force_join_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await renderNewUserJoinStatus(ctx);
});

// ============================================================
// 💬 CUSTOMER SUPPORT (Setup)
// ============================================================
bot.callbackQuery("adm_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("support_username", "Not Set");
  let displayCurrent = current !== "Not Set" ? `\`${current}\`` : "`Not Set`";
  let linkCurrent = current !== "Not Set" ? convertOwnerLink(current) : "Not Set";

  let text = `💬 *Customer Support*\n\n📌 Current: ${displayCurrent}\n🔗 Link: ${linkCurrent}\n\n👇 Choose action:`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Support", "adm_support_set").row()
    .text("🗑️ Clear", "adm_support_clear").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_support_set", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "SUPPORT_SET";
  await ctx.editMessageText(
    `✏️ *Set Customer Support*\n\n📝 Send your Telegram ID or Link:\n\nExamples:\n• \`123456789\` (User ID)\n• \`@azeeznasi\` (Username)\n• \`https://t.me/azeeznasi\` (Link)\n\n❌ Balance, Name, etc. — Not allowed!`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_support") }
  );
});

bot.callbackQuery("adm_support_clear", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("support_username", "Not Set");
  await ctx.editMessageText(`✅ *Customer Support Cleared!*\n\n📌 Current: \`Not Set\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_support") }).catch(() => {});
});

console.log("✅ Part 7 Loaded — Admin Panel + Gateway + Withdraw + Permissions + Channels + Payout + Support");
// ============================================================
// 💰 SET WITHDRAW TAX
// ============================================================
bot.callbackQuery("adm_set_wd_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("tax_percent", 0);
  let kb = new InlineKeyboard().text("✏️ Set Tax %", "adm_set_tax_val").row().text("🔄 Reset to 0%", "adm_reset_tax").row().text("🔙 Back", "admin");
  await ctx.editMessageText(`💰 *Set Withdraw Tax*\n\n📊 Current: \`${cur}%\`\n\n👇 Choose action:`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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
// 🤖 BOT STATUS
// ============================================================
bot.callbackQuery("adm_bot_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let botActive = await getConfig("bot_active", true);
  let offText = await getConfig("bot_off_text", "🤖 Bot is currently OFF\n\nPlease try again later.");
  let kb = new InlineKeyboard().text(botActive ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_bot_toggle").row().text("✏️ Edit OFF Message", "adm_edit_bot_off").row().text("🔙 Back", "admin");
  await ctx.editMessageText(`🤖 *Bot Status*\n\n📊 Status: ${botActive ? "🟢 Active" : "🔴 Off"}\n\n📝 OFF Message:\n${offText}`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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

// ============================================================
// 🚫 MANAGE BAN USERS
// ============================================================
bot.callbackQuery("adm_manage_ban", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let bannedUsers = await User.find({ isBanned: true }).limit(20).lean();
  let text = `🚫 *Manage Ban Users*\n\n📊 Total Banned: ${bannedUsers.length}\n\n`;
  bannedUsers.forEach((u, i) => { text += `${i + 1}. 👤 ${u.firstName || "User"} — \`${u.userId}\`\n`; });
  let kb = new InlineKeyboard().text("➕ Ban New User", "adm_ban_new").row().text("🔓 Unban User", "adm_unban_user").row().text("🔙 Back", "admin");
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
  let text = `🚫 *Manage Ban Wallet*\n\n♾️ Unlimited: ${unlimitedWallet ? "🟢 ON" : "🔴 OFF"}\n⏱️ One-Time: ${onetimeWallet ? "🟢 ON" : "🔴 OFF"}\n\n👇 Choose action:`;
  let kb = new InlineKeyboard().text("🚫 Ban Wallet", "adm_ban_wallet").row()
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
  let totalAmt = await Withdrawal.aggregate([{ $match: { status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let total = totalAmt[0]?.total || 0;
  let pendingWd = await Withdrawal.countDocuments({ status: "Pending" });
  let rejectedWd = await Withdrawal.countDocuments({ status: "Rejected" });

  let text = `💸 *Withdraw Status*\n\n✅ Approved: ${totalWd}\n⏳ Pending: ${pendingWd}\n❌ Rejected: ${rejectedWd}\n\n💰 Total Paid: ₹${total.toFixed(2)}`;
  let kb = new InlineKeyboard().text("📊 Manage Withdraw", "adm_manage_withdraw").row().text("🔙 Back", "admin");
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
  await ctx.editMessageText(`⚠️ RESET ALL BALANCES\n\nUsers: ${userCount}\n\nThis will reset EVERYONE's balance to ₹0!\n\nConfirm?`, { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Reset All Balances", "All users", 0, null);
  await ctx.editMessageText("✅ All balances reset to ₹0", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// 📢 BROADCAST (Full Support — Direct/Forward)
// ============================================================
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BROADCAST_WAIT_MSG";
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "direct";

  await ctx.editMessageText(
    `📢 *BROADCAST SETUP*\n\n` +
    `*Step 1 — Send Your Message*\n` +
    `Write your message just like a normal Telegram chat.\n\n` +
    `You can use Telegram's built-in formatting:\n` +
    `• *Bold* • _Italic_ • __Underline__ • ~Strike~ • \`Mono\`\n` +
    `• Clickable Links • Spoiler • Quote • Plain Text\n\n` +
    `No HTML or coding is required.\nThe bot will send the message exactly as you format it. ✅\n\n` +
    `*Supported Message Types*\n` +
    `• Text • Photo • Video • Audio • Document\n` +
    `• Sticker • GIF • Voice • Contact • Animation\n\n` +
    `*Step 2 — Choose a Send Mode*\n` +
    `🚀 Direct Mode — Clean message (no forwarding tag)\n` +
    `🔄 Forward Mode — Shows Forwarded from channel\n\n` +
    `👉 Now, send your message below 👇`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

bot.callbackQuery("broadcast_mode_direct", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🚀 Direct Mode" }).catch(() => {});
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "direct";
  await ctx.editMessageText(`✅ Mode: 🚀 Direct\n\n👉 Now, send your message below 👇`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

bot.callbackQuery("broadcast_mode_forward", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🔄 Forward Mode" }).catch(() => {});
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "forward";
  await ctx.editMessageText(`✅ Mode: 🔄 Forward\n\n👉 Now, send your message below 👇`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
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
  let mode = global.broadcastMode?.[userId] || "direct";
  delete userState[userId];
  delete global.broadcastCache[userId];

  await ctx.answerCallbackQuery({ text: "⏳ Broadcasting..." });
  let startTime = Date.now();
  let allUsers = await User.find({}).lean();
  let count = 0, failed = 0;

  for (let u of allUsers) {
    try {
      if (mode === "forward" && cacheObj.fromChatId && cacheObj.fromMessageId) {
        await ctx.api.forwardMessage(u.userId, cacheObj.fromChatId, cacheObj.fromMessageId);
      } else {
        if (cacheObj.type === "photo") await ctx.api.sendPhoto(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "", parse_mode: "Markdown" });
        else if (cacheObj.type === "video") await ctx.api.sendVideo(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "", parse_mode: "Markdown" });
        else if (cacheObj.type === "audio") await ctx.api.sendAudio(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "document") await ctx.api.sendDocument(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "sticker") await ctx.api.sendSticker(u.userId, cacheObj.fileId);
        else if (cacheObj.type === "animation") await ctx.api.sendAnimation(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "voice") await ctx.api.sendVoice(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "video_note") await ctx.api.sendVideoNote(u.userId, cacheObj.fileId);
        else if (cacheObj.type === "contact") await ctx.api.sendContact(u.userId, cacheObj.phoneNumber, cacheObj.firstName, { last_name: cacheObj.lastName || "" });
        else if (cacheObj.type === "location") await ctx.api.sendLocation(u.userId, cacheObj.latitude, cacheObj.longitude);
        else await ctx.api.sendMessage(u.userId, cacheObj.content || "", { parse_mode: "Markdown" });
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

  let text = `✅ *Broadcast Complete!*\n\n✅ Sent: ${count}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}\n\n⏱️ Time: ${timeTaken}s\n📅 ${formatDateTime(new Date())}`;
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Admin Panel", "admin") }).catch(() => {});
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
// 🔍 FIND USER
// ============================================================
bot.callbackQuery("adm_find_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 *Find User Details*\n\n📝 Send User ID:", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

// User Detail Callbacks
bot.callbackQuery(/^user_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_detail_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let totalWdArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let totalWd = totalWdArr[0]?.total || 0;

  let text = `🔍 *User Details*\n\n👤 *Name:* ${u.firstName || "User"}\n🆔 *ID:* \`${uid}\`\n📛 *Username:* ${u.username ? "@" + u.username : "None"}\n\n💰 *Balance:* ₹${u.balance.toFixed(2)}\n💸 *Total Withdrawn:* ₹${totalWd.toFixed(2)}\n📊 *Withdraw Count:* ${approvedCount}\n\n📅 *Joined:* ${formatDateTime(u.createdAt)}`;

  let kb = new InlineKeyboard()
    .text("🔗 Linked Withdraw", `user_linked_${uid}`).row()
    .text("📜 Withdraw History", `user_wd_hist_${uid}`).row()
    .text("💰 Balance History", `user_bal_hist_${uid}`).row()
    .text("➕ Add Balance", `user_add_bal_${uid}`).text("➖ Remove Balance", `user_rem_bal_${uid}`).row()
    .text("💬 Send Message", `user_send_msg_${uid}`).text("🚫 Ban/Unban", `user_ban_${uid}`).row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_linked_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_linked_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  let gwNumbers = "";
  if (u.gatewayNumbers && Object.keys(u.gatewayNumbers).length > 0) {
    for (let [name, num] of Object.entries(u.gatewayNumbers)) gwNumbers += `🌐 *${name}:* \`${num}\`\n\n`;
  } else { gwNumbers = `🌐 *Gateways:* \`None\`\n\n`; }

  let text = `🔗 *Linked Withdraw Methods*\n\n👤 ${u.firstName || "User"}\n🆔 \`${uid}\`\n\n📱 *Wallet Number:* \`${u.walletNumber || "Not Set"}\`\n\n${gwNumbers}⚡ *UPI:* \`${u.upiId || "Not Set"}\`\n\n🏦 *Bank:* \`${u.bankAccNo || "Not Set"}\`\n\n🌐 *Wallet:* \`${u.walletAccount || "Not Set"}\`\n\n📧 *Amazon:* \`${u.amazonEmail || "Not Set"}\`\n\n🎁 *Redeem:* \`${u.redeemCodeAddr || "Not Set"}\``;

  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_wd_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_hist_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(10).lean();
  let totalArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let total = totalArr[0]?.total || 0;
  let approved = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pending = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejected = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });

  let text = `📜 *Withdraw History*\n\n👤 ${uid}\n\n💰 Total: ₹${total.toFixed(2)}\n✅ ${approved} | ⏳ ${pending} | ❌ ${rejected}\n\n`;
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
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(15).lean();
  let totalCredited = 0, totalDebited = 0;
  for (let h of history) { if (h.amount >= 0) totalCredited += h.amount; else totalDebited += Math.abs(h.amount); }
  let u = await User.findOne({ userId: uid }).lean();

  let text = `💰 *Balance History*\n\n👤 ${uid}\n\n📊 Summary:\n🟢 Credited: ₹${totalCredited.toFixed(2)}\n🔴 Debited: ₹${totalDebited.toFixed(2)}\n💵 Current: ₹${(u?.balance || 0).toFixed(2)}\n\n`;
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
// 📊 STATUS (Sub-menu)
// ============================================================
bot.callbackQuery("adm_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `📊 *Status*\n\n👇 *Choose option:*`;
  let kb = new InlineKeyboard().text("🔴 Live Balance Tracker", "status_live_tracker").row()
    .text("👥 Users List", "status_users_list").text("💰 Live Fund", "status_live_fund").row()
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

  // SORT BY BALANCE (HIGH → LOW)
  let users = await User.find({})
    .sort({ balance: -1, createdAt: -1 })
    .skip(page * perPage)
    .limit(perPage)
    .lean();

  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;

  let text = `🔴 *Live Balance Tracker*\n\n👥 *Total Users:* ${totalUsers}\n💰 *Total Balance:* ₹${totalBalance.toFixed(2)}\n📄 *Page:* ${page + 1}/${totalPages || 1}\n\n👇 *Click user (High → Low):*`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 12);
    kb.text(`👤 ${name}`, `livebd_name_${u.userId}`).text(`🆔 ${u.userId}`, `livebd_copy_${u.userId}`).text(`💰 ₹${u.balance.toFixed(0)}`, `livebd_bal_${u.userId}`).row();
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
  await ctx.reply(`👤 Open Profile:`, { reply_markup: new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${uid}`).row().text("🔙 Back", "status_live_tracker") });
});

bot.callbackQuery(/^livebd_copy_/, async (ctx) => {
  let uid = ctx.callbackQuery.data.replace("livebd_copy_", "");
  await ctx.answerCallbackQuery({ text: `🆔 ${uid}`, show_alert: true });
});

bot.callbackQuery(/^livebd_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("livebd_bal_", ""), 10);
  let user = await User.findOne({ userId: uid }).lean();
  if (!user) return;
  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pendingCount = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejectedCount = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });
  let totalWd = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);

  let text = `👤 *User Balance Details*\n\n👤 *Name:* ${user.firstName || "User"}\n🆔 *ID:* \`${uid}\`\n💰 *Balance:* ₹${user.balance.toFixed(2)}\n📤 *Total Withdrawn:* ₹${(totalWd[0]?.total || 0).toFixed(2)}\n\n✅ Approved: ${approvedCount}\n⏳ Pending: ${pendingCount}\n❌ Rejected: ${rejectedCount}`;

  let kb = new InlineKeyboard().text("📜 Withdraw History", `user_wd_hist_${uid}`).text("🚀 Withdraw", `user_wd_start_${uid}`).row()
    .text("💰 Balance History", `user_bal_hist_${uid}`).row().text("🔙 Back", "status_live_tracker");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

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

  let users = await User.find({}).sort({ createdAt: -1 }).skip(page * perPage).limit(perPage).lean();
  let activeCount = await User.countDocuments({ isBanned: false });
  let bannedCount = await User.countDocuments({ isBanned: true });

  let text = `👥 *Users List*\n\n📊 *Total:* ${totalUsers}\n✅ *Active:* ${activeCount}\n🚫 *Banned:* ${bannedCount}\n📄 *Page:* ${page + 1}/${totalPages || 1}`;

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
  let user = await User.findOne({ userId: uid }).lean();
  if (!user) return;
  let text = `👤 *User Details*\n\n👤 *Name:* ${user.firstName || "User"}\n🆔 *ID:* \`${uid}\`\n💰 *Balance:* ₹${user.balance.toFixed(2)}\n📤 *Withdrawn:* ₹${(user.withdrawnTotal || 0).toFixed(2)}\n📊 *Status:* ${user.isBanned ? "🚫 Banned" : "✅ Active"}\n📅 *Joined:* ${formatDateTime(user.createdAt)}`;
  let kb = new InlineKeyboard().text("🔙 Back", "status_users_list").text("🏠 Admin Panel", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("status_live_fund", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let fund = await LiveFund.findOne({ key: "main_fund" }).lean();
  if (!fund) fund = await LiveFund.create({ key: "main_fund" });
  let totalUsers = await User.countDocuments({});
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;
  let totalWdArr = await Withdrawal.aggregate([{ $match: { status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let totalWd = totalWdArr[0]?.total || 0;
  let running = (fund.totalFund || 0) - (fund.usedFund || 0);
  let usedPercent = fund.totalFund > 0 ? ((fund.usedFund / fund.totalFund) * 100).toFixed(1) : 0;

  let text = `💰 *Live Fund*\n\n🏦 *Bot Total Fund:* ₹${totalBalance.toFixed(2)}\n📤 *Total Paid Out:* ₹${totalWd.toFixed(2)}\n👥 *Total Users:* ${totalUsers}\n\n⚙️ *Running Fund System*\n📊 Status: ${fund.isActive ? "🟢 ON" : "🔴 OFF"}\n💰 Set Fund: ₹${(fund.totalFund || 0).toFixed(2)}\n📉 Running: ₹${running.toFixed(2)}\n📤 Used: ₹${(fund.usedFund || 0).toFixed(2)} (${usedPercent}%)`;

  let kb = new InlineKeyboard().text("✏️ Set Fund", "livefund_set").row()
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
  await ctx.editMessageText("💰 *Set Live Fund*\n\n📝 Send amount:", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "status_live_fund") }).catch(() => {});
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
  let recent = await Withdrawal.find({ status: "Approved" }).sort({ approvedAt: -1 }).limit(10).lean();
  let text = `📤 *Recent Payouts*\n\n`;
  if (recent.length === 0) text += `📭 No payouts yet.`;
  else {
    for (let w of recent) {
      let u = await User.findOne({ userId: w.userId }).lean();
      text += `👤 ${u?.firstName || "User"} — ₹${w.amount.toFixed(2)}\n🆔 \`${w.userId}\` | ${formatDateTime(w.approvedAt || w.createdAt)}\n\n`;
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

  let users = await User.find({}).sort({ createdAt: -1 }).skip(page * perPage).limit(perPage).lean();
  let today = new Date(); today.setHours(0, 0, 0, 0);
  let weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  let todayCount = await User.countDocuments({ createdAt: { $gte: today } });
  let weekCount = await User.countDocuments({ createdAt: { $gte: weekAgo } });

  let text = `🆕 *New Users*\n\n📊 *Total Users:* ${totalUsers}\n📅 *Today:* ${todayCount}\n📅 *This Week:* ${weekCount}\n📄 *Page:* ${page + 1}/${totalPages || 1}\n\n👇 *Click any user:*`;

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
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return ctx.answerCallbackQuery({ text: "User not found", show_alert: true });

  let text = `👤 *User Details*\n\n👤 *Name:* ${u.firstName || "Unknown"}\n🆔 *User ID:* \`${u.userId}\`\n📛 *Username:* ${u.username ? "@" + u.username : "No username"}\n\n🕐 *Started Bot:*\n${formatDateTime(u.createdAt)}`;

  let kb = new InlineKeyboard().text("🔙 Back", "adm_new_users").text("🏠 Admin Panel", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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
  let kb = new InlineKeyboard().text("💸 Set Tax %", "adm_set_qp_tax").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_qp_tax").row()
    .text("🔄 Reset to 0%", "adm_reset_qp_tax").row().text("🔙 Back", "admin");
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
// 🎁 GIFT CODES
// ============================================================
bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20).lean();
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let text = `🎁 *Gift Codes*\n\nTotal: ${totalCodes}\n\n👇 Click code to edit:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb.text("➕ Add Codes", "adm_redeem_add").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" }).lean();
  if (!gc) return;
  let text = `🎁 Code: <code>${gc.code}</code>\n\n💰 Amount: ₹${gc.amount}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}`;
  let kb = new InlineKeyboard().text("✏️ Edit", `gc_edit_${gc.code}`).text("📋 Claim View", `gc_claim_${gc.code}`).row()
    .text("🗑️ Delete", `gc_del_${gc.code}`).row().text("🔙 Back", "adm_create_gift");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
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
  await ctx.editMessageText(`➕ Add Redeem Codes\n\n📝 Format: <code>CODE AMOUNT</code>\n\nExample:\n<code>WELCOME100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_create_gift") });
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
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(20).lean();
  let totalCodes = await GiftCode.countDocuments({ type: "amazon" });
  let text = `📧 *Amazon Codes*\n\nTotal: ${totalCodes}\n\n👇 Click code to edit:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `amz_view_${c.code}`).row();
  }
  kb.text("➕ Add Codes", "adm_amazon_add").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^amz_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_view_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" }).lean();
  if (!gc) return;
  let text = `📧 Code: <code>${gc.code}</code>\n\n💰 Amount: ₹${gc.amount}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}`;
  let kb = new InlineKeyboard().text("✏️ Edit", `amz_edit_${gc.code}`).text("📋 Claim View", `amz_claim_${gc.code}`).row()
    .text("🗑️ Delete", `amz_del_${gc.code}`).row().text("🔙 Back", "adm_amazon");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => {});
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
  await ctx.editMessageText(`➕ Add Amazon Codes\n\n📝 Format: <code>CODE AMOUNT</code>\n\nExample:\n<code>AMZ100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon") });
});

// ============================================================
// 📋 MANAGE TASKS
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({}).lean();
  let keyboard = new InlineKeyboard();
  if (tasks.length === 0) keyboard.text("📂 No Tasks", "noop").row();
  else tasks.forEach(t => {
    keyboard.text(`📄 ${t.title}`, `view_task_${t.taskId}`).text("🗑️", `del_task_${t.taskId}`).row();
  });
  keyboard.text("➕ Add New Task", "adm_create_task").row().text("🔙 Back", "admin");
  let taskText = "💡 *Manage Tasks*";
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
  let task = await Task.findOne({ taskId: tId }).lean();
  if (!task) return;
  let msg = `📋 *Task Details*\n\n🆔 ${task.taskId}\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}\n📸 Type: ${task.taskType || "photo"}\n📢 Alert: ${task.alertChannel || "Not Set"}`;
  let kb = new InlineKeyboard().text("✏️ Edit Title", `task_edit_title_${task.taskId}`).row()
    .text("✏️ Edit Reward", `task_edit_reward_${task.taskId}`).row()
    .text("✏️ Edit Link", `task_edit_link_${task.taskId}`).row()
    .text("✏️ Edit Alert Channel", `task_edit_channel_${task.taskId}`).row()
    .text(`📸 Type: ${(task.taskType || "photo").toUpperCase()}`, `task_edit_type_${task.taskId}`).row()
    .text("🗑️ Delete Task", `del_task_${task.taskId}`).row().text("🔙 Back", "adm_tasks_manager");
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
  await ctx.editMessageText(`➕ *New Task*\n\nFormat: \`TaskID | Title | Reward | Link\`\n\nExample:\n\`T1 | Subscribe | 10 | https://t.me/channel\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});

// ============================================================
// 🚀 RECENT ADMIN ACTIONS
// ============================================================
bot.callbackQuery("adm_recent_actions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(15).lean();
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
  await ctx.editMessageText(`🔔 *New User Notification*\n\n📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
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
  let kb = new InlineKeyboard().text(mode === "manual" ? "⚡ Auto" : "📝 Manual", "toggle_redeem_mode").row()
    .text("➕ Add Codes", "adm_redeem_add").row().text("📋 View All Codes", "adm_create_gift").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("toggle_redeem_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("redeem_mode", "manual");
  await setConfig("redeem_mode", current === "manual" ? "auto" : "manual");
  await ctx.answerCallbackQuery({ text: `Switched` });
  await rerender(ctx, "adm_redeem");
});

// ============================================================
// 🎨 CUSTOMIZE YOUR THEME
// ============================================================
bot.callbackQuery("adm_customize_theme", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `🎨 *Customize Your Theme*\n\n👇 *Choose what to customize:*`;
  let kb = new InlineKeyboard()
    .text("🎨 Admin Panel Customizing", "adm_panel_custom").row()
    .text("⌨️ Keyboard Buttons Customizing", "adm_keyboard_custom").row()
    .text("✏️ Edit Balance Text", "adm_edit_balance_text").row()
    .text("🚀 Start Command Edit", "adm_start_edit").row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ✏️ EDIT BALANCE TEXT
// ============================================================
bot.callbackQuery("adm_edit_balance_text", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  let text = `✏️ *Edit Balance Text*\n\n📝 *Current:*\n\n${welcomeText}\n\n🔵 Wallet ID ➝ 123456789\n🧾 Balance ➝ ₹500.00\n\n❝ ${footerText} ❞\n\n👇 *Choose:*`;
  let kb = new InlineKeyboard()
    .text("⭐ Edit Welcome Message", "adm_edit_welcome").row()
    .text("💬 Edit Footer Text", "adm_edit_footer").row()
    .text("🔄 Reset to Default", "adm_reset_balance_text").row()
    .text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_edit_welcome", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  userState[ctx.from.id] = "EDIT_WELCOME_TEXT";
  await ctx.editMessageText(`⭐ *Edit Welcome Message*\n\n📝 Current:\n\`${cur}\`\n\n✏️ Send new message:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_edit_balance_text") }).catch(() => {});
});

bot.callbackQuery("adm_edit_footer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  userState[ctx.from.id] = "EDIT_FOOTER_TEXT";
  await ctx.editMessageText(`💬 *Edit Footer Text*\n\n📝 Current:\n\`${cur}\`\n\n✏️ Send new footer:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_edit_balance_text") }).catch(() => {});
});

bot.callbackQuery("adm_reset_balance_text", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await ctx.editMessageText(`⚠️ *Reset to Default?*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Yes, Reset", "adm_reset_balance_text_yes").text("❌ Cancel", "adm_edit_balance_text") }).catch(() => {});
});

bot.callbackQuery("adm_reset_balance_text_yes", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await setConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  await setConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  await ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await ctx.editMessageText(`✅ *Reset Complete!*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_edit_balance_text") }).catch(() => {});
});

// ============================================================
// 🚀 START COMMAND EDIT
// ============================================================
bot.callbackQuery("adm_start_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let titleText = await getConfig("start_title_text", DEFAULT_START_TEXT.title);
  let linkText = await getConfig("start_link_text", DEFAULT_START_TEXT.linkText);
  let welcomeLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

  let text = `🚀 *Start Command Edit*\n\n📝 *Current Preview:*\n\n${titleText}\n\n${linkText}\n🔗 ${welcomeLink}\n\n👇 *Choose what to edit:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit Title Text", "adm_start_edit_title").row()
    .text("✏️ Edit Link Text", "adm_start_edit_link").row()
    .text("🔗 Set Link URL", "adm_start_edit_url").row()
    .text("🔄 Reset to Default", "adm_start_reset").row()
    .text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_start_edit_title", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("start_title_text", DEFAULT_START_TEXT.title);
  userState[ctx.from.id] = "EDIT_START_TITLE";
  await ctx.editMessageText(`✏️ *Edit Title Text*\n\n📝 Current:\n\`${cur}\`\n\n✏️ Send new title:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_start_edit") }).catch(() => {});
});

bot.callbackQuery("adm_start_edit_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("start_link_text", DEFAULT_START_TEXT.linkText);
  userState[ctx.from.id] = "EDIT_START_LINK";
  await ctx.editMessageText(`✏️ *Edit Link Text*\n\n📝 Current:\n\`${cur}\`\n\n✏️ Send new link text:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_start_edit") }).catch(() => {});
});

bot.callbackQuery("adm_start_edit_url", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("welcome_channel_link", "https://t.me/yourchannel");
  userState[ctx.from.id] = "EDIT_START_URL";
  await ctx.editMessageText(`🔗 *Set Link URL*\n\n📌 Current: \`${cur}\`\n\n📝 Send new link:\n\nExamples:\n• \`https://t.me/yourchannel\`\n• \`@yourchannel\`\n• \`123456789\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_start_edit") }).catch(() => {});
});

bot.callbackQuery("adm_start_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await ctx.editMessageText(`⚠️ *Reset Start Text?*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Yes, Reset", "adm_start_reset_yes").text("❌ Cancel", "adm_start_edit") }).catch(() => {});
});

bot.callbackQuery("adm_start_reset_yes", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await setConfig("start_title_text", DEFAULT_START_TEXT.title);
  await setConfig("start_link_text", DEFAULT_START_TEXT.linkText);
  await ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await ctx.editMessageText(`✅ *Reset Complete!*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_start_edit") }).catch(() => {});
});

console.log("✅ Part 8 Loaded — Admin Callbacks (Status, Broadcast Full, Gift, Tasks, Customize)");
// ============================================================
// 🎨 ADMIN PANEL CUSTOMIZING
// ============================================================
bot.callbackQuery("adm_panel_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAdminPanelCustom(ctx);
});

async function renderAdminPanelCustom(ctx) {
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  let visible = layout.filter(b => !b.hidden);
  let hidden = layout.filter(b => b.hidden);
  let maxRow = visible.length > 0 ? Math.max(...visible.map(b => b.row)) : 0;

  let text = `⚙️ HERE YOU CAN MANAGE YOUR ADMIN PANEL LAYOUT:\n\n`;
  text += `✏️ To Edit / Rename, Simply Click On The Button Name.\n`;
  text += `👁️/🙈 Click '👁️/🙈' To Hide Or Show A Button.\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = visible.filter(b => b.row === r);
    if (rowButtons.length > 0) text += `${rowButtons.map(b => b.name).join(" | ")}\n`;
  }

  if (hidden.length > 0) {
    text += `\n🙈 (Hidden): ${hidden.map(b => b.name).join(" | ")}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n🔄 Row Customize:`;

  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = visible.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let shortName = rowButtons[0].name.length > 12 ? rowButtons[0].name.substring(0, 12) + ".." : rowButtons[0].name;
      kb.text(`${shortName}`, `admrow_first_${r}`)
        .text("⬆️ Row", `admrow_up_${r}`)
        .text("⬇️ Row", `admrow_down_${r}`).row();
    }
  }

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});

  let kb2 = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    let shortName = layout[i].name.length > 10 ? layout[i].name.substring(0, 10) + ".." : layout[i].name;
    let icon = layout[i].hidden ? "🙈" : "👁️";
    kb2.text(shortName, `admbtn_edit_${i}`)
      .text(icon, `admbtn_toggle_${i}`)
      .text("⬆️", `admbtn_up_${i}`)
      .text("⬇️", `admbtn_down_${i}`)
      .text("📥", `admbtn_move_${i}`).row();
  }
  kb2.row({ text: "♻️ Reset Admin Panel", callback_data: "admpanel_reset" });
  kb2.row({ text: "🎨 Update for All Admins", callback_data: "admpanel_update_all" });
  kb2.row({ text: "🔙 Back", callback_data: "adm_customize_theme" });

  await ctx.reply("🎯 *Btn Customize:*", { reply_markup: kb2, parse_mode: "Markdown" });
}

// ---------- Row Up/Down ----------
bot.callbackQuery(/^admrow_up_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("admrow_up_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (r <= 0) return ctx.answerCallbackQuery({ text: "Already top!", show_alert: true });
  layout.forEach(b => {
    if (b.row === r) b.row = r - 1;
    else if (b.row === r - 1) b.row = r;
  });
  await setConfig("admin_panel_layout", layout);
  ctx.answerCallbackQuery({ text: "⬆️" });
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
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_panel_custom");
});

// ---------- Btn Edit ----------
bot.callbackQuery(/^admbtn_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_edit_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let text = `✏️ *Edit Button*\n\n📛 ${btn.name}\n📍 Row: ${btn.row}\n👁️ Status: ${btn.hidden ? "🙈 Hidden" : "👁️ Visible"}\n\n👇 Choose:`;
  let kb = new InlineKeyboard().text("📝 Rename", `admbtn_rename_${idx}`).row().text("🔙 Back", "adm_panel_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admbtn_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_rename_", ""), 10);
  userState[ctx.from.id] = `ADM_BTN_RENAME_${idx}`;
  await ctx.editMessageText("📝 Send new name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_panel_custom") }).catch(() => {});
});

// ---------- Btn Toggle Hide/Show ----------
bot.callbackQuery(/^admbtn_toggle_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("admbtn_toggle_", ""), 10);
  let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].hidden = !layout[idx].hidden;
  await setConfig("admin_panel_layout", layout);
  ctx.answerCallbackQuery({ text: layout[idx].hidden ? "🙈 Hidden" : "👁️ Visible" });
  await rerender(ctx, "adm_panel_custom");
});

// ---------- Btn Up/Down ----------
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

// ---------- Btn Move ----------
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

// ---------- Reset Admin Panel ----------
bot.callbackQuery("admpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`⚠️ *Reset Admin Panel?*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "admpanel_reset_yes").text("❌ Cancel", "adm_panel_custom") }).catch(() => {});
});

bot.callbackQuery("admpanel_reset_yes", async (ctx) => {
  await setConfig("admin_panel_layout", JSON.parse(JSON.stringify(DEFAULT_ADMIN_PANEL_LAYOUT)));
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "adm_panel_custom");
});

// ---------- Update for All Admins ----------
bot.callbackQuery("admpanel_update_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let admins = await BotAdmin.find({ isActive: true }).lean();
  let total = admins.length + 1;
  await ctx.editMessageText(
    `⚠️ *Update for All Admins?*\n\n👥 Total: ${total} admins\n\n👇 Choose mode:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard()
        .text("🟢 ON — Send Message", "admpanel_update_yes_on").row()
        .text("🔴 OFF — No Message", "admpanel_update_yes_off").row()
        .text("❌ Cancel", "adm_panel_custom") }
  ).catch(() => {});
});

bot.callbackQuery("admpanel_update_yes_on", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await performAdminPanelUpdate(ctx, true);
});

bot.callbackQuery("admpanel_update_yes_off", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await performAdminPanelUpdate(ctx, false);
});

async function performAdminPanelUpdate(ctx, sendMessage) {
  let startTime = Date.now();
  let admins = await BotAdmin.find({ isActive: true }).lean();
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let updateMsg = await getConfig("admin_panel_update_msg", "🎨 Admin Panel Updated!\nYour panel has been updated.");

  let sent = 0, failed = 0;
  let allIds = [ownerId, ...admins.map(a => a.userId)];
  let uniqueIds = [...new Set(allIds)];

  for (let id of uniqueIds) {
    try {
      if (sendMessage) await bot.api.sendMessage(id, updateMsg);
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  let text = `✅ *Update Complete!*\n\n✅ Success: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${uniqueIds.length}\n\n⏱️ Time: ${timeTaken}s`;
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_panel_custom"), parse_mode: "Markdown" }).catch(() => {});
}

// ============================================================
// ⌨️ KEYBOARD BUTTONS CUSTOMIZING
// ============================================================
bot.callbackQuery("adm_keyboard_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderKeyboardCustom(ctx);
});

async function renderKeyboardCustom(ctx) {
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  let visible = layout.filter(b => !b.hidden);
  let hidden = layout.filter(b => b.hidden);
  let maxRow = visible.length > 0 ? Math.max(...visible.map(b => b.row)) : 0;

  let text = `⚙️ HERE YOU CAN MANAGE YOUR KEYBOARD LAYOUT:\n\n`;
  text += `✏️ To Edit / Rename, Simply Click On The Button Name.\n`;
  text += `👁️/🙈 Click '👁️/🙈' To Hide Or Show A Button.\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = visible.filter(b => b.row === r);
    if (rowButtons.length > 0) text += `${rowButtons.map(b => b.name).join(" | ")}\n`;
  }

  if (hidden.length > 0) {
    text += `\n🙈 (Hidden): ${hidden.map(b => b.name).join(" | ")}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n🔄 Row Customize:`;

  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = visible.filter(b => b.row === r);
    if (rowButtons.length > 0) {
      let shortName = rowButtons[0].name.length > 12 ? rowButtons[0].name.substring(0, 12) + ".." : rowButtons[0].name;
      kb.text(`${shortName}`, `kbrow_first_${r}`).text("⬆️ Row", `kbrow_up_${r}`).text("⬇️ Row", `kbrow_down_${r}`).row();
    }
  }

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});

  let kb2 = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) {
    let shortName = layout[i].name.length > 10 ? layout[i].name.substring(0, 10) + ".." : layout[i].name;
    let icon = layout[i].hidden ? "🙈" : "👁️";
    kb2.text(shortName, `kbbtn_edit_${i}`)
      .text(icon, `kbbtn_toggle_${i}`)
      .text("⬆️", `kbbtn_up_${i}`)
      .text("⬇️", `kbbtn_down_${i}`)
      .text("📥", `kbbtn_move_${i}`).row();
  }
  kb2.row({ text: "♻️ Reset Keyboard", callback_data: "kbpanel_reset" });
  kb2.row({ text: "🎨 Update for All Users", callback_data: "kbpanel_update_all" });
  kb2.row({ text: "🔔 Update Message Send", callback_data: "kbpanel_msg_toggle" });
  kb2.row({ text: "🔙 Back", callback_data: "adm_customize_theme" });

  await ctx.reply("🎯 *Btn Customize:*", { reply_markup: kb2, parse_mode: "Markdown" });
}

// ---------- Row Up/Down ----------
bot.callbackQuery(/^kbrow_up_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("kbrow_up_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (r <= 0) return ctx.answerCallbackQuery({ text: "Already top!", show_alert: true });
  layout.forEach(b => { if (b.row === r) b.row = r - 1; else if (b.row === r - 1) b.row = r; });
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬆️" });
  await rerender(ctx, "adm_keyboard_custom");
});

bot.callbackQuery(/^kbrow_down_/, async (ctx) => {
  let r = parseInt(ctx.callbackQuery.data.replace("kbrow_down_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  if (r >= maxRow) return ctx.answerCallbackQuery({ text: "Already bottom!", show_alert: true });
  layout.forEach(b => { if (b.row === r) b.row = r + 1; else if (b.row === r + 1) b.row = r; });
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: "⬇️" });
  await rerender(ctx, "adm_keyboard_custom");
});

// ---------- Btn Edit ----------
bot.callbackQuery(/^kbbtn_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_edit_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];
  let text = `✏️ *Edit Button*\n\n📛 ${btn.name}\n📍 Row: ${btn.row}\n👁️ Status: ${btn.hidden ? "🙈 Hidden" : "👁️ Visible"}\n\n👇 Choose:`;
  let kb = new InlineKeyboard().text("📝 Rename", `kbbtn_rename_${idx}`).row().text("🔙 Back", "adm_keyboard_custom");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbbtn_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_rename_", ""), 10);
  userState[ctx.from.id] = `KB_BTN_RENAME_${idx}`;
  await ctx.editMessageText("📝 Send new name:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_keyboard_custom") }).catch(() => {});
});

// ---------- Btn Toggle Hide/Show ----------
bot.callbackQuery(/^kbbtn_toggle_/, async (ctx) => {
  let idx = parseInt(ctx.callbackQuery.data.replace("kbbtn_toggle_", ""), 10);
  let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
  if (idx < 0 || idx >= layout.length) return;
  layout[idx].hidden = !layout[idx].hidden;
  await setConfig("keyboard_layout", layout);
  ctx.answerCallbackQuery({ text: layout[idx].hidden ? "🙈 Hidden" : "👁️ Visible" });
  await rerender(ctx, "adm_keyboard_custom");
});

// ---------- Btn Up/Down ----------
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

// ---------- Btn Move ----------
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

// ---------- Reset Keyboard ----------
bot.callbackQuery("kbpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(`⚠️ *Reset Keyboard?*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("✅ Confirm", "kbpanel_reset_yes").text("❌ Cancel", "adm_keyboard_custom") }).catch(() => {});
});

bot.callbackQuery("kbpanel_reset_yes", async (ctx) => {
  await setConfig("keyboard_layout", JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT)));
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  await rerender(ctx, "adm_keyboard_custom");
});

// ---------- Update for All Users ----------
bot.callbackQuery("kbpanel_update_all", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let totalUsers = await User.countDocuments({});
  await ctx.editMessageText(
    `⚠️ *Update Keyboard for All Users?*\n\n👥 Total: ${totalUsers} users\n\n👇 Choose mode:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard()
        .text("🟢 ON — Send Message", "kbpanel_update_yes_on").row()
        .text("🔴 OFF — No Message", "kbpanel_update_yes_off").row()
        .text("❌ Cancel", "adm_keyboard_custom") }
  ).catch(() => {});
});

bot.callbackQuery("kbpanel_update_yes_on", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await performKeyboardUpdate(ctx, true);
});

bot.callbackQuery("kbpanel_update_yes_off", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await performKeyboardUpdate(ctx, false);
});

async function performKeyboardUpdate(ctx, sendMessage) {
  let startTime = Date.now();
  let users = await User.find({}).lean();
  let updateMsg = await getConfig("kb_update_msg", "🎨 Keyboard Updated!\nYour keyboard has been updated successfully.");

  let sent = 0, failed = 0;
  for (let u of users) {
    try {
      if (sendMessage) await bot.api.sendMessage(u.userId, updateMsg);
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  let text = `✅ *Update Complete!*\n\n✅ Success: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${users.length}\n\n⏱️ Time: ${timeTaken}s`;
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_keyboard_custom"), parse_mode: "Markdown" }).catch(() => {});
}

// ---------- Update Message Send Toggle ----------
bot.callbackQuery("kbpanel_msg_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("kb_update_msg_send", true);
  let msg = await getConfig("kb_update_msg", "🎨 Keyboard Updated!");
  let text = `🔔 *Update Message Send*\n\n📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}\n\n📝 Current Message:\n"${msg}"`;
  let kb = new InlineKeyboard().text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "kbmsg_toggle").row()
    .text("✏️ Edit Message", "kbmsg_edit").row().text("🔙 Back", "adm_keyboard_custom");
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
// 📋 TASK EDIT (FULL)
// ============================================================
bot.callbackQuery(/^task_edit_title_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_title_", "");
  userState[ctx.from.id] = `TASK_EDIT_TITLE_${tId}`;
  await ctx.editMessageText("📝 Send new title:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) }).catch(() => {});
});

bot.callbackQuery(/^task_edit_reward_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_reward_", "");
  userState[ctx.from.id] = `TASK_EDIT_REWARD_${tId}`;
  await ctx.editMessageText("📝 Send new reward:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) }).catch(() => {});
});

bot.callbackQuery(/^task_edit_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_link_", "");
  userState[ctx.from.id] = `TASK_EDIT_LINK_${tId}`;
  await ctx.editMessageText("📝 Send new link:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) }).catch(() => {});
});

bot.callbackQuery(/^task_edit_channel_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_channel_", "");
  userState[ctx.from.id] = `TASK_EDIT_CHANNEL_${tId}`;
  await ctx.editMessageText("📝 Send new alert channel:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `view_task_${tId}`) }).catch(() => {});
});

bot.callbackQuery(/^task_edit_type_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_type_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let newType = (task.taskType || "photo") === "photo" ? "refer" : "photo";
  await Task.updateOne({ taskId: tId }, { taskType: newType });
  await ctx.answerCallbackQuery({ text: `✅ ${newType.toUpperCase()}` });
  await rerender(ctx, `view_task_${tId}`);
});

// ============================================================
// 🎁 GIFT CODE EDIT (FULL)
// ============================================================
bot.callbackQuery(/^gc_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" }).lean();
  if (!gc) return;
  let text = `✏️ *Edit Redeem Code*\n\n🎁 Code: \`${gc.code}\`\n💰 Amount: ₹${gc.amount}\n👥 Max Uses: ${gc.maxUses}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}\n\n👇 Choose:`;
  let kb = new InlineKeyboard().text("💰 Edit Amount", `gc_edit_amt_${gc.code}`).row()
    .text("👥 Edit Max Uses", `gc_edit_max_${gc.code}`).row()
    .text("📋 Claim View", `gc_claim_${gc.code}`).row()
    .text("🔙 Back", `gc_view_${gc.code}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_GC_AMT_${code}`;
  await ctx.editMessageText("✏️ Send new amount:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_edit_${code}`) });
});

bot.callbackQuery(/^gc_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_max_", "");
  userState[ctx.from.id] = `WAITING_GC_MAX_${code}`;
  await ctx.editMessageText("✏️ Send new max uses:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_edit_${code}`) });
});

bot.callbackQuery(/^gc_claim_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_claim_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" }).lean();
  if (!gc || gc.usedUsers.length === 0) return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
  let text = `📋 Claims for \`${code}\`\n\n`;
  for (let uid of gc.usedUsers.slice(0, 20)) {
    let u = await User.findOne({ userId: uid }).lean();
    text += `👤 ${u ? (u.firstName || "User") : "Unknown"} — \`${uid}\`\n`;
  }
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`), parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 📧 AMAZON CODE EDIT (FULL)
// ============================================================
bot.callbackQuery(/^amz_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" }).lean();
  if (!gc) return;
  let text = `✏️ *Edit Amazon Code*\n\n📧 Code: \`${gc.code}\`\n💰 Amount: ₹${gc.amount}\n👥 Max Uses: ${gc.maxUses}\n📊 Claimed: ${gc.usedUsers.length}/${gc.maxUses}\n\n👇 Choose:`;
  let kb = new InlineKeyboard().text("💰 Edit Amount", `amz_edit_amt_${gc.code}`).row()
    .text("👥 Edit Max Uses", `amz_edit_max_${gc.code}`).row()
    .text("📋 Claim View", `amz_claim_${gc.code}`).row()
    .text("🔙 Back", `amz_view_${gc.code}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^amz_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_AMZ_AMT_${code}`;
  await ctx.editMessageText("✏️ Send new amount:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `amz_edit_${code}`) });
});

bot.callbackQuery(/^amz_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_edit_max_", "");
  userState[ctx.from.id] = `WAITING_AMZ_MAX_${code}`;
  await ctx.editMessageText("✏️ Send new max uses:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `amz_edit_${code}`) });
});

bot.callbackQuery(/^amz_claim_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_claim_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" }).lean();
  if (!gc || gc.usedUsers.length === 0) return ctx.editMessageText(`📋 No claims yet.`, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_view_${code}`) });
  let text = `📋 Claims for \`${code}\`\n\n`;
  for (let uid of gc.usedUsers.slice(0, 20)) {
    let u = await User.findOne({ userId: uid }).lean();
    text += `👤 ${u ? (u.firstName || "User") : "Unknown"} — \`${uid}\`\n`;
  }
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_view_${code}`), parse_mode: "Markdown" }).catch(() => {});
});

console.log("✅ Part 9 Loaded — Customize Theme (Admin Panel + Keyboard FULL) + Task/Gift/Amazon Edit");
// ============================================================
// ✏️ ADMIN TEXT HANDLERS (All States)
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  let text = ctx.message.text.trim();

  if (!state) return next();

  // Skip user-specific states (already handled in Part 5)
  const userStates = [
    "SET_WALLET_NUMBER", "UPI_WAIT_AMOUNT", "WAITING_FOR_GIFT_REDEEM",
    "QP_WAIT_USERID", "USET_WAIT_WALLET", "USET_WAIT_UPI", "USET_WAIT_BANK_ACCNO",
    "SET_WALLET_ACC", "SET_UPI_ACC", "SET_BANK_ACCNO", "WD_ADD_UPI", "WD_ADD_WALLET", "WD_ADD_BANK_ACCNO"
  ];
  if (userStates.includes(state) ||
      state.startsWith("GW_NUMBER_") || state.startsWith("GW_AMOUNT_") ||
      state.startsWith("MANUAL_AMOUNT_") || state.startsWith("UPI_WAIT_UTR_") ||
      state.startsWith("WD_ADD_BANK_IFSC_") || state.startsWith("USET_WAIT_KB_RENAME_") ||
      state.startsWith("USET_WAIT_BANK_IFSC_") || state.startsWith("TASK_REFER_") ||
      state.startsWith("SET_BANK_IFSC_")) {
    return next();
  }

  // ============================================================
  // ✅ ADD ADMIN
  // ============================================================
  if (state === "WAITING_ADMIN_ADD" && (await isOwner(userId))) {
    delete userState[userId];
    let input = text.trim();
    let targetUser = null;
    let newAdminId = parseInt(input, 10);
    if (!isNaN(newAdminId) && /^\d+$/.test(input)) {
      targetUser = await User.findOne({ userId: newAdminId });
    }
    if (!targetUser) {
      let cleanUsername = input.replace(/^@/, '').toLowerCase();
      targetUser = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } });
    }
    if (!targetUser) return ctx.reply("❌ User not found! Make sure they have started the bot.");
    if (targetUser.userId === userId) return ctx.reply("❌ You are already Owner!");

    await BotAdmin.findOneAndUpdate(
      { userId: targetUser.userId },
      { addedAt: new Date(), addedBy: userId, isActive: true },
      { upsert: true }
    );
    await logAdminAction(userId, ctx.from.first_name || "Owner", "Admin Added", `Added ${targetUser.userId}`, 0, targetUser.userId);
    try { await ctx.api.sendMessage(targetUser.userId, `👑 You have been added as an Admin!`); } catch (e) {}
    return ctx.reply(`✅ *Admin Added!*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${targetUser.userId}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_permissions") });
  }

  // ============================================================
  // ✅ NEW OWNER
  // ============================================================
  if (state === "WAITING_NEW_OWNER" && (await isOwner(userId))) {
    delete userState[userId];
    let newOwnerId = parseInt(text, 10);
    if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: newOwnerId });
    if (!targetUser) return ctx.reply("❌ User not found!");
    let kb = new InlineKeyboard().text("✅ Yes, Transfer", `admin_transfer_confirm_${newOwnerId}`).row().text("❌ Cancel", "adm_admins");
    return ctx.reply(`⚠️ *Confirm Transfer*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newOwnerId}\`\n\nSure?`, { parse_mode: "Markdown", reply_markup: kb });
  }

  // ============================================================
  // ✅ BROADCAST MESSAGE (Text)
  // ============================================================
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    delete userState[userId];
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = {
      type: "text", content: text,
      fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id
    };
    let totalUsers = await User.countDocuments({});
    let mode = global.broadcastMode?.[userId] || "direct";
    let kb = new InlineKeyboard()
      .text("🚀 Direct Mode", "broadcast_mode_direct")
      .text("🔄 Forward Mode", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm")
      .text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(
      `📢 *Broadcast Preview*\n\n` +
      `📝 ${text}\n\n` +
      `👥 Recipients: ${totalUsers}\n` +
      `📤 Mode: ${mode === "direct" ? "🚀 Direct" : "🔄 Forward"}\n\n` +
      `👇 Choose Mode & Confirm:`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
    return;
  }

  // ============================================================
  // ✅ BROADCAST TO CHANNELS (Text)
  // ============================================================
  if (state === "BROADCAST_TO_CHANNELS" && (await isAdmin(userId))) {
    delete userState[userId];
    let channels = await Channel.find({ isActive: true }).lean();
    let sent = 0, failed = 0;
    for (let ch of channels) {
      try {
        await ctx.api.sendMessage(ch.channelId, text);
        sent++;
      } catch (e) { failed++; }
    }
    return ctx.reply(`✅ *Broadcast Complete!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${channels.length}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
  }

  // ============================================================
  // ✅ ADD CHANNEL
  // ============================================================
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
    } catch (e) { return ctx.reply(`❌ Cannot access: ${e.message}`); }
    await Channel.create({ channelId, inviteLink, displayName: channelTitle, isActive: true });
    return ctx.reply(`✅ Channel Added!\n\n📢 ${channelTitle}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
  }

  // ============================================================
  // ✅ SET PAYOUT CHANNEL (Method-wise)
  // ============================================================
  if (state.startsWith("SET_PAYOUT_CHANNEL_") && (await isAdmin(userId))) {
    let method = state.replace("SET_PAYOUT_CHANNEL_", "");
    delete userState[userId];
    await setConfig("payout_channel_" + method, text.trim());
    return ctx.reply(`✅ *${method.toUpperCase()} Payout Channel Set!*\n\n📢 \`${text.trim()}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
  }

  // ============================================================
  // ✅ ADD SOCIAL LINK
  // ============================================================
  if (state === "ADD_SOCIAL_LINK" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length !== 2) return ctx.reply("❌ Format: `Name | Link`", { parse_mode: "Markdown" });
    await SocialLink.create({ name: parts[0], link: parts[1] });
    return ctx.reply(`✅ Social Link Added!\n\n🔗 ${parts[0]}\n🌐 ${parts[1]}`,
      { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
  }

  // ============================================================
  // ✅ EDIT WELCOME TEXT
  // ============================================================
  if (state === "EDIT_WELCOME_TEXT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("balance_welcome_text", text);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Edit Welcome Text", "Updated", 0, null);
    return ctx.reply(`✅ *Welcome Message Updated!*\n\n📝 New Message:\n\n${text}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_edit_balance_text") });
  }

  // ============================================================
  // ✅ EDIT FOOTER TEXT
  // ============================================================
  if (state === "EDIT_FOOTER_TEXT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("balance_footer_text", text);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Edit Footer Text", "Updated", 0, null);
    return ctx.reply(`✅ *Footer Updated!*\n\n📝 New Footer:\n\n❝ ${text} ❞`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_edit_balance_text") });
  }

  // ============================================================
  // ✅ START COMMAND EDIT — Title
  // ============================================================
  if (state === "EDIT_START_TITLE" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("start_title_text", text);
    return ctx.reply(`✅ *Title Updated!*\n\n📝 New:\n\n${text}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_start_edit") });
  }

  // ============================================================
  // ✅ START COMMAND EDIT — Link Text
  // ============================================================
  if (state === "EDIT_START_LINK" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("start_link_text", text);
    return ctx.reply(`✅ *Link Text Updated!*\n\n📝 New:\n\n${text}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_start_edit") });
  }

  // ============================================================
  // ✅ START COMMAND EDIT — URL
  // ============================================================
  if (state === "EDIT_START_URL" && (await isAdmin(userId))) {
    delete userState[userId];
    let input = text.trim();
    if (!input) return ctx.reply("❌ Invalid!");
    await setConfig("welcome_channel_link", input);
    let link = convertOwnerLink(input);
    return ctx.reply(`✅ *Link URL Updated!*\n\n📌 Input: \`${input}\`\n🔗 Link: ${link}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_start_edit") });
  }

  // ============================================================
  // ✅ EDIT BALANCE — WELCOME / FOOTER (handled above)
  // ============================================================

  // ============================================================
  // ✅ SUPPORT SET
  // ============================================================
  if (state === "SUPPORT_SET" && (await isAdmin(userId))) {
    delete userState[userId];
    let input = text.trim();
    if (!isValidTelegramID(input)) {
      return ctx.reply(
        `❌ *INVALID INPUT*\n\n📌 You sent: "${input}"\n\nPlease send:\n• Telegram User ID (digits only)\n• Username (@username)\n• Link (https://t.me/...)`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_support") }
      );
    }
    await setConfig("support_username", input);
    let link = convertOwnerLink(input);
    return ctx.reply(
      `✅ *Customer Support Set!*\n\n📌 Input: \`${input}\`\n🔗 Link: ${link}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_support") }
    );
  }

  // ============================================================
  // ✅ GATEWAY ADD
  // ============================================================
  if (state === "GW_WAIT_NAME_V2" && (await isAdmin(userId))) {
    let gwName = text.toUpperCase().replace(/\s+/g, "_");
    if (gwName.length < 2) return ctx.reply("❌ Name too short!");
    let existing = await Gateway.findOne({ name: gwName });
    if (existing) { delete userState[userId]; return ctx.reply(`❌ Gateway \`${gwName}\` already exists!`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_gateway_menu") }); }
    userState[userId] = `GW_WAIT_URL_V2_${gwName}`;
    return ctx.reply(`✅ Name: *${gwName}*\n\n🔗 Paste Your Gateway URL:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") });
  }

  if (state.startsWith("GW_WAIT_URL_V2_") && (await isAdmin(userId))) {
    let gwName = state.replace("GW_WAIT_URL_V2_", "");
    if (!text.startsWith("http://") && !text.startsWith("https://")) return ctx.reply("❌ URL must start with http:// or https://\n\nTry again:");
    delete userState[userId];
    await Gateway.create({ name: gwName, url: text.trim(), url_template: text.trim(), isActive: true, createdBy: userId });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Gateway Added", gwName, 0, null);
    return ctx.reply(`✅ *Gateway Created!*\n\n📛 ${gwName}\n🔗 \`${text.substring(0, 50)}...\`\n🟢 ON`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_gateway_menu") });
  }

  // ============================================================
  // ✅ GATEWAY EDIT URL
  // ============================================================
  if (state.startsWith("GW_EDIT_URL_") && (await isAdmin(userId))) {
    let gwName = state.replace("GW_EDIT_URL_", "");
    delete userState[userId];
    if (!text.startsWith("http")) return ctx.reply("❌ Invalid URL!");
    await Gateway.findOneAndUpdate({ name: gwName }, { url: text.trim(), url_template: text.trim(), updatedAt: new Date() });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Gateway Updated", gwName, 0, null);
    return ctx.reply(`✅ *Gateway Updated!*\n\n📛 ${gwName}\n🔗 \`${text.substring(0, 50)}...\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `gw_view_${gwName}`) });
  }

  // ============================================================
  // ✅ ADD BALANCE
  // ============================================================
  if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split(/\s+/);
    let targetId = parseInt(parts[0], 10);
    let amount = parseFloat(parts[1]);
    if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: `UserID Amount`", { parse_mode: "Markdown" });
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
    try { await ctx.api.sendMessage(targetId, `💰 Balance Updated!\n\n🟢 Added: ₹${amount}\n💵 New: ₹${targetUser.balance.toFixed(2)}`); } catch (e) {}
    return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
  }

  // ============================================================
  // ✅ REMOVE BALANCE
  // ============================================================
  if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split(/\s+/);
    let targetId = parseInt(parts[0], 10);
    let amount = parseFloat(parts[1]);
    if (isNaN(targetId) || isNaN(amount)) return ctx.reply("❌ Use: `UserID Amount`", { parse_mode: "Markdown" });
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply(`❌ User not found!`);
    targetUser.balance = Math.max(0, targetUser.balance - amount);
    await targetUser.save();
    await logBalanceHistory(targetId, "Admin Removed Balance", -amount);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Removed Balance", `-₹${amount} from ${targetId}`, amount, targetId);
    try { await ctx.api.sendMessage(targetId, `💰 Balance Updated!\n\n📉 Removed: ₹${amount}\n💵 New: ₹${targetUser.balance.toFixed(2)}`); } catch (e) {}
    return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
  }

  // ============================================================
  // ✅ WITHDRAW SETTINGS (Min/Max/Tax)
  // ============================================================
  if (state.startsWith("ADMWD_MIN_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_MIN_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await WithdrawSettings.findOneAndUpdate({ method }, { minAmount: amt, updatedAt: new Date() }, { upsert: true });
    return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
  }
  if (state.startsWith("ADMWD_MAX_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_MAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await WithdrawSettings.findOneAndUpdate({ method }, { maxAmount: amt, updatedAt: new Date() }, { upsert: true });
    return ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
  }
  if (state.startsWith("ADMWD_TAX_") && (await isAdmin(userId))) {
    let method = state.replace("ADMWD_TAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await WithdrawSettings.findOneAndUpdate({ method }, { taxPercent: amt, updatedAt: new Date() }, { upsert: true });
    return ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
  }

  // ============================================================
  // ✅ TAX PERCENT
  // ============================================================
  if (state === "WAITING_TAX_PERCENT" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await setConfig("tax_percent", amt);
    return ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_set_wd_tax") });
  }

  // ============================================================
  // ✅ QUICK PAY TAX
  // ============================================================
  if (state === "WAITING_QUICK_PAY_TAX" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
    await setConfig("quick_pay_tax_percent", amt);
    return ctx.reply(`✅ Quick Pay Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_quick_pay") });
  }

  // ============================================================
  // ✅ BAN USER
  // ============================================================
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
    return ctx.reply(`✅ User ${targetId} BANNED`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban") });
  }

  // ============================================================
  // ✅ UNBAN USER
  // ============================================================
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
    return ctx.reply(`✅ User ${targetId} UNBANNED`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban") });
  }

  // ============================================================
  // ✅ BAN WALLET
  // ============================================================
  if (state === "BAN_WALLET_WAIT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("banned_wallet", text);
    return ctx.reply(`✅ Wallet Banned: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban_wallet") });
  }

  // ============================================================
  // ✅ BOT OFF MESSAGE
  // ============================================================
  if (state === "WAITING_BOT_OFF_TEXT" && (await isAdmin(userId))) {
    delete userState[userId];
    await setConfig("bot_off_text", text);
    return ctx.reply(`✅ Bot OFF message updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_bot_status") });
  }

  // ============================================================
  // ✅ USER ADD BALANCE (From Detail)
  // ============================================================
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
    return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`) });
  }

  // ============================================================
  // ✅ USER REMOVE BALANCE
  // ============================================================
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
    return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`, { reply_markup: new InlineKeyboard().text("🔙 Back to User", `user_detail_${targetId}`) });
  }

  // ============================================================
  // ✅ USER SEND MESSAGE
  // ============================================================
  if (state.startsWith("UMSG_WAIT_")) {
    let targetId = parseInt(state.replace("UMSG_WAIT_", ""), 10);
    delete userState[userId];
    try {
      await ctx.api.sendMessage(targetId, `📨 Message from Admin:\n\n${text}`);
      return ctx.reply(`✅ Sent to ${targetId}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${targetId}`) });
    } catch (e) { return ctx.reply(`❌ Failed: ${e.message}`); }
  }

  // ============================================================
  // ✅ FIND USER
  // ============================================================
  if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) return ctx.reply(`❌ User not found!`);
    return ctx.reply(`👤 Loading user \`${targetId}\`...`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("👤 View Details", `user_detail_${targetId}`) });
  }

  // ============================================================
  // ✅ TALK WITH USER
  // ============================================================
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
    } catch (e) { return ctx.reply(`❌ Failed: ${e.message}`); }
  }

  // ============================================================
  // ✅ TASK CREATE
  // ============================================================
  if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length < 4) return ctx.reply("❌ Use: TaskID | Title | Reward | Link");
    await Task.create({ taskId: parts[0], title: parts[1], reward: parseFloat(parts[2]), link: parts[3], alertChannel: await getConfig("default_task_alert_channel", "Not Set") });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Task Created", `${parts[1]}`, parseFloat(parts[2]));
    return ctx.reply(`✅ Task '${parts[1]}' created!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
  }

  // ============================================================
  // ✅ TASK EDIT
  // ============================================================
  if (state.startsWith("TASK_EDIT_TITLE_")) {
    let taskId = state.replace("TASK_EDIT_TITLE_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { title: text });
    return ctx.reply(`✅ Title updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
  }
  if (state.startsWith("TASK_EDIT_REWARD_")) {
    let taskId = state.replace("TASK_EDIT_REWARD_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await Task.updateOne({ taskId }, { reward: amt });
    return ctx.reply(`✅ Reward updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
  }
  if (state.startsWith("TASK_EDIT_LINK_")) {
    let taskId = state.replace("TASK_EDIT_LINK_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { link: text });
    return ctx.reply(`✅ Link updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
  }
  if (state.startsWith("TASK_EDIT_CHANNEL_")) {
    let taskId = state.replace("TASK_EDIT_CHANNEL_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { alertChannel: text });
    return ctx.reply(`✅ Alert Channel updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
  }

  // ============================================================
  // ✅ GIFT/AMAZON CODES CREATE
  // ============================================================
  if (state === "WAITING_REDEEM_CODES" && (await isAdmin(userId))) {
    delete userState[userId];
    return await saveCodes(text, "redeem", ctx);
  }
  if (state === "WAITING_AMAZON_CODES" && (await isAdmin(userId))) {
    delete userState[userId];
    return await saveCodes(text, "amazon", ctx);
  }

  // ============================================================
  // ✅ GIFT CODE EDIT
  // ============================================================
  if (state.startsWith("WAITING_GC_AMT_")) {
    let code = state.replace("WAITING_GC_AMT_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "redeem" }, { amount: amt });
    return ctx.reply(`✅ Amount: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_edit_${code}`) });
  }
  if (state.startsWith("WAITING_GC_MAX_")) {
    let code = state.replace("WAITING_GC_MAX_", "");
    delete userState[userId];
    let maxUses = parseInt(text);
    if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "redeem" }, { maxUses });
    return ctx.reply(`✅ Max: ${maxUses}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `gc_edit_${code}`) });
  }
  if (state.startsWith("WAITING_AMZ_AMT_")) {
    let code = state.replace("WAITING_AMZ_AMT_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "amazon" }, { amount: amt });
    return ctx.reply(`✅ Amount: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_edit_${code}`) });
  }
  if (state.startsWith("WAITING_AMZ_MAX_")) {
    let code = state.replace("WAITING_AMZ_MAX_", "");
    delete userState[userId];
    let maxUses = parseInt(text);
    if (isNaN(maxUses) || maxUses < 1) return ctx.reply("❌ Invalid!");
    await GiftCode.updateOne({ code, type: "amazon" }, { maxUses });
    return ctx.reply(`✅ Max: ${maxUses}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `amz_edit_${code}`) });
  }

  // ============================================================
  // ✅ ADMIN PANEL BUTTON RENAME
  // ============================================================
  if (state.startsWith("ADM_BTN_RENAME_")) {
    let idx = parseInt(state.replace("ADM_BTN_RENAME_", ""), 10);
    delete userState[userId];
    let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    if (idx < 0 || idx >= layout.length) return;
    layout[idx].name = text;
    await setConfig("admin_panel_layout", layout);
    return ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_panel_custom") });
  }

  // ============================================================
  // ✅ KEYBOARD BUTTON RENAME
  // ============================================================
  if (state.startsWith("KB_BTN_RENAME_")) {
    let idx = parseInt(state.replace("KB_BTN_RENAME_", ""), 10);
    delete userState[userId];
    let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    if (idx < 0 || idx >= layout.length) return;
    layout[idx].name = text;
    await setConfig("keyboard_layout", layout);
    return ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_keyboard_custom") });
  }

  // ============================================================
  // ✅ KB UPDATE MESSAGE
  // ============================================================
  if (state === "KB_MSG_EDIT") {
    delete userState[userId];
    await setConfig("kb_update_msg", text);
    return ctx.reply(`✅ Message Updated!\n\n📌 New:\n${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "kbpanel_msg_toggle") });
  }

  // ============================================================
  // ✅ LIVE FUND AMOUNT
  // ============================================================
  if (state === "LIVEFUND_WAIT_AMOUNT") {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid amount!");
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { totalFund: amt, usedFund: 0, updatedAt: new Date() }, { upsert: true });
    return ctx.reply(`✅ Fund Set: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "status_live_fund") });
  }

  // Default
  return next();
});

// ============================================================
// 📸 PHOTO HANDLERS (Broadcast + UPI Deposit)
// ============================================================
bot.on("message:photo", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];

  // Broadcast Photo
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = {
      type: "photo", fileId: photo.file_id, caption,
      fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id
    };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard()
      .text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n📸 Photo\n📝 Caption: ${caption || "(none)"}\n\n👥 Recipients: ${totalUsers}\n\nChoose Mode:`,
      { parse_mode: "Markdown", reply_markup: kb });
    return;
  }

  // Broadcast to Channels
  if (state === "BROADCAST_TO_CHANNELS" && (await isAdmin(userId))) {
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let caption = ctx.message.caption || "";
    let channels = await Channel.find({ isActive: true }).lean();
    let sent = 0, failed = 0;
    for (let ch of channels) {
      try { await ctx.api.sendPhoto(ch.channelId, photo.file_id, { caption }); sent++; }
      catch (e) { failed++; }
    }
    delete userState[userId];
    return ctx.reply(`✅ *Broadcast Complete!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`, { parse_mode: "Markdown" });
  }

  return next();
});

bot.on("message:video", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let video = ctx.message.video;
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = {
      type: "video", fileId: video.file_id, caption,
      fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id
    };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n🎬 Video\n📝 Caption: ${caption || "(none)"}\n\n👥 Recipients: ${totalUsers}`,
      { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

bot.on("message:audio", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let audio = ctx.message.audio;
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "audio", fileId: audio.file_id, caption, fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n🎵 Audio\n\n👥 Recipients: ${totalUsers}`, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

bot.on("message:document", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let doc = ctx.message.document;
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "document", fileId: doc.file_id, caption, fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n📄 Document\n\n👥 Recipients: ${totalUsers}`, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

bot.on("message:sticker", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let sticker = ctx.message.sticker;
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "sticker", fileId: sticker.file_id, fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n🎨 Sticker\n\n👥 Recipients: ${totalUsers}`, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

bot.on("message:voice", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let voice = ctx.message.voice;
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "voice", fileId: voice.file_id, fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n🎤 Voice\n\n👥 Recipients: ${totalUsers}`, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

bot.on("message:animation", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state === "BROADCAST_WAIT_MSG" && (await isAdmin(userId))) {
    let anim = ctx.message.animation;
    let caption = ctx.message.caption || "";
    global.broadcastCache = global.broadcastCache || {};
    global.broadcastCache[userId] = { type: "animation", fileId: anim.file_id, caption, fromChatId: ctx.chat.id, fromMessageId: ctx.message.message_id };
    delete userState[userId];
    let totalUsers = await User.countDocuments({});
    let kb = new InlineKeyboard().text("🚀 Direct", "broadcast_mode_direct").text("🔄 Forward", "broadcast_mode_forward").row()
      .text("✅ Confirm & Send", "broadcast_confirm").text("❌ Cancel", "broadcast_cancel");
    await ctx.reply(`📢 *Broadcast Preview*\n\n🎬 GIF/Animation\n\n👥 Recipients: ${totalUsers}`, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }
  return next();
});

// ============================================================
// 🚀 BOT STARTUP
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
    console.error("❌ Bot failed after max retries.");
    process.exit(1);
  }
}

// ============================================================
// 🍃 MONGODB CONNECT + INIT + INDEXES
// ============================================================
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");

    // CREATE INDEXES (Speed)
    try {
      await User.collection.createIndex({ userId: 1 }, { unique: true });
      await User.collection.createIndex({ balance: -1 });
      await User.collection.createIndex({ createdAt: -1 });
      await Withdrawal.collection.createIndex({ userId: 1, status: 1 });
      await Withdrawal.collection.createIndex({ status: 1, createdAt: -1 });
      await BalanceHistory.collection.createIndex({ userId: 1, createdAt: -1 });
      await BotAdmin.collection.createIndex({ userId: 1, isActive: 1 });
      await Gateway.collection.createIndex({ isActive: 1 });
      await Task.collection.createIndex({ taskId: 1 });
      await GiftCode.collection.createIndex({ code: 1, type: 1 });
      await UPIPayment.collection.createIndex({ userId: 1, status: 1 });
      await Config.collection.createIndex({ key: 1 }, { unique: true });
      await AddFund.collection.createIndex({ status: 1, createdAt: -1 });
      await Channel.collection.createIndex({ channelId: 1 }, { unique: true });
      console.log("⚡ MongoDB indexes created!");
    } catch (e) { console.log("⚠️ Index creation:", e.message); }

    // PRELOAD CONFIGS
    await preloadAllConfigs();

    // INIT DEFAULTS
    await getConfig("min_withdraw", 10);
    await getConfig("max_withdraw", 10000);
    await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    await getConfig("start_title_text", DEFAULT_START_TEXT.title);
    await getConfig("start_link_text", DEFAULT_START_TEXT.linkText);
    await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    await getConfig("welcome_channel_link", "https://t.me/yourchannel");
    await getConfig("bot_active", true);
    await getConfig("quick_pay_tax_enabled", false);
    await getConfig("quick_pay_tax_percent", 0);
    await getConfig("new_user_notif", true);
    await getConfig("kb_update_msg_send", true);
    await getConfig("kb_update_msg", "🎨 Keyboard Updated!\nYour keyboard has been updated successfully.");
    await getConfig("redeem_mode", "manual");
    await getConfig("support_username", "Not Set");
    await getConfig("addfund_channel", "Not Set");
    await getConfig("payout_channel", "Not Set");
    await getConfig("payout_channel_upi", "Not Set");
    await getConfig("payout_channel_wallet", "Not Set");
    await getConfig("payout_channel_bank", "Not Set");
    await getConfig("payout_channel_amazon", "Not Set");
    await getConfig("payout_channel_redeem", "Not Set");
    await getConfig("banned_in_channel_allowed", true);
    await getConfig("non_admin_channels_bypass", true);
    await getConfig("show_mode", "all");
    await getConfig("force_join_enabled", true);
    await getConfig("auto_upi_id", "payzy@upi");
    await getConfig("auto_upi_min", 5);
    await getConfig("auto_upi_max", 200);
    await getConfig("auto_upi_enabled", true);

    // LIVE FUND
    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) await LiveFund.create({ key: "main_fund" });

    // WITHDRAW SETTINGS
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

    console.log("⏳ Waiting 8s for cleanup...");
    await new Promise(r => setTimeout(r, 8000));

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🌐 Server: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await startBotSafe();
  })
  .catch((err) => { console.error("❌ DB Error:", err); process.exit(1); });

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} in use. Retrying...`);
    setTimeout(() => { server.close(); server.listen(PORT, "0.0.0.0"); }, 2000);
  }
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });

// Auto-ping
setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

// Cleanup cache
setInterval(() => {
  if (global.quickPayCache) { for (let uid in global.quickPayCache) delete global.quickPayCache[uid]; }
  if (global.broadcastCache) { for (let uid in global.broadcastCache) delete global.broadcastCache[uid]; }
}, 30 * 60 * 1000);

// ============================================================
// ✅ END OF FILE
// ============================================================
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("✅ bot.js loaded — Complete Bot v3 (10 Parts)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
