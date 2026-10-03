// ============================================================
// 🤖 TELEGRAM PAYMENT TASK BOT + MINI APP
// Complete index.js — Final Version
// ============================================================
require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

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
// 🌐 EXPRESS SETUP
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "15mb" }));

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
// 📝 HELPER FUNCTIONS
// ============================================================

// ⚡ toSmallCaps — Convert text to small caps
function toSmallCaps(text) {
  const map = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
    'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
    's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
  };
  return String(text).split('').map(c => {
    let lower = c.toLowerCase();
    if (map[lower]) return map[lower];
    return c;
  }).join('');
}

// ⚡ entitiesToHtml — Convert Telegram entities to HTML
function entitiesToHtml(text, entities) {
  if (!entities || entities.length === 0) return String(text || "");
  let sorted = [...entities].sort((a, b) => b.offset - a.offset);
  let result = String(text);
  for (let ent of sorted) {
    let before = result.substring(0, ent.offset);
    let target = result.substring(ent.offset, ent.offset + ent.length);
    let after = result.substring(ent.offset + ent.length);
    let wrapped = target;
    switch (ent.type) {
      case "bold": wrapped = `<b>${target}</b>`; break;
      case "italic": wrapped = `<i>${target}</i>`; break;
      case "underline": wrapped = `<u>${target}</u>`; break;
      case "strikethrough": wrapped = `<s>${target}</s>`; break;
      case "spoiler": wrapped = `<tg-spoiler>${target}</tg-spoiler>`; break;
      case "code": wrapped = `<code>${target}</code>`; break;
      case "pre": wrapped = `<pre>${target}</pre>`; break;
      case "text_link": wrapped = `<a href="${ent.url}">${target}</a>`; break;
      case "blockquote": wrapped = `<blockquote>${target}</blockquote>`; break;
      case "text_mention":
        if (ent.user) wrapped = `<a href="tg://user?id=${ent.user.id}">${target}</a>`;
        break;
      default: wrapped = target;
    }
    result = before + wrapped + after;
  }
  return result;
}

// ⚡ formatDateTime — IST timezone
function formatDateTime(date) {
  const d = new Date(date);
  const parts = d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata'
  });
  return parts
    .replace(/\bSep\b/g, 'Sept')
    .replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
}

// ⚡ halfMaskUPI
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

// ⚡ halfMaskBank
function halfMaskBank(accNo) {
  if (!accNo || accNo === "Not Set") return accNo;
  let str = String(accNo).trim();
  if (str.length <= 6) return str.substring(0, 2) + '***';
  return str.substring(0, 4) + '***' + str.substring(str.length - 4);
}

// ⚡ halfMaskWallet
function halfMaskWallet(wallet) {
  if (!wallet || wallet === "Not Set") return wallet;
  let str = String(wallet).trim();
  if (str.length <= 6) return str.substring(0, 2) + '***';
  return str.substring(0, 3) + '***' + str.substring(str.length - 3);
}

// ⚡ halfMaskDetails
function halfMaskDetails(method, details) {
  if (method === "UPI") return halfMaskUPI(details);
  if (method === "BANK" || method === "Bank") {
    let parts = String(details).split(',').map(s => s.trim());
    let maskedAcc = halfMaskBank(parts[0]);
    return maskedAcc + (parts[1] ? ` (${parts[1]})` : '');
  }
  if (method === "WALLET" || method === "Wallet") return halfMaskWallet(details);
  if (method === "AMAZON" || method === "Amazon") return halfMaskUPI(details);
  return halfMaskUPI(details);
}

// ⚡ generateTxnNumber
function generateTxnNumber() {
  let num = '';
  for (let i = 0; i < 20; i++) num += Math.floor(Math.random() * 10);
  return num;
}

// ⚡ convertOwnerLink
function convertOwnerLink(input) {
  let str = String(input || "").trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('tg://')) return str;
  if (str.startsWith('@')) return `https://t.me/${str.substring(1)}`;
  if (/^\d+$/.test(str)) return `tg://user?id=${str}`;
  return `https://t.me/${str}`;
}

// ⚡ isValidTelegramID
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

// ⚡ generateTaskId
function generateTaskId() {
  return "T" + Date.now().toString().slice(-10);
}

// ⚡ generateWithdrawalId
function generateWithdrawalId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ⚡ generateSubmissionId
function generateSubmissionId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ⚡ generateRequestId
function generateRequestId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ⚡ generateOrderId
function generateOrderId() {
  return `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// ============================================================
// ✅ END OF MESSAGE 1
// ============================================================

console.log("✅ index.js — Message 1 of 18 loaded");
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
  walletNumber: { type: String, default: "" },
  walletAccount: { type: String, default: "Not Set" },
  upiId: { type: String, default: "Not Set" },
  bankAccNo: { type: String, default: "Not Set" },
  bankIfsc: { type: String, default: "Not Set" },
  bankName: { type: String, default: "Not Set" },
  amazonEmail: { type: String, default: "Not Set" },
  redeemCodeAddr: { type: String, default: "Not Set" },
  gatewayNumbers: { type: Map, of: String, default: {} },
  joinedChannels: { type: [String], default: [] },
  withdrawnTotal: { type: Number, default: 0 },
  blockedRefs: { type: Number, default: 0 },
  referralsWithLinkWallet: { type: Number, default: 0 },
  referredBy: { type: String, default: "Auto Started" },
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
  title: { type: String, default: "" },
  reward: { type: Number, default: 0 },
  link: { type: String, default: "" },
  description: { type: String, default: "" },
  taskType: { type: String, default: "photo" },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] },
  isActive: { type: Boolean, default: true },
  isComplete: { type: Boolean, default: false },
  expiryMinutes: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
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
  isGateway: { type: Boolean, default: false },
  gateway: { type: String, default: "" },
  gatewayName: { type: String, default: "" },
  gatewayResponse: { type: String, default: "" },
  txnNumber: { type: String, default: "" },
  userMessageId: { type: Number, default: null },
  userChatId: { type: Number, default: null },
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

// ---------- ADD FUND ----------
const addFundSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  amount: { type: Number, required: true },
  method: { type: String, default: "UPI" },
  methodKey: { type: String, default: "" },
  utr: { type: String, default: "" },
  photoFileId: { type: String, default: "" },
  proofFileId: { type: String, default: "" },
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

// ---------- REDEEM REQUEST ----------
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

// ---------- CHANNEL ----------
const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  inviteLink: { type: String, required: true },
  displayName: { type: String, default: "" },
  subscriberCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isHidden: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
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
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
  taxPercent: { type: Number, default: 0 },
  createdBy: { type: Number, default: null },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);

// ---------- WITHDRAW SETTINGS ----------
const withdrawSettingsSchema = new mongoose.Schema({
  method: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
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
// 🔧 CONFIG HELPERS
// ============================================================
async function preloadAllConfigs() {
  try {
    let allConfigs = await Config.find({}).lean();
    let newData = {};
    for (let conf of allConfigs) {
      newData[conf.key] = conf.value;
    }
    cache.config = newData;
    console.log(`⚡ Configs preloaded: ${allConfigs.length} keys`);
  } catch (e) {
    console.error("Config preload error:", e.message);
  }
}

async function getConfig(key, defaultValue) {
  if (cache.config[key] !== undefined) return cache.config[key];
  let conf = await Config.findOne({ key }).lean();
  let value = conf ? conf.value : defaultValue;
  cache.config[key] = value;
  return value;
}

async function setConfig(key, value) {
  cache.config[key] = value;
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}

// ============================================================
// ✅ END OF MESSAGE 2
// ============================================================

console.log("✅ index.js — Message 2 of 18 loaded");
// ============================================================
// 🔧 ADMIN HELPERS
// ============================================================
async function isAdmin(userId) {
  try {
    if (Number(userId) === Number(MAIN_OWNER_ID)) return true;
    let ownerId = cache.config["owner_id"] ?? await getConfig("owner_id", MAIN_OWNER_ID);
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
  let ownerId = cache.config["owner_id"] ?? await getConfig("owner_id", MAIN_OWNER_ID);
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

// ⚡ checkForceJoin — Owner/Admin bypass
async function checkForceJoin(ctx) {
  let forceJoinEnabled = await getConfig("force_join_enabled", true);
  if (!forceJoinEnabled) return true;

  let userId = ctx.from.id;
  let isOwnerUser = await isOwner(userId);
  let isAdminUser = await isAdmin(userId);
  if (isOwnerUser || isAdminUser) return true;

  let channels = await Channel.find({ isActive: true, isHidden: { $ne: true } }).lean();
  if (!channels || channels.length === 0) return true;

  let bannedAllowed = await getConfig("banned_in_channel_allowed", true);
  let joinedChannels = [];

  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch.channelId, userId);

      if (member.status === "kicked") {
        if (bannedAllowed) continue;
        return false;
      }

      if (member.status === "restricted" && member.is_member) {
        joinedChannels.push(ch.channelId);
        continue;
      }

      if (member.status === "left") return false;

      if (["member", "administrator", "creator"].includes(member.status)) {
        joinedChannels.push(ch.channelId);
      }
    } catch (e) { }
  }

  if (joinedChannels.length > 0) {
    await User.updateOne({ userId }, { joinedChannels });
  }

  return true;
}

// ⚡ getPayoutChannel — Single channel with fallback
async function getPayoutChannel(method = null) {
  let newCh = await getConfig("payout_channel", null);
  if (newCh && newCh !== "Not Set") return newCh;

  if (method) {
    let oldCh = await getConfig("payout_channel_" + method.toLowerCase(), null);
    if (oldCh && oldCh !== "Not Set") return oldCh;
  }

  for (let m of ["upi", "bank", "wallet", "amazon", "redeem"]) {
    let oldCh = await getConfig("payout_channel_" + m, null);
    if (oldCh && oldCh !== "Not Set") return oldCh;
  }

  return "Not Set";
}

// ⚡ getAddFundChannel
async function getAddFundChannel() {
  let ch = await getConfig("addfund_channel", "Not Set");
  if (ch && ch !== "Not Set") return ch;
  return await getPayoutChannel("upi");
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
// 🔧 WITHDRAW HELPERS
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

// ============================================================
// 🔧 ADD FUND METHOD HELPERS
// ============================================================
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
// 🔧 KEYBOARD HELPERS
// ============================================================
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: `📋 ${toSmallCaps("Bot Task")}`, key: "btn_tasks", row: 0, hidden: false },
  { name: `💸 ${toSmallCaps("My Balance")}`, key: "btn_balance", row: 0, hidden: false },
  { name: `🎁 ${toSmallCaps("Gift Code")}`, key: "btn_gift", row: 1, hidden: false },
  { name: `⚡ ${toSmallCaps("Quick Pay")}`, key: "btn_quickpay", row: 1, hidden: false },
  { name: `💳 ${toSmallCaps("Payout Method")}`, key: "btn_payout", row: 2, hidden: false },
  { name: `🚀 ${toSmallCaps("Withdraw")}`, key: "btn_withdraw", row: 2, hidden: false }
];

const DEFAULT_ADMIN_PANEL_LAYOUT = [
  { name: `👮 ${toSmallCaps("Add/Remove Admins Permission")}`, key: "adm_permissions", row: 0, hidden: false },
  { name: `👑 ${toSmallCaps("Transfer Ownership")}`, key: "adm_transfer", row: 1, hidden: false },
  { name: `💰 ${toSmallCaps("Set Withdraw Tax")}`, key: "adm_set_wd_tax", row: 1, hidden: false },
  { name: `💠 ${toSmallCaps("Verification Mode")}`, key: "adm_verification_mode", row: 2, hidden: false },
  { name: `👮 ${toSmallCaps("Manage Admins")}`, key: "adm_admins", row: 2, hidden: false },
  { name: `🚫 ${toSmallCaps("Manage Ban Users")}`, key: "adm_manage_ban", row: 3, hidden: false },
  { name: `🤖 ${toSmallCaps("Bot Status")}`, key: "adm_bot_status", row: 3, hidden: false },
  { name: `✅ ${toSmallCaps("Verify User")}`, key: "adm_verify_user", row: 4, hidden: false },
  { name: `🚫 ${toSmallCaps("Manage Ban Wallet")}`, key: "adm_manage_ban_wallet", row: 4, hidden: false },
  { name: `💸 ${toSmallCaps("Withdraw Status")}`, key: "adm_wd_status", row: 5, hidden: false },
  { name: `➕ ${toSmallCaps("Add Balance")}`, key: "adm_add_bal", row: 5, hidden: false },
  { name: `➖ ${toSmallCaps("Remove Balance")}`, key: "adm_rem_bal", row: 6, hidden: false },
  { name: `⚡ ${toSmallCaps("Manage Your Channels")}`, key: "adm_manage_channels", row: 6, hidden: false },
  { name: `⚠️ ${toSmallCaps("Reset Balance")}`, key: "adm_reset_all_bal", row: 7, hidden: false },
  { name: `🎨 ${toSmallCaps("Customize Your Theme")}`, key: "adm_customize_theme", row: 7, hidden: false },
  { name: `💬 ${toSmallCaps("Talk With User")}`, key: "adm_talk_user", row: 8, hidden: false },
  { name: `📢 ${toSmallCaps("Broadcast")}`, key: "adm_broadcast", row: 8, hidden: false },
  { name: `🔍 ${toSmallCaps("Find User Details")}`, key: "adm_find_user", row: 9, hidden: false },
  { name: `📊 ${toSmallCaps("Status")}`, key: "adm_status", row: 9, hidden: false },
  { name: `⚡ ${toSmallCaps("Quick Pay")}`, key: "adm_quick_pay", row: 10, hidden: false },
  { name: `🏦 ${toSmallCaps("Gateway Setup")}`, key: "adm_gateway_menu", row: 10, hidden: false },
  { name: `🎁 ${toSmallCaps("Gift Codes")}`, key: "adm_create_gift", row: 11, hidden: false },
  { name: `🔔 ${toSmallCaps("New User Notification")}`, key: "adm_user_notif", row: 11, hidden: false },
  { name: `🎁 ${toSmallCaps("Manage Redeem Codes")}`, key: "adm_redeem", row: 12, hidden: false },
  { name: `📧 ${toSmallCaps("Manage Amazon Codes")}`, key: "adm_amazon", row: 12, hidden: false },
  { name: `📋 ${toSmallCaps("Manage Tasks")}`, key: "adm_tasks_manager", row: 13, hidden: false },
  { name: `🚀 ${toSmallCaps("Recent Admin Actions")}`, key: "adm_recent_actions", row: 13, hidden: false },
  { name: `🔄 ${toSmallCaps("Refresh Panel")}`, key: "admin", row: 14, hidden: false }
];

const DEFAULT_BALANCE_TEXT = {
  welcome: `⭐ ${toSmallCaps("Welcome To Bot!")}`,
  footer: `❝ ${toSmallCaps("Built with security you can Trust.")}\n${toSmallCaps("Support that responds promptly")} ❞`
};

const DEFAULT_START_TEXT = {
  title: `💫 ${toSmallCaps("Welcome To Task Payment Bot!")}`,
  linkPrefix: `${toSmallCaps("How To Earn")} → `,
  linkClickable: `${toSmallCaps("Click Here")}`
};

async function buildKeyboardFromLayout(userId) {
  let userPref = null;
  if (userId) userPref = await UserPreference.findOne({ userId }).lean();
  let layout;

  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    layout = userPref.keyboardLayout;
  } else {
    layout = cache.config["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
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
    keyboardRows = [[{ text: `💸 ${toSmallCaps("My Balance")}` }]];
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
  return cache.config["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
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
// ✅ END OF MESSAGE 3
// ============================================================

console.log("✅ index.js — Message 3 of 18 loaded");
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

    let dateLabel = isSuccess ? "APPROVED ON" : (isFailed ? "REJECTED ON" : "SUBMITTED ON");
    let displayDate = (isSuccess || isFailed) && wd.approvedAt ? new Date(wd.approvedAt) : new Date(wd.createdAt);

    let displayTxn = wd.txnNumber && wd.txnNumber !== "" ? wd.txnNumber : wd.withdrawalId;
    let gatewayDisplay = wd.gatewayName && wd.gatewayName !== "" ? wd.gatewayName : (wd.isGateway ? "GATEWAY" : "MANUAL");
    let approvedBy = wd.approvedBy && wd.approvedBy !== "" ? wd.approvedBy : "-";

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
      <div class="info-row"><span class="info-title">${dateLabel}</span><span class="info-value">${displayDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</span></div>
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
app.get("/miniapp/gift", (req, res) => res.sendFile(path.join(__dirname, "public", "gift.html")));
app.get("/miniapp/verify", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));

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
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { } }
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

    let newBalance = user.balance;
    let botUsername = bot.botInfo ? bot.botInfo.username : "Bot";

    let maskedWallet = halfMaskWallet(wallet);

    let msg = `✅ <b>New Withdrawal Processed</b> ✅\n\n` +
              `🟢 <b>User :</b> <code>${userId}</code>\n`;
    if (showRemainingBalance) msg += `🤘 <b>Remaining Balance :-</b> ₹${newBalance.toFixed(2)}\n`;
    msg += `\n🚀 <b>Amount :</b> <code>₹${amount} INR (-)</code>\n` +
           `⛔ <b>Address :</b> <code>${maskedWallet}</code>\n\n` +
           `💡 <b>Bot:</b> @${botUsername}\n\n` +
           `⚠️ <b>${gatewayInfo.name} Response:</b>\n<code>${resData}</code>`;

    for (let ch of channelList) {
      if (!ch) continue;
      try { await bot.api.sendMessage(ch, msg, { parse_mode: "HTML" }); }
      catch (channelErr) { console.error(`Failed to send to channel ${ch}:`, channelErr.message); }
    }

    return { status: 'success', txnNumber: txnNumber || generateTxnNumber(), rawResponse: resData };
  } catch (e) {
    console.error("Transaction Error:", e.message);
    return { status: 'error', message: e.message };
  }
}

// ============================================================
// ✅ END OF MESSAGE 4
// ============================================================

console.log("✅ index.js — Message 4 of 18 loaded");
// ============================================================
// 📱 MINI APP — USER APIs
// ============================================================

// ---------- Get User Info ----------
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
        lastName: user.lastName,
        username: user.username,
        balance: user.balance,
        withdrawnTotal: user.withdrawnTotal,
        blockedRefs: user.blockedRefs,
        referredBy: user.referredBy,
        joined: user.createdAt,
        linkedInfo,
        walletNumber: user.walletNumber || "",
        walletAccount: user.walletAccount,
        upiId: user.upiId,
        bankAccNo: user.bankAccNo,
        bankIfsc: user.bankIfsc,
        amazonEmail: user.amazonEmail,
        redeemCodeAddr: user.redeemCodeAddr,
        gatewayNumbers: gwNumbers,
        isBanned: user.isBanned
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Profile Photo ----------
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

// ---------- Check Admin ----------
app.get("/miniapp/api/is-admin/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let isAdminUser = await isAdmin(userId);
    let isOwnerUser = await isOwner(userId);
    res.json({ success: true, isAdmin: isAdminUser, isOwner: isOwnerUser });
  } catch (e) { res.json({ success: false, isAdmin: false }); }
});

// ---------- App Config ----------
app.get("/miniapp/api/config", async (req, res) => {
  try {
    const config = {
      appLogo: await getConfig("app_logo", "Task Earn Bot"),
      btn_home: await getConfig("btn_home", "HOME"),
      btn_task: await getConfig("btn_task", "TASK"),
      btn_pay: await getConfig("btn_pay", "PAY"),
      btn_profile: await getConfig("btn_profile", "PROFILE"),
      botUsername: await getConfig("bot_username", ""),
      minWithdraw: await getConfig("min_withdraw", 0),
      maxWithdraw: await getConfig("max_withdraw", 0),
      supportUsername: await getConfig("support_username", "Not Set"),
      ownerId: await getConfig("owner_id", MAIN_OWNER_ID),
      ownerDisplayName: await getConfig("owner_display_name", null),
      ownerDisplayLink: await getConfig("owner_display_link", null),
      welcomeChannelLink: await getConfig("welcome_channel_link", "")
    };
    res.json({ success: true, config });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Payment Methods ----------
app.get("/miniapp/api/payment-methods/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId }).lean();
    if (!user) return res.json({ success: false, error: "User not found" });

    const methods = [
      { name: "Wallet", icon: "💰", value: user.walletNumber || "Not Set" },
      { name: "UPI", icon: "⚡", value: user.upiId || "Not Set" },
      { name: "Bank", icon: "🏦", value: (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo} (${user.bankIfsc})` : "Not Set" },
      { name: "Amazon", icon: "📧", value: user.amazonEmail || "Not Set" },
      { name: "Redeem", icon: "🎁", value: user.redeemCodeAddr || "Not Set" }
    ];
    res.json({ success: true, methods });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Update Payment ----------
app.post("/miniapp/api/update-payment", async (req, res) => {
  try {
    const { userId, field, value } = req.body;
    const uid = parseInt(userId, 10);
    const allowed = ["walletNumber", "walletAccount", "upiId", "bankAccNo", "bankIfsc", "amazonEmail", "redeemCodeAddr"];
    if (!allowed.includes(field)) return res.json({ success: false, error: "Invalid field" });

    const update = {};
    update[field] = value;
    await User.findOneAndUpdate({ userId: uid }, update);
    res.json({ success: true, message: "Updated!" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Tasks List ----------
app.get("/miniapp/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).lean();
    res.json({ success: true, tasks });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Total Balance (Admin) ----------
app.get("/miniapp/api/total-balance", async (req, res) => {
  try {
    const users = await User.find({}).lean();
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    res.json({ success: true, totalBalance, totalUsers: users.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------- Check User (Quick Pay) ----------
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

// ---------- Find User by ID or Username (Quick Pay Username Support) ----------
app.get("/miniapp/api/find-user/:query", async (req, res) => {
  try {
    const query = String(req.params.query || "").trim();
    if (!query) return res.json({ success: false, error: "Empty query" });

    let user = null;

    if (/^\d+$/.test(query)) {
      user = await User.findOne({ userId: parseInt(query, 10) }).lean();
    } else {
      let cleanUsername = query.replace(/^@/, '').toLowerCase();
      user = await User.findOne({
        username: { $regex: new RegExp("^" + cleanUsername + "$", "i") }
      }).lean();
    }

    if (!user) return res.json({ success: false, error: "User not found!" });

    let photoUrl = null;
    try {
      let photos = await bot.api.getUserProfilePhotos(user.userId, { limit: 1 });
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

// ---------- User History ----------
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
        withdrawalId: w.withdrawalId,
        createdAt: w.createdAt
      });
    });

    deposits.forEach(d => {
      allHistory.push({
        action: `Deposit (${d.source || "UPI"})`,
        amount: d.amount,
        status: "success",
        detail: d.utr ? `UTR: ${d.utr}` : "",
        txnId: d.orderId,
        createdAt: d.createdAt
      });
    });

    transfers.forEach(t => {
      let isSent = t.amount < 0;
      allHistory.push({
        action: isSent ? "Payment Sent" : "Payment Received",
        amount: t.amount,
        status: "success",
        detail: t.action,
        txnId: "",
        createdAt: t.createdAt
      });
    });

    balanceHistory.forEach(b => {
      if (b.action.match(/Withdrawn|Quick Pay|Deposit|UPI Deposit/i)) return;
      allHistory.push({
        action: b.action,
        amount: b.amount,
        status: "success",
        detail: "",
        txnId: "",
        createdAt: b.createdAt
      });
    });

    allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let paginated = allHistory.slice(0, limit);

    res.json({ success: true, history: paginated, total: allHistory.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 5
// ============================================================

console.log("✅ index.js — Message 5 of 18 loaded");
// ============================================================
// ⚡ QUICK PAY API (with Tax + Username support)
// ============================================================
app.post("/miniapp/api/quick-pay", async (req, res) => {
  try {
    const { senderId, receiverId, receiverUsername, amount } = req.body;
    const sId = parseInt(senderId, 10);
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });

    let receiver = null;
    if (receiverId) {
      receiver = await User.findOne({ userId: parseInt(receiverId, 10) });
    } else if (receiverUsername) {
      let cleanUsername = String(receiverUsername).replace(/^@/, '').toLowerCase();
      receiver = await User.findOne({
        username: { $regex: new RegExp("^" + cleanUsername + "$", "i") }
      });
    }

    if (!receiver) return res.json({ success: false, error: "Receiver not found" });
    if (receiver.userId === sId) return res.json({ success: false, error: "Cannot send to yourself!" });
    if (receiver.isBanned) return res.json({ success: false, error: "Receiver is banned" });

    const sender = await User.findOne({ userId: sId });
    if (!sender) return res.json({ success: false, error: "Sender not found" });

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
      await logBalanceHistory(sId, `Admin Add Fund - Quick Pay to ${receiver.userId}`, -amt);
    } else if (isAdminUser) {
      await logBalanceHistory(sId, `Admin Quick Pay to ${receiver.userId}`, -amt);
    } else {
      await logBalanceHistory(sId, `Quick Pay to ${receiver.userId}`, -amt);
    }
    await logBalanceHistory(receiver.userId, `Quick Pay from ${isAdminUser ? "Admin" : sId}`, receiverAmount);

    try {
      await bot.api.sendMessage(receiver.userId,
        `🎉 <b>Payment Received!</b>\n\n👤 From: ${isAdminUser ? "Admin" : (sender.firstName || "User")}\n🆔 <code>${sId}</code>\n💰 ₹${receiverAmount.toFixed(2)}\n\n💵 New Balance: ₹${receiver.balance.toFixed(2)}`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({
      success: true,
      newBalance: sender.balance,
      wasNegative,
      isAdmin: isAdminUser,
      tax: taxAmount,
      receiverAmount
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 🚀 WITHDRAW — GET ACTIVE METHODS (from bot settings)
// ============================================================
app.get("/miniapp/api/withdraw-methods", async (req, res) => {
  try {
    let methods = [];

    // 1. Active Gateway (Auto payout)
    const activeGateway = await Gateway.findOne({ isActive: true }).lean();
    if (activeGateway) {
      methods.push({
        key: "gateway",
        name: activeGateway.name,
        icon: "wallet",
        type: "auto",
        description: "Auto • Instant",
        minAmount: activeGateway.minAmount || 0,
        maxAmount: activeGateway.maxAmount || 0,
        taxPercent: activeGateway.taxPercent || 0
      });
    }

    // 2. Manual methods (from withdraw_toggles)
    const toggles = await getConfig("withdraw_toggles", {
      upi: true, bank: true, amazon: true, redeem: true
    });

    // UPI
    if (toggles.upi === true) {
      const settings = await WithdrawSettings.findOne({ method: "upi" }).lean();
      methods.push({
        key: "upi",
        name: "UPI",
        icon: "upi",
        type: "manual",
        description: "Admin Approval",
        minAmount: settings?.minAmount || 0,
        maxAmount: settings?.maxAmount || 0,
        taxPercent: settings?.taxPercent || 0
      });
    }

    // Bank
    if (toggles.bank === true) {
      const settings = await WithdrawSettings.findOne({ method: "bank" }).lean();
      methods.push({
        key: "bank",
        name: "Bank",
        icon: "bank",
        type: "manual",
        description: "Admin Approval",
        minAmount: settings?.minAmount || 0,
        maxAmount: settings?.maxAmount || 0,
        taxPercent: settings?.taxPercent || 0
      });
    }

    // Amazon
    if (toggles.amazon === true) {
      const settings = await WithdrawSettings.findOne({ method: "amazon" }).lean();
      methods.push({
        key: "amazon",
        name: "Amazon",
        icon: "amazon",
        type: "manual",
        description: "Admin Approval",
        minAmount: settings?.minAmount || 0,
        maxAmount: settings?.maxAmount || 0,
        taxPercent: settings?.taxPercent || 0
      });
    }

    // Redeem
    if (toggles.redeem === true) {
      const settings = await WithdrawSettings.findOne({ method: "redeem" }).lean();
      methods.push({
        key: "redeem",
        name: "Redeem",
        icon: "redeem",
        type: "manual",
        description: "Admin Approval",
        minAmount: settings?.minAmount || 0,
        maxAmount: settings?.maxAmount || 0,
        taxPercent: settings?.taxPercent || 0
      });
    }

    res.json({ success: true, methods });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🚀 WITHDRAW (Manual — Admin approval)
// ============================================================
app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);

    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    // Global withdraw toggle
    let withdrawEnabled = await getConfig("withdraw_enabled", true);
    if (!withdrawEnabled) return res.json({ success: false, error: "Withdrawals disabled" });

    const methodKey = String(method).toLowerCase();
    let methodSetting = await WithdrawSettings.findOne({ method: methodKey }).lean();

    // Check if enabled via withdraw_toggles
    let toggles = await getConfig("withdraw_toggles", {
      wallet: true, upi: true, bank: true, amazon: true, redeem: true
    });
    if (toggles[methodKey] === false) {
      return res.json({ success: false, error: `${method} is currently OFF` });
    }

    if (methodSetting && !methodSetting.isActive) {
      return res.json({ success: false, error: `${method} is currently OFF` });
    }

    // Get details by method
    let details = "";
    const methodUpper = methodKey.toUpperCase();

    if (methodUpper === "UPI") details = user.upiId;
    else if (methodUpper === "BANK") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
    else if (methodUpper === "AMAZON") details = user.amazonEmail;
    else if (methodUpper === "REDEEM") details = user.redeemCodeAddr;
    else return res.json({ success: false, error: "Invalid method" });

    if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
      return res.json({ success: false, error: `${methodUpper} not linked!`, needsLink: true, method: methodUpper });
    }

    // Min/max check
    let minW = methodSetting ? methodSetting.minAmount : 0;
    let maxW = methodSetting ? methodSetting.maxAmount : 0;
    if (minW > 0 && amt < minW) return res.json({ success: false, error: `Min ₹${minW}` });
    if (maxW > 0 && amt > maxW) return res.json({ success: false, error: `Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    // Deduct
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${methodUpper} (MiniApp)`, -amt);

    // Count
    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    const withdrawalId = generateWithdrawalId();

    await Withdrawal.create({
      withdrawalId, userId: uid, userWithdrawalCount,
      amount: amt, method: methodUpper, details, isGateway: false
    });

    // Payout channel
    let payoutChannel = await getPayoutChannel(methodKey);

    if (payoutChannel && payoutChannel !== "Not Set") {
      const adminKb = new InlineKeyboard()
        .text("Approve ✅", `wd_app_${withdrawalId}`)
        .text("Reject ❌", `wd_rej_${withdrawalId}`);
      const userLink = `<a href="tg://user?id=${uid}">${uid}</a>`;
      const hashTag = `<code>(#${userWithdrawalCount})</code>`;
      const methodIcon = methodUpper === 'UPI' ? '⚡' : methodUpper === 'BANK' ? '🏦' : methodUpper === 'AMAZON' ? '📧' : '🎁';
      try {
        await bot.api.sendMessage(payoutChannel,
          `⚠️ <b>New ${methodUpper} Payout Request!</b> ${hashTag}\n\n` +
          `👤 <b>User:</b> ${userLink}\n` +
          `💰 <b>Request Amount:</b> <code>₹${amt}</code>\n` +
          `${methodIcon} <b>${methodUpper}:</b> <code>${details}</code>\n\n` +
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
// 🌐 GATEWAY AUTO WITHDRAW (Mini App)
// ============================================================
app.post("/miniapp/api/gateway/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);

    if (!uid || isNaN(amt) || amt <= 0) {
      return res.json({ success: false, error: "Invalid data" });
    }

    const gateway = await Gateway.findOne({ isActive: true });
    if (!gateway) return res.json({ success: false, error: "No active gateway" });

    let user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    // Wallet number
    let wallet = user.walletNumber || "";
    if (!wallet) {
      return res.json({
        success: false,
        error: "Please save your wallet number first",
        needsNumber: true
      });
    }

    // Min/max
    let minW = gateway.minAmount || 0;
    let maxW = gateway.maxAmount || 0;
    if (minW > 0 && amt < minW) return res.json({ success: false, error: `Min ₹${minW}` });
    if (maxW > 0 && amt > maxW) return res.json({ success: false, error: `Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });

    // Deduct balance
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${gateway.name} (MiniApp)`, -amt);

    // Payout channel
    let payoutChannel = await getPayoutChannel("wallet");
    let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];

    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    let withdrawalId = generateWithdrawalId();

    // Process gateway payout
    let result = await processGatewayPayout({
      bot,
      userId: uid,
      amount: amt,
      gatewayInfo: gateway,
      wallet,
      channelList,
      showRemainingBalance: true
    });

    if (result.status === 'success') {
      let txnNumber = result.txnNumber || generateTxnNumber();
      let processTime = new Date();

      await Withdrawal.create({
        withdrawalId, userId: uid, userWithdrawalCount, amount: amt,
        method: gateway.name, details: wallet, status: "Approved",
        isGateway: true, gateway: gateway.name, gatewayName: gateway.name,
        gatewayResponse: result.rawResponse || "",
        txnNumber, approvedBy: "Auto Gateway", approvedAt: processTime
      });

      await LiveFund.findOneAndUpdate(
        { key: "main_fund" },
        { $inc: { usedFund: amt } },
        { upsert: true }
      );

      let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
      let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

      try {
        await bot.api.sendMessage(uid,
          `🎁Your Withdrawal of Rs.<code>${amt.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
          `🏦 Destination ==> <code>${wallet}</code>\n` +
          `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
          `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
          `✅Please Check Your ${gateway.name} Account!`,
          { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) });
      } catch (e) { }

      return res.json({
        success: true,
        autoProcessed: true,
        withdrawalId,
        txnNumber,
        newBalance: user.balance,
        gatewayName: gateway.name
      });
    } else {
      // Refund
      user.balance += amt;
      user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amt);
      await user.save();
      await logBalanceHistory(uid, `Withdrawal Failed (Refunded)`, amt);

      let txnNumber = generateTxnNumber();
      await Withdrawal.create({
        withdrawalId, userId: uid, userWithdrawalCount, amount: amt,
        method: gateway.name, details: wallet, status: "Failed",
        isGateway: true, gateway: gateway.name, gatewayName: gateway.name,
        gatewayResponse: result.message || "Failed",
        approvedBy: "Auto Gateway", approvedAt: new Date()
      });

      return res.json({
        success: false,
        autoProcessed: true,
        error: result.message || "Gateway failed"
      });
    }
  } catch (e) {
    console.error("Gateway withdraw error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// 💰 SAVE WALLET NUMBER (single global)
// ============================================================
app.post("/miniapp/api/gateway/save-number", async (req, res) => {
  try {
    const { userId, number } = req.body;
    const uid = parseInt(userId, 10);
    if (!uid || !number) return res.json({ success: false, error: "Missing fields" });
    let user = await getUser(uid);
    user.walletNumber = String(number).trim();
    await user.save();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 6
// ============================================================

console.log("✅ index.js — Message 6 of 18 loaded");
// ============================================================
// 📸 TASK SUBMISSION APIs (Photo + Refer)
// ============================================================
app.post("/miniapp/api/submit-task", async (req, res) => {
  try {
    const { userId, taskId, photoBase64 } = req.body;
    if (!userId || !taskId || !photoBase64) return res.json({ success: false, error: "Missing fields" });
    const uid = parseInt(userId, 10);

    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed!" });

    // ⚠️ Check expiry
    if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
      return res.json({ success: false, error: "Task expired" });
    }

    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const submissionId = generateSubmissionId();
    const user = await User.findOne({ userId: uid });
    const userName = user ? (user.firstName || "User") : "User";

    // Alert channel
    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel
      : await getConfig("default_task_alert_channel", "Not Set");

    if (!alertChannel || alertChannel === "Not Set") {
      return res.json({ success: false, error: "Alert channel not set." });
    }

    let userLink = `<a href="tg://user?id=${uid}">${userName} (${uid})</a>`;
    const caption = `<b>NEW TASK SUBMISSION</b>\n\n` +
                    `User: ${userLink}\n` +
                    `Task: ${task.title}\n` +
                    `Reward: ₹${task.reward}\n` +
                    `Link: ${task.link}\n` +
                    `Type: Screenshot`;
    const kb = new InlineKeyboard()
      .text("Approve ✅", `task_app_${submissionId}`)
      .text("Reject ❌", `task_rej_${submissionId}`);

    let sentMsg;
    try {
      sentMsg = await bot.api.sendPhoto(alertChannel, new InputFile(buffer, "proof.jpg"), {
        caption, parse_mode: "HTML", reply_markup: kb
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

// ============================================================
// 🔗 TASK REFER SUBMISSION (Refer link OR 10-digit number)
// ============================================================
app.post("/miniapp/api/submit-refer", async (req, res) => {
  try {
    const { userId, taskId, referValue } = req.body;
    if (!userId || !taskId || !referValue) return res.json({ success: false, error: "Missing fields" });
    const uid = parseInt(userId, 10);

    const task = await Task.findOne({ taskId });
    if (!task) return res.json({ success: false, error: "Task not found" });
    if (task.completedUsers.includes(uid)) return res.json({ success: false, error: "Already completed!" });

    // ⚠️ Expiry check
    if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
      return res.json({ success: false, error: "Task expired" });
    }

    // ⚠️ Validate refer value (link OR 10-digit number OR @username)
    let cleanValue = String(referValue).trim();
    let isValid = false;
    if (cleanValue.startsWith("http://") || cleanValue.startsWith("https://")) isValid = true;
    else if (cleanValue.startsWith("t.me/")) isValid = true;
    else if (/^\d{10}$/.test(cleanValue)) isValid = true;
    else if (cleanValue.startsWith("@") && cleanValue.length >= 6) isValid = true;

    if (!isValid) {
      return res.json({
        success: false,
        error: "Invalid format! Send a link, 10-digit number, or @username"
      });
    }

    const submissionId = generateSubmissionId();
    const user = await User.findOne({ userId: uid });
    const userName = user ? (user.firstName || "User") : "User";

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel
      : await getConfig("default_task_alert_channel", "Not Set");

    if (!alertChannel || alertChannel === "Not Set") {
      return res.json({ success: false, error: "Alert channel not set." });
    }

    await TaskSubmission.create({
      submissionId, userId: uid, userName,
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: `REFER: ${cleanValue}`, status: "Pending"
    });

    let userLink = `<a href="tg://user?id=${uid}">${userName} (${uid})</a>`;
    let caption = `<b>NEW TASK SUBMISSION</b>\n\n` +
                  `User: ${userLink}\n` +
                  `Task: ${task.title}\n` +
                  `Reward: ₹${task.reward}\n` +
                  `Link: ${task.link}\n` +
                  `Type: Refer\n` +
                  `Refer: ${cleanValue}`;

    let kb = new InlineKeyboard()
      .text("Approve ✅", `task_app_${submissionId}`)
      .text("Reject ❌", `task_rej_${submissionId}`);

    try {
      await bot.api.sendMessage(alertChannel, caption, { parse_mode: "HTML", reply_markup: kb });
    } catch (e) {
      return res.json({ success: false, error: "Failed: " + e.message });
    }

    res.json({ success: true, submissionId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// 🎁 GIFT CODE REDEEM API (Mini App)
// ============================================================
app.post("/miniapp/api/redeem-gift", async (req, res) => {
  try {
    const { userId, code } = req.body;
    const uid = parseInt(userId, 10);
    if (!uid || !code) return res.json({ success: false, error: "Missing fields" });

    const cleanCode = String(code).trim().toUpperCase();
    if (cleanCode.length < 3) {
      return res.json({ success: false, error: "Invalid gift code!" });
    }

    // Check if code exists (for better error messages)
    const existing = await GiftCode.findOne({ code: cleanCode, type: "redeem" }).lean();

    if (!existing) {
      return res.json({ success: false, error: "Invalid gift code!" });
    }

    if (existing.usedUsers.includes(uid)) {
      return res.json({ success: false, error: "You already used this code!" });
    }

    if (existing.usedUsers.length >= existing.maxUses) {
      return res.json({ success: false, error: "Code usage limit reached!" });
    }

    // Redeem atomically
    const gift = await GiftCode.findOneAndUpdate(
      {
        code: cleanCode,
        type: "redeem",
        usedUsers: { $ne: uid },
        $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] }
      },
      { $push: { usedUsers: uid } },
      { new: true }
    );

    if (!gift) {
      return res.json({ success: false, error: "Invalid or expired code!" });
    }

    const user = await getUser(uid);
    user.balance += gift.amount;
    await user.save();
    await logBalanceHistory(uid, `Gift Redeemed (${gift.code})`, gift.amount);

    res.json({
      success: true,
      amount: gift.amount,
      newBalance: user.balance,
      code: gift.code
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 💠 UPI SETTINGS API
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

// ============================================================
// 💠 UPI VERIFY API (Manual verification)
// ============================================================
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

    const orderId = generateOrderId();
    const user = await getUser(uid);

    await UPIPayment.create({
      orderId, userId: uid, amount: amt,
      utr: cleanUtr, upiId: upiId || await getConfig("auto_upi_id", "payzy@upi"),
      status: "Pending", source: "miniapp-manual"
    });

    // Send to add fund channel
    let addFundChannel = await getAddFundChannel();
    if (addFundChannel && addFundChannel !== "Not Set") {
      const kb = new InlineKeyboard()
        .text("Approve ✅", `upi_app_${orderId}`)
        .text("Reject ❌", `upi_rej_${orderId}`);
      try {
        await bot.api.sendMessage(addFundChannel,
          `💰 <b>UPI Deposit Request</b>\n\n` +
          `<b>User:</b> ${user.firstName || "User"}\n` +
          `<b>ID:</b> <code>${uid}</code>\n` +
          `<b>Amount:</b> ₹${amt}\n` +
          `<b>UTR:</b> <code>${cleanUtr}</code>\n` +
          `<b>Order:</b> <code>${orderId}</code>`,
          { parse_mode: "HTML", reply_markup: kb });
      } catch (e) { }
    }

    return res.json({
      success: true,
      mode: "manual",
      newBalance: user.balance
    });
  } catch (e) {
    console.error("UPI verify error:", e);
    res.json({ success: false, error: e.message });
  }
});

// ============================================================
// ✅ VERIFY APIs (Device Verification)
// ============================================================
app.get("/miniapp/api/verify/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId }).lean();
    if (!user) return res.json({ success: false, error: "User not found" });

    const verifyEnabled = await getConfig("verification_enabled", false);
    const rec = await Verification.findOne({ userId }).lean();

    let botName = await getConfig("bot_name", "TASK EARN BOT");
    let botPhotoUrl = await getConfig("bot_photo_url", null);

    let userPhotoUrl = null;
    try {
      let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
      if (photos.total_count > 0) {
        let fileId = photos.photos[0][0].file_id;
        let file = await bot.api.getFile(fileId);
        userPhotoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      }
    } catch (e) { }

    res.json({
      success: true,
      verifyEnabled: verifyEnabled,
      verified: rec ? rec.verified : false,
      reason: rec ? rec.reason : "",
      botName,
      botPhotoUrl,
      userId: user.userId,
      firstName: user.firstName || "User",
      username: user.username || "",
      userPhotoUrl
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/verify/submit", async (req, res) => {
  try {
    const { userId, deviceHash } = req.body;
    const uid = parseInt(userId, 10);
    if (!uid || !deviceHash) return res.json({ success: false, error: "Missing fields" });

    const verifyEnabled = await getConfig("verification_enabled", false);
    if (!verifyEnabled) {
      return res.json({ success: true, verified: true, reason: "Verification disabled" });
    }

    // Check if device hash already used by another user
    const existingDevice = await Verification.findOne({
      deviceHash: deviceHash,
      userId: { $ne: uid },
      verified: true
    }).lean();

    if (existingDevice) {
      await Verification.findOneAndUpdate(
        { userId: uid },
        {
          userId: uid,
          deviceHash,
          verified: false,
          reason: "This device has already been used by another account.",
          verifiedAt: null
        },
        { upsert: true }
      );
      return res.json({
        success: true,
        verified: false,
        reason: "This device has already been used by another account."
      });
    }

    // Verify
    await Verification.findOneAndUpdate(
      { userId: uid },
      {
        userId: uid,
        deviceHash,
        verified: true,
        reason: "",
        verifiedAt: new Date()
      },
      { upsert: true }
    );

    res.json({ success: true, verified: true, reason: "" });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 7
// ============================================================

console.log("✅ index.js — Message 7 of 18 loaded");
// ============================================================
// 👑 MINI APP — ADMIN APIs (Part 1)
// ============================================================

// ---------- Pending Withdrawals ----------
app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try {
    const wds = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, withdrawals: wds });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Approve Withdrawal ----------
app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOneAndUpdate(
      { withdrawalId: req.params.id, status: "Pending" },
      { status: "Approved", txnNumber: generateTxnNumber(), approvedBy: "MiniApp Admin", approvedAt: new Date() },
      { new: true }
    );
    if (!wd) return res.json({ success: false, error: "Already processed" });

    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });

    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> <code>${wd.details}</code>\n` +
        `🚀Transaction ID ==> <code>${wd.txnNumber}</code>\n` +
        `🗓 Date ==> ${formatDateTime(wd.approvedAt)}\n\n` +
        `✅Please Check Your ${wd.method} Account!`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Reject Withdrawal ----------
app.post("/miniapp/api/admin/reject-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOneAndUpdate(
      { withdrawalId: req.params.id, status: "Pending" },
      { status: "Rejected", approvedBy: "MiniApp Admin", approvedAt: new Date() },
      { new: true }
    );
    if (!wd) return res.json({ success: false, error: "Already processed" });

    let user = await getUser(wd.userId);
    user.balance += wd.amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
    await user.save();
    await logBalanceHistory(wd.userId, "Withdrawal Refunded", wd.amount);

    try {
      await bot.api.sendMessage(wd.userId,
        `❌ Withdrawal of ₹${wd.amount} rejected & refunded.\n💵 New Balance: ₹${user.balance.toFixed(2)}`);
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Pending Add Funds ----------
app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, addFunds: afs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Approve Add Fund ----------
app.post("/miniapp/api/admin/approve-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOneAndUpdate(
      { requestId: req.params.id, status: "Pending" },
      { status: "Approved", approvedBy: "MiniApp Admin", approvedAt: new Date() },
      { new: true }
    );
    if (!af) return res.json({ success: false, error: "Already processed" });

    let user = await getUser(af.userId);
    user.balance += af.amount;
    await user.save();
    await logBalanceHistory(af.userId, `Add Fund Approved (#${af.requestId})`, af.amount);

    try {
      await bot.api.sendMessage(af.userId,
        `✅ *Add Fund Approved!*\n\n💰 ₹${af.amount}\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Reject Add Fund ----------
app.post("/miniapp/api/admin/reject-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOneAndUpdate(
      { requestId: req.params.id, status: "Pending" },
      { status: "Rejected", approvedBy: "MiniApp Admin", approvedAt: new Date() },
      { new: true }
    );
    if (!af) return res.json({ success: false, error: "Already processed" });

    try {
      await bot.api.sendMessage(af.userId, `❌ Add Fund Rejected\n\n₹${af.amount}`);
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Pending Submissions ----------
app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, submissions: subs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Approve Submission ----------
app.post("/miniapp/api/admin/approve-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOneAndUpdate(
      { submissionId: req.params.id, status: "Pending" },
      { status: "Approved" },
      { new: true }
    );
    if (!sub) return res.json({ success: false, error: "Already processed" });

    let user = await getUser(sub.userId);
    user.balance += sub.reward;
    await user.save();
    await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
    await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });

    try {
      await bot.api.sendMessage(sub.userId,
        `🎉 *Payment Received!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}\n✅ Approved`,
        { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Reject Submission ----------
app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOneAndUpdate(
      { submissionId: req.params.id, status: "Pending" },
      { status: "Rejected" },
      { new: true }
    );
    if (!sub) return res.json({ success: false, error: "Already processed" });

    try {
      await bot.api.sendMessage(sub.userId,
        `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`,
        { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Pending UPI Payments ----------
app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try {
    const pending = await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, payments: pending });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Approve UPI Payment ----------
app.post("/miniapp/api/admin/approve-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOneAndUpdate(
      { orderId: req.params.id, status: { $ne: "Approved" } },
      { status: "Approved", verifiedAt: new Date(), approvedBy: "MiniApp Admin" },
      { new: true }
    );
    if (!payment) return res.json({ success: false, error: "Already processed" });

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
        { parse_mode: "HTML" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Reject UPI Payment ----------
app.post("/miniapp/api/admin/reject-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOneAndUpdate(
      { orderId: req.params.id, status: { $ne: "Rejected" } },
      { status: "Rejected", approvedBy: "MiniApp Admin" },
      { new: true }
    );
    if (!payment) return res.json({ success: false, error: "Already processed" });

    try {
      await bot.api.sendMessage(payment.userId,
        `❌ *Deposit Rejected*\n\n💰 ₹${payment.amount}\n🔐 UTR: \`${payment.utr}\``,
        { parse_mode: "Markdown" });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 8
// ============================================================

console.log("✅ index.js — Message 8 of 18 loaded");
// ============================================================
// 👑 MINI APP — ADMIN APIs (Part 2)
// ============================================================

// ---------- All Users ----------
app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100).lean();
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- User Detail ----------
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
      success: true,
      user,
      counts: {
        withdraw: withdrawCount,
        approved: approvedCount,
        rejected: rejectedCount,
        pending: pendingCount,
        deposit: depositCount,
        balanceHistory: balanceHistoryCount
      }
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- User Withdrawals ----------
app.get("/miniapp/api/admin/user-withdrawals/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, withdrawals });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- User Deposits ----------
app.get("/miniapp/api/admin/user-deposits/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const deposits = await UPIPayment.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, deposits });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- User Balance History ----------
app.get("/miniapp/api/admin/user-balance-history/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, history });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Add Balance ----------
app.post("/miniapp/api/admin/add-balance", async (req, res) => {
  try {
    const { userId, amount, requesterId } = req.body;

    const requester = parseInt(requesterId, 10);
    if (!(await isAdmin(requester))) return res.status(403).json({ success: false, error: "Unauthorized" });

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
    await logAdminAction(requester, "Admin", "Added Balance", `+₹${amt}`, amt, uid);

    try {
      await bot.api.sendMessage(uid,
        `💰 <b>Balance Updated!</b>\n\n🟢 Added: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Remove Balance ----------
app.post("/miniapp/api/admin/remove-balance", async (req, res) => {
  try {
    const { userId, amount, requesterId } = req.body;

    const requester = parseInt(requesterId, 10);
    if (!(await isAdmin(requester))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });

    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    user.balance = Math.max(0, user.balance - amt);
    await user.save();

    await logBalanceHistory(uid, "Admin Removed Balance", -amt);
    await logAdminAction(requester, "Admin", "Removed Balance", `-₹${amt}`, amt, uid);

    try {
      await bot.api.sendMessage(uid,
        `💰 <b>Balance Updated!</b>\n\n📉 Removed: ₹${amt}\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Send Message to User ----------
app.post("/miniapp/api/admin/send-message", async (req, res) => {
  try {
    const { userId, message, requesterId } = req.body;

    const requester = parseInt(requesterId, 10);
    if (!(await isAdmin(requester))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const uid = parseInt(userId, 10);
    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });

    try {
      await bot.api.sendMessage(uid, `📨 <b>Message from Admin:</b>\n\n${message}`, { parse_mode: "HTML" });
      await logAdminAction(requester, "Admin", "Message Sent", `To ${uid}`, 0, uid);
      res.json({ success: true });
    } catch (e) { res.json({ success: false, error: "Failed to send: " + e.message }); }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Ban / Unban User ----------
app.post("/miniapp/api/admin/toggle-ban/:userId", async (req, res) => {
  try {
    const { requesterId } = req.body;

    const requester = parseInt(requesterId, 10);
    if (!(await isAdmin(requester))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const uid = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });

    user.isBanned = !user.isBanned;
    await user.save();

    await logAdminAction(requester, "Admin", user.isBanned ? "User Banned" : "User Unbanned", `${uid}`, 0, uid);

    try {
      await bot.api.sendMessage(uid,
        user.isBanned
          ? `🚫 <b>You have been banned from using this bot.</b>`
          : `✅ <b>You have been unbanned. Welcome back!</b>`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true, isBanned: user.isBanned });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Transfer Ownership ----------
app.post("/miniapp/api/admin/transfer-owner", async (req, res) => {
  try {
    const { newOwnerId, requesterId } = req.body;

    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.status(403).json({ success: false, error: "Owner only" });

    const nId = parseInt(newOwnerId, 10);
    const targetUser = await User.findOne({ userId: nId });
    if (!targetUser) return res.json({ success: false, error: "User not found" });

    await BotAdmin.findOneAndUpdate(
      { userId: reqId },
      { addedAt: new Date(), addedBy: reqId, isActive: true },
      { upsert: true }
    );

    await setConfig("owner_id", nId);
    cache.config["owner_id"] = nId;

    await logAdminAction(reqId, "Owner", "Ownership Transferred", `New owner: ${nId}`, 0, nId);

    try {
      await bot.api.sendMessage(nId,
        `👑 <b>Congratulations!</b>\n\nYou are now the <b>OWNER</b> of this bot!`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Owner Info — Get ----------
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

// ---------- Owner Info — Save ----------
app.post("/miniapp/api/admin/owner-info/save", async (req, res) => {
  try {
    const { userId: requesterId, name, link } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Admin only" });

    if (name !== undefined) await setConfig("owner_display_name", name);
    if (link !== undefined) await setConfig("owner_display_link", link);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Admin List ----------
app.get("/miniapp/api/admin/list", async (req, res) => {
  try {
    const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    const ownerUser = await User.findOne({ userId: ownerId }).lean();
    const admins = await BotAdmin.find({}).sort({ addedAt: -1 }).lean();

    let list = [{ userId: ownerId, name: ownerUser?.firstName || "Owner", role: "owner" }];

    for (let a of admins) {
      let u = await User.findOne({ userId: a.userId }).lean();
      list.push({
        userId: a.userId,
        name: u?.firstName || "Admin",
        role: a.isActive ? "admin" : "disabled"
      });
    }
    res.json({ success: true, admins: list });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Add Admin ----------
app.post("/miniapp/api/admin/add", async (req, res) => {
  try {
    const { userId: newAdminId, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.status(403).json({ success: false, error: "Owner only" });

    const nId = parseInt(newAdminId, 10);
    const targetUser = await User.findOne({ userId: nId });
    if (!targetUser) return res.json({ success: false, error: "User not found" });

    await BotAdmin.findOneAndUpdate(
      { userId: nId },
      { addedAt: new Date(), addedBy: reqId, isActive: true },
      { upsert: true }
    );

    await logAdminAction(reqId, "Owner", "Admin Added", `Added ${nId}`, 0, nId);

    try {
      await bot.api.sendMessage(nId,
        `👑 <b>You have been added as an Admin!</b>`,
        { parse_mode: "HTML" });
    } catch (e) { }

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Remove Admin ----------
app.post("/miniapp/api/admin/remove/:id", async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.status(403).json({ success: false, error: "Owner only" });

    await BotAdmin.deleteOne({ userId: adminId });
    await logAdminAction(reqId, "Owner", "Admin Removed", `Removed ${adminId}`, 0, adminId);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Toggle Admin Status ----------
app.post("/miniapp/api/admin/toggle-admin/:id", async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isOwner(reqId))) return res.status(403).json({ success: false, error: "Owner only" });

    const admin = await BotAdmin.findOne({ userId: adminId });
    if (!admin) return res.json({ success: false, error: "Admin not found" });

    admin.isActive = !admin.isActive;
    if (!admin.isActive) {
      admin.disabledAt = new Date();
      admin.disabledBy = reqId;
    } else {
      admin.disabledAt = null;
      admin.disabledBy = null;
    }
    await admin.save();

    await logAdminAction(reqId, "Owner",
      admin.isActive ? "Admin Enabled" : "Admin Disabled",
      `${adminId}`, 0, adminId);

    res.json({ success: true, isActive: admin.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 9
// ============================================================

console.log("✅ index.js — Message 9 of 18 loaded");
// ============================================================
// 👑 MINI APP — ADMIN APIs (Part 3)
// ============================================================

// ---------- Admin Settings ----------
app.get("/miniapp/api/admin/settings", async (req, res) => {
  try {
    const settings = {
      min_withdraw: await getConfig("min_withdraw", 0),
      max_withdraw: await getConfig("max_withdraw", 0),
      tax_percent: await getConfig("tax_percent", 0),
      payout_channel: await getConfig("payout_channel", "Not Set"),
      addfund_channel: await getConfig("addfund_channel", "Not Set"),
      support_username: await getConfig("support_username", "Not Set"),
      bot_active: await getConfig("bot_active", true),
      withdraw_enabled: await getConfig("withdraw_enabled", true),
      balance_footer_text: await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer),
      balance_welcome_text: await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome),
      start_title_text: await getConfig("start_title_text", DEFAULT_START_TEXT.title),
      start_link_prefix: await getConfig("start_link_prefix", DEFAULT_START_TEXT.linkPrefix),
      start_link_clickable: await getConfig("start_link_clickable", DEFAULT_START_TEXT.linkClickable),
      welcome_channel_link: await getConfig("welcome_channel_link", ""),
      auto_upi_id: await getConfig("auto_upi_id", "payzy@upi"),
      auto_upi_min: await getConfig("auto_upi_min", 5),
      auto_upi_max: await getConfig("auto_upi_max", 200),
      auto_upi_enabled: await getConfig("auto_upi_enabled", true),
      quick_pay_tax_enabled: await getConfig("quick_pay_tax_enabled", false),
      quick_pay_tax_percent: await getConfig("quick_pay_tax_percent", 0),
      owner_display_name: await getConfig("owner_display_name", null),
      owner_display_link: await getConfig("owner_display_link", null),
      verification_enabled: await getConfig("verification_enabled", false),
      force_join_enabled: await getConfig("force_join_enabled", true)
    };
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Update Settings ----------
app.post("/miniapp/api/admin/settings/update", async (req, res) => {
  try {
    const { key, value, requesterId } = req.body;

    const reqId = parseInt(requesterId, 10);
    if (reqId && !(await isAdmin(reqId))) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const allowed = [
      "min_withdraw", "max_withdraw", "tax_percent",
      "payout_channel", "addfund_channel", "support_username",
      "bot_active", "withdraw_enabled",
      "balance_footer_text", "balance_welcome_text",
      "start_title_text", "start_link_prefix", "start_link_clickable",
      "welcome_channel_link",
      "auto_upi_id", "auto_upi_min", "auto_upi_max", "auto_upi_enabled",
      "quick_pay_tax_enabled", "quick_pay_tax_percent",
      "owner_display_name", "owner_display_link",
      "verification_enabled", "force_join_enabled",
      "app_logo", "btn_home", "btn_task", "btn_pay", "btn_profile"
    ];

    if (!allowed.includes(key)) return res.json({ success: false, error: "Invalid key" });

    await setConfig(key, value);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Save Config (Theme) ----------
app.post("/miniapp/api/admin/save-config", async (req, res) => {
  try {
    const { userId, key, value } = req.body;

    const reqId = parseInt(userId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const allowed = [
      "app_logo", "btn_home", "btn_task", "btn_pay", "btn_profile",
      "start_title_text", "start_link_prefix", "start_link_clickable",
      "balance_welcome_text", "balance_footer_text",
      "support_username", "welcome_channel_link",
      "owner_display_name", "owner_display_link"
    ];

    if (!allowed.includes(key)) return res.json({ success: false, error: "Invalid key" });

    await setConfig(key, value);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Broadcast ----------
app.post("/miniapp/api/admin/broadcast", async (req, res) => {
  try {
    const { message, requesterId } = req.body;

    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });

    const users = await User.find({}).lean();
    let sent = 0, failed = 0;
    let startTime = Date.now();

    for (let u of users) {
      try {
        await bot.api.sendMessage(u.userId, message, { parse_mode: "HTML" });
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { failed++; }
    }

    let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

    await Broadcast.create({
      broadcastId: Date.now().toString(),
      adminId: reqId,
      adminName: "MiniApp Admin",
      messageType: "text",
      content: message,
      sentCount: sent,
      failedCount: failed,
      totalCount: users.length,
      timeTaken: parseFloat(timeTaken),
      status: "Completed"
    });

    await logAdminAction(reqId, "Admin", "Broadcast Sent", `${sent} sent, ${failed} failed`, 0, null);

    res.json({ success: true, sent, failed, total: users.length, timeTaken });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🏦 GATEWAY CRUD (Admin)
// ============================================================

app.get("/miniapp/api/admin/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/create", async (req, res) => {
  try {
    const { name, url, requesterId } = req.body;

    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    if (!name || !url) return res.json({ success: false, error: "Missing fields" });
    let existing = await Gateway.findOne({ name: name.toUpperCase() });
    if (existing) return res.json({ success: false, error: "Gateway exists" });

    await Gateway.create({
      name: name.toUpperCase(),
      url: url.trim(),
      url_template: url.trim(),
      isActive: false,
      minAmount: 0,
      maxAmount: 0,
      taxPercent: 0,
      createdBy: reqId
    });

    await logAdminAction(reqId, "Admin", "Gateway Created", name.toUpperCase(), 0, null);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/toggle/:name", async (req, res) => {
  try {
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const gw = await Gateway.findOne({ name: req.params.name });
    if (!gw) return res.json({ success: false, error: "Not found" });

    if (!gw.isActive) {
      // Activate — deactivate others first
      await Gateway.updateMany({}, { isActive: false });
      gw.isActive = true;
    } else {
      gw.isActive = false;
    }
    gw.updatedAt = new Date();
    await gw.save();

    await logAdminAction(reqId, "Admin", "Gateway Toggled", `${gw.name} → ${gw.isActive ? "ON" : "OFF"}`, 0, null);
    res.json({ success: true, isActive: gw.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/update/:name", async (req, res) => {
  try {
    const { requesterId, minAmount, maxAmount, taxPercent, url } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const update = { updatedAt: new Date() };
    if (minAmount !== undefined) update.minAmount = parseFloat(minAmount) || 0;
    if (maxAmount !== undefined) update.maxAmount = parseFloat(maxAmount) || 0;
    if (taxPercent !== undefined) update.taxPercent = parseFloat(taxPercent) || 0;
    if (url !== undefined) {
      update.url = url.trim();
      update.url_template = url.trim();
    }

    await Gateway.updateOne({ name: req.params.name }, update);
    await logAdminAction(reqId, "Admin", "Gateway Updated", req.params.name, 0, null);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/delete/:name", async (req, res) => {
  try {
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    await Gateway.deleteOne({ name: req.params.name });
    await logAdminAction(reqId, "Admin", "Gateway Deleted", req.params.name, 0, null);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 💸 WITHDRAW SETTINGS (Per method)
// ============================================================

app.get("/miniapp/api/admin/withdraw-settings", async (req, res) => {
  try {
    let settings = await WithdrawSettings.find({}).lean();

    if (settings.length === 0) {
      const methods = [
        { method: "upi", minAmount: 0, maxAmount: 0, taxPercent: 0, isActive: true },
        { method: "bank", minAmount: 0, maxAmount: 0, taxPercent: 0, isActive: true },
        { method: "amazon", minAmount: 0, maxAmount: 0, taxPercent: 0, isActive: false },
        { method: "redeem", minAmount: 0, maxAmount: 0, taxPercent: 0, isActive: false }
      ];
      for (let m of methods) await WithdrawSettings.create(m);
      settings = await WithdrawSettings.find({}).lean();
    }
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/withdraw-settings/update", async (req, res) => {
  try {
    const { method, isActive, minAmount, maxAmount, taxPercent, requesterId } = req.body;

    const reqId = parseInt(requesterId, 10);
    if (reqId && !(await isAdmin(reqId))) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    if (!method) return res.json({ success: false, error: "Method required" });

    let update = { updatedAt: new Date() };
    if (isActive !== undefined) update.isActive = isActive;
    if (minAmount !== undefined) update.minAmount = parseFloat(minAmount) || 0;
    if (maxAmount !== undefined) update.maxAmount = parseFloat(maxAmount) || 0;
    if (taxPercent !== undefined) update.taxPercent = parseFloat(taxPercent) || 0;

    await WithdrawSettings.findOneAndUpdate(
      { method: method.toLowerCase() },
      update,
      { upsert: true }
    );

    // Also sync with withdraw_toggles
    if (isActive !== undefined) {
      let toggles = await getConfig("withdraw_toggles", {
        wallet: true, upi: true, bank: true, amazon: true, redeem: true
      });
      toggles[method.toLowerCase()] = isActive;
      await setConfig("withdraw_toggles", toggles);
    }

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 💵 LIVE FUND (Admin)
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
    const { amount, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) return res.json({ success: false, error: "Invalid amount" });

    await LiveFund.findOneAndUpdate(
      { key: "main_fund" },
      { totalFund: amt, usedFund: 0, updatedAt: new Date() },
      { upsert: true }
    );

    await logAdminAction(reqId, "Admin", "Live Fund Set", `₹${amt}`, amt, null);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/live-fund/toggle", async (req, res) => {
  try {
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) fund = await LiveFund.create({ key: "main_fund" });

    fund.isActive = !fund.isActive;
    fund.updatedAt = new Date();
    await fund.save();

    res.json({ success: true, isActive: fund.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 10
// ============================================================

console.log("✅ index.js — Message 10 of 18 loaded");
// ============================================================
// 👑 MINI APP — ADMIN APIs (Part 4)
// ============================================================

// ---------- Withdraw Stats ----------
app.get("/miniapp/api/admin/withdraw-stats", async (req, res) => {
  try {
    const total = await Withdrawal.countDocuments({});
    const approved = await Withdrawal.countDocuments({ status: "Approved" });
    const pending = await Withdrawal.countDocuments({ status: "Pending" });
    const rejected = await Withdrawal.countDocuments({ status: "Rejected" });

    const totalPayoutArr = await Withdrawal.aggregate([
      { $match: { status: "Approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalPayout = totalPayoutArr[0]?.total || 0;

    let byMethod = {};
    for (let m of ["UPI", "BANK", "AMAZON", "REDEEM"]) {
      let count = await Withdrawal.countDocuments({ method: m, status: "Approved" });
      let amtArr = await Withdrawal.aggregate([
        { $match: { method: m, status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      byMethod[m] = { count, amount: amtArr[0]?.total || 0 };
    }

    res.json({ success: true, total, approved, pending, rejected, totalPayout, byMethod });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Statements (Withdrawal History) ----------
app.get("/miniapp/api/admin/statements", async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    let query = {};
    if (filter === "approved") query.status = "Approved";
    else if (filter === "rejected") query.status = "Rejected";
    else if (filter === "pending") query.status = "Pending";

    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 }).limit(100).lean();

    let results = [];
    for (let w of withdrawals) {
      const user = await User.findOne({ userId: w.userId }).lean();
      results.push({
        withdrawalId: w.withdrawalId,
        userId: w.userId,
        userName: user?.firstName || "User",
        username: user?.username || "",
        amount: w.amount,
        method: w.method,
        status: w.status,
        txnNumber: w.txnNumber,
        createdAt: w.createdAt,
        approvedAt: w.approvedAt,
        receiptUrl: `/receipt/${w.withdrawalId}`
      });
    }

    res.json({ success: true, statements: results, total: results.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Admin Logs ----------
app.get("/miniapp/api/admin/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, logs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- New Users ----------
app.get("/miniapp/api/admin/new-users", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const users = await User.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    const total = await User.countDocuments({});

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await User.countDocuments({ createdAt: { $gte: today } });

    let weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = await User.countDocuments({ createdAt: { $gte: weekAgo } });

    res.json({ success: true, users, total, todayCount, weekCount });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Live Balance Tracker (Paginated, Sorted) ----------
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
    const totalBalanceArr = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);

    res.json({
      success: true,
      users,
      total,
      totalBalance: totalBalanceArr[0]?.total || 0,
      page,
      totalPages: Math.ceil(total / perPage)
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Withdraw Requests (with user info) ----------
app.get("/miniapp/api/admin/withdraw-requests", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    let results = [];
    for (let w of withdrawals) {
      const user = await User.findOne({ userId: w.userId }).lean();
      results.push({
        withdrawalId: w.withdrawalId,
        userId: w.userId,
        userName: user?.firstName || "User",
        amount: w.amount,
        method: w.method,
        details: w.details,
        userWithdrawalCount: w.userWithdrawalCount,
        createdAt: w.createdAt
      });
    }
    res.json({ success: true, requests: results });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- User Withdrawals (Admin view) ----------
app.get("/miniapp/api/admin/user-withdrawals/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, withdrawals });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🎁 GIFT CODE APIs (Admin)
// ============================================================

// ---------- List Gift Codes ----------
app.get("/miniapp/api/admin/gift-codes", async (req, res) => {
  try {
    const type = req.query.type || "redeem";
    const codes = await GiftCode.find({ type }).sort({ createdAt: -1 }).limit(100).lean();
    const total = await GiftCode.countDocuments({ type });
    res.json({ success: true, codes, total });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Create Gift Codes (bulk) ----------
app.post("/miniapp/api/admin/gift-codes/create", async (req, res) => {
  try {
    const { codes: codesText, type, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    if (!codesText) return res.json({ success: false, error: "Missing codes" });
    const giftType = type || "redeem";

    let lines = String(codesText).trim().split("\n").filter(l => l.trim() !== "");
    let added = 0, failed = 0;

    for (let line of lines) {
      let parts = line.trim().split(/\s+/);
      if (parts.length !== 2) { failed++; continue; }
      let code = parts[0].trim().toUpperCase();
      let amount = parseFloat(parts[1]);
      if (isNaN(amount) || amount <= 0) { failed++; continue; }

      let existing = await GiftCode.findOne({ code, type: giftType });
      if (existing) { failed++; continue; }

      await GiftCode.create({ code, amount, type: giftType, maxUses: 1, usedUsers: [] });
      added++;
    }

    await logAdminAction(reqId, "Admin", "Gift Codes Added", `${added} added, ${failed} failed`, 0, null);
    res.json({ success: true, added, failed, total: lines.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Update Gift Code ----------
app.post("/miniapp/api/admin/gift-codes/update/:code", async (req, res) => {
  try {
    const { amount, maxUses, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const update = {};
    if (amount !== undefined) update.amount = parseFloat(amount);
    if (maxUses !== undefined) update.maxUses = parseInt(maxUses, 10);

    await GiftCode.updateOne({ code: req.params.code }, update);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Delete Gift Code ----------
app.post("/miniapp/api/admin/gift-codes/delete/:code", async (req, res) => {
  try {
    const { requesterId, type } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    await GiftCode.deleteOne({ code: req.params.code, type: type || "redeem" });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Claim View ----------
app.get("/miniapp/api/admin/gift-codes/claims/:code", async (req, res) => {
  try {
    const gc = await GiftCode.findOne({ code: req.params.code }).lean();
    if (!gc) return res.json({ success: false, error: "Not found" });

    let claims = [];
    for (let uid of gc.usedUsers.slice(0, 50)) {
      let u = await User.findOne({ userId: uid }).lean();
      claims.push({
        userId: uid,
        firstName: u?.firstName || "User",
        username: u?.username || ""
      });
    }

    res.json({ success: true, claims });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 📋 TASK APIs (Admin)
// ============================================================

// ---------- Get All Tasks ----------
app.get("/miniapp/api/admin/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({ isComplete: true }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, tasks });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Create Task ----------
app.post("/miniapp/api/admin/tasks/create", async (req, res) => {
  try {
    const { title, reward, link, description, taskType, expiryMinutes, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    if (!title || !reward || !link) return res.json({ success: false, error: "Missing fields" });

    const newTaskId = generateTaskId();
    const alertChannel = await getConfig("default_task_alert_channel", "Not Set");

    let expiresAt = null;
    const expMin = parseInt(expiryMinutes, 10) || 0;
    if (expMin > 0) expiresAt = new Date(Date.now() + expMin * 60 * 1000);

    await Task.create({
      taskId: newTaskId,
      title,
      reward: parseFloat(reward),
      link,
      description: description || "",
      taskType: taskType || "photo",
      alertChannel,
      isActive: true,
      isComplete: true,
      completedUsers: [],
      expiryMinutes: expMin,
      expiresAt
    });

    await logAdminAction(reqId, "Admin", "Task Created", title, parseFloat(reward), null);
    res.json({ success: true, taskId: newTaskId });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Update Task ----------
app.post("/miniapp/api/admin/tasks/update/:taskId", async (req, res) => {
  try {
    const { title, reward, link, description, taskType, isActive, expiryMinutes, requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    const update = {};
    if (title !== undefined) update.title = title;
    if (reward !== undefined) update.reward = parseFloat(reward);
    if (link !== undefined) update.link = link;
    if (description !== undefined) update.description = description;
    if (taskType !== undefined) update.taskType = taskType;
    if (isActive !== undefined) update.isActive = isActive;
    if (expiryMinutes !== undefined) {
      const expMin = parseInt(expiryMinutes, 10) || 0;
      update.expiryMinutes = expMin;
      update.expiresAt = expMin > 0 ? new Date(Date.now() + expMin * 60 * 1000) : null;
    }

    await Task.updateOne({ taskId: req.params.taskId }, update);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ---------- Delete Task ----------
app.post("/miniapp/api/admin/tasks/delete/:taskId", async (req, res) => {
  try {
    const { requesterId } = req.body;
    const reqId = parseInt(requesterId, 10);
    if (!(await isAdmin(reqId))) return res.status(403).json({ success: false, error: "Unauthorized" });

    await Task.deleteOne({ taskId: req.params.taskId });
    await logAdminAction(reqId, "Admin", "Task Deleted", req.params.taskId, 0, null);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// ✅ END OF MESSAGE 11
// ============================================================

console.log("✅ index.js — Message 11 of 18 loaded");
// ============================================================
// 🚀 BOT — /START COMMAND
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
        {
          firstName: ctx.from.first_name || "",
          username: ctx.from.username || "",
          startTime: new Date()
        },
        { upsert: true }
      );

      let nameStr = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim() || "No Name";
      let usernameStr = ctx.from.username ? `@${ctx.from.username}` : "No Username";
      let notifMsg =
        `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n💰 ₹${user.balance.toFixed(2)}\n📅 ${formatDateTime(new Date())}`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      let newUserNotif = await getConfig("new_user_notif", true);
      if (newUserNotif) {
        try {
          await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb });
        } catch (e) { }
      }
    }

    if (user.isBanned) {
      return ctx.reply(`🚫 ${toSmallCaps("You are banned from using this bot.")}`, { parse_mode: "HTML" });
    }

    let botActive = await getConfig("bot_active", true);
    if (!botActive) {
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser) {
        let botOffText = await getConfig("bot_off_text", `${toSmallCaps("Bot is currently OFF")}`);
        return ctx.reply(botOffText, { parse_mode: "HTML" });
      }
    }

    // ⚠️ Verification Check
    let verifyEnabled = await getConfig("verification_enabled", false);
    if (verifyEnabled) {
      let verifyRec = await Verification.findOne({ userId }).lean();
      if (!verifyRec || !verifyRec.verified) {
        let miniAppUrl = process.env.RENDER_EXTERNAL_URL
          ? `${process.env.RENDER_EXTERNAL_URL}/miniapp/verify`
          : null;
        if (miniAppUrl) {
          return ctx.reply(
            `✅ <b>Verification Required</b>\n\n🔒 Please verify your device to continue.\n\n👇 Click below:`,
            {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard().webApp("✅ Verify Now", miniAppUrl)
            }
          );
        }
      }
    }

    // ⚠️ Force Join Check
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) return sendForceJoinMessage(ctx);

    // ⚠️ Start Message
    let titleText = await getConfig("start_title_text", DEFAULT_START_TEXT.title);
    let linkPrefix = await getConfig("start_link_prefix", DEFAULT_START_TEXT.linkPrefix);
    let linkClickable = await getConfig("start_link_clickable", DEFAULT_START_TEXT.linkClickable);
    let welcomeLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");

    let finalLink = convertOwnerLink(welcomeLink);
    let welcomeText = `${titleText}\n\n${linkPrefix}<a href="${finalLink}">${linkClickable}</a>`;

    let socialLinks = await SocialLink.find({}).lean();
    if (socialLinks.length > 0) {
      welcomeText += `\n\n`;
      for (let s of socialLinks) {
        welcomeText += `<a href="${s.link}">${s.name}</a>  `;
      }
    }

    try {
      await ctx.reply(welcomeText, {
        reply_markup: await buildKeyboardFromLayout(userId),
        parse_mode: "HTML"
      });
    } catch (htmlErr) {
      await ctx.reply(
        `${titleText}\n\n${linkPrefix}${linkClickable}\n${finalLink}`,
        { reply_markup: await buildKeyboardFromLayout(userId) }
      );
    }

    // ⚠️ Mini App Button
    if (process.env.RENDER_EXTERNAL_URL) {
      try {
        await ctx.reply("📱 <b>Open Mini App:</b>", {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("🚀 Open Mini App", `${process.env.RENDER_EXTERNAL_URL}/miniapp`)
        });
      } catch (e) { }
    }
  } catch (err) {
    console.error("❌ /start err:", err);
    try { await ctx.reply(`❌ Error: ${err.message}`); } catch (e) { }
  }
});

// ============================================================
// 🔒 FORCE JOIN MESSAGE
// ============================================================
async function sendForceJoinMessage(ctx) {
  let channels = await Channel.find({ isActive: true, isHidden: { $ne: true } })
    .sort({ order: 1, addedAt: 1 }).lean();
  if (!channels || channels.length === 0) return null;

  let userId = ctx.from.id;
  let showMode = await getConfig("show_mode", "all");

  let displayChannels = [];
  let notJoinedCount = 0;

  for (let ch of channels) {
    let isJoined = false;
    try {
      let member = await ctx.api.getChatMember(ch.channelId, userId);
      if (["member", "administrator", "creator"].includes(member.status)) {
        isJoined = true;
      }
    } catch (e) { }

    if (!isJoined) notJoinedCount++;

    if (showMode === "all" || !isJoined) {
      displayChannels.push({ ...ch, isJoined });
    }
  }

  if (displayChannels.length === 0) return null;

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let title = `⚠️ ${toSmallCaps("You Must Join Our Channels!")}`;
  let bodyText = `👇 ${toSmallCaps("Join all channels below")}:`;
  let text = `${title}\n\n<blockquote>${bodyText}</blockquote>`;

  if (notJoinedCount > 0) {
    text += `\n\n${toSmallCaps(`You have not joined in ${notJoinedCount} channels`)}`;
  }

  let kb = new InlineKeyboard();
  for (let ch of displayChannels) {
    kb.url(`📢 ${ch.displayName || ch.channelId}`, ch.inviteLink).row();
  }
  kb.text(makeBtn("Claim"), "check_join");

  return ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

// ============================================================
// ✅ CHECK JOIN CALLBACK
// ============================================================
bot.callbackQuery("check_join", async (ctx) => {
  let userId = ctx.from.id;

  let isJoined = await checkForceJoin(ctx);

  if (!isJoined) {
    await ctx.answerCallbackQuery({
      text: "You must join all channels first!",
      show_alert: true
    }).catch(() => { });

    await ctx.deleteMessage().catch(() => { });
    await sendForceJoinMessage(ctx);
    return;
  }

  await ctx.answerCallbackQuery({ text: "Verified!" }).catch(() => { });
  await ctx.deleteMessage().catch(() => { });

  await ctx.reply(
    `✅ ${toSmallCaps("Verified!")}\n\n${toSmallCaps("Welcome to the bot!")}`,
    {
      parse_mode: "HTML",
      reply_markup: await buildKeyboardFromLayout(userId)
    }
  );
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
    let code = parts[0].trim().toUpperCase();
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
// 💰 BALANCE PAGE BUILDER
// ============================================================
async function sendBalancePage(ctx, edit = false) {
  let userId = ctx.from.id;
  let user = await getUser(userId);

  let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

  let msg = `${welcomeText}\n\n🔵 ${toSmallCaps("Wallet ID")} ➝ <code>${userId}</code>\n🧾 ${toSmallCaps("Balance")} ➝ <code>₹${user.balance.toFixed(2)}</code>\n\n<blockquote>${footerText}</blockquote>`;

  let buttons = [];

  let supportInput = await getConfig("support_username", null);
  let supportLink = null;
  if (supportInput && supportInput !== "Not Set") {
    supportLink = convertOwnerLink(supportInput);
  }

  let row1 = [{ text: `📊 ${toSmallCaps("Balance Statement")}`, callback_data: "balance_statement" }];
  if (supportLink) {
    row1.push({ text: `💬 ${toSmallCaps("Support")}`, url: supportLink });
  } else {
    row1.push({ text: `💬 ${toSmallCaps("Support")}`, callback_data: "noop" });
  }
  buttons.push(row1);

  buttons.push([
    { text: `🔄 ${toSmallCaps("Refresh")}`, callback_data: "refresh_balance_only" },
    { text: `💰 ${toSmallCaps("Live Fund")}`, callback_data: "live_fund" }
  ]);

  buttons.push([{ text: `⚙️ ${toSmallCaps("Settings")}`, callback_data: "user_settings" }]);

  let kb = { inline_keyboard: buttons };

  try {
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" });
    } else {
      await ctx.reply(msg, { reply_markup: kb, parse_mode: "HTML" });
    }
  } catch (htmlErr) {
    let plainMsg = `${welcomeText}\n\n🔵 Wallet ID ➝ ${userId}\n🧾 Balance ➝ ₹${user.balance.toFixed(2)}\n\n${footerText}`;
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(plainMsg, { reply_markup: kb }).catch(() => { });
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

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `${val}` : `Not Set`;

  let upiWs = await WithdrawSettings.findOne({ method: "upi" }).lean();
  let bankWs = await WithdrawSettings.findOne({ method: "bank" }).lean();

  let showUPI = upiWs ? upiWs.isActive : false;
  let showBank = bankWs ? bankWs.isActive : false;

  let msg = `<b>${toSmallCaps("Payout Method")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (showUPI) msg += `${toSmallCaps("UPI")}: ${fmt(user.upiId)}\n\n`;
  msg += `${toSmallCaps("Set Wallet")}: ${fmt(user.walletNumber)}\n\n`;
  if (showBank) msg += `${toSmallCaps("Bank")}: ${(user.bankAccNo !== "Not Set") ? `${user.bankAccNo} (${user.bankIfsc})` : "Not Set"}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard();
  if (showUPI) kb.text(makeBtn("Set UPI"), "set_upi").row();
  kb.text(makeBtn("Set Wallet"), "set_wallet_number").row();
  if (showBank) kb.text(makeBtn("Set Bank"), "set_bank").row();
  kb.text(makeBtn("Back"), "back_to_balance");

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(msg, { reply_markup: kb, parse_mode: "HTML" });
  }
}

// ============================================================
// 🚀 WITHDRAW MENU BUILDER (Dynamic)
// ============================================================
async function buildWithdrawMenu() {
  let buttons = [];
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  // Active Gateways
  let gateways = await Gateway.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  for (let gw of gateways) {
    buttons.push([{ text: makeBtn(gw.name.toUpperCase()), callback_data: `wd_gw_${gw.name}` }]);
  }

  // Manual Methods (only active)
  let methods = ["upi", "bank", "amazon", "redeem"];
  for (let m of methods) {
    let s = await WithdrawSettings.findOne({ method: m }).lean();
    let toggles = await getConfig("withdraw_toggles", {
      wallet: true, upi: true, bank: true, amazon: true, redeem: true
    });
    let isEnabled = toggles[m] !== false;
    if (s && s.isActive && isEnabled) {
      buttons.push([{ text: makeBtn(m.toUpperCase()), callback_data: `wd_${m}` }]);
    }
  }

  return buttons;
}

// ============================================================
// ✅ END OF MESSAGE 12
// ============================================================

console.log("✅ index.js — Message 12 of 18 loaded");
// ============================================================
// 💬 BOT — MESSAGE TEXT HANDLER (User States)
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  if (state) {
    // ❌ Cancel
    if (text === `${toSmallCaps("Cancel")}` || text === "❌ Cancel") {
      delete userState[userId];
      await ctx.reply(`${toSmallCaps("Cancelled")}`, {
        reply_markup: await buildKeyboardFromLayout(userId),
        parse_mode: "HTML"
      });
      return;
    }

    // ---------- Set Wallet Number (Single Global) ----------
    if (state === "SET_WALLET_NUMBER") {
      delete userState[userId];
      let number = text.trim();
      if (!number || number.length < 5 || !/^[0-9+\-\s]+$/.test(number)) {
        return ctx.reply(`❌ ${toSmallCaps("Invalid number! Send digits only.")}`, {
          reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back")
        });
      }
      let user = await getUser(userId);
      user.walletNumber = number;
      await user.save();
      await ctx.reply(
        `${toSmallCaps("Your Wallet Added Successfully")}\n\n${toSmallCaps("Wallet ID")}: <code>${number}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
      );
      return;
    }

    // ---------- Set UPI ----------
    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) {
        return ctx.reply(`❌ ${toSmallCaps("Invalid UPI! Include @")}`, {
          reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back")
        });
      }
      await User.findOneAndUpdate({ userId }, { upiId: upi });
      await ctx.reply(
        `${toSmallCaps("Your UPI Added Successfully")}\n\n${toSmallCaps("UPI")}: <code>${upi}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
      );
      return;
    }

    // ---------- Set Bank (Account No → IFSC) ----------
    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 ${toSmallCaps("Send Your IFSC Code")}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back")
      });
    }
    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: ifsc });
      await ctx.reply(
        `${toSmallCaps("Your Bank Added Successfully")}\n\n${toSmallCaps("Bank")}: <code>${accNo} (${ifsc})</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
      );
      return;
    }

    // ---------- Gateway Number ----------
    if (state.startsWith("GW_NUMBER_")) {
      let gwName = state.replace("GW_NUMBER_", "");
      let number = text.trim();
      if (!number || number.length < 5) {
        return ctx.reply(`❌ ${toSmallCaps("Invalid number! Try again.")}`);
      }
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) {
        delete userState[userId];
        return ctx.reply(`❌ ${toSmallCaps("Gateway not found.")}`);
      }
      let user = await getUser(userId);
      user.walletNumber = number;
      await user.save();

      userState[userId] = `GW_AMOUNT_${gwName}`;
      return ctx.reply(
        `${toSmallCaps("Enter Withdraw Amount")}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "wd_cancel")
        }
      );
    }

    // ---------- Gateway Amount ----------
    if (state.startsWith("GW_AMOUNT_")) {
      let gwName = state.replace("GW_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`);

      let user = await getUser(userId);
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) return ctx.reply(`❌ ${toSmallCaps("Gateway not found.")}`);

      let minW = gateway.minAmount || 0;
      let maxW = gateway.maxAmount || 0;
      if (minW > 0 && amount < minW) return ctx.reply(`❌ ${toSmallCaps("Minimum")}: ₹${minW}`);
      if (maxW > 0 && amount > maxW) return ctx.reply(`❌ ${toSmallCaps("Maximum")}: ₹${maxW}`);
      if (user.balance < amount) {
        return ctx.reply(`❌ ${toSmallCaps("Insufficient balance!")} ${toSmallCaps("Your Balance")}: ₹${user.balance.toFixed(2)}`);
      }

      let wallet = user.walletNumber || "";
      if (!wallet) return ctx.reply(`❌ ${toSmallCaps("Number not saved!")}`);

      let taxPercent = gateway.taxPercent || 0;
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) {
        taxAmount = (amount * taxPercent) / 100;
        receiveAmount = amount - taxAmount;
      }

      let bodyText = `${toSmallCaps("Amount")}: <code>${amount}</code> INR\n` +
        `${toSmallCaps("You receive")}: <code>${receiveAmount.toFixed(2)}</code> INR (Tax: ₹${taxAmount.toFixed(2)})\n\n` +
        `${gwName} ${toSmallCaps("Wallet")}: <code>${wallet}</code>`;

      let confirmMsg = `<b>${toSmallCaps("Withdrawal Confirmation")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Confirm your transaction by clicking Confirm")}`;

      userState[userId] = `GW_CONFIRM_${gwName}_${amount}`;
      return ctx.reply(confirmMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(makeBtn("Confirm ✅"), `gw_conf_yes_${gwName}_${amount}`)
          .row()
          .text(makeBtn("Cancel ❌"), `gw_conf_no`)
      });
    }

    // ---------- Manual Amount (UPI/BANK/AMAZON/REDEEM) ----------
    if (state.startsWith("MANUAL_AMOUNT_")) {
      let method = state.replace("MANUAL_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`);

      let user = await getUser(userId);
      let details = "";
      if (method === "upi") details = user.upiId;
      else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
      else if (method === "amazon") details = user.amazonEmail;
      else if (method === "redeem") details = user.redeemCodeAddr;

      if (!details || details === "Not Set" || details.includes("Not Set")) {
        return ctx.reply(`❌ ${method.toUpperCase()} ${toSmallCaps("not linked! Please add it first.")}`);
      }

      let ws = await WithdrawSettings.findOne({ method }).lean();
      let minW = ws ? ws.minAmount : 0;
      let maxW = ws ? ws.maxAmount : 0;
      if (minW > 0 && amount < minW) return ctx.reply(`❌ ${toSmallCaps("Minimum")}: ₹${minW}`);
      if (maxW > 0 && amount > maxW) return ctx.reply(`❌ ${toSmallCaps("Maximum")}: ₹${maxW}`);
      if (user.balance < amount) {
        return ctx.reply(`❌ ${toSmallCaps("Insufficient balance!")} ${toSmallCaps("Your Balance")}: ₹${user.balance.toFixed(2)}`);
      }

      let taxPercent = ws ? ws.taxPercent : 0;
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) {
        taxAmount = (amount * taxPercent) / 100;
        receiveAmount = amount - taxAmount;
      }

      let methodIcon = method === "upi" ? "⚡" : (method === "bank" ? "🏦" : (method === "amazon" ? "📧" : "🎁"));
      let methodLabel = method.toUpperCase();

      let bodyText = `${toSmallCaps("Amount")}: <code>${amount}</code> INR\n` +
        `${toSmallCaps("You receive")}: <code>${receiveAmount.toFixed(2)}</code> INR (Tax: ₹${taxAmount.toFixed(2)})\n\n` +
        `${methodIcon} ${methodLabel}: <code>${details}</code>`;

      let confirmMsg = `<b>${toSmallCaps("Withdrawal Confirmation")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Confirm your transaction by clicking Confirm")}`;

      userState[userId] = `MANUAL_CONFIRM_${method}_${amount}`;
      return ctx.reply(confirmMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(makeBtn("Confirm ✅"), `man_conf_yes_${method}_${amount}`)
          .row()
          .text(makeBtn("Cancel ❌"), `man_conf_no`)
      });
    }

    // ---------- UPI Deposit Amount ----------
    if (state === "UPI_WAIT_AMOUNT") {
      delete userState[userId];
      let amt = parseFloat(text);
      let minAmt = await getConfig("auto_upi_min", 5);
      let maxAmt = await getConfig("auto_upi_max", 200);
      if (isNaN(amt) || amt < minAmt || amt > maxAmt) {
        return ctx.reply(`❌ ${toSmallCaps(`Amount must be between ₹${minAmt} and ₹${maxAmt}`)}`, { parse_mode: "HTML" });
      }
      let upiId = await getConfig("auto_upi_id", "payzy@upi");
      let orderId = generateOrderId();
      await UPIPayment.create({ orderId, userId, amount: amt, upiId, status: "Pending", source: "bot" });
      userState[userId] = `UPI_WAIT_UTR_${orderId}_${amt}`;
      const styledEnter = toSmallCaps("After Payment, Send UTR:");
      const styledTap = toSmallCaps("(Tap UPI to copy)");
      const styledPhoto = toSmallCaps("Also Send Screenshot:");
      return ctx.reply(
        `✅ ${toSmallCaps("Amount Set")}: ₹${amt}\n\n📱 ${toSmallCaps("Pay to UPI")}: \`${upiId}\`\n${styledTap}\n\n🔐 ${styledEnter}\n📸 ${styledPhoto}\n\n🆔 ${toSmallCaps("Order")}: \`${orderId}\`\n\n💡 ${toSmallCaps("Send photo with UTR in caption")}`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text(makeBtn("Cancel ❌"), "add_fund_cancel") }
      );
    }

    // ---------- Withdraw Add Methods ----------
    if (state === "WD_ADD_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply(`❌ ${toSmallCaps("Invalid UPI format!")}`);
      let user = await getUser(userId);
      user.upiId = upi;
      await user.save();
      return ctx.reply(
        `${toSmallCaps("UPI Saved!")}\n\n📌 <code>${upi}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") }
      );
    }
    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(
        `✅ ${toSmallCaps("Account")}: <code>${text.trim()}</code>\n\n📝 ${toSmallCaps("Send IFSC Code")}:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "back_to_withdraw") }
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
        `${toSmallCaps("Bank Saved!")}\n\n🏦 <code>${accNo}</code>\n🔢 <code>${ifsc}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") }
      );
    }

    // ---------- Quick Pay (single user) ----------
    if (state === "QP_WAIT_USERID") {
      let target = text.trim();
      let receiver = null;

      if (/^\d+$/.test(target)) {
        receiver = await User.findOne({ userId: parseInt(target, 10) });
      } else if (target.startsWith("@")) {
        let clean = target.replace(/^@/, '').toLowerCase();
        receiver = await User.findOne({ username: { $regex: new RegExp("^" + clean + "$", "i") } });
      }

      if (!receiver) {
        return ctx.reply(`❌ ${toSmallCaps("User not found! Send valid User ID or @username")}`);
      }
      if (receiver.userId === userId) return ctx.reply("❌ Cannot send to yourself!");

      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { receiverId: receiver.userId };
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
      if (sender.balance < amt) return ctx.reply(`❌ Insufficient! Balance: ₹${sender.balance.toFixed(2)}`);
      let cacheObj = global.quickPayCache?.[userId];
      if (!cacheObj) return ctx.reply("❌ Session expired!");
      let receiver = await User.findOne({ userId: cacheObj.receiverId });
      if (!receiver) return ctx.reply("❌ Receiver not found!");

      userState[userId] = `QP_CONFIRM_${cacheObj.receiverId}_${amt}`;

      return ctx.reply(
        `⚠️ *Confirm Payment*\n\n👤 To: ${receiver.firstName || "User"}\n🆔 \`${receiver.userId}\`\n💰 Amount: ₹${amt}\n\n💵 Balance: ₹${sender.balance.toFixed(2)}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("✅ Confirm", "qp_confirm")
            .text("❌ Cancel", "qp_cancel")
        }
      );
    }

    // ---------- Quick Pay Multiple ----------
    if (state === "QP_WAIT_INPUT") {
      delete userState[userId];
      let lines = text.trim().split("\n").map(l => l.trim()).filter(l => l !== "");
      if (lines.length === 0) return ctx.reply(`${toSmallCaps("No data provided!")}`);
      if (lines.length > 20) return ctx.reply(`${toSmallCaps("Maximum 20 payments at once!")}`);

      let parsed = [];
      let errors = [];

      for (let line of lines) {
        let parts = line.split(/\s+/);
        if (parts.length < 2) { errors.push(`${line} (invalid)`); continue; }
        let userInput = parts[0].trim();
        let amt = parseFloat(parts[parts.length - 1]);
        if (isNaN(amt) || amt <= 0) { errors.push(`${line} (invalid amount)`); continue; }

        let receiver = null;
        if (/^\d+$/.test(userInput)) {
          receiver = await User.findOne({ userId: parseInt(userInput, 10) }).lean();
        } else if (userInput.startsWith("@")) {
          let cleanUsername = userInput.replace(/^@/, '').toLowerCase();
          receiver = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }).lean();
        }
        if (!receiver) { errors.push(`${userInput} (not found)`); continue; }
        if (receiver.userId === userId) { errors.push(`${userInput} (cannot pay yourself)`); continue; }

        parsed.push({ receiver, amount: amt });
      }

      if (errors.length > 0) {
        return ctx.reply(
          `<b>${toSmallCaps("Errors")}</b>\n\n<blockquote>${errors.join("\n")}</blockquote>`,
          { parse_mode: "HTML" }
        );
      }
      if (parsed.length === 0) return ctx.reply(`${toSmallCaps("No valid payments!")}`);

      let totalAmount = parsed.reduce((sum, p) => sum + p.amount, 0);
      let sender = await getUser(userId);
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser && sender.balance < totalAmount) {
        return ctx.reply(
          `<b>${toSmallCaps("Insufficient Balance!")}</b>\n\n<blockquote>${toSmallCaps("Your")}: ₹${sender.balance.toFixed(2)}\n${toSmallCaps("Required")}: ₹${totalAmount.toFixed(2)}</blockquote>`,
          { parse_mode: "HTML" }
        );
      }

      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { payments: parsed };

      let bodyText = "";
      parsed.forEach((p, i) => {
        bodyText += `${i + 1}. ${p.receiver.firstName || "User"}\n`;
        bodyText += `${toSmallCaps("User ID")}: ${p.receiver.userId}\n`;
        bodyText += `${toSmallCaps("Username")}: ${p.receiver.username ? "@" + p.receiver.username : "None"}\n`;
        bodyText += `${toSmallCaps("Amount")}: ₹${p.amount}\n\n`;
      });
      bodyText += `${toSmallCaps("Total Users")}: ${parsed.length}\n`;
      bodyText += `${toSmallCaps("Total Amount")}: ₹${totalAmount.toFixed(2)}\n`;
      bodyText += `${toSmallCaps("Your Balance")}: ₹${sender.balance.toFixed(2)}\n`;
      bodyText += `${toSmallCaps("After")}: ₹${(sender.balance - totalAmount).toFixed(2)}`;

      userState[userId] = `QP_CONFIRM_MULTI`;
      return ctx.reply(
        `<b>${toSmallCaps("Confirm Payment")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(makeBtn("Confirm ✅"), "qp_confirm_multi")
            .row()
            .text(makeBtn("Cancel ❌"), "qp_cancel")
        }
      );
    }

    // ---------- Quick Pay Amount (single via picker) ----------
    if (state.startsWith("QP_AMOUNT_")) {
      let targetId = parseInt(state.replace("QP_AMOUNT_", ""), 10);
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`);

      let target = await User.findOne({ userId: targetId }).lean();
      if (!target) return ctx.reply(`❌ ${toSmallCaps("User not found")}`);
      let sender = await getUser(userId);
      if (sender.balance < amount) return ctx.reply(`❌ ${toSmallCaps("Insufficient!")} ₹${sender.balance.toFixed(2)}`);

      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { payments: [{ receiver: target, amount }] };

      let bodyText =
        `${toSmallCaps("To")}: ${target.firstName || "User"}\n` +
        `${toSmallCaps("User ID")}: ${target.userId}\n` +
        `${toSmallCaps("Username")}: ${target.username ? "@" + target.username : "None"}\n` +
        `${toSmallCaps("Amount")}: ₹${amount}\n\n` +
        `${toSmallCaps("Your Balance")}: ₹${sender.balance.toFixed(2)}\n` +
        `${toSmallCaps("After")}: ₹${(sender.balance - amount).toFixed(2)}`;

      userState[userId] = "QP_CONFIRM_MULTI";
      return ctx.reply(
        `<b>${toSmallCaps("Confirm Payment")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(makeBtn("Confirm ✅"), "qp_confirm_multi")
            .row()
            .text(makeBtn("Cancel ❌"), "qp_cancel")
        }
      );
    }

    // ---------- Gift Code Redeem ----------
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOneAndUpdate(
        { code: text.toUpperCase(), type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
        { $push: { usedUsers: userId } },
        { new: true }
      );
      if (!gift) return ctx.reply(`🚫 ${toSmallCaps("Invalid or expired!")}`);
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 ${toSmallCaps("Gift redeemed!")} ${toSmallCaps("Added")} ₹${gift.amount}.`);
    }

    // ---------- USET Text Handlers ----------
    if (state === "USET_WAIT_WALLET") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletNumber: text.trim() });
      return ctx.reply(`✅ ${toSmallCaps("Wallet saved")}: <code>${text.trim()}</code>`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "USET_WAIT_UPI") {
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ ${toSmallCaps("UPI saved")}: <code>${text.trim()}</code>`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
    }
    if (state === "USET_WAIT_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `USET_WAIT_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 ${toSmallCaps("Send IFSC Code")}:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "uset_edit_payment") });
    }
    if (state.startsWith("USET_WAIT_BANK_IFSC_")) {
      let accNo = state.replace("USET_WAIT_BANK_IFSC_", "");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: text.trim().toUpperCase() });
      return ctx.reply(`✅ ${toSmallCaps("Bank saved!")}`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
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
      if (!task) return ctx.reply(`❌ ${toSmallCaps("Task not found")}`);
      if (task.completedUsers.includes(userId)) return ctx.reply(`❌ ${toSmallCaps("Already completed!")}`);
      if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
        return ctx.reply(`❌ ${toSmallCaps("Task expired!")}`);
      }

      let referValue = text.trim();
      let isValid = false;
      if (referValue.startsWith("http") || referValue.startsWith("t.me/") || /^\d{10}$/.test(referValue) || referValue.startsWith("@")) {
        isValid = true;
      }
      if (!isValid) {
        return ctx.reply(
          `❌ ${toSmallCaps("Invalid format!")}\n\n${toSmallCaps("Send")}:\n• Link\n• 10-digit number\n• @username`,
          { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "canc_task") }
        );
      }

      let submissionId = generateSubmissionId();
      let user = await getUser(userId);

      await TaskSubmission.create({
        submissionId, userId, userName: user.firstName || "User",
        taskId: task.taskId, taskTitle: task.title,
        reward: task.reward, photoFileId: `REFER: ${referValue}`, status: "Pending"
      });

      let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
        ? task.alertChannel
        : await getConfig("default_task_alert_channel", "Not Set");

      if (alertChannel && alertChannel !== "Not Set") {
        let forwardedMsgId = null;
        try {
          let fwd = await ctx.api.forwardMessage(alertChannel, ctx.chat.id, ctx.message.message_id);
          forwardedMsgId = fwd.message_id;
        } catch (e) { }

        let userLink = `<a href="tg://user?id=${userId}">${user.firstName || "User"} (${userId})</a>`;
        let caption = `<b>NEW TASK SUBMISSION</b>\n\n` +
          `User: ${userLink}\n` +
          `Task: ${task.title}\n` +
          `Reward: ₹${task.reward}\n` +
          `Link: ${task.link}\n` +
          `Type: Refer`;

        let kb = new InlineKeyboard()
          .text("Approve ✅", `task_app_${submissionId}`)
          .text("Reject ❌", `task_rej_${submissionId}`);

        let sendOpts = { parse_mode: "HTML", reply_markup: kb };
        if (forwardedMsgId) sendOpts.reply_parameters = { message_id: forwardedMsgId };

        try { await ctx.api.sendMessage(alertChannel, caption, sendOpts); } catch (e) { }
      }

      return ctx.reply(
        `${toSmallCaps("Task Submitted!")}\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}\n\n${toSmallCaps("Wait for admin approval.")}`,
        { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) }
      );
    }

    // ---------- UPI UTR Input ----------
    if (state.startsWith("UPI_WAIT_UTR_")) {
      let parts = state.replace("UPI_WAIT_UTR_", "").split("_");
      let orderId = parts[0];
      let amount = parseFloat(parts[1]);
      let utr = text.trim();

      if (!/^\d{10,25}$/.test(utr)) {
        return ctx.reply(`❌ ${toSmallCaps("Invalid UTR! Send 10-25 digits")}`, { parse_mode: "HTML" });
      }

      delete userState[userId];

      let payment = await UPIPayment.findOne({ orderId });
      if (!payment) return ctx.reply(`❌ ${toSmallCaps("Order not found")}`);

      payment.utr = utr;
      await payment.save();

      let addFundChannel = await getAddFundChannel();
      if (addFundChannel && addFundChannel !== "Not Set") {
        let user = await getUser(userId);
        let kb = new InlineKeyboard()
          .text("Approve ✅", `upi_app_${orderId}`)
          .text("Reject ❌", `upi_rej_${orderId}`);
        try {
          await bot.api.sendMessage(addFundChannel,
            `💰 <b>UPI Deposit Request</b>\n\n` +
            `<b>👤 User:</b> ${user.firstName || "User"}\n` +
            `<b>🆔 ID:</b> <code>${userId}</code>\n` +
            `<b>💵 Amount:</b> ₹${amount}\n` +
            `<b>🔐 UTR:</b> <code>${utr}</code>\n` +
            `<b>🆔 Order:</b> <code>${orderId}</code>`,
            { parse_mode: "HTML", reply_markup: kb });
        } catch (e) { }
      }

      return ctx.reply(
        `⏳ *Deposit Pending*\n\n💰 Amount: ₹${amount}\n🔐 UTR: \`${utr}\`\n\n🕐 Admin will verify shortly.`,
        { parse_mode: "Markdown" }
      );
    }
  }

  // ============================================================
  // 🔀 BUTTON ROUTING
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

  // 💸 Balance
  if (matchedKey === "btn_balance" || /balance/i.test(text)) {
    try { await sendBalancePage(ctx, false); } catch (err) { return ctx.reply(`❌ Error: ${err.message}`); }
  }
  // 📋 Tasks
  else if (matchedKey === "btn_tasks" || /task/i.test(text)) {
    try {
      let tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).sort({ createdAt: -1 }).lean();
      if (!tasks || tasks.length === 0) return ctx.reply(`${toSmallCaps("No tasks available.")}`, { parse_mode: "HTML" });
      let taskButtons = [];
      tasks.forEach(t => taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]));
      return ctx.reply(`<b>${toSmallCaps("Available Tasks")}</b>`, { reply_markup: await buildStyledKb(taskButtons), parse_mode: "HTML" });
    } catch (e) { return ctx.reply(`❌ ${toSmallCaps("Error loading tasks.")}`, { parse_mode: "HTML" }); }
  }
  // 🎁 Gift
  else if (matchedKey === "btn_gift" || /gift/i.test(text)) {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply(`🎁 ${toSmallCaps("Gift Code")}\n\n${toSmallCaps("Send Gift Code To Claim Reward!")}`, { parse_mode: "HTML" });
  }
  // ⚡ Quick Pay
  else if (matchedKey === "btn_quickpay" || /quick.*pay/i.test(text)) {
    let title = `💡${toSmallCaps("Quick Pay To a Simple User Payment Send")}`;
    let bodyText =
      `${toSmallCaps("You Can Also Use The Format Below To Process Payments For One or Multiple Users:")}\n\n` +
      `${toSmallCaps("Format")} :\n` +
      `UserID 1     @username 1\n` +
      `1234567890 5     @myfriend 5`;
    let qpText = `${title}\n\n<blockquote>${bodyText}</blockquote>`;

    userState[userId] = "QP_WAIT_INPUT";

    let kb = new Keyboard()
      .requestUsers(`${toSmallCaps("Select User")}`, 1, { user_is_bot: false, request_name: true, request_username: true })
      .resized().oneTime();

    return ctx.reply(qpText, { parse_mode: "HTML", reply_markup: kb });
  }
  // 💳 Payment Method
  else if (matchedKey === "btn_payout" || /payment.*method/i.test(text)) {
    return sendPayoutMethodPage(ctx, false);
  }
  // 🚀 Withdraw
  else if (matchedKey === "btn_withdraw" || /withdraw/i.test(text)) {
    let withdrawEnabled = await getConfig("withdraw_enabled", true);
    if (!withdrawEnabled) {
      if (!isAdminUser) {
        return ctx.reply(`⚠️ ${toSmallCaps("Withdrawals are currently disabled")}`, { parse_mode: "HTML" });
      }
    }
    let buttons = await buildWithdrawMenu();
    if (buttons.length === 0) {
      return ctx.reply(`<b>${toSmallCaps("Choose Withdraw Method")}</b>\n\n❌ ${toSmallCaps("No withdraw methods available.")}`, { parse_mode: "HTML" });
    }
    return ctx.reply(`<b>${toSmallCaps("Choose Withdraw Method")}</b>`, {
      reply_markup: await buildStyledKb(buttons), parse_mode: "HTML"
    });
  }
  // Fallback — Gift code
  else {
    let gift = await GiftCode.findOneAndUpdate(
      { code: text.toUpperCase(), type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
      { $push: { usedUsers: userId } },
      { new: true }
    );
    if (gift) {
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 ${toSmallCaps("Added")} ₹${gift.amount}!`);
    }
    return next();
  }
});

// ============================================================
// 📸 PHOTO HANDLER (Task + Broadcast)
// ============================================================
bot.on("message:photo", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state) return next();

  // ---------- Task Photo ----------
  if (state.startsWith("WAITING_TASK_PHOTO_")) {
    let taskId = state.replace("WAITING_TASK_PHOTO_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply(`${toSmallCaps("Task not found!")}`, { parse_mode: "HTML" }); }
    if (task.completedUsers.includes(userId)) { delete userState[userId]; return ctx.reply(`${toSmallCaps("Already completed!")}`, { parse_mode: "HTML" }); }

    if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
      delete userState[userId];
      return ctx.reply(`${toSmallCaps("Task expired!")}`, { parse_mode: "HTML" });
    }

    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let submissionId = generateSubmissionId();

    await TaskSubmission.create({
      submissionId, userId,
      userName: ctx.from.first_name || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: photo.file_id, status: "Pending"
    });
    delete userState[userId];

    await ctx.reply(
      `${toSmallCaps("Task Submitted!")}\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}\n\n🕐 ${toSmallCaps("Wait for admin approval.")}`,
      { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) }
    );

    let alertChannel = task.alertChannel && task.alertChannel !== "Not Set"
      ? task.alertChannel
      : await getConfig("default_task_alert_channel", "Not Set");

    if (alertChannel && alertChannel !== "Not Set") {
      let userLink = `<a href="tg://user?id=${userId}">${ctx.from.first_name || "User"} (${userId})</a>`;
      let caption = `<b>NEW TASK SUBMISSION</b>\n\n` +
        `User: ${userLink}\n` +
        `Task: ${task.title}\n` +
        `Reward: ₹${task.reward}\n` +
        `Link: ${task.link}\n` +
        `Type: Screenshot`;
      let kb = new InlineKeyboard().text("Approve ✅", `task_app_${submissionId}`).text("Reject ❌", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "HTML", reply_markup: kb }); } catch (e) { }
    }
    return;
  }

  return next();
});

// ============================================================
// ✅ END OF MESSAGE 13
// ============================================================

console.log("✅ index.js — Message 13 of 18 loaded");
// ============================================================
// 🎯 BOT CALLBACKS — User Side
// ============================================================

// ---------- Balance Callbacks ----------
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Refreshed!" }).catch(() => { });
  try { await sendBalancePage(ctx, true); } catch (e) { }
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => { });
  try { await sendBalancePage(ctx, true); } catch (e) { }
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery().catch(() => { });
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
  let user = await getUser(userId);

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText = `${toSmallCaps("Balance Statement")}\n\n` +
    `${toSmallCaps("Wallet ID")}: ${userId}\n` +
    `${toSmallCaps("Balance")}: ₹${user.balance.toFixed(2)}\n\n`;

  if (history.length === 0) {
    bodyText += `📭 ${toSmallCaps("No transactions.")}`;
  } else {
    let totalIn = 0, totalOut = 0;
    history.forEach((h) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      let dateStr = formatDateTime(h.createdAt);
      bodyText += `${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)} • ${dateStr}\n\n`;
      if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount);
    });
    bodyText += `━━━━━━━━━━━━━━━━━━━━\n`;
    bodyText += `🟢 ${toSmallCaps("Earned")}: ₹${totalIn.toFixed(2)}\n`;
    bodyText += `🔴 ${toSmallCaps("Spent")}: ₹${totalOut.toFixed(2)}`;
  }

  let text = `<b>${toSmallCaps("Balance Statement")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Refresh"), "balance_statement").row()
    .text(makeBtn("Back"), "back_to_balance");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("noop", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Support not set yet", show_alert: false }).catch(() => { });
});

// ---------- User Settings ----------
bot.callbackQuery("user_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let text = `<b>${toSmallCaps("Settings")}</b>\n\n<blockquote>${toSmallCaps("Customize your bot. Your changes affect only your view.")}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Reply Keyboard"), "uset_reply_kb").row()
    .text(makeBtn("Inline Buttons"), "uset_inline_kb").row()
    .text(makeBtn("Edit Payment Method"), "uset_edit_payment").row()
    .text(makeBtn("Reset to Default"), "uset_reset").row()
    .text(makeBtn("Back"), "back_to_balance");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("uset_edit_payment", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let user = await getUser(userId);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText = `${toSmallCaps("Wallet")}: ${user.walletNumber || "Not Set"}\n` +
    `${toSmallCaps("UPI")}: ${user.upiId || "Not Set"}\n` +
    `${toSmallCaps("Bank")}: ${user.bankAccNo || "Not Set"}`;

  let text = `<b>${toSmallCaps("Your Payment Methods")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Edit Wallet"), "uset_edit_wallet").row()
    .text(makeBtn("Edit UPI"), "uset_edit_upi").row()
    .text(makeBtn("Edit Bank"), "uset_edit_bank").row()
    .text(makeBtn("Back"), "user_settings");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("uset_edit_wallet", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_WALLET";
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>${toSmallCaps("Edit Wallet")}</b>\n\n${toSmallCaps("Send your wallet number:")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "uset_edit_payment")
  }).catch(() => { });
});

bot.callbackQuery("uset_edit_upi", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_UPI";
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>${toSmallCaps("Edit UPI")}</b>\n\n${toSmallCaps("Send your UPI ID:")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "uset_edit_payment")
  }).catch(() => { });
});

bot.callbackQuery("uset_edit_bank", async (ctx) => {
  userState[ctx.from.id] = "USET_WAIT_BANK_ACCNO";
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>${toSmallCaps("Edit Bank")}</b>\n\n${toSmallCaps("Send Account Number:")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "uset_edit_payment")
  }).catch(() => { });
});

// ---------- User Keyboard Customizer ----------
bot.callbackQuery("uset_reply_kb", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText = "";
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowButtons = layout.filter(b => b.row === r);
    if (rowButtons.length > 0) bodyText += `Row ${r}: ${rowButtons.map(b => b.name).join(" | ")}\n`;
  }
  bodyText += `\n👇 ${toSmallCaps("Click to edit")}:`;

  let text = `<b>${toSmallCaps("Reply Keyboard")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard();
  for (let i = 0; i < layout.length; i++) kb.text(layout[i].name, `uset_kb_edit_${i}`).row();
  kb.text(makeBtn("Reset"), "uset_reset_kb").row().text(makeBtn("Back"), "user_settings");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^uset_kb_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_edit_", ""), 10);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  if (idx < 0 || idx >= layout.length) return;
  let btn = layout[idx];

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let text = `<b>${toSmallCaps("Edit")}: ${btn.name}</b>\n\n` +
    `<blockquote>${toSmallCaps("Current")}: ${btn.name}\n${toSmallCaps("Row")}: ${btn.row}</blockquote>\n\n${toSmallCaps("Choose action")}:`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Rename"), `uset_kb_rename_${idx}`).row()
    .text(makeBtn("Up"), `uset_kb_up_${idx}`).text(makeBtn("Down"), `uset_kb_down_${idx}`).row()
    .text(makeBtn("Left"), `uset_kb_left_${idx}`).text(makeBtn("Right"), `uset_kb_right_${idx}`).row()
    .text(makeBtn("Remove"), `uset_kb_del_${idx}`).row()
    .text(makeBtn("Back"), "uset_reply_kb");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^uset_kb_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let idx = parseInt(ctx.callbackQuery.data.replace("uset_kb_rename_", ""), 10);
  userState[userId] = `USET_WAIT_KB_RENAME_${idx}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new name")}:`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "uset_reply_kb")
  }).catch(() => { });
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
  ctx.answerCallbackQuery({ text: "Removed!" });
  await rerender(ctx, "uset_reply_kb");
});

bot.callbackQuery("uset_reset_kb", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Reset!" });
  let userId = ctx.from.id;
  await UserPreference.updateOne({ userId }, { $unset: { keyboardLayout: "" } });
  await rerender(ctx, "uset_reply_kb");
});

// ---------- Inline Style Customizer ----------
bot.callbackQuery("uset_inline_kb", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `<b>${toSmallCaps("Inline Buttons")}</b>\n\n${toSmallCaps("Choose menu to customize")}:`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Balance Menu"), "uset_inline_balance").row()
    .text(makeBtn("Withdraw Menu"), "uset_inline_withdraw").row()
    .text(makeBtn("Payment Menu"), "uset_inline_payment").row()
    .text(makeBtn("Back"), "user_settings");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("uset_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Reset to Default?")}</b>\n\n${toSmallCaps("This will remove all your customizations.")}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(makeBtn("Yes, Reset"), "uset_reset_confirm")
        .text(makeBtn("Cancel"), "user_settings")
    }
  ).catch(() => { });
});

bot.callbackQuery("uset_reset_confirm", async (ctx) => {
  let userId = ctx.from.id;
  await UserPreference.deleteOne({ userId });
  ctx.answerCallbackQuery({ text: "Reset!" });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Reset Complete!")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance")
  }).catch(() => { });
});

// ---------- Quick Pay Callbacks ----------
bot.callbackQuery("qp_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];
  ctx.answerCallbackQuery({ text: "Cancelled!" }).catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Cancelled")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance")
  }).catch(() => { });
});

bot.callbackQuery("qp_confirm", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state || !state.startsWith("QP_CONFIRM_")) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });

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
    `✅ *Payment Successful!*\n\n👤 To: ${receiver.firstName || "User"}\n💰 ₹${amount.toFixed(2)}\n\n💵 New Balance: ₹${sender.balance.toFixed(2)}`,
    { parse_mode: "Markdown" }
  ).catch(() => { });

  try {
    await ctx.api.sendMessage(receiver.userId,
      `🎉 *Payment Received!*\n\n👤 From: ${sender.firstName || "User"}\n💰 ₹${amount.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) { }
});

bot.callbackQuery("qp_confirm_multi", async (ctx) => {
  let userId = ctx.from.id;
  let cacheObj = global.quickPayCache?.[userId];
  if (!cacheObj || !cacheObj.payments || cacheObj.payments.length === 0) {
    return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  }

  let payments = cacheObj.payments;
  let totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  delete userState[userId];
  delete global.quickPayCache[userId];

  let sender = await getUser(userId);
  let isAdminUser = await isAdmin(userId);
  if (!isAdminUser && sender.balance < totalAmount) {
    return ctx.answerCallbackQuery({ text: "Insufficient!", show_alert: true });
  }

  await ctx.answerCallbackQuery({ text: "Processing..." });

  const taxEnabled = await getConfig("quick_pay_tax_enabled", false);
  const taxPercent = await getConfig("quick_pay_tax_percent", 0);
  let taxAmount = 0;
  if (taxEnabled && taxPercent > 0) taxAmount = (totalAmount * taxPercent) / 100;

  let wasNegative = sender.balance < totalAmount;
  let senderBefore = sender.balance;

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
      firstName: receiver.firstName || "User",
      amount: p.amount,
      before,
      after: receiver.balance
    });

    try {
      await ctx.api.sendMessage(receiver.userId,
        `<b>${toSmallCaps("Payment Received!")}</b>\n\n<blockquote>${toSmallCaps("From")}: ${isAdminUser ? "Admin" : (sender.firstName || "User")} (${sender.userId})\n${toSmallCaps("Amount")}: ₹${p.amount.toFixed(2)}\n${toSmallCaps("Balance")}: ₹${receiver.balance.toFixed(2)}</blockquote>`,
        { parse_mode: "HTML" }
      );
    } catch (e) { }
  }

  if (isAdminUser && wasNegative) {
    await logBalanceHistory(sender.userId, `Admin Add Fund - Quick Pay (${payments.length} payments)`, -totalAmount);
  } else if (isAdminUser) {
    await logBalanceHistory(sender.userId, `Admin Quick Pay (${payments.length} payments)`, -totalAmount);
  } else {
    await logBalanceHistory(sender.userId, `Quick Pay (${payments.length} payments)`, -totalAmount);
  }

  let bodyText = "";
  resultList.forEach((r, i) => {
    bodyText += `${i + 1}. ${r.firstName} (${r.userId})\n`;
    bodyText += `${toSmallCaps("Amount")}: ₹${r.amount}\n`;
    bodyText += `${toSmallCaps("Balance")}: ₹${r.after.toFixed(2)}\n\n`;
  });
  bodyText += `${toSmallCaps("Total Users")}: ${resultList.length}\n`;
  bodyText += `${toSmallCaps("Total Sent")}: ₹${totalAmount.toFixed(2)}\n`;
  bodyText += `${toSmallCaps("Your Balance")}: ₹${senderBefore.toFixed(2)} → ₹${sender.balance.toFixed(2)}`;

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  await ctx.editMessageText(
    `<b>${toSmallCaps("Payment Successful")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance")
    }
  ).catch(() => { });
});

// ---------- Gateway Withdraw Callbacks ----------
bot.callbackQuery(/^wd_gw_/, async (ctx) => {
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("wd_gw_", "");
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "Gateway not found", show_alert: true });

  let user = await getUser(userId);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  if (!user.walletNumber || user.walletNumber === "") {
    userState[userId] = `GW_NUMBER_${gwName}`;
    await ctx.answerCallbackQuery();
    return ctx.reply(
      `<b>${toSmallCaps("Enter Your Number")}</b>\n\n${toSmallCaps("Please enter your wallet number")}:`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "wd_cancel") }
    );
  }

  userState[userId] = `GW_AMOUNT_${gwName}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `<b>${toSmallCaps("Enter Withdraw Amount")}</b>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "wd_cancel") }
  );
});

bot.callbackQuery(/^gw_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let parts = ctx.callbackQuery.data.replace("gw_conf_yes_", "").split("_");
  let amount = parseFloat(parts.pop());
  let gwName = parts.join("_");

  let user = await getUser(userId);
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "Gateway not found", show_alert: true });
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "Insufficient balance!", show_alert: true });

  let wallet = user.walletNumber || "";
  if (!wallet) return ctx.answerCallbackQuery({ text: "Number not saved!", show_alert: true });

  delete userState[userId];
  await ctx.answerCallbackQuery({ text: "Processing..." });

  user.balance -= amount;
  if (user.balance < 0) user.balance = 0;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${gwName}`, -amount);

  const chatId = ctx.chat.id;
  const msgId = ctx.callbackQuery.message.message_id;

  const frames = [
    "⏳ Processing ⏳",
    "⏳ Processing ● ⏳",
    "⏳ Processing ●● ⏳",
    "⏳ Processing ●●● ⏳"
  ];

  let frameIdx = 0;
  await ctx.api.editMessageText(chatId, msgId, frames[0], { parse_mode: "HTML" }).catch(() => { });

  const animationInterval = setInterval(async () => {
    frameIdx = (frameIdx + 1) % frames.length;
    try {
      await ctx.api.editMessageText(chatId, msgId, frames[frameIdx], { parse_mode: "HTML" });
    } catch (e) { }
  }, 400);

  let payoutChannel = await getPayoutChannel("wallet");
  let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = generateWithdrawalId();

  let result = await processGatewayPayout({
    bot, userId, amount,
    gatewayInfo: gateway,
    wallet, channelList,
    showRemainingBalance: true
  });

  clearInterval(animationInterval);

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  if (result.status === 'success') {
    let txnNumber = result.txnNumber || generateTxnNumber();
    let processTime = new Date();
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount, amount,
      method: gwName, details: wallet, status: "Approved",
      isGateway: true, gateway: gateway.name, gatewayName: gateway.name,
      gatewayResponse: result.rawResponse || "",
      txnNumber, approvedBy: "Auto Gateway", approvedAt: processTime
    });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });

    const userMsg =
      `🎁Your Withdrawal of Rs.<code>${amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
      `🏦 Destination ==> <code>${wallet}</code>\n` +
      `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
      `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
      `✅Please Check Your ${gwName.toUpperCase()} Account!`;

    await ctx.api.editMessageText(chatId, msgId, userMsg, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl)
    }).catch(() => { });
  } else {
    user.balance += amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
    await user.save();
    await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);
    let processTime = new Date();
    let txnNumber = generateTxnNumber();
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount, amount,
      method: gwName, details: wallet, status: "Failed",
      isGateway: true, gateway: gateway.name, gatewayName: gateway.name,
      gatewayResponse: result.message || "Failed",
      approvedBy: "Auto Gateway", approvedAt: processTime
    });

    const failMsg =
      `❌Your Withdrawal of Rs.<code>${amount.toFixed(2)}</code> has been Failed!⚠️\n\n` +
      `🏦 Destination ==> <code>${wallet}</code>\n` +
      `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
      `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
      `📛 Reason: ${result.message || "Gateway declined"}\n` +
      `💵 Refunded: ₹${amount.toFixed(2)}\n` +
      `💵 Balance: ₹${user.balance.toFixed(2)}`;

    await ctx.api.editMessageText(chatId, msgId, failMsg, { parse_mode: "HTML" }).catch(() => { });
  }
});

bot.callbackQuery("gw_conf_no", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  let buttons = await buildWithdrawMenu();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  return ctx.editMessageText(
    `<b>${toSmallCaps("Choose Withdraw Method")}</b>`,
    { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" }
  ).catch(() => { });
});

// ---------- Manual Withdraw Callbacks ----------
bot.callbackQuery(/^wd_(upi|bank|amazon|redeem)$/, async (ctx) => {
  let userId = ctx.from.id;
  let method = ctx.callbackQuery.data.replace("wd_", "");
  let user = await getUser(userId);

  let ws = await WithdrawSettings.findOne({ method });
  if (ws && !ws.isActive) return ctx.answerCallbackQuery({ text: `${method} is OFF`, show_alert: true });

  let details = "";
  if (method === "upi") details = user.upiId;
  else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery({ text: `${method} not linked!`, show_alert: true });
    let kb = new InlineKeyboard()
      .text(makeBtn(`Add ${method.toUpperCase()} Now`), `wd_add_${method}_start`).row()
      .text(makeBtn("Back"), "back_to_withdraw");
    return ctx.reply(
      `❌ <b>${method.toUpperCase()} ${toSmallCaps("Not Linked!")}</b>\n\n${toSmallCaps("To withdraw via")} ${method}, ${toSmallCaps("you need to add it first.")}\n\n👇 ${toSmallCaps("Click below")}:`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }

  let minW = ws ? ws.minAmount : 0;
  if (minW > 0 && user.balance < minW) return ctx.answerCallbackQuery({ text: `Min ₹${minW}!`, show_alert: true });

  userState[userId] = `MANUAL_AMOUNT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `<b>${toSmallCaps("Enter Withdraw Amount")}</b>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "wd_cancel") }
  );
});

bot.callbackQuery(/^man_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let parts = ctx.callbackQuery.data.replace("man_conf_yes_", "").split("_");
  let amount = parseFloat(parts.pop());
  let method = parts.join("_");

  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "Insufficient balance!", show_alert: true });

  let details = "";
  if (method === "upi") details = user.upiId;
  else if (method === "bank") details = `${user.bankAccNo}, ${user.bankIfsc}`;
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;

  delete userState[userId];
  await ctx.answerCallbackQuery({ text: "Submitting..." });

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = generateWithdrawalId();
  let methodDisplay = method.toUpperCase();

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  await ctx.editMessageText(
    `<b>${toSmallCaps("Withdrawal Submitted!")}</b>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Amount")}: <code>₹${amount.toFixed(2)}</code>\n` +
    `${methodDisplay}: <code>${details}</code>\n` +
    `${toSmallCaps("Request")}: <code>(#${userWithdrawalCount})</code>\n` +
    `${toSmallCaps("Status")}: ⏳ ${toSmallCaps("Pending")}\n\n` +
    `🕐 ${toSmallCaps("Submitted")}: ${formatDateTime(new Date())}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "HTML" }
  ).catch(() => { });

  await Withdrawal.create({
    withdrawalId, userId, userWithdrawalCount, amount,
    method: methodDisplay, details, status: "Pending", isGateway: false
  });

  let payoutChannel = await getPayoutChannel(method);

  if (payoutChannel && payoutChannel !== "Not Set") {
    let adminKb = new InlineKeyboard()
      .text("Approve ✅", `wd_app_${withdrawalId}`)
      .text("Reject ❌", `wd_rej_${withdrawalId}`);
    const userLink = `<a href="tg://user?id=${userId}">${userId}</a>`;
    const hashTag = `<code>(#${userWithdrawalCount})</code>`;
    const methodIcon = method === "upi" ? "⚡" : method === "bank" ? "🏦" : method === "amazon" ? "📧" : "🎁";
    try {
      await ctx.api.sendMessage(payoutChannel,
        `⚠️ <b>New ${methodDisplay} Payout Request!</b> ${hashTag}\n\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `💰 <b>Request Amount:</b> <code>₹${amount}</code>\n` +
        `${methodIcon} <b>${methodDisplay}:</b> <code>${details}</code>\n\n` +
        `📊 <b>Status:</b> ⏳ Pending`,
        { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
    } catch (e) { }
  }
});

bot.callbackQuery("man_conf_no", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  let buttons = await buildWithdrawMenu();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  return ctx.editMessageText(
    `<b>${toSmallCaps("Choose Withdraw Method")}</b>`,
    { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("wd_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  let buttons = await buildWithdrawMenu();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  return ctx.reply(
    `<b>${toSmallCaps("Choose Withdraw Method")}</b>`,
    { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" }
  );
});

bot.callbackQuery("back_to_withdraw", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery().catch(() => { });
  let buttons = await buildWithdrawMenu();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  return ctx.editMessageText(
    `<b>${toSmallCaps("Choose Withdraw Method")}</b>`,
    { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("btn_payout_back", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  return sendPayoutMethodPage(ctx, true);
});

// ---------- Add Manual Method ----------
bot.callbackQuery("wd_add_upi_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "WD_ADD_UPI";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Add UPI")}</b>\n\n${toSmallCaps("Send your UPI ID")}:\n\n📌 ${toSmallCaps("Example")}: <code>yourname@upi</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") }
  ).catch(() => { });
});

bot.callbackQuery("wd_add_bank_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "WD_ADD_BANK_ACCNO";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Add Bank")}</b>\n\n${toSmallCaps("Send Account Number")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") }
  ).catch(() => { });
});

// ---------- Payment Method Setters ----------
bot.callbackQuery("set_wallet_number", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let cur = user.walletNumber && user.walletNumber !== "" ? user.walletNumber : "Not Set";
  userState[userId] = "SET_WALLET_NUMBER";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Set Wallet Number")}</b>\n\n${toSmallCaps("Current")}: <code>${cur}</code>\n\n${toSmallCaps("Send Your Wallet ID")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
  ).catch(() => { });
});

bot.callbackQuery("set_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "SET_UPI_ACC";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Send Your UPI Address")}</b>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
  ).catch(() => { });
});

bot.callbackQuery("set_bank", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "SET_BANK_ACCNO";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Send Your Bank Account Number")}</b>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }
  ).catch(() => { });
});

// ---------- Task Do / Approve / Reject ----------
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) {
    return ctx.answerCallbackQuery({ text: "You have already submitted this task!", show_alert: true });
  }

  if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
    await ctx.answerCallbackQuery({ text: "Task expired", show_alert: true });
    const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
    const makeBtn = (text) => `${pad}${text}${pad}`;
    return ctx.editMessageText(
      `<b>${toSmallCaps("Task Expired")}</b>\n\n${toSmallCaps("This task has expired.")}\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Expired")}: ${formatDateTime(task.expiresAt)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_tasks") }
    ).catch(() => { });
  }

  await ctx.answerCallbackQuery();

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText = `${toSmallCaps("Task Name")}: ${task.title}\n` +
    `${toSmallCaps("Reward")}: ₹${task.reward}\n` +
    `${toSmallCaps("Link")}: ${task.link}`;

  await ctx.editMessageText(
    `<b>${toSmallCaps("Task Details")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .url(`${toSmallCaps("Task Link")}`, task.link).row()
        .text(makeBtn(`${toSmallCaps("Upload Screenshot")}`), `task_upload_${taskId}`).row()
        .text(makeBtn(`${toSmallCaps("Send Refer Link / Number")}`), `task_refer_${taskId}`).row()
        .text(makeBtn("Back"), "back_to_tasks")
    }
  ).catch(() => { });
});

bot.callbackQuery("back_to_tasks", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).sort({ createdAt: -1 }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  if (!tasks || tasks.length === 0) {
    return ctx.editMessageText(`<b>${toSmallCaps("Available Tasks")}</b>\n\n${toSmallCaps("No tasks available.")}`, { parse_mode: "HTML" }).catch(() => { });
  }
  let taskButtons = [];
  tasks.forEach(t => taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]));
  taskButtons.push([{ text: makeBtn("Back"), callback_data: "back_to_balance" }]);
  return ctx.editMessageText(`<b>${toSmallCaps("Available Tasks")}</b>`, { reply_markup: await buildStyledKb(taskButtons), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("canc_task", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Cancelled")}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance")
  }).catch(() => { });
});

bot.callbackQuery(/^task_upload_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("task_upload_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "Already submitted!", show_alert: true });

  await ctx.answerCallbackQuery();
  userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Upload Screenshot")}</b>\n\n${toSmallCaps("Send your task completion screenshot")}:\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "canc_task") }
  ).catch(() => { });
});

bot.callbackQuery(/^task_refer_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("task_refer_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "Already submitted!", show_alert: true });

  await ctx.answerCallbackQuery();
  userState[userId] = `TASK_REFER_${taskId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Send Refer Link / Number")}</b>\n\n${toSmallCaps("Send refer link OR your 10-digit number")}:\n\n${toSmallCaps("Examples")}:\n• https://t.me/yourlink\n• 9876543210\n• (forwarded message)\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "canc_task") }
  ).catch(() => { });
});

// ---------- User Messages Shared (Quick Pay picker) ----------
bot.on("message:users_shared", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (state !== "QP_WAIT_INPUT") return;

  let shared = ctx.message.users_shared;
  if (!shared || !shared.users || shared.users.length === 0) return;

  let targetId = shared.users[0].user_id;
  let dbUser = await User.findOne({ userId: targetId }).lean();

  if (!dbUser) {
    return ctx.reply(`${toSmallCaps("User not found in bot!")}\n\n${toSmallCaps("Ask them to start the bot.")}`, { parse_mode: "HTML" });
  }

  if (targetId === userId) {
    return ctx.reply(`❌ ${toSmallCaps("Cannot pay yourself")}`, { parse_mode: "HTML" });
  }

  userState[userId] = `QP_AMOUNT_${targetId}`;

  let bodyText =
    `${toSmallCaps("Name")}: ${dbUser.firstName || "User"}\n` +
    `${toSmallCaps("User ID")}: ${targetId}\n` +
    `${toSmallCaps("Username")}: ${dbUser.username ? "@" + dbUser.username : "None"}`;

  await ctx.reply(
    `<b>${toSmallCaps("User Selected")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Enter Amount:")}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(`${toSmallCaps("Cancel")} ❌`, "qp_cancel")
    }
  );
});

// ---------- Live Fund (User view) ----------
bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Loading..." });
  let users = await User.find({}).lean();
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });

  let liveFund = await LiveFund.findOne({ key: "main_fund" }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText = `${toSmallCaps("Users")}: ${users.length}\n${toSmallCaps("Total")}: ₹${totalBalance.toFixed(2)}`;
  if (liveFund && liveFund.isActive) {
    let running = (liveFund.totalFund || 0) - (liveFund.usedFund || 0);
    bodyText += `\n\n${toSmallCaps("Live Fund")}:\n💰 ${toSmallCaps("Set Fund")}: ₹${(liveFund.totalFund || 0).toFixed(2)}\n📉 ${toSmallCaps("Running")}: ₹${running.toFixed(2)}\n📊 ${toSmallCaps("Used")}: ₹${(liveFund.usedFund || 0).toFixed(2)}`;
  }

  let text = `<b>${toSmallCaps("Live Fund Report")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Refresh"), "live_fund").row()
    .text(makeBtn("Back"), "back_to_balance");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

// ---------- Add Fund Button ----------
bot.callbackQuery("add_fund_btn", async (ctx) => {
  let userId = ctx.from.id;
  let autoEnabled = await getConfig("auto_upi_enabled", true);
  if (!autoEnabled) return ctx.answerCallbackQuery({ text: "❌ Auto UPI OFF!", show_alert: true });

  let upiId = await getConfig("auto_upi_id", "payzy@upi");
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
  let userId = ctx.from.id;
  delete userState[userId];
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => { });
  await ctx.editMessageText("❌ Cancelled.").catch(() => { });
});

// ============================================================
// ✅ END OF MESSAGE 14
// ============================================================

console.log("✅ index.js — Message 14 of 18 loaded");
// ============================================================
// 👑 BOT — /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  let disabled = await isAdminDisabled(userId);
  if (disabled) {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId }).lean();
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    return ctx.reply(
      `❌ <b>${toSmallCaps("ADMIN ACCESS DISABLED")}</b>\n\n${toSmallCaps("Your admin permissions have been disabled by the Owner.")}\n\n📞 ${toSmallCaps("Contact Owner")}: ${ownerName}\n🆔 ${toSmallCaps("Owner ID")}: ${ownerId}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(`${toSmallCaps("Back to Main Menu")}`, "back_to_balance") }
    );
  }
  if (!(await isAdmin(userId))) return ctx.reply(`❌ ${toSmallCaps("Not an admin!")}`, { parse_mode: "HTML" });
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let [userCount, activeAdmins, gatewayCount] = await Promise.all([
    User.countDocuments({}),
    BotAdmin.countDocuments({ isActive: true }),
    Gateway.countDocuments({ isActive: true })
  ]);

  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 0);
  let maxW = await getConfig("max_withdraw", 0);

  let pChannel = await getConfig("payout_channel", null);
  if (!pChannel || pChannel === "Not Set") {
    for (let m of ["upi", "bank", "wallet", "amazon", "redeem"]) {
      let oldCh = await getConfig("payout_channel_" + m, null);
      if (oldCh && oldCh !== "Not Set") { pChannel = oldCh; break; }
    }
  }
  if (!pChannel) pChannel = "Not Set";

  let supportId = await getConfig("support_username", "Not Set");
  let quickTaxEnabled = await getConfig("quick_pay_tax_enabled", false);
  let quickTaxPercent = await getConfig("quick_pay_tax_percent", 0);

  let panelText =
    `👑 <b>${toSmallCaps("Admin Panel")}</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 <b>${toSmallCaps("Bot Status")}:</b> ${botActive ? "✅ " + toSmallCaps("Active") : "❌ " + toSmallCaps("Off")}\n` +
    `💸 <b>${toSmallCaps("Min")}:</b> ₹${minW} | 💰 <b>${toSmallCaps("Max")}:</b> ₹${maxW}\n` +
    `📢 <b>${toSmallCaps("Payout")}:</b> <code>${pChannel}</code>\n` +
    `💬 <b>${toSmallCaps("Support")}:</b> <code>${supportId}</code>\n` +
    `🌐 <b>${toSmallCaps("Gateways")}:</b> ${gatewayCount} ${toSmallCaps("active")}\n` +
    `⚡ <b>${toSmallCaps("Quick Pay Tax")}:</b> ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 " + toSmallCaps("OFF")}\n` +
    `👥 <b>${toSmallCaps("Users")}:</b> ${userCount} | 👑 <b>${toSmallCaps("Admins")}:</b> ${activeAdmins}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

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
    await ctx.editMessageText(panelText, { reply_markup: styledKb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(panelText, { reply_markup: styledKb, parse_mode: "HTML" });
  }
}

bot.callbackQuery("admin", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await sendAdminPanel(ctx, true);
});

// ============================================================
// 👮 ADMIN PERMISSIONS
// ============================================================
bot.callbackQuery("adm_permissions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

async function renderPermissionsPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  const ownerUser = await User.findOne({ userId: ownerId }).lean();
  const admins = await BotAdmin.find({}).sort({ addedAt: -1 }).lean();

  let bodyText = `👑 <b>${toSmallCaps("Owner")}:</b> ${ownerUser?.firstName || "Owner"}\n🆔 <code>${ownerId}</code>\n\n` +
    `📊 ${toSmallCaps("Total Admins")}: ${admins.length}\n\n👇 ${toSmallCaps("Click to toggle / remove")}:`;

  let text = `<b>${toSmallCaps("Admin Permissions")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard();
  for (let a of admins) {
    let u = await User.findOne({ userId: a.userId }).lean();
    let name = u ? (u.firstName || "User") : "Unknown";
    let status = a.isActive ? "🟢" : "🔴";
    kb.text(`${status} ${name} — ${a.userId}`, `adm_perm_toggle_${a.userId}`).row();
    kb.text(makeBtn("Remove"), `adm_perm_remove_${a.userId}`).row();
  }
  kb.text(makeBtn("Add New Admin"), "admin_add").row();
  kb.text(makeBtn("Back to Admin"), "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner",
    admin.isActive ? "Admin Enabled" : "Admin Disabled", `${adminId}`, 0, adminId);
  await ctx.answerCallbackQuery({ text: admin.isActive ? "🟢 Enabled" : "🔴 Disabled" });
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery(/^adm_perm_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("adm_perm_remove_", ""), 10);
  await BotAdmin.deleteOne({ userId: adminId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", "Admin Removed", `${adminId}`, 0, adminId);
  await ctx.answerCallbackQuery({ text: "Removed!" });
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Add New Admin")}</b>\n\n📝 ${toSmallCaps("Send User ID or @username")}:\n\n${toSmallCaps("Example")}:\n<code>123456789</code>\n<code>@username</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_permissions") }
  );
});

// ============================================================
// 👑 TRANSFER OWNERSHIP
// ============================================================
bot.callbackQuery("adm_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Transfer Ownership")}</b>\n\n⚠️ ${toSmallCaps("You will become an Admin.")}\n\n📝 ${toSmallCaps("Send new Owner User ID")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_admins") }
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
  cache.config["owner_id"] = newOwnerId;
  await logAdminAction(currentOwner, ctx.from.first_name || "Owner",
    "Ownership Transferred", `New owner: ${newOwnerId}`, 0, newOwnerId);
  await ctx.answerCallbackQuery({ text: "Transferred!" });
  await ctx.editMessageText(
    `<b>${toSmallCaps("Ownership Transferred!")}</b>\n\n👑 ${toSmallCaps("New Owner")}: <code>${newOwnerId}</code>`,
    { parse_mode: "HTML" }
  ).catch(() => { });
  try {
    await ctx.api.sendMessage(newOwnerId,
      `👑 <b>${toSmallCaps("Congratulations!")}</b>\n\n${toSmallCaps("You are now the Owner!")}`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

// ============================================================
// 💰 SET WITHDRAW TAX
// ============================================================
bot.callbackQuery("adm_set_wd_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let cur = await getConfig("tax_percent", 0);
  let kb = new InlineKeyboard()
    .text(makeBtn("Set Tax %"), "adm_set_tax_val").row()
    .text(makeBtn("Reset to 0%"), "adm_reset_tax").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Set Withdraw Tax")}</b>\n\n📊 ${toSmallCaps("Current")}: <code>${cur}%</code>\n\n👇 ${toSmallCaps("Choose action")}:`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("adm_set_tax_val", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_TAX_PERCENT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `📝 ${toSmallCaps("Send tax percentage (0-50)")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_set_wd_tax") }
  );
});

bot.callbackQuery("adm_reset_tax", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("tax_percent", 0);
  await rerender(ctx, "adm_set_wd_tax");
});

// ============================================================
// 🤖 BOT STATUS
// ============================================================
bot.callbackQuery("adm_bot_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let botActive = await getConfig("bot_active", true);
  let offText = await getConfig("bot_off_text", `${toSmallCaps("Bot is currently OFF")}`);
  let kb = new InlineKeyboard()
    .text(makeBtn(botActive ? "Turn OFF" : "Turn ON"), "adm_bot_toggle").row()
    .text(makeBtn("Edit OFF Message"), "adm_edit_bot_off").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Bot Status")}</b>\n\n📊 ${toSmallCaps("Status")}: ${botActive ? "🟢 " + toSmallCaps("Active") : "🔴 " + toSmallCaps("Off")}\n\n📝 ${toSmallCaps("OFF Message")}:\n${offText}`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
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
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_BOT_OFF_TEXT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new Bot OFF message")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_bot_status")
  });
});

// ============================================================
// 👮 MANAGE ADMINS
// ============================================================
bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

// ============================================================
// 🚫 MANAGE BAN USERS
// ============================================================
bot.callbackQuery("adm_manage_ban", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bannedUsers = await User.find({ isBanned: true }).limit(20).lean();
  let bodyText = `${toSmallCaps("Total Banned")}: ${bannedUsers.length}\n\n`;
  bannedUsers.forEach((u, i) => { bodyText += `${i + 1}. ${u.firstName || "User"} — <code>${u.userId}</code>\n`; });
  let kb = new InlineKeyboard()
    .text(makeBtn("Ban New User"), "adm_ban_new").row()
    .text(makeBtn("Unban User"), "adm_unban_user").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Manage Ban Users")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("adm_ban_new", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_USER_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🚫 ${toSmallCaps("Send User ID to BAN")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban")
  });
});

bot.callbackQuery("adm_unban_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UNBAN_USER_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🔓 ${toSmallCaps("Send User ID to UNBAN")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban")
  });
});

// ============================================================
// 🚫 MANAGE BAN WALLET
// ============================================================
bot.callbackQuery("adm_manage_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let unlimitedWallet = await getConfig("unlimited_wallet", false);
  let onetimeWallet = await getConfig("onetime_wallet", false);
  let text = `<b>${toSmallCaps("Manage Ban Wallet")}</b>\n\n♾️ ${toSmallCaps("Unlimited")}: ${unlimitedWallet ? "🟢 ON" : "🔴 OFF"}\n⏱️ ${toSmallCaps("One-Time")}: ${onetimeWallet ? "🟢 ON" : "🔴 OFF"}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Ban Wallet"), "adm_ban_wallet").row()
    .text(makeBtn(unlimitedWallet ? "Unlimited: ON" : "Unlimited: OFF"), "adm_unlimited_wallet").row()
    .text(makeBtn(onetimeWallet ? "One-Time: ON" : "One-Time: OFF"), "adm_onetime_wallet").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_WALLET_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🚫 ${toSmallCaps("Send Wallet ID to BAN")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban_wallet")
  });
});

bot.callbackQuery("adm_unlimited_wallet", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("unlimited_wallet", false);
  await setConfig("unlimited_wallet", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "ON" : "OFF" });
  await rerender(ctx, "adm_manage_ban_wallet");
});

bot.callbackQuery("adm_onetime_wallet", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("onetime_wallet", false);
  await setConfig("onetime_wallet", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "ON" : "OFF" });
  await rerender(ctx, "adm_manage_ban_wallet");
});

// ============================================================
// 💸 WITHDRAW STATUS (Global Toggle)
// ============================================================
bot.callbackQuery("adm_wd_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let isEnabled = await getConfig("withdraw_enabled", true);
  let status = isEnabled ? "ON" : "OFF";
  let desc = isEnabled ? "All users can request withdrawals." : "All withdrawal requests disabled.";

  let text = `<b>${toSmallCaps("Withdraw Status")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Global Withdraw")}: <b>${status}</b>\n\n` +
    `${toSmallCaps(desc)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(makeBtn(isEnabled ? "Turn OFF" : "Turn ON"), "toggle_withdraw_global").row()
    .text(makeBtn("Back"), "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("toggle_withdraw_global", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("withdraw_enabled", true);
  await setConfig("withdraw_enabled", !current);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin",
    !current ? "Withdraw Enabled" : "Withdraw Disabled", "", 0, null);
  await ctx.answerCallbackQuery({ text: !current ? "ON" : "OFF" });
  await rerender(ctx, "adm_wd_status");
});

// ============================================================
// 💰 BALANCE MENU
// ============================================================
bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `➕ <b>${toSmallCaps("Add Balance")}</b>\n\n${toSmallCaps("Send")}: <code>UserID Amount</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  );
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `➖ <b>${toSmallCaps("Remove Balance")}</b>\n\n${toSmallCaps("Send")}: <code>UserID Amount</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  );
});

bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let userCount = await User.countDocuments({});
  let kb = new InlineKeyboard()
    .text(makeBtn("Yes, Reset All"), "adm_reset_all_confirm").row()
    .text(makeBtn("Cancel"), "admin");
  await ctx.editMessageText(
    `⚠️ <b>${toSmallCaps("RESET ALL BALANCES")}</b>\n\n${toSmallCaps("Users")}: ${userCount}\n\n${toSmallCaps("This will reset EVERYONE's balance to 0!")}\n\n${toSmallCaps("Confirm?")}`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Reset All Balances", "All users", 0, null);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("All balances reset to 0")}`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin")
  }).catch(() => { });
});

// ============================================================
// 💬 TALK WITH USER
// ============================================================
bot.callbackQuery("adm_talk_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `💬 ${toSmallCaps("Format")}: <code>UserID | Message</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "admin") }
  );
});

// ============================================================
// 🔍 FIND USER
// ============================================================
bot.callbackQuery("adm_find_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Find User Details")}</b>\n\n📝 ${toSmallCaps("Send User ID")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  );
});

bot.callbackQuery(/^user_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_detail_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let totalWdArr = await Withdrawal.aggregate([
    { $match: { userId: uid, status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let totalWd = totalWdArr[0]?.total || 0;

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let bodyText =
    `${toSmallCaps("Name")}: ${u.firstName || "User"}\n` +
    `${toSmallCaps("ID")}: ${uid}\n` +
    `${toSmallCaps("Username")}: ${u.username ? "@" + u.username : "None"}\n\n` +
    `${toSmallCaps("Balance")}: ₹${u.balance.toFixed(2)}\n` +
    `${toSmallCaps("Total Withdrawn")}: ₹${totalWd.toFixed(2)}\n` +
    `${toSmallCaps("Withdraw Count")}: ${approvedCount}\n\n` +
    `${toSmallCaps("Joined")}: ${formatDateTime(u.createdAt)}`;

  let text = `<b>${toSmallCaps("User Details")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Linked Withdraw"), `user_linked_${uid}`).row()
    .text(makeBtn("Withdraw History"), `user_wd_hist_${uid}`).row()
    .text(makeBtn("Balance History"), `user_bal_hist_${uid}`).row()
    .text(makeBtn("Add Balance"), `user_add_bal_${uid}`)
    .text(makeBtn("Remove Balance"), `user_rem_bal_${uid}`).row()
    .text(makeBtn("Send Message"), `user_send_msg_${uid}`)
    .text(makeBtn("Ban/Unban"), `user_ban_${uid}`).row()
    .text(makeBtn("Back"), "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

// ============================================================
// ✅ END OF MESSAGE 15
// ============================================================

console.log("✅ index.js — Message 15 of 18 loaded");
// ============================================================
// 🔍 USER DETAIL ACTIONS (Continued)
// ============================================================
bot.callbackQuery(/^user_linked_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_linked_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("Wallet Number")}: ${u.walletNumber || "Not Set"}\n\n` +
    `${toSmallCaps("UPI")}: ${u.upiId || "Not Set"}\n\n` +
    `${toSmallCaps("Bank")}: ${u.bankAccNo || "Not Set"}\n\n` +
    `${toSmallCaps("Amazon")}: ${u.amazonEmail || "Not Set"}\n\n` +
    `${toSmallCaps("Redeem")}: ${u.redeemCodeAddr || "Not Set"}`;
  let text = `<b>${toSmallCaps("Linked Withdraw Methods")}</b>\n\n<blockquote>${bodyText}</blockquote>`;
  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`),
    parse_mode: "HTML"
  }).catch(() => { });
});

bot.callbackQuery(/^user_wd_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_hist_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(10).lean();
  let totalArr = await Withdrawal.aggregate([
    { $match: { userId: uid, status: "Approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  let total = totalArr[0]?.total || 0;
  let approved = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pending = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejected = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });

  let bodyText = `${toSmallCaps("Total")}: ₹${total.toFixed(2)}\n✅ ${approved} | ⏳ ${pending} | ❌ ${rejected}\n\n`;
  if (withdrawals.length === 0) bodyText += `${toSmallCaps("No withdrawals")}`;
  else {
    withdrawals.forEach((w, i) => {
      let icon = w.status === "Approved" ? "✅" : (w.status === "Rejected" ? "❌" : "⏳");
      bodyText += `${i + 1}. ${icon} ₹${w.amount} — ${w.method}\n${formatDateTime(w.createdAt)}\n\n`;
    });
  }
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Withdraw History")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`), parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^user_bal_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_bal_hist_", ""), 10);
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(15).lean();
  let u = await User.findOne({ userId: uid }).lean();
  let totalIn = 0, totalOut = 0;
  history.forEach(h => { if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount); });

  let bodyText = `🟢 ${toSmallCaps("Credited")}: ₹${totalIn.toFixed(2)}\n🔴 ${toSmallCaps("Debited")}: ₹${totalOut.toFixed(2)}\n💵 ${toSmallCaps("Current")}: ₹${(u?.balance || 0).toFixed(2)}\n\n`;
  if (history.length === 0) bodyText += `${toSmallCaps("No transactions")}`;
  else {
    history.forEach((h, i) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      bodyText += `${i + 1}. ${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)}\n${formatDateTime(h.createdAt)}\n\n`;
    });
  }
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Balance History")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`), parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^user_add_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_add_bal_", ""), 10);
  userState[ctx.from.id] = `UADD_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➕ ${toSmallCaps("Send amount to add to")} <code>${uid}</code>:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`)
  }).catch(() => { });
});

bot.callbackQuery(/^user_rem_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_rem_bal_", ""), 10);
  userState[ctx.from.id] = `UREM_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➖ ${toSmallCaps("Send amount to remove from")} <code>${uid}</code>:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`)
  }).catch(() => { });
});

bot.callbackQuery(/^user_send_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_send_msg_", ""), 10);
  userState[ctx.from.id] = `UMSG_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💬 ${toSmallCaps("Send message to")} <code>${uid}</code>:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`)
  }).catch(() => { });
});

bot.callbackQuery(/^user_ban_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_ban_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;
  u.isBanned = !u.isBanned;
  await u.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin",
    u.isBanned ? "User Banned" : "User Unbanned", `${uid}`, 0, uid);
  await ctx.answerCallbackQuery({ text: u.isBanned ? "Banned" : "Unbanned" });
  await rerender(ctx, `user_detail_${uid}`);
});

// ============================================================
// 🔍 USER TRACKER (from find user)
// ============================================================
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15).lean();
  let msg = `📊 *Balance Record (${targetId})*\n\n`;
  if (history.length === 0) msg += "No records.";
  else history.forEach((h, idx) => {
    let dateStr = formatDateTime(h.createdAt);
    msg += `${idx + 1}. *${h.action}*: ₹${h.amount} (${dateStr})\n`;
  });
  await ctx.editMessageText(msg, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`),
    parse_mode: "Markdown"
  }).catch(() => { });
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15).lean();
  let msg = `🏧 *Withdraw History (${targetId})*\n\n`;
  if (withdrawals.length === 0) msg += "No records.";
  else withdrawals.forEach((w, idx) => {
    let dateStr = formatDateTime(w.createdAt);
    msg += `${idx + 1}. ₹${w.amount} | ${w.method}\n   ${w.status} | ${dateStr}\n\n`;
  });
  await ctx.editMessageText(msg, {
    reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`),
    parse_mode: "Markdown"
  }).catch(() => { });
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

async function renderTaskManager(ctx) {
  const pad = "\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let tasks = await Task.find({ isComplete: true }).sort({ createdAt: -1 }).lean();
  let text = `💡 <b>${toSmallCaps("Here You Can Manage Your Tasks")}</b>\n\n${toSmallCaps("Select a task to view, edit, or delete it.")}`;
  let kb = new InlineKeyboard();
  if (tasks.length === 0) kb.text(makeBtn("No Tasks"), "noop").row();
  else {
    for (let t of tasks) {
      let shortName = t.title.length > 12 ? t.title.substring(0, 12) + ".." : t.title;
      let statusIcon = t.isActive !== false ? "🟢" : "🔴";
      kb.text(`📄 ${shortName}`, `view_task_${t.taskId}`)
        .text("✏️", `edit_task_${t.taskId}`)
        .text("🗑️", `del_task_${t.taskId}`)
        .text(statusIcon, `toggle_task_${t.taskId}`).row();
    }
  }
  kb.text(makeBtn("➕ Add New Task"), "adm_create_task").text(makeBtn("Search Task"), "adm_search_task").row();
  kb.text(makeBtn("➕ Add Channel For Task Alert"), "adm_task_alert_channel").row();
  kb.text(makeBtn("⬅️ Back"), "admin");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
  }
}

bot.callbackQuery(/^view_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId }).lean();
  if (!task) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("Task ID")}: ${task.taskId}\n` +
    `${toSmallCaps("Name")}: ${task.title}\n` +
    `${toSmallCaps("Reward")}: ₹${task.reward}\n` +
    `${toSmallCaps("Link")}: ${task.link}\n` +
    `${toSmallCaps("Type")}: ${task.taskType || "photo"}\n` +
    `${toSmallCaps("Status")}: ${task.isActive !== false ? "🟢 ON" : "🔴 OFF"}\n` +
    `${toSmallCaps("Completed")}: ${task.completedUsers.length} ${toSmallCaps("users")}`;
  if (task.expiresAt) bodyText += `\n${toSmallCaps("Expires")}: ${formatDateTime(task.expiresAt)}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Edit Title"), `task_edit_title_${task.taskId}`).row()
    .text(makeBtn("Edit Reward"), `task_edit_reward_${task.taskId}`).row()
    .text(makeBtn("Edit Link"), `task_edit_link_${task.taskId}`).row()
    .text(makeBtn("Edit Alert Channel"), `task_edit_channel_${task.taskId}`).row()
    .text(makeBtn(`Type: ${(task.taskType || "photo").toUpperCase()}`), `task_edit_type_${task.taskId}`).row()
    .text(makeBtn("Delete Task"), `del_task_${task.taskId}`).row()
    .text(makeBtn("Back"), "adm_tasks_manager");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Task Details")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^del_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  let task = await Task.findOne({ taskId: tId }).lean();
  if (!task) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `⚠️ <b>${toSmallCaps("Delete Task?")}</b>\n\n📄 ${task.title}\n💰 ₹${task.reward}\n\n${toSmallCaps("This will permanently remove this task!")}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(makeBtn("Yes, Delete"), `del_task_confirm_${tId}`)
        .text(makeBtn("Cancel"), "adm_tasks_manager")
    }
  ).catch(() => { });
});

bot.callbackQuery(/^del_task_confirm_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("del_task_confirm_", "");
  await Task.deleteOne({ taskId: tId });
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderTaskManager(ctx);
});

bot.callbackQuery(/^toggle_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let taskId = ctx.callbackQuery.data.replace("toggle_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  task.isActive = task.isActive === false ? true : false;
  await task.save();
  await ctx.answerCallbackQuery({ text: task.isActive ? "Activated" : "Deactivated" });
  await renderTaskManager(ctx);
});

bot.callbackQuery(/^task_edit_title_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_title_", "");
  userState[ctx.from.id] = `TASK_EDIT_TITLE_${tId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new title")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `view_task_${tId}`)
  }).catch(() => { });
});

bot.callbackQuery(/^task_edit_reward_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_reward_", "");
  userState[ctx.from.id] = `TASK_EDIT_REWARD_${tId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new reward")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `view_task_${tId}`)
  }).catch(() => { });
});

bot.callbackQuery(/^task_edit_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_link_", "");
  userState[ctx.from.id] = `TASK_EDIT_LINK_${tId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new link")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `view_task_${tId}`)
  }).catch(() => { });
});

bot.callbackQuery(/^task_edit_channel_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_channel_", "");
  userState[ctx.from.id] = `TASK_EDIT_CHANNEL_${tId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 ${toSmallCaps("Send new alert channel")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `view_task_${tId}`)
  }).catch(() => { });
});

bot.callbackQuery(/^task_edit_type_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_type_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let newType = (task.taskType || "photo") === "photo" ? "refer" : "photo";
  await Task.updateOne({ taskId: tId }, { taskType: newType });
  await ctx.answerCallbackQuery({ text: `${newType.toUpperCase()}` });
  await rerender(ctx, `view_task_${tId}`);
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let newTaskId = generateTaskId();
  global.taskCreation = global.taskCreation || {};
  global.taskCreation[ctx.from.id] = {
    taskId: newTaskId, title: null, reward: null, link: null,
    description: null, expiryMinutes: null
  };
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Task ID Auto-Generated")}</b>\n\n<code>${newTaskId}</code>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(makeBtn("Create Task"), "task_create_start").row()
        .text(makeBtn("Back"), "adm_tasks_manager")
    }
  ).catch(() => { });
});

bot.callbackQuery("task_create_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderCreateTaskPanel(ctx);
});

async function renderCreateTaskPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let temp = global.taskCreation?.[ctx.from.id];
  if (!temp) return ctx.answerCallbackQuery({ text: "Session expired", show_alert: true });

  let bodyText =
    `${toSmallCaps("Task ID")}: <code>${temp.taskId}</code>\n\n` +
    `${toSmallCaps("Task Name")}: ${temp.title || "Not Set"}    ${temp.title ? "✅" : "—"}\n` +
    `${toSmallCaps("Reward")}: ${temp.reward ? `₹${temp.reward}` : "Not Set"}    ${temp.reward ? "✅" : "—"}\n` +
    `${toSmallCaps("Link")}: ${temp.link || "Not Set"}    ${temp.link ? "✅" : "—"}\n` +
    `${toSmallCaps("Description")}: ${temp.description || "Not Set"}    ${temp.description ? "✅" : "—"}\n` +
    `${toSmallCaps("Time Limit")}: ${temp.expiryMinutes ? `${temp.expiryMinutes} min` : "Not Set"}    ${temp.expiryMinutes ? "✅" : "—"}`;

  let text = `<b>${toSmallCaps("Create New Task")}</b>\n\n<blockquote>${bodyText}</blockquote>`;

  let kb = new InlineKeyboard()
    .text(makeBtn("Task Name"), "task_field_name").row()
    .text(makeBtn("Reward"), "task_field_reward").row()
    .text(makeBtn("Link"), "task_field_link").row()
    .text(makeBtn("Description"), "task_field_desc").row()
    .text(makeBtn("Time Limit"), "task_field_timelimit").row()
    .text(makeBtn("Generate"), "task_field_submit").row()
    .text(makeBtn("Back"), "adm_tasks_manager");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
  }
}

bot.callbackQuery("task_field_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_FIELD_NAME";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Enter Task Name")}\n\n${toSmallCaps("Send the task name")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start")
  }).catch(() => { });
});

bot.callbackQuery("task_field_reward", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_FIELD_REWARD";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Enter Reward")}\n\n${toSmallCaps("Send amount in INR")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start")
  }).catch(() => { });
});

bot.callbackQuery("task_field_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_FIELD_LINK";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Enter Task Link")}\n\n${toSmallCaps("Send the link")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start")
  }).catch(() => { });
});

bot.callbackQuery("task_field_desc", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_FIELD_DESC";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Enter Description")}\n\n${toSmallCaps("Send description (optional)")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start")
  }).catch(() => { });
});

bot.callbackQuery("task_field_timelimit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("5 Minutes"), "task_tl_5").row()
    .text(makeBtn("10 Minutes"), "task_tl_10").row()
    .text(makeBtn("30 Minutes"), "task_tl_30").row()
    .text(makeBtn("1 Hour"), "task_tl_60").row()
    .text(makeBtn("1 Day"), "task_tl_1440").row()
    .text(makeBtn("Custom Time"), "task_tl_custom").row()
    .text(makeBtn("Back"), "task_create_start");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Time Limit")}</b>\n\n${toSmallCaps("Select task expiry time")}:`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^task_tl_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let minutes = parseInt(ctx.callbackQuery.data.replace("task_tl_", ""), 10);
  let temp = global.taskCreation?.[ctx.from.id];
  if (!temp) return ctx.answerCallbackQuery({ text: "Session expired", show_alert: true });
  temp.expiryMinutes = minutes;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let display = minutes < 60 ? `${minutes} minutes` : (minutes < 1440 ? `${minutes / 60} hour(s)` : `${minutes / 1440} day(s)`);
  await ctx.editMessageText(
    `${toSmallCaps("Successfully Added")}\n\n${toSmallCaps("Time Limit")}: ${display}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start") }
  ).catch(() => { });
});

bot.callbackQuery("task_tl_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_FIELD_CUSTOM_TIME";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `${toSmallCaps("Custom Time Limit")}\n\n${toSmallCaps("Send time in minutes")}:\n\n${toSmallCaps("Examples")}:\n• 5    (5 minutes)\n• 60   (1 hour)\n• 1440 (1 day)`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_field_timelimit") }
  ).catch(() => { });
});

bot.callbackQuery("task_field_submit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let temp = global.taskCreation?.[ctx.from.id];
  if (!temp) return ctx.answerCallbackQuery({ text: "Session expired", show_alert: true });

  let missing = [];
  if (!temp.title) missing.push("Task Name");
  if (!temp.reward) missing.push("Reward");
  if (!temp.link) missing.push("Link");

  if (missing.length > 0) {
    return ctx.answerCallbackQuery({
      text: `Missing: ${missing.join(", ")}`,
      show_alert: true
    });
  }

  let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
  let expiresAt = null;
  if (temp.expiryMinutes && temp.expiryMinutes > 0) {
    expiresAt = new Date(Date.now() + temp.expiryMinutes * 60 * 1000);
  }

  try {
    await Task.create({
      taskId: temp.taskId, title: temp.title, reward: temp.reward,
      link: temp.link, description: temp.description || "",
      taskType: "photo", alertChannel, isActive: true, isComplete: true,
      completedUsers: [], expiryMinutes: temp.expiryMinutes || 0, expiresAt
    });
    await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin",
      "Task Created", temp.title, temp.reward, null);
    delete global.taskCreation[ctx.from.id];

    let bodyText = `${toSmallCaps("Task ID")}: <code>${temp.taskId}</code>\n` +
      `${toSmallCaps("Name")}: ${temp.title}\n` +
      `${toSmallCaps("Reward")}: ₹${temp.reward}\n` +
      `${toSmallCaps("Link")}: ${temp.link}\n`;
    if (temp.description) bodyText += `${toSmallCaps("Description")}: ${temp.description}\n`;
    bodyText += `${toSmallCaps("Alert Channel")}: ${alertChannel}`;

    const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
    const makeBtn = (text) => `${pad}${text}${pad}`;

    await ctx.editMessageText(
      `<b>${toSmallCaps("Task Created Successfully")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(makeBtn("Back to Manage Tasks"), "adm_tasks_manager")
      }
    ).catch(() => { });
  } catch (e) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

bot.callbackQuery("adm_search_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "TASK_SEARCH";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Search Task")}</b>\n\n${toSmallCaps("Send Task ID or Task Name")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_tasks_manager") }
  ).catch(() => { });
});

bot.callbackQuery("adm_task_alert_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_TASK_ALERT_CHANNEL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let current = await getConfig("default_task_alert_channel", "Not Set");
  await ctx.editMessageText(
    `➕ <b>${toSmallCaps("Add Channel For Task Alert")}</b>\n\n📌 ${toSmallCaps("Current")}: <code>${current}</code>\n\n📝 ${toSmallCaps("Send Channel Username")}:\n\n${toSmallCaps("Example")}:\n<code>@yourchannel</code>\n<code>-1001234567890</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_tasks_manager") }
  ).catch(() => { });
});

// ============================================================
// ✅ END OF MESSAGE 16
// ============================================================

console.log("✅ index.js — Message 16 of 18 loaded");
// ============================================================
// 📢 MANAGE CHANNELS
// ============================================================
bot.callbackQuery("adm_manage_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderManageChannels(ctx);
});

async function renderManageChannels(ctx) {
  const pad = "\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let channels = await Channel.find({ isActive: true }).sort({ order: 1, addedAt: 1 }).lean();
  let socialLinks = await SocialLink.find({}).lean();

  let payoutChannel = await getConfig("payout_channel", null);
  if (!payoutChannel || payoutChannel === "Not Set") {
    for (let m of ["upi", "bank", "wallet", "amazon", "redeem"]) {
      let oldCh = await getConfig("payout_channel_" + m, null);
      if (oldCh && oldCh !== "Not Set") { payoutChannel = oldCh; break; }
    }
  }
  if (!payoutChannel) payoutChannel = "Not Set";

  let bannedAllowed = await getConfig("banned_in_channel_allowed", true);
  let nonAdminBypass = await getConfig("non_admin_channels_bypass", true);
  let showMode = await getConfig("show_mode", "all");

  let text = `📢 <b>${toSmallCaps("Here You Can Manage Your Channels And Social Links")}</b>\n\n${toSmallCaps("Click On A Channel Or Social Link To Set An Invite Link For Private Channels And Edit Social Link.")}`;

  let kb = new InlineKeyboard();

  for (let ch of channels) {
    let shortName = (ch.displayName || ch.channelId).substring(0, 8);
    let visibility = ch.isHidden ? "🙈" : "👀";
    kb.text(shortName, `ch_edit_${ch.channelId}`)
      .text("❌", `ch_del_${ch.channelId}`)
      .text("▲", `ch_up_${ch.channelId}`)
      .text("▼", `ch_down_${ch.channelId}`)
      .text(visibility, `ch_toggle_${ch.channelId}`).row();
  }

  for (let s of socialLinks) {
    let shortName = s.name.substring(0, 10);
    kb.text(shortName, `sl_edit_${s._id}`).text("❌", `sl_del_${s._id}`).row();
  }

  kb.text(makeBtn("➕ Add Channels"), "adm_add_channel").row();
  kb.text(makeBtn("➕ Add Payout Channel"), "adm_add_payout_channel").row();
  kb.text(makeBtn("➕ Add Social Media Links"), "adm_add_social_link").row();
  kb.text(makeBtn("📢 Broadcast To Channels"), "adm_broadcast_channels").row();
  kb.text(makeBtn("⚡ New User Join Channels"), "adm_new_user_join").row();
  kb.text(makeBtn(`🛡 Banned In Channel ~ ${bannedAllowed ? "✅ Allowed" : "❌ Not Allowed"}`), "adm_banned_in_channel").row();
  kb.text(makeBtn(`⚙ Non-Admin Channels ~ ${nonAdminBypass ? "🟢 Bypass" : "🔴 Not Bypass"}`), "adm_non_admin_channels").row();
  kb.text(makeBtn(`⚪ Show Mode: ${showMode === "all" ? "All Channels" : "Not Joined Only"}`), "adm_show_mode").row();
  kb.text(makeBtn("Back"), "admin");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
  }
}

bot.callbackQuery("adm_add_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_CHANNEL_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Add Channel")}</b>\n\n${toSmallCaps("Send Your Channel User Name")}:\n\n${toSmallCaps("Example")}:\n@mychannel\n-1001234567890`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") }
  );
});

bot.callbackQuery(/^ch_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let chId = ctx.callbackQuery.data.replace("ch_del_", "");
  await Channel.deleteOne({ channelId: chId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Channel Deleted", chId, 0, null);
  await ctx.answerCallbackQuery({ text: "Removed!" });
  await renderManageChannels(ctx);
});

bot.callbackQuery(/^ch_up_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let chId = ctx.callbackQuery.data.replace("ch_up_", "");
  let channels = await Channel.find({ isActive: true }).sort({ order: 1, addedAt: 1 }).lean();
  let idx = channels.findIndex(c => c.channelId === chId);
  if (idx > 0) {
    let currOrder = channels[idx].order || idx;
    let prevOrder = channels[idx - 1].order || (idx - 1);
    await Channel.updateOne({ channelId: chId }, { order: prevOrder });
    await Channel.updateOne({ channelId: channels[idx - 1].channelId }, { order: currOrder });
  }
  await ctx.answerCallbackQuery({ text: "⬆️" });
  await renderManageChannels(ctx);
});

bot.callbackQuery(/^ch_down_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let chId = ctx.callbackQuery.data.replace("ch_down_", "");
  let channels = await Channel.find({ isActive: true }).sort({ order: 1, addedAt: 1 }).lean();
  let idx = channels.findIndex(c => c.channelId === chId);
  if (idx < channels.length - 1) {
    let currOrder = channels[idx].order || idx;
    let nextOrder = channels[idx + 1].order || (idx + 1);
    await Channel.updateOne({ channelId: chId }, { order: nextOrder });
    await Channel.updateOne({ channelId: channels[idx + 1].channelId }, { order: currOrder });
  }
  await ctx.answerCallbackQuery({ text: "⬇️" });
  await renderManageChannels(ctx);
});

bot.callbackQuery(/^ch_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let chId = ctx.callbackQuery.data.replace("ch_toggle_", "");
  let ch = await Channel.findOne({ channelId: chId });
  if (!ch) return;
  ch.isHidden = !ch.isHidden;
  await ch.save();
  await ctx.answerCallbackQuery({ text: ch.isHidden ? "🙈 Hidden" : "👀 Visible" });
  await renderManageChannels(ctx);
});

bot.callbackQuery(/^ch_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let chId = ctx.callbackQuery.data.replace("ch_edit_", "");
  let ch = await Channel.findOne({ channelId: chId }).lean();
  if (!ch) return;
  userState[ctx.from.id] = `CH_EDIT_LINK_${chId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Edit Channel")}</b>\n\n${toSmallCaps("Channel")}: ${ch.displayName || ch.channelId}\n${toSmallCaps("Current Link")}: ${ch.inviteLink}\n\n${toSmallCaps("Send new invite link")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") }
  );
});

bot.callbackQuery("adm_add_payout_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("payout_channel", null);
  if (!current || current === "Not Set") {
    for (let m of ["upi", "bank", "wallet", "amazon", "redeem"]) {
      let oldCh = await getConfig("payout_channel_" + m, null);
      if (oldCh && oldCh !== "Not Set") { current = oldCh; break; }
    }
  }
  if (!current) current = "Not Set";

  userState[ctx.from.id] = "SET_PAYOUT_CHANNEL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Set Payout Channel")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Current")}: <code>${current}</code>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Send Your Payout Channel Link")}\n\n${toSmallCaps("User ID or Username")}\n\n` +
    `${toSmallCaps("Example")}:\n@upi_payouts\n-1001234567890`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel ❌"), "adm_manage_channels") }
  );
});

bot.callbackQuery("adm_add_social_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_SOCIAL_LINK";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Add Social Media Link")}</b>\n\n${toSmallCaps("Format")}: <code>Name | Link</code>\n\n${toSmallCaps("Examples")}:\n<code>Instagram | https://instagram.com/username</code>\n<code>Facebook | https://facebook.com/page</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") }
  );
});

bot.callbackQuery(/^sl_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let id = ctx.callbackQuery.data.replace("sl_del_", "");
  await SocialLink.deleteOne({ _id: id });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Social Link Deleted", id, 0, null);
  await ctx.answerCallbackQuery({ text: "Removed!" });
  await renderManageChannels(ctx);
});

bot.callbackQuery(/^sl_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let id = ctx.callbackQuery.data.replace("sl_edit_", "");
  let s = await SocialLink.findById(id).lean();
  if (!s) return;
  userState[ctx.from.id] = `SL_EDIT_${id}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Edit Social Link")}</b>\n\n${toSmallCaps("Current")}: ${s.name} | ${s.link}\n\n${toSmallCaps("Send new")}: <code>Name | Link</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") }
  );
});

bot.callbackQuery("adm_broadcast_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true }).lean();
  if (channels.length === 0) return ctx.answerCallbackQuery({ text: "No channels added!", show_alert: true });

  userState[ctx.from.id] = "BROADCAST_TO_CHANNELS";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("Total")}: ${channels.length} ${toSmallCaps("channels")}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Broadcast To Channels")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Send your broadcast message")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") }
  );
});

bot.callbackQuery("adm_new_user_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let channels = await Channel.find({ isActive: true }).sort({ order: 1 }).lean();
  let totalUsers = await User.countDocuments({});
  let forceJoinEnabled = await getConfig("force_join_enabled", true);

  let bodyText = `${toSmallCaps("Bot Total Users")}: ${totalUsers}\n${toSmallCaps("Force Join")}: ${forceJoinEnabled ? "ON" : "OFF"}\n\n`;

  let kb = new InlineKeyboard();
  for (let ch of channels) {
    let joinedCount = await User.countDocuments({ joinedChannels: ch.channelId });
    bodyText += `${ch.displayName || ch.channelId}: ${joinedCount}\n`;
    kb.text(makeBtn(`${ch.displayName || ch.channelId} (${joinedCount})`), `nuj_ch_${ch.channelId}`).row();
  }

  kb.text(makeBtn(forceJoinEnabled ? "Turn OFF Force Join" : "Turn ON Force Join"), "adm_toggle_force_join").row();
  kb.text(makeBtn("Back"), "adm_manage_channels");

  await ctx.editMessageText(
    `<b>${toSmallCaps("New User Join Channels")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { parse_mode: "HTML", reply_markup: kb }
  ).catch(() => { });
});

bot.callbackQuery(/^nuj_ch_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let chId = ctx.callbackQuery.data.replace("nuj_ch_", "");
  let ch = await Channel.findOne({ channelId: chId }).lean();
  if (!ch) return;
  let users = await User.find({ joinedChannels: chId }).limit(50).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("Channel")}: ${ch.displayName || chId}\n${toSmallCaps("Joined Users")}: ${users.length}\n\n`;
  users.forEach((u, i) => { bodyText += `${i + 1}. ${u.firstName || "User"} — <code>${u.userId}</code>\n`; });
  await ctx.editMessageText(
    `<b>${toSmallCaps("Channel Joined Users")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_new_user_join") }
  ).catch(() => { });
});

bot.callbackQuery("adm_toggle_force_join", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("force_join_enabled", true);
  await setConfig("force_join_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "ON" : "OFF" });
  await rerender(ctx, "adm_new_user_join");
});

bot.callbackQuery("adm_banned_in_channel", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("banned_in_channel_allowed", true);
  await setConfig("banned_in_channel_allowed", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "Allowed" : "Not Allowed" });
  await renderManageChannels(ctx);
});

bot.callbackQuery("adm_non_admin_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("non_admin_channels_bypass", true);
  await setConfig("non_admin_channels_bypass", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "Bypass" : "Not Bypass" });
  await renderManageChannels(ctx);
});

bot.callbackQuery("adm_show_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("show_mode", "all");
  await setConfig("show_mode", cur === "all" ? "not_joined" : "all");
  await ctx.answerCallbackQuery({ text: cur === "all" ? "Not Joined Only" : "All Channels" });
  await renderManageChannels(ctx);
});

// ============================================================
// 🌐 GATEWAY MANAGEMENT
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayPanel(ctx);
});

async function renderGatewayPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let gateways = await Gateway.find({}).sort({ createdAt: -1 }).lean();
  let activeGW = await Gateway.findOne({ isActive: true }).lean();
  let text = `<b>${toSmallCaps("Gateway Management")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 <b>${toSmallCaps("Active")}:</b> ${activeGW ? "`" + activeGW.name + "`" : "❌ None"}\n` +
    `📊 <b>${toSmallCaps("Total")}:</b> ${gateways.length}`;
  let kb = new InlineKeyboard();
  for (let gw of gateways) {
    let icon = gw.isActive ? "✅" : "⚪";
    kb.text(`${icon} ${gw.name}`, `gw_view_${gw.name}`).row();
  }
  kb.text("➕ Add New Gateway", "gw_add").row();
  kb.text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
}

bot.callbackQuery("gw_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "GW_WAIT_NAME_V2";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🏦 ${toSmallCaps("Add New Gateway")}\n\n📝 ${toSmallCaps("Send Gateway Name")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_gateway_menu")
  });
});

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name }).lean();
  if (!gw) return;
  let urlShow = gw.url_template || gw.url || "";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("URL")}:\n<code>${urlShow}</code>\n\n` +
    `${toSmallCaps("Status")}: ${gw.isActive ? "🟢 ON" : "🔴 OFF"}\n` +
    `${toSmallCaps("Min")}: ₹${gw.minAmount || 0}\n` +
    `${toSmallCaps("Max")}: ₹${gw.maxAmount || 0}\n` +
    `${toSmallCaps("Tax")}: ${gw.taxPercent || 0}%`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Edit Settings"), `gw_edit_${gw.name}`).row()
    .text(makeBtn(gw.isActive ? "Turn OFF" : "Turn ON"), `gw_toggle_${gw.name}`).row()
    .text(makeBtn("Edit URL"), `gw_edit_url_${gw.name}`).row()
    .text(makeBtn("Delete Gateway"), `gw_del_${gw.name}`).row()
    .text(makeBtn("Back"), "adm_gateway_menu");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Gateway")}: ${gw.name}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^gw_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_toggle_", "");
  let gw = await Gateway.findOne({ name });
  if (!gw) return;
  if (!gw.isActive) {
    await Gateway.updateMany({}, { isActive: false });
    gw.isActive = true;
  } else {
    gw.isActive = false;
  }
  gw.updatedAt = new Date();
  await gw.save();
  await ctx.answerCallbackQuery({ text: gw.isActive ? "ON" : "OFF" });
  await rerender(ctx, `gw_view_${name}`);
});

bot.callbackQuery(/^gw_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_edit_", "");
  let gw = await Gateway.findOne({ name });
  if (!gw) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `<b>${name} ${toSmallCaps("Settings")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Status")}: ${gw.isActive ? "ON" : "OFF"}\n` +
    `${toSmallCaps("Min")}: ₹${gw.minAmount || 0}\n` +
    `${toSmallCaps("Max")}: ₹${gw.maxAmount || 0}\n` +
    `${toSmallCaps("Tax")}: ${gw.taxPercent || 0}%\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Set Min"), `gw_min_${name}`).row()
    .text(makeBtn("Set Max"), `gw_max_${name}`).row()
    .text(makeBtn("Set Tax"), `gw_tax_${name}`).row()
    .text(makeBtn(gw.isActive ? "Turn OFF" : "Turn ON"), `gw_toggle_${name}`).row()
    .text(makeBtn("Back"), `gw_view_${name}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^gw_min_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_min_", "");
  userState[ctx.from.id] = `GW_MIN_${name}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Set Min Amount")}\n\n${toSmallCaps("Send minimum amount")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`)
  }).catch(() => { });
});

bot.callbackQuery(/^gw_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_max_", "");
  userState[ctx.from.id] = `GW_MAX_${name}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Set Max Amount")}\n\n${toSmallCaps("Send maximum amount")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`)
  }).catch(() => { });
});

bot.callbackQuery(/^gw_tax_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_tax_", "");
  userState[ctx.from.id] = `GW_TAX_${name}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Set Tax Percent")}\n\n${toSmallCaps("Send tax % (0-50)")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`)
  }).catch(() => { });
});

bot.callbackQuery(/^gw_edit_url_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_edit_url_", "");
  userState[ctx.from.id] = `GW_EDIT_URL_${name}`;
  let gw = await Gateway.findOne({ name }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>${toSmallCaps("Edit Gateway URL")}</b>\n\n📛 ${name}\n\n${toSmallCaps("Current")}:\n<code>${gw.url}</code>\n\n${toSmallCaps("Send new URL template")}:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `gw_view_${name}`) }
  );
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Gateway Deleted", name, 0, null);
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderGatewayPanel(ctx);
});

// ============================================================
// ✅ VERIFICATION
// ============================================================
bot.callbackQuery("adm_verification_mode", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderVerificationPanel(ctx);
});

async function renderVerificationPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let verifyEnabled = await getConfig("verification_enabled", false);
  let totalUsers = await User.countDocuments({});
  let verifiedUsers = await Verification.countDocuments({ verified: true });
  let text = `<b>${toSmallCaps("Verification")}</b>\n\n🔘 ${verifyEnabled ? "✅ ON" : "❌ OFF"}\n👥 Total: ${totalUsers}\n✅ Verified: ${verifiedUsers}`;
  let kb = new InlineKeyboard()
    .text(makeBtn(verifyEnabled ? "Turn OFF" : "Turn ON"), "verify_toggle").row()
    .text(makeBtn("Set Bot Name"), "verify_set_name").row()
    .text(makeBtn("Set Bot Photo"), "verify_set_photo").row()
    .text(makeBtn("Verified Users"), "verify_list_users").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => { });
}

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !current);
  await ctx.answerCallbackQuery({ text: !current ? "✅ ON" : "❌ OFF" });
  await renderVerificationPanel(ctx);
});

bot.callbackQuery("verify_set_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_NAME";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📛 Send the bot name:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_verification_mode")
  }).catch(() => { });
});

bot.callbackQuery("verify_set_photo", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_PHOTO";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🖼️ Send image URL:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_verification_mode")
  }).catch(() => { });
});

bot.callbackQuery("verify_list_users", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let verified = await Verification.find({ verified: true }).sort({ verifiedAt: -1 }).limit(50).lean();
  if (verified.length === 0) return ctx.reply("📋 No verified users yet.");
  let text = `📋 *Verified Users (${verified.length})*\n\n`;
  for (let v of verified) {
    let u = await User.findOne({ userId: v.userId });
    let name = u ? (u.firstName || "User") : "Unknown";
    text += `✅ ${name} — \`${v.userId}\`\n`;
  }
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification_mode")
  });
});

// ============================================================
// 📢 BROADCAST
// ============================================================
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BROADCAST_WAIT_MSG";
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "direct";

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  await ctx.editMessageText(
    `<b>${toSmallCaps("Broadcast Setup")}</b>\n\n` +
    `${toSmallCaps("Send Your Message. You can use Telegram's built-in formatting.")}\n\n` +
    `${toSmallCaps("Supported")}: Text, Photo, Video, Audio, Document, Sticker, GIF, Voice\n\n` +
    `👉 ${toSmallCaps("Now, send your message below")} 👇`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  ).catch(() => { });
});

bot.callbackQuery("broadcast_mode_direct", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Direct Mode" }).catch(() => { });
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "direct";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `✅ ${toSmallCaps("Mode")}: ${toSmallCaps("Direct")}\n\n👉 ${toSmallCaps("Now, send your message below")} 👇`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  ).catch(() => { });
});

bot.callbackQuery("broadcast_mode_forward", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Forward Mode" }).catch(() => { });
  global.broadcastMode = global.broadcastMode || {};
  global.broadcastMode[ctx.from.id] = "forward";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `✅ ${toSmallCaps("Mode")}: ${toSmallCaps("Forward")}\n\n👉 ${toSmallCaps("Now, send your message below")} 👇`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }
  ).catch(() => { });
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled!" }).catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  delete userState[ctx.from.id];
  if (global.broadcastCache) delete global.broadcastCache[ctx.from.id];
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`${toSmallCaps("Cancelled")}`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin")
  }).catch(() => { });
});

bot.callbackQuery("broadcast_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  let mode = global.broadcastMode?.[userId] || "direct";
  delete userState[userId];
  delete global.broadcastCache[userId];

  await ctx.answerCallbackQuery({ text: "Broadcasting..." });
  let startTime = Date.now();
  let allUsers = await User.find({}).lean();
  let count = 0, failed = 0;

  for (let u of allUsers) {
    try {
      if (mode === "forward" && cacheObj.fromChatId && cacheObj.fromMessageId) {
        await ctx.api.forwardMessage(u.userId, cacheObj.fromChatId, cacheObj.fromMessageId);
      } else {
        if (cacheObj.type === "photo") await ctx.api.sendPhoto(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "", parse_mode: "HTML" });
        else if (cacheObj.type === "video") await ctx.api.sendVideo(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "", parse_mode: "HTML" });
        else if (cacheObj.type === "audio") await ctx.api.sendAudio(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "document") await ctx.api.sendDocument(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "sticker") await ctx.api.sendSticker(u.userId, cacheObj.fileId);
        else if (cacheObj.type === "animation") await ctx.api.sendAnimation(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else if (cacheObj.type === "voice") await ctx.api.sendVoice(u.userId, cacheObj.fileId, { caption: cacheObj.caption || "" });
        else await ctx.api.sendMessage(u.userId, cacheObj.content || "", { parse_mode: "HTML" });
      }
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  let timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

  await Broadcast.create({
    broadcastId: Date.now().toString(),
    adminId: userId,
    adminName: ctx.from.first_name || "Admin",
    messageType: cacheObj.type || "text",
    content: cacheObj.content || "",
    fileId: cacheObj.fileId || "",
    sentCount: count, failedCount: failed,
    totalCount: allUsers.length,
    timeTaken: parseFloat(timeTaken),
    status: "Completed"
  });

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `<b>${toSmallCaps("Broadcast Complete!")}</b>\n\n<blockquote>✅ ${toSmallCaps("Sent")}: ${count}\n❌ ${toSmallCaps("Failed")}: ${failed}\n👥 ${toSmallCaps("Total")}: ${allUsers.length}\n\n⏱️ ${toSmallCaps("Time")}: ${timeTaken}s\n📅 ${formatDateTime(new Date())}</blockquote>`;
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(makeBtn("Admin Panel"), "admin")
  }).catch(() => { });
});

// ============================================================
// 🎁 GIFT CODES MANAGEMENT
// ============================================================
bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

async function renderGiftCodePanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20).lean();
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let text = `<b>${toSmallCaps("Gift Codes")}</b>\n\n${toSmallCaps("Total")}: ${totalCodes}\n\n👇 ${toSmallCaps("Click code to edit")}:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb.text(makeBtn("Add Codes"), "adm_redeem_add").row().text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" }).lean();
  if (!gc) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `<b>${toSmallCaps("Code")}:</b> <code>${gc.code}</code>\n\n💰 ${toSmallCaps("Amount")}: ₹${gc.amount}\n📊 ${toSmallCaps("Claimed")}: ${gc.usedUsers.length}/${gc.maxUses}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Edit"), `gc_edit_${gc.code}`)
    .text(makeBtn("Claim View"), `gc_claim_${gc.code}`).row()
    .text(makeBtn("Delete"), `gc_del_${gc.code}`).row()
    .text(makeBtn("Back"), "adm_create_gift");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^gc_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let code = ctx.callbackQuery.data.replace("gc_del_", "");
  await GiftCode.deleteOne({ code, type: "redeem" });
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderGiftCodePanel(ctx);
});

bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `➕ <b>${toSmallCaps("Add Redeem Codes")}</b>\n\n📝 ${toSmallCaps("Format")}: <code>CODE AMOUNT</code>\n\n${toSmallCaps("Example")}:\n<code>WELCOME100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_create_gift") }
  );
});

// ============================================================
// 📧 AMAZON CODES MANAGEMENT
// ============================================================
bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAmazonPanel(ctx);
});

async function renderAmazonPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(20).lean();
  let totalCodes = await GiftCode.countDocuments({ type: "amazon" });
  let text = `<b>${toSmallCaps("Amazon Codes")}</b>\n\n${toSmallCaps("Total")}: ${totalCodes}\n\n👇 ${toSmallCaps("Click code to edit")}:`;
  let kb = new InlineKeyboard();
  for (let c of codes) {
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    let status = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    kb.text(`${status} ${shortCode} — ₹${c.amount}`, `amz_view_${c.code}`).row();
  }
  kb.text(makeBtn("Add Codes"), "adm_amazon_add").row().text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
}

bot.callbackQuery(/^amz_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("amz_view_", "");
  let gc = await GiftCode.findOne({ code, type: "amazon" }).lean();
  if (!gc) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `<b>${toSmallCaps("Code")}:</b> <code>${gc.code}</code>\n\n💰 ${toSmallCaps("Amount")}: ₹${gc.amount}\n📊 ${toSmallCaps("Claimed")}: ${gc.usedUsers.length}/${gc.maxUses}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Edit"), `amz_edit_${gc.code}`)
    .text(makeBtn("Claim View"), `amz_claim_${gc.code}`).row()
    .text(makeBtn("Delete"), `amz_del_${gc.code}`).row()
    .text(makeBtn("Back"), "adm_amazon");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^amz_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let code = ctx.callbackQuery.data.replace("amz_del_", "");
  await GiftCode.deleteOne({ code, type: "amazon" });
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderAmazonPanel(ctx);
});

bot.callbackQuery("adm_amazon_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_AMAZON_CODES";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `➕ <b>${toSmallCaps("Add Amazon Codes")}</b>\n\n📝 ${toSmallCaps("Format")}: <code>CODE AMOUNT</code>\n\n${toSmallCaps("Example")}:\n<code>AMZ100 100</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_amazon") }
  );
});

// ============================================================
// 📊 STATUS MENU
// ============================================================
bot.callbackQuery("adm_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let pendingCount = await Withdrawal.countDocuments({ status: "Pending" });
  let text = `<b>${toSmallCaps("Status")}</b>\n\n👇 ${toSmallCaps("Choose option")}:`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Live Balance Tracker"), "status_live_tracker").row()
    .text(makeBtn("Users List"), "status_users_list").row()
    .text(makeBtn("Live Fund"), "status_live_fund").row()
    .text(makeBtn("New Users"), "adm_new_users").row()
    .text(makeBtn(`Withdraw Requests (${pendingCount})`), "status_wd_requests").row()
    .text(makeBtn("Withdraw Stats"), "status_wd_stats").row()
    .text(makeBtn("Back to Admin"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("status_live_tracker", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderLiveBalanceTracker(ctx, 0);
});

async function renderLiveBalanceTracker(ctx, page = 0) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let perPage = 10;
  let totalUsers = await User.countDocuments({});
  let totalPages = Math.ceil(totalUsers / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = Math.max(0, totalPages - 1);
  let users = await User.find({}).sort({ balance: -1, createdAt: -1 }).skip(page * perPage).limit(perPage).lean();
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;
  let text = `<b>${toSmallCaps("Live Balance Tracker")}</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${toSmallCaps("Total Users")}: ${totalUsers}\n` +
    `${toSmallCaps("Total Balance")}: ₹${totalBalance.toFixed(2)}\n` +
    `${toSmallCaps("Page")}: ${page + 1}/${totalPages || 1}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>${toSmallCaps("By Balance High to Low")}:</b>\n\n`;
  users.forEach((u, i) => {
    text += `${page * perPage + i + 1}. ${u.firstName || "User"}\n`;
    text += `   ${toSmallCaps("ID")}: <code>${u.userId}</code>\n`;
    text += `   ${toSmallCaps("Balance")}: ₹${u.balance.toFixed(2)}\n\n`;
  });
  text += `👇 ${toSmallCaps("Tap to open profile")}:`;
  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 15);
    let amount = `₹${u.balance.toFixed(0)}`;
    kb.url(`${name} · ${amount}`, `tg://user?id=${u.userId}`).row();
  }
  let navRow = [];
  if (page > 0) navRow.push({ text: "◀️", callback_data: `status_lb_page_${page - 1}` });
  navRow.push({ text: "🔄", callback_data: `status_lb_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "▶️", callback_data: `status_lb_page_${page + 1}` });
  kb.row(...navRow);
  kb.row({ text: makeBtn("Back"), callback_data: "adm_status" });
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
  }
}

bot.callbackQuery(/^status_lb_page_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let page = parseInt(ctx.callbackQuery.data.replace("status_lb_page_", ""), 10);
  await renderLiveBalanceTracker(ctx, page);
});

bot.callbackQuery("status_live_fund", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let fund = await LiveFund.findOne({ key: "main_fund" }).lean();
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
  let bodyText = `🏦 ${toSmallCaps("Bot Total Fund")}: ₹${totalBalance.toFixed(2)}\n` +
    `📤 ${toSmallCaps("Total Paid Out")}: ₹${totalWd.toFixed(2)}\n` +
    `👥 ${toSmallCaps("Total Users")}: ${totalUsers}\n\n` +
    `⚙️ ${toSmallCaps("Running Fund System")}\n` +
    `📊 ${toSmallCaps("Status")}: ${fund.isActive ? "🟢 ON" : "🔴 OFF"}\n` +
    `💰 ${toSmallCaps("Set Fund")}: ₹${(fund.totalFund || 0).toFixed(2)}\n` +
    `📉 ${toSmallCaps("Running")}: ₹${running.toFixed(2)}\n` +
    `📤 ${toSmallCaps("Used")}: ₹${(fund.usedFund || 0).toFixed(2)} (${usedPercent}%)`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Set Fund"), "livefund_set").row()
    .text(makeBtn(fund.isActive ? "Turn OFF" : "Turn ON"), "livefund_toggle").row()
    .text(makeBtn("Reset Fund"), "livefund_reset").row()
    .text(makeBtn("View Payouts"), "livefund_payouts").row()
    .text(makeBtn("Back"), "adm_status");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Live Fund")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("livefund_set", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "LIVEFUND_WAIT_AMOUNT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>${toSmallCaps("Set Live Fund")}</b>\n\n📝 ${toSmallCaps("Send amount")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "status_live_fund")
  }).catch(() => { });
});

bot.callbackQuery("livefund_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let fund = await LiveFund.findOne({ key: "main_fund" });
  if (!fund) fund = await LiveFund.create({ key: "main_fund" });
  fund.isActive = !fund.isActive;
  fund.updatedAt = new Date();
  await fund.save();
  await ctx.answerCallbackQuery({ text: fund.isActive ? "ON" : "OFF" });
  await rerender(ctx, "status_live_fund");
});

bot.callbackQuery("livefund_reset", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await LiveFund.findOneAndUpdate(
    { key: "main_fund" },
    { totalFund: 0, usedFund: 0, updatedAt: new Date() },
    { upsert: true }
  );
  await ctx.answerCallbackQuery({ text: "Reset!" });
  await rerender(ctx, "status_live_fund");
});

// ============================================================
// 📊 RECENT ADMIN ACTIONS
// ============================================================
bot.callbackQuery("adm_recent_actions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(15).lean();
  let bodyText = "";
  if (logs.length === 0) bodyText = `${toSmallCaps("No actions yet.")}`;
  else {
    logs.forEach((log, i) => {
      bodyText += `${i + 1}. ${log.adminName}\n   ${log.action}${log.details ? `: ${log.details}` : ''}\n   ${formatDateTime(log.createdAt)}\n\n`;
    });
  }
  let kb = new InlineKeyboard()
    .text(makeBtn("Refresh"), "adm_recent_actions").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Recent Admin Actions")}</b>\n\n<blockquote>${bodyText}</blockquote>`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

// ============================================================
// 🔔 NEW USER NOTIFICATION
// ============================================================
bot.callbackQuery("adm_user_notif", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("new_user_notif", true);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let kb = new InlineKeyboard()
    .text(makeBtn(enabled ? "Turn OFF" : "Turn ON"), "adm_toggle_notif").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("New User Notification")}</b>\n\n📊 ${toSmallCaps("Status")}: ${enabled ? "🟢 ON" : "🔴 OFF"}`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("adm_toggle_notif", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("new_user_notif", true);
  await setConfig("new_user_notif", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "ON" : "OFF" });
  await rerender(ctx, "adm_user_notif");
});

// ============================================================
// ⚡ QUICK PAY TAX
// ============================================================
bot.callbackQuery("adm_quick_pay", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("quick_pay_tax_enabled", false);
  let percent = await getConfig("quick_pay_tax_percent", 0);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Set Tax %"), "adm_set_qp_tax").row()
    .text(makeBtn(enabled ? "Turn OFF" : "Turn ON"), "adm_toggle_qp_tax").row()
    .text(makeBtn("Reset to 0%"), "adm_reset_qp_tax").row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(
    `<b>${toSmallCaps("Quick Pay Tax")}</b>\n\n📊 ${toSmallCaps("Status")}: ${enabled ? "🟢 ON" : "🔴 OFF"}\n💸 ${toSmallCaps("Tax")}: ${percent}%`,
    { reply_markup: kb, parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("adm_set_qp_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_QUICK_PAY_TAX";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💸 ${toSmallCaps("Send tax % (0-50)")}:`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_quick_pay")
  });
});

bot.callbackQuery("adm_toggle_qp_tax", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("quick_pay_tax_enabled", false);
  await setConfig("quick_pay_tax_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "ON" : "OFF" });
  await rerender(ctx, "adm_quick_pay");
});

bot.callbackQuery("adm_reset_qp_tax", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await setConfig("quick_pay_tax_percent", 0);
  await setConfig("quick_pay_tax_enabled", false);
  await ctx.answerCallbackQuery({ text: "Reset!" });
  await rerender(ctx, "adm_quick_pay");
});

// ============================================================
// 💸 WITHDRAW TOGGLE (Per Method)
// ============================================================
bot.callbackQuery("adm_withdraw_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  let onCount = Object.values(toggles).filter(v => v === true).length;
  let text = `💸 *Withdraw Toggle*\n\n✅ ON: ${onCount}\n🔴 OFF: ${5 - onCount}`;
  let kb = new InlineKeyboard()
    .text(`${toggles.wallet ? "✅" : "🔴"} Wallet`, "wt_toggle_wallet").row()
    .text(`${toggles.upi ? "✅" : "🔴"} UPI`, "wt_toggle_upi").row()
    .text(`${toggles.bank ? "✅" : "🔴"} Bank`, "wt_toggle_bank").row()
    .text(`${toggles.amazon ? "✅" : "🔴"} Amazon`, "wt_toggle_amazon").row()
    .text(`${toggles.redeem ? "✅" : "🔴"} Redeem`, "wt_toggle_redeem").row()
    .text("🔄 Refresh", "adm_withdraw_toggle").row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => { });
});

bot.callbackQuery(/^wt_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("wt_toggle_", "");
  let newState = await toggleWithdraw(method);
  await ctx.answerCallbackQuery({ text: newState ? `✅ ${method} ON` : `🔴 ${method} OFF` });
  return rerender(ctx, "adm_withdraw_toggle");
});

// ============================================================
// ✅ END OF MESSAGE 17
// ============================================================

console.log("✅ index.js — Message 17 of 18 loaded");
// ============================================================
// 📋 TASK APPROVE / REJECT
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

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Approved", sub.taskTitle, sub.reward, sub.userId);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let msg = ctx.callbackQuery.message;
  if (msg && msg.photo) {
    await ctx.editMessageCaption({
      caption: (msg.caption || "") + `\n\n✅ APPROVED by ${ctx.from.first_name || "Admin"}`,
      parse_mode: "HTML"
    }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText((msg.text || "") + `\n\n✅ APPROVED`).catch(() => { });
  }

  try {
    await ctx.api.sendMessage(sub.userId,
      `🎉 <b>Task Approved!</b>\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });

  sub.status = "Rejected";
  await sub.save();

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Rejected", sub.taskTitle, sub.reward, sub.userId);

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  let msg = ctx.callbackQuery.message;
  if (msg && msg.photo) {
    await ctx.editMessageCaption({
      caption: (msg.caption || "") + `\n\n❌ REJECTED`,
      parse_mode: "HTML"
    }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText((msg.text || "") + `\n\n❌ REJECTED`).catch(() => { });
  }

  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ <b>Task Rejected!</b>\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

// ============================================================
// 💠 UPI ADMIN APPROVE / REJECT
// ============================================================
bot.callbackQuery(/^upi_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_app_", "");
  let payment = await UPIPayment.findOneAndUpdate(
    { orderId, status: { $ne: "Approved" } },
    { status: "Approved", verifiedAt: new Date(), approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin") },
    { new: true }
  );
  if (!payment) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  let user = await getUser(payment.userId);
  user.balance += payment.amount;
  await user.save();
  await logBalanceHistory(payment.userId, `UPI Deposit (Manual)`, payment.amount);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "UPI Deposit Approved", `₹${payment.amount}`, payment.amount, payment.userId);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  await AddFund.findOneAndUpdate(
    { userId: payment.userId, utr: payment.utr, status: "Pending" },
    { status: "Approved", approvedBy: ctx.from.username || ctx.from.first_name || "Admin", approvedAt: new Date() }
  );

  let msg = ctx.callbackQuery.message;
  if (msg && msg.photo) {
    await ctx.editMessageCaption({
      caption: (msg.caption || "") + `\n\n✅ <b>APPROVED</b>`,
      parse_mode: "HTML"
    }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText((msg.text || "") + `\n\n✅ <b>APPROVED</b>`, { parse_mode: "HTML" }).catch(() => { });
  }

  try {
    await ctx.api.sendMessage(payment.userId,
      `💫 ✅ ${toSmallCaps("Deposit Approved!")}\n\n💰 ₹${payment.amount}\n🔐 UTR: ${payment.utr}`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

bot.callbackQuery(/^upi_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("upi_rej_", "");
  let payment = await UPIPayment.findOneAndUpdate(
    { orderId, status: { $ne: "Rejected" } },
    { status: "Rejected", approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin") },
    { new: true }
  );
  if (!payment) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "UPI Deposit Rejected", `₹${payment.amount}`, payment.amount, payment.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  await AddFund.findOneAndUpdate(
    { userId: payment.userId, utr: payment.utr, status: "Pending" },
    { status: "Rejected", approvedBy: ctx.from.username || ctx.from.first_name || "Admin", approvedAt: new Date() }
  );

  let msg = ctx.callbackQuery.message;
  if (msg && msg.photo) {
    await ctx.editMessageCaption({
      caption: (msg.caption || "") + `\n\n❌ <b>REJECTED</b>`,
      parse_mode: "HTML"
    }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText((msg.text || "") + `\n\n❌ <b>REJECTED</b>`, { parse_mode: "HTML" }).catch(() => { });
  }

  try {
    await ctx.api.sendMessage(payment.userId,
      `❌ ${toSmallCaps("Deposit Rejected")}\n\n💰 ₹${payment.amount}\n🔐 UTR: <code>${payment.utr}</code>`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

// ============================================================
// 💰 WITHDRAWAL APPROVE / REJECT
// ============================================================
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let txnNumber = generateTxnNumber();
  let processTime = new Date();

  let wd = await Withdrawal.findOneAndUpdate(
    { withdrawalId: wId, status: "Pending" },
    {
      status: "Approved",
      txnNumber,
      approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin"),
      approvedAt: processTime
    },
    { new: true }
  );
  if (!wd) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  await ctx.answerCallbackQuery({ text: "Processing..." });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Withdrawal Approved", `WD #${wId}`, wd.amount, wd.userId);
  await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

  let msg = ctx.callbackQuery.message;
  let isPhoto = msg && msg.photo;
  let baseText = isPhoto ? (msg.caption || "") : (msg ? msg.text || "" : "");
  let updatedText = baseText
    .replace(/\n?📊 \*?Status\*?:.*/i, "")
    .replace(/\n?📊 <b>Status<\/b>:.*/i, "")
    .replace(/\n?Status:.*Pending.*/i, "");
  updatedText += `\n\n✅ ${toSmallCaps("Approved By")} ${wd.approvedBy} ${toSmallCaps("at")} ${formatDateTime(processTime)}`;

  let checkKb = new InlineKeyboard().url(`${toSmallCaps("Check Status")}`, receiptUrl);

  if (isPhoto) {
    await ctx.editMessageCaption({ caption: updatedText, parse_mode: "HTML", reply_markup: checkKb }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText(updatedText, { parse_mode: "HTML", reply_markup: checkKb }).catch(() => { });
  }

  let maskedDest = halfMaskDetails(wd.method, wd.details);

  if (wd.userMessageId && wd.userChatId) {
    try {
      let userMsg =
        `🎁Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> <code>${maskedDest}</code>\n` +
        `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
        `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
        `✅Please Check Your ${wd.method.toUpperCase()} Account!`;
      await ctx.api.editMessageText(wd.userChatId, wd.userMessageId, userMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl)
      });
    } catch (e) {
      try {
        await ctx.api.sendMessage(wd.userId,
          `🎁Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
          `🏦 Destination ==> <code>${maskedDest}</code>\n` +
          `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
          `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
          `✅Please Check Your ${wd.method.toUpperCase()} Account!`,
          { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) });
      } catch (e2) { }
    }
  } else {
    try {
      await ctx.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> <code>${maskedDest}</code>\n` +
        `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
        `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
        `✅Please Check Your ${wd.method.toUpperCase()} Account!`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) });
    } catch (e) { }
  }
});

bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let processTime = new Date();

  let wd = await Withdrawal.findOneAndUpdate(
    { withdrawalId: wId, status: "Pending" },
    {
      status: "Rejected",
      approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin"),
      approvedAt: processTime
    },
    { new: true }
  );
  if (!wd) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Withdrawal Rejected", `WD #${wId}`, wd.amount, wd.userId);

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Withdrawal Refunded`, wd.amount);

  await ctx.answerCallbackQuery({ text: "Rejected & Refunded!" });

  let msg = ctx.callbackQuery.message;
  let isPhoto = msg && msg.photo;
  let baseText = isPhoto ? (msg.caption || "") : (msg ? msg.text || "" : "");
  let updatedText = baseText
    .replace(/\n?📊 \*?Status\*?:.*/i, "")
    .replace(/\n?📊 <b>Status<\/b>:.*/i, "")
    .replace(/\n?Status:.*Pending.*/i, "");
  updatedText += `\n\n❌ ${toSmallCaps("Rejected By")} ${wd.approvedBy} ${toSmallCaps("at")} ${formatDateTime(processTime)}`;

  if (isPhoto) {
    await ctx.editMessageCaption({ caption: updatedText, parse_mode: "HTML" }).catch(() => { });
  } else if (msg) {
    await ctx.editMessageText(updatedText, { parse_mode: "HTML" }).catch(() => { });
  }

  let maskedDest = halfMaskDetails(wd.method, wd.details);

  if (wd.userMessageId && wd.userChatId) {
    try {
      let userMsg =
        `❌Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> has been Rejected!⚠️\n\n` +
        `🏦 Destination ==> <code>${maskedDest}</code>\n` +
        `🚀Transaction ID ==> <code>${wd.txnNumber || 'N/A'}</code>\n` +
        `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
        `📛 ${toSmallCaps("Reason")}: ${toSmallCaps("Rejected by admin")}\n` +
        `💵 Refunded: ₹${wd.amount.toFixed(2)}\n` +
        `💵 Balance: ₹${user.balance.toFixed(2)}`;
      await ctx.api.editMessageText(wd.userChatId, wd.userMessageId, userMsg, { parse_mode: "HTML" });
    } catch (e) {
      try {
        await ctx.api.sendMessage(wd.userId,
          `❌ ${toSmallCaps("Withdrawal Rejected!")}\n\n💰 ₹${wd.amount}\n\n💵 ${toSmallCaps("Refunded")}: ₹${user.balance.toFixed(2)}`,
          { parse_mode: "HTML" });
      } catch (e2) { }
    }
  } else {
    try {
      await ctx.api.sendMessage(wd.userId,
        `❌ ${toSmallCaps("Withdrawal Rejected!")}\n\n💰 ₹${wd.amount}\n\n💵 ${toSmallCaps("Refunded")}: ₹${user.balance.toFixed(2)}`,
        { parse_mode: "HTML" });
    } catch (e) { }
  }
});

// ============================================================
// 💰 ADD FUND APPROVE / REJECT
// ============================================================
bot.callbackQuery(/^af_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_app_", "");
  let af = await AddFund.findOneAndUpdate(
    { requestId: reqId, status: "Pending" },
    {
      status: "Approved",
      approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin"),
      approvedAt: new Date()
    },
    { new: true }
  );
  if (!af) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  let user = await getUser(af.userId);
  user.balance += af.amount;
  await user.save();
  await logBalanceHistory(af.userId, `Add Fund Approved (#${af.requestId})`, af.amount);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Add Fund Approved", `#${af.requestId}`, af.amount, af.userId);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${af.userName}\n` +
    `<b>User ID :</b> <code>${af.userId}</code>\n` +
    `<b>Amount :</b> ₹${af.amount}\n` +
    `<b>Method :</b> ${af.method}\n\n` +
    `✅ <b>Approved by ${af.approvedBy}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => { });
  });

  try {
    await ctx.api.sendMessage(af.userId,
      `✅ <b>Add Fund Approved!</b>\n\n💰 ₹${af.amount} added\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

bot.callbackQuery(/^af_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_rej_", "");
  let af = await AddFund.findOneAndUpdate(
    { requestId: reqId, status: "Pending" },
    {
      status: "Rejected",
      approvedBy: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin"),
      approvedAt: new Date()
    },
    { new: true }
  );
  if (!af) return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Add Fund Rejected", `#${reqId}`, af.amount, af.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${af.userName}\n` +
    `<b>Amount :</b> ₹${af.amount}\n\n` +
    `❌ <b>Rejected by ${af.approvedBy}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => { });
  });

  try {
    await ctx.api.sendMessage(af.userId,
      `❌ <b>Add Fund Rejected</b>\n\n💰 ₹${af.amount}\n\nContact support.`,
      { parse_mode: "HTML" });
  } catch (e) { }
});

// ============================================================
// 🎁 REDEEM APPROVE / REJECT (RedeemRequest)
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
    `📝 *Send code for user:*\n\n🆔 \`${req.userId}\`\n💰 ₹${req.amount}\n${icon} ${req.type}`,
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
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ *REJECTED*`).catch(() => { });

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Request Rejected*\n\n🆔 \`${req.requestId}\`\n💰 ₹${req.amount}`,
      { parse_mode: "Markdown" });
  } catch (e) { }
});

// ============================================================
// 📢 BROADCAST REMOVE
// ============================================================
bot.callbackQuery(/^broadcast_remove_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let bcId = ctx.callbackQuery.data.replace("broadcast_remove_", "");
  await ctx.answerCallbackQuery({ text: "🗑️ Removing..." });

  let sentMsgIds = global.broadcastRecords?.[bcId];
  if (!sentMsgIds || sentMsgIds.length === 0) {
    return ctx.editMessageText("❌ *Record not found.*", { parse_mode: "Markdown" }).catch(() => { });
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
    `🗑️ *Broadcast Removed!*\n\n✅ Removed: ${removed}\n❌ Failed: ${failed}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => { });
});

// ============================================================
// 🚀 START BOT — Safe Retry
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
// 🍃 MONGODB CONNECT + INIT
// ============================================================
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");

    // CREATE INDEXES
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
      await Channel.collection.createIndex({ order: 1 });
      await Verification.collection.createIndex({ userId: 1 }, { unique: true });
      console.log("⚡ MongoDB indexes created!");
    } catch (e) { console.log("⚠️ Index creation:", e.message); }

    // PRELOAD CONFIGS
    await preloadAllConfigs();

    // INIT DEFAULTS
    await getConfig("min_withdraw", 0);
    await getConfig("max_withdraw", 0);
    await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
    await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    await getConfig("start_title_text", DEFAULT_START_TEXT.title);
    await getConfig("start_link_prefix", DEFAULT_START_TEXT.linkPrefix);
    await getConfig("start_link_clickable", DEFAULT_START_TEXT.linkClickable);
    await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    await getConfig("welcome_channel_link", "https://t.me/yourchannel");
    await getConfig("bot_active", true);
    await getConfig("withdraw_enabled", true);
    await getConfig("quick_pay_tax_enabled", false);
    await getConfig("quick_pay_tax_percent", 0);
    await getConfig("new_user_notif", true);
    await getConfig("kb_update_msg_send", true);
    await getConfig("kb_update_msg", `🎨 ${toSmallCaps("Keyboard Updated!")}`);
    await getConfig("redeem_mode", "manual");
    await getConfig("support_username", "Not Set");
    await getConfig("addfund_channel", "Not Set");
    await getConfig("payout_channel", "Not Set");
    await getConfig("banned_in_channel_allowed", true);
    await getConfig("non_admin_channels_bypass", true);
    await getConfig("show_mode", "all");
    await getConfig("force_join_enabled", true);
    await getConfig("auto_upi_id", "payzy@upi");
    await getConfig("auto_upi_min", 5);
    await getConfig("auto_upi_max", 200);
    await getConfig("auto_upi_enabled", true);
    await getConfig("auto_upi_verify", true);
    await getConfig("default_task_alert_channel", "Not Set");
    await getConfig("owner_id", MAIN_OWNER_ID);
    await getConfig("verification_enabled", false);
    await getConfig("app_logo", "Task Earn Bot");
    await getConfig("btn_home", "HOME");
    await getConfig("btn_task", "TASK");
    await getConfig("btn_pay", "PAY");
    await getConfig("btn_profile", "PROFILE");

    // WITHDRAW TOGGLES
    await getConfig("withdraw_toggles", {
      wallet: true, upi: true, bank: true, amazon: true, redeem: true
    });

    // LIVE FUND
    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) await LiveFund.create({ key: "main_fund" });

    // WITHDRAW SETTINGS
    let wsCount = await WithdrawSettings.countDocuments({});
    if (wsCount === 0) {
      const defaults = [
        { method: "upi", isActive: true, minAmount: 0, maxAmount: 0, taxPercent: 0 },
        { method: "bank", isActive: true, minAmount: 0, maxAmount: 0, taxPercent: 0 },
        { method: "amazon", isActive: false, minAmount: 0, maxAmount: 0, taxPercent: 0 },
        { method: "redeem", isActive: false, minAmount: 0, maxAmount: 0, taxPercent: 0 }
      ];
      for (let d of defaults) await WithdrawSettings.create(d);
    }

    // AUTO-DELETE EXPIRED TASKS
    setInterval(async () => {
      try {
        let now = new Date();
        let expiredTasks = await Task.find({
          expiresAt: { $ne: null, $lte: now },
          isComplete: true
        });
        for (let task of expiredTasks) {
          await Task.deleteOne({ taskId: task.taskId });
          console.log(`⏰ Expired task deleted: ${task.taskId} (${task.title})`);
        }
      } catch (e) {
        console.error("Auto-delete error:", e.message);
      }
    }, 60 * 1000);

    console.log("⏳ Waiting 8s for cleanup...");
    await new Promise(r => setTimeout(r, 8000));

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🌐 Server: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await startBotSafe();
  })
  .catch((err) => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

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
  if (renderUrl) fetch(renderUrl).catch(() => { });
}, 300000);

// Cleanup cache
setInterval(() => {
  if (global.quickPayCache) { for (let uid in global.quickPayCache) delete global.quickPayCache[uid]; }
  if (global.broadcastCache) { for (let uid in global.broadcastCache) delete global.broadcastCache[uid]; }
  if (global.taskCreation) { for (let uid in global.taskCreation) delete global.taskCreation[uid]; }
}, 30 * 60 * 1000);

// ============================================================
// ✅ END OF index.js
// ============================================================
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("✅ index.js loaded — Complete Bot");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
