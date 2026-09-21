// ============================================================
// 🤖 TELEGRAM BOT + MINI APP + GATEWAY + TASK + GIFT
// Complete Bot - All Features
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
// 🔧 SAFE EDIT OR REPLY
// ============================================================
async function safeEditOrReply(ctx, text, reply_markup) {
  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup, parse_mode: "Markdown" });
    } else {
      await ctx.reply(text, { reply_markup, parse_mode: "Markdown" });
    }
  } catch (e) {
    try {
      await ctx.reply(text, { reply_markup, parse_mode: "Markdown" });
    } catch (e2) {
      console.error("safeEditOrReply error:", e2.message);
    }
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
  description: { type: String, default: "" },
  order: { type: Number, default: 0 },
  taskType: { type: String, default: "photo" },
  timeLimitEnabled: { type: Boolean, default: false },
  timeLimitMinutes: { type: Number, default: 0 },
  submissionChannel: { type: String, default: "" },
  alertEnabled: { type: Boolean, default: true },
  alertChannel: { type: String, default: "Not Set" },
  completedUsers: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

const taskTimerSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  taskId: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, default: "active" }
});
taskTimerSchema.index({ userId: 1, taskId: 1 }, { unique: true });
const TaskTimer = mongoose.models.TaskTimer || mongoose.model("TaskTimer", taskTimerSchema);

const claimRecordSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  username: { type: String, default: "" },
  userCode: { type: String, default: "" },
  claimedAt: { type: Date, default: Date.now },
  mode: { type: String, default: "auto" }
}, { _id: false });

const giftCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, default: "redeem" },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] },
  claimRecords: { type: [claimRecordSchema], default: [] },
  customMessage: { type: String, default: "" },
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
  photoFileId: { type: String, default: "" },
  submissionType: { type: String, default: "photo" },
  forwardMessageId: { type: Number, default: null },
  forwardFromChat: { type: String, default: "" },
  referralLink: { type: String, default: "" },
  adminCode: { type: String, default: "" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
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

// ✅ NEW GATEWAY SCHEMA (MongoDB-adapted)
const gatewaySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  status: { type: Boolean, default: true },
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
  console.log(`✅ Config updated: ${key}`);
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

async function isWithdrawEnabled(method) {
  try {
    let setting = await WithdrawSettings.findOne({ method: method.toLowerCase() });
    if (setting) return setting.isActive === true;
    let toggles = await getConfig("withdraw_toggles", {});
    if (toggles && toggles[method.toLowerCase()] === false) return false;
    return true;
  } catch (e) {
    return false;
  }
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
    if (str.length <= 3) return str + '***';
    let visibleLen = Math.min(Math.max(Math.ceil(str.length / 2), 2), 5);
    return str.substring(0, visibleLen) + '*'.repeat(Math.max(str.length - visibleLen, 3));
  }
  let name = parts[0];
  let domain = parts[1];
  let visibleLen = Math.min(Math.max(Math.ceil(name.length / 2), 2), 5);
  let visiblePart = name.substring(0, visibleLen);
  let maskedPart = '*'.repeat(Math.max(name.length - visibleLen, 3));
  return `${visiblePart}${maskedPart}@${domain}`;
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

function maskHalfCode(code) {
  if (!code) return code;
  let str = String(code).trim();
  if (str.length <= 4) return str.charAt(0) + "***";
  if (str.length <= 6) return str.substring(0, 2) + "***";
  let halfLen = Math.ceil(str.length / 2);
  let visible = str.substring(0, halfLen);
  let lastThree = str.substring(str.length - 3);
  return `${visible}***${lastThree}`;
}

function maskUserId(userId) {
  let str = String(userId);
  if (str.length <= 4) return str.charAt(0) + "***";
  if (str.length <= 6) return str.substring(0, 2) + "***";
  return str.substring(0, 3) + "***" + str.substring(str.length - 3);
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

// ============================================================
// 📅 FORMAT HELPERS
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

function calculateTax(amount, taxPercent = 0) {
  let tax = (amount * taxPercent) / 100;
  let afterTax = amount - tax;
  return { tax: tax, afterTax: afterTax };
}

function convertOwnerLink(input) {
  let str = String(input || "").trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('tg://')) return str;
  if (str.startsWith('@')) return `https://t.me/${str.substring(1)}`;
  if (/^\d+$/.test(str)) return `tg://user?id=${str}`;
  return `https://t.me/${str}`;
}

function formatMinutes(mins) {
  if (!mins || mins <= 0) return "Not Set";
  if (mins < 60) return `${mins} min`;
  let hours = Math.floor(mins / 60);
  let rem = mins % 60;
  if (rem === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${hours}h ${rem}m`;
}

function parseCustomTime(input) {
  let str = String(input).trim().toLowerCase();
  let hours = 0, minutes = 0;
  let hourMatch = str.match(/(\d+)\s*h/);
  if (hourMatch) hours = parseInt(hourMatch[1], 10);
  let minMatch = str.match(/(\d+)\s*m/);
  if (minMatch) minutes = parseInt(minMatch[1], 10);
  if (!hourMatch && !minMatch) {
    let pure = parseInt(str, 10);
    if (!isNaN(pure)) minutes = pure;
  }
  let total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

function formatTimeDisplay(task, expiresAt) {
  let now = new Date();
  let totalMs = task.timeLimitMinutes * 60 * 1000;
  let elapsedMs = now - expiresAt + totalMs;
  let remainingMs = Math.max(0, expiresAt - now);
  let remainingMin = Math.ceil(remainingMs / 60000);
  let percent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
  let filled = Math.round(percent / 10);
  let empty = 10 - filled;
  let bar = "█".repeat(filled) + "░".repeat(empty);
  let timeStr = "";
  if (remainingMin >= 60) {
    let h = Math.floor(remainingMin / 60);
    let m = remainingMin % 60;
    timeStr = m > 0 ? `${h}h${m}m` : `${h}h`;
  } else {
    timeStr = `${remainingMin}m`;
  }
  return `⏱️ *Time Limit*\n[${bar}] ${percent}% • ${timeStr} left`;
}

function buildAmountGrid(byAmount, callbackPrefix) {
  let amounts = Object.keys(byAmount)
    .map(a => ({ amount: a, avail: byAmount[a].avail }))
    .filter(x => x.avail > 0)
    .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));

  let rows = [];
  for (let i = 0; i < amounts.length; i += 2) {
    let row = [];
    let first = amounts[i];
    row.push({
      text: `💰 ₹${first.amount} — ${first.avail} available`,
      callback_data: `${callbackPrefix}${first.amount}`
    });
    if (i + 1 < amounts.length) {
      let second = amounts[i + 1];
      row.push({
        text: `💰 ₹${second.amount} — ${second.avail} available`,
        callback_data: `${callbackPrefix}${second.amount}`
      });
    }
    rows.push(row);
  }
  return rows;
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
  footer: "Built with security you can Trust.\nSupport that responds promptly"
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

async function getActiveGateways() {
  try {
    return await Gateway.find({ status: true }).sort({ createdAt: 1 });
  } catch (e) { return []; }
}

// ============================================================
// 🌐 NEW GATEWAY PAYMENT EXECUTOR (Axios-based)
// ============================================================
async function processGatewayPayment(data) {
  const {
    gatewayKey, gatewayName,
    number = '', amount = 0,
    comment = 'Wallet Payout',
    userId = '', orderId = ''
  } = data;

  let gateway = null;
  if (gatewayKey) {
    gateway = await Gateway.findOne({ key: gatewayKey, status: true });
  } else if (gatewayName) {
    gateway = await Gateway.findOne({ name: gatewayName, status: true });
  }

  if (!gateway || !gateway.url) {
    return { status: 'ERROR', message: 'Gateway missing or inactive.', txnNumber: null };
  }

  let finalUrl = gateway.url
    .replace(/{number}/g, encodeURIComponent(number))
    .replace(/{amount}/g, encodeURIComponent(amount))
    .replace(/{comment}/g, encodeURIComponent(comment))
    .replace(/{userId}/g, encodeURIComponent(userId))
    .replace(/{orderId}/g, encodeURIComponent(orderId));

  console.log(`🌐 Gateway [${gateway.name}] URL:`, finalUrl);

  try {
    const response = await axios.get(finalUrl, { timeout: 30000 });
    const apiData = response.data || {};

    const rawStatus = (apiData.status || apiData.state || apiData.code || "").toString().toUpperCase();
    const realTxnId = apiData.utr || apiData.txn_id || apiData.txnid || apiData.rrn || apiData.reference_id || apiData.ref_id || null;
    const message = apiData.message || apiData.msg || apiData.reason || "No description provided.";
    const gatewayBalance = apiData.balance !== undefined ? apiData.balance : null;

    let finalStatus = "FAILED";
    if (rawStatus === "SUCCESS" || rawStatus === "APPROVED" || rawStatus === "PAID" ||
        apiData.success === true || rawStatus === "200" || rawStatus === "PPT_200") {
      finalStatus = "SUCCESS";
    } else if (rawStatus === "PENDING" || rawStatus === "PROCESSING") {
      finalStatus = "PENDING";
    }

    return {
      status: finalStatus,
      txnNumber: realTxnId,
      message: message,
      gatewayBalance: gatewayBalance,
      data: apiData,
      rawResponse: JSON.stringify(apiData)
    };
  } catch (error) {
    console.error('❌ Gateway API Error:', error.message);
    let errMsg = error.response?.data?.message || error.message || 'Gateway connection error or timeout.';
    return {
      status: 'FAILED',
      txnNumber: null,
      message: errMsg,
      gatewayBalance: null,
      data: error.response?.data || {},
      rawResponse: JSON.stringify(error.response?.data || {})
    };
  }
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

    let ownerName = await getConfig("owner_display_name", "azeeznasi");
    let ownerLink = await getConfig("owner_display_link", "azeeznasi");

    if (!ownerName || ownerName === "" || ownerName === "azeeznasi") {
      let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
      let ownerUser = await User.findOne({ userId: ownerId });
      if (ownerUser && ownerUser.firstName) {
        ownerName = ownerUser.firstName;
      }
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
    const tasks = await Task.find({}).sort({ order: 1, createdAt: 1 });
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

app.get("/miniapp/api/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({ status: true }).sort({ createdAt: 1 });
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
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
      quick_pay_tax_percent: await getConfig("quick_pay_tax_percent", 0),
      amazon_mode: await getConfig("amazon_mode", "auto"),
      redeem_mode: await getConfig("redeem_mode", "auto"),
      amazon_min_amount: await getConfig("amazon_min_amount", 10),
      redeem_min_amount: await getConfig("redeem_min_amount", 10)
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
      "quick_pay_tax_enabled", "quick_pay_tax_percent",
      "amazon_mode", "redeem_mode", "amazon_min_amount", "redeem_min_amount"
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
// 💬 MESSAGE TEXT HANDLER (Main — User States)
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

    // ✅ TASK WIZARD
    if (state && typeof state === "object" && state.action === "task_wizard") {
      let st = state;
      let data = st.data || {};
      let step = st.step;

      if (step === 1) {
        let taskId = text.trim();
        if (taskId.length < 2 || taskId.length > 20) {
          return ctx.reply("❌ Task ID must be 2-20 characters!\n\nTry again:");
        }
        let existing = await Task.findOne({ taskId });
        if (existing) {
          return ctx.reply(`❌ Task ID \`${taskId}\` already exists!\n\nSend a different ID:`, { parse_mode: "Markdown" });
        }
        data.taskId = taskId;
        st.data = data;
        st.step = 2;
        userState[userId] = st;
        return ctx.reply(
          `✨ *New Task — Step 2/4*\n\n🆔 ID: \`${taskId}\` ✅\n\n📝 *Task Title*\n\nSend the task title:\n\n📌 Example: \`Subscribe My Channel\``,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_tasks_manager") }
        );
      }

      if (step === 2) {
        let title = text.trim();
        if (title.length < 2 || title.length > 50) {
          return ctx.reply("❌ Title must be 2-50 characters!\n\nTry again:");
        }
        data.title = title;
        st.data = data;
        st.step = 3;
        userState[userId] = st;
        return ctx.reply(
          `✨ *New Task — Step 3/4*\n\n🆔 ID: \`${data.taskId}\` ✅\n📝 Title: \`${title}\` ✅\n\n💰 *Reward Amount*\n\nSend the reward:\n\n📌 Example: \`10\``,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_tasks_manager") }
        );
      }

      if (step === 3) {
        let reward = parseFloat(text);
        if (isNaN(reward) || reward <= 0) return ctx.reply("❌ Invalid amount! Send a positive number:");
        data.reward = reward;
        st.data = data;
        st.step = 4;
        userState[userId] = st;
        return ctx.reply(
          `✨ *New Task — Step 4/4*\n\n🆔 ID: \`${data.taskId}\` ✅\n📝 Title: \`${data.title}\` ✅\n💰 Reward: \`₹${reward}\` ✅\n\n🔗 *Task Link*\n\nSend the link:\n\n📌 Example: \`https://t.me/channel\``,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_tasks_manager") }
        );
      }

      if (step === 4) {
        let link = text.trim();
        if (!link.startsWith("http://") && !link.startsWith("https://") && !link.startsWith("t.me/")) {
          return ctx.reply("❌ Invalid link! Must start with `http://`, `https://`, or `t.me/`\n\nTry again:", { parse_mode: "Markdown" });
        }
        data.link = link;
        st.data = data;
        st.step = 5;
        userState[userId] = st;
        let previewMsg =
          `✨ *Task Preview*\n\n🆔 ID: \`${data.taskId}\`\n📝 Title: \`${data.title}\`\n💰 Reward: \`₹${data.reward}\`\n🔗 Link: \`${link}\`\n📸 Type: photo\n📢 Alert: Not Set\n\n📊 Progress: 4/4 ✅`;
        let kb = new InlineKeyboard()
          .text("✅ Create Task", "task_wizard_create").row()
          .text("✏️ Edit", "task_wizard_restart")
          .text("❌ Cancel", "adm_tasks_manager");
        return ctx.reply(previewMsg, { parse_mode: "Markdown", reply_markup: kb });
      }
      return;
    }

    // ✅ NEW TASK FORM
    if (state && typeof state === "object" && state.action === "new_task_form") {
      let st = state;
      let d = st.data || {};
      let sub = st.substep;

      if (sub === "id") {
        let taskId = text.trim();
        if (taskId.length < 2 || taskId.length > 20) return ctx.reply("❌ Task ID must be 2-20 chars!\n\nTry again:");
        let existing = await Task.findOne({ taskId });
        if (existing) return ctx.reply(`❌ ID \`${taskId}\` already exists!\n\nTry another:`, { parse_mode: "Markdown" });
        d.taskId = taskId;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        await ctx.reply(`✅ Task ID: \`${taskId}\``, { parse_mode: "Markdown" });
        return await renderNewTaskForm(ctx);
      }

      if (sub === "title") {
        let title = text.trim();
        if (title.length < 2 || title.length > 50) return ctx.reply("❌ Title must be 2-50 chars!\n\nTry again:");
        d.title = title;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        await ctx.reply(`✅ Title: \`${title}\``, { parse_mode: "Markdown" });
        return await renderNewTaskForm(ctx);
      }

      if (sub === "reward") {
        let reward = parseFloat(text);
        if (isNaN(reward) || reward <= 0) return ctx.reply("❌ Invalid amount! Send a positive number:");
        d.reward = reward;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        await ctx.reply(`✅ Reward: \`₹${reward}\``, { parse_mode: "Markdown" });
        return await renderNewTaskForm(ctx);
      }

      if (sub === "link") {
        let link = text.trim();
        if (!link.startsWith("http://") && !link.startsWith("https://") && !link.startsWith("t.me/")) {
          return ctx.reply("❌ Invalid link! Must start with `http://`, `https://`, or `t.me/`", { parse_mode: "Markdown" });
        }
        d.link = link;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        await ctx.reply(`✅ Link: \`${link}\``, { parse_mode: "Markdown" });
        return await renderNewTaskForm(ctx);
      }

      if (sub === "description") {
        let desc = text.trim();
        if (desc.length > 200) return ctx.reply("❌ Description too long (max 200 chars)!");
        d.description = desc;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        await ctx.reply(`✅ Description saved`);
        return await renderNewTaskForm(ctx);
      }

      return;
    }

    // ✅ CREATE GIFT FORM
    if (state && typeof state === "object" && state.action === "create_gift_form") {
      let st = state;
      let d = st.data || {};
      let sub = st.substep;

      if (sub === "code") {
        let codeInput = text.trim().toUpperCase().replace(/\s+/g, "");
        if (!codeInput || codeInput.length < 2 || codeInput.length > 30) {
          return ctx.reply("❌ Code must be 2-30 chars (no spaces)!");
        }
        let existing = await GiftCode.findOne({ code: codeInput, type: "redeem" });
        if (existing) return ctx.reply(`❌ Code \`${codeInput}\` already exists!\n\nTry another:`, { parse_mode: "Markdown" });
        d.code = codeInput;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        return ctx.reply(`✅ *Success!*\n\n🆔 Code: \`${codeInput}\``, {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back")
        });
      }

      if (sub === "reward") {
        let reward = parseFloat(text);
        if (isNaN(reward) || reward <= 0) return ctx.reply("❌ Invalid amount! Send positive:");
        d.reward = reward;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        return ctx.reply(`✅ *Success!*\n\n💰 Reward: ₹${reward}`, {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back")
        });
      }

      if (sub === "limit") {
        let limit = parseInt(text, 10);
        if (isNaN(limit) || limit < 0) return ctx.reply("❌ Invalid! Send 0 (unlimited) or positive:");
        d.userLimit = limit;
        st.data = d;
        st.substep = null;
        userState[userId] = st;
        let display = limit === 0 ? "Unlimited" : limit;
        return ctx.reply(`✅ *Success!*\n\n👥 User Limit: ${display}`, {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back")
        });
      }
      return;
    }

    // ✅ GATEWAY UPI WAIT
    if (state.startsWith("GATEWAY_UPI_WAIT_")) {
      let gwName = state.replace("GATEWAY_UPI_WAIT_", "");
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@") || upi.length < 5) {
        userState[userId] = `GATEWAY_UPI_WAIT_${gwName}`;
        return ctx.reply(`❌ Invalid UPI ID!\n\n📌 Format: \`yourname@upi\`\n\n📝 Try again:`, { parse_mode: "Markdown" });
      }
      let user = await getUser(userId);
      user.upiId = upi;
      user.gatewayUpi = upi;
      await user.save();
      return ctx.reply(`✅ *UPI Saved!*\n\n📱 \`${upi}\`\n\n🌐 Gateway: ${gwName}`, {
        parse_mode: "Markdown",
        reply_markup: await buildKeyboardFromLayout(userId)
      });
    }

    // ✅ GATEWAY WALLET WAIT
    if (state.startsWith("GATEWAY_WALLET_WAIT_")) {
      let gwName = state.replace("GATEWAY_WALLET_WAIT_", "");
      delete userState[userId];
      let number = text.trim().replace(/\D/g, "");
      if (!/^\d{10}$/.test(number)) {
        userState[userId] = `GATEWAY_WALLET_WAIT_${gwName}`;
        return ctx.reply(`❌ Invalid! Send exactly *10-digit mobile number*.\n\n📌 Example: \`9876543210\``, { parse_mode: "Markdown" });
      }
      let user = await getUser(userId);
      user.gatewayUpi = number;
      if (!user.walletAccount || user.walletAccount === "Not Set") user.walletAccount = number;
      await user.save();
      return ctx.reply(`✅ *Number Saved!*\n\n📱 \`${number}\`\n\n🌐 Gateway: ${gwName}`, {
        parse_mode: "Markdown",
        reply_markup: await buildKeyboardFromLayout(userId)
      });
    }

    // ✅ OLD GATEWAY NUMBER
    if (state === "GATEWAY_WAIT_NUMBER") {
      delete userState[userId];
      let number = text.trim().replace(/\D/g, "");
      if (!/^\d{10}$/.test(number)) {
        return ctx.reply(`❌ Invalid! Send exactly *10-digit mobile number*.\n\n📌 Example: \`9876543210\``, { parse_mode: "Markdown" });
      }
      let user = await getUser(userId);
      user.gatewayUpi = number;
      if (!user.walletAccount || user.walletAccount === "Not Set") user.walletAccount = number;
      await user.save();
      return ctx.reply(`✅ *Number Saved!*\n\n📱 \`${number}\``, { parse_mode: "Markdown", reply_markup: await buildKeyboardFromLayout(userId) });
    }

    // ✅ UPI AMOUNT
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
      return ctx.reply(
        `✅ Amount Set: ₹${amt}\n\n📱 Pay to UPI: \`${upiId}\`\n\n🔐 ${styledEnter}\n\n🆔 Order: \`${orderId}\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "add_fund_cancel") }
      );
    }

    // ✅ UPI UTR
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

    // ✅ WD ADD UPI
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

    // ✅ WD ADD WALLET
    if (state === "WD_ADD_WALLET") {
      delete userState[userId];
      let wallet = text.trim();
      let user = await getUser(userId);
      user.walletAccount = wallet;
      await user.save();
      return ctx.reply(`✅ Wallet Saved!\n\n📌 <code>${wallet}</code>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Withdraw Now", "wd_wallet").row().text("🔙 Main Menu", "back_to_balance") });
    }

    // ✅ WD BANK ACC
    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`✅ Account: <code>${text.trim()}</code>\n\n📝 Send IFSC Code:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") });
    }

    // ✅ WD BANK IFSC
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

    // ✅ QP USER ID
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

    // ✅ QP AMOUNT
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

    // ✅ GIFT REDEEM
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let inputCode = text.trim();
      let gift = await GiftCode.findOneAndUpdate(
        {
          code: inputCode,
          type: "redeem",
          usedUsers: { $ne: userId },
          $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] }
        },
        {
          $push: {
            usedUsers: userId,
            claimRecords: {
              userId,
              userName: ctx.from.first_name || "User",
              username: ctx.from.username || "",
              claimedAt: new Date(),
              mode: "auto"
            }
          }
        },
        { new: true }
      );
      if (!gift) {
        return ctx.reply(`🚫 Invalid Redeem Code! 🚫\n\n⚠️ Make sure you've entered the correct code.`);
      }
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      let template = await getConfig(
        "redeem_claim_message",
        `🎉 You have successfully claimed ₹{amount}!`
      );
      let finalMsg = template
        .replace(/{amount}/g, gift.amount.toFixed(2))
        .replace(/{code}/g, gift.code)
        .replace(/{balance}/g, user.balance.toFixed(2))
        .replace(/{name}/g, user.firstName || "User");
      return ctx.reply(finalMsg);
    }

    // ✅ TL CUSTOM (Task Time Limit)
    if (state && state.startsWith("TL_CUSTOM_")) {
      let tId = state.replace("TL_CUSTOM_", "");
      delete userState[userId];
      let minutes = parseCustomTime(text);
      if (!minutes || minutes < 1 || minutes > 10080) {
        userState[userId] = `TL_CUSTOM_${tId}`;
        return ctx.reply(
          `❌ Invalid format!\n\n📌 Examples:\n• \`30\` (30 min)\n• \`1h\` (1 hour)\n• \`1h30m\` (1.5 hours)\n\n📝 Try again:`,
          { parse_mode: "Markdown" }
        );
      }
      await Task.updateOne(
        { taskId: tId },
        { timeLimitEnabled: true, timeLimitMinutes: minutes }
      );
      await ctx.reply(
        `✅ *Time Set!*\n\n⏱️ Duration: ${formatMinutes(minutes)}\n📊 Status: 🟢 ON\n\nTask will expire ${formatMinutes(minutes)} after user opens it.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`)
        }
      );
      return;
    }

    // ✅ REDEEM MESSAGE EDIT
    if (state === "REDEEM_MSG_EDIT" && (await isAdmin(userId))) {
      delete userState[userId];
      let newMsg = text.trim();
      if (!newMsg || newMsg.length < 5) return ctx.reply("❌ Message too short!");
      await setConfig("redeem_claim_message", newMsg);
      let preview = newMsg
        .replace(/{amount}/g, "100.00")
        .replace(/{code}/g, "WELCOME100")
        .replace(/{balance}/g, "145.50")
        .replace(/{name}/g, "John");
      await ctx.reply(
        `✅ *Claim Message Updated!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 *Preview:*\n${preview}\n\n━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem")
        }
      );
      return;
    }

    // ✅ BALANCE WELCOME EDIT
    if (state === "EDIT_BAL_WELCOME" && (await isAdmin(userId))) {
      delete userState[userId];
      let newText = text.trim();
      if (!newText || newText.length < 2 || newText.length > 100) return ctx.reply("❌ Text must be 2-100 chars!");
      await setConfig("balance_welcome_text", newText);
      await ctx.reply(
        `✅ *Welcome Text Updated!*\n\n⭐ New: \`${newText}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\nℹ️ All users will see this on next balance view.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_text")
        }
      );
      return;
    }

    // ✅ BALANCE FOOTER EDIT
    if (state === "EDIT_BAL_FOOTER" && (await isAdmin(userId))) {
      delete userState[userId];
      let newText = text.trim();
      if (!newText || newText.length < 2 || newText.length > 300) return ctx.reply("❌ Text must be 2-300 chars!");
      await setConfig("balance_footer_text", newText);
      await ctx.reply(
        `✅ *Footer Text Updated!*\n\n📝 New:\n${newText}\n\n━━━━━━━━━━━━━━━━━━━━\n\nℹ️ All users will see this on next balance view.`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_text")
        }
      );
      return;
    }

    // ✅ AMAZON MANUAL AMOUNT
    if (state === "AMZ_MANUAL_WAIT_AMOUNT") {
      delete userState[userId];
      let amount = parseFloat(text);
      let minAmt = await getConfig("amazon_min_amount", 10);
      if (isNaN(amount) || amount < minAmt) {
        userState[userId] = "AMZ_MANUAL_WAIT_AMOUNT";
        return ctx.reply(`❌ Minimum Amount: ₹${minAmt}\n\nPlease enter ₹${minAmt} or above:`, {
          reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance")
        });
      }
      if (amount > 100000) {
        userState[userId] = "AMZ_MANUAL_WAIT_AMOUNT";
        return ctx.reply("❌ Maximum amount: ₹100,000\n\nEnter lower:");
      }
      userState[userId] = `AMZ_MANUAL_WAIT_CODE_${amount}`;
      await ctx.reply(
        `📧 *Amazon Request*\n\n💰 Amount: ₹${amount}\n\n📝 Send your Amazon code:\n\n📌 Format: Any valid code`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance")
        }
      );
      return;
    }

    // ✅ AMAZON AUTO CODE (user enters code)
    if (state && state.startsWith("AMZ_WAIT_CODE_")) {
      let amount = parseFloat(state.replace("AMZ_WAIT_CODE_", ""));
      delete userState[userId];
      let userCode = text.trim();
      if (!userCode || userCode.length < 3) {
        userState[userId] = `AMZ_WAIT_CODE_${amount}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let gift = await GiftCode.findOneAndUpdate(
        {
          type: "amazon",
          amount: amount,
          usedUsers: { $ne: userId },
          $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] }
        },
        {
          $push: {
            usedUsers: userId,
            claimRecords: {
              userId,
              userName: ctx.from.first_name || "User",
              userCode: userCode,
              claimedAt: new Date(),
              mode: "auto"
            }
          }
        },
        { new: true }
      );
      if (!gift) return ctx.reply("❌ No codes available for this amount. Please try another.");
      let user = await getUser(userId);
      user.balance += amount;
      await user.save();
      await logBalanceHistory(userId, `Amazon Code Received (Auto) ₹${amount}`, amount);
      let kb = new InlineKeyboard().text("🏠 Main Menu", "back_to_balance");
      await ctx.reply(
        `🎉 *Amazon Code Received!*\n\n📧 Code: \`${gift.code}\`\n💰 Amount: ₹${amount}\n📊 Mode: ⚡ Auto\n💵 Balance Added: ₹${amount}\n\n✅ Tap the code to copy it!`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        try {
          await ctx.api.sendMessage(payoutChannel,
            `📧 *Amazon Auto Redeemed!*\n\n🆔 \`${userId}\`\n📧 User Code: \`${maskHalfCode(userCode)}\`\n📧 Sent Code: \`${maskHalfCode(gift.code)}\`\n💰 Amount: ₹${amount}\n📊 Mode: ⚡ Auto`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ AMAZON MANUAL CODE
    if (state && state.startsWith("AMZ_MANUAL_WAIT_CODE_")) {
      let amount = parseFloat(state.replace("AMZ_MANUAL_WAIT_CODE_", ""));
      delete userState[userId];
      let userCode = text.trim();
      if (!userCode || userCode.length < 3) {
        userState[userId] = `AMZ_MANUAL_WAIT_CODE_${amount}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
      await TaskSubmission.create({
        submissionId, userId,
        userName: ctx.from.first_name || "User",
        taskId: `AMZ_MANUAL_${submissionId}`,
        taskTitle: `Amazon ₹${amount}`,
        reward: amount,
        photoFileId: `AMZ_USERCODE_${userCode}`,
        status: "Pending",
        submissionType: "amazon_manual"
      });
      await ctx.reply(
        `⏳ *Request Submitted!*\n\n📧 Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${amount}\n📊 Mode: 📝 Manual\n\n🕐 Admin will send your code shortly.`,
        { parse_mode: "Markdown" }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        let kb = new InlineKeyboard()
          .text("✏️ Enter Code", `amz_man_enter_${submissionId}`)
          .text("❌ Reject", `amz_man_reject_${submissionId}`);
        try {
          await ctx.api.sendMessage(payoutChannel,
            `📧 *New Amazon Request!*\n\n🆔 \`${userId}\`\n📧 User Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${amount}\n📊 Mode: 📝 Manual`,
            { parse_mode: "Markdown", reply_markup: kb }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ AMAZON ADMIN ENTER CODE
    if (state && state.startsWith("AMZ_ADMIN_ENTER_CODE_")) {
      if (!(await isAdmin(userId))) {
        delete userState[userId];
        return ctx.reply("❌ Admin only!");
      }
      let submissionId = state.replace("AMZ_ADMIN_ENTER_CODE_", "");
      delete userState[userId];
      let adminCode = text.trim();
      if (!adminCode || adminCode.length < 3) {
        userState[userId] = `AMZ_ADMIN_ENTER_CODE_${submissionId}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let sub = await TaskSubmission.findOne({ submissionId });
      if (!sub || sub.status !== "Pending") return ctx.reply("❌ Already processed!");
      sub.status = "Approved";
      sub.adminCode = adminCode;
      sub.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
      sub.approvedAt = new Date();
      await sub.save();
      let user = await getUser(sub.userId);
      user.balance += sub.reward;
      await user.save();
      await logBalanceHistory(sub.userId, `Amazon Code Received (Manual) ₹${sub.reward}`, sub.reward);
      try {
        await ctx.api.sendMessage(sub.userId,
          `🎉 *Amazon Code Received!*\n\n📧 Code: \`${adminCode}\`\n💰 Amount: ₹${sub.reward}\n\n✅ Tap the code to copy it!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance")
          }
        );
      } catch (e) {}
      await ctx.reply(
        `✅ *Code Sent!*\n\n📧 \`${adminCode}\`\n💰 ₹${sub.reward}\n🆔 \`${sub.userId}\``,
        { parse_mode: "Markdown" }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        let userCode = sub.photoFileId.replace("AMZ_USERCODE_", "");
        try {
          await ctx.api.sendMessage(payoutChannel,
            `📧 *Amazon Request SENT* ✅\n\n🆔 \`${sub.userId}\`\n📧 User Code: \`${maskHalfCode(userCode)}\`\n📧 Sent Code: \`${maskHalfCode(adminCode)}\`\n💰 Amount: ₹${sub.reward}\n📊 Mode: 📝 Manual\n\n✅ Approved by ${sub.approvedBy}\n🕐 ${formatDateTime(new Date())}`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ REDEEM MANUAL AMOUNT
    if (state === "RDM_MANUAL_WAIT_AMOUNT") {
      delete userState[userId];
      let amount = parseFloat(text);
      let minAmt = await getConfig("redeem_min_amount", 10);
      if (isNaN(amount) || amount < minAmt) {
        userState[userId] = "RDM_MANUAL_WAIT_AMOUNT";
        return ctx.reply(`❌ Minimum Amount: ₹${minAmt}\n\nPlease enter ₹${minAmt} or above:`, {
          reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance")
        });
      }
      userState[userId] = `RDM_MANUAL_WAIT_CODE_${amount}`;
      await ctx.reply(
        `🎁 *Redeem Request*\n\n💰 Amount: ₹${amount}\n\n📝 Send your Redeem code:\n\n📌 Format: Any valid code`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance")
        }
      );
      return;
    }

    // ✅ REDEEM AUTO CODE
    if (state && state.startsWith("RDM_WAIT_CODE_")) {
      let amount = parseFloat(state.replace("RDM_WAIT_CODE_", ""));
      delete userState[userId];
      let userCode = text.trim();
      if (!userCode || userCode.length < 3) {
        userState[userId] = `RDM_WAIT_CODE_${amount}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let gift = await GiftCode.findOneAndUpdate(
        {
          type: "redeem",
          amount: amount,
          usedUsers: { $ne: userId },
          $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] }
        },
        {
          $push: {
            usedUsers: userId,
            claimRecords: {
              userId,
              userName: ctx.from.first_name || "User",
              userCode: userCode,
              claimedAt: new Date(),
              mode: "auto"
            }
          }
        },
        { new: true }
      );
      if (!gift) return ctx.reply("❌ No codes available for this amount.");
      let user = await getUser(userId);
      user.balance += amount;
      await user.save();
      await logBalanceHistory(userId, `Redeem Code Received (Auto) ₹${amount}`, amount);
      await ctx.reply(
        `🎉 *Redeem Code Received!*\n\n🎁 Code: \`${gift.code}\`\n💰 Amount: ₹${amount}\n📊 Mode: ⚡ Auto\n\n✅ Tap the code to copy it!`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        try {
          await ctx.api.sendMessage(payoutChannel,
            `🎁 *Redeem Auto Redeemed!*\n\n🆔 \`${userId}\`\n🎁 User Code: \`${maskHalfCode(userCode)}\`\n🎁 Sent Code: \`${maskHalfCode(gift.code)}\`\n💰 Amount: ₹${amount}\n📊 Mode: ⚡ Auto`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ REDEEM MANUAL CODE
    if (state && state.startsWith("RDM_MANUAL_WAIT_CODE_")) {
      let amount = parseFloat(state.replace("RDM_MANUAL_WAIT_CODE_", ""));
      delete userState[userId];
      let userCode = text.trim();
      if (!userCode || userCode.length < 3) {
        userState[userId] = `RDM_MANUAL_WAIT_CODE_${amount}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
      await TaskSubmission.create({
        submissionId, userId,
        userName: ctx.from.first_name || "User",
        taskId: `RDM_MANUAL_${submissionId}`,
        taskTitle: `Redeem ₹${amount}`,
        reward: amount,
        photoFileId: `RDM_USERCODE_${userCode}`,
        status: "Pending",
        submissionType: "redeem_manual"
      });
      await ctx.reply(
        `⏳ *Request Submitted!*\n\n🎁 Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${amount}\n📊 Mode: 📝 Manual\n\n🕐 Admin will send your code shortly.`,
        { parse_mode: "Markdown" }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        let kb = new InlineKeyboard()
          .text("✏️ Enter Code", `rdm_man_enter_${submissionId}`)
          .text("❌ Reject", `rdm_man_reject_${submissionId}`);
        try {
          await ctx.api.sendMessage(payoutChannel,
            `🎁 *New Redeem Request!*\n\n🆔 \`${userId}\`\n🎁 User Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${amount}\n📊 Mode: 📝 Manual`,
            { parse_mode: "Markdown", reply_markup: kb }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ REDEEM ADMIN ENTER CODE
    if (state && state.startsWith("RDM_ADMIN_ENTER_CODE_")) {
      if (!(await isAdmin(userId))) {
        delete userState[userId];
        return ctx.reply("❌ Admin only!");
      }
      let submissionId = state.replace("RDM_ADMIN_ENTER_CODE_", "");
      delete userState[userId];
      let adminCode = text.trim();
      if (!adminCode || adminCode.length < 3) {
        userState[userId] = `RDM_ADMIN_ENTER_CODE_${submissionId}`;
        return ctx.reply("❌ Invalid code! Send a valid code:");
      }
      let sub = await TaskSubmission.findOne({ submissionId });
      if (!sub || sub.status !== "Pending") return ctx.reply("❌ Already processed!");
      sub.status = "Approved";
      sub.adminCode = adminCode;
      sub.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
      sub.approvedAt = new Date();
      await sub.save();
      let user = await getUser(sub.userId);
      user.balance += sub.reward;
      await user.save();
      await logBalanceHistory(sub.userId, `Redeem Code Received (Manual) ₹${sub.reward}`, sub.reward);
      try {
        await ctx.api.sendMessage(sub.userId,
          `🎉 *Redeem Code Received!*\n\n🎁 Code: \`${adminCode}\`\n💰 Amount: ₹${sub.reward}\n\n✅ Tap the code to copy it!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance")
          }
        );
      } catch (e) {}
      await ctx.reply(
        `✅ *Code Sent!*\n\n🎁 \`${adminCode}\`\n💰 ₹${sub.reward}\n🆔 \`${sub.userId}\``,
        { parse_mode: "Markdown" }
      );
      let payoutChannel = await getConfig("payout_channel", null);
      if (payoutChannel && payoutChannel !== "Not Set") {
        let userCode = sub.photoFileId.replace("RDM_USERCODE_", "");
        try {
          await ctx.api.sendMessage(payoutChannel,
            `🎁 *Redeem Request SENT* ✅\n\n🆔 \`${sub.userId}\`\n🎁 User Code: \`${maskHalfCode(userCode)}\`\n🎁 Sent Code: \`${maskHalfCode(adminCode)}\`\n💰 Amount: ₹${sub.reward}\n📊 Mode: 📝 Manual\n\n✅ Approved by ${sub.approvedBy}\n🕐 ${formatDateTime(new Date())}`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {}
      }
      return;
    }

    // ✅ ADMIN BTN RENAME
    if (state && state.startsWith("ADM_BTN_RENAME_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("ADM_BTN_RENAME_", ""), 10);
      delete userState[userId];
      let layout = await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
      if (idx < 0 || idx >= layout.length) return;
      layout[idx].name = text;
      await setConfig("admin_panel_layout", layout);
      return ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_panel_custom") });
    }

    // ✅ KB BTN RENAME
    if (state && state.startsWith("KB_BTN_RENAME_") && (await isAdmin(userId))) {
      let idx = parseInt(state.replace("KB_BTN_RENAME_", ""), 10);
      delete userState[userId];
      let layout = await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
      if (idx < 0 || idx >= layout.length) return;
      layout[idx].name = text;
      await setConfig("keyboard_layout", layout);
      return ctx.reply(`✅ Renamed to: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_keyboard_custom") });
    }

    // ✅ KB MSG EDIT
    if (state === "KB_MSG_EDIT" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("kb_update_msg", text);
      return ctx.reply(`✅ Message Updated!\n\n📌 New:\n${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "kbpanel_msg_toggle") });
    }

    // ✅ LIVEFUND SET
    if (state === "LIVEFUND_WAIT_AMOUNT" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid amount!");
      await LiveFund.findOneAndUpdate(
        { key: "main_fund" },
        { totalFund: amt, usedFund: 0, updatedAt: new Date() },
        { upsert: true }
      );
      return ctx.reply(`✅ Fund Set: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "status_live_fund") });
    }

    // ✅ WITHDRAW SETTINGS MIN/MAX/TAX
    if (state && state.startsWith("ADMWD_MIN_") && (await isAdmin(userId))) {
      let method = state.replace("ADMWD_MIN_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await WithdrawSettings.findOneAndUpdate({ method }, { minAmount: amt, updatedAt: new Date() }, { upsert: true });
      return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    }

    if (state && state.startsWith("ADMWD_MAX_") && (await isAdmin(userId))) {
      let method = state.replace("ADMWD_MAX_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
      await WithdrawSettings.findOneAndUpdate({ method }, { maxAmount: amt, updatedAt: new Date() }, { upsert: true });
      return ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    }

    if (state && state.startsWith("ADMWD_TAX_") && (await isAdmin(userId))) {
      let method = state.replace("ADMWD_TAX_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
      await WithdrawSettings.findOneAndUpdate({ method }, { taxPercent: amt, updatedAt: new Date() }, { upsert: true });
      return ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", `admwd_edit_${method}`) });
    }

    if (state === "WAITING_TAX_PERCENT" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
      await setConfig("tax_percent", amt);
      return ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_set_wd_tax") });
    }

    if (state === "WAITING_QUICK_PAY_TAX" && (await isAdmin(userId))) {
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt < 0 || amt > 50) return ctx.reply("❌ Tax must be 0-50%!");
      await setConfig("quick_pay_tax_percent", amt);
      return ctx.reply(`✅ Quick Pay Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_quick_pay") });
    }

    // ✅ TRANSFER OWNERSHIP
    if (state === "WAITING_NEW_OWNER" && (await isOwner(userId))) {
      delete userState[userId];
      let newOwnerId = parseInt(text, 10);
      if (isNaN(newOwnerId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: newOwnerId });
      if (!targetUser) return ctx.reply("❌ User not found!");
      let kb = new InlineKeyboard()
        .text("✅ Yes, Transfer", `admin_transfer_confirm_${newOwnerId}`).row()
        .text("❌ Cancel", "adm_admins");
      return ctx.reply(`⚠️ *Confirm Transfer*\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newOwnerId}\`\n\nSure?`, {
        parse_mode: "Markdown", reply_markup: kb
      });
    }

    // ✅ ADMIN ADD
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
      return ctx.reply(`✅ Admin Added!\n\n👤 ${targetUser.firstName || "User"}\n🆔 \`${newAdminId}\``, {
        parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_admins")
      });
    }

    // ✅ BAN USER
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

    // ✅ UNBAN USER
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

    // ✅ BAN WALLET
    if (state === "BAN_WALLET_WAIT" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("banned_wallet", text);
      return ctx.reply(`✅ Wallet Banned: ${text}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_ban_wallet") });
    }

    // ✅ ADD BALANCE
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
      return ctx.reply(`✅ Added ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    // ✅ REMOVE BALANCE
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
      return ctx.reply(`✅ Removed ₹${amount}. New: ₹${targetUser.balance.toFixed(2)}`);
    }

    // ✅ USER ADD BAL
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

    // ✅ USER REM BAL
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

    // ✅ USER SEND MSG
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

    // ✅ TRACKER ID
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let targetId = parseInt(text, 10);
      if (isNaN(targetId)) return ctx.reply("❌ Invalid!");
      let targetUser = await User.findOne({ userId: targetId });
      if (!targetUser) return ctx.reply(`❌ User not found!`);
      return ctx.reply(`👤 Loading user ${targetId}...`, { reply_markup: new InlineKeyboard().text("👤 View Details", `user_detail_${targetId}`) });
    }

    // ✅ TALK WITH USER
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

    // ✅ TASK CREATE QUICK
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
      return ctx.reply(`✅ Task '${parts[1]}' created!`);
    }

    // ✅ TASK EDIT FIELDS
    if (state.startsWith("TASK_EDIT_TITLE_") && (await isAdmin(userId))) {
      let taskId = state.replace("TASK_EDIT_TITLE_", "");
      delete userState[userId];
      await Task.updateOne({ taskId }, { title: text });
      return ctx.reply(`✅ Title updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    }
    if (state.startsWith("TASK_EDIT_REWARD_") && (await isAdmin(userId))) {
      let taskId = state.replace("TASK_EDIT_REWARD_", "");
      delete userState[userId];
      let amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) return ctx.reply("❌ Invalid!");
      await Task.updateOne({ taskId }, { reward: amt });
      return ctx.reply(`✅ Reward updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    }
    if (state.startsWith("TASK_EDIT_LINK_") && (await isAdmin(userId))) {
      let taskId = state.replace("TASK_EDIT_LINK_", "");
      delete userState[userId];
      await Task.updateOne({ taskId }, { link: text });
      return ctx.reply(`✅ Link updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    }
    if (state.startsWith("TASK_EDIT_CHANNEL_") && (await isAdmin(userId))) {
      let taskId = state.replace("TASK_EDIT_CHANNEL_", "");
      delete userState[userId];
      await Task.updateOne({ taskId }, { alertChannel: text });
      return ctx.reply(`✅ Alert Channel updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `view_task_${taskId}`) });
    }

    // ✅ SAVE CODES
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

    // ✅ BOT OFF TEXT
    if (state === "WAITING_BOT_OFF_TEXT" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("bot_off_text", text);
      return ctx.reply(`✅ Bot OFF message updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_bot_status") });
    }

    // ✅ ADD CHANNEL
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
      return ctx.reply(`✅ Channel Added!\n\n📢 ${channelTitle}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_manage_channels") });
    }

    // ✅ ADMIN MANUAL WITHDRAW
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
      return ctx.reply(`✅ Manually withdrew ₹${amt} from \`${targetId}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${targetId}`) });
    }

    // ✅ SET WALLET
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

    // ✅ USET WALLET/UPI/BANK
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

    // ✅ TASK REFER
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

    // ✅ AMZ ADMIN ENTER CODE (VARIATION)
    if (state && state.startsWith("AMZ_ADMIN_CONFIRM_")) {
      // handled by send handler
      return;
    }

    // ✅ RDM ADMIN ENTER CODE (VARIATION)
    if (state && state.startsWith("RDM_ADMIN_CONFIRM_")) {
      return;
    }

    // ✅ GATEWAY ADMIN INPUT — handled in Part 3
    // ✅ CONTINUE TO MAIN MENU HANDLERS
  }

  // ============================================================
  // 💬 MAIN USER MENU HANDLERS
  // ============================================================
  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  // ✅ BALANCE
  if (matchedKey === "btn_balance" || /balance/i.test(text)) {
    try {
      let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
      let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);

      let msg =
        `<b>${welcomeText}</b>\n\n` +
        `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
        `${DEFAULT_BALANCE_TEXT.balance} <code>₹${user.balance.toFixed(2)}</code>\n\n` +
        `${footerText}`;

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

      return await ctx.reply(msg, {
        reply_markup: await buildStyledKb(buttons, userId),
        parse_mode: "HTML"
      });
    } catch (err) {
      return ctx.reply(`❌ Error: ${err.message}`);
    }
  }

  // ✅ TASKS
  else if (matchedKey === "btn_tasks" || /task/i.test(text)) {
    try {
      let allTasks = await Task.find({}).sort({ order: 1, createdAt: 1 });
      if (!allTasks || allTasks.length === 0) {
        return ctx.reply(`⚠️ No tasks available right now. Please check back later!`);
      }
      let availableTasks = [];
      let expiredCount = 0;

      for (let t of allTasks) {
        if (t.completedUsers.includes(userId)) continue;
        if (t.timeLimitEnabled && t.timeLimitMinutes > 0) {
          let timer = await TaskTimer.findOne({ userId, taskId: t.taskId });
          if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
            if (timer.status !== "expired") {
              timer.status = "expired";
              await timer.save();
            }
            expiredCount++;
            continue;
          }
        }
        availableTasks.push(t);
      }

      if (availableTasks.length === 0) {
        return ctx.reply(`⚠️ No tasks available right now. Please check back later!`);
      }

      let taskButtons = [];
      for (let i = 0; i < availableTasks.length; i += 2) {
        let row = [];
        let t1 = availableTasks[i];
        let badge1 = t1.timeLimitEnabled && t1.timeLimitMinutes > 0
          ? ` ⏱️${formatMinutes(t1.timeLimitMinutes)}`
          : "";
        row.push({
          text: `${t1.title} (₹${t1.reward})${badge1}`,
          callback_data: `do_task_${t1.taskId}`
        });
        if (i + 1 < availableTasks.length) {
          let t2 = availableTasks[i + 1];
          let badge2 = t2.timeLimitEnabled && t2.timeLimitMinutes > 0
            ? ` ⏱️${formatMinutes(t2.timeLimitMinutes)}`
            : "";
          row.push({
            text: `${t2.title} (₹${t2.reward})${badge2}`,
            callback_data: `do_task_${t2.taskId}`
          });
        }
        taskButtons.push(row);
      }

      let header = `📋 Available Tasks:`;
      if (expiredCount > 0) {
        header += `\n\n⚠️ ${expiredCount} task(s) expired for you`;
      }

      return ctx.reply(header, {
        reply_markup: await buildStyledKb(taskButtons, userId),
        parse_mode: "Markdown"
      });
    } catch (e) {
      console.error("Task list error:", e);
      return ctx.reply(`⚠️ No tasks available right now. Please check back later!`);
    }
  }

  // ✅ GIFT CODE
  else if (matchedKey === "btn_gift" || /gift/i.test(text)) {
    let activeCodes = await GiftCode.countDocuments({
      type: "redeem",
      usedUsers: { $ne: userId }
    });

    let headerText =
      `🔍 You don't have any active Gift Codes.\n\n` +
      `Create your first one now!`;

    let kb = new InlineKeyboard()
      .text("🎁 Claim Gift Code", "gift_claim").row()
      .text("✨ Create Gift Code", "gift_create");

    return ctx.reply(headerText, { reply_markup: kb });
  }

  // ✅ QUICK PAY
  else if (matchedKey === "btn_quickpay" || /quick.*pay/i.test(text)) {
    userState[userId] = "QP_WAIT_USERID";
    return ctx.reply(`💸 *Quick Pay*\n\n📱 Send Receiver User ID:`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "qp_cancel")
    });
  }

  // ✅ PAYOUT METHOD
  else if (matchedKey === "btn_payout" || /payout.*method/i.test(text)) {
    let activeGateways = await Gateway.find({ status: true }).sort({ createdAt: 1 });
    let fmt = (val) => (val && val !== "Not Set" && String(val).trim() !== "") ? `\`${val}\`` : `\`Not Set\``;

    let msg = `✨ *Choose Payout Method*\n\n`;
    let buttons = [];

    for (let gw of activeGateways) {
      let gwType = gw.type || "wallet";
      let gwIcon = gwType === "upi" ? "⚡" : "👛";
      let gwDest = gw.type === "upi" ? user.upiId : (user.gatewayUpi || user.walletAccount);
      msg += `${gwIcon} *${gw.name}* - ${fmt(gwDest)}\n\n`;
      buttons.push([{ text: `${gwIcon} Auto | ${gw.name}`, callback_data: `set_gw_${gw.key}` }]);
    }

    let upiOn = await isWithdrawEnabled("upi");
    if (upiOn) msg += `⚡ *Manual UPI* - ${fmt(user.upiId)}\n\n`;

    let bankOn = await isWithdrawEnabled("bank");
    if (bankOn) msg += `🏦 *Bank* - ${(user.bankAccNo !== "Not Set") ? `\`${user.bankAccNo} (${user.bankIfsc})\`` : "`Not Set`"}`;

    let row = [];
    if (upiOn) row.push({ text: "⚡ Manual UPI", callback_data: "set_upi" });
    if (bankOn) row.push({ text: "🏦 Bank", callback_data: "set_bank" });
    if (row.length > 0) buttons.push(row);

    if (buttons.length === 0) {
      return ctx.reply(`⚠️ No payout methods available right now.\n\nPlease try again later.`);
    }

    return ctx.reply(msg, {
      reply_markup: await buildStyledKb(buttons, userId),
      parse_mode: "Markdown"
    });
  }

  // ✅ WITHDRAW
  else if (matchedKey === "btn_withdraw" || /withdraw/i.test(text)) {
    let activeGateways = await Gateway.find({ status: true }).sort({ createdAt: 1 });
    let buttons = [];

    for (let gw of activeGateways) {
      let gwType = gw.type || "wallet";
      let gwIcon = gwType === "upi" ? "⚡" : "👛";
      buttons.push([{ text: `${gwIcon} Auto | ${gw.name}`, callback_data: `wd_gw_${gw.key}` }]);
    }

    let upiOn = await isWithdrawEnabled("upi");
    let bankOn = await isWithdrawEnabled("bank");

    let row = [];
    if (upiOn) row.push({ text: "⚡ Manual UPI", callback_data: "wd_upi" });
    if (bankOn) row.push({ text: "🏦 Bank", callback_data: "wd_bank" });
    if (row.length > 0) buttons.push(row);

    if (buttons.length === 0) {
      return ctx.reply(`⚠️ No withdrawal methods available right now.\n\nPlease try again later.`);
    }

    return ctx.reply(`✨ *Choose Your Withdraw Method:*`, {
      reply_markup: await buildStyledKb(buttons, userId),
      parse_mode: "Markdown"
    });
  }

  // ✅ GIFT FALLBACK (any text as code)
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
// 📸 PHOTO HANDLER (Task submissions)
// ============================================================
bot.on("message:photo", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state && state.startsWith("WAITING_TASK_PHOTO_")) {
    let taskId = state.replace("WAITING_TASK_PHOTO_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }
    if (task.completedUsers.includes(userId)) { delete userState[userId]; return ctx.reply("❌ Already completed!"); }

    let timer = await TaskTimer.findOne({ userId, taskId });
    if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
      delete userState[userId];
      return ctx.reply("⌛ Time expired!");
    }

    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();

    await TaskSubmission.create({
      submissionId, userId,
      userName: ctx.from.first_name || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: photo.file_id,
      submissionType: "photo", status: "Pending"
    });
    delete userState[userId];

    await ctx.reply(
      `⏳ *Submission Received!*\n\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📸 Type: Screenshot\n🆔 ID: \`${submissionId}\`\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
    );

    let alertChannel = task.submissionChannel || task.alertChannel;
    if (!alertChannel || alertChannel === "Not Set") {
      alertChannel = await getConfig("default_submission_channel", null)
        || await getConfig("payout_channel", null);
    }

    if (alertChannel && alertChannel !== "Not Set") {
      let caption = `📸 *New Task Submission!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 \`${userId}\`\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📋 Type: 📸 Screenshot\n🆔 Sub ID: \`${submissionId}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
  }

  // ✅ TASK FORWARD
  else if (state && state.startsWith("WAITING_TASK_FORWARD_")) {
    // handled by forward handler
    return;
  }

  // ✅ TASK PHOTO (screenshot submission)
  else if (state && state.startsWith("WAITING_TASK_SUBMIT_")) {
    let taskId = state.replace("WAITING_TASK_SUBMIT_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }

    let timer = await TaskTimer.findOne({ userId, taskId });
    if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
      delete userState[userId];
      return ctx.reply("⌛ Time expired!");
    }

    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();

    await TaskSubmission.create({
      submissionId, userId,
      userName: ctx.from.first_name || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward, photoFileId: photo.file_id,
      submissionType: "photo", status: "Pending"
    });
    delete userState[userId];

    await ctx.reply(
      `⏳ *Submission Received!*\n\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📸 Type: Screenshot\n🆔 ID: \`${submissionId}\`\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
    );

    let channel = task.submissionChannel || await getConfig("default_submission_channel", null) || task.alertChannel;
    if (channel && channel !== "Not Set") {
      let caption = `📸 *New Task Submission!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 \`${userId}\`\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📋 Type: 📸 Screenshot\n🆔 Sub ID: \`${submissionId}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(channel, photo.file_id, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
  }

  // ✅ BROADCAST PHOTO
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
});

// ============================================================
// 📨 FORWARD MESSAGE HANDLER (Task submissions)
// ============================================================
bot.on("message:forward_origin", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state && state.startsWith("WAITING_TASK_FORWARD_")) {
    let taskId = state.replace("WAITING_TASK_FORWARD_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }

    let timer = await TaskTimer.findOne({ userId, taskId });
    if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
      delete userState[userId];
      return ctx.reply("⌛ Time expired!");
    }

    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    let forwardFrom = ctx.message.forward_origin?.sender_user?.first_name ||
                      ctx.message.forward_origin?.chat?.title ||
                      ctx.message.forward_origin?.sender_user_name ||
                      "Unknown";

    await TaskSubmission.create({
      submissionId, userId,
      userName: ctx.from.first_name || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward,
      submissionType: "forward",
      forwardMessageId: ctx.message.message_id,
      forwardFromChat: forwardFrom,
      photoFileId: `FORWARD: ${forwardFrom}`,
      status: "Pending"
    });
    delete userState[userId];

    await ctx.reply(
      `⏳ *Submission Received!*\n\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📨 Type: Forward Link\n🆔 ID: \`${submissionId}\`\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
    );

    let channel = task.submissionChannel || await getConfig("default_submission_channel", null) || task.alertChannel;
    if (channel && channel !== "Not Set") {
      try {
        await ctx.api.forwardMessage(channel, userId, ctx.message.message_id);
      } catch (e) {}
      let caption = `📨 *New Task Submission!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 \`${userId}\`\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📋 Type: 📨 Forward Link\n🆔 Sub ID: \`${submissionId}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendMessage(channel, caption, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
    return;
  }

  // ✅ WAITING_TASK_SUBMIT_ (photo/forward/link submission)
  if (state && state.startsWith("WAITING_TASK_SUBMIT_")) {
    let taskId = state.replace("WAITING_TASK_SUBMIT_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }

    let timer = await TaskTimer.findOne({ userId, taskId });
    if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
      delete userState[userId];
      return ctx.reply("⌛ Time expired!");
    }

    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    let forwardFrom = ctx.message.forward_origin?.sender_user?.first_name ||
                      ctx.message.forward_origin?.chat?.title ||
                      ctx.message.forward_origin?.sender_user_name ||
                      "Unknown";

    await TaskSubmission.create({
      submissionId, userId,
      userName: ctx.from.first_name || "User",
      taskId: task.taskId, taskTitle: task.title,
      reward: task.reward,
      submissionType: "forward",
      forwardMessageId: ctx.message.message_id,
      forwardFromChat: forwardFrom,
      photoFileId: `FORWARD: ${forwardFrom}`,
      status: "Pending"
    });
    delete userState[userId];

    await ctx.reply(
      `⏳ *Submission Received!*\n\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📨 Type: Forward Link\n🆔 ID: \`${submissionId}\`\n\n🕐 Admin will verify shortly.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
    );

    let channel = task.submissionChannel || await getConfig("default_submission_channel", null) || task.alertChannel;
    if (channel && channel !== "Not Set") {
      try {
        await ctx.api.forwardMessage(channel, userId, ctx.message.message_id);
      } catch (e) {}
      let caption = `📨 *New Task Submission!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 \`${userId}\`\n📌 Task: ${task.title}\n💰 Reward: ₹${task.reward}\n📋 Type: 📨 Forward Link\n🆔 Sub ID: \`${submissionId}\``;
      let kb = new InlineKeyboard()
        .text("✅ Approve", `task_app_${submissionId}`)
        .text("❌ Reject", `task_rej_${submissionId}`);
      try { await ctx.api.sendMessage(channel, caption, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {}
    }
    return;
  }
});

// ============================================================
// 🎯 TASK SUBMIT — Photo / Forward / Link options
// ============================================================
bot.callbackQuery(/^task_sub_photo_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("task_sub_photo_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.reply("❌ Task not found!");
  if (task.completedUsers.includes(userId)) return ctx.reply("❌ Already completed!");

  let timer = await TaskTimer.findOne({ userId, taskId });
  if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
    return ctx.answerCallbackQuery({ text: "⌛ Time expired!", show_alert: true });
  }

  userState[userId] = `WAITING_TASK_PHOTO_${taskId}`;

  let header = `📸 *Screenshot Submission*\n\n📋 ${task.title}\n💰 ₹${task.reward}`;
  let timeMsg = "";
  if (task.timeLimitEnabled && task.timeLimitMinutes > 0 && timer && timer.expiresAt) {
    timeMsg = formatTimeDisplay(task, timer.expiresAt);
  }
  let body = header + "\n";
  if (timeMsg) body += `\n${timeMsg}\n`;
  body += `\n📷 Send your screenshot now:`;

  await ctx.editMessageText(body, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task")
  }).catch(() => {});
});

bot.callbackQuery(/^task_sub_forward_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("task_sub_forward_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.reply("❌ Task not found!");
  if (task.completedUsers.includes(userId)) return ctx.reply("❌ Already completed!");

  let timer = await TaskTimer.findOne({ userId, taskId });
  if (timer && (timer.status === "expired" || new Date() > timer.expiresAt)) {
    return ctx.answerCallbackQuery({ text: "⌛ Time expired!", show_alert: true });
  }

  userState[userId] = `WAITING_TASK_FORWARD_${taskId}`;

  let header = `📨 *Forward Link Submission*\n\n📋 ${task.title}\n💰 ₹${task.reward}`;
  let timeMsg = "";
  if (task.timeLimitEnabled && task.timeLimitMinutes > 0 && timer && timer.expiresAt) {
    timeMsg = formatTimeDisplay(task, timer.expiresAt);
  }
  let body = header + "\n";
  if (timeMsg) body += `\n${timeMsg}\n`;
  body += `\n📨 Forward a message or paste a link:`;

  await ctx.editMessageText(body, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Cancel", "canc_task")
  }).catch(() => {});
});

// ============================================================
// 🎯 DO TASK — User opens task
// ============================================================
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "❌ Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) {
    return ctx.answerCallbackQuery({ text: "❌ Already completed!", show_alert: true });
  }

  let timer = await TaskTimer.findOne({ userId, taskId });
  if (timer) {
    if (timer.status === "expired" || new Date() > timer.expiresAt) {
      if (timer.status !== "expired") {
        timer.status = "expired";
        await timer.save();
      }
      return ctx.answerCallbackQuery({ text: "⌛ Time expired!", show_alert: true });
    }
  }

  let expiresAt = null;
  if (task.timeLimitEnabled && task.timeLimitMinutes > 0) {
    if (!timer) {
      expiresAt = new Date(Date.now() + task.timeLimitMinutes * 60 * 1000);
      await TaskTimer.create({
        userId, taskId,
        startedAt: new Date(),
        expiresAt,
        status: "active"
      });
    } else {
      expiresAt = timer.expiresAt;
    }
  }

  await ctx.answerCallbackQuery();

  let header =
    `📋 *${task.title}*\n` +
    `💰 ₹${task.reward}\n` +
    `🔗 ${task.link}` +
    (task.description ? `\n📄 ${task.description}` : "");

  let timeMsg = "";
  if (task.timeLimitEnabled && task.timeLimitMinutes > 0 && expiresAt) {
    timeMsg = formatTimeDisplay(task, expiresAt);
  }

  let promptText = `📤 *Choose submission type:*`;

  let body = header + "\n";
  if (timeMsg) body += `\n${timeMsg}\n`;
  body += `\n${promptText}`;

  let kb = new InlineKeyboard()
    .text("📸 Screenshot", `task_sub_photo_${taskId}`)
    .text("📨 Forward Link", `task_sub_forward_${taskId}`)
    .row()
    .text("❌ Cancel", "canc_task");

  await ctx.editMessageText(body, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

bot.callbackQuery("canc_task", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled." }).catch(() => {});
  await ctx.editMessageText("❌ Cancelled.").catch(() => {});
});

// ============================================================
// 🎁 GIFT CLAIM / CREATE
// ============================================================
bot.callbackQuery("gift_claim", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  userState[userId] = "WAITING_FOR_GIFT_REDEEM";
  await ctx.editMessageText(
    `💸 Send Gift Code To Claim Reward!`
  ).catch(() => {});
});

bot.callbackQuery("gift_create", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;

  if (!(await isAdmin(userId))) {
    return ctx.answerCallbackQuery({
      text: "❌ Only admins can create gift codes!",
      show_alert: true
    });
  }

  // Get next order
  let maxOrderTask = await Task.findOne({}).sort({ order: -1 });
  let nextOrder = (maxOrderTask?.order || 0) + 1;

  let autoId = "T" + Date.now().toString().slice(-8);
  userState[userId] = {
    action: "new_task_form",
    data: {
      taskId: autoId,
      title: "",
      reward: 0,
      link: "",
      description: "",
      order: nextOrder
    }
  };

  await renderNewTaskForm(ctx);
});

// ============================================================
// 📝 NEW TASK FORM — Render
// ============================================================
async function renderNewTaskForm(ctx) {
  let userId = ctx.from.id;
  let st = userState[userId];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;

  let codeIcon = d.code || d.taskId ? "✅" : "⚪";
  let rewardIcon = d.reward > 0 ? "✅" : "⚪";
  let limitIcon = (d.userLimit !== null && d.userLimit !== undefined && d.userLimit !== 0) ? "✅" : (d.userLimit === 0 ? "✅" : "⚪");

  // For task form
  let titleIcon = d.title ? "✅" : "⚪";
  let linkIcon = d.link ? "✅" : "⚪";

  let text =
    `✨ *Add New Task*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 *Choose what to set:*`;

  let kb = new InlineKeyboard()
    .text(`${codeIcon} Task ID`, "ntf_edit_id").row()
    .text(`${titleIcon} Title`, "ntf_edit_title").row()
    .text(`${rewardIcon} Reward`, "ntf_edit_reward").row()
    .text(`${linkIcon} Link`, "ntf_edit_link").row()
    .text(`📄 Description`, "ntf_edit_desc").row()
    .text("✅ Create Now", "ntf_create").row()
    .text("🔙 Back", "adm_tasks_manager");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
  }
}

// Task ID button
bot.callbackQuery("ntf_edit_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;
  let text =
    `🆔 *Task ID*\n\n━━━━━━━━━━━━━━━━━━━━\n\nCurrent: \`${d.taskId || "Not Set"}\`\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit ID", "ntf_set_id").row()
    .text("🎲 Regenerate", "ntf_regen_id").row()
    .text("🔙 Back", "ntf_back_to_form");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_set_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.substep = "id";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `📝 *Send new Task ID:*\n\n📌 Example: \`T1\`, \`TASK01\`\n\n⚠️ Must be unique (2-20 chars)`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "ntf_edit_id") }
  ).catch(() => {});
});

bot.callbackQuery("ntf_regen_id", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🎲 New ID generated!" });
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.data.taskId = "T" + Date.now().toString().slice(-8);
  userState[ctx.from.id] = st;
  await rerender(ctx, "ntf_edit_id");
});

bot.callbackQuery("ntf_back_to_form", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await renderNewTaskForm(ctx);
});

// Title
bot.callbackQuery("ntf_edit_title", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;
  let text = `📝 *Task Title*\n\n━━━━━━━━━━━━━━━━━━━━\n\nCurrent: ${d.title ? `\`${d.title}\`` : "`Not Set`"}\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Title", "ntf_set_title").row()
    .text("🗑️ Clear", "ntf_clear_title").row()
    .text("🔙 Back", "ntf_back_to_form");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_set_title", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.substep = "title";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `📝 *Send task title:*\n\n📌 Example: \`Subscribe My Channel\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "ntf_edit_title") }
  ).catch(() => {});
});

bot.callbackQuery("ntf_clear_title", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared" });
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.data.title = "";
  userState[ctx.from.id] = st;
  await rerender(ctx, "ntf_edit_title");
});

// Reward
bot.callbackQuery("ntf_edit_reward", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;
  let text = `💰 *Task Reward*\n\n━━━━━━━━━━━━━━━━━━━━\n\nCurrent: ${d.reward > 0 ? `\`₹${d.reward}\`` : "`Not Set`"}\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Reward", "ntf_set_reward").row()
    .text("🗑️ Clear", "ntf_clear_reward").row()
    .text("🔙 Back", "ntf_back_to_form");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_set_reward", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.substep = "reward";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `💰 *Send reward amount:*\n\n📌 Example: \`10\` (= ₹10)\n\n⚠️ Must be positive number`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "ntf_edit_reward") }
  ).catch(() => {});
});

bot.callbackQuery("ntf_clear_reward", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared" });
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.data.reward = 0;
  userState[ctx.from.id] = st;
  await rerender(ctx, "ntf_edit_reward");
});

// Link
bot.callbackQuery("ntf_edit_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;
  let text = `🔗 *Task Link*\n\n━━━━━━━━━━━━━━━━━━━━\n\nCurrent: ${d.link ? `\`${d.link}\`` : "`Not Set`"}\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Link", "ntf_set_link").row()
    .text("🗑️ Clear", "ntf_clear_link").row()
    .text("🔙 Back", "ntf_back_to_form");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_set_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.substep = "link";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `🔗 *Send task link:*\n\n📌 Example: \`https://t.me/channel\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "ntf_edit_link") }
  ).catch(() => {});
});

bot.callbackQuery("ntf_clear_link", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared" });
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.data.link = "";
  userState[ctx.from.id] = st;
  await rerender(ctx, "ntf_edit_link");
});

// Description
bot.callbackQuery("ntf_edit_desc", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;
  let text = `📄 *Task Description*\n\n━━━━━━━━━━━━━━━━━━━━\n\nCurrent: ${d.description ? `\`${d.description.substring(0, 50)}...\`` : "`Not Set`"}\n\nℹ️ Description is *optional*\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Description", "ntf_set_desc").row()
    .text("🗑️ Clear", "ntf_clear_desc").row()
    .text("🔙 Back", "ntf_back_to_form");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_set_desc", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.substep = "description";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `📄 *Send description:*\n\n📌 Example: \`Subscribe and get ₹10 instantly!\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "ntf_edit_desc") }
  ).catch(() => {});
});

bot.callbackQuery("ntf_clear_desc", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared" });
  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  st.data.description = "";
  userState[ctx.from.id] = st;
  await rerender(ctx, "ntf_edit_desc");
});

// Create task
bot.callbackQuery("ntf_create", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") {
    return ctx.answerCallbackQuery({ text: "❌ Session expired!", show_alert: true });
  }
  let d = st.data;

  if (!d.taskId) return ctx.answerCallbackQuery({ text: "❌ Task ID required!", show_alert: true });
  if (!d.title) return ctx.answerCallbackQuery({ text: "❌ Title required!", show_alert: true });
  if (!d.reward || d.reward <= 0) return ctx.answerCallbackQuery({ text: "❌ Reward required!", show_alert: true });
  if (!d.link) return ctx.answerCallbackQuery({ text: "❌ Link required!", show_alert: true });

  let existing = await Task.findOne({ taskId: d.taskId });
  if (existing) return ctx.answerCallbackQuery({ text: `❌ ID '${d.taskId}' already exists!`, show_alert: true });

  let preview =
    `✨ *Task Preview*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 ID: \`${d.taskId}\`\n` +
    `📝 Title: \`${d.title}\`\n` +
    `💰 Reward: \`₹${d.reward}\`\n` +
    `🔗 Link: \`${d.link}\`\n` +
    (d.description ? `📄 Desc: \`${d.description}\`\n` : "") +
    `\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ All fields validated`;

  let kb = new InlineKeyboard()
    .text("✅ Confirm Create", "ntf_confirm").row()
    .text("✏️ Edit", "ntf_back_to_form")
    .text("❌ Cancel", "adm_tasks_manager");

  await ctx.editMessageText(preview, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("ntf_confirm", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") return;
  let d = st.data;

  await Task.create({
    taskId: d.taskId,
    title: d.title,
    reward: d.reward,
    link: d.link,
    description: d.description || "",
    order: d.order || 0,
    alertChannel: await getConfig("default_task_alert_channel", "Not Set")
  });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Created", `${d.title}`, d.reward);
  delete userState[ctx.from.id];

  let success =
    `🎉 *Task Created Successfully!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 ID: \`${d.taskId}\`\n` +
    `📝 Title: \`${d.title}\`\n` +
    `💰 Reward: \`₹${d.reward}\`\n` +
    `🔗 Link: \`${d.link}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Task is now live!`;

  let kb = new InlineKeyboard()
    .text("👁️ View Task", `view_task_${d.taskId}`).row()
    .text("➕ Add Another", "adm_create_task").row()
    .text("🔙 Manage Tasks", "adm_tasks_manager");

  await ctx.editMessageText(success, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🎯 BALANCE CALLBACKS
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery("🔄 Refreshed!");
  try {
    let welcomeText = await getConfig("balance_welcome_text", "⭐ Welcome To Bot!");
    let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    let msg =
      `<b>${welcomeText}</b>\n\n` +
      `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
      `${DEFAULT_BALANCE_TEXT.balance} <code>₹${user.balance.toFixed(2)}</code>\n\n` +
      `${footerText}`;
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
    await ctx.editMessageText(msg, { reply_markup: await buildStyledKb(buttons, userId), parse_mode: "HTML" }).catch(() => {});
  } catch (e) {}
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  await ctx.answerCallbackQuery();
  try {
    let welcomeText = await getConfig("balance_welcome_text", "⭐ Welcome To Bot!");
    let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
    let msg =
      `<b>${welcomeText}</b>\n\n` +
      `${DEFAULT_BALANCE_TEXT.walletId} <code>${userId}</code>\n` +
      `${DEFAULT_BALANCE_TEXT.balance} <code>₹${user.balance.toFixed(2)}</code>\n\n` +
      `${footerText}`;
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

// ✅ ADD FUND BUTTON
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
// 🚀 WITHDRAW CALLBACKS (NEW GATEWAY + REGULAR)
// ============================================================

// ✅ Gateway Withdraw — using NEW key system
bot.callbackQuery(/^wd_gw_(.+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let gwKey = ctx.callbackQuery.data.replace("wd_gw_", "");
  let user = await getUser(userId);

  let gateway = await Gateway.findOne({ key: gwKey, status: true });
  if (!gateway) {
    return ctx.answerCallbackQuery({
      text: "❌ This gateway is currently disabled!",
      show_alert: true
    });
  }

  let gwType = gateway.type || "wallet";
  let details = gwType === "upi" ? user.upiId : (user.gatewayUpi || user.walletAccount);

  if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) {
    await ctx.answerCallbackQuery();
    if (gwType === "upi") {
      userState[userId] = `GATEWAY_UPI_WAIT_${gateway.name}`;
      return ctx.reply(
        `⚡ *${gateway.name} - First Time Setup*\n\n📝 Enter your *UPI ID*:\n\n📌 Example: \`yourname@upi\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
      );
    } else {
      userState[userId] = `GATEWAY_WALLET_WAIT_${gateway.name}`;
      return ctx.reply(
        `⚡ *${gateway.name} - First Time Setup*\n\n📝 Enter your *10-digit Mobile Number*:\n\n📌 Example: \`9876543210\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
      );
    }
  }

  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });

  userState[userId] = `WD_GW_AMT_${gwKey}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`💰 Send Total amount to withdraw`);
});

// ✅ Regular UPI Withdraw
bot.callbackQuery("wd_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let enabled = await isWithdrawEnabled("upi");
  if (!enabled) return ctx.answerCallbackQuery({ text: "❌ UPI withdrawal is currently disabled!", show_alert: true });

  let user = await getUser(userId);
  if (!user.upiId || user.upiId === "Not Set") {
    await ctx.answerCallbackQuery({ text: "❌ UPI Not Linked!", show_alert: true });
    let kb = new InlineKeyboard().text("⚡ Add UPI Now", "wd_add_upi_start").row().text("🔙 Back", "back_to_balance");
    return ctx.reply(`❌ *UPI Not Linked!*\n\n📝 Add UPI first.`, { parse_mode: "Markdown", reply_markup: kb });
  }
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[userId] = "WD_AMT_UPI";
  await ctx.answerCallbackQuery();
  await ctx.reply(`💰 Send Total amount to withdraw`);
});

// ✅ Bank Withdraw
bot.callbackQuery("wd_bank", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let enabled = await isWithdrawEnabled("bank");
  if (!enabled) return ctx.answerCallbackQuery({ text: "❌ Bank withdrawal is currently disabled!", show_alert: true });

  let user = await getUser(userId);
  if (!user.bankAccNo || user.bankAccNo === "Not Set") {
    await ctx.answerCallbackQuery({ text: "❌ Bank Not Linked!", show_alert: true });
    let kb = new InlineKeyboard().text("🏦 Add Bank Now", "wd_add_bank_start").row().text("🔙 Back", "back_to_balance");
    return ctx.reply(`❌ *Bank Not Linked!*\n\n📝 Add Bank first.`, { parse_mode: "Markdown", reply_markup: kb });
  }
  let minW = await getConfig("min_withdraw", 10);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[userId] = "WD_AMT_Bank";
  await ctx.answerCallbackQuery();
  await ctx.reply(`💰 Send Total amount to withdraw`);
});

// ✅ Setup from payout method — new key system
bot.callbackQuery(/^set_gw_(.+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let gwKey = ctx.callbackQuery.data.replace("set_gw_", "");
  let gateway = await Gateway.findOne({ key: gwKey, status: true });
  if (!gateway) {
    return ctx.answerCallbackQuery({ text: "❌ Gateway not found!", show_alert: true });
  }

  let gwType = gateway.type || "wallet";
  if (gwType === "upi") {
    userState[userId] = `GATEWAY_UPI_WAIT_${gateway.name}`;
    await ctx.editMessageText(
      `⚡ *${gateway.name} Setup*\n\n📝 Enter your *UPI ID*:\n\n📌 Example: \`yourname@upi\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
    ).catch(() => {});
  } else {
    userState[userId] = `GATEWAY_WALLET_WAIT_${gateway.name}`;
    await ctx.editMessageText(
      `⚡ *${gateway.name} Setup*\n\n📝 Enter your *10-digit Mobile Number*:\n\n📌 Example: \`9876543210\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "back_to_balance") }
    ).catch(() => {});
  }
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
// 🏧 WITHDRAWAL CONFIRM FLOW
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  let text = ctx.message.text.trim();

  if (!state) return next();

  // ✅ Gateway Amount (new key system)
  if (state.startsWith("WD_GW_AMT_")) {
    let gwKey = state.replace("WD_GW_AMT_", "");
    delete userState[userId];
    let amount = parseFloat(text);
    let user = await getUser(userId);
    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
      return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
    }
    if (user.balance < amount) return ctx.reply("❌ Insufficient!");

    let gateway = await Gateway.findOne({ key: gwKey, status: true });
    if (!gateway) return ctx.reply("❌ Gateway not found!");
    let gwType = gateway.type || "wallet";
    let details = gwType === "upi" ? user.upiId : (user.gatewayUpi || user.walletAccount);

    let taxPercent = await getConfig("tax_percent", 0);
    let { tax, afterTax } = calculateTax(amount, taxPercent);

    userState[userId] = `WD_GW_CONFIRM_${gwKey}_${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `conf_gw_wd_${gwKey}_${amount}`)
      .text("❌ Cancel", "canc_wd");
    return ctx.reply(
      `🤘 *Withdrawal Confirmation*\n\n` +
      `🔰 *Amount :* ${amount} INR\n` +
      `⭐️ *You receive :* ${afterTax.toFixed(2)} INR ( Tax : ₹${tax.toFixed(2)} )\n\n` +
      `🗳️ ${gwType === "upi" ? "⚡" : "💰"} *${gateway.name} :* ${details}\n` +
      `✌️ Confirm Your Transaction By Clicking On '✅ Approve'`,
      { reply_markup: kb, parse_mode: "Markdown" }
    );
  }

  // ✅ UPI Amount
  if (state === "WD_AMT_UPI") {
    delete userState[userId];
    let amount = parseFloat(text);
    let user = await getUser(userId);
    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
      return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
    }
    if (user.balance < amount) return ctx.reply("❌ Insufficient!");

    let taxPercent = await getConfig("tax_percent", 0);
    let { tax, afterTax } = calculateTax(amount, taxPercent);

    userState[userId] = `WD_CONFIRM_UPI_${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `conf_wd_UPI_${amount}`)
      .text("❌ Cancel", "canc_wd");
    return ctx.reply(
      `🤘 *Withdrawal Confirmation*\n\n` +
      `🔰 *Amount :* ${amount} INR\n` +
      `⭐️ *You receive :* ${afterTax.toFixed(2)} INR ( Tax : ₹${tax.toFixed(2)} )\n\n` +
      `🗳️ ⚡ *UPI :* ${user.upiId}\n` +
      `✌️ Confirm Your Transaction By Clicking On '✅ Approve'`,
      { reply_markup: kb, parse_mode: "Markdown" }
    );
  }

  // ✅ Bank Amount
  if (state === "WD_AMT_Bank") {
    delete userState[userId];
    let amount = parseFloat(text);
    let user = await getUser(userId);
    let minW = await getConfig("min_withdraw", 10);
    let maxW = await getConfig("max_withdraw", 10000);
    if (isNaN(amount) || amount <= 0 || amount < minW || amount > maxW) {
      return ctx.reply(`❌ Min ₹${minW} | Max ₹${maxW}`);
    }
    if (user.balance < amount) return ctx.reply("❌ Insufficient!");

    let taxPercent = await getConfig("tax_percent", 0);
    let { tax, afterTax } = calculateTax(amount, taxPercent);

    userState[userId] = `WD_CONFIRM_Bank_${amount}`;
    let kb = new InlineKeyboard()
      .text("✅ Approve", `conf_wd_Bank_${amount}`)
      .text("❌ Cancel", "canc_wd");
    return ctx.reply(
      `🤘 *Withdrawal Confirmation*\n\n` +
      `🔰 *Amount :* ${amount} INR\n` +
      `⭐️ *You receive :* ${afterTax.toFixed(2)} INR ( Tax : ₹${tax.toFixed(2)} )\n\n` +
      `🗳️ 🏦 *Bank :* ${user.bankAccNo}\n` +
      `🔢 *IFSC :* ${user.bankIfsc}\n` +
      `✌️ Confirm Your Transaction By Clicking On '✅ Approve'`,
      { reply_markup: kb, parse_mode: "Markdown" }
    );
  }

  return next();
});

bot.callbackQuery("canc_wd", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText("❌ *Closed*", { parse_mode: "Markdown" }).catch(() => {});
});

// ✅ Gateway Withdrawal Approve — new key
bot.callbackQuery(/^conf_gw_wd_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("conf_gw_wd_", "").split("_");
  let amount = parseFloat(parts[parts.length - 1]);
  let gwKey = parts.slice(0, parts.length - 1).join("_");
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  let gateway = await Gateway.findOne({ key: gwKey, status: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "❌ Gateway missing", show_alert: true });

  await ctx.answerCallbackQuery();
  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${gateway.name}`, -amount);

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await ctx.editMessageText("⏳ *Processing...*", { parse_mode: "Markdown" });
  } catch (e) {}

  let gwType = gateway.type || "wallet";
  let details = gwType === "upi" ? user.upiId : (user.gatewayUpi || user.walletAccount);

  let result = await processGatewayPayment({
    gatewayKey: gateway.key,
    number: details,
    amount: amount,
    comment: `Withdrawal #${userWithdrawalCount}`,
    userId: userId,
    orderId: withdrawalId
  });

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  if (result.status === 'SUCCESS') {
    let txnNumber = result.txnNumber || generateTxnNumber();
    await Withdrawal.create({
      withdrawalId, userId, userWithdrawalCount,
      amount, method: gateway.name, details, status: "Approved",
      gateway: gateway.name, txnNumber,
      approvedBy: "Auto Gateway", approvedAt: new Date()
    });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });

    try {
      await ctx.editMessageText(
        `🎉 Your Withdrawal of Rs.${amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${details}\n` +
        `🚀 Transaction ID ==> ${txnNumber}\n` +
        `🗓 Date ==> ${formatDateTime(new Date())}\n\n` +
        `✅ Please Check Your ${gateway.name} Account!`,
        { reply_markup: new InlineKeyboard().url("📄 Check Receipt", receiptUrl) }
      );
    } catch (e) {}

    let payoutChannel = await getConfig("payout_channel", null);
    if (payoutChannel && payoutChannel !== "Not Set") {
      let maskedAddr = gwType === "upi" ? halfMaskUPI(details) : halfMaskWallet(details);
      let gwResponse = result.message || "";
      if (gwResponse.length > 200) gwResponse = gwResponse.substring(0, 200) + "...";
      try {
        await ctx.api.sendMessage(payoutChannel,
          `✅ New Withdrawal Processed ✅\n\n` +
          `🟢 User : ${userId}\n` +
          `✌️ Remaining Balance :- ${user.balance.toFixed(2)}\n\n` +
          `🚀 Amount : ${amount} INR (-)\n` +
          `⛔ Address : ${maskedAddr}\n\n` +
          `🌐 Gateway : ${gateway.name}\n` +
          `💡 Bot: @${ctx.me.username}\n\n` +
          `⚠️ Response: ${gwResponse}`,
          { reply_markup: new InlineKeyboard().url("📊 Check Status", receiptUrl), disable_web_page_preview: true }
        );
      } catch (e) {}
    }
    return;
  }

  // Failed — Refund
  user.balance += amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
  await user.save();
  await logBalanceHistory(userId, `Withdrawal Failed (Refunded)`, amount);

  let failText =
    `❌ Withdrawal Failed!\n\n` +
    `📛 Reason: ${result.message || "Unknown"}\n` +
    `💵 Refunded: ₹${amount.toFixed(2)}\n` +
    `💰 New Balance: ₹${user.balance.toFixed(2)}`;

  try {
    await ctx.editMessageText(failText, { parse_mode: "Markdown" });
  } catch (e) {
    try { await ctx.reply(failText, { parse_mode: "Markdown" }); } catch (e2) {}
  }

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel && payoutChannel !== "Not Set") {
    let maskedAddr = gwType === "upi" ? halfMaskUPI(details) : halfMaskWallet(details);
    try {
      await ctx.api.sendMessage(payoutChannel,
        `❌ New Withdrawal Failed ❌\n\n` +
        `🟢 User : ${userId}\n` +
        `✌️ Remaining Balance :- ${user.balance.toFixed(2)}\n\n` +
        `🚀 Amount : ${amount} INR (Refunded)\n` +
        `⛔ Address : ${maskedAddr}\n\n` +
        `🌐 Gateway : ${gateway.name}\n` +
        `💡 Bot: @${ctx.me.username}\n\n` +
        `⚠️ Response: ${result.message}`,
        { disable_web_page_preview: true }
      );
    } catch (e) {}
  }
});

// ✅ UPI/Bank Withdrawal Approve — Manual Pending
bot.callbackQuery(/^conf_wd_(UPI|Bank)_/, async (ctx) => {
  let method = ctx.match[1];
  let amount = parseFloat(ctx.callbackQuery.data.replace(`conf_wd_${method}_`, ""));
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  await ctx.answerCallbackQuery();
  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method}`, -amount);

  let details = method === "UPI" ? user.upiId : `${user.bankAccNo}, ${user.bankIfsc}`;
  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  try {
    await ctx.editMessageText("⏳ *Processing...*", { parse_mode: "Markdown" });
  } catch (e) {}

  await Withdrawal.create({
    withdrawalId, userId, userWithdrawalCount,
    amount, method, details, status: "Pending",
    gateway: "MANUAL", txnNumber: "",
    approvedBy: "", approvedAt: null
  });

  let methodIcon = method === "UPI" ? "⚡" : "🏦";
  let methodLabel = method === "UPI" ? "UPI" : "Bank";

  try {
    await ctx.editMessageText(
      `✅ *Withdrawal Request Submitted!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Amount: ₹${amount.toFixed(2)}\n` +
      `${methodIcon} ${methodLabel}: \`${details}\`\n` +
      `🆔 Ref: \`TXN${withdrawalId}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⏳ *Status: PENDING*\n\n` +
      `🕐 Admin will verify and process shortly.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("📄 Check Status", receiptUrl) }
    );
  } catch (e) {}

  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel && payoutChannel !== "Not Set") {
    let kb = new InlineKeyboard()
      .text("✅ Approve", `wdman_app_${withdrawalId}`)
      .text("❌ Reject", `wdman_rej_${withdrawalId}`)
      .row()
      .url("📊 Check Status", receiptUrl);
    try {
      await ctx.api.sendMessage(payoutChannel,
        `⚠️ *New ${methodLabel} Payout Request!* (#${userWithdrawalCount})\n\n` +
        `👤 User: \`${userId}\`\n` +
        `💰 Amount: \`₹${amount.toFixed(2)}\`\n` +
        `${methodIcon} ${methodLabel}: \`${details}\`\n` +
        `🆔 Transaction ID: \`TXN${withdrawalId}\`\n\n` +
        `📊 Status: ⏳ Pending`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
    } catch (e) {}
  }
});

// ✅ ADMIN — Approve UPI/Bank Manual Withdrawal
bot.callbackQuery(/^wdman_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let withdrawalId = ctx.callbackQuery.data.replace("wdman_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId });
  if (!wd || wd.status !== "Pending") {
    return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  }

  let txnNumber = generateTxnNumber();
  wd.status = "Approved";
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", `${wd.method} Withdrawal Approved`, `₹${wd.amount} to ${wd.userId}`, wd.amount, wd.userId);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let methodIcon = wd.method === "UPI" ? "⚡" : "🏦";
  let methodLabel = wd.method === "UPI" ? "UPI" : "Bank";
  let maskedAddr = wd.method === "UPI" ? halfMaskUPI(wd.details) : halfMaskBank(wd.details);

  let updatedMsg =
    `⚠️ *New ${methodLabel} Payout Request!* (#${wd.userWithdrawalCount || 1})\n\n` +
    `👤 User: \`${wd.userId}\`\n` +
    `💰 Amount: \`₹${wd.amount.toFixed(2)}\`\n` +
    `${methodIcon} ${methodLabel}: \`${maskedAddr}\`\n` +
    `🆔 Transaction ID: \`TXN${withdrawalId}\`\n\n` +
    `📊 Status: ✅ Approved\n` +
    `✔️ By ${wd.approvedBy} at ${formatDateTime(new Date())}`;

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  let kb = new InlineKeyboard().url("📊 Check Status", receiptUrl);

  try {
    await ctx.editMessageText(updatedMsg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (e) {}

  try {
    await ctx.api.sendMessage(wd.userId,
      `🎉 *Withdrawal Approved!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Amount: ₹${wd.amount.toFixed(2)}\n` +
      `${methodIcon} ${methodLabel}: \`${wd.details}\`\n` +
      `🆔 Transaction ID: \`${txnNumber}\`\n` +
      `🗓 Date: ${formatDateTime(new Date())}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Please check your ${methodLabel} account!`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("📄 Check Receipt", receiptUrl) }
    );
  } catch (e) {}
});

// ✅ ADMIN — Reject UPI/Bank Manual Withdrawal
bot.callbackQuery(/^wdman_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });

  let withdrawalId = ctx.callbackQuery.data.replace("wdman_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId });
  if (!wd || wd.status !== "Pending") {
    return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  }

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, "Withdrawal Rejected (Refunded)", wd.amount);

  wd.status = "Rejected";
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", `${wd.method} Withdrawal Rejected`, `₹${wd.amount} from ${wd.userId}`, wd.amount, wd.userId);

  await ctx.answerCallbackQuery({ text: "❌ Rejected & Refunded!" });

  let methodIcon = wd.method === "UPI" ? "⚡" : "🏦";
  let methodLabel = wd.method === "UPI" ? "UPI" : "Bank";
  let maskedAddr = wd.method === "UPI" ? halfMaskUPI(wd.details) : halfMaskBank(wd.details);

  let updatedMsg =
    `⚠️ *New ${methodLabel} Payout Request!* (#${wd.userWithdrawalCount || 1})\n\n` +
    `👤 User: \`${wd.userId}\`\n` +
    `💰 Amount: \`₹${wd.amount.toFixed(2)}\`\n` +
    `${methodIcon} ${methodLabel}: \`${maskedAddr}\`\n` +
    `🆔 Transaction ID: \`TXN${withdrawalId}\`\n\n` +
    `📊 Status: ❌ Rejected\n` +
    `✔️ By ${wd.approvedBy} at ${formatDateTime(new Date())}\n` +
    `💵 Refunded to wallet`;

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;

  let kb = new InlineKeyboard().url("📊 Check Status", receiptUrl);

  try {
    await ctx.editMessageText(updatedMsg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (e) {}

  try {
    await ctx.api.sendMessage(wd.userId,
      `❌ *Withdrawal Rejected*\n\n💰 Amount: ₹${wd.amount.toFixed(2)}\n💵 Refunded: ₹${wd.amount.toFixed(2)}\n💰 New Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {}
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
    `✅ *QUICK PAY SUCCESSFUL*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *To:* ${receiver.firstName || "User"}\n🆔 \`${receiver.userId}\`\n\n` +
    `💰 *Amount:* ₹${amount.toFixed(2)}\n\n` +
    `💵 *Your Balance:* ₹${senderBefore.toFixed(2)} → ₹${sender.balance.toFixed(2)}\n` +
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
// 🎯 TASK APPROVE / REJECT / MOVE
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Approved", `${sub.taskTitle}`, sub.reward, sub.userId);
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  if (ctx.callbackQuery.message?.caption) {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ APPROVED`,
    }).catch(() => {});
  } else {
    try {
      await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n✅ APPROVED`, { parse_mode: "Markdown" });
    } catch (e) {}
  }

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

  if (ctx.callbackQuery.message?.caption) {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ REJECTED`,
    }).catch(() => {});
  } else {
    try {
      await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ REJECTED`, { parse_mode: "Markdown" });
    } catch (e) {}
  }
});

// MOVE UP
bot.callbackQuery(/^task_move_up_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_move_up_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "❌ Task not found!", show_alert: true });

  let allTasks = await Task.find({}).sort({ order: 1, createdAt: 1 });
  let currentIndex = allTasks.findIndex(t => t.taskId === tId);
  if (currentIndex <= 0) return ctx.answerCallbackQuery({ text: "⚠️ Already at top!", show_alert: true });

  let prevTask = allTasks[currentIndex - 1];
  let currentOrder = task.order || currentIndex;
  let prevOrder = prevTask.order || (currentIndex - 1);
  if (currentOrder === prevOrder) {
    currentOrder = currentIndex;
    prevOrder = currentIndex - 1;
  }
  await Task.updateOne({ taskId: task.taskId }, { order: prevOrder });
  await Task.updateOne({ taskId: prevTask.taskId }, { order: currentOrder });
  await ctx.answerCallbackQuery({ text: "⬆️ Moved up!" });
  await rerender(ctx, "adm_tasks_manager");
});

// MOVE DOWN
bot.callbackQuery(/^task_move_down_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_move_down_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "❌ Task not found!", show_alert: true });

  let allTasks = await Task.find({}).sort({ order: 1, createdAt: 1 });
  let currentIndex = allTasks.findIndex(t => t.taskId === tId);
  if (currentIndex >= allTasks.length - 1) return ctx.answerCallbackQuery({ text: "⚠️ Already at bottom!", show_alert: true });

  let nextTask = allTasks[currentIndex + 1];
  let currentOrder = task.order || currentIndex;
  let nextOrder = nextTask.order || (currentIndex + 1);
  if (currentOrder === nextOrder) {
    currentOrder = currentIndex;
    nextOrder = currentIndex + 1;
  }
  await Task.updateOne({ taskId: task.taskId }, { order: nextOrder });
  await Task.updateOne({ taskId: nextTask.taskId }, { order: currentOrder });
  await ctx.answerCallbackQuery({ text: "⬇️ Moved down!" });
  await rerender(ctx, "adm_tasks_manager");
});

// ============================================================
// 🎁 GIFT CODE — VIEW / EDIT / DELETE
// ============================================================
bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return ctx.reply("❌ Code not found!");

  let used = gc.usedUsers.length;
  let isActive = used < gc.maxUses;
  let statusIcon = isActive ? "🟢 Active" : "🔴 Used Up";

  let text =
    `🎁 *Code: ${gc.code}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 Code: \`${gc.code}\`\n` +
    `💰 Amount: ₹${gc.amount}\n` +
    `👥 Max Uses: ${gc.maxUses}\n` +
    `✅ Used: ${used}/${gc.maxUses}\n` +
    `📊 Status: ${statusIcon}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit", `gc_edit_${gc.code}`)
    .text("🗑️ Remove", `gc_del_${gc.code}`)
    .row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return ctx.reply("❌ Code not found!");
  let text = `✏️ *Edit Code: ${gc.code}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose what to edit:*`;
  let kb = new InlineKeyboard()
    .text("🆔 Code Name", `gc_ename_${gc.code}`).row()
    .text("💰 Amount", `gc_eamt_${gc.code}`).row()
    .text("👥 Max Uses", `gc_emax_${gc.code}`).row()
    .text("🔙 Back", `gc_view_${gc.code}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^gc_ename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let oldCode = ctx.callbackQuery.data.replace("gc_ename_", "");
  userState[ctx.from.id] = `GC_EDIT_NAME_${oldCode}`;
  await ctx.editMessageText(
    `🆔 *Edit Code Name*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current: \`${oldCode}\`\n\n📝 Send new code name:\n\n📌 Example: \`WELCOME200\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${oldCode}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^gc_eamt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_eamt_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;
  userState[ctx.from.id] = `GC_EDIT_AMOUNT_${code}`;
  await ctx.editMessageText(
    `💰 *Edit Amount*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current: ₹${gc.amount}\n\n📝 Send new amount:\n\n📌 Example: \`150\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^gc_emax_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_emax_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;
  userState[ctx.from.id] = `GC_EDIT_MAX_${code}`;
  await ctx.editMessageText(
    `👥 *Edit Max Uses*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current: ${gc.maxUses}\n\n📝 Send new max uses:\n\n📌 Examples:\n• \`1\` — One time\n• \`10\` — 10 users\n• \`0\` — Unlimited`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^gc_del_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_del_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return ctx.reply("❌ Code not found!");
  let text =
    `⚠️ *Remove Code?*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 \`${gc.code}\`\n💰 ₹${gc.amount}\n👥 ${gc.usedUsers.length}/${gc.maxUses} used\n\n` +
    `⚠️ This action cannot be undone.`;
  let kb = new InlineKeyboard()
    .text("✅ Yes, Remove", `gc_del_confirm_${gc.code}`)
    .text("❌ Cancel", `gc_view_${gc.code}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^gc_del_confirm_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Removed!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_del_confirm_", "");
  await GiftCode.deleteOne({ code, type: "redeem" });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Redeem Code Deleted", `${code}`, 0, null);
  await ctx.editMessageText(
    `✅ *Code Removed!*\n\n🆔 \`${code}\` deleted successfully.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back to List", "adm_create_gift") }
  ).catch(() => {});
});

// ============================================================
// ✨ CREATE GIFT FORM (Admin)
// ============================================================
bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  userState[ctx.from.id] = {
    action: "create_gift_form",
    data: {
      code: "",
      reward: 0,
      userLimit: null
    }
  };

  await renderCreateGiftForm(ctx);
});

async function renderCreateGiftForm(ctx) {
  let userId = ctx.from.id;
  let st = userState[userId];
  if (!st || st.action !== "create_gift_form") return;
  let d = st.data;

  let codeIcon = d.code ? "✅" : "⚪";
  let rewardIcon = d.reward > 0 ? "✅" : "⚪";
  let limitIcon = (d.userLimit !== null && d.userLimit !== undefined) ? "✅" : "⚪";

  let text =
    `✨ *Create Gift Code*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose what to set:*`;

  let kb = new InlineKeyboard()
    .text(`${codeIcon} Code Name`, "cgf_set_code").row()
    .text(`${rewardIcon} Reward`, "cgf_set_reward").row()
    .text(`${limitIcon} User Limit`, "cgf_set_limit").row()
    .text("✅ Create Now", "cgf_create").row()
    .text("🔙 Back", "adm_create_gift");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
  }
}

bot.callbackQuery("cgf_set_code", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "create_gift_form") return;
  st.substep = "code";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `🆔 *Enter Code Name*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Send code name:\n\n📌 Example: \`WELCOME100\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back") }
  ).catch(() => {});
});

bot.callbackQuery("cgf_set_reward", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "create_gift_form") return;
  st.substep = "reward";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `💰 *Enter Your Reward*\n\n📝 Send reward amount:\n\n📌 Example: \`100\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back") }
  ).catch(() => {});
});

bot.callbackQuery("cgf_set_limit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let st = userState[ctx.from.id];
  if (!st || st.action !== "create_gift_form") return;
  st.substep = "limit";
  userState[ctx.from.id] = st;
  await ctx.editMessageText(
    `👥 *Enter User Limit*\n\n📝 Send maximum users:\n\n📌 Examples:\n• \`1\` — One time\n• \`10\` — 10 users\n• \`0\` — Unlimited`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "cgf_back") }
  ).catch(() => {});
});

bot.callbackQuery("cgf_back", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let st = userState[ctx.from.id];
  if (st && st.action === "create_gift_form") {
    st.substep = null;
    userState[ctx.from.id] = st;
  }
  await renderCreateGiftForm(ctx);
});

bot.callbackQuery("cgf_create", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userId = ctx.from.id;
  let st = userState[userId];
  if (!st || st.action !== "create_gift_form") return;
  let d = st.data;

  if (!d.code) return ctx.answerCallbackQuery({ text: "❌ Code required!", show_alert: true });
  if (!d.reward || d.reward <= 0) return ctx.answerCallbackQuery({ text: "❌ Reward required!", show_alert: true });
  if (d.userLimit === null || d.userLimit === undefined) return ctx.answerCallbackQuery({ text: "❌ User limit required!", show_alert: true });

  let limitDisplay = d.userLimit === 0 ? "Unlimited" : d.userLimit;

  let text =
    `✨ *Confirm Create?*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 Code: \`${d.code}\`\n💰 Reward: ₹${d.reward}\n👥 User Limit: ${limitDisplay}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✅ Confirm", "cgf_confirm")
    .text("✏️ Edit", "cgf_back")
    .text("❌ Cancel", "adm_create_gift");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("cgf_confirm", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userId = ctx.from.id;
  let st = userState[userId];
  if (!st || st.action !== "create_gift_form") return;
  let d = st.data;

  let existing = await GiftCode.findOne({ code: d.code, type: "redeem" });
  if (existing) return ctx.answerCallbackQuery({ text: `❌ Code '${d.code}' already exists!`, show_alert: true });

  let finalLimit = d.userLimit === 0 ? 999999 : d.userLimit;

  await GiftCode.create({
    code: d.code,
    amount: d.reward,
    type: "redeem",
    maxUses: finalLimit,
    usedUsers: []
  });

  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Gift Code Created", `${d.code} — ₹${d.reward}`, d.reward, null);
  delete userState[userId];

  let limitDisplay = d.userLimit === 0 ? "Unlimited" : d.userLimit;

  let text =
    `🎉 *Gift Code Created!*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 Code: \`${d.code}\`\n💰 Reward: ₹${d.reward}\n👥 Limit: ${limitDisplay}\n📊 Status: 🟢 Active\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit", `gc_view_${d.code}`)
    .text("🗑️ Delete", `gc_del_${d.code}`).row()
    .text("➕ Create Another", "adm_redeem_add").row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🎁 REDEEM CLAIM MESSAGE EDIT
// ============================================================
bot.callbackQuery("adm_redeem_msg_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "REDEEM_MSG_EDIT";
  let current = await getConfig("redeem_claim_message", `🎉 You have successfully claimed ₹{amount}!`);
  await ctx.editMessageText(
    `✏️ *Edit Claim Message*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 *Current:*\n\`${current}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\nℹ️ *Placeholders:*\n• \`{amount}\` — Code amount\n• \`{code}\` — Redeem code\n• \`{balance}\` — New balance\n• \`{name}\` — User name\n\n📝 Send new message:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_redeem") }
  ).catch(() => {});
});

bot.callbackQuery("adm_redeem_msg_preview", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let currentMsg = await getConfig("redeem_claim_message", `🎉 You have successfully claimed ₹{amount}!`);
  let preview = currentMsg
    .replace(/{amount}/g, "100.00")
    .replace(/{code}/g, "WELCOME100")
    .replace(/{balance}/g, "145.50")
    .replace(/{name}/g, "John");
  await ctx.editMessageText(
    `👁️ *Preview Message*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 *With sample data:*\n\n${preview}\n\n━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem") }
  ).catch(() => {});
});

// ============================================================
// 🎨 BALANCE PAGE EDIT
// ============================================================
bot.callbackQuery("adm_balance_text", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let welcome = await getConfig("balance_welcome_text", "⭐ Welcome To Bot!");
  let footer = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  let text =
    `📝 *Balance Page Edit*\n\n━━━━━━━━━━━━━━━━━━━━\n\n⭐ *Welcome Text:*\n\`${welcome}\`\n\n📝 *Footer Text:*\n\`${footer}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose what to edit:*`;
  let kb = new InlineKeyboard()
    .text("⭐ Edit Welcome Text", "adm_bal_welcome_edit").row()
    .text("📝 Edit Footer Text", "adm_bal_footer_edit").row()
    .text("🔄 Reset to Default", "adm_bal_reset").row()
    .text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_bal_welcome_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("balance_welcome_text", "⭐ Welcome To Bot!");
  userState[ctx.from.id] = "EDIT_BAL_WELCOME";
  await ctx.editMessageText(
    `✏️ *Edit Welcome Text*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current: \`${current}\`\n\n📝 Send new welcome text:\n\n📌 Example: \`⭐ Welcome To Our Bot!\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_balance_text") }
  ).catch(() => {});
});

bot.callbackQuery("adm_bal_footer_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  userState[ctx.from.id] = "EDIT_BAL_FOOTER";
  await ctx.editMessageText(
    `✏️ *Edit Footer Text*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current:\n\`${current}\`\n\n📝 Send new footer text:\n\n📌 Multi-line allowed`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_balance_text") }
  ).catch(() => {});
});

bot.callbackQuery("adm_bal_reset", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text =
    `⚠️ *Reset Balance Page Text?*\n\n━━━━━━━━━━━━━━━━━━━━\n\nThis will reset:\n• Welcome text\n• Footer text\n\nTo default values.`;
  let kb = new InlineKeyboard()
    .text("✅ Yes, Reset", "adm_bal_reset_yes")
    .text("❌ Cancel", "adm_balance_text");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_bal_reset_yes", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("balance_welcome_text", "⭐ Welcome To Bot!");
  await setConfig("balance_footer_text", "Built with security you can Trust.\nSupport that responds promptly");
  await rerender(ctx, "adm_balance_text");
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({}).sort({ order: 1, createdAt: 1 });
  let keyboard = new InlineKeyboard();

  if (tasks.length === 0) {
    let kb = new InlineKeyboard()
      .text("➕ New Task", "adm_create_task").row()
      .text("📢 Set Submission Channel", "set_submission_channel").row()
      .text("🔙 Back", "admin");

    let emptyText = `💡 *Manage Tasks*`;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(emptyText, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
    } else {
      await ctx.reply(emptyText, { reply_markup: kb, parse_mode: "Markdown" });
    }
    return;
  }

  let header =
    `💡 *Manage Tasks*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Total: ${tasks.length} task${tasks.length > 1 ? 's' : ''}\n\n━━━━━━━━━━━━━━━━━━━━`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(header, { parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(header, { parse_mode: "Markdown" });
  }

  for (let i = 0; i < tasks.length; i++) {
    let t = tasks[i];
    let rank = i + 1;
    let timeBadge = "";
    if (t.timeLimitEnabled && t.timeLimitMinutes > 0) {
      timeBadge = ` | ⏱️ ${formatMinutes(t.timeLimitMinutes)}`;
    }

    let taskMsg =
      `${rank}️⃣ *${t.title}*\n` +
      `💰 ₹${t.reward} | 👥 ${t.completedUsers?.length || 0} done${timeBadge}`;

    let taskKb = new InlineKeyboard()
      .text("👁️ View", `view_task_${t.taskId}`)
      .text("✏️ Edit", `edit_task_${t.taskId}`)
      .text("🗑️", `del_task_${t.taskId}`)
      .row()
      .text("⬆️ Move Up", `task_move_up_${t.taskId}`)
      .text("⬇️ Move Down", `task_move_down_${t.taskId}`);

    try {
      await ctx.api.sendMessage(ctx.from.id, taskMsg, {
        parse_mode: "Markdown",
        reply_markup: taskKb
      });
    } catch (e) {}
  }

  let bottomKb = new InlineKeyboard()
    .text("➕ New Task", "adm_create_task").row()
    .text("📢 Set Submission Channel", "set_submission_channel").row()
    .text("🔙 Back", "admin");

  try {
    await ctx.api.sendMessage(ctx.from.id,
      `━━━━━━━━━━━━━━━━━━━━\n\n👆 *Task Controls Above*`,
      { parse_mode: "Markdown", reply_markup: bottomKb }
    );
  } catch (e) {}
}

bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let st = userState[ctx.from.id];
  if (!st || st.action !== "new_task_form") {
    let maxOrderTask = await Task.findOne({}).sort({ order: -1 });
    let nextOrder = (maxOrderTask?.order || 0) + 1;
    let autoId = "T" + Date.now().toString().slice(-8);
    userState[ctx.from.id] = {
      action: "new_task_form",
      data: {
        taskId: autoId,
        title: "",
        reward: 0,
        link: "",
        description: "",
        order: nextOrder
      }
    };
  }

  await renderNewTaskForm(ctx);
});

bot.callbackQuery(/^view_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let timeStr = task.timeLimitEnabled ? `${formatMinutes(task.timeLimitMinutes)}` : "OFF";
  let msg =
    `📋 *Task Details*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 ID: \`${task.taskId}\`\n` +
    `📝 Title: ${task.title}\n` +
    `💰 Reward: ₹${task.reward}\n` +
    `🔗 Link: ${task.link}\n` +
    `📄 Desc: ${task.description || "Not Set"}\n` +
    `⏱️ Time: ${timeStr}\n` +
    `📢 Channel: ${task.submissionChannel || "Default"}\n` +
    `👥 Done: ${task.completedUsers?.length || 0}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit", `edit_task_${task.taskId}`).row()
    .text("📢 Set Channel", `task_set_channel_${task.taskId}`).row()
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^edit_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("edit_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.reply("❌ Task not found!");

  let timeStr = task.timeLimitEnabled
    ? `🟢 ON — ${formatMinutes(task.timeLimitMinutes)}`
    : "🔴 OFF";

  let text =
    `✏️ *Edit Task: ${task.title}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 Title: \`${task.title}\`\n` +
    `💰 Reward: \`₹${task.reward}\`\n` +
    `🔗 Link: \`${task.link}\`\n` +
    `📄 Description: \`${task.description || "Not Set"}\`\n` +
    `⏱️ Time Limit: \`${timeStr}\`\n` +
    `📢 Submission Channel: \`${task.submissionChannel || "Default"}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose what to edit:*`;

  let kb = new InlineKeyboard()
    .text("📌 Edit Title", `task_edit_title_${tId}`).row()
    .text("💰 Edit Reward", `task_edit_reward_${tId}`).row()
    .text("🔗 Edit Link", `task_edit_link_${tId}`).row()
    .text("📄 Edit Description", `task_edit_desc_${tId}`).row()
    .text(`⏱️ Time Limit: ${task.timeLimitEnabled ? "ON" : "OFF"}`, `task_timelimit_${tId}`).row()
    .text("📢 Set Submission Channel", `task_set_channel_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^task_edit_title_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_title_", "");
  userState[ctx.from.id] = `TASK_EDIT_TITLE_${tId}`;
  await ctx.editMessageText("📝 Send new title:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `edit_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_reward_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_reward_", "");
  userState[ctx.from.id] = `TASK_EDIT_REWARD_${tId}`;
  await ctx.editMessageText("📝 Send new reward:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `edit_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_link_", "");
  userState[ctx.from.id] = `TASK_EDIT_LINK_${tId}`;
  await ctx.editMessageText("📝 Send new link:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `edit_task_${tId}`) });
});

bot.callbackQuery(/^task_edit_desc_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_edit_desc_", "");
  userState[ctx.from.id] = `TASK_EDIT_DESC_${tId}`;
  await ctx.editMessageText("📝 Send new description:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", `edit_task_${tId}`) });
});

bot.callbackQuery(/^del_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.reply("❌ Task not found!");
  let text =
    `⚠️ *Delete Task?*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📄 ${task.title}\n💰 ₹${task.reward}\n👥 ${task.completedUsers?.length || 0} users completed\n\n⚠️ This action cannot be undone.`;
  let kb = new InlineKeyboard()
    .text("✅ Yes, Delete", `del_task_confirm_${tId}`)
    .text("❌ Cancel", "adm_tasks_manager");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^del_task_confirm_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("del_task_confirm_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  await Task.deleteOne({ taskId: tId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Deleted", `${task.title}`, 0, null);
  await rerender(ctx, "adm_tasks_manager");
});

// ============================================================
// ⏱️ TIME LIMIT ADMIN
// ============================================================
bot.callbackQuery(/^task_timelimit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let tId = ctx.callbackQuery.data.replace("task_timelimit_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.reply("❌ Task not found!");

  let timeStr = task.timeLimitEnabled
    ? `🟢 ON — ${formatMinutes(task.timeLimitMinutes)}`
    : "🔴 OFF";

  let text =
    `⏱️ *Task Time Limit*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Status: ${task.timeLimitEnabled ? "🟢 ON" : "🔴 OFF"}\n⏱️ Duration: \`${formatMinutes(task.timeLimitMinutes)}\`\n\nℹ️ When ON, task auto-expires after set time.\n\n👇 *Choose action:*`;

  let kb = new InlineKeyboard();
  if (task.timeLimitEnabled) {
    kb.text("🔴 Turn OFF", `task_tl_off_${tId}`).row();
  }
  kb.text("⚡ Quick Options", `task_tl_quick_${tId}`).row()
    .text("✏️ Custom Time", `task_tl_custom_${tId}`).row()
    .text("🔙 Back", `edit_task_${tId}`);

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^task_tl_off_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🔴 Time limit OFF" });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_tl_off_", "");
  await Task.updateOne({ taskId: tId }, { timeLimitEnabled: false });
  await rerender(ctx, `task_timelimit_${tId}`);
});

bot.callbackQuery(/^task_tl_quick_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_tl_quick_", "");

  let text = `⚡ *Quick Time Options*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 *Choose duration:*\n\n📌 Tap any option to set`;

  let kb = new InlineKeyboard()
    .text("1 min", `tl_q_${tId}_1`).text("2 min", `tl_q_${tId}_2`).text("5 min", `tl_q_${tId}_5`).row()
    .text("10 min", `tl_q_${tId}_10`).text("15 min", `tl_q_${tId}_15`).text("30 min", `tl_q_${tId}_30`).row()
    .text("45 min", `tl_q_${tId}_45`).text("1 hour", `tl_q_${tId}_60`).text("2 hours", `tl_q_${tId}_120`).row()
    .text("3 hours", `tl_q_${tId}_180`).text("6 hours", `tl_q_${tId}_360`).text("12 hours", `tl_q_${tId}_720`).row()
    .text("24 hours", `tl_q_${tId}_1440`).text("48 hours", `tl_q_${tId}_2880`).row()
    .text("7 days", `tl_q_${tId}_10080`).row()
    .text("✏️ Custom Time", `task_tl_custom_${tId}`).row()
    .text("🔙 Back", `task_timelimit_${tId}`);

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^tl_q_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Time set!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let rest = ctx.callbackQuery.data.replace("tl_q_", "");
  let parts = rest.split("_");
  let minutes = parseInt(parts[parts.length - 1], 10);
  let tId = parts.slice(0, -1).join("_");
  await Task.updateOne({ taskId: tId }, { timeLimitEnabled: true, timeLimitMinutes: minutes });
  await rerender(ctx, `task_timelimit_${tId}`);
});

bot.callbackQuery(/^task_tl_custom_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_tl_custom_", "");
  userState[ctx.from.id] = `TL_CUSTOM_${tId}`;
  let text =
    `✏️ *Custom Time*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Send time in one of these formats:\n\n• \`30\` → 30 minutes\n• \`30m\` → 30 minutes\n• \`1h\` → 1 hour\n• \`1h30m\` → 1 hour 30 min\n\n📌 Range: 1 min — 7 days`;
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `task_timelimit_${tId}`) }).catch(() => {});
});

// ============================================================
// 📢 SUBMISSION CHANNEL
// ============================================================
bot.callbackQuery("set_submission_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let channel = await getConfig("default_submission_channel", "");
  let channelId = await getConfig("default_submission_channel_id", "");

  let statusText = channel
    ? `📊 Current: \`${channel}\`\n🆔 ID: \`${channelId || "N/A"}\``
    : `📊 Current: \`Not Set\``;

  let text =
    `📢 *Submission Channel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n${statusText}\n\nℹ️ Task submissions will be sent here.\n\n👇 *Choose action:*`;

  let kb = new InlineKeyboard();
  if (channel) {
    kb.text("✏️ Change", "subchan_set").row()
      .text("🗑️ Clear", "subchan_clear").row();
  } else {
    kb.text("✏️ Set", "subchan_set").row();
  }
  kb.text("🔙 Back", "adm_tasks_manager");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("subchan_set", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "SET_SUBCHAN";
  await ctx.editMessageText(
    `📢 *Set Submission Channel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Send channel:\n\n• \`@mychannel\` — public\n• \`-1001234567890\` — private ID\n\n⚠️ Bot must be admin.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "set_submission_channel") }
  ).catch(() => {});
});

bot.callbackQuery("subchan_clear", async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("default_submission_channel", "");
  await setConfig("default_submission_channel_id", "");
  await rerender(ctx, "set_submission_channel");
});

// Task channel — specific
bot.callbackQuery(/^task_set_channel_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_set_channel_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let current = task.submissionChannel || "Default";
  let defaultChannel = await getConfig("default_submission_channel", "Not Set");
  let text =
    `📢 *Submission Channel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Task Channel: \`${current}\`\n🌐 Default: \`${defaultChannel}\`\n\n👇 *Choose action:*`;
  let kb = new InlineKeyboard()
    .text("✏️ Set Channel", `task_channel_set_${tId}`).row()
    .text("🗑️ Clear (Use Default)", `task_channel_clear_${tId}`).row()
    .text("🔙 Back", `edit_task_${tId}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^task_channel_set_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_channel_set_", "");
  userState[ctx.from.id] = `TASK_CHANNEL_${tId}`;
  await ctx.editMessageText(
    `📢 *Set Submission Channel*\n\n📝 Send channel:\n\n• \`@mychannel\`\n• \`-1001234567890\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `task_set_channel_${tId}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^task_channel_clear_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Cleared!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("task_channel_clear_", "");
  await Task.updateOne({ taskId: tId }, { submissionChannel: "" });
  await rerender(ctx, `edit_task_${tId}`);
});

// ============================================================
// 🎁 GIFT CODES — ADMIN PANEL
// ============================================================
async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(20);
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });

  let text = `🎁 *Gift Codes*\n\n📊 Total: ${totalCodes}\n\n👇 Click code to view:`;
  let kb = new InlineKeyboard();

  for (let c of codes) {
    let used = c.usedUsers.length;
    let isActive = used < c.maxUses;
    let statusIcon = isActive ? "✅" : "❌";
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    kb.text(`${statusIcon} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }

  kb.text("➕ Add Codes", "adm_redeem_add").row();
  kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

// ============================================================
// 🎁 REDEEM MAIN MENU
// ============================================================
bot.callbackQuery("adm_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let mode = await getConfig("redeem_mode", "auto");
  let codeCount = await GiftCode.countDocuments({ type: "redeem" });
  let modeText = mode === "auto" ? "⚡ Auto" : "📝 Manual";
  let minAmt = await getConfig("redeem_min_amount", 10);

  let text =
    `🎁 *Redeem Codes*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Total Codes: ${codeCount}\n📊 Mode: ${modeText}\n💰 Min Amount: ₹${minAmt}\n\n👇 *Choose action:*`;

  let kb = new InlineKeyboard()
    .text("🔄 Toggle Mode", "rdm_toggle_mode").row()
    .text("➕ Add Codes", "adm_redeem_add").row()
    .text("📋 View All Codes", "adm_create_gift").row()
    .text("✏️ Edit Claim Message", "adm_redeem_msg_edit").row()
    .text("👁️ Preview Message", "adm_redeem_msg_preview").row()
    .text("💰 Set Min Amount", "rdm_set_min").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("rdm_toggle_mode", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("redeem_mode", "auto");
  let next = cur === "auto" ? "manual" : "auto";
  let text =
    `⚠️ *Change Mode?*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Current: *${cur === "auto" ? "⚡ Auto" : "📝 Manual"}*\n\n👇 *Switch to:*`;
  let kb = new InlineKeyboard()
    .text(next === "auto" ? "⚡ Switch to Auto" : "📝 Switch to Manual", `rdm_set_mode_${next}`).row()
    .text("🔙 Cancel", "adm_redeem");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^rdm_set_mode_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Mode Changed!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let mode = ctx.callbackQuery.data.replace("rdm_set_mode_", "");
  await setConfig("redeem_mode", mode);
  let modeText = mode === "auto" ? "⚡ Auto" : "📝 Manual";
  let desc = mode === "auto"
    ? `• User sees amount list\n• Claims directly\n• Auto-approved`
    : `• User enters amount\n• Sends code\n• Admin approves`;
  await ctx.editMessageText(
    `✅ *Mode Changed!*\n\n📊 New: *${modeText}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📌 *What changes:*\n${desc}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem") }
  ).catch(() => {});
});

bot.callbackQuery("rdm_set_min", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "RDM_SET_MIN";
  let cur = await getConfig("redeem_min_amount", 10);
  await ctx.editMessageText(
    `💰 *Set Min Amount*\n\n📊 Current: ₹${cur}\n\n📝 Send new minimum:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_redeem") }
  ).catch(() => {});
});

// ============================================================
// 📧 AMAZON — ADMIN PANEL
// ============================================================
bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let allCodes = await GiftCode.find({ type: "amazon" });
  let totalCodes = allCodes.length;
  let available = 0, used = 0;
  for (let c of allCodes) {
    let u = c.usedUsers.length;
    used += u;
    available += (c.maxUses - u);
  }

  let mode = await getConfig("amazon_mode", "auto");
  let minAmt = await getConfig("amazon_min_amount", 10);
  let modeText = mode === "auto" ? "⚡ Auto" : "📝 Manual";

  let text =
    `📧 *Amazon Codes*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Live Status:*\n\n` +
    `🟢 Available: ${available}\n` +
    `✅ Used: ${used}\n` +
    `📈 Total Codes: ${totalCodes}\n\n` +
    `📊 Mode: ${modeText}\n` +
    `💰 Min Amount: ₹${minAmt}\n\n━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("🔄 Toggle Mode", "amz_toggle_mode").row()
    .text("➕ Add Codes", "adm_amazon_add").row()
    .text("📊 Live Status", "amz_live_status").row()
    .text("📜 Claim History", "amz_claim_history_0").row()
    .text("👥 Pending Requests", "amz_pending_list").row()
    .text("💰 Set Min Amount", "amz_set_min").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("amz_toggle_mode", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("amazon_mode", "auto");
  let next = cur === "auto" ? "manual" : "auto";
  let text =
    `⚠️ *Change Mode?*\n\n📊 Current: *${cur === "auto" ? "⚡ Auto" : "📝 Manual"}*\n\n👇 *Switch to:*`;
  let kb = new InlineKeyboard()
    .text(next === "auto" ? "⚡ Switch to Auto" : "📝 Switch to Manual", `amz_set_mode_${next}`).row()
    .text("🔙 Cancel", "adm_amazon");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^amz_set_mode_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Mode Changed!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let mode = ctx.callbackQuery.data.replace("amz_set_mode_", "");
  await setConfig("amazon_mode", mode);
  let modeText = mode === "auto" ? "⚡ Auto" : "📝 Manual";
  await ctx.editMessageText(
    `✅ *Mode Changed!*\n\n📊 New: *${modeText}*`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_amazon") }
  ).catch(() => {});
});

bot.callbackQuery("amz_set_min", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AMZ_SET_MIN";
  let cur = await getConfig("amazon_min_amount", 10);
  await ctx.editMessageText(
    `💰 *Set Min Amount*\n\n📊 Current: ₹${cur}\n\n📝 Send new minimum:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon") }
  ).catch(() => {});
});

bot.callbackQuery("amz_live_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let allCodes = await GiftCode.find({ type: "amazon" });
  let byAmount = {};
  let available = 0, used = 0;
  for (let c of allCodes) {
    let amtKey = c.amount.toString();
    if (!byAmount[amtKey]) byAmount[amtKey] = { avail: 0, used: 0 };
    let u = c.usedUsers.length;
    byAmount[amtKey].used += u;
    byAmount[amtKey].avail += (c.maxUses - u);
    available += (c.maxUses - u);
    used += u;
  }

  let pending = await TaskSubmission.countDocuments({ submissionType: "amazon_manual", status: "Pending" });
  let approved = await TaskSubmission.countDocuments({ submissionType: "amazon_manual", status: "Approved" });
  let rejected = await TaskSubmission.countDocuments({ submissionType: "amazon_manual", status: "Rejected" });

  let text =
    `📊 *Amazon — Live Status*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🟢 Available: ${available}\n` +
    `⏳ Pending: ${pending}\n` +
    `✅ Claimed: ${approved + used}\n` +
    `❌ Rejected: ${rejected}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n💰 *By Amount:*\n\n`;

  let amounts = Object.keys(byAmount).sort((a, b) => parseFloat(a) - parseFloat(b));
  for (let amt of amounts) {
    text += `₹${amt}  → ${byAmount[amt].avail} avail | ${byAmount[amt].used} used\n`;
  }

  await ctx.editMessageText(text, {
    reply_markup: new InlineKeyboard().text("🔄 Refresh", "amz_live_status").row().text("🔙 Back", "adm_amazon"),
    parse_mode: "Markdown"
  }).catch(() => {});
});

bot.callbackQuery(/^amz_claim_history_(\d+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let page = parseInt(ctx.match[1], 10);
  let perPage = 10;

  let allCodes = await GiftCode.find({ type: "amazon" });
  let autoClaims = [];
  for (let c of allCodes) {
    for (let rec of (c.claimRecords || [])) {
      autoClaims.push({
        userId: rec.userId,
        amount: c.amount,
        claimedAt: rec.claimedAt,
        type: "auto"
      });
    }
  }

  let manualClaims = await TaskSubmission.find({ submissionType: "amazon_manual", status: "Approved" }).sort({ createdAt: -1 });
  let manualList = manualClaims.map(s => ({
    userId: s.userId,
    amount: s.reward,
    claimedAt: s.approvedAt || s.updatedAt || s.createdAt,
    type: "manual"
  }));

  let allClaims = [...autoClaims, ...manualList];
  allClaims.sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));

  let total = allClaims.length;
  let totalPages = Math.ceil(total / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = Math.max(0, totalPages - 1);

  let start = page * perPage;
  let pageClaims = allClaims.slice(start, start + perPage);

  let text = `📜 *Amazon Claim History*\n\n📊 Total: ${total}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (pageClaims.length === 0) text += `📭 No claims yet.`;
  else {
    for (let i = 0; i < pageClaims.length; i++) {
      let c = pageClaims[i];
      let num = start + i + 1;
      let modeIcon = c.type === "auto" ? "⚡" : "📝";
      let timeStr = c.claimedAt ? formatDateTime(c.claimedAt) : "Unknown";
      text += `${num}️⃣ 🆔 \`${c.userId}\`\n   💰 ₹${c.amount} ${modeIcon}\n   🕐 ${timeStr}\n\n`;
    }
  }

  let kb = new InlineKeyboard();
  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️", callback_data: `amz_claim_history_${page - 1}` });
  navRow.push({ text: "🔄", callback_data: `amz_claim_history_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "➡️", callback_data: `amz_claim_history_${page + 1}` });
  kb.row(...navRow);
  kb.row().text("🔙 Back", "adm_amazon");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("amz_pending_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let pending = await TaskSubmission.find({ submissionType: "amazon_manual", status: "Pending" }).sort({ createdAt: -1 }).limit(20);

  let text = `👥 *Pending Amazon Requests*\n\n📊 Total: ${pending.length}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  let kb = new InlineKeyboard();

  if (pending.length === 0) text += `📭 No pending requests.`;
  else {
    for (let i = 0; i < pending.length; i++) {
      let s = pending[i];
      let userCode = s.photoFileId.replace("AMZ_USERCODE_", "");
      text += `${i + 1}️⃣ 🆔 \`${s.userId}\`\n   📧 \`${maskHalfCode(userCode)}\`\n   💰 ₹${s.reward}\n\n`;
      kb.text(`✏️ Process #${i + 1}`, `amz_pend_${s.submissionId}`).row();
    }
  }

  kb.row().text("🔄 Refresh", "amz_pending_list");
  kb.row().text("🔙 Back", "adm_amazon");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^amz_pend_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let submissionId = ctx.callbackQuery.data.replace("amz_pend_", "");
  let sub = await TaskSubmission.findOne({ submissionId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  let userCode = sub.photoFileId.replace("AMZ_USERCODE_", "");
  let kb = new InlineKeyboard()
    .text("✏️ Enter Code", `amz_man_enter_${submissionId}`)
    .text("❌ Reject", `amz_man_reject_${submissionId}`);
  await ctx.editMessageText(
    `📧 *Process Request*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 User: \`${sub.userId}\`\n📧 User Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${sub.reward}\n\n👇 *Action:*`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
});

// ============================================================
// 📧 AMAZON — MANUAL ADMIN ACTIONS
// ============================================================
bot.callbackQuery(/^amz_man_enter_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) {
    return ctx.answerCallbackQuery({ text: "❌ Only admins can enter codes!", show_alert: true });
  }
  let submissionId = ctx.callbackQuery.data.replace("amz_man_enter_", "");
  let sub = await TaskSubmission.findOne({ submissionId });
  if (!sub || sub.status !== "Pending") {
    return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  }
  userState[ctx.from.id] = `AMZ_ADMIN_ENTER_CODE_${submissionId}`;
  let userCode = sub.photoFileId.replace("AMZ_USERCODE_", "");
  await ctx.editMessageText(
    `✏️ *Enter Amazon Code*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 User: \`${sub.userId}\`\n📧 User Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${sub.reward}\n\n📝 Send code to deliver:\n\n📌 Example: \`AMZ-NEW-123\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `amz_man_cancel_${submissionId}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^amz_man_cancel_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled" });
  delete userState[ctx.from.id];
  await rerender(ctx, "adm_amazon");
});

bot.callbackQuery(/^amz_man_reject_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) {
    return ctx.answerCallbackQuery({ text: "❌ Only admins can reject!", show_alert: true });
  }
  let submissionId = ctx.callbackQuery.data.replace("amz_man_reject_", "");
  let sub = await TaskSubmission.findOne({ submissionId });
  if (!sub || sub.status !== "Pending") return;
  sub.status = "Rejected";
  sub.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  sub.approvedAt = new Date();
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try {
    await ctx.api.sendMessage(sub.userId, `❌ *Amazon Request Rejected*\n\n📧 Amount: ₹${sub.reward}\n\nContact support.`, { parse_mode: "Markdown" });
  } catch (e) {}
  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel && payoutChannel !== "Not Set") {
    try {
      await ctx.api.sendMessage(payoutChannel,
        `❌ *Amazon Request REJECTED*\n\n🆔 \`${sub.userId}\`\n💰 ₹${sub.reward}\nBy ${sub.approvedBy}\n🕐 ${formatDateTime(new Date())}`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {}
  }
});

// ============================================================
// 🎁 REDEEM — MANUAL ADMIN ACTIONS
// ============================================================
bot.callbackQuery(/^rdm_man_enter_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) {
    return ctx.answerCallbackQuery({ text: "❌ Only admins can enter codes!", show_alert: true });
  }
  let submissionId = ctx.callbackQuery.data.replace("rdm_man_enter_", "");
  let sub = await TaskSubmission.findOne({ submissionId });
  if (!sub || sub.status !== "Pending") {
    return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  }
  userState[ctx.from.id] = `RDM_ADMIN_ENTER_CODE_${submissionId}`;
  let userCode = sub.photoFileId.replace("RDM_USERCODE_", "");
  await ctx.editMessageText(
    `✏️ *Enter Redeem Code*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🆔 User: \`${sub.userId}\`\n🎁 User Code: \`${maskHalfCode(userCode)}\`\n💰 Amount: ₹${sub.reward}\n\n📝 Send code to deliver:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `rdm_man_cancel_${submissionId}`) }
  ).catch(() => {});
});

bot.callbackQuery(/^rdm_man_cancel_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled" });
  delete userState[ctx.from.id];
  await rerender(ctx, "adm_redeem");
});

bot.callbackQuery(/^rdm_man_reject_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) {
    return ctx.answerCallbackQuery({ text: "❌ Only admins can reject!", show_alert: true });
  }
  let submissionId = ctx.callbackQuery.data.replace("rdm_man_reject_", "");
  let sub = await TaskSubmission.findOne({ submissionId });
  if (!sub || sub.status !== "Pending") return;
  sub.status = "Rejected";
  sub.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  sub.approvedAt = new Date();
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try {
    await ctx.api.sendMessage(sub.userId, `❌ *Redeem Request Rejected*\n\n🎁 Amount: ₹${sub.reward}`, { parse_mode: "Markdown" });
  } catch (e) {}
  let payoutChannel = await getConfig("payout_channel", null);
  if (payoutChannel && payoutChannel !== "Not Set") {
    try {
      await ctx.api.sendMessage(payoutChannel,
        `❌ *Redeem Request REJECTED*\n\n🆔 \`${sub.userId}\`\n💰 ₹${sub.reward}\nBy ${sub.approvedBy}`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {}
  }
});

// ============================================================
// 🎁 USER SIDE — AMAZON / REDEEM MENUS
// ============================================================
bot.callbackQuery("wd_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;

  let enabled = await isWithdrawEnabled("amazon");
  if (!enabled) return ctx.answerCallbackQuery({ text: "❌ Amazon withdrawal disabled!", show_alert: true });

  let mode = await getConfig("amazon_mode", "auto");
  let minAmt = await getConfig("amazon_min_amount", 10);

  if (mode === "manual") {
    userState[userId] = "AMZ_MANUAL_WAIT_AMOUNT";
    return ctx.editMessageText(
      `📧 *Amazon Request*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Mode: 📝 Manual\n\n💰 Min Amount: ₹${minAmt}\n\n📝 Send your amount:\n\n📌 Example: \`10\` or \`50\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance") }
    ).catch(() => {});
  }

  let allCodes = await GiftCode.find({ type: "amazon" });
  let byAmount = {};
  for (let c of allCodes) {
    let amtKey = c.amount.toString();
    if (!byAmount[amtKey]) byAmount[amtKey] = { avail: 0, used: 0 };
    let u = c.usedUsers.length;
    byAmount[amtKey].used += u;
    byAmount[amtKey].avail += (c.maxUses - u);
  }

  let rows = buildAmountGrid(byAmount, "amz_amt_");

  if (rows.length === 0) {
    return ctx.editMessageText(
      `📧 *Amazon*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Mode: ⚡ Auto\n\n❌ No Amazon codes available.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
    ).catch(() => {});
  }

  let kb = new InlineKeyboard();
  for (let r of rows) kb.row(...r);
  kb.row().text("🔙 Back", "back_to_balance");

  await ctx.editMessageText(
    `📧 *Amazon*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Mode: ⚡ Auto\n\n👇 *Choose amount:*`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery(/^amz_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let amount = ctx.callbackQuery.data.replace("amz_amt_", "");
  userState[userId] = `AMZ_WAIT_CODE_${amount}`;
  await ctx.editMessageText(
    `📧 *Amazon*\n\n💰 Amount: ₹${amount}\n\n📝 Send your Amazon code:\n\n📌 Format: Any valid code`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance") }
  ).catch(() => {});
});

bot.callbackQuery("wd_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;

  let enabled = await isWithdrawEnabled("redeem");
  if (!enabled) return ctx.answerCallbackQuery({ text: "❌ Redeem withdrawal disabled!", show_alert: true });

  let mode = await getConfig("redeem_mode", "auto");
  let minAmt = await getConfig("redeem_min_amount", 10);

  if (mode === "manual") {
    userState[userId] = "RDM_MANUAL_WAIT_AMOUNT";
    return ctx.editMessageText(
      `🎁 *Redeem Request*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Mode: 📝 Manual\n\n💰 Min Amount: ₹${minAmt}\n\n📝 Send your amount:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance") }
    ).catch(() => {});
  }

  let allCodes = await GiftCode.find({ type: "redeem" });
  let byAmount = {};
  for (let c of allCodes) {
    let amtKey = c.amount.toString();
    if (!byAmount[amtKey]) byAmount[amtKey] = { avail: 0, used: 0 };
    let u = c.usedUsers.length;
    byAmount[amtKey].used += u;
    byAmount[amtKey].avail += (c.maxUses - u);
  }

  let rows = buildAmountGrid(byAmount, "rdm_amt_");

  if (rows.length === 0) {
    return ctx.editMessageText(
      `🎁 *Redeem*\n\n📊 Mode: ⚡ Auto\n\n❌ No redeem codes available.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "back_to_balance") }
    ).catch(() => {});
  }

  let kb = new InlineKeyboard();
  for (let r of rows) kb.row(...r);
  kb.row().text("🔙 Back", "back_to_balance");

  await ctx.editMessageText(
    `🎁 *Redeem*\n\n📊 Mode: ⚡ Auto\n\n👇 *Choose amount:*`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

bot.callbackQuery(/^rdm_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let userId = ctx.from.id;
  let amount = ctx.callbackQuery.data.replace("rdm_amt_", "");
  userState[userId] = `RDM_WAIT_CODE_${amount}`;
  await ctx.editMessageText(
    `🎁 *Redeem*\n\n💰 Amount: ₹${amount}\n\n📝 Send your Redeem code:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "back_to_balance") }
  ).catch(() => {});
});

// ============================================================
// 🚀 /ADMIN COMMAND
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  let disabled = await isAdminDisabled(userId);
  if (disabled) {
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    let ownerUser = await User.findOne({ userId: ownerId });
    let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";
    return ctx.reply(
      `❌ ADMIN ACCESS DISABLED\n\nContact Owner: ${ownerName}\n🆔 ${ownerId}`,
      { reply_markup: new InlineKeyboard().text("🏠 Main Menu", "back_to_balance") }
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
  let activeGwCount = await Gateway.countDocuments({ status: true });
  let quickTaxEnabled = await getConfig("quick_pay_tax_enabled", false);
  let quickTaxPercent = await getConfig("quick_pay_tax_percent", 0);

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Bot:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🌐 *Gateways:* ${activeGwCount}\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `💠 *Auto UPI:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `  🤖 Auto: ${autoVerify ? "🟢" : "🔴"} | ✋ Manual: ${manualVerify ? "🟢" : "🔴"}\n` +
    `⚡ *Quick Tax:* ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 OFF"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${activeAdmins}\n\n━━━━━━━━━━━━━━━━━━━━`;

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
  let text = `📊 *Status*\n\n👇 *Choose option:*`;
  let kb = new InlineKeyboard()
    .text("🔴 Live Balance Tracker", "status_live_tracker").row()
    .text("👥 Users List", "status_users_list")
    .text("💰 Live Fund", "status_live_fund").row()
    .text("✏️ Website Name Edit", "adm_webname_edit").row()
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

  let users = await User.find({}).sort({ balance: -1 }).skip(page * perPage).limit(perPage);
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;

  let text =
    `🔴 *Live Balance Tracker*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 Total: ${totalUsers}\n💰 Total Balance: ₹${totalBalance.toFixed(2)}\n📄 Page: ${page + 1}/${totalPages || 1}\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Click user:`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 12);
    kb.text(`👤 ${name}`, `livebd_name_${u.userId}`)
      .text(`🆔 ${u.userId}`, `livebd_copy_${u.userId}`)
      .text(`💰 ₹${u.balance.toFixed(0)}`, `livebd_bal_${u.userId}`)
      .row();
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️", callback_data: `status_lb_page_${page - 1}` });
  navRow.push({ text: "🔄", callback_data: `status_lb_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "➡️", callback_data: `status_lb_page_${page + 1}` });
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
  let totalWdArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);

  let text =
    `👤 *User Balance Details*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 Name: ${user.firstName || "User"}\n🆔 ID: \`${uid}\`\n💰 Balance: ₹${user.balance.toFixed(2)}\n📤 Withdrawn: ₹${(totalWdArr[0]?.total || 0).toFixed(2)}\n📊 Count: ${approvedCount}`;

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

  let users = await User.find({}).sort({ createdAt: -1 }).skip(page * perPage).limit(perPage);
  let activeCount = await User.countDocuments({ isBanned: false });
  let bannedCount = await User.countDocuments({ isBanned: true });

  let text =
    `👥 *Users List*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Total: ${totalUsers}\n✅ Active: ${activeCount}\n🚫 Banned: ${bannedCount}\n📄 Page: ${page + 1}/${totalPages || 1}`;

  let kb = new InlineKeyboard();
  for (let u of users) {
    let name = (u.firstName || "User").substring(0, 12);
    let status = u.isBanned ? "🚫" : "✅";
    kb.text(`${status} ${name}`, `userslist_view_${u.userId}`).row();
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: "⬅️", callback_data: `status_ul_page_${page - 1}` });
  navRow.push({ text: "🔄", callback_data: `status_ul_page_${page}` });
  if (page < totalPages - 1) navRow.push({ text: "➡️", callback_data: `status_ul_page_${page + 1}` });
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
    `👤 *User Details*\n\n👤 ${user.firstName || "User"}\n🆔 \`${uid}\`\n📛 ${user.username ? "@" + user.username : "None"}\n💰 ₹${user.balance.toFixed(2)}\n📤 ₹${(user.withdrawnTotal || 0).toFixed(2)}\n📊 ${user.isBanned ? "🚫 Banned" : "✅ Active"}\n📅 ${formatDateTime(user.createdAt)}`;
  let kb = new InlineKeyboard().text("🔙 Back", "status_users_list").text("🏠 Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 💰 LIVE FUND
// ============================================================
bot.callbackQuery("status_live_fund", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let fund = await LiveFund.findOne({ key: "main_fund" });
  if (!fund) fund = await LiveFund.create({ key: "main_fund" });
  let totalUsers = await User.countDocuments({});
  let totalBalanceArr = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
  let totalBalance = totalBalanceArr[0]?.total || 0;
  let totalWdArr = await Withdrawal.aggregate([{ $match: { status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let totalWd = totalWdArr[0]?.total || 0;
  let running = (fund.totalFund || 0) - (fund.usedFund || 0);
  let usedPercent = fund.totalFund > 0 ? ((fund.usedFund / fund.totalFund) * 100).toFixed(1) : 0;

  let text =
    `💰 *Live Fund*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🏦 Bot Total: ₹${totalBalance.toFixed(2)}\n📤 Paid Out: ₹${totalWd.toFixed(2)}\n👥 Users: ${totalUsers}\n\n━━━━━━━━━━━━━━━━━━━━\n\n⚙️ Status: ${fund.isActive ? "🟢 ON" : "🔴 OFF"}\n💰 Set: ₹${(fund.totalFund || 0).toFixed(2)}\n📉 Running: ₹${running.toFixed(2)}\n📤 Used: ₹${(fund.usedFund || 0).toFixed(2)} (${usedPercent}%)`;

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
  let recent = await Withdrawal.find({ status: "Approved" }).sort({ approvedAt: -1 }).limit(10);
  let text = `📤 *Recent Payouts*\n\n`;
  if (recent.length === 0) text += `📭 No payouts.`;
  else for (let w of recent) {
    let u = await User.findOne({ userId: w.userId });
    text += `👤 ${u?.firstName || "User"} — ₹${w.amount.toFixed(2)}\n🆔 \`${w.userId}\` | ${formatDateTime(w.approvedAt || w.createdAt)}\n\n`;
  }
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", "status_live_fund"), parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ✏️ WEBSITE NAME EDIT
// ============================================================
bot.callbackQuery("adm_webname_edit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let ownerName = await getConfig("owner_display_name", "azeeznasi");
  let ownerLink = await getConfig("owner_display_link", "azeeznasi");
  let text =
    `✏️ *Website Name Edit*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👤 Owner Name: \`${ownerName}\`\n🔗 Owner Link: \`${ownerLink}\`\n\n👇 *Choose option:*`;
  let kb = new InlineKeyboard()
    .text("👤 Edit Owner Name", "adm_owner_name").row()
    .text("🔗 Edit Owner Link", "adm_owner_link").row()
    .text("🔄 Reset to Default", "adm_owner_reset").row()
    .text("🔙 Back", "adm_status");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_owner_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "EDIT_OWNER_NAME";
  let current = await getConfig("owner_display_name", "azeeznasi");
  await ctx.editMessageText(
    `👤 *Edit Owner Name*\n\n📊 Current: \`${current}\`\n\n📝 Send new name:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_webname_edit") }
  ).catch(() => {});
});

bot.callbackQuery("adm_owner_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "EDIT_OWNER_LINK";
  let current = await getConfig("owner_display_link", "azeeznasi");
  await ctx.editMessageText(
    `🔗 *Edit Owner Link*\n\n📊 Current: \`${current}\`\n\n📝 Send:\n• @Nasihh\n• 8061612320\n• https://t.me/Nasihh`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_webname_edit") }
  ).catch(() => {});
});

bot.callbackQuery("adm_owner_reset", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("owner_display_name", "azeeznasi");
  await setConfig("owner_display_link", "azeeznasi");
  await rerender(ctx, "adm_webname_edit");
});

// ============================================================
// 👮 PERMISSIONS PANEL
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
  let text = `👮 *Admin Permissions*\n\n━━━━━━━━━━━━━━━━━━━━\n\n👑 Owner: ${ownerUser?.firstName || "Owner"}\n🆔 \`${ownerId}\`\n\n📊 Total Admins: ${admins.length}\n\n👇 Click to toggle:`;
  let kb = new InlineKeyboard();
  for (let a of admins) {
    let u = await User.findOne({ userId: a.userId });
    let name = u ? (u.firstName || "User") : "Unknown";
    let status = a.isActive ? "🟢" : "🔴";
    kb.text(`${status} ${name} — ${a.userId}`, `adm_perm_toggle_${a.userId}`).row();
  }
  kb.text("➕ Add New Admin", "admin_add").row();
  kb.text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^adm_perm_toggle_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("adm_perm_toggle_", ""), 10);
  let admin = await BotAdmin.findOne({ userId: adminId });
  if (!admin) return;
  admin.isActive = !admin.isActive;
  if (!admin.isActive) { admin.disabledAt = new Date(); admin.disabledBy = ctx.from.id; }
  else { admin.disabledAt = null; admin.disabledBy = null; }
  await admin.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", admin.isActive ? "Admin Enabled" : "Admin Disabled", `${adminId}`, 0, adminId);
  await ctx.answerCallbackQuery({ text: admin.isActive ? "🟢 Enabled" : "🔴 Disabled" });
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(`➕ Add Admin\n\n📝 Send User ID:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_permissions") });
});

// Transfer ownership
bot.callbackQuery("adm_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(
    `👑 *Transfer Ownership*\n\n⚠️ You will become an Admin.\n\n📝 Send new Owner User ID:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") }
  );
});

bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);
  let currentOwner = ctx.from.id;
  await BotAdmin.findOneAndUpdate({ userId: currentOwner }, { addedAt: new Date(), addedBy: currentOwner, isActive: true }, { upsert: true });
  await setConfig("owner_id", newOwnerId);
  await logAdminAction(currentOwner, ctx.from.first_name || "Owner", "Ownership Transferred", `New: ${newOwnerId}`, 0, newOwnerId);
  await ctx.answerCallbackQuery({ text: "👑 Transferred!" });
  await ctx.editMessageText(`✅ *Ownership Transferred!*\n\n👑 New Owner: \`${newOwnerId}\``, { parse_mode: "Markdown" }).catch(() => {});
  try { await ctx.api.sendMessage(newOwnerId, `👑 *Congratulations!*\n\nYou are now Owner!\n\nUse /admin`, { parse_mode: "Markdown" }); } catch (e) {}
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
  await ctx.editMessageText(`💰 *Set Withdraw Tax*\n\n📊 Current: \`${cur}%\``, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_set_tax_val", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_TAX_PERCENT";
  await ctx.editMessageText("📝 Send tax % (0-50):", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_set_wd_tax") });
});

bot.callbackQuery("adm_reset_tax", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("tax_percent", 0);
  await rerender(ctx, "adm_set_wd_tax");
});

// Verification
bot.callbackQuery("adm_verification_mode", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let ve = await getConfig("verification_enabled", false);
  let kb = new InlineKeyboard().text(ve ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row().text("🔙 Back", "admin");
  await ctx.editMessageText(`💠 *Verification Mode*\n\n📊 ${ve ? "🟢 ON" : "🔴 OFF"}`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await rerender(ctx, "adm_verification_mode");
});

// Bot status
bot.callbackQuery("adm_bot_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let botActive = await getConfig("bot_active", true);
  let offText = await getConfig("bot_off_text", "🤖 Bot is OFF");
  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_bot_toggle").row()
    .text("✏️ Edit OFF Message", "adm_edit_bot_off").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(`🤖 *Bot Status*\n\n📊 ${botActive ? "🟢 Active" : "🔴 Off"}\n\n📝 ${offText}`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_bot_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("bot_active", true);
  await setConfig("bot_active", !cur);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", !cur ? "Bot Activated" : "Bot Deactivated", "", 0, null);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_bot_status");
});

bot.callbackQuery("adm_edit_bot_off", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_BOT_OFF_TEXT";
  await ctx.editMessageText("📝 Send new OFF message:", { reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_bot_status") });
});

bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

// ============================================================
// 🚫 BAN USERS
// ============================================================
bot.callbackQuery("adm_manage_ban", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let banned = await User.find({ isBanned: true }).limit(20);
  let text = `🚫 *Manage Ban Users*\n\n📊 Total Banned: ${banned.length}\n\n`;
  banned.forEach((u, i) => { text += `${i + 1}. 👤 ${u.firstName || "User"} — \`${u.userId}\`\n`; });
  let kb = new InlineKeyboard()
    .text("➕ Ban New", "adm_ban_new").row()
    .text("🔓 Unban", "adm_unban_user").row()
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

// Ban wallet
bot.callbackQuery("adm_manage_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uw = await getConfig("unlimited_wallet", false);
  let ow = await getConfig("onetime_wallet", false);
  let text = `🚫 *Manage Ban Wallet*\n\n♾️ Unlimited: ${uw ? "🟢" : "🔴"}\n⏱️ One-Time: ${ow ? "🟢" : "🔴"}`;
  let kb = new InlineKeyboard()
    .text("🚫 Ban Wallet", "adm_ban_wallet").row()
    .text(uw ? "♾️ Unlimited: ON" : "♾️ Unlimited: OFF", "adm_unlimited_wallet").row()
    .text(ow ? "⏱️ One-Time: ON" : "⏱️ One-Time: OFF", "adm_onetime_wallet").row()
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
  let text = `💸 *Withdraw Status*\n\n📊 Total: ${totalWd}\n💰 Amount: ₹${total.toFixed(2)}`;
  let kb = new InlineKeyboard().text("📊 Manage Withdraw", "adm_manage_withdraw").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// ➕ / ➖ BALANCE
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
  await ctx.editMessageText(`⚠️ RESET ALL BALANCES\n\nUsers: ${userCount}\n\nReset everyone's balance to ₹0?\n\nConfirm?`, { reply_markup: kb });
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Reset All Balances", "All users", 0, null);
  await ctx.editMessageText("✅ All balances reset to ₹0", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }).catch(() => {});
});

// ============================================================
// ⚡ CHANNELS
// ============================================================
bot.callbackQuery("adm_manage_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true });
  let text = `⚡ *Manage Channels*\n\n📊 Total: ${channels.length}\n\n`;
  channels.forEach((ch, i) => { text += `${i + 1}. 📢 ${ch.displayName || ch.channelId}\n🔗 ${ch.inviteLink}\n\n`; });
  let kb = new InlineKeyboard().text("➕ Add Channel", "adm_add_channel").row().text("🔙 Back", "admin");
  await ctx.editMessageText(text || "No channels", { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_add_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_CHANNEL_WAIT";
  await ctx.editMessageText(
    `📢 *Add Channel*\n\nFormat: <code>ChannelID | InviteLink</code>\n\nExample:\n<code>@mychannel | https://t.me/mychannel</code>`,
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
    `📢 *Broadcast*\n\nSend message (text/photo/video).\n\n🔔 Notify: ${msgEnabled ? "🟢 ON" : "🔴 OFF"}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔔 Toggle", "broadcast_notify_toggle").row().text("🔙 Back", "admin") }
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

  await ctx.editMessageText(
    `✅ *Broadcast Complete!*\n\n✅ Sent: ${count}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}\n⏱️ Time: ${timeTaken}s`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Admin", "admin") }
  ).catch(() => {});
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
  let text = `📊 *Manage Withdraw*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  let kb = new InlineKeyboard();

  // Gateways
  let gateways = await Gateway.find({}).sort({ createdAt: 1 });
  if (gateways.length > 0) {
    text += `🌐 *Gateways:*\n\n`;
    for (let gw of gateways) {
      let statusIcon = gw.status ? "🟢 ON" : "🔴 OFF";
      let typeIcon = gw.type === "upi" ? "⚡" : "👛";
      text += `${typeIcon} ${gw.name} (${gw.type?.toUpperCase() || "WALLET"}) — ${statusIcon}\n`;
      kb.text(`${typeIcon} ${gw.name} — ${gw.status ? "ON" : "OFF"}`, `gw_manage_${gw.key}`).row();
    }
    text += `\n`;
  }

  // Regular
  let settings = await WithdrawSettings.find({});
  if (settings.length === 0) {
    const defaults = [
      { method: "upi", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
      { method: "bank", isActive: true, minAmount: 100, maxAmount: 50000, taxPercent: 0 },
      { method: "amazon", isActive: false, minAmount: 100, maxAmount: 5000, taxPercent: 0 },
      { method: "redeem", isActive: false, minAmount: 50, maxAmount: 2000, taxPercent: 0 }
    ];
    for (let d of defaults) await WithdrawSettings.create(d);
    settings = await WithdrawSettings.find({});
  }

  text += `⚙️ *Regular Methods:*\n\n`;
  let methods = ["upi", "bank", "amazon", "redeem"];
  let emojis = { upi: "⚡", bank: "🏦", amazon: "📧", redeem: "🎁" };
  let labels = { upi: "Manual UPI", bank: "Bank", amazon: "Amazon", redeem: "Redeem" };
  for (let m of methods) {
    let s = settings.find(x => x.method === m);
    if (!s) continue;
    text += `${emojis[m]} ${labels[m]} — ${s.isActive ? "🟢 ON" : "🔴 OFF"}\n`;
    kb.text(`${emojis[m]} ${labels[m]} — ${s.isActive ? "ON" : "OFF"}`, `admwd_edit_${m}`).row();
  }

  kb.row({ text: "🔙 Back to Admin", callback_data: "admin" });
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^admwd_edit_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let method = ctx.callbackQuery.data.replace("admwd_edit_", "");
  let s = await WithdrawSettings.findOne({ method });
  if (!s) s = await WithdrawSettings.create({ method, isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 });

  let emojis = { upi: "⚡", bank: "🏦", amazon: "📧", redeem: "🎁" };
  let labels = { upi: "Manual UPI", bank: "Bank", amazon: "Amazon", redeem: "Redeem" };
  let text =
    `${emojis[method]} *Edit ${labels[method]}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📊 Status: ${s.isActive ? "🟢 ON" : "🔴 OFF"}\n📉 Min: ₹${s.minAmount}\n📈 Max: ₹${s.maxAmount}\n💸 Tax: ${s.taxPercent}%`;

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
  let totalWdArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let totalWd = totalWdArr[0]?.total || 0;
  let text =
    `🔍 *User Details*\n\n👤 ${u.firstName || "User"}\n🆔 \`${uid}\`\n📛 ${u.username ? "@" + u.username : "None"}\n💰 ₹${u.balance.toFixed(2)}\n💸 ₹${totalWd.toFixed(2)}\n📊 Count: ${approvedCount}\n📅 ${formatDateTime(u.createdAt)}`;
  let kb = new InlineKeyboard()
    .text("🔗 Linked", `user_linked_${uid}`).row()
    .text("📜 WD History", `user_wd_hist_${uid}`).row()
    .text("💰 Balance History", `user_bal_hist_${uid}`).row()
    .text("➕ Add", `user_add_bal_${uid}`)
    .text("➖ Remove", `user_rem_bal_${uid}`).row()
    .text("💬 Message", `user_send_msg_${uid}`)
    .text("🚫 Ban", `user_ban_${uid}`).row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_linked_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_linked_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;
  let text =
    `🔗 *Linked Withdraw*\n\n⚡ UPI: \`${u.upiId || "Not Set"}\`\n🏦 Bank: \`${u.bankAccNo || "Not Set"}\`\n🌐 Wallet: \`${u.walletAccount || "Not Set"}\`\n📧 Amazon: \`${u.amazonEmail || "Not Set"}\`\n🎁 Redeem: \`${u.redeemCodeAddr || "Not Set"}\``;
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_wd_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_hist_", ""), 10);
  let wds = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(10);
  let text = `📜 *Withdraw History*\n\n👤 ${uid}\n\n`;
  if (wds.length === 0) text += "📭 No withdrawals";
  else wds.forEach((w, i) => {
    let icon = w.status === "Approved" ? "✅" : (w.status === "Rejected" ? "❌" : "⏳");
    text += `${i + 1}. ${icon} ₹${w.amount} — ${w.method}\n🕐 ${formatDateTime(w.createdAt)}\n\n`;
  });
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("🔙 Back", `user_detail_${uid}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^user_bal_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  let uid = parseInt(ctx.callbackQuery.data.replace("user_bal_hist_", ""), 10);
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(15);
  let text = `💰 *Balance History*\n\n👤 ${uid}\n\n`;
  if (history.length === 0) text += "📭 No transactions";
  else history.forEach((h, i) => {
    let icon = h.amount >= 0 ? "🟢" : "🔴";
    let sign = h.amount >= 0 ? "+" : "";
    text += `${i + 1}. ${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)}\n🕐 ${formatDateTime(h.createdAt)}\n\n`;
  });
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

bot.callbackQuery(/^user_wd_start_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_start_", ""), 10);
  let user = await User.findOne({ userId: uid });
  if (!user) return;
  userState[ctx.from.id] = `ADMUSER_WD_${uid}`;
  await ctx.editMessageText(
    `🚀 *Manual Withdraw*\n\n👤 ${user.firstName || "User"}\n🆔 \`${uid}\`\n💰 Balance: ₹${user.balance.toFixed(2)}\n\n📝 Send amount:`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `user_detail_${uid}`) }
  ).catch(() => {});
});

// ============================================================
// ⚡ QUICK PAY TAX
// ============================================================
bot.callbackQuery("adm_quick_pay", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let enabled = await getConfig("quick_pay_tax_enabled", false);
  let percent = await getConfig("quick_pay_tax_percent", 0);
  let text = `⚡ *Quick Pay Tax*\n\n📊 ${enabled ? "🟢 ON" : "🔴 OFF"}\n💸 Tax: ${percent}%`;
  let kb = new InlineKeyboard()
    .text("💸 Set Tax %", "adm_set_qp_tax").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_qp_tax").row()
    .text("🔄 Reset", "adm_reset_qp_tax").row()
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
// 🔗 GATEWAY STEPS (NEW SYSTEM)
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  const text = `🔗 *Gateway Steps*\n\nChoose an option below:`;
  const kb = new InlineKeyboard()
    .text("📲 Gateway UPI", "gateway_upi")
    .text("💼 Gateway Wallet", "gateway_wallet").row()
    .text("↩️ Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("gateway_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayManager(ctx);
});

bot.callbackQuery("gateway_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayManager(ctx);
});

async function renderGatewayManager(ctx) {
  let gateways = await Gateway.find({}).sort({ createdAt: -1 });
  let text = `🌐 *Gateway Manager*\n\nManage your custom payment gateways:\n\n`;
  const kb = new InlineKeyboard();

  if (gateways.length === 0) {
    text += `*No gateways added yet.*`;
  } else {
    gateways.forEach((gw) => {
      let statusIcon = gw.status ? "🟢 ON" : "🔴 OFF";
      let typeIcon = gw.type === "upi" ? "⚡" : "👛";
      text += `• *${gw.name}* (${gw.type?.toUpperCase() || "WALLET"}) - ${statusIcon}\n`;
      kb.text(`${typeIcon} ${gw.name} (${statusIcon})`, `gw_manage_${gw.key}`).row();
    });
  }

  kb.row().text("➕ Add New Gateway", "gw_add_name_start").row().text("↩️ Back", "adm_gateway_menu");
  await safeEditOrReply(ctx, text, kb);
}

bot.callbackQuery("gw_add_name_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_GW_NAME";
  await ctx.editMessageText(`📝 *Step 1: Gateway Name*\n\nExamples: \`UltraPay\`, \`Auto UPI\`, \`Paytm\``, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("↩️ Cancel", "adm_gateway_menu")
  }).catch(() => {});
});

bot.callbackQuery(/^gw_type_(upi|wallet)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let type = ctx.match[1];
  let tempData = userState[ctx.from.id + "_TEMP"] || {};
  tempData.type = type;
  userState[ctx.from.id + "_TEMP"] = tempData;
  userState[ctx.from.id] = "WAITING_GW_URL";

  let example = `\`https://example.com/api?token=XXX&paytoNumber={number}&amount={amount}&comment={comment}\``;

  await ctx.editMessageText(
    `✅ Type: *${type.toUpperCase()}*\n\n📝 *Step 3: API URL*\n\nSend the full API URL:\n\n` +
    `• \`{number}\` → User ${type === "upi" ? "UPI ID" : "Number"}\n` +
    `• \`{amount}\` → Amount\n` +
    `• \`{comment}\` → Comment\n\nExample:\n${example}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("↩️ Cancel", "adm_gateway_menu") }
  ).catch(() => {});
});

bot.callbackQuery(/^gw_manage_(.+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwKey = ctx.match[1];
  let gw = await Gateway.findOne({ key: gwKey });
  if (!gw) return ctx.reply("❌ Gateway not found!");

  let text =
    `⚙️ *Gateway: ${gw.name}*\n\n` +
    `• Name: ${gw.name}\n` +
    `• Type: ${gw.type?.toUpperCase() || "WALLET"}\n` +
    `• Status: ${gw.status ? "🟢 ON" : "🔴 OFF"}\n` +
    `• URL: \`${gw.url}\``;

  let toggleText = gw.status ? "🔴 Turn OFF" : "🟢 Turn ON";
  let kb = new InlineKeyboard()
    .text(toggleText, `gw_toggle_${gwKey}`).row()
    .text("🗑️ Delete", `gw_del_${gwKey}`).row()
    .text("↩️ Back", "adm_gateway_menu");

  await safeEditOrReply(ctx, text, kb);
});

bot.callbackQuery(/^gw_toggle_(.+)$/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwKey = ctx.match[1];
  let gw = await Gateway.findOne({ key: gwKey });
  if (!gw) return;
  gw.status = !gw.status;
  await gw.save();
  await ctx.answerCallbackQuery({ text: gw.status ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, `gw_manage_${gwKey}`);
});

bot.callbackQuery(/^gw_del_(.+)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwKey = ctx.match[1];
  let gw = await Gateway.findOne({ key: gwKey });
  if (!gw) return;
  let kb = new InlineKeyboard()
    .text("✅ Yes, Delete", `gw_delconfirm_${gwKey}`)
    .text("❌ Cancel", `gw_manage_${gwKey}`);
  await ctx.editMessageText(`⚠️ Delete gateway *${gw.name}*?`, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^gw_delconfirm_(.+)$/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  if (!(await isAdmin(ctx.from.id))) return;
  let gwKey = ctx.match[1];
  let gw = await Gateway.findOne({ key: gwKey });
  if (gw) await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Gateway Deleted", gw.name, 0, null);
  await Gateway.deleteOne({ key: gwKey });
  await rerender(ctx, "adm_gateway_menu");
});

// ============================================================
// 📝 GATEWAY TEXT HANDLERS
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  let text = ctx.message.text.trim();
  if (!state) return next();

  if (state === "WAITING_GW_NAME" && (await isAdmin(userId))) {
    if (!text || text.length < 2 || text.length > 30) {
      return ctx.reply("❌ Name must be 2-30 characters!\n\nTry again:");
    }
    let existing = await Gateway.findOne({ name: text });
    if (existing) return ctx.reply("❌ Gateway name already exists! Try another.");

    userState[userId + "_TEMP"] = { name: text };
    userState[userId] = "WAITING_GW_TYPE";

    let kb = new InlineKeyboard()
      .text("💳 UPI", "gw_type_upi")
      .text("📱 Wallet Number", "gw_type_wallet");

    return ctx.reply(`📲 *Step 2: Select Type*\n\nName: *${text}*`, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (state === "WAITING_GW_TYPE" && (await isAdmin(userId))) {
    return next();
  }

  if (state === "WAITING_GW_URL" && (await isAdmin(userId))) {
    let temp = userState[userId + "_TEMP"] || {};
    if (!temp.name || !temp.type) {
      delete userState[userId];
      delete userState[userId + "_TEMP"];
      return ctx.reply("❌ Session expired. Start again.");
    }
    if (!text.startsWith("http://") && !text.startsWith("https://")) {
      return ctx.reply("❌ Invalid URL. Must start with http:// or https://");
    }
    if (!text.includes("{number}") || !text.includes("{amount}")) {
      return ctx.reply("❌ URL must include `{number}` and `{amount}` placeholders.", { parse_mode: "Markdown" });
    }

    let gwKey = "gw_" + Date.now();
    await Gateway.create({
      key: gwKey,
      name: temp.name,
      url: text,
      type: temp.type,
      status: true
    });

    delete userState[userId];
    delete userState[userId + "_TEMP"];

    await logAdminAction(userId, ctx.from.first_name || "Admin", "Gateway Added", `${temp.name} (${temp.type})`, 0, null);

    return ctx.reply(
      `✅ *New Gateway Added!*\n\n📛 Name: *${temp.name}*\n📊 Type: *${temp.type.toUpperCase()}*\n🌐 URL: \`${text.substring(0, 60)}...\``,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔙 Back to Gateway Manager", "adm_gateway_menu")
      }
    );
  }

  if (state === "SET_SUBCHAN" && (await isAdmin(userId))) {
    delete userState[userId];
    let channelInput = text.trim();
    if (!channelInput.startsWith("@") && !/^-?\d+$/.test(channelInput)) {
      return ctx.reply("❌ Invalid! Send @channel or -100xxxxx", { parse_mode: "Markdown" });
    }
    let chatInfo = null;
    try {
      chatInfo = await ctx.api.getChat(channelInput);
      let botInfo = await ctx.api.getMe();
      let botMember = await ctx.api.getChatMember(channelInput, botInfo.id);
      if (!["administrator", "creator"].includes(botMember.status)) {
        return ctx.reply(`❌ Bot is not admin in this channel!`, { reply_markup: new InlineKeyboard().text("🔙 Back", "set_submission_channel") });
      }
    } catch (e) {
      return ctx.reply(`❌ Cannot access channel: ${e.message}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "set_submission_channel") });
    }
    let channelId = chatInfo.id.toString();
    let channelName = chatInfo.title || channelInput;
    await setConfig("default_submission_channel", channelInput);
    await setConfig("default_submission_channel_id", channelId);
    return ctx.reply(
      `✅ *Channel Set!*\n\n📢 ${channelName}\n🆔 \`${channelId}\`\n\nAll task submissions will go here.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "set_submission_channel") }
    );
  }

  if (state && state.startsWith("TASK_CHANNEL_") && (await isAdmin(userId))) {
    let tId = state.replace("TASK_CHANNEL_", "");
    delete userState[userId];
    let channelInput = text.trim();
    if (!channelInput.startsWith("@") && !/^-?\d+$/.test(channelInput)) {
      return ctx.reply("❌ Invalid! Send @channel or -100xxxxx");
    }
    try {
      let chatInfo = await ctx.api.getChat(channelInput);
      let botInfo = await ctx.api.getMe();
      let botMember = await ctx.api.getChatMember(channelInput, botInfo.id);
      if (!["administrator", "creator"].includes(botMember.status)) {
        return ctx.reply("❌ Bot is not admin!");
      }
    } catch (e) {
      return ctx.reply(`❌ Cannot access: ${e.message}`);
    }
    await Task.updateOne({ taskId: tId }, { submissionChannel: channelInput });
    return ctx.reply(
      `✅ *Channel Set!*\n\n📢 ${channelInput}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`) }
    );
  }

  if (state === "RDM_SET_MIN" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await setConfig("redeem_min_amount", amt);
    return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem") });
  }

  if (state === "AMZ_SET_MIN" && (await isAdmin(userId))) {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) return ctx.reply("❌ Invalid!");
    await setConfig("amazon_min_amount", amt);
    return ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_amazon") });
  }

  if (state && state.startsWith("TASK_EDIT_DESC_") && (await isAdmin(userId))) {
    let taskId = state.replace("TASK_EDIT_DESC_", "");
    delete userState[userId];
    await Task.updateOne({ taskId }, { description: text });
    return ctx.reply(`✅ Description updated!`, { reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${taskId}`) });
  }

  if (state && state.startsWith("GC_EDIT_NAME_") && (await isAdmin(userId))) {
    let oldCode = state.replace("GC_EDIT_NAME_", "");
    delete userState[userId];
    let newCode = text.trim().toUpperCase().replace(/\s+/g, "");
    if (!newCode || newCode.length < 2 || newCode.length > 30) return ctx.reply("❌ Code name must be 2-30 chars!");
    let existing = await GiftCode.findOne({ code: newCode, type: "redeem" });
    if (existing) return ctx.reply(`❌ Code \`${newCode}\` already exists!`, { parse_mode: "Markdown" });
    await GiftCode.updateOne({ code: oldCode, type: "redeem" }, { code: newCode });
    return ctx.reply(`✅ *Code Name Updated!*\n\n🆔 New: \`${newCode}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${newCode}`) });
  }

  if (state && state.startsWith("GC_EDIT_AMOUNT_") && (await isAdmin(userId))) {
    let code = state.replace("GC_EDIT_AMOUNT_", "");
    delete userState[userId];
    let amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount!");
    await GiftCode.updateOne({ code, type: "redeem" }, { amount });
    return ctx.reply(`✅ *Amount Updated!*\n\n💰 New: ₹${amount}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
  }

  if (state && state.startsWith("GC_EDIT_MAX_") && (await isAdmin(userId))) {
    let code = state.replace("GC_EDIT_MAX_", "");
    delete userState[userId];
    let maxUses = parseInt(text, 10);
    if (isNaN(maxUses) || maxUses < 0) return ctx.reply("❌ Invalid!");
    let finalMax = maxUses === 0 ? 999999 : maxUses;
    await GiftCode.updateOne({ code, type: "redeem" }, { maxUses: finalMax });
    let display = maxUses === 0 ? "Unlimited" : finalMax;
    return ctx.reply(`✅ *Max Uses Updated!*\n\n👥 New: ${display}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", `gc_view_${code}`) });
  }

  if (state === "EDIT_OWNER_NAME" && (await isAdmin(userId))) {
    delete userState[userId];
    let newName = text.trim();
    if (!newName || newName.length < 2 || newName.length > 30) return ctx.reply("❌ Name must be 2-30 characters!");
    await setConfig("owner_display_name", newName);
    return ctx.reply(`✅ *Owner Name Updated!*\n\n👤 New Name: \`${newName}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_webname_edit") });
  }

  if (state === "EDIT_OWNER_LINK" && (await isAdmin(userId))) {
    delete userState[userId];
    let newLink = text.trim();
    if (!newLink || newLink.length < 2) return ctx.reply("❌ Invalid link!");
    await setConfig("owner_display_link", newLink);
    let currentName = await getConfig("owner_display_name", "azeeznasi");
    return ctx.reply(
      `✅ *Owner Link Updated!*\n\n🔗 New Link: \`${newLink}\`\n\n📍 Will appear as: Provided by ${currentName}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_webname_edit") }
    );
  }

  return next();
});

// ============================================================
// 📊 RECENT ADMIN ACTIONS
// ============================================================
bot.callbackQuery("adm_recent_actions", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(15);
  let text = `🚀 *Recent Admin Actions*\n\n`;
  if (logs.length === 0) text += "📭 No actions yet.";
  else logs.forEach((log, i) => {
    let dateStr = new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    text += `${i + 1}. 👤 *${log.adminName}*\n   📌 ${log.action}${log.details ? `: ${log.details}` : ''}\n   🕐 ${dateStr}\n\n`;
  });
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
  await ctx.editMessageText(`🔔 *New User Notification*\n\n📊 ${enabled ? "🟢 ON" : "🔴 OFF"}`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_toggle_notif", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("new_user_notif", true);
  await setConfig("new_user_notif", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🟢 ON" : "🔴 OFF" });
  await rerender(ctx, "adm_user_notif");
});

// ============================================================
// 🎨 CUSTOMIZE THEME
// ============================================================
bot.callbackQuery("adm_customize_theme", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `🎨 *Customize Your Theme*\n\n👇 *Choose what to customize:*`;
  let kb = new InlineKeyboard()
    .text("🎨 Admin Panel Customizing", "adm_panel_custom").row()
    .text("⌨️ Keyboard Buttons Customizing & Edit", "adm_keyboard_custom").row()
    .text("📝 Balance Page Edit", "adm_balance_text").row()
    .text("🔙 Back to Admin", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_panel_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `🎨 *Admin Panel Customizing*\n\n📝 To Rename:`;
  let kb = new InlineKeyboard().text("♻️ Reset", "admpanel_reset").row().text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("admpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("admin_panel_layout", JSON.parse(JSON.stringify(DEFAULT_ADMIN_PANEL_LAYOUT)));
  await rerender(ctx, "admin");
});

bot.callbackQuery("adm_keyboard_custom", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let text = `⌨️ *Keyboard Buttons*\n\nManage layout:`;
  let kb = new InlineKeyboard().text("♻️ Reset to Default", "kbpanel_reset").row().text("🔙 Back", "adm_customize_theme");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("kbpanel_reset", async (ctx) => {
  ctx.answerCallbackQuery({ text: "✅ Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("keyboard_layout", JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_LAYOUT)));
  await rerender(ctx, "adm_keyboard_custom");
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
    await getConfig("tax_percent", 0);
    await getConfig("balance_welcome_text", "⭐ Welcome To Bot!");
    await getConfig("balance_footer_text", "Built with security you can Trust.\nSupport that responds promptly");
    await getConfig("keyboard_layout", DEFAULT_KEYBOARD_LAYOUT);
    await getConfig("admin_panel_layout", DEFAULT_ADMIN_PANEL_LAYOUT);
    await getConfig("welcome_channel_link", "https://t.me/yourchannel");
    await getConfig("bot_active", true);
    await getConfig("quick_pay_tax_enabled", false);
    await getConfig("quick_pay_tax_percent", 0);
    await getConfig("new_user_notif", true);
    await getConfig("broadcast_msg_send", true);
    await getConfig("kb_update_msg_send", true);
    await getConfig("kb_update_msg", "🎨 Keyboard Updated!");
    await getConfig("admin_panel_msg_send", true);
    await getConfig("admin_panel_update_msg", "🎨 Admin Panel Updated!");
    await getConfig("amazon_mode", "auto");
    await getConfig("redeem_mode", "auto");
    await getConfig("amazon_min_amount", 10);
    await getConfig("redeem_min_amount", 10);
    await getConfig("owner_display_name", "azeeznasi");
    await getConfig("owner_display_link", "azeeznasi");
    await getConfig("redeem_claim_message", "🎉 You have successfully claimed ₹{amount}!");

    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) await LiveFund.create({ key: "main_fund" });

    let wsCount = await WithdrawSettings.countDocuments({});
    if (wsCount === 0) {
      const defaults = [
        { method: "upi", isActive: true, minAmount: 10, maxAmount: 10000, taxPercent: 0 },
        { method: "bank", isActive: true, minAmount: 100, maxAmount: 50000, taxPercent: 0 },
        { method: "amazon", isActive: false, minAmount: 100, maxAmount: 5000, taxPercent: 0 },
        { method: "redeem", isActive: false, minAmount: 50, maxAmount: 2000, taxPercent: 0 }
      ];
      for (let d of defaults) await WithdrawSettings.create(d);
    }

    let apiKey = await getConfig("auto_upi_api_key", null);
    if (!apiKey) {
      apiKey = "KEY_" + crypto.randomBytes(16).toString("hex");
      await setConfig("auto_upi_api_key", apiKey);
      console.log("🔐 API Key:", apiKey);
    }

    // Background jobs
    setInterval(async () => {
      try {
        let now = new Date();
        let result = await TaskTimer.updateMany(
          { expiresAt: { $lt: now }, status: "active" },
          { status: "expired" }
        );
        if (result.modifiedCount > 0) console.log(`⌛ Expired ${result.modifiedCount} timers`);
      } catch (e) {}
    }, 60000);

    console.log("⏳ Waiting 8s for cleanup...");
    await new Promise(r => setTimeout(r, 8000));

    console.log(`🌐 Mini App: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/miniapp`);

    await startBotSafe();
  })
  .catch((err) => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================
let serverStarted = false;
if (!serverStarted) {
  serverStarted = true;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} in use. Retrying...`);
      setTimeout(() => { server.close(); server.listen(PORT, "0.0.0.0"); }, 2000);
    }
  });

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT');
    server.close(() => process.exit(0));
  });
}

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => {});
}, 300000);

console.log("✅ bot.js loaded — Complete bot with all features");
console.log("✅ New Gateway System active!");

