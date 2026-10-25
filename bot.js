require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, InputFile } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const QRCode = require("qrcode");

const configCache = { data: {}, loaded: false, lastLoad: 0 };
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MAIN_OWNER_ID = parseInt(process.env.ADMIN_ID || "8061612320", 10);

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ BOT_TOKEN & MONGO_URI required!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const userState = {};

function toSmallCaps(text) {
  const map = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
    'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
    's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
  };
  return String(text).split('').map(c => map[c.toLowerCase()] || c).join('');
}

function toCapitalSmallCaps(text) {
  let str = String(text);
  let isFirst = true;
  return str.split('').map(c => {
    if (/[a-zA-Z]/.test(c)) {
      if (isFirst) { isFirst = false; return c.toUpperCase(); }
      return toSmallCaps(c);
    }
    return c;
  }).join('');
}

function applyFont(text, fontType = "normal") {
  if (!text) return text;
  switch (fontType) {
    case "smallcaps": return toSmallCaps(text);
    case "capital_smallcaps": return toCapitalSmallCaps(text);
    case "bold": return `<b>${text}</b>`;
    case "italic": return `<i>${text}</i>`;
    case "bold_italic": return `<b><i>${text}</i></b>`;
    case "monospace": return `<code>${text}</code>`;
    case "underline": return `<u>${text}</u>`;
    case "strike": return `<s>${text}</s>`;
    case "spoiler": return `<tg-spoiler>${text}</tg-spoiler>`;
    case "normal":
    default: return text;
  }
}

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
      case "custom_emoji":
        wrapped = `<tg-emoji emoji-id="${ent.custom_emoji_id}">${target}</tg-emoji>`;
        break;
      default: wrapped = target;
    }
    result = before + wrapped + after;
  }
  return result;
}

function formatDateTime(date) {
  const d = new Date(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
  const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  let hours = ist.getHours();
  let ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${String(ist.getDate()).padStart(2,'0')} ${months[ist.getMonth()]} ${ist.getFullYear()}, ${String(hours).padStart(2,'0')}:${String(ist.getMinutes()).padStart(2,'0')}:${String(ist.getSeconds()).padStart(2,'0')} ${ampm}`;
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
  return str.substring(0, 3) + '***' + str.substring(str.length - 3);
}

function halfMaskDetails(method, details) {
  if (method === "UPI" || method === "AUTO_UPI") return halfMaskUPI(details);
  if (method === "BANK" || method === "Bank") {
    let parts = String(details).split(',').map(s => s.trim());
    let maskedAcc = halfMaskBank(parts[0]);
    return maskedAcc + (parts[1] ? ` (${parts[1]})` : '');
  }
  if (method === "WALLET" || method === "Wallet") return halfMaskWallet(details);
  if (method === "AMAZON" || method === "Amazon") return halfMaskUPI(details);
  return halfMaskUPI(details);
}

function generateTxnNumber() {
  let num = '';
  for (let i = 0; i < 20; i++) num += Math.floor(Math.random() * 10);
  return num;
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

function formatBalance(balance) {
  let num = Number(balance) || 0;
  if (num < 0) return `-₹${Math.abs(num).toFixed(2)}`;
  return `₹${num.toFixed(2)}`;
}

function makeProgressBar(percent) {
  let total = 20;
  let filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * total);
  return `[${"█".repeat(filled)}${"░".repeat(total - filled)}]`;
}

function formatTimeAgo(date) {
  let diff = Date.now() - new Date(date).getTime();
  let min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  let hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function parseInlineButtons(input) {
  if (!input || !input.trim()) return null;
  let lines = input.trim().split("\n").filter(l => l.trim() !== "");
  let rows = [];
  for (let line of lines) {
    let parts = line.trim().split("&&").map(p => p.trim()).filter(p => p !== "");
    let rowButtons = [];
    for (let part of parts) {
      let match = part.match(/^(.+?)\s*-\s*(https?:\/\/\S+)$/);
      if (match) rowButtons.push({ text: match[1].trim(), url: match[2].trim() });
    }
    if (rowButtons.length > 0) rows.push(rowButtons);
  }
  return rows.length > 0 ? rows : null;
}

function buildInlineKeyboardFromRows(rows) {
  if (!rows || rows.length === 0) return null;
  let kb = new InlineKeyboard();
  for (let row of rows) {
    for (let btn of row) kb.text(btn.text, btn.url);
    kb.row();
  }
  return kb;
}

function formatMinutes(min) {
  if (min < 60) return `${min} minutes`;
  if (min < 1440) return `${min / 60} hour(s)`;
  return `${min / 1440} day(s)`;
}

function buildProcessingDots(frame) {
  const dots = [
    "●  ○  ○",
    "●  ●  ○",
    "●  ●  ●",
    "○  ●  ●",
    "○  ○  ●"
  ];
  return dots[frame % dots.length];
}

// ============ SCHEMAS ============
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
  depositApiUrl: { type: String, default: "" },
  joinedChannels: { type: [String], default: [] },
  withdrawnTotal: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const userPreferenceSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  keyboardLayout: { type: Array, default: null },
  inlineMenus: { type: Object, default: {} },
  adminPanelLayout: { type: Array, default: null },
  fontPreference: { type: String, default: "normal" },
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
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, required: true },
  details: { type: String, required: true },
  status: { type: String, default: "Pending" },
  isGateway: { type: Boolean, default: false },
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

const balanceHistorySchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  action: { type: String, required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const BalanceHistory = mongoose.models.BalanceHistory || mongoose.model("BalanceHistory", balanceHistorySchema);

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
  isActive: { type: Boolean, default: true },
  isHidden: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  addedAt: { type: Date, default: Date.now }
});
const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

const socialLinkSchema = new mongoose.Schema({
  name: { type: String, required: true },
  link: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
});
const SocialLink = mongoose.models.SocialLink || mongoose.model("SocialLink", socialLinkSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});
const Config = mongoose.models.Config || mongoose.model("Config", configSchema);

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

const withdrawSettingsSchema = new mongoose.Schema({
  method: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
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

const depositGatewaySchema = new mongoose.Schema({
  gatewayId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  method: { type: String, default: "GET" },
  url: { type: String, required: true },
  urlTemplate: { type: String, default: "" },
  depositMode: { type: String, default: "auto" },
  status: { type: String, default: "active" },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  taxPercent: { type: Number, default: 0 },
  upiOrNumber: { type: String, default: "Not Set" },
  photoFileId: { type: String, default: "" },
  cooldown: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  autoSuccess: { type: Number, default: 0 },
  manualApproved: { type: Number, default: 0 },
  rejected: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  totalDeposited: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const DepositGateway = mongoose.models.DepositGateway || mongoose.model("DepositGateway", depositGatewaySchema);

const depositRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  gatewayId: { type: String, required: true },
  gatewayName: { type: String, default: "" },
  amount: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  status: { type: String, default: "Pending" },
  utr: { type: String, default: "" },
  apiUrl: { type: String, default: "" },
  apiResponse: { type: String, default: "" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const DepositRequest = mongoose.models.DepositRequest || mongoose.model("DepositRequest", depositRequestSchema);

// ============ AUTO UPI (DEPOSIT) SCHEMAS ============
const autoUpiSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main_upi" },
  upiId: { type: String, default: "Not Set" },
  payeeName: { type: String, default: "Auto UPI" },
  apiUrl: { type: String, default: "" },
  apiKey: { type: String, default: "" },
  minAmount: { type: Number, default: 5 },
  maxAmount: { type: Number, default: 5000 },
  taxPercent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  mode: { type: String, default: "manual" },
  updatedAt: { type: Date, default: Date.now }
});
const AutoUpi = mongoose.models.AutoUpi || mongoose.model("AutoUpi", autoUpiSchema);

const autoUpiOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  userName: { type: String, default: "" },
  amount: { type: Number, required: true },
  upiId: { type: String, required: true },
  utr: { type: String, default: "" },
  status: { type: String, default: "Pending" },
  apiResponse: { type: String, default: "" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AutoUpiOrder = mongoose.models.AutoUpiOrder || mongoose.model("AutoUpiOrder", autoUpiOrderSchema);
// ============ CONFIG HELPERS ============
async function preloadAllConfigs() {
  try {
    let allConfigs = await Config.find({}).lean();
    let newData = {};
    for (let conf of allConfigs) newData[conf.key] = conf.value;
    configCache.data = newData;
    configCache.loaded = true;
    configCache.lastLoad = Date.now();
    console.log(`⚡ Configs preloaded: ${allConfigs.length} keys`);
  } catch (e) {
    console.error("Config preload error:", e.message);
  }
}

// FIXED: 60s cache expiry prevents stale configs
async function getConfig(key, defaultValue) {
  let now = Date.now();
  if (configCache.data[key] !== undefined && configCache.loaded && (now - configCache.lastLoad) < 60000) {
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

async function isAdmin(userId) {
  try {
    if (Number(userId) === Number(MAIN_OWNER_ID)) return true;
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    if (Number(userId) === Number(ownerId)) return true;
    let botAdmin = await BotAdmin.findOne({ userId, isActive: true }).lean();
    return !!botAdmin;
  } catch (e) { return false; }
}

async function isAdminDisabled(userId) {
  try {
    let botAdmin = await BotAdmin.findOne({ userId, isActive: false }).lean();
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

  let results = await Promise.allSettled(
    channels.map(ch =>
      ctx.api.getChatMember(ch.channelId, userId)
        .then(m => ({ ch, status: m.status }))
        .catch(() => ({ ch, status: "error" }))
    )
  );

  for (let r of results) {
    if (r.status !== "fulfilled") continue;
    let { ch, status } = r.value;
    if (status === "kicked") {
      if (bannedAllowed) continue;
      return false;
    }
    if (["left", "restricted"].includes(status)) return false;
    if (["member", "administrator", "creator"].includes(status)) joinedChannels.push(ch.channelId);
  }

  if (joinedChannels.length > 0) await User.updateOne({ userId }, { joinedChannels });
  return true;
}

async function getPayoutChannel(method = null) {
  let newCh = await getConfig("payout_channel", null);
  if (newCh && newCh !== "Not Set") return newCh;

  if (method) {
    let oldCh = await getConfig("payout_channel_" + method.toLowerCase(), null);
    if (oldCh && oldCh !== "Not Set") return oldCh;
  }

  for (let m of ["upi", "bank", "wallet", "amazon", "redeem", "auto_upi"]) {
    let oldCh = await getConfig("payout_channel_" + m, null);
    if (oldCh && oldCh !== "Not Set") return oldCh;
  }
  return "Not Set";
}

async function logBalanceHistory(userId, action, amount) {
  try { await BalanceHistory.create({ userId, action, amount }); }
  catch (e) { console.error("logBalanceHistory:", e.message); }
}

async function logAdminAction(adminId, adminName, action, details = "", amount = 0, targetUserId = null) {
  try { await AdminLog.create({ adminId, adminName, action, details, amount, targetUserId }); }
  catch (e) { console.error("logAdminAction:", e.message); }
}

// ============ DEFAULTS ============
const DEFAULT_KEYBOARD_LAYOUT = [
  { name: `📋 ${toSmallCaps("Bot Task")}`, key: "btn_tasks", row: 0, hidden: false },
  { name: `💸 ${toSmallCaps("My Balance")}`, key: "btn_balance", row: 0, hidden: false },
  { name: `🎁 ${toSmallCaps("Gift Code")}`, key: "btn_gift", row: 1, hidden: false },
  { name: `⚡ ${toSmallCaps("Quick Pay")}`, key: "btn_quickpay", row: 1, hidden: false },
  { name: `💳 ${toSmallCaps("Payout Method")}`, key: "btn_payout", row: 2, hidden: false },
  { name: `🚀 ${toSmallCaps("Withdraw")}`, key: "btn_withdraw", row: 2, hidden: false }
];

const DEFAULT_ADMIN_PANEL_LAYOUT = [
  { name: `👮 Add/Remove Admins Permission`, key: "adm_permissions", row: 0, hidden: false },
  { name: `👑 Transfer Ownership`, key: "adm_transfer", row: 1, hidden: false },
  { name: `💰 Set Withdraw Tax`, key: "adm_set_wd_tax", row: 1, hidden: false },
  { name: `👮 Manage Admins`, key: "adm_admins", row: 2, hidden: false },
  { name: `🚫 Manage Ban Users`, key: "adm_manage_ban", row: 2, hidden: false },
  { name: `🤖 Bot Status`, key: "adm_bot_status", row: 3, hidden: false },
  { name: `🚫 Manage Ban Wallet`, key: "adm_manage_ban_wallet", row: 3, hidden: false },
  { name: `💸 Withdraw Status`, key: "adm_wd_status", row: 4, hidden: false },
  { name: `➕ Add Balance`, key: "adm_add_bal", row: 4, hidden: false },
  { name: `➖ Remove Balance`, key: "adm_rem_bal", row: 5, hidden: false },
  { name: `⚡ Manage Your Channels`, key: "adm_manage_channels", row: 5, hidden: false },
  { name: `⚠️ Reset Balance`, key: "adm_reset_all_bal", row: 6, hidden: false },
  { name: `🎨 Customize Your Theme`, key: "adm_customize_theme", row: 6, hidden: false },
  { name: `💬 Talk With User`, key: "adm_talk_user", row: 7, hidden: false },
  { name: `📢 Broadcast`, key: "adm_broadcast", row: 7, hidden: false },
  { name: `🔍 Find User Details`, key: "adm_find_user", row: 8, hidden: false },
  { name: `📊 Status`, key: "adm_status", row: 8, hidden: false },
  { name: `⚡ Quick Pay`, key: "adm_quick_pay", row: 9, hidden: false },
  { name: `🏦 Gateway Setup`, key: "adm_gateway_menu", row: 9, hidden: false },
  { name: `💰 Deposit Steps`, key: "adm_deposit_steps", row: 10, hidden: false },
  { name: `🎁 Gift Codes`, key: "adm_create_gift", row: 10, hidden: false },
  { name: `🔔 New User Notification`, key: "adm_user_notif", row: 11, hidden: false },
  { name: `🎁 Manage Redeem Codes`, key: "adm_redeem", row: 11, hidden: false },
  { name: `📧 Manage Amazon Codes`, key: "adm_amazon", row: 12, hidden: false },
  { name: `📋 Manage Tasks`, key: "adm_tasks_manager", row: 12, hidden: false },
  { name: `🚀 Recent Admin Actions`, key: "adm_recent_actions", row: 13, hidden: false },
  { name: `🇮🇳 Auto Gateway UPI`, key: "adm_auto_upi", row: 13, hidden: false },
  { name: `🔄 Refresh Panel`, key: "admin", row: 14, hidden: false }
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

const FONT_OPTIONS = [
  { key: "normal", name: "Normal", preview: "Admin Panel" },
  { key: "smallcaps", name: "Small Caps", preview: "ᴀᴅᴍɪɴ ᴘᴀɴᴇʟ" },
  { key: "capital_smallcaps", name: "Capital Small Caps", preview: "Aᴅᴍɪɴ Pᴀɴᴇʟ" },
  { key: "bold", name: "Bold", preview: "Admin Panel" },
  { key: "italic", name: "Italic", preview: "Admin Panel" },
  { key: "bold_italic", name: "Bold Italic", preview: "Admin Panel" },
  { key: "monospace", name: "Monospace", preview: "Admin Panel" },
  { key: "underline", name: "Underline", preview: "Admin Panel" },
  { key: "strike", name: "Strike", preview: "Admin Panel" },
  { key: "spoiler", name: "Spoiler", preview: "Admin Panel" }
];

// ============ GATEWAY PAYOUT ============
async function processGatewayPayout({ bot, userId, amount, gatewayInfo, wallet, channelList = [], showRemainingBalance = true }) {
  try {
    let urlTemplate = gatewayInfo.url_template || gatewayInfo.url || "";
    let finalUrl = urlTemplate
      .replace(/{wallet}/g, encodeURIComponent(wallet))
      .replace(/{amount}/g, encodeURIComponent(amount))
      .replace(/{userId}/g, encodeURIComponent(userId))
      .replace(/{orderId}/g, encodeURIComponent("WD" + Date.now()))
      .replace(/{txnId}/g, encodeURIComponent("TXN" + Date.now()))
      .replace(/{timestamp}/g, encodeURIComponent(Date.now()));

    let response;
    let resData;
    try {
      response = await axios.get(finalUrl, { timeout: 15000 });
      try { resData = JSON.stringify(response.data); } catch (e) { resData = String(response.data); }
    } catch (apiErr) {
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
    } catch (parseErr) { }

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
      try { await bot.api.sendMessage(ch, msg, { parse_mode: "HTML" }); } catch (channelErr) { }
    }

    return { status: 'success', txnNumber: txnNumber || generateTxnNumber(), rawResponse: resData };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

// ============ DEPOSIT PROCESSING ============
async function processDeposit(ctx, userId, gw, amount, finalUrl, orderId) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let statusMsg = await ctx.reply(
    `⏳ <b>${toSmallCaps("Processing Deposit")}...</b>\n\n` +
    `💰 ${toSmallCaps("Amount")}: ₹${amount.toFixed(2)}\n` +
    `📡 ${toSmallCaps("Please wait")}...`,
    { parse_mode: "HTML" }
  );

  const dots = ["•  ", "• •", "• • •"];
  let frame = 0;
  const animInterval = setInterval(async () => {
    frame = (frame + 1) % 3;
    try {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
        `⏳ <b>${toSmallCaps("Processing Deposit")}...</b>\n\n` +
        `💰 ${toSmallCaps("Amount")}: ₹${amount.toFixed(2)}\n` +
        `📡 ${toSmallCaps("Please wait")} ${dots[frame]}`,
        { parse_mode: "HTML" }
      );
    } catch (e) { }
  }, 500);

  let user = await getUser(userId);

  try {
    let response;
    try {
      response = gw.method === "POST"
        ? await axios.post(finalUrl, {}, { timeout: 30000 })
        : await axios.get(finalUrl, { timeout: 30000 });
    } catch (apiErr) {
      clearInterval(animInterval);
      await DepositRequest.updateOne({ requestId: orderId }, { status: "Failed", apiResponse: apiErr.message });
      await notifyDepositChannel({ user, gw, amount, status: "Failed", reason: apiErr.message });
      return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
        `❌ <b>${toSmallCaps("Deposit Failed")}</b>\n\n` +
        `💰 ₹${amount.toFixed(2)}\n📛 ${apiErr.message}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(makeBtn("🏠 Menu"), "back_to_balance")
        }
      );
    }

    clearInterval(animInterval);

    let data = response.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { } }

    let isSuccess =
      data.status === "success" || data.status === "Success" ||
      data.success === true || data.status === "ok" ||
      data.status === "completed" || data.code === 200 ||
      /success|completed|done|paid/i.test(JSON.stringify(data));

    if (isSuccess) {
      let taxPercent = gw.taxPercent || 0;
      let taxAmount = taxPercent > 0 ? (amount * taxPercent) / 100 : 0;
      let addedAmount = amount - taxAmount;

      user.balance += addedAmount;
      await user.save();

      await DepositGateway.updateOne({ gatewayId: gw.gatewayId }, {
        $inc: { totalDeposits: 1, autoSuccess: 1, totalDeposited: addedAmount }
      });
      await DepositRequest.updateOne({ requestId: orderId }, {
        status: "Approved", apiResponse: JSON.stringify(data).substring(0, 500), approvedAt: new Date()
      });
      await logBalanceHistory(userId, `Auto Deposit (${gw.name})`, addedAmount);

      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
        `✅ <b>${toSmallCaps("Deposit Successful!")}</b>\n\n` +
        `💰 <b>${toSmallCaps("Amount Added")}:</b> ₹${addedAmount.toFixed(2)}\n` +
        `📊 <b>${toSmallCaps("Tax Deducted")}:</b> ₹${taxAmount.toFixed(2)} (${taxPercent}%)\n` +
        `💳 <b>${toSmallCaps("Gateway")}:</b> ${gw.name}\n` +
        `💳 <b>${toSmallCaps("New Balance")}:</b> ₹${user.balance.toFixed(2)}\n\n` +
        `🚀 <b>${toSmallCaps("Your Funds Have Been Added Successfully To Your Wallet.")}</b>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(makeBtn("🏠 Menu"), "back_to_balance")
        }
      );

      await notifyDepositChannel({
        user, gw, amount: addedAmount, tax: taxAmount,
        status: "Success", newBalance: user.balance
      });
    } else {
      await DepositRequest.updateOne({ requestId: orderId }, {
        status: "Failed", apiResponse: JSON.stringify(data).substring(0, 500)
      });
      await notifyDepositChannel({
        user, gw, amount, status: "Failed",
        reason: data.message || data.error || "Gateway declined"
      });
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
        `❌ <b>${toSmallCaps("Deposit Failed")}</b>\n\n` +
        `💰 ₹${amount.toFixed(2)}\n📛 ${data.message || data.error || "Gateway declined"}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(makeBtn("🏠 Menu"), "back_to_balance")
        }
      );
    }
  } catch (e) {
    clearInterval(animInterval);
    await DepositRequest.updateOne({ requestId: orderId }, { status: "Failed", apiResponse: e.message });
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
      `❌ <b>${toSmallCaps("Deposit Error")}</b>\n\n${e.message}`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(makeBtn("🏠 Menu"), "back_to_balance")
      }
    );
    await notifyDepositChannel({ user, gw, amount, status: "Failed", reason: e.message });
  }
}

async function notifyDepositChannel({ user, gw, amount, tax = 0, status, reason, newBalance }) {
  try {
    let channel = await getPayoutChannel(gw.name);
    if (!channel || channel === "Not Set") return;

    let statusIcon = status === "Success" ? "✅" : "❌";
    let statusText = status === "Success" ? "SUCCESS" : "FAILED";

    let text = `📥 <b>${toSmallCaps("New Deposit")}</b>\n\n` +
      `${statusIcon} <b>${toSmallCaps("Status")}:</b> ${statusText}\n` +
      `👤 <b>${toSmallCaps("User")}:</b> <a href="tg://user?id=${user.userId}">${user.firstName || "User"}</a>\n` +
      `🆔 <b>${toSmallCaps("User ID")}:</b> <code>${user.userId}</code>\n` +
      `💳 <b>${toSmallCaps("Gateway")}:</b> ${gw.name}\n` +
      `💰 <b>${toSmallCaps("Amount")}:</b> ₹${amount.toFixed(2)}\n`;

    if (status === "Success") {
      if (tax > 0) text += `📊 <b>${toSmallCaps("Tax")}:</b> ₹${tax.toFixed(2)}\n`;
      if (newBalance !== undefined) text += `💵 <b>${toSmallCaps("New Balance")}:</b> ₹${newBalance.toFixed(2)}\n`;
    } else {
      text += `📛 <b>${toSmallCaps("Reason")}:</b> ${reason || "Unknown"}\n`;
    }

    text += `\n🕐 <b>${toSmallCaps("Time")}:</b> ${formatDateTime(new Date())}`;
    await bot.api.sendMessage(channel, text, { parse_mode: "HTML" });
  } catch (e) { }
}

async function processManualDeposit(ctx, userId, gw, amount) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let orderId = "ORD" + Date.now() + Math.floor(Math.random() * 1000);

  await DepositRequest.create({
    requestId: orderId, userId, userName: ctx.from.first_name || "",
    gatewayId: gw.gatewayId, gatewayName: gw.name,
    amount, tax: gw.tax || 0, status: "Pending", createdAt: new Date()
  });

  await DepositGateway.updateOne({ gatewayId: gw.gatewayId }, {
    $inc: { totalDeposits: 1, pending: 1 }
  });

  let text = `👤 <b>${toSmallCaps("Manual Deposit")}: ${gw.name}</b>\n\n` +
    `💰 <b>${toSmallCaps("Amount")}:</b> ₹${amount.toFixed(2)}\n`;

  if (gw.upiOrNumber && gw.upiOrNumber !== "Not Set") {
    text += `📍 <b>${toSmallCaps("Pay To")}:</b> <code>${gw.upiOrNumber}</code>\n`;
  }
  text += `\n📝 ${toSmallCaps("After payment, send UTR / Transaction ID")}:\n🆔 ${toSmallCaps("Order")}: <code>${orderId}</code>`;

  if (gw.photoFileId) {
    await ctx.replyWithPhoto(gw.photoFileId, {
      caption: text,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(makeBtn("❌ Cancel"), "user_dep_cancel")
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(makeBtn("❌ Cancel"), "user_dep_cancel")
    });
  }

  userState[userId] = `USER_DEP_UTR_${orderId}`;
}

async function rerender(ctx, callbackData) {
  try {
    const msg = ctx.callbackQuery?.message || ctx.message;
    if (!msg || !msg.chat) return;
    const fakeUpdate = {
      update_id: Date.now() + Math.floor(Math.random() * 100000),
      callback_query: {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        from: ctx.from,
        chat_instance: "rerender",
        data: callbackData,
        message: msg
      }
    };
    await bot.handleUpdate(fakeUpdate);
  } catch (e) { }
}

async function buildKeyboardFromLayout(userId) {
  let userPref = await UserPreference.findOne({ userId }).lean();
  let layout;

  if (userPref && userPref.keyboardLayout && userPref.keyboardLayout.length > 0) {
    layout = userPref.keyboardLayout;
  } else {
    let freshConfig = await Config.findOne({ key: "keyboard_layout" }).lean();
    layout = (freshConfig && freshConfig.value) ? freshConfig.value : DEFAULT_KEYBOARD_LAYOUT;
    configCache.data["keyboard_layout"] = layout;
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

async function getActiveKeyboardLayout() {
  let layout = configCache.data["keyboard_layout"] || DEFAULT_KEYBOARD_LAYOUT;
  return layout.filter(b => !b.hidden);
}

async function getActiveAdminPanelLayout() {
  let layout = configCache.data["admin_panel_layout"] || DEFAULT_ADMIN_PANEL_LAYOUT;
  return layout.filter(b => !b.hidden);
}

async function getUserFont(userId) {
  let pref = await UserPreference.findOne({ userId }).lean();
  return (pref && pref.fontPreference) ? pref.fontPreference : "normal";
}

async function sendUnknownCommand(ctx) {
  try {
    let active = await getConfig("unknown_command_active", true);
    if (!active) return;
    let text = await getConfig("unknown_command_text",
      "❓ I didn't understand that.\n\nPlease /start the bot again.");
    return ctx.reply(`<code>${escapeHtml(text)}</code>`, { parse_mode: "HTML" });
  } catch (e) { }
}

async function animateProcessing(ctx, messageId, chatId, durationMs = 30000) {
  let frame = 0;
  const startTime = Date.now();
  const interval = setInterval(async () => {
    if (Date.now() - startTime > durationMs) {
      clearInterval(interval);
      return;
    }
    try {
      await bot.api.editMessageText(chatId, messageId,
        `⏳ ${toSmallCaps("Processing")}\n\n${buildProcessingDots(frame)}`,
        { parse_mode: "HTML" }
      );
    } catch (e) { }
    frame++;
  }, 400);
  return interval;
}

// ============ EXPRESS ROUTES ============
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

    let safeAmount = wd.amount.toFixed(2);
    let safeDetails = escapeHtml(wd.details).replace(/'/g, "\\'");
    let safeTxn = escapeHtml(displayTxn).replace(/'/g, "\\'");

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
      <div class="card-box"><div class="amount-label">WITHDRAWAL AMOUNT</div><div class="amount-val" data-copy="${safeAmount}">₹ ${safeAmount}</div></div>
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${escapeHtml(wd.method.toUpperCase())}</span></div>
      <div class="info-row"><span class="info-title">DESTINATION</span><span class="info-value" data-copy="${safeDetails}">${escapeHtml(wd.details)}</span></div>
      <div class="info-row"><span class="info-title">TXN ID</span><span class="info-value mono" data-copy="${safeTxn}">${escapeHtml(displayTxn)}</span></div>
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
      document.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
          navigator.clipboard.writeText(el.dataset.copy).then(() => {
            let t = document.createElement('div');
            t.textContent = '✅ Copied!';
            t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#00ffcc;color:#000;padding:10px 20px;border-radius:10px;font-weight:bold;z-index:9999;';
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 1500);
          });
        });
      });
    </script>
    </body></html>`;
    res.send(html);
  } catch (e) { res.status(500).send("Error"); }
});

app.get("/", (req, res) => res.send("Bot Server Live!"));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/miniapp", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/miniapp/withdraw", (req, res) => res.sendFile(path.join(__dirname, "public", "withdraw.html")));
app.get("/miniapp/task", (req, res) => res.sendFile(path.join(__dirname, "public", "task.html")));
app.get("/miniapp/pay", (req, res) => res.sendFile(path.join(__dirname, "public", "pay.html")));
app.get("/miniapp/profile", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/miniapp/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/miniapp/history", (req, res) => res.sendFile(path.join(__dirname, "public", "history.html")));

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
      if (user.gatewayNumbers instanceof Map) gwNumbers = Object.fromEntries(user.gatewayNumbers);
      else if (typeof user.gatewayNumbers === "object") gwNumbers = { ...user.gatewayNumbers };
    }
    res.json({ success: true, user: { ...user, linkedInfo, gatewayNumbers: gwNumbers } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/profile-photo/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
    if (photos.total_count === 0) return res.json({ success: false });
    res.json({ success: true, photoUrl: `/miniapp/api/photo-proxy/${userId}` });
  } catch (e) { res.json({ success: false }); }
});

app.get("/miniapp/api/photo-proxy/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    let photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
    if (photos.total_count === 0) return res.status(404).end();
    let fileId = photos.photos[0][0].file_id;
    let file = await bot.api.getFile(fileId);
    let url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    let response = await axios.get(url, { responseType: 'stream' });
    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (e) { res.status(500).end(); }
});

app.get("/miniapp/api/is-admin/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    res.json({ success: true, isAdmin: await isAdmin(userId), isOwner: await isOwner(userId) });
  } catch (e) { res.json({ success: false, isAdmin: false }); }
});

app.get("/miniapp/api/config", async (req, res) => {
  try {
    const config = {
      appLogo: await getConfig("app_logo", "Task Earn Bot"),
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

app.get("/miniapp/api/tasks", async (req, res) => {
  try { res.json({ success: true, tasks: await Task.find({ isActive: { $ne: false }, isComplete: true }).lean() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
      if (photos.total_count > 0) photoUrl = `/miniapp/api/photo-proxy/${userId}`;
    } catch (e) { }
    res.json({ success: true, user: { userId: user.userId, firstName: user.firstName, username: user.username, balance: user.balance, photoUrl } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/gateways", async (req, res) => {
  try { res.json({ success: true, gateways: await Gateway.find({ isActive: true }).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/deposit-gateways", async (req, res) => {
  try { res.json({ success: true, gateways: await DepositGateway.find({ status: "active" }).sort({ order: 1, createdAt: 1 }).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/auto-upi", async (req, res) => {
  try {
    let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
    if (!cfg || !cfg.isActive || !cfg.upiId || cfg.upiId === "Not Set") {
      return res.json({ success: false, error: "Auto UPI disabled" });
    }
    res.json({ success: true, config: { upiId: cfg.upiId, payeeName: cfg.payeeName, minAmount: cfg.minAmount, maxAmount: cfg.maxAmount, taxPercent: cfg.taxPercent } });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
    let wallet = user.walletNumber || "";
    if (!wallet) return res.json({ success: false, error: "Please save your number first", needsNumber: true });
    let minW = gateway.minAmount || 0;
    let maxW = gateway.maxAmount || 0;
    if (minW > 0 && amt < minW) return res.json({ success: false, error: `Min ₹${minW}` });
    if (maxW > 0 && amt > maxW) return res.json({ success: false, error: `Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${gatewayName} (MiniApp)`, -amt);
    let payoutChannel = await getPayoutChannel(gatewayName);
    let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];
    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
    let result = await processGatewayPayout({ bot, userId: uid, amount: amt, gatewayInfo: gateway, wallet, channelList, showRemainingBalance: true });
    if (result.status === 'success') {
      let txnNumber = result.txnNumber || generateTxnNumber();
      let processTime = new Date();
      await Withdrawal.create({
        withdrawalId, userId: uid, userWithdrawalCount, amount: amt,
        method: gatewayName, details: wallet, status: "Approved",
        isGateway: true, gatewayName: gateway.name,
        gatewayResponse: result.rawResponse || "",
        txnNumber, approvedBy: "Auto Gateway", approvedAt: processTime
      });
      await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amt } }, { upsert: true });
      let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
      let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;
      try {
        await bot.api.sendMessage(uid,
          `🎁Your Withdrawal of Rs.<code>${amt.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n` +
          `🏦 Destination ==> <code>${wallet}</code>\n` +
          `🚀Transaction ID ==> <code>${txnNumber}</code>\n` +
          `🗓 Date ==> ${formatDateTime(processTime)}\n\n` +
          `✅Please Check Your ${gatewayName} Account!`,
          { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) });
      } catch (e) { }
      return res.json({ success: true, autoProcessed: true, withdrawalId, txnNumber });
    } else {
      user.balance += amt;
      user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amt);
      await user.save();
      await logBalanceHistory(uid, `Withdrawal Failed (Refunded)`, amt);
      return res.json({ success: false, error: result.message || "Gateway failed" });
    }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/withdraw", async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });
    let withdrawEnabled = await getConfig("withdraw_enabled", true);
    if (!withdrawEnabled) return res.json({ success: false, error: "Withdrawals disabled" });
    let methodSetting = await WithdrawSettings.findOne({ method: method.toLowerCase() });
    if (methodSetting && !methodSetting.isActive) return res.json({ success: false, error: `${method} is currently OFF` });
    let details = "";
    if (method === "UPI") details = user.upiId;
    else if (method === "Bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
    else if (method === "Amazon") details = user.amazonEmail;
    else if (method === "Redeem") details = user.redeemCodeAddr;
    else return res.json({ success: false, error: "Invalid method" });
    if (!details || details === "Not Set" || details.trim() === "" || details.includes("Not Set")) return res.json({ success: false, error: `${method} not linked!`, needsLink: true, method });
    let minW = methodSetting ? methodSetting.minAmount : 0;
    let maxW = methodSetting ? methodSetting.maxAmount : 0;
    if (minW > 0 && amt < minW) return res.json({ success: false, error: `Min ₹${minW}` });
    if (maxW > 0 && amt > maxW) return res.json({ success: false, error: `Max ₹${maxW}` });
    if (user.balance < amt) return res.json({ success: false, error: "Insufficient balance" });
    user.balance -= amt;
    user.withdrawnTotal = (user.withdrawnTotal || 0) + amt;
    await user.save();
    await logBalanceHistory(uid, `Withdrawn via ${method} (MiniApp)`, -amt);
    let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
    let userWithdrawalCount = approvedCount + 1;
    const withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
    await Withdrawal.create({ withdrawalId, userId: uid, userWithdrawalCount, amount: amt, method, details, isGateway: false });
    let payoutChannel = await getPayoutChannel(method);
    if (payoutChannel && payoutChannel !== "Not Set") {
      const adminKb = new InlineKeyboard().text("Approve ✅", `wd_app_${withdrawalId}`).text("Reject ❌", `wd_rej_${withdrawalId}`);
      const userLink = `<a href="tg://user?id=${uid}"><b>${uid}</b></a>`;
      const hashTag = `<code>(#${userWithdrawalCount})</code>`;
      const methodIcon = method === 'UPI' ? '⚡' : method === 'Bank' ? '🏦' : method === 'Amazon' ? '📧' : '🎁';
      try {
        await bot.api.sendMessage(payoutChannel,
          `⚠️ <b>New ${method.toUpperCase()} Payout Request!</b> ${hashTag}\n\n` +
          `👤 <b>User:</b> ${userLink}\n` +
          `💰 <b>Request Amount:</b> <b>₹${amt}</b>\n` +
          `${methodIcon} <b>${method} ID:</b> <code><b>${details}</b></code>\n\n` +
          `📊 <b>Status:</b> ⏳ Pending`,
          { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
      } catch (e) { }
    }
    res.json({ success: true, withdrawalId });
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
    if (receiver.isBanned) return res.json({ success: false, error: "Receiver is banned" });
    const isPrivileged = (await isAdmin(sId)) || (await isOwner(sId));
    if (!isPrivileged && sender.balance < amt) return res.json({ success: false, error: "Insufficient balance" });
    const taxEnabled = await getConfig("quick_pay_tax_enabled", false);
    const taxPercent = await getConfig("quick_pay_tax_percent", 0);
    let taxAmount = 0, receiverAmount = amt;
    if (taxEnabled && taxPercent > 0) { taxAmount = (amt * taxPercent) / 100; receiverAmount = amt - taxAmount; }
    if (!isPrivileged) { sender.balance -= amt; await sender.save(); }
    receiver.balance += receiverAmount; await receiver.save();
    if (taxAmount > 0) {
      const ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
      await User.findOneAndUpdate({ userId: ownerId }, { $inc: { balance: taxAmount } });
      await logBalanceHistory(ownerId, `Quick Pay Tax from ${sId}`, taxAmount);
    }
    await logBalanceHistory(sId, `Quick Pay to ${rId}`, -amt);
    await logBalanceHistory(rId, `Quick Pay from ${sId}`, receiverAmount);
    try {
      await bot.api.sendMessage(rId, `💸 ${toSmallCaps("You Received")} ₹${receiverAmount.toFixed(2)} ${toSmallCaps("From")} <a href="tg://user?id=${sId}">${escapeHtml(sender.firstName || "User")}</a>`, { parse_mode: "HTML" });
    } catch (e) { }
    res.json({ success: true, newBalance: sender.balance });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/update-payment", async (req, res) => {
  try {
    const { userId, field, value } = req.body;
    const uid = parseInt(userId, 10);
    const allowed = ["walletNumber", "upiId", "bankAccNo", "bankIfsc", "amazonEmail", "redeemCodeAddr", "walletAccount"];
    if (!allowed.includes(field)) return res.json({ success: false, error: "Invalid field" });
    const update = {}; update[field] = value;
    await User.findOneAndUpdate({ userId: uid }, update);
    res.json({ success: true });
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
    if (task.expiresAt && new Date(task.expiresAt) <= new Date()) return res.json({ success: false, error: "Task expired" });
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await User.findOne({ userId: uid });
    const userName = user ? (user.firstName || "User") : "User";
    let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
    if (!alertChannel || alertChannel === "Not Set") return res.json({ success: false, error: "Alert channel not set." });
    let userLink = `<a href="tg://user?id=${uid}">${userName} (${uid})</a>`;
    const caption = `<b>NEW TASK SUBMISSION</b>\n\nUser: ${userLink}\nTask: ${task.title}\nReward: ₹${task.reward}\nLink: ${task.link}\nType: Screenshot`;
    const kb = new InlineKeyboard().text("Approve ✅", `task_app_${submissionId}`).text("Reject ❌", `task_rej_${submissionId}`);
    let sentMsg;
    try { sentMsg = await bot.api.sendPhoto(alertChannel, new InputFile(buffer, "proof.jpg"), { caption, parse_mode: "HTML", reply_markup: kb }); }
    catch (e) { return res.json({ success: false, error: "Failed: " + e.message }); }
    const photoFileId = sentMsg.photo[sentMsg.photo.length - 1].file_id;
    await TaskSubmission.create({ submissionId, userId: uid, userName, taskId: task.taskId, taskTitle: task.title, reward: task.reward, photoFileId, status: "Pending" });
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
    let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
    if (!alertChannel || alertChannel === "Not Set") return res.json({ success: false, error: "Alert channel not set." });
    await TaskSubmission.create({ submissionId, userId: uid, userName, taskId: task.taskId, taskTitle: task.title, reward: task.reward, photoFileId: `REFER: ${referValue}`, status: "Pending" });
    let userLink = `<a href="tg://user?id=${uid}">${userName} (${uid})</a>`;
    let caption = `<b>NEW TASK SUBMISSION</b>\n\nUser: ${userLink}\nTask: ${task.title}\nReward: ₹${task.reward}\nLink: ${task.link}\nType: Refer\nRefer: ${referValue}`;
    let kb = new InlineKeyboard().text("Approve ✅", `task_app_${submissionId}`).text("Reject ❌", `task_rej_${submissionId}`);
    try { await bot.api.sendMessage(alertChannel, caption, { parse_mode: "HTML", reply_markup: kb }); }
    catch (e) { return res.json({ success: false, error: "Failed: " + e.message }); }
    res.json({ success: true, submissionId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

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
    withdrawals.forEach(w => allHistory.push({ action: `Withdrawal (${w.method})`, amount: -w.amount, status: w.status === "Approved" ? "success" : "pending", detail: `To: ${w.details}`, txnId: w.txnNumber || w.withdrawalId, createdAt: w.createdAt }));
    deposits.forEach(d => allHistory.push({ action: `Deposit (${d.source || "UPI"})`, amount: d.amount, status: "success", detail: d.utr ? `UTR: ${d.utr}` : "", txnId: d.orderId, createdAt: d.createdAt }));
    transfers.forEach(t => allHistory.push({ action: t.amount < 0 ? "Payment Sent" : "Payment Received", amount: t.amount, status: "success", detail: t.action, txnId: "", createdAt: t.createdAt }));
    balanceHistory.forEach(b => {
      if (b.action.match(/Withdrawn|Quick Pay|Deposit|UPI Deposit/i)) return;
      allHistory.push({ action: b.action, amount: b.amount, status: "success", detail: "", txnId: "", createdAt: b.createdAt });
    });
    allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, history: allHistory.slice(0, limit), total: allHistory.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try { res.json({ success: true, withdrawals: await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    let txnNumber = generateTxnNumber();
    let processTime = new Date();
    wd.status = "Approved"; wd.txnNumber = txnNumber; wd.approvedBy = "MiniApp Admin"; wd.approvedAt = processTime;
    await wd.save();
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });
    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n🏦 Destination ==> <code>${wd.details}</code>\n🚀Transaction ID ==> <code>${txnNumber}</code>\n🗓 Date ==> ${formatDateTime(processTime)}\n\n✅Please Check Your ${wd.method} Account!`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", `${serverUrl}/receipt/${wd.withdrawalId}`) });
    } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    wd.status = "Rejected"; wd.approvedBy = "MiniApp Admin"; wd.approvedAt = new Date();
    await wd.save();
    let user = await getUser(wd.userId);
    user.balance += wd.amount;
    user.withdrawnTotal = (user.withdrawnTotal || 0) - wd.amount;
    await user.save();
    await logBalanceHistory(wd.userId, "Withdrawal Refunded", wd.amount);
    try { await bot.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try { res.json({ success: true, submissions: await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    sub.status = "Approved"; await sub.save();
    let user = await getUser(sub.userId);
    user.balance += sub.reward; await user.save();
    await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
    await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });
    try { await bot.api.sendMessage(sub.userId, `🎉 *Payment Received!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}\n✅ Approved`, { parse_mode: "Markdown" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    sub.status = "Rejected"; await sub.save();
    try { await bot.api.sendMessage(sub.userId, `❌ *Task Rejected!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`, { parse_mode: "Markdown" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-upi", async (req, res) => {
  try { res.json({ success: true, payments: await UPIPayment.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Approved") return res.json({ success: false, error: "Already processed" });
    payment.status = "Approved"; payment.verifiedAt = new Date(); payment.approvedBy = "MiniApp Admin";
    await payment.save();
    let user = await getUser(payment.userId);
    user.balance += payment.amount; await user.save();
    await logBalanceHistory(payment.userId, `UPI Deposit (Manual)`, payment.amount);
    try { await bot.api.sendMessage(payment.userId, `✅ ${toSmallCaps("Deposit Approved!")}\n\n💰 ₹${payment.amount}\n🔐 ${payment.utr}`, { parse_mode: "HTML" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-upi/:id", async (req, res) => {
  try {
    const payment = await UPIPayment.findOne({ orderId: req.params.id });
    if (!payment || payment.status === "Rejected") return res.json({ success: false, error: "Already processed" });
    payment.status = "Rejected"; payment.approvedBy = "MiniApp Admin";
    await payment.save();
    try { await bot.api.sendMessage(payment.userId, `❌ ${toSmallCaps("Deposit Rejected")}\n\n💰 ₹${payment.amount}\n🔐 ${payment.utr}`, { parse_mode: "HTML" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-deposits", async (req, res) => {
  try { res.json({ success: true, deposits: await DepositRequest.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-deposit/:id", async (req, res) => {
  try {
    let req2 = await DepositRequest.findOne({ requestId: req.params.id });
    if (!req2 || req2.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    req2.status = "Approved"; req2.approvedBy = "MiniApp Admin"; req2.approvedAt = new Date();
    await req2.save();
    let user = await getUser(req2.userId);
    user.balance += req2.amount; await user.save();
    await DepositGateway.updateOne({ gatewayId: req2.gatewayId }, { $inc: { manualApproved: 1, pending: -1, totalDeposited: req2.amount } });
    await logBalanceHistory(req2.userId, `Manual Deposit (${req2.gatewayName})`, req2.amount);
    try { await bot.api.sendMessage(req2.userId, `✅ <b>${toSmallCaps("Deposit Approved!")}</b>\n\n💰 ₹${req2.amount.toFixed(2)}\n💵 ${toSmallCaps("New Balance")}: ₹${user.balance.toFixed(2)}`, { parse_mode: "HTML" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-deposit/:id", async (req, res) => {
  try {
    let req2 = await DepositRequest.findOne({ requestId: req.params.id });
    if (!req2 || req2.status !== "Pending") return res.json({ success: false, error: "Already processed" });
    req2.status = "Rejected"; req2.approvedBy = "MiniApp Admin"; req2.approvedAt = new Date();
    await req2.save();
    await DepositGateway.updateOne({ gatewayId: req2.gatewayId }, { $inc: { rejected: 1, pending: -1 } });
    try { await bot.api.sendMessage(req2.userId, `❌ <b>${toSmallCaps("Deposit Rejected")}</b>\n\n💰 ₹${req2.amount.toFixed(2)}`, { parse_mode: "HTML" }); } catch (e) { }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try { res.json({ success: true, users: await User.find({}).sort({ balance: -1 }).limit(100).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-detail/:userId", async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    const user = await User.findOne({ userId: uid }).lean();
    if (!user) return res.json({ success: false, error: "User not found" });
    const [wc, ac, rc, pc, dc, bh] = await Promise.all([
      Withdrawal.countDocuments({ userId: uid }),
      Withdrawal.countDocuments({ userId: uid, status: "Approved" }),
      Withdrawal.countDocuments({ userId: uid, status: "Rejected" }),
      Withdrawal.countDocuments({ userId: uid, status: "Pending" }),
      UPIPayment.countDocuments({ userId: uid }),
      BalanceHistory.countDocuments({ userId: uid })
    ]);
    res.json({ success: true, user, counts: { withdraw: wc, approved: ac, rejected: rc, pending: pc, deposit: dc, balanceHistory: bh } });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-withdrawals/:userId", async (req, res) => {
  try { res.json({ success: true, withdrawals: await Withdrawal.find({ userId: parseInt(req.params.userId, 10) }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-deposits/:userId", async (req, res) => {
  try { res.json({ success: true, deposits: await UPIPayment.find({ userId: parseInt(req.params.userId, 10) }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/user-balance-history/:userId", async (req, res) => {
  try { res.json({ success: true, history: await BalanceHistory.find({ userId: parseInt(req.params.userId, 10) }).sort({ createdAt: -1 }).limit(50).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/remove-balance", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Invalid amount" });
    const user = await User.findOne({ userId: uid });
    if (!user) return res.json({ success: false, error: "User not found" });
    user.balance -= amt;
    await user.save();
    await logBalanceHistory(uid, "Admin Removed Balance", -amt);
    try { await bot.api.sendMessage(uid, `💰 ${toSmallCaps("Admin Gave You A Decrease In Balance By")} ${amt}`, { parse_mode: "HTML" }); } catch (e) { }
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
    if (!user) user = await User.create({ userId: uid, firstName: "Unknown", balance: amt });
    else { user.balance += amt; await user.save(); }
    await logBalanceHistory(uid, "Admin Added Balance", amt);
    try { await bot.api.sendMessage(uid, `💰 ${toSmallCaps("Admin Gave You A Increase In Balance By")} ${amt}`, { parse_mode: "HTML" }); } catch (e) { }
    res.json({ success: true, newBalance: user.balance });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/send-message", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const uid = parseInt(userId, 10);
    if (!message || message.trim() === "") return res.json({ success: false, error: "Empty message" });
    try { await bot.api.sendMessage(uid, `📨 Message from Admin:\n\n${message}`); res.json({ success: true }); }
    catch (e) { res.json({ success: false, error: "Failed to send" }); }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/gateways", async (req, res) => {
  try { res.json({ success: true, gateways: await Gateway.find({}).sort({ createdAt: -1 }).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/create", async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.json({ success: false, error: "Missing fields" });
    let existing = await Gateway.findOne({ name: name.toUpperCase() });
    if (existing) return res.json({ success: false, error: "Gateway exists" });
    await Gateway.create({ name: name.toUpperCase(), url: url.trim(), url_template: url.trim(), isActive: true, minAmount: 0, maxAmount: 0, taxPercent: 0 });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/toggle/:name", async (req, res) => {
  try {
    const gw = await Gateway.findOne({ name: req.params.name });
    if (!gw) return res.json({ success: false, error: "Not found" });
    gw.isActive = !gw.isActive; gw.updatedAt = new Date(); await gw.save();
    res.json({ success: true, isActive: gw.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/gateway/delete/:name", async (req, res) => {
  try { await Gateway.deleteOne({ name: req.params.name }); res.json({ success: true }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/deposit-gateways", async (req, res) => {
  try { res.json({ success: true, gateways: await DepositGateway.find({}).sort({ order: 1, createdAt: 1 }).lean() }); }
  catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/settings", async (req, res) => {
  try {
    const settings = {
      min_withdraw: await getConfig("min_withdraw", 0),
      max_withdraw: await getConfig("max_withdraw", 0),
      tax_percent: await getConfig("tax_percent", 0),
      payout_channel: await getConfig("payout_channel", "Not Set"),
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
      quick_pay_tax_enabled: await getConfig("quick_pay_tax_enabled", false),
      quick_pay_tax_percent: await getConfig("quick_pay_tax_percent", 0),
      unknown_command_active: await getConfig("unknown_command_active", true),
      unknown_command_text: await getConfig("unknown_command_text", "❓ I didn't understand that.\n\nPlease /start the bot again.")
    };
    res.json({ success: true, settings });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/settings/update", async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ["min_withdraw", "max_withdraw", "tax_percent", "payout_channel", "support_username", "bot_active", "withdraw_enabled", "balance_footer_text", "balance_welcome_text", "start_title_text", "start_link_prefix", "start_link_clickable", "welcome_channel_link", "auto_upi_id", "auto_upi_min", "auto_upi_max", "quick_pay_tax_enabled", "quick_pay_tax_percent", "unknown_command_active", "unknown_command_text"];
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
      try { await bot.api.sendMessage(u.userId, message); sent++; await new Promise(r => setTimeout(r, 50)); }
      catch (e) { failed++; }
    }
    res.json({ success: true, sent, failed, total: users.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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

app.get("/miniapp/api/admin/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({ success: true, logs: await AdminLog.find({}).sort({ createdAt: -1 }).limit(limit).lean() });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

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
      results.push({ withdrawalId: w.withdrawalId, userId: w.userId, userName: user?.firstName || "User", username: user?.username || "", amount: w.amount, method: w.method, status: w.status, txnNumber: w.txnNumber, createdAt: w.createdAt, approvedAt: w.approvedAt, receiptUrl: `/receipt/${w.withdrawalId}` });
    }
    res.json({ success: true, statements: results, total: results.length });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/live-fund", async (req, res) => {
  try {
    let fund = await LiveFund.findOne({ key: "main_fund" }).lean();
    if (!fund) fund = await LiveFund.create({ key: "main_fund" });
    res.json({ success: true, fund });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/live-fund/set", async (req, res) => {
  try {
    const amt = parseFloat(req.body.amount);
    if (isNaN(amt) || amt < 0) return res.json({ success: false, error: "Invalid amount" });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { totalFund: amt, usedFund: 0, updatedAt: new Date() }, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/live-fund/toggle", async (req, res) => {
  try {
    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) fund = await LiveFund.create({ key: "main_fund" });
    fund.isActive = !fund.isActive; fund.updatedAt = new Date(); await fund.save();
    res.json({ success: true, isActive: fund.isActive });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/withdraw-settings", async (req, res) => {
  try {
    let settings = await WithdrawSettings.find({}).lean();
    if (settings.length === 0) {
      const methods = [
        { method: "upi", minAmount: 0, maxAmount: 0, isActive: true },
        { method: "bank", minAmount: 0, maxAmount: 0, isActive: true },
        { method: "amazon", minAmount: 0, maxAmount: 0, isActive: false },
        { method: "redeem", minAmount: 0, maxAmount: 0, isActive: false }
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

app.get("/miniapp/api/admin/live-balance", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 0;
    const perPage = 10;
    const users = await User.find({}).sort({ balance: -1, createdAt: -1 }).skip(page * perPage).limit(perPage).lean();
    const total = await User.countDocuments({});
    const totalBalance = await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
    res.json({ success: true, users, total, totalBalance: totalBalance[0]?.total || 0, page, totalPages: Math.ceil(total / perPage) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/withdraw-requests", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50).lean();
    let results = [];
    for (let w of withdrawals) {
      const user = await User.findOne({ userId: w.userId }).lean();
      results.push({ withdrawalId: w.withdrawalId, userId: w.userId, userName: user?.firstName || "User", amount: w.amount, method: w.method, details: w.details, userWithdrawalCount: w.userWithdrawalCount, createdAt: w.createdAt });
    }
    res.json({ success: true, requests: results });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/withdraw-stats", async (req, res) => {
  try {
    const total = await Withdrawal.countDocuments({});
    const approved = await Withdrawal.countDocuments({ status: "Approved" });
    const pending = await Withdrawal.countDocuments({ status: "Pending" });
    const rejected = await Withdrawal.countDocuments({ status: "Rejected" });
    const totalPayoutArr = await Withdrawal.aggregate([{ $match: { status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
    res.json({ success: true, total, approved, pending, rejected, totalPayout: totalPayoutArr[0]?.total || 0 });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============ BOT START ============
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
      let notifMsg = `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n💰 ₹${user.balance.toFixed(2)}\n📅 ${formatDateTime(new Date())}`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      let newUserNotif = await getConfig("new_user_notif", true);
      if (newUserNotif) {
        try { await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb }); } catch (e) { }
      }
    }
    if (user.isBanned) return ctx.reply(`${toSmallCaps("You are banned from using this bot.")}`, { parse_mode: "HTML" });
    let botStatus = await getConfig("bot_status", "active");
    if (botStatus === "maintenance" || botStatus === "disabled") {
      let isAdminUser = await isAdmin(userId);
      if (!isAdminUser) {
        let botOffText;
        if (botStatus === "maintenance") botOffText = await getConfig("bot_maintenance_text", `⚠️ ${toSmallCaps("Bot is under maintenance. Please try again later.")}`);
        else botOffText = await getConfig("bot_off_text", `❌ ${toSmallCaps("Bot is currently disabled.")}`);
        return ctx.reply(botOffText, { parse_mode: "HTML" });
      }
    }
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) return sendForceJoinMessage(ctx);
    let titleText = await getConfig("start_title_text", DEFAULT_START_TEXT.title);
    let linkPrefix = await getConfig("start_link_prefix", DEFAULT_START_TEXT.linkPrefix);
    let linkClickable = await getConfig("start_link_clickable", DEFAULT_START_TEXT.linkClickable);
    let welcomeLink = await getConfig("welcome_channel_link", "https://t.me/yourchannel");
    let finalLink = convertOwnerLink(welcomeLink);
    let welcomeText = `${titleText}\n\n${linkPrefix}<a href="${finalLink}">${linkClickable}</a>`;
    let socialLinks = await SocialLink.find({}).lean();
    if (socialLinks.length > 0) {
      welcomeText += `\n\n`;
      for (let s of socialLinks) welcomeText += `<a href="${s.link}">${s.name}</a>  `;
    }
    try {
      await ctx.reply(welcomeText, { reply_markup: await buildKeyboardFromLayout(userId), parse_mode: "HTML" });
    } catch (htmlErr) {
      await ctx.reply(`${titleText}\n\n${linkPrefix}${linkClickable}\n${finalLink}`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }
  } catch (err) {
    try { await ctx.reply(`❌ Error: ${err.message}`); } catch (e) { }
  }
});

async function sendForceJoinMessage(ctx) {
  let channels = await Channel.find({ isActive: true, isHidden: { $ne: true } }).sort({ order: 1, addedAt: 1 }).lean();
  if (!channels || channels.length === 0) return null;
  let userId = ctx.from.id;
  let showMode = await getConfig("show_mode", "all");
  let displayChannels = [];
  let notJoinedCount = 0;
  for (let ch of channels) {
    let isJoined = false;
    try {
      let member = await ctx.api.getChatMember(ch.channelId, userId);
      if (["member", "administrator", "creator"].includes(member.status)) isJoined = true;
    } catch (e) { }
    if (!isJoined) notJoinedCount++;
    if (showMode === "all" || !isJoined) displayChannels.push({ ...ch, isJoined });
  }
  if (displayChannels.length === 0) return null;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let title = `⚠️ ${toSmallCaps("You Must Join Our Channels!")}`;
  let bodyText = `👇 ${toSmallCaps("Join all channels below")}:`;
  let text = `${title}\n\n<blockquote>${bodyText}</blockquote>`;
  if (notJoinedCount > 0) text += `\n\n${toSmallCaps(`You have not joined in ${notJoinedCount} channels`)}`;
  let kb = new InlineKeyboard();
  for (let ch of displayChannels) kb.url(`📢 ${ch.displayName || ch.channelId}`, ch.inviteLink).row();
  kb.text(makeBtn("Claim"), "check_join");
  return ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery("check_join", async (ctx) => {
  let userId = ctx.from.id;
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) {
    await ctx.answerCallbackQuery({ text: "You must join all channels first!", show_alert: true }).catch(() => { });
    await ctx.deleteMessage().catch(() => { });
    await sendForceJoinMessage(ctx);
    return;
  }
  await ctx.answerCallbackQuery({ text: "Verified!" }).catch(() => { });
  await ctx.deleteMessage().catch(() => { });
  await ctx.reply(`✅ ${toSmallCaps("Verified!")}\n\n${toSmallCaps("Welcome to the bot!")}`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
});

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
  await ctx.reply(summary, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("Back", type === "amazon" ? "adm_amazon" : "adm_create_gift") });
}

// ============ WITHDRAW MENU (FIXED: Auto UPI integrated) ============
async function buildWithdrawMenu() {
  let buttons = [];
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let gateways = await Gateway.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  for (let gw of gateways) buttons.push([{ text: makeBtn(gw.name.toUpperCase()), callback_data: `wd_gw_${gw.name}` }]);

  let methods = ["upi", "bank", "amazon", "redeem"];
  for (let m of methods) {
    let s = await WithdrawSettings.findOne({ method: m }).lean();
    if (s && s.isActive) buttons.push([{ text: makeBtn(m.toUpperCase()), callback_data: `wd_${m}` }]);
  }
  return buttons;
}

async function sendBalancePage(ctx, edit = false) {
  let userId = ctx.from.id;
  let user = await getUser(userId);
  let welcomeText = await getConfig("balance_welcome_text", DEFAULT_BALANCE_TEXT.welcome);
  let footerText = await getConfig("balance_footer_text", DEFAULT_BALANCE_TEXT.footer);
  let balanceDisplay = formatBalance(user.balance);
  let msg = `${welcomeText}\n\n🔵 ${toSmallCaps("Wallet ID")} ➝ <code>${userId}</code>\n🧾 ${toSmallCaps("Balance")} ➝ <code>${balanceDisplay}</code>\n\n<blockquote>${footerText}</blockquote>`;
  let buttons = [];
  buttons.push([{ text: `💰 ${toSmallCaps("Deposit")}`, callback_data: "user_deposit" }]);
  buttons.push([
    { text: `📊 ${toSmallCaps("Balance Statement")}`, callback_data: "balance_statement" },
    { text: `💰 ${toSmallCaps("Live Fund")}`, callback_data: "live_fund" }
  ]);
  buttons.push([{ text: `🔄 ${toSmallCaps("Refresh")}`, callback_data: "refresh_balance_only" }]);
  let kb = await buildStyledKb(buttons);
  try {
    if (edit && ctx.callbackQuery) await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" });
    else await ctx.reply(msg, { reply_markup: kb, parse_mode: "HTML" });
  } catch (htmlErr) {
    let plainMsg = `${welcomeText}\n\n🔵 Wallet ID ➝ ${userId}\n🧾 Balance ➝ ${balanceDisplay}\n\n${footerText}`;
    if (edit && ctx.callbackQuery) await ctx.editMessageText(plainMsg, { reply_markup: kb }).catch(() => { });
    else await ctx.reply(plainMsg, { reply_markup: kb });
  }
}

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
  if (edit && ctx.callbackQuery) await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(msg, { reply_markup: kb, parse_mode: "HTML" });
}

// ============ MAIN TEXT HANDLER ============
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  if (state && await isAdmin(userId)) {
    try {
      const handled = await handleAdminTextInput(ctx, text, userId, state);
      if (handled) return;
    } catch (err) {
      console.error("Admin handler error:", err.message);
    }
  }

  if (state) {
    if (text === `${toSmallCaps("Cancel")}` || text === "❌ Cancel" || text.toLowerCase() === "cancel") {
      delete userState[userId];
      if (global.quickPayCache) delete global.quickPayCache[userId];
      await ctx.reply(`${toSmallCaps("Cancelled")}`, { reply_markup: await buildKeyboardFromLayout(userId), parse_mode: "HTML" });
      return;
    }

    if (state === "SET_WALLET_NUMBER") {
      delete userState[userId];
      let number = text.trim();
      if (!number || number.length < 5 || !/^[0-9+\-\s]+$/.test(number)) return ctx.reply(`❌ ${toSmallCaps("Invalid number! Send digits only.")}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
      let user = await getUser(userId);
      user.walletNumber = number;
      await user.save();
      await ctx.reply(`${toSmallCaps("Your Wallet Added Successfully")}\n\n${toSmallCaps("Wallet ID")}: <code>${number}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
      return;
    }

    if (state === "SET_UPI_ACC") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply(`❌ ${toSmallCaps("Invalid UPI! Include @")}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
      await User.findOneAndUpdate({ userId }, { upiId: upi });
      await ctx.reply(`${toSmallCaps("Your UPI Added Successfully")}\n\n${toSmallCaps("UPI")}: <code>${upi}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
      return;
    }

    if (state === "SET_BANK_ACCNO") {
      if (!text.trim()) return ctx.reply("❌ Invalid!");
      userState[userId] = `SET_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`🏦 ${toSmallCaps("Send Your IFSC Code")}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
    }

    if (state.startsWith("SET_BANK_IFSC_")) {
      let accNo = state.replace("SET_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      await User.findOneAndUpdate({ userId }, { bankAccNo: accNo, bankIfsc: ifsc });
      await ctx.reply(`${toSmallCaps("Your Bank Added Successfully")}\n\n${toSmallCaps("Bank")}: <code>${accNo} (${ifsc})</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") });
      return;
    }

    if (state.startsWith("GW_NUMBER_")) {
      let gwName = state.replace("GW_NUMBER_", "");
      let number = text.trim();
      if (!number || number.length < 5) return ctx.reply(`❌ ${toSmallCaps("Invalid number! Try again.")}`);
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) { delete userState[userId]; return ctx.reply(`❌ ${toSmallCaps("Gateway not found.")}`); }
      let user = await getUser(userId);
      user.walletNumber = number;
      await user.save();
      userState[userId] = `GW_AMOUNT_${gwName}`;
      let kb = new Keyboard().text("Cancel").resized().oneTime();
      return ctx.reply(`${toSmallCaps("Enter Withdraw Amount")}`, { parse_mode: "HTML", reply_markup: kb });
    }

    if (state.startsWith("GW_AMOUNT_")) {
      let gwName = state.replace("GW_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let user = await getUser(userId);
      let gateway = await Gateway.findOne({ name: gwName, isActive: true });
      if (!gateway) return ctx.reply(`❌ ${toSmallCaps("Gateway not found.")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let minW = gateway.minAmount || 0;
      let maxW = gateway.maxAmount || 0;
      if (minW > 0 && amount < minW) return ctx.reply(`❌ ${toSmallCaps("Minimum")}: ₹${minW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (maxW > 0 && amount > maxW) return ctx.reply(`❌ ${toSmallCaps("Maximum")}: ₹${maxW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (user.balance < amount) return ctx.reply(`❌ ${toSmallCaps("Insufficient balance!")} ${toSmallCaps("Your Balance")}: ₹${user.balance.toFixed(2)}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let wallet = user.walletNumber || "";
      if (!wallet) return ctx.reply(`❌ ${toSmallCaps("Number not saved!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let taxPercent = gateway.taxPercent || 0;
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) { taxAmount = (amount * taxPercent) / 100; receiveAmount = amount - taxAmount; }
      let bodyText = `${toSmallCaps("Amount")}: <code>${amount}</code> INR\n` +
        `${toSmallCaps("You receive")}: <code>${receiveAmount.toFixed(2)}</code> INR (Tax: <code>₹${taxAmount.toFixed(2)}</code>)\n\n` +
        `🔗 ${gwName} ${toSmallCaps("Wallet")}: <code>${wallet}</code>`;
      let confirmMsg = `<b>${toSmallCaps("Withdrawal Confirmation")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Confirm your transaction by clicking Confirm")}`;
      userState[userId] = `GW_CONFIRM_${gwName}_${amount}`;
      return ctx.reply(confirmMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(makeBtn("Confirm ✅"), `gw_conf_yes_${gwName}_${amount}`).row()
          .text(makeBtn("Cancel ❌"), `gw_conf_no`)
      });
    }

    if (state.startsWith("MANUAL_AMOUNT_")) {
      let method = state.replace("MANUAL_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let user = await getUser(userId);
      let details = "";
      if (method === "upi") details = user.upiId;
      else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
      else if (method === "amazon") details = user.amazonEmail;
      else if (method === "redeem") details = user.redeemCodeAddr;
      if (!details || details === "Not Set" || details.includes("Not Set")) return ctx.reply(`❌ ${method.toUpperCase()} ${toSmallCaps("not linked! Please add it first.")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let ws = await WithdrawSettings.findOne({ method }).lean();
      let minW = ws ? ws.minAmount : 0;
      let maxW = ws ? ws.maxAmount : 0;
      if (minW > 0 && amount < minW) return ctx.reply(`❌ ${toSmallCaps("Minimum")}: ₹${minW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (maxW > 0 && amount > maxW) return ctx.reply(`❌ ${toSmallCaps("Maximum")}: ₹${maxW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (user.balance < amount) return ctx.reply(`❌ ${toSmallCaps("Insufficient balance!")} ${toSmallCaps("Your Balance")}: ₹${user.balance.toFixed(2)}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let taxPercent = ws ? ws.taxPercent : 0;
      let taxAmount = 0;
      let receiveAmount = amount;
      if (taxPercent > 0) { taxAmount = (amount * taxPercent) / 100; receiveAmount = amount - taxAmount; }
      let methodIcon = method === "upi" ? "⚡" : (method === "bank" ? "🏦" : (method === "amazon" ? "📧" : "🎁"));
      let methodLabel = method.toUpperCase();
      let bodyText = `${toSmallCaps("Amount")}: <code>${amount}</code> INR\n` +
        `${toSmallCaps("You receive")}: <code>${receiveAmount.toFixed(2)}</code> INR (Tax: <code>₹${taxAmount.toFixed(2)}</code>)\n\n` +
        `${methodIcon} ${methodLabel} ID: <code>${details}</code>`;
      let confirmMsg = `<b>${toSmallCaps("Withdrawal Confirmation")}</b>\n\n<blockquote>${bodyText}</blockquote>\n\n${toSmallCaps("Confirm your transaction by clicking Confirm")}`;
      userState[userId] = `MANUAL_CONFIRM_${method}_${amount}`;
      return ctx.reply(confirmMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(makeBtn("Confirm ✅"), `man_conf_yes_${method}_${amount}`).row()
          .text(makeBtn("Cancel ❌"), `man_conf_no`)
      });
    }

    if (state === "WD_ADD_UPI") {
      delete userState[userId];
      let upi = text.trim();
      if (!upi.includes("@")) return ctx.reply(`❌ ${toSmallCaps("Invalid UPI format!")}`);
      let user = await getUser(userId);
      user.upiId = upi;
      await user.save();
      return ctx.reply(`${toSmallCaps("UPI Saved!")}\n\n📌 <code>${upi}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") });
    }

    if (state === "WD_ADD_BANK_ACCNO") {
      userState[userId] = `WD_ADD_BANK_IFSC_${text.trim()}`;
      return ctx.reply(`✅ ${toSmallCaps("Account")}: <code>${text.trim()}</code>\n\n📝 ${toSmallCaps("Send IFSC Code")}:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "back_to_withdraw") });
    }

    if (state.startsWith("WD_ADD_BANK_IFSC_")) {
      let accNo = state.replace("WD_ADD_BANK_IFSC_", "");
      delete userState[userId];
      let ifsc = text.trim().toUpperCase();
      let user = await getUser(userId);
      user.bankAccNo = accNo;
      user.bankIfsc = ifsc;
      await user.save();
      return ctx.reply(`${toSmallCaps("Bank Saved!")}\n\n🏦 <code>${accNo}</code>\n🔢 <code>${ifsc}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") });
    }

    if (state === "WD_ADD_AMAZON") {
      delete userState[userId];
      let email = text.trim();
      if (!email.includes("@")) return ctx.reply(`❌ ${toSmallCaps("Invalid email!")}`);
      let user = await getUser(userId);
      user.amazonEmail = email;
      await user.save();
      return ctx.reply(`${toSmallCaps("Amazon Saved!")}\n\n📧 <code>${email}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") });
    }

    if (state === "WD_ADD_REDEEM") {
      delete userState[userId];
      let addr = text.trim();
      let user = await getUser(userId);
      user.redeemCodeAddr = addr;
      await user.save();
      return ctx.reply(`${toSmallCaps("Redeem Saved!")}\n\n🎁 <code>${addr}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_withdraw") });
    }

    if (state === "QP_WAIT_INPUT") {
      delete userState[userId];
      let lines = text.trim().split("\n").map(l => l.trim()).filter(l => l !== "");
      if (lines.length === 0) return ctx.reply(`${toSmallCaps("No data provided!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (lines.length > 20) return ctx.reply(`${toSmallCaps("Maximum 20 payments at once!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let parsed = [];
      let errors = [];
      for (let line of lines) {
        let parts = line.split(/\s+/).filter(p => p !== "");
        if (parts.length < 2) { errors.push(`${line} (invalid format)`); continue; }
        let userInput = parts[0].trim();
        let amt = parseFloat(parts[parts.length - 1]);
        if (isNaN(amt) || amt <= 0) { errors.push(`${line} (invalid amount)`); continue; }
        let receiver = null;
        if (/^\d+$/.test(userInput)) receiver = await User.findOne({ userId: parseInt(userInput, 10) }).lean();
        else if (userInput.startsWith("@")) {
          let cleanUsername = userInput.replace(/^@/, '').toLowerCase();
          receiver = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }).lean();
        } else if (/^[a-zA-Z0-9_]{5,32}$/.test(userInput)) {
          let cleanUsername = userInput.toLowerCase();
          receiver = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }).lean();
        }
        if (!receiver) { errors.push(`${userInput} (user not found)`); continue; }
        if (receiver.userId === userId) { errors.push(`${userInput} (cannot pay yourself)`); continue; }
        parsed.push({ receiver, amount: amt });
      }
      if (errors.length > 0) return ctx.reply(`<b>${toSmallCaps("Errors")}</b>\n\n<blockquote>${errors.join("\n")}</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Try Again"), "qp_retry") });
      if (parsed.length === 0) return ctx.reply(`${toSmallCaps("No valid payments!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let totalAmount = parsed.reduce((sum, p) => sum + p.amount, 0);
      let sender = await getUser(userId);
      let isPrivileged = (await isAdmin(userId)) || (await isOwner(userId));
      if (!isPrivileged && sender.balance < totalAmount) return ctx.reply(`<b>${toSmallCaps("Insufficient Balance!")}</b>\n\n<blockquote>${toSmallCaps("Your")}: ₹${sender.balance.toFixed(2)}\n${toSmallCaps("Required")}: ₹${totalAmount.toFixed(2)}</blockquote>`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { payments: parsed };
      let bodyText = "";
      parsed.forEach((p, i) => {
        bodyText += `${i + 1}. ${p.receiver.firstName || "User"}\n`;
        bodyText += `${toSmallCaps("User ID")}: ${p.receiver.userId}\n`;
        bodyText += `${toSmallCaps("Username")}: ${p.receiver.username ? "@" + p.receiver.username : "None"}\n`;
        bodyText += `${toSmallCaps("Amount")}: ₹${p.amount}\n\n`;
      });
      bodyText += `${toSmallCaps("Total Users")}: ${parsed.length}\n${toSmallCaps("Total Amount")}: ₹${totalAmount.toFixed(2)}\n`;
      if (isPrivileged) bodyText += `${toSmallCaps("Mode")}: 👑 Admin/Owner (Unlimited)\n`;
      else bodyText += `${toSmallCaps("Your Balance")}: ₹${sender.balance.toFixed(2)}\n${toSmallCaps("After")}: ₹${(sender.balance - totalAmount).toFixed(2)}`;
      userState[userId] = `QP_CONFIRM_MULTI`;
      return ctx.reply(`<b>${toSmallCaps("Confirm Payment")}</b>\n\n<blockquote>${bodyText}</blockquote>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(makeBtn("Confirm ✅"), "qp_confirm_multi").row().text(makeBtn("Cancel ❌"), "qp_cancel")
      });
    }

    if (state.startsWith("QP_AMOUNT_")) {
      let targetId = parseInt(state.replace("QP_AMOUNT_", ""), 10);
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let target = await User.findOne({ userId: targetId }).lean();
      if (!target) return ctx.reply(`❌ ${toSmallCaps("User not found")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let sender = await getUser(userId);
      let isPrivileged = (await isAdmin(userId)) || (await isOwner(userId));
      if (!isPrivileged && sender.balance < amount) return ctx.reply(`❌ ${toSmallCaps("Insufficient!")} ₹${sender.balance.toFixed(2)}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      global.quickPayCache = global.quickPayCache || {};
      global.quickPayCache[userId] = { payments: [{ receiver: target, amount }] };
      let bodyText = `${toSmallCaps("To")}: ${target.firstName || "User"}\n${toSmallCaps("User ID")}: ${target.userId}\n${toSmallCaps("Username")}: ${target.username ? "@" + target.username : "None"}\n${toSmallCaps("Amount")}: ₹${amount}\n\n${toSmallCaps("Your Balance")}: ₹${sender.balance.toFixed(2)}\n${toSmallCaps("After")}: ₹${(sender.balance - amount).toFixed(2)}`;
      userState[userId] = "QP_CONFIRM_MULTI";
      return ctx.reply(`<b>${toSmallCaps("Confirm Payment")}</b>\n\n<blockquote>${bodyText}</blockquote>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(makeBtn("Confirm ✅"), "qp_confirm_multi").row().text(makeBtn("Cancel ❌"), "qp_cancel")
      });
    }

    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let gift = await GiftCode.findOneAndUpdate(
        { code: text, type: "redeem", usedUsers: { $ne: userId }, $expr: { $lt: [{ $size: "$usedUsers" }, "$maxUses"] } },
        { $push: { usedUsers: userId } }, { new: true }
      );
      if (!gift) return ctx.reply(`🚫 ${toSmallCaps("Invalid or expired!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let user = await getUser(userId);
      user.balance += gift.amount;
      await user.save();
      await logBalanceHistory(userId, `Gift Redeemed (${gift.code})`, gift.amount);
      return ctx.reply(`🎉 ${toSmallCaps("Gift redeemed!")} ${toSmallCaps("Added")} ₹${gift.amount}.`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }

    if (state.startsWith("TASK_REFER_")) {
      let taskId = state.replace("TASK_REFER_", "");
      delete userState[userId];
      let task = await Task.findOne({ taskId });
      if (!task) return ctx.reply(`❌ ${toSmallCaps("Task not found")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (task.completedUsers.includes(userId)) return ctx.reply(`❌ ${toSmallCaps("Already completed!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (task.expiresAt && new Date(task.expiresAt) <= new Date()) return ctx.reply(`❌ ${toSmallCaps("Task expired!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let referValue = text.trim();
      let isValid = false;
      if (referValue.startsWith("http") || referValue.startsWith("t.me/") || /^\d{10}$/.test(referValue) || referValue.startsWith("@")) isValid = true;
      if (!isValid) return ctx.reply(`❌ ${toSmallCaps("Invalid format!")}\n\n${toSmallCaps("Send")}:\n• Link\n• 10-digit number\n• @username`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "canc_task") });
      let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
      let user = await getUser(userId);
      await TaskSubmission.create({ submissionId, userId, userName: user.firstName || "User", taskId: task.taskId, taskTitle: task.title, reward: task.reward, photoFileId: `REFER: ${referValue}`, status: "Pending" });
      let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
      if (alertChannel && alertChannel !== "Not Set") {
        let forwardedMsgId = null;
        try { let fwd = await ctx.api.forwardMessage(alertChannel, ctx.chat.id, ctx.message.message_id); forwardedMsgId = fwd.message_id; } catch (e) { }
        let userLink = `<a href="tg://user?id=${userId}">${user.firstName || "User"} (${userId})</a>`;
        let caption = `<b>NEW TASK SUBMISSION</b>\n\nUser: ${userLink}\nTask: ${task.title}\nReward: ₹${task.reward}\nLink: ${task.link}\nType: Refer`;
        let kb = new InlineKeyboard().text("Approve ✅", `task_app_${submissionId}`).text("Reject ❌", `task_rej_${submissionId}`);
        let sendOpts = { parse_mode: "HTML", reply_markup: kb };
        if (forwardedMsgId) sendOpts.reply_parameters = { message_id: forwardedMsgId };
        try { await ctx.api.sendMessage(alertChannel, caption, sendOpts); } catch (e) { }
      }
      return ctx.reply(`${toSmallCaps("Task Submitted!")}\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}\n\n${toSmallCaps("Wait for admin approval.")}`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
    }

    if (state && state.startsWith("USER_DEP_AMOUNT_")) {
      let gwId = state.replace("USER_DEP_AMOUNT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ ${toSmallCaps("Invalid amount!")}\n\n📝 ${toSmallCaps("Please send a valid number")}:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Back"), `user_dep_gw_${gwId}`) });
      let gw = await DepositGateway.findOne({ gatewayId: gwId, status: "active" });
      if (!gw) return ctx.reply(`❌ ${toSmallCaps("Gateway not available!")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (gw.minAmount > 0 && amount < gw.minAmount) return ctx.reply(`❌ <b>${toSmallCaps("Minimum Deposit")}:</b> ₹${gw.minAmount}\n\n📝 ${toSmallCaps("Send amount again")}:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Back"), `user_dep_gw_${gwId}`) });
      if (gw.maxAmount > 0 && amount > gw.maxAmount) return ctx.reply(`❌ <b>${toSmallCaps("Maximum Deposit")}:</b> ₹${gw.maxAmount}\n\n📝 ${toSmallCaps("Send amount again")}:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Back"), `user_dep_gw_${gwId}`) });
      if (gw.cooldown > 0) {
        let lastDeposit = await DepositRequest.findOne({ userId, gatewayId: gwId, status: { $in: ["Approved", "Pending"] } }).sort({ createdAt: -1 }).lean();
        if (lastDeposit) {
          let diff = (Date.now() - new Date(lastDeposit.createdAt).getTime()) / 1000;
          if (diff < gw.cooldown) {
            let wait = Math.ceil(gw.cooldown - diff);
            return ctx.reply(`⏱️ <b>${toSmallCaps("Cooldown Active!")}</b>\n\n⏳ ${toSmallCaps("Please wait")}: <code>${wait}s</code>`, { parse_mode: "HTML" });
          }
        }
      }
      if (gw.depositMode === "auto" || gw.depositMode === "both") {
        userState[userId] = `USER_DEP_API_${gw.gatewayId}_${amount}`;
        return ctx.reply(`⚡️ <b>${toSmallCaps("Auto Deposit")}: ${gw.name}</b>\n\n🔗 <b>${toSmallCaps("Please Enter Your Deposit API URL")}:</b>\n\n💡 <i>E.g. https://payzy-gateway.site/client/api/send.php?api_key=xxx&secret_pin=yyy&toUser={wallet}&amount={amount}&remark={comment}</i>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("❌ Cancel"), "user_dep_cancel") });
      } else return processManualDeposit(ctx, userId, gw, amount);
    }

    if (state && state.startsWith("USER_DEP_API_")) {
      let parts = state.replace("USER_DEP_API_", "").split("_");
      let amount = parseFloat(parts.pop());
      let gwId = parts.join("_");
      delete userState[userId];
      let apiUrl = text.trim();
      if (!apiUrl.startsWith("http")) return ctx.reply(`❌ ${toSmallCaps("Invalid URL! Must start with http")}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Back"), `user_dep_gw_${gwId}`) });
      let gw = await DepositGateway.findOne({ gatewayId: gwId, status: "active" });
      if (!gw) return ctx.reply(`❌ ${toSmallCaps("Gateway not available")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let adminNumber = gw.upiOrNumber || "Not Set";
      if (adminNumber === "Not Set" || !adminNumber) return ctx.reply(`❌ <b>${toSmallCaps("Gateway Not Configured")}</b>\n\n📞 ${toSmallCaps("Admin hasn't set number yet.")}`, { parse_mode: "HTML" });
      let orderId = "ORD" + Date.now() + Math.floor(Math.random() * 1000);
      let finalUrl = apiUrl.replace(/{wallet}/g, adminNumber).replace(/{amount}/g, amount).replace(/{comment}/g, `Deposit-${userId}-${orderId}`).replace(/{userId}/g, userId).replace(/{order_id}/g, orderId).replace(/{timestamp}/g, Date.now());
      await DepositRequest.create({ requestId: orderId, userId, userName: ctx.from.first_name || "", gatewayId: gwId, gatewayName: gw.name, amount, tax: gw.tax || 0, status: "Pending", apiUrl: finalUrl, createdAt: new Date() });
      await processDeposit(ctx, userId, gw, amount, finalUrl, orderId);
      return;
    }

    if (state && state.startsWith("USER_DEP_UTR_")) {
      let orderId = state.replace("USER_DEP_UTR_", "");
      delete userState[userId];
      let utr = text.trim().replace(/\s/g, "");
      if (utr.length < 6) return ctx.reply(`❌ ${toSmallCaps("Invalid UTR!")}`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
      let req = await DepositRequest.findOne({ requestId: orderId });
      if (!req || req.status !== "Pending") return ctx.reply(`❌ ${toSmallCaps("Invalid or already processed")}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      req.utr = utr;
      await req.save();
      await ctx.reply(`✅ <b>${toSmallCaps("UTR Submitted!")}</b>\n\n🆔 <code>${orderId}</code>\n📝 <code>${utr}</code>\n\n⏳ ${toSmallCaps("Wait for admin approval.")}`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
      let gw = await DepositGateway.findOne({ gatewayId: req.gatewayId }).lean();
      if (gw) {
        let user = await getUser(userId);
        try {
          let channel = await getPayoutChannel(gw.name);
          if (channel && channel !== "Not Set") {
            await bot.api.sendMessage(channel,
              `📥 <b>${toSmallCaps("New Manual Deposit")}</b>\n\n` +
              `⏳ <b>Status:</b> PENDING\n` +
              `👤 <a href="tg://user?id=${userId}"><b>${user.firstName || "User"}</b></a>\n` +
              `🆔 <code><b>${userId}</b></code>\n` +
              `💳 ${gw.name}\n` +
              `💰 <b>₹${req.amount.toFixed(2)}</b>\n` +
              `🔐 UTR: <code><b>${utr}</b></code>\n` +
              `🕐 ${formatDateTime(new Date())}`,
              { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ Approve", `dep_app_${orderId}`).text("❌ Reject", `dep_rej_${orderId}`) }
            );
          }
        } catch (e) { }
      }
      return;
    }

    // ============ AUTO UPI DEPOSIT (USER) ============
    if (state === "AUPI_USER_AMOUNT") {
      let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
      if (!cfg || !cfg.isActive) {
        delete userState[userId];
        return ctx.reply(`❌ Auto UPI disabled.`, { reply_markup: await buildKeyboardFromLayout(userId) });
      }
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ Invalid amount!`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (cfg.minAmount > 0 && amount < cfg.minAmount) return ctx.reply(`❌ Minimum: ₹${cfg.minAmount}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (cfg.maxAmount > 0 && amount > cfg.maxAmount) return ctx.reply(`❌ Maximum: ₹${cfg.maxAmount}`, { reply_markup: await buildKeyboardFromLayout(userId) });

      let orderId = "AUPI" + Date.now() + Math.floor(Math.random() * 1000);
      let upiUri = `upi://pay?pa=${encodeURIComponent(cfg.upiId)}&pn=${encodeURIComponent(cfg.payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent("Deposit " + orderId)}`;
      let qrBuffer = null;
      try { qrBuffer = await QRCode.toBuffer(upiUri, { width: 512, margin: 1 }); } catch (e) { }

      await AutoUpiOrder.create({ orderId, userId, userName: ctx.from.first_name || "User", amount, upiId: cfg.upiId, status: "Pending", expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
      delete userState[userId];
      userState[userId] = `AUPI_USER_UTR_${orderId}`;

      let caption =
        `🇮🇳 <b>Pay ₹${amount.toFixed(2)} to:</b>\n\n` +
        `📌 UPI: <code>${cfg.upiId}</code>\n` +
        `👤 Name: ${cfg.payeeName}\n` +
        `🆔 Order: <code>${orderId}</code>\n\n` +
        `📱 <a href="${upiUri}">Tap here to pay</a>\n` +
        `or scan the QR code above.\n\n` +
        `⚠️ <b>After payment, send the UTR / Transaction ID here.</b>`;
      let kb = new InlineKeyboard().text(makeBtn("❌ Cancel"), "aupi_user_cancel");

      if (qrBuffer) {
        try { await ctx.replyWithPhoto(new InputFile(qrBuffer, "upi_qr.png"), { caption, parse_mode: "HTML", reply_markup: kb }); }
        catch (e) { await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb }); }
      } else {
        await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb });
      }
      return;
    }

    if (state && state.startsWith("AUPI_USER_UTR_")) {
      let orderId = state.replace("AUPI_USER_UTR_", "");
      let utr = text.trim().replace(/\s/g, "");
      if (utr.length < 6) return ctx.reply(`❌ Invalid UTR! Send again:`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let order = await AutoUpiOrder.findOne({ orderId });
      if (!order || order.status !== "Pending") {
        delete userState[userId];
        return ctx.reply(`❌ Invalid or expired order.`, { reply_markup: await buildKeyboardFromLayout(userId) });
      }
      if (order.expiresAt && new Date(order.expiresAt) <= new Date()) {
        delete userState[userId];
        return ctx.reply(`⏰ Order expired.`, { reply_markup: await buildKeyboardFromLayout(userId) });
      }
      order.utr = utr;
      let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();

      let autoVerified = false;
      if (cfg && cfg.mode === "auto" && cfg.apiUrl) {
        try {
          let finalUrl = cfg.apiUrl
            .replace(/{utr}/g, encodeURIComponent(utr))
            .replace(/{amount}/g, encodeURIComponent(order.amount))
            .replace(/{upi}/g, encodeURIComponent(cfg.upiId))
            .replace(/{apikey}/g, encodeURIComponent(cfg.apiKey || ""));
          let resp = await axios.get(finalUrl, { timeout: 15000 });
          let data = resp.data;
          if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { } }
          let ok = data && (
            data.status === "success" || data.status === "SUCCESS" ||
            data.success === true || data.code === 200 ||
            /success|completed|paid|verified/i.test(JSON.stringify(data))
          );
          order.apiResponse = JSON.stringify(data).substring(0, 500);
          if (ok) autoVerified = true;
        } catch (e) { order.apiResponse = "API Error: " + e.message; }
      }

      if (autoVerified) {
        let tax = cfg.taxPercent || 0;
        let taxAmt = tax > 0 ? (order.amount * tax) / 100 : 0;
        let addAmt = order.amount - taxAmt;
        order.status = "Approved"; order.approvedBy = "Auto UPI (Auto-Verified)"; order.approvedAt = new Date();
        await order.save();
        let user = await getUser(userId);
        user.balance += addAmt;
        await user.save();
        await logBalanceHistory(userId, `Auto UPI Deposit (${orderId})`, addAmt);
        delete userState[userId];
        return ctx.reply(
          `✅ <b>${toSmallCaps("Deposit Successful!")}</b>\n\n💰 Amount: ₹${order.amount.toFixed(2)}\n${taxAmt > 0 ? `📊 Tax: ₹${taxAmt.toFixed(2)} (${tax}%)\n` : ""}💵 Credited: ₹${addAmt.toFixed(2)}\n💳 New Balance: ₹${user.balance.toFixed(2)}\n🔐 UTR: <code>${utr}</code>`,
          { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) }
        );
      } else {
        await order.save();
        delete userState[userId];
        try {
          let channel = await getPayoutChannel("Auto UPI");
          if (channel && channel !== "Not Set") {
            let userLink = `<a href="tg://user?id=${userId}">${ctx.from.first_name || "User"} (${userId})</a>`;
            let kb = new InlineKeyboard().text("✅ Approve", `aupi_app_${orderId}`).text("❌ Reject", `aupi_rej_${orderId}`);
            await bot.api.sendMessage(channel,
              `📥 <b>New Auto UPI Deposit</b>\n\n` +
              `👤 User: ${userLink}\n` +
              `💰 Amount: ₹${order.amount.toFixed(2)}\n` +
              `📌 UPI: <code>${cfg?.upiId}</code>\n` +
              `🔐 UTR: <code>${utr}</code>\n` +
              `🆔 Order: <code>${orderId}</code>\n` +
              `⏳ Status: PENDING`,
              { parse_mode: "HTML", reply_markup: kb });
          }
        } catch (e) { }
        return ctx.reply(
          `⏳ <b>UTR Submitted!</b>\n\n🆔 Order: <code>${orderId}</code>\n🔐 UTR: <code>${utr}</code>\n\n${toSmallCaps("Wait for admin approval.")}`,
          { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) }
        );
      }
    }

    // ============ AUTO UPI WITHDRAW (uses user.upiId!) ============
    if (state === "WD_AUTO_UPI_AMOUNT") {
      delete userState[userId];
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply(`❌ Invalid amount!`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let user = await getUser(userId);
      if (!user.upiId || user.upiId === "Not Set") {
        return ctx.reply(`❌ Please set your UPI in Payout Method first!\n\n➡️ Click "💳 Payout Method" → "Set UPI"`, { reply_markup: await buildKeyboardFromLayout(userId) });
      }
      if (user.balance < amount) return ctx.reply(`❌ Insufficient balance! Your balance: ₹${user.balance.toFixed(2)}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      let ws = await WithdrawSettings.findOne({ method: "upi" }).lean();
      let minW = ws ? ws.minAmount : 0;
      let maxW = ws ? ws.maxAmount : 0;
      if (minW > 0 && amount < minW) return ctx.reply(`❌ Minimum: ₹${minW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      if (maxW > 0 && amount > maxW) return ctx.reply(`❌ Maximum: ₹${maxW}`, { reply_markup: await buildKeyboardFromLayout(userId) });
      userState[userId] = `WD_AUTO_UPI_CONFIRM_${amount}`;
      let body =
        `💰 Amount: <code>₹${amount.toFixed(2)}</code>\n` +
        `📌 To UPI: <code>${user.upiId}</code>\n\n` +
        `💵 After: ₹${(user.balance - amount).toFixed(2)}`;
      return ctx.reply(
        `⚡ <b>Confirm Auto UPI Withdraw</b>\n\n<blockquote>${body}</blockquote>\n\nClick Confirm to process instantly:`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(makeBtn("Confirm ✅"), `auto_upi_wd_yes_${amount}`).row()
            .text(makeBtn("Cancel ❌"), "wd_cancel")
        }
      );
    }
  }

  let user = await getUser(userId);
  let layout = await getCurrentKeyboardLayoutForUser(userId);
  let findKeyByName = (name) => {
    let btn = layout.find(b => b.name === name && !b.hidden);
    return btn ? btn.key : null;
  };
  let matchedKey = findKeyByName(text);

  let isAdminUser = await isAdmin(userId);
  if (matchedKey && !isAdminUser) {
    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) return sendForceJoinMessage(ctx);
  }

  if (matchedKey === "btn_balance") {
    try { await sendBalancePage(ctx, false); } catch (err) { return ctx.reply(`❌ Error: ${err.message}`); }
    return;
  }
  else if (matchedKey === "btn_tasks") {
    try {
      let tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).sort({ createdAt: -1 }).lean();
      if (!tasks || tasks.length === 0) return ctx.reply(`${toSmallCaps("No tasks available.")}`, { parse_mode: "HTML" });
      let taskButtons = [];
      tasks.forEach(t => taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]));
      return ctx.reply(`<b>${toSmallCaps("Available Tasks")}</b>`, { reply_markup: await buildStyledKb(taskButtons), parse_mode: "HTML" });
    } catch (e) { return ctx.reply(`❌ ${toSmallCaps("Error loading tasks.")}`, { parse_mode: "HTML" }); }
  }
  else if (matchedKey === "btn_gift") {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply(`🎁 ${toSmallCaps("Gift Code")}\n\n${toSmallCaps("Send Gift Code To Claim Reward!")}`, { parse_mode: "HTML" });
  }
  else if (matchedKey === "btn_quickpay") {
    let title = `💡${toSmallCaps("Quick Pay To a Simple User Payment Send")}`;
    let bodyText = `${toSmallCaps("You Can Also Use The Format Below To Process Payments For One or Multiple Users:")}\n\n${toSmallCaps("Format")} :\n<code>${userId} 1</code>     <code>@username 1</code>\n<code>8061612320 5</code>     <code>@myfriend 5</code>`;
    let qpText = `${title}\n\n<blockquote>${bodyText}</blockquote>`;
    userState[userId] = "QP_WAIT_INPUT";
    let kb = new Keyboard().requestUsers(`${toSmallCaps("Select User")}`, 1, { user_is_bot: false, request_name: true, request_username: true }).row().text("❌ Cancel").resized().oneTime();
    return ctx.reply(qpText, { parse_mode: "HTML", reply_markup: kb });
  }
  else if (matchedKey === "btn_payout") {
    return sendPayoutMethodPage(ctx, false);
  }
  else if (matchedKey === "btn_withdraw") {
    let withdrawEnabled = await getConfig("withdraw_enabled", true);
    if (!withdrawEnabled) {
      let isAdminU = await isAdmin(userId);
      if (!isAdminU) return ctx.reply(`⚠️ ${toSmallCaps("Withdrawals are currently disabled")}`, { parse_mode: "HTML" });
    }
    let buttons = await buildWithdrawMenu();
    if (buttons.length === 0) return ctx.reply(`<b>${toSmallCaps("Choose Withdraw Method")}</b>\n\n❌ ${toSmallCaps("No withdraw methods available.")}`, { parse_mode: "HTML" });
    return ctx.reply(`<b>${toSmallCaps("Choose Withdraw Method")}</b>`, { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" });
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
      return ctx.reply(`🎉 ${toSmallCaps("Added")} ₹${gift.amount}!`, { reply_markup: await buildKeyboardFromLayout(userId) });
    }
    return sendUnknownCommand(ctx);
  }
});

// ============ ADMIN COMMAND ============
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

  let botStatus = await getConfig("bot_status", "active");
  let statusDisplay = "";
  if (botStatus === "active") statusDisplay = `✅ Active`;
  else if (botStatus === "maintenance") statusDisplay = `⚠️ Maintenance`;
  else statusDisplay = `❌ Disabled`;

  let minW = await getConfig("min_withdraw", 0);
  let maxW = await getConfig("max_withdraw", 0);
  let pChannel = await getConfig("payout_channel", null);
  if (!pChannel || pChannel === "Not Set") {
    for (let m of ["upi", "bank", "wallet", "amazon", "redeem", "auto_upi"]) {
      let oldCh = await getConfig("payout_channel_" + m, null);
      if (oldCh && oldCh !== "Not Set") { pChannel = oldCh; break; }
    }
  }
  if (!pChannel) pChannel = "Not Set";

  let supportId = await getConfig("support_username", "Not Set");
  let quickTaxEnabled = await getConfig("quick_pay_tax_enabled", false);
  let quickTaxPercent = await getConfig("quick_pay_tax_percent", 0);

  let panelText =
    `👑 <b>Admin Panel</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 <b>Bot Status:</b> ${statusDisplay}\n` +
    `💸 <b>Min:</b> ₹${minW} | 💰 <b>Max:</b> ₹${maxW}\n` +
    `📢 <b>Payout:</b> <code>${pChannel}</code>\n` +
    `💬 <b>Support:</b> <code>${supportId}</code>\n` +
    `🌐 <b>Gateways:</b> ${gatewayCount} active\n` +
    `⚡ <b>Quick Pay Tax:</b> ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 OFF"}\n` +
    `👥 <b>Users:</b> ${userCount} | 👑 <b>Admins:</b> ${activeAdmins}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let freshConfig = await Config.findOne({ key: "admin_panel_layout" }).lean();
  let layout = (freshConfig && freshConfig.value) ? freshConfig.value : DEFAULT_ADMIN_PANEL_LAYOUT;
  configCache.data["admin_panel_layout"] = layout;
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
  delete userState[ctx.from.id];
  await sendAdminPanel(ctx, true);
});

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
  let bodyText = `👑 <b>Owner:</b> ${ownerUser?.firstName || "Owner"}\n🆔 <code>${ownerId}</code>\n\n📊 Total Admins: ${admins.length}\n\n👇 Click to toggle / remove:`;
  let text = `<b>Admin Permissions</b>\n\n<blockquote>${bodyText}</blockquote>`;
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
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", admin.isActive ? "Admin Enabled" : "Admin Disabled", `${adminId}`, 0, adminId);
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
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `<b>Add New Admin</b>\n\n📝 Send User ID or @username:\n\nExample:\n<code>123456789</code>\n<code>@username</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_permissions") }
  ).catch(() => { });
});

bot.callbackQuery("adm_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Transfer Ownership</b>\n\n⚠️ You will become an Admin.\n\n📝 Send new Owner User ID:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "admin") }).catch(() => { });
});

bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);
  let targetUser = await User.findOne({ userId: newOwnerId });
  if (!targetUser) return ctx.answerCallbackQuery({ text: "User not found", show_alert: true });
  await BotAdmin.findOneAndUpdate({ userId: ctx.from.id }, { addedAt: new Date(), addedBy: ctx.from.id, isActive: true }, { upsert: true });
  await setConfig("owner_id", newOwnerId);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Owner", "Ownership Transferred", `New owner: ${newOwnerId}`, 0, newOwnerId);
  try { await ctx.api.sendMessage(newOwnerId, `👑 Congratulations! You are now the OWNER of this bot!`); } catch (e) { }
  await ctx.editMessageText(`✅ Ownership transferred to <code>${newOwnerId}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Back to Admin", "admin") }).catch(() => { });
});

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
  await ctx.editMessageText(`<b>Set Withdraw Tax</b>\n\n📊 Current: <code>${cur}%</code>\n\n👇 Choose action:`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_set_tax_val", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_TAX_PERCENT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 Send tax percentage (0-50):`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_set_wd_tax") });
});

bot.callbackQuery("adm_reset_tax", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Reset!" });
  if (!(await isAdmin(ctx.from.id))) return;
  await setConfig("tax_percent", 0);
  await rerender(ctx, "adm_set_wd_tax");
});

bot.callbackQuery("adm_bot_status", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("bot_status", "active");
  let next = current === "active" ? "maintenance" : current === "maintenance" ? "disabled" : "active";
  await setConfig("bot_status", next);
  await setConfig("bot_active", next === "active");
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Bot Status Changed", `${current} → ${next}`, 0, null);
  let toastMsg = next === "active" ? "✅ Active" : next === "maintenance" ? "⚠️ Maintenance" : "❌ Disabled";
  await ctx.answerCallbackQuery({ text: toastMsg }).catch(() => { });
  await sendAdminPanel(ctx, true);
});

bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderPermissionsPanel(ctx);
});

bot.callbackQuery("adm_manage_ban", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bannedUsers = await User.find({ isBanned: true }).limit(20).lean();
  let bodyText = `Total Banned: ${bannedUsers.length}\n\n`;
  bannedUsers.forEach((u, i) => { bodyText += `${i + 1}. ${u.firstName || "User"} — <code>${u.userId}</code>\n`; });
  let kb = new InlineKeyboard().text(makeBtn("Ban New User"), "adm_ban_new").row().text(makeBtn("Unban User"), "adm_unban_user").row().text(makeBtn("Back"), "admin");
  await ctx.editMessageText(`<b>Manage Ban Users</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_ban_new", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_USER_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🚫 Send User ID to BAN:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban") });
});

bot.callbackQuery("adm_unban_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UNBAN_USER_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🔓 Send User ID to UNBAN:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban") });
});

bot.callbackQuery("adm_manage_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let unlimitedWallet = await getConfig("unlimited_wallet", false);
  let onetimeWallet = await getConfig("onetime_wallet", false);
  let text = `<b>Manage Ban Wallet</b>\n\n♾️ Unlimited: ${unlimitedWallet ? "🟢 ON" : "🔴 OFF"}\n⏱️ One-Time: ${onetimeWallet ? "🟢 ON" : "🔴 OFF"}`;
  let kb = new InlineKeyboard().text(makeBtn("Ban Wallet"), "adm_ban_wallet").row().text(makeBtn(unlimitedWallet ? "Unlimited: ON" : "Unlimited: OFF"), "adm_unlimited_wallet").row().text(makeBtn(onetimeWallet ? "One-Time: ON" : "One-Time: OFF"), "adm_onetime_wallet").row().text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_ban_wallet", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BAN_WALLET_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🚫 Send Wallet ID to BAN:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_ban_wallet") });
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

bot.callbackQuery("adm_wd_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let isEnabled = await getConfig("withdraw_enabled", true);
  let status = isEnabled ? "ON" : "OFF";
  let desc = isEnabled ? "All users can request withdrawals." : "All withdrawal requests disabled.";
  let text = `<b>Withdraw Status</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nGlobal Withdraw: <b>${status}</b>\n\n${desc}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  let kb = new InlineKeyboard().text(makeBtn(isEnabled ? "Turn OFF" : "Turn ON"), "toggle_withdraw_global").row().text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("toggle_withdraw_global", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("withdraw_enabled", true);
  await setConfig("withdraw_enabled", !current);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", !current ? "Withdraw Enabled" : "Withdraw Disabled", "", 0, null);
  await ctx.answerCallbackQuery({ text: !current ? "ON" : "OFF" });
  await rerender(ctx, "adm_wd_status");
});

bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➕ <b>Add Balance</b>\n\n📝 Send:\n<code>UserID Amount</code>\n<code>@username Amount</code>\n\n💡 Example:\n<code>8061612320 100</code>\n<code>@myfriend 50</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") });
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➖ <b>Remove Balance</b>\n\n📝 Send:\n<code>UserID Amount</code>\n<code>@username Amount</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") });
});

bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let userCount = await User.countDocuments({});
  let kb = new InlineKeyboard().text(makeBtn("Yes, Reset All"), "adm_reset_all_confirm").row().text(makeBtn("Cancel"), "admin");
  await ctx.editMessageText(`⚠️ <b>RESET ALL BALANCES</b>\n\nUsers: ${userCount}\n\nThis will reset EVERYONE's balance to 0!\n\nConfirm?`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "Resetting..." });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Reset All Balances", "All users", 0, null);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`All balances reset to 0`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }).catch(() => { });
});

bot.callbackQuery("adm_talk_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💬 Format: <code>UserID | Message</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "admin") });
});

bot.callbackQuery("adm_find_user", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Find User Details</b>\n\n📝 Send User ID:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") });
});

bot.callbackQuery(/^user_detail_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let uid = parseInt(ctx.callbackQuery.data.replace("user_detail_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  let approvedCount = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let totalWdArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let totalWd = totalWdArr[0]?.total || 0;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `Name: ${u.firstName || "User"}\nID: ${uid}\nUsername: ${u.username ? "@" + u.username : "None"}\n\nBalance: ${formatBalance(u.balance)}\nTotal Withdrawn: ₹${totalWd.toFixed(2)}\nWithdraw Count: ${approvedCount}\n\nJoined: ${formatDateTime(u.createdAt)}`;
  let text = `<b>User Details</b>\n\n<blockquote>${bodyText}</blockquote>`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Linked Withdraw"), `user_linked_${uid}`).row()
    .text(makeBtn("Withdraw History"), `user_wd_hist_${uid}`).row()
    .text(makeBtn("Balance History"), `user_bal_hist_${uid}`).row()
    .text(makeBtn("Add Balance"), `user_add_bal_${uid}`).text(makeBtn("Remove Balance"), `user_rem_bal_${uid}`).row()
    .text(makeBtn("Send Message"), `user_send_msg_${uid}`).text(makeBtn("Ban/Unban"), `user_ban_${uid}`).row()
    .text(makeBtn("Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^user_linked_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_linked_", ""), 10);
  let u = await User.findOne({ userId: uid }).lean();
  if (!u) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `Wallet Number: ${u.walletNumber || "Not Set"}\n\nUPI: ${u.upiId || "Not Set"}\n\nBank: ${u.bankAccNo || "Not Set"}\n\nAmazon: ${u.amazonEmail || "Not Set"}\n\nRedeem: ${u.redeemCodeAddr || "Not Set"}`;
  await ctx.editMessageText(`<b>Linked Withdraw Methods</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^user_wd_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_wd_hist_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(10).lean();
  let totalArr = await Withdrawal.aggregate([{ $match: { userId: uid, status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let total = totalArr[0]?.total || 0;
  let approved = await Withdrawal.countDocuments({ userId: uid, status: "Approved" });
  let pending = await Withdrawal.countDocuments({ userId: uid, status: "Pending" });
  let rejected = await Withdrawal.countDocuments({ userId: uid, status: "Rejected" });
  let bodyText = `Total: ₹${total.toFixed(2)}\n✅ ${approved} | ⏳ ${pending} | ❌ ${rejected}\n\n`;
  if (withdrawals.length === 0) bodyText += `No withdrawals`;
  else withdrawals.forEach((w, i) => { let icon = w.status === "Approved" ? "✅" : (w.status === "Rejected" ? "❌" : "⏳"); bodyText += `${i + 1}. ${icon} ₹${w.amount} — ${w.method}\n${formatDateTime(w.createdAt)}\n\n`; });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Withdraw History</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^user_bal_hist_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_bal_hist_", ""), 10);
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(15).lean();
  let u = await User.findOne({ userId: uid }).lean();
  let totalIn = 0, totalOut = 0;
  history.forEach(h => { if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount); });
  let bodyText = `🟢 Credited: ₹${totalIn.toFixed(2)}\n🔴 Debited: ₹${totalOut.toFixed(2)}\n💵 Current: ${formatBalance(u?.balance || 0)}\n\n`;
  if (history.length === 0) bodyText += `No transactions`;
  else history.forEach((h, i) => { let icon = h.amount >= 0 ? "🟢" : "🔴"; let sign = h.amount >= 0 ? "+" : ""; bodyText += `${i + 1}. ${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)}\n${formatDateTime(h.createdAt)}\n\n`; });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Balance History</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `user_detail_${uid}`), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^user_add_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_add_bal_", ""), 10);
  userState[ctx.from.id] = `UADD_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➕ Send amount to add to <code>${uid}</code>:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`) }).catch(() => { });
});

bot.callbackQuery(/^user_rem_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_rem_bal_", ""), 10);
  userState[ctx.from.id] = `UREM_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`➖ Send amount to remove from <code>${uid}</code>:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`) }).catch(() => { });
});

bot.callbackQuery(/^user_send_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_send_msg_", ""), 10);
  userState[ctx.from.id] = `UMSG_WAIT_${uid}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💬 Send message to <code>${uid}</code>:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `user_detail_${uid}`) }).catch(() => { });
});

bot.callbackQuery(/^user_ban_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let uid = parseInt(ctx.callbackQuery.data.replace("user_ban_", ""), 10);
  let u = await User.findOne({ userId: uid });
  if (!u) return;
  u.isBanned = !u.isBanned;
  await u.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", u.isBanned ? "User Banned" : "User Unbanned", `${uid}`, 0, uid);
  await ctx.answerCallbackQuery({ text: u.isBanned ? "Banned" : "Unbanned" });
  await rerender(ctx, `user_detail_${uid}`);
});

// ============ CHANNELS ============
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
  let bannedAllowed = await getConfig("banned_in_channel_allowed", true);
  let nonAdminBypass = await getConfig("non_admin_channels_bypass", true);
  let showMode = await getConfig("show_mode", "all");
  let text = `📢 <b>Here You Can Manage Your Channels And Social Links</b>\n\nClick On A Channel Or Social Link To Set An Invite Link For Private Channels And Edit Social Link.`;
  let kb = new InlineKeyboard();
  for (let ch of channels) {
    let shortName = (ch.displayName || ch.channelId).substring(0, 8);
    let visibility = ch.isHidden ? "🙈" : "👀";
    kb.text(shortName, `ch_edit_${ch.channelId}`).text("❌", `ch_del_${ch.channelId}`).text("▲", `ch_up_${ch.channelId}`).text("▼", `ch_down_${ch.channelId}`).text(visibility, `ch_toggle_${ch.channelId}`).row();
  }
  for (let s of socialLinks) {
    let shortName = s.name.substring(0, 10);
    kb.text(shortName, `sl_edit_${s._id}`).text("❌", `sl_del_${s._id}`).row();
  }
  kb.text(makeBtn("➕ Add Channels"), "adm_add_channel").row()
    .text(makeBtn("➕ Add Payout Channel"), "adm_add_payout_channel").row()
    .text(makeBtn("➕ Add Social Media Links"), "adm_add_social_link").row()
    .text(makeBtn("📢 Broadcast To Channels"), "adm_broadcast_channels").row()
    .text(makeBtn("⚡ New User Join Channels"), "adm_new_user_join").row()
    .text(makeBtn(`🛡 Banned In Channel ~ ${bannedAllowed ? "✅ Allowed" : "❌ Not Allowed"}`), "adm_banned_in_channel").row()
    .text(makeBtn(`⚙ Non-Admin Channels ~ ${nonAdminBypass ? "🟢 Bypass" : "🔴 Not Bypass"}`), "adm_non_admin_channels").row()
    .text(makeBtn(`⚪ Show Mode: ${showMode === "all" ? "All Channels" : "Not Joined Only"}`), "adm_show_mode").row()
    .text(makeBtn("Back"), "admin");
  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery("adm_add_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_CHANNEL_WAIT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Add Channel</b>\n\nSend Your Channel User Name:\n\nExample:\n@mychannel\n-1001234567890`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") });
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
  await ctx.editMessageText(`<b>Edit Channel</b>\n\nChannel: ${ch.displayName || ch.channelId}\nCurrent Link: ${ch.inviteLink}\n\nSend new invite link:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") });
});

bot.callbackQuery("adm_add_payout_channel", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let current = await getConfig("payout_channel", null);
  if (!current || current === "Not Set") {
    for (let m of ["upi", "bank", "wallet", "amazon", "redeem", "auto_upi"]) {
      let oldCh = await getConfig("payout_channel_" + m, null);
      if (oldCh && oldCh !== "Not Set") { current = oldCh; break; }
    }
  }
  if (!current) current = "Not Set";
  userState[ctx.from.id] = "SET_PAYOUT_CHANNEL";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Set Payout Channel</b>\n\nCurrent: <code>${current}</code>\n\nSend Your Payout Channel Link\n\nExample:\n@upi_payouts\n-1001234567890`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel ❌"), "adm_manage_channels") });
});

bot.callbackQuery("adm_add_social_link", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "ADD_SOCIAL_LINK";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Add Social Media Link</b>\n\nFormat: <code>Name | Link</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") });
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
  await ctx.editMessageText(`<b>Edit Social Link</b>\n\nCurrent: ${s.name} | ${s.link}\n\nSend new: <code>Name | Link</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") });
});

bot.callbackQuery("adm_broadcast_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await Channel.find({ isActive: true }).lean();
  if (channels.length === 0) return ctx.answerCallbackQuery({ text: "No channels added!", show_alert: true });
  userState[ctx.from.id] = "BROADCAST_TO_CHANNELS";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Broadcast To Channels</b>\n\n<blockquote>Total: ${channels.length} channels</blockquote>\n\nSend your broadcast message:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_manage_channels") });
});

bot.callbackQuery("adm_new_user_join", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let channels = await Channel.find({ isActive: true }).sort({ order: 1 }).lean();
  let totalUsers = await User.countDocuments({});
  let forceJoinEnabled = await getConfig("force_join_enabled", true);
  let bodyText = `Bot Total Users: ${totalUsers}\nForce Join: ${forceJoinEnabled ? "ON" : "OFF"}\n\n`;
  let kb = new InlineKeyboard();
  for (let ch of channels) {
    let joinedCount = await User.countDocuments({ joinedChannels: ch.channelId });
    bodyText += `${ch.displayName || ch.channelId}: ${joinedCount}\n`;
    kb.text(makeBtn(`${ch.displayName || ch.channelId} (${joinedCount})`), `nuj_ch_${ch.channelId}`).row();
  }
  kb.text(makeBtn(forceJoinEnabled ? "Turn OFF Force Join" : "Turn ON Force Join"), "adm_toggle_force_join").row();
  kb.text(makeBtn("Back"), "adm_manage_channels");
  await ctx.editMessageText(`<b>New User Join Channels</b>\n\n<blockquote>${bodyText}</blockquote>`, { parse_mode: "HTML", reply_markup: kb }).catch(() => { });
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
  let bodyText = `Channel: ${ch.displayName || chId}\nJoined Users: ${users.length}\n\n`;
  users.forEach((u, i) => { bodyText += `${i + 1}. ${u.firstName || "User"} — <code>${u.userId}</code>\n`; });
  await ctx.editMessageText(`<b>Channel Joined Users</b>\n\n<blockquote>${bodyText}</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_new_user_join") }).catch(() => { });
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

// ============ GATEWAY MENU ============
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayMenu(ctx);
});

async function renderGatewayMenu(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let gateways = await Gateway.find({}).sort({ createdAt: -1 }).lean();
  let total = gateways.length;
  let active = gateways.filter(g => g.isActive).length;
  let bodyText = `Total: ${total} | 🟢 ON: ${active}\n\n`;
  if (total === 0) bodyText += `No gateways configured.`;
  else gateways.forEach((g, i) => { bodyText += `${i + 1}. 🌐 ${g.name}\n   ${g.isActive ? "🟢 ON" : "🔴 OFF"}\n   🔗 ${(g.url_template || g.url).substring(0, 35)}...\n\n`; });
  let kb = new InlineKeyboard().text(makeBtn("Add New Gateway"), "gw_add_new").row();
  for (let g of gateways) { let icon = g.isActive ? "🟢" : "🔴"; kb.text(`${icon} ${g.name}`, `gw_view_${g.name}`).row(); }
  kb.row({ text: makeBtn("Back to Admin"), callback_data: "admin" });
  await ctx.editMessageText(`<b>Gateway Setup</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
}

bot.callbackQuery("gw_add_new", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "GW_WAIT_NAME_V2";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🏦 Add New Gateway\n\n📝 Send Gateway Name:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_gateway_menu") });
});

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name }).lean();
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  let urlShow = gw.url_template || gw.url || "";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `URL:\n<code>${urlShow}</code>\n\nStatus: ${gw.isActive ? "🟢 ON" : "🔴 OFF"}\nMin: ₹${gw.minAmount || 0}\nMax: ₹${gw.maxAmount || 0}\nTax: ${gw.taxPercent || 0}%\n\nCreated: ${formatDateTime(gw.createdAt)}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Edit Settings"), `gw_edit_${gw.name}`).row()
    .text(makeBtn(gw.isActive ? "Turn OFF" : "Turn ON"), `gw_toggle_${gw.name}`).row()
    .text(makeBtn("Edit URL"), `gw_edit_url_${gw.name}`).row()
    .text(makeBtn("Delete Gateway"), `gw_del_${gw.name}`).row()
    .text(makeBtn("Back"), "adm_gateway_menu");
  await ctx.editMessageText(`<b>Gateway: ${gw.name}</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^gw_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_toggle_", "");
  let gw = await Gateway.findOne({ name });
  if (!gw) return;
  gw.isActive = !gw.isActive;
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
  let text = `<b>${name} Settings</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nStatus: ${gw.isActive ? "ON" : "OFF"}\nMin: ₹${gw.minAmount || 0}\nMax: ₹${gw.maxAmount || 0}\nTax: ${gw.taxPercent || 0}%\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
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
  await ctx.editMessageText(`Set Min Amount\n\nSend minimum amount:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`) }).catch(() => { });
});

bot.callbackQuery(/^gw_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_max_", "");
  userState[ctx.from.id] = `GW_MAX_${name}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`Set Max Amount\n\nSend maximum amount:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`) }).catch(() => { });
});

bot.callbackQuery(/^gw_tax_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_tax_", "");
  userState[ctx.from.id] = `GW_TAX_${name}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`Set Tax Percent\n\nSend tax % (0-50):`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${name}`) }).catch(() => { });
});

bot.callbackQuery(/^gw_edit_url_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let name = ctx.callbackQuery.data.replace("gw_edit_url_", "");
  userState[ctx.from.id] = `GW_EDIT_URL_${name}`;
  let gw = await Gateway.findOne({ name }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Edit Gateway URL</b>\n\n📛 ${name}\n\nCurrent:\n<code>${gw.url}</code>\n\nSend new URL template:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), `gw_view_${name}`) });
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let name = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Gateway Deleted", name, 0, null);
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderGatewayMenu(ctx);
});

// ============ AUTO UPI ADMIN PANEL ============
bot.callbackQuery("adm_auto_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAutoUpiPanel(ctx);
});

async function renderAutoUpiPanel(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
  if (!cfg) cfg = { upiId: "Not Set", payeeName: "Auto UPI", minAmount: 5, maxAmount: 5000, taxPercent: 0, isActive: false, mode: "manual", apiUrl: "", apiKey: "" };
  let pending = await AutoUpiOrder.countDocuments({ status: "Pending" });
  let approved = await AutoUpiOrder.countDocuments({ status: "Approved" });
  let totalArr = await AutoUpiOrder.aggregate([{ $match: { status: "Approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  let total = totalArr[0]?.total || 0;

  let text =
    `🇮🇳 <b>Auto Gateway UPI (Deposit)</b>\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 <b>UPI ID:</b> <code>${cfg.upiId}</code>\n` +
    `👤 <b>Payee Name:</b> ${cfg.payeeName}\n` +
    `💵 <b>Limits:</b> ₹${cfg.minAmount} - ₹${cfg.maxAmount}\n` +
    `📊 <b>Tax:</b> ${cfg.taxPercent}%\n` +
    `⚙️ <b>Mode:</b> ${cfg.mode === "auto" ? "⚡ Auto" : "👤 Manual"}\n` +
    `🔌 <b>Verify API:</b> ${cfg.apiUrl ? "✅ Set" : "❌ Not Set"}\n` +
    `📊 <b>Status:</b> ${cfg.isActive ? "🟢 ON" : "🔴 OFF"}\n\n` +
    `📈 <b>Stats:</b> ⏳ ${pending} pending | ✅ ${approved} approved\n` +
    `💰 <b>Total Collected:</b> ₹${total.toFixed(2)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text(makeBtn("✏️ Set UPI ID"), "aupi_set_id").row()
    .text(makeBtn("👤 Set Payee Name"), "aupi_set_name").row()
    .text(makeBtn("💵 Set Min/Max"), "aupi_set_limits").row()
    .text(makeBtn("📊 Set Tax %"), "aupi_set_tax").row()
    .text(makeBtn("🔌 Set Verify API"), "aupi_set_api").row()
    .text(makeBtn(cfg.mode === "auto" ? "⚡ Switch to Manual" : "👤 Switch to Auto"), "aupi_toggle_mode").row()
    .text(makeBtn(cfg.isActive ? "🔴 Turn OFF" : "🟢 Turn ON"), "aupi_toggle").row()
    .text(makeBtn(`📥 Pending Orders (${pending})`), "aupi_pending").row()
    .text(makeBtn("📜 Recent Approved"), "aupi_recent").row()
    .text(makeBtn("⬅️ Back"), "admin");

  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery("aupi_set_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AUPI_SET_ID";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 <b>Set UPI ID</b>\n\nSend your UPI ID:\nExample: <code>yourname@okaxis</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_auto_upi") });
});

bot.callbackQuery("aupi_set_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AUPI_SET_NAME";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 <b>Set Payee Name</b>\n\nThis name will appear in the UPI QR:\nExample: <code>My Store</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_auto_upi") });
});

bot.callbackQuery("aupi_set_limits", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AUPI_SET_LIMITS";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 <b>Set Min/Max</b>\n\nFormat: <code>MIN-MAX</code>\nExample: <code>10-5000</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_auto_upi") });
});

bot.callbackQuery("aupi_set_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AUPI_SET_TAX";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 <b>Set Tax %</b>\n\nSend tax percentage (0-20):`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_auto_upi") });
});

bot.callbackQuery("aupi_set_api", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AUPI_SET_API";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `🔌 <b>Set UPI Verify API</b>\n\n` +
    `Format: <code>API_URL|API_KEY</code>\n\n` +
    `Placeholders: <code>{utr}</code> <code>{amount}</code> <code>{upi}</code> <code>{apikey}</code>\n\n` +
    `Example:\n<code>https://yourapi.com/verify?utr={utr}&amount={amount}&key={apikey}|YOURKEY</code>\n\n` +
    `⚠️ Leave empty for manual approval only.`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_auto_upi") }
  );
});

bot.callbackQuery("aupi_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cfg = await AutoUpi.findOne({ key: "main_upi" });
  if (!cfg) cfg = await AutoUpi.create({ key: "main_upi" });
  if (!cfg.isActive && (!cfg.upiId || cfg.upiId === "Not Set")) {
    return ctx.answerCallbackQuery({ text: "❌ Set UPI ID first!", show_alert: true });
  }
  cfg.isActive = !cfg.isActive;
  cfg.updatedAt = new Date();
  await cfg.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Auto UPI Toggled", cfg.isActive ? "ON" : "OFF", 0, null);
  await ctx.answerCallbackQuery({ text: cfg.isActive ? "🟢 ON" : "🔴 OFF" });
  await renderAutoUpiPanel(ctx);
});

bot.callbackQuery("aupi_toggle_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cfg = await AutoUpi.findOne({ key: "main_upi" });
  if (!cfg) cfg = await AutoUpi.create({ key: "main_upi" });
  cfg.mode = cfg.mode === "auto" ? "manual" : "auto";
  cfg.updatedAt = new Date();
  await cfg.save();
  await ctx.answerCallbackQuery({ text: cfg.mode === "auto" ? "⚡ Auto" : "👤 Manual" });
  await renderAutoUpiPanel(ctx);
});

bot.callbackQuery("aupi_pending", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let orders = await AutoUpiOrder.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(30).lean();
  if (orders.length === 0) {
    return ctx.editMessageText(`📥 <b>Pending Auto UPI Orders</b>\n\n<blockquote>No pending orders.</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }).catch(() => { });
  }
  let body = `Pending: ${orders.length}\n\n`;
  let kb = new InlineKeyboard();
  for (let o of orders) {
    body += `👤 ${o.userName || "User"} — ₹${o.amount}\n   <code>${o.orderId}</code>\n\n`;
    kb.text(`${o.userName || "User"} — ₹${o.amount}`, `aupi_view_${o.orderId}`).row();
  }
  kb.text(makeBtn("Back"), "adm_auto_upi");
  await ctx.editMessageText(`📥 <b>Pending Auto UPI Orders</b>\n\n<blockquote>${body}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^aupi_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let orderId = ctx.callbackQuery.data.replace("aupi_view_", "");
  let order = await AutoUpiOrder.findOne({ orderId }).lean();
  if (!order) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let statusIcon = order.status === "Approved" ? "✅" : order.status === "Rejected" ? "❌" : "⏳";
  let body =
    `${statusIcon} Status: ${order.status}\n` +
    `👤 User: <a href="tg://user?id=${order.userId}">${order.userName || "User"}</a>\n` +
    `🆔 <code>${order.userId}</code>\n` +
    `💰 Amount: ₹${order.amount.toFixed(2)}\n` +
    `📌 UPI: <code>${order.upiId}</code>\n` +
    `🔐 UTR: <code>${order.utr || "N/A"}</code>\n` +
    `🕐 ${formatDateTime(order.createdAt)}\n`;
  if (order.apiResponse) body += `\n🔌 API: <code>${escapeHtml(order.apiResponse.substring(0, 200))}</code>\n`;
  let kb = new InlineKeyboard();
  if (order.status === "Pending") {
    kb.text(makeBtn("✅ Approve"), `aupi_app_${orderId}`).text(makeBtn("❌ Reject"), `aupi_rej_${orderId}`).row();
  }
  kb.text(makeBtn("⬅️ Back"), "aupi_pending");
  await ctx.editMessageText(`📋 <b>Auto UPI Order</b>\n\n<blockquote>${body}</blockquote>`, { parse_mode: "HTML", reply_markup: kb }).catch(() => { });
});

bot.callbackQuery(/^aupi_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("aupi_app_", "");
  let order = await AutoUpiOrder.findOne({ orderId });
  if (!order || order.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
  let tax = (cfg?.taxPercent || 0);
  let taxAmt = tax > 0 ? (order.amount * tax) / 100 : 0;
  let addAmt = order.amount - taxAmt;
  order.status = "Approved";
  order.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  order.approvedAt = new Date();
  await order.save();
  let user = await getUser(order.userId);
  user.balance += addAmt;
  await user.save();
  await logBalanceHistory(order.userId, `Auto UPI Deposit (${order.orderId})`, addAmt);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Auto UPI Approved", `₹${order.amount} → +₹${addAmt}`, addAmt, order.userId);
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  try {
    await ctx.api.sendMessage(order.userId,
      `✅ <b>${toSmallCaps("Deposit Approved!")}</b>\n\n💰 Amount: ₹${order.amount.toFixed(2)}\n${taxAmt > 0 ? `📊 Tax: ₹${taxAmt.toFixed(2)} (${tax}%)\n` : ""}💵 Credited: ₹${addAmt.toFixed(2)}\n💳 New Balance: ₹${user.balance.toFixed(2)}\n🔐 UTR: <code>${order.utr}</code>`,
      { parse_mode: "HTML" });
  } catch (e) { }
  await ctx.editMessageText(`✅ <b>Approved!</b>\n\n🆔 <code>${orderId}</code>\n💰 +₹${addAmt.toFixed(2)} added`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⬅️ Back", "aupi_pending") }).catch(() => { });
});

bot.callbackQuery(/^aupi_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let orderId = ctx.callbackQuery.data.replace("aupi_rej_", "");
  let order = await AutoUpiOrder.findOne({ orderId });
  if (!order || order.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  order.status = "Rejected";
  order.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  order.approvedAt = new Date();
  await order.save();
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Auto UPI Rejected", `₹${order.amount}`, order.amount, order.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try {
    await ctx.api.sendMessage(order.userId,
      `❌ <b>${toSmallCaps("Deposit Rejected")}</b>\n\n💰 ₹${order.amount.toFixed(2)}\n🔐 UTR: <code>${order.utr}</code>`,
      { parse_mode: "HTML" });
  } catch (e) { }
  await ctx.editMessageText(`❌ <b>Rejected!</b>\n\n🆔 <code>${orderId}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⬅️ Back", "aupi_pending") }).catch(() => { });
});

bot.callbackQuery("aupi_recent", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let orders = await AutoUpiOrder.find({ status: { $in: ["Approved", "Rejected"] } }).sort({ approvedAt: -1 }).limit(15).lean();
  let body = orders.length === 0 ? "No history." : "";
  for (let o of orders) {
    let icon = o.status === "Approved" ? "✅" : "❌";
    body += `${icon} ${o.userName || "User"} — ₹${o.amount}\n   ${formatDateTime(o.approvedAt || o.createdAt)}\n\n`;
  }
  await ctx.editMessageText(`📜 <b>Recent Auto UPI Orders</b>\n\n<blockquote>${body}</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }).catch(() => { });
});

// ============ USER DEPOSIT / AUTO UPI DEPOSIT ============
bot.callbackQuery("user_aupi_start", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
  if (!cfg || !cfg.isActive || !cfg.upiId || cfg.upiId === "Not Set") return ctx.answerCallbackQuery({ text: "Auto UPI disabled", show_alert: true });
  let userId = ctx.from.id;
  userState[userId] = "AUPI_USER_AMOUNT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(
    `🇮🇳 <b>Auto UPI Deposit</b>\n\n` +
    `📌 UPI: <code>${cfg.upiId}</code>\n` +
    `💵 Limits: ₹${cfg.minAmount} - ₹${cfg.maxAmount}\n` +
    `${cfg.taxPercent > 0 ? `📊 Tax: ${cfg.taxPercent}%\n` : ""}\n` +
    `📝 Enter the amount you want to deposit:`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("❌ Cancel"), "back_to_balance") }
  ).catch(() => { });
});

bot.callbackQuery("aupi_user_cancel", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  await sendBalancePage(ctx, true);
});

bot.callbackQuery("user_deposit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  await renderUserDepositPage(ctx);
});

async function renderUserDepositPage(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let gateways = await DepositGateway.find({ status: "active" }).sort({ order: 1, createdAt: 1 }).lean();
  let aupi = await AutoUpi.findOne({ key: "main_upi" }).lean();
  let aupiActive = aupi && aupi.isActive && aupi.upiId && aupi.upiId !== "Not Set";
  if (gateways.length === 0 && !aupiActive) {
    return ctx.editMessageText(`⚡ <b>Deposit</b>\n\n❌ No deposit methods available right now.`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Go Back"), "back_to_balance") }).catch(() => { });
  }
  let text = `⚡ <b>Deposit Options</b>\n\nPlease select a method to deposit:`;
  let kb = new InlineKeyboard();
  if (aupiActive) kb.text(`🇮🇳 Auto UPI Deposit (Instant)`, "user_aupi_start").row();
  for (let gw of gateways) {
    let label = `📥 ${gw.name}`;
    if (label.length > 40) label = label.substring(0, 38) + "..";
    kb.text(label, `user_dep_gw_${gw.gatewayId}`).row();
  }
  kb.text(makeBtn("⬅️ Go Back"), "back_to_balance");
  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery(/^user_dep_gw_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let gwId = ctx.callbackQuery.data.replace("user_dep_gw_", "");
  let gw = await DepositGateway.findOne({ gatewayId: gwId, status: "active" }).lean();
  if (!gw) return ctx.answerCallbackQuery({ text: "Not available", show_alert: true });
  userState[userId] = `USER_DEP_AMOUNT_${gwId}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let minText = gw.minAmount > 0 ? `₹${gw.minAmount}` : "Not Set";
  let maxText = gw.maxAmount > 0 ? `₹${gw.maxAmount}` : "Not Set";
  let text = `⚡ <b>Instant Deposit: ${gw.name}</b>\n\n📊 Limits: Min ${minText} | Max ${maxText}\n\n📲 Step 1: Please Enter The Amount You Want To Deposit:`;
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("⬅️ Back"), "user_deposit") }).catch(() => { });
});

bot.callbackQuery("user_dep_cancel", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  await sendBalancePage(ctx, true);
});

// ============ AUTO UPI WITHDRAW ============
bot.callbackQuery("wd_auto_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let cfg = await AutoUpi.findOne({ key: "main_upi" }).lean();
  if (!cfg || !cfg.isActive) return ctx.answerCallbackQuery({ text: "Auto UPI disabled", show_alert: true });
  let user = await getUser(userId);
  if (!user.upiId || user.upiId === "Not Set") {
    return ctx.answerCallbackQuery({ text: "❌ Please set UPI in Payout Method first!", show_alert: true });
  }
  if (user.balance <= 0) return ctx.answerCallbackQuery({ text: "Insufficient balance", show_alert: true });
  userState[userId] = "WD_AUTO_UPI_AMOUNT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let kb = new Keyboard().text("Cancel").resized().oneTime();
  await ctx.reply(
    `⚡ <b>Auto UPI Withdraw</b>\n\n` +
    `💰 Your Balance: <b>₹${user.balance.toFixed(2)}</b>\n` +
    `📌 Payout UPI: <code>${user.upiId}</code>\n\n` +
    `📝 Enter the amount you want to withdraw:`,
    { parse_mode: "HTML", reply_markup: kb }
  ).catch(() => { });
});

bot.callbackQuery(/^auto_upi_wd_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let amount = parseFloat(ctx.callbackQuery.data.replace("auto_upi_wd_yes_", ""));
  if (isNaN(amount) || amount <= 0) return ctx.answerCallbackQuery({ text: "Invalid", show_alert: true });
  let cfg = await AutoUpi.findOne({ key: "main_upi" });
  if (!cfg || !cfg.isActive) return ctx.answerCallbackQuery({ text: "Auto UPI disabled", show_alert: true });
  let user = await getUser(userId);
  if (!user.upiId || user.upiId === "Not Set") return ctx.answerCallbackQuery({ text: "UPI not set", show_alert: true });
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "Insufficient balance", show_alert: true });
  delete userState[userId];

  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, "Auto UPI Withdraw", -amount);

  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  let txnNumber = generateTxnNumber();

  let payoutUri = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.firstName || "User")}&am=${amount}&cu=INR&tn=${encodeURIComponent("Payout " + withdrawalId)}`;

  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (t) => `${pad}${t}${pad}`;

  await Withdrawal.create({
    withdrawalId, userId, userWithdrawalCount, amount,
    method: "AUTO_UPI", details: user.upiId,
    status: "Pending", isGateway: false, txnNumber
  });

  let payoutChannel = await getPayoutChannel("AUTO_UPI");
  if (payoutChannel && payoutChannel !== "Not Set") {
    const adminKb = new InlineKeyboard().text("Approve ✅", `wd_app_${withdrawalId}`).text("Reject ❌", `wd_rej_${withdrawalId}`);
    const userLink = `<a href="tg://user?id=${userId}"><b>${userId}</b></a>`;
    try {
      await bot.api.sendMessage(payoutChannel,
        `⚡ <b>Auto UPI Withdraw Request!</b> <code>(#${userWithdrawalCount})</code>\n\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `💰 <b>Amount:</b> <b>₹${amount}</b>\n` +
        `📌 <b>UPI:</b> <code>${user.upiId}</code>\n` +
        `🆔 <b>TXN:</b> <code>${txnNumber}</code>\n\n` +
        `👇 <b>Pay using the UPI link, then approve.</b>\n` +
        `📊 <b>Status:</b> ⏳ Pending`,
        { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
    } catch (e) { }
  }

  await ctx.answerCallbackQuery({ text: "⏳ Processing..." }).catch(() => { });
  await ctx.editMessageText(
    `⚡ <b>Auto UPI Withdraw Submitted!</b>\n\n` +
    `💰 Amount: ₹${amount.toFixed(2)}\n` +
    `📌 UPI: <code>${user.upiId}</code>\n` +
    `🆔 TXN: <code>${txnNumber}</code>\n\n` +
    `⏳ <b>Waiting for admin approval...</b>\n` +
    `💵 New Balance: ₹${user.balance.toFixed(2)}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("💳 Open UPI App", payoutUri).row().text(makeBtn("Menu"), "back_to_balance") }
  ).catch(() => { });
});

// ============ WITHDRAW MANUAL CALLBACKS ============
bot.callbackQuery(/^wd_(upi|bank|amazon|redeem)$/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let method = ctx.callbackQuery.data.replace("wd_", "");
  let user = await getUser(userId);
  let details = "";
  if (method === "upi") details = user.upiId;
  else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;
  if (!details || details === "Not Set" || details.includes("Not Set")) {
    let stateKey = "";
    if (method === "upi") stateKey = "WD_ADD_UPI";
    else if (method === "bank") stateKey = "WD_ADD_BANK_ACCNO";
    else if (method === "amazon") stateKey = "WD_ADD_AMAZON";
    else if (method === "redeem") stateKey = "WD_ADD_REDEEM";
    userState[userId] = stateKey;
    let kb = new Keyboard().text("Cancel").resized().oneTime();
    return ctx.reply(`${method.toUpperCase()} not linked!\n\nSend your ${method.toUpperCase()} details:`, { reply_markup: kb });
  }
  userState[userId] = `MANUAL_AMOUNT_${method}`;
  let kb = new Keyboard().text("Cancel").resized().oneTime();
  await ctx.reply(`Enter Withdraw Amount`, { reply_markup: kb });
});

bot.callbackQuery(/^man_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let data = ctx.callbackQuery.data.replace("man_conf_yes_", "");
  let parts = data.split("_");
  let amount = parseFloat(parts.pop());
  let method = parts.join("_").toLowerCase();
  await ctx.answerCallbackQuery({ text: "Processing..." }).catch(() => { });
  delete userState[userId];
  let user = await getUser(userId);
  let details = "";
  if (method === "upi") details = user.upiId;
  else if (method === "bank") details = (user.bankAccNo && user.bankAccNo !== "Not Set") ? `${user.bankAccNo}, ${user.bankIfsc}` : "";
  else if (method === "amazon") details = user.amazonEmail;
  else if (method === "redeem") details = user.redeemCodeAddr;
  if (!details || details === "Not Set" || details.includes("Not Set")) return ctx.editMessageText(`❌ Method not linked!`, { parse_mode: "HTML" }).catch(() => { });
  let ws = await WithdrawSettings.findOne({ method }).lean();
  let minW = ws ? ws.minAmount : 0;
  let maxW = ws ? ws.maxAmount : 0;
  if (minW > 0 && amount < minW) return ctx.editMessageText(`❌ Minimum: ₹${minW}`, { parse_mode: "HTML" }).catch(() => { });
  if (maxW > 0 && amount > maxW) return ctx.editMessageText(`❌ Maximum: ₹${maxW}`, { parse_mode: "HTML" }).catch(() => { });
  if (user.balance < amount) return ctx.editMessageText(`❌ Insufficient balance!`, { parse_mode: "HTML" }).catch(() => { });
  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${method.toUpperCase()} (Bot)`, -amount);
  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  let methodLabel = method.toUpperCase();
  let txnNumber = generateTxnNumber();
  await Withdrawal.create({ withdrawalId, userId, userWithdrawalCount, amount, method: methodLabel, details, status: "Pending", isGateway: false, txnNumber });
  let payoutChannel = await getPayoutChannel(method);
  if (payoutChannel && payoutChannel !== "Not Set") {
    const adminKb = new InlineKeyboard().text("Approve ✅", `wd_app_${withdrawalId}`).text("Reject ❌", `wd_rej_${withdrawalId}`);
    const userLink = `<a href="tg://user?id=${userId}"><b>${userId}</b></a>`;
    const hashTag = `<code>(#${userWithdrawalCount})</code>`;
    const methodIcon = method === "upi" ? "⚡" : method === "bank" ? "🏦" : method === "amazon" ? "📧" : "🎁";
    try {
      await bot.api.sendMessage(payoutChannel,
        `⚠️ <b>New ${methodLabel} Payout Request!</b> ${hashTag}\n\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `💰 <b>Request Amount:</b> <b>₹${amount}</b>\n` +
        `${methodIcon} <b>${methodLabel} ID:</b> <code><b>${details}</b></code>\n` +
        `🆔 <b>TXN ID:</b> <code><b>${txnNumber}</b></code>\n\n` +
        `📊 <b>Status:</b> ⏳ Pending`,
        { parse_mode: "HTML", reply_markup: adminKb, disable_web_page_preview: true });
    } catch (e) { console.error("Payout channel error:", e.message); }
  }
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  const methodIcon2 = method === "upi" ? "⚡" : method === "bank" ? "🏦" : method === "amazon" ? "📧" : "🎁";
  await ctx.editMessageText(
    `✅ <b>${toSmallCaps("Withdrawal Request Submitted!")}</b>\n\n` +
    `💰 ${toSmallCaps("Amount")}: ₹${amount.toFixed(2)}\n` +
    `${methodIcon2} ${methodLabel} ID: <code>${details}</code>\n` +
    `🆔 ${toSmallCaps("ID")}: <code>${withdrawalId}</code>\n\n` +
    `⏳ ${toSmallCaps("Waiting for admin approval...")}\n` +
    `💵 ${toSmallCaps("New Balance")}: ₹${user.balance.toFixed(2)}`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Menu"), "back_to_balance") }
  ).catch(() => { });
});

bot.callbackQuery("man_conf_no", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  delete userState[ctx.from.id];
  await sendBalancePage(ctx, true);
});

bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wdId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wdId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  let processTime = new Date();
  let adminTag = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.status = "Approved";
  if (!wd.txnNumber) wd.txnNumber = generateTxnNumber();
  wd.approvedBy = adminTag;
  wd.approvedAt = processTime;
  await wd.save();
  await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: wd.amount } }, { upsert: true });
  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  try { await bot.api.sendMessage(wd.userId, `🎁 Your Withdrawal of Rs.<code>${wd.amount.toFixed(2)}</code> is Successfully Processed!🔥🔥\n\n🏦 Destination ==> <code>${wd.details}</code>\n🚀 Transaction ID ==> <code>${wd.txnNumber}</code>\n🗓 Date ==> ${formatDateTime(processTime)}\n\n✅ Please Check Your ${wd.method} Account!`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl) }); } catch (e) { }
  await ctx.editMessageText(
    `✅ <b>Approved!</b>\n\n👤 User: <a href="tg://user?id=${wd.userId}">${wd.userId}</a>\n💰 ₹${wd.amount}\n🆔 <code>${wd.txnNumber}</code>`,
    { parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wdId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wdId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  let processTime = new Date();
  let adminTag = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.status = "Rejected";
  wd.approvedBy = adminTag;
  wd.approvedAt = processTime;
  await wd.save();
  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, "Withdrawal Refunded", wd.amount);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try { await bot.api.sendMessage(wd.userId, `❌ <b>Withdrawal Rejected</b>\n\n💰 ₹${wd.amount.toFixed(2)}\n💵 Refunded: ₹${user.balance.toFixed(2)}`, { parse_mode: "HTML" }); } catch (e) { }
  await ctx.editMessageText(
    `❌ <b>Rejected!</b>\n\n👤 User: <a href="tg://user?id=${wd.userId}">${wd.userId}</a>\n💰 ₹${wd.amount}`,
    { parse_mode: "HTML" }
  ).catch(() => { });
});

bot.callbackQuery("set_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "SET_UPI_ACC";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 Send your UPI ID:\n\nExample: <code>yourname@upi</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }).catch(() => { });
});

bot.callbackQuery("set_wallet_number", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "SET_WALLET_NUMBER";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📝 Send your Wallet Number:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }).catch(() => { });
});

bot.callbackQuery("set_bank", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  userState[ctx.from.id] = "SET_BANK_ACCNO";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`🏦 Send Your Bank Account Number:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "btn_payout_back") }).catch(() => { });
});

bot.callbackQuery("btn_payout_back", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  delete userState[ctx.from.id];
  await sendPayoutMethodPage(ctx, true);
});

bot.callbackQuery("back_to_withdraw", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  delete userState[ctx.from.id];
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let buttons = await buildWithdrawMenu();
  if (buttons.length === 0) {
    return ctx.editMessageText(`<b>${toSmallCaps("Choose Withdraw Method")}</b>\n\n❌ ${toSmallCaps("No withdraw methods available.")}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance") }).catch(() => { });
  }
  await ctx.editMessageText(`<b>${toSmallCaps("Choose Withdraw Method")}</b>`, { reply_markup: await buildStyledKb(buttons), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("wd_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  delete userState[ctx.from.id];
  await sendBalancePage(ctx, true);
});

bot.callbackQuery(/^wd_gw_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  let gwName = ctx.callbackQuery.data.replace("wd_gw_", "");
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.answerCallbackQuery({ text: "Gateway not available", show_alert: true }).catch(() => { });
  let user = await getUser(userId);
  let wallet = user.walletNumber || "";
  if (!wallet) {
    userState[userId] = `GW_NUMBER_${gwName}`;
    let kb = new Keyboard().text("Cancel").resized().oneTime();
    return ctx.reply(`Enter Withdraw Amount`, { reply_markup: kb }).catch(() => { });
  }
  userState[userId] = `GW_AMOUNT_${gwName}`;
  let kb = new Keyboard().text("Cancel").resized().oneTime();
  await ctx.reply(`Enter Withdraw Amount`, { reply_markup: kb }).catch(() => { });
});

bot.callbackQuery(/^gw_conf_yes_/, async (ctx) => {
  let userId = ctx.from.id;
  let data = ctx.callbackQuery.data.replace("gw_conf_yes_", "");
  let parts = data.split("_");
  let amount = parseFloat(parts.pop());
  let gwName = parts.join("_");
  await ctx.answerCallbackQuery({ text: "Processing..." }).catch(() => { });
  delete userState[userId];
  let user = await getUser(userId);
  let gateway = await Gateway.findOne({ name: gwName, isActive: true });
  if (!gateway) return ctx.editMessageText(`❌ Gateway not found.`, { parse_mode: "HTML" }).catch(() => { });
  let minW = gateway.minAmount || 0;
  let maxW = gateway.maxAmount || 0;
  if (minW > 0 && amount < minW) return ctx.editMessageText(`❌ Minimum: ₹${minW}`, { parse_mode: "HTML" }).catch(() => { });
  if (maxW > 0 && amount > maxW) return ctx.editMessageText(`❌ Maximum: ₹${maxW}`, { parse_mode: "HTML" }).catch(() => { });
  if (user.balance < amount) return ctx.editMessageText(`❌ Insufficient balance!`, { parse_mode: "HTML" }).catch(() => { });
  let wallet = user.walletNumber || "";
  if (!wallet) return ctx.editMessageText(`❌ Number not saved!`, { parse_mode: "HTML" }).catch(() => { });
  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawn via ${gwName} (Bot)`, -amount);
  let approvedCount = await Withdrawal.countDocuments({ userId, status: "Approved" });
  let userWithdrawalCount = approvedCount + 1;
  let withdrawalId = Math.floor(100000 + Math.random() * 900000).toString();
  let payoutChannel = await getPayoutChannel(gwName);
  let channelList = payoutChannel && payoutChannel !== "Not Set" ? [payoutChannel] : [];
  let msgId = ctx.callbackQuery.message.message_id;
  let chatId = ctx.chat.id;
  await ctx.editMessageText(`⏳ ${toSmallCaps("Processing")}\n\n${buildProcessingDots(0)}`, { parse_mode: "HTML" }).catch(() => { });
  let animFrame = 1;
  const animInterval = setInterval(async () => {
    try { await ctx.api.editMessageText(chatId, msgId, `⏳ ${toSmallCaps("Processing")}\n\n${buildProcessingDots(animFrame)}`, { parse_mode: "HTML" }); } catch (e) { }
    animFrame++;
  }, 400);
  let result = await processGatewayPayout({ bot, userId, amount, gatewayInfo: gateway, wallet, channelList, showRemainingBalance: true });
  clearInterval(animInterval);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  if (result.status === "success") {
    let txnNumber = result.txnNumber || generateTxnNumber();
    let processTime = new Date();
    await Withdrawal.create({ withdrawalId, userId, userWithdrawalCount, amount, method: gwName, details: wallet, status: "Approved", isGateway: true, gatewayName: gateway.name, gatewayResponse: result.rawResponse || "", txnNumber, approvedBy: "Auto Gateway", approvedAt: processTime });
    await LiveFund.findOneAndUpdate({ key: "main_fund" }, { $inc: { usedFund: amount } }, { upsert: true });
    let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
    let receiptUrl = `${serverUrl}/receipt/${withdrawalId}`;
    await ctx.api.editMessageText(chatId, msgId,
      `✅ <b>${toSmallCaps("Withdrawal Successful!")}</b>\n\n💰 ${toSmallCaps("Amount")}: ₹${amount.toFixed(2)}\n👛 ${toSmallCaps("Wallet")}: <code>${wallet}</code>\n🆔 ${toSmallCaps("TXN")}: <code>${txnNumber}</code>\n📅 ${formatDateTime(processTime)}\n\n💵 ${toSmallCaps("New Balance")}: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("✅ Check Status", receiptUrl).row().text(makeBtn("Menu"), "back_to_balance") }
    ).catch(() => { });
  } else {
    user.balance += amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
    await user.save();
    await logBalanceHistory(userId, "Withdrawal Failed (Refunded)", amount);
    await ctx.api.editMessageText(chatId, msgId,
      `❌ <b>${toSmallCaps("Withdrawal Failed")}</b>\n\n💰 ₹${amount.toFixed(2)}\n📛 ${result.message || "Gateway error"}\n\n💵 ${toSmallCaps("Refunded")}: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Menu"), "back_to_balance") }
    ).catch(() => { });
  }
});

bot.callbackQuery("gw_conf_no", async (ctx) => {
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  delete userState[ctx.from.id];
  await sendBalancePage(ctx, true);
});

// ============ USER DEPOSIT CALLBACKS (deposit step callbacks) ============
bot.callbackQuery(/^dep_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("dep_app_", "");
  let req = await DepositRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  req.status = "Approved";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();
  let user = await getUser(req.userId);
  user.balance += req.amount;
  await user.save();
  await DepositGateway.updateOne({ gatewayId: req.gatewayId }, { $inc: { manualApproved: 1, pending: -1, totalDeposited: req.amount } });
  await logBalanceHistory(req.userId, `Manual Deposit (${req.gatewayName})`, req.amount);
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Manual Deposit Approved", `₹${req.amount}`, req.amount, req.userId);
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  try { await ctx.api.sendMessage(req.userId, `✅ <b>${toSmallCaps("Deposit Approved!")}</b>\n\n💰 ${toSmallCaps("Amount")}: ₹${req.amount.toFixed(2)}\n💵 ${toSmallCaps("New Balance")}: ₹${user.balance.toFixed(2)}`, { parse_mode: "HTML" }); } catch (e) { }
  await ctx.editMessageText(`✅ <b>Approved!</b>\n\n🆔 <code>${reqId}</code>\n💰 ₹${req.amount.toFixed(2)}`, { parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^dep_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("dep_rej_", "");
  let req = await DepositRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed", show_alert: true });
  req.status = "Rejected";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();
  await DepositGateway.updateOne({ gatewayId: req.gatewayId }, { $inc: { rejected: 1, pending: -1 } });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Manual Deposit Rejected", `₹${req.amount}`, req.amount, req.userId);
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try { await ctx.api.sendMessage(req.userId, `❌ <b>${toSmallCaps("Deposit Rejected")}</b>\n\n💰 ₹${req.amount.toFixed(2)}`, { parse_mode: "HTML" }); } catch (e) { }
  await ctx.editMessageText(`❌ <b>Rejected!</b>\n\n🆔 <code>${reqId}</code>`, { parse_mode: "HTML" }).catch(() => { });
});

// ============ ADMIN TEXT INPUT HANDLER ============
async function handleAdminTextInput(ctx, text, userId, state) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  if (!(await isAdmin(userId))) return false;

  if (state === "WAITING_ADMIN_ADD") {
    delete userState[userId];
    let input = text.trim();
    if (!input) return true;
    let targetUser = null;
    if (/^\d+$/.test(input)) targetUser = await User.findOne({ userId: parseInt(input, 10) });
    else if (input.startsWith("@") || /^[a-zA-Z0-9_]{5,32}$/.test(input)) {
      let cleanUsername = input.replace(/^@/, '').toLowerCase();
      targetUser = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } });
    }
    if (!targetUser) {
      await ctx.reply(`❌ User not found! Send a valid User ID or @username.`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_permissions") });
      return true;
    }
    let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
    if (Number(targetUser.userId) === Number(ownerId)) {
      await ctx.reply(`❌ This user is already the Owner!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_permissions") });
      return true;
    }
    await BotAdmin.findOneAndUpdate({ userId: targetUser.userId }, { addedAt: new Date(), addedBy: userId, isActive: true, disabledAt: null, disabledBy: null }, { upsert: true, new: true });
    await logAdminAction(userId, ctx.from.first_name || "Owner", "Admin Added", `${targetUser.userId}`, 0, targetUser.userId);
    await ctx.reply(`✅ Admin added successfully!\n\n👤 ${targetUser.firstName || "User"}\n🆔 <code>${targetUser.userId}</code>\n\nThey can now use /admin`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_permissions") });
    return true;
  }

  if (state === "WAITING_NEW_OWNER") {
    delete userState[userId];
    let newOwnerId = parseInt(text.trim(), 10);
    if (isNaN(newOwnerId)) { await ctx.reply(`❌ Invalid ID!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let targetUser = await User.findOne({ userId: newOwnerId });
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    await ctx.reply(`⚠️ <b>Confirm Transfer?</b>\n\n👑 New Owner: ${targetUser.firstName || "User"}\n🆔 <code>${newOwnerId}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Confirm ✅"), `admin_transfer_confirm_${newOwnerId}`).row().text(makeBtn("Cancel"), "admin") });
    return true;
  }

  if (state === "WAITING_TAX_PERCENT") {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) { await ctx.reply(`❌ Tax must be 0-50%!`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_set_wd_tax") }); return true; }
    await setConfig("tax_percent", amt);
    await ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_set_wd_tax") });
    return true;
  }

  if (state === "WAITING_QUICK_PAY_TAX") {
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) { await ctx.reply(`❌ Tax must be 0-50%!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_quick_pay") }); return true; }
    await setConfig("quick_pay_tax_percent", amt);
    await ctx.reply(`✅ Quick Pay Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_quick_pay") });
    return true;
  }

  if (state === "BAN_USER_WAIT") {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) { await ctx.reply(`❌ Invalid!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") }); return true; }
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") }); return true; }
    targetUser.isBanned = true;
    await targetUser.save();
    await logAdminAction(userId, ctx.from.first_name || "Admin", "User Banned", `${targetId}`, 0, targetId);
    try { await ctx.api.sendMessage(targetId, `🚫 ${toSmallCaps("You have been banned from using this bot.")}`, { parse_mode: "HTML" }); } catch (e) { }
    await ctx.reply(`✅ User ${targetId} BANNED`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") });
    return true;
  }

  if (state === "UNBAN_USER_WAIT") {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) { await ctx.reply(`❌ Invalid!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") }); return true; }
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") }); return true; }
    targetUser.isBanned = false;
    await targetUser.save();
    await logAdminAction(userId, ctx.from.first_name || "Admin", "User Unbanned", `${targetId}`, 0, targetId);
    try { await ctx.api.sendMessage(targetId, `✅ ${toSmallCaps("You have been unbanned. Welcome back!")}`, { parse_mode: "HTML" }); } catch (e) { }
    await ctx.reply(`✅ User ${targetId} UNBANNED`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban") });
    return true;
  }

  if (state === "BAN_WALLET_WAIT") {
    delete userState[userId];
    await setConfig("banned_wallet", text);
    await ctx.reply(`✅ Wallet Banned: ${text}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_ban_wallet") });
    return true;
  }

  if (state === "WAITING_FOR_ADD_BAL") {
    delete userState[userId];
    let parts = text.trim().split(/\s+/).filter(p => p !== "");
    if (parts.length < 2) { await ctx.reply(`❌ Format: <code>UserID/@username Amount</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let input = parts[0].trim();
    let amount = parseFloat(parts[parts.length - 1]);
    if (isNaN(amount) || amount <= 0) { await ctx.reply(`❌ Invalid amount!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let targetUser = null;
    if (/^\d+$/.test(input)) targetUser = await User.findOne({ userId: parseInt(input, 10) });
    else { let cleanUsername = input.replace(/^@/, '').toLowerCase(); targetUser = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }); }
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    targetUser.balance += amount;
    await targetUser.save();
    await logBalanceHistory(targetUser.userId, "Admin Added Balance", amount);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Added Balance", `+₹${amount} to ${targetUser.userId}`, amount, targetUser.userId);
    try { await ctx.api.sendMessage(targetUser.userId, `💰 ${toSmallCaps("Admin Gave You A Increase In Balance By")} ${amount}`, { parse_mode: "HTML" }); } catch (e) { }
    await ctx.reply(`💸 Admin Added ₹${amount.toFixed(2)}\n\n👤 User: ${targetUser.firstName || "User"} (<code>${targetUser.userId}</code>)\n💰 Now Balance: ${formatBalance(targetUser.balance)}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") });
    return true;
  }

  if (state === "WAITING_FOR_REM_BAL") {
    delete userState[userId];
    let parts = text.trim().split(/\s+/).filter(p => p !== "");
    if (parts.length < 2) { await ctx.reply(`❌ Format: <code>UserID/@username Amount</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let input = parts[0].trim();
    let amount = parseFloat(parts[parts.length - 1]);
    if (isNaN(amount) || amount <= 0) { await ctx.reply(`❌ Invalid amount!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let targetUser = null;
    if (/^\d+$/.test(input)) targetUser = await User.findOne({ userId: parseInt(input, 10) });
    else { let cleanUsername = input.replace(/^@/, '').toLowerCase(); targetUser = await User.findOne({ username: { $regex: new RegExp("^" + cleanUsername + "$", "i") } }); }
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    targetUser.balance -= amount;
    await targetUser.save();
    await logBalanceHistory(targetUser.userId, "Admin Removed Balance", -amount);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Removed Balance", `-₹${amount} from ${targetUser.userId}`, amount, targetUser.userId);
    try { await ctx.api.sendMessage(targetUser.userId, `💰 ${toSmallCaps("Admin Gave You A Decrease In Balance By")} ${amount}`, { parse_mode: "HTML" }); } catch (e) { }
    await ctx.reply(`💸 Admin Removed ₹${amount.toFixed(2)}\n\n👤 User: ${targetUser.firstName || "User"} (<code>${targetUser.userId}</code>)\n💰 Now Balance: ${formatBalance(targetUser.balance)}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") });
    return true;
  }

  if (state === "WAITING_FOR_TRACKER_ID") {
    delete userState[userId];
    let targetId = parseInt(text, 10);
    if (isNaN(targetId)) { await ctx.reply(`❌ Invalid!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    let targetUser = await User.findOne({ userId: targetId });
    if (!targetUser) { await ctx.reply(`❌ User not found!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "admin") }); return true; }
    await ctx.reply(`👤 Loading user <code>${targetId}</code>...`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("View Details"), `user_detail_${targetId}`) });
    return true;
  }

  if (state === "WAITING_FOR_USER_MESSAGE") {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length < 2) { await ctx.reply(`❌ Format: <code>UserID | Message</code>`, { parse_mode: "HTML" }); return true; }
    let targetId = parseInt(parts[0], 10);
    let message = parts.slice(1).join("|").trim();
    if (isNaN(targetId)) { await ctx.reply(`❌ Invalid User ID!`); return true; }
    try { await ctx.api.sendMessage(targetId, `📨 <b>${toSmallCaps("Admin Message")}</b>\n\n${message}`, { parse_mode: "HTML" }); await ctx.reply(`✅ Sent to <code>${targetId}</code>!`, { parse_mode: "HTML" }); }
    catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
    return true;
  }

  if (state === "ADD_CHANNEL_WAIT") {
    delete userState[userId];
    let channelId = text.trim();
    if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) { await ctx.reply(`❌ Invalid Channel ID!`); return true; }
    let existing = await Channel.findOne({ channelId });
    if (existing) { await ctx.reply(`❌ Channel already added!`); return true; }
    try {
      let chatInfo = await ctx.api.getChat(channelId);
      let botInfo = await ctx.api.getMe();
      let botMember = await ctx.api.getChatMember(channelId, botInfo.id);
      if (!["administrator", "creator"].includes(botMember.status)) { await ctx.reply(`❌ Bot must be admin in channel!`); return true; }
      let inviteLink = "";
      try { if (chatInfo.invite_link) inviteLink = chatInfo.invite_link; else { let link = await ctx.api.createChatInviteLink(channelId, { name: "Auto", creates_join_request: false }); inviteLink = link.invite_link; } } catch (e) { }
      let maxOrder = await Channel.findOne({}).sort({ order: -1 }).lean();
      let newOrder = (maxOrder?.order || 0) + 1;
      await Channel.create({ channelId, inviteLink: inviteLink || `https://t.me/${channelId.replace("@", "")}`, displayName: chatInfo.title || channelId, isActive: true, isHidden: false, order: newOrder });
      await logAdminAction(userId, ctx.from.first_name || "Admin", "Channel Added", channelId, 0, null);
      await ctx.reply(`✅ Added Successfully!\n\n📢 ${chatInfo.title || channelId}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_channels") });
    } catch (e) { await ctx.reply(`❌ Cannot access channel! ${e.message}`); return true; }
    return true;
  }

  if (state === "SET_PAYOUT_CHANNEL") {
    delete userState[userId];
    let channelId = text.trim();
    if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) { await ctx.reply(`❌ Invalid!`); return true; }
    try {
      let chatInfo = await ctx.api.getChat(channelId);
      let botInfo = await ctx.api.getMe();
      let botMember = await ctx.api.getChatMember(channelId, botInfo.id);
      if (!["administrator", "creator"].includes(botMember.status)) { await ctx.reply(`❌ Bot must be admin!`); return true; }
    } catch (e) { await ctx.reply(`❌ Cannot access: ${e.message}`); return true; }
    await setConfig("payout_channel", channelId);
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Set Payout Channel", channelId, 0, null);
    await ctx.reply(`✅ Successfully Set!\n\n📢 Payout Channel:\n<code>${channelId}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_channels") });
    return true;
  }

  if (state === "ADD_SOCIAL_LINK") {
    delete userState[userId];
    let parts = text.split("|").map(p => p.trim());
    if (parts.length !== 2) { await ctx.reply(`❌ Format: <code>Name | Link</code>`, { parse_mode: "HTML" }); return true; }
    await SocialLink.create({ name: parts[0], link: parts[1] });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Social Link Added", parts[0], 0, null);
    await ctx.reply(`✅ Added!\n\n🔗 ${parts[0]}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_manage_channels") });
    return true;
  }

  // ============ AUTO UPI INPUTS ============
  if (state === "AUPI_SET_ID") {
    delete userState[userId];
    let upi = text.trim();
    if (!upi.includes("@")) { await ctx.reply(`❌ Invalid UPI!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }); return true; }
    await AutoUpi.findOneAndUpdate({ key: "main_upi" }, { upiId: upi, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ UPI ID set: <code>${upi}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
    return true;
  }

  if (state === "AUPI_SET_NAME") {
    delete userState[userId];
    await AutoUpi.findOneAndUpdate({ key: "main_upi" }, { payeeName: text.trim(), updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Payee name: ${text.trim()}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
    return true;
  }

  if (state === "AUPI_SET_LIMITS") {
    delete userState[userId];
    let parts = text.split("-").map(p => parseFloat(p.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] < 0 || parts[1] < parts[0]) {
      await ctx.reply(`❌ Format: <code>MIN-MAX</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
      return true;
    }
    await AutoUpi.findOneAndUpdate({ key: "main_upi" }, { minAmount: parts[0], maxAmount: parts[1], updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Limits: ₹${parts[0]} - ₹${parts[1]}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
    return true;
  }

  if (state === "AUPI_SET_TAX") {
    delete userState[userId];
    let tax = parseFloat(text);
    if (isNaN(tax) || tax < 0 || tax > 20) { await ctx.reply(`❌ Tax must be 0-20%!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }); return true; }
    await AutoUpi.findOneAndUpdate({ key: "main_upi" }, { taxPercent: tax, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Tax: ${tax}%`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
    return true;
  }

  if (state === "AUPI_SET_API") {
    delete userState[userId];
    let raw = text.trim();
    if (!raw) { await ctx.reply(`❌ Empty!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }); return true; }
    let parts = raw.split("|");
    let apiUrl = (parts[0] || "").trim();
    let apiKey = (parts[1] || "").trim();
    if (apiUrl && !apiUrl.startsWith("http")) { await ctx.reply(`❌ API URL must start with http!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") }); return true; }
    await AutoUpi.findOneAndUpdate({ key: "main_upi" }, { apiUrl, apiKey, updatedAt: new Date() }, { upsert: true });
    await ctx.reply(`✅ Verify API saved!\n\n🔌 URL: <code>${apiUrl || "(none)"}</code>\n🔑 Key: <code>${apiKey ? "Set" : "None"}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_auto_upi") });
    return true;
  }

  // ============ GATEWAY INPUTS ============
  if (state.startsWith("GW_WAIT_NAME_V2")) {
    let gwName = text.toUpperCase().replace(/\s+/g, "_");
    if (gwName.length < 2) { await ctx.reply(`❌ Name too short!`); return true; }
    let existing = await Gateway.findOne({ name: gwName });
    if (existing) { delete userState[userId]; await ctx.reply(`❌ Gateway already exists!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_gateway_menu") }); return true; }
    userState[userId] = `GW_WAIT_URL_V2_${gwName}`;
    await ctx.reply(`✅ Name: <b>${gwName}</b>\n\n🔗 Paste Your Gateway URL:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_gateway_menu") });
    return true;
  }

  if (state.startsWith("GW_WAIT_URL_V2_")) {
    let gwName = state.replace("GW_WAIT_URL_V2_", "");
    if (!text.startsWith("http://") && !text.startsWith("https://")) { await ctx.reply(`❌ URL must start with http`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_gateway_menu") }); return true; }
    delete userState[userId];
    await Gateway.create({ name: gwName, url: text.trim(), url_template: text.trim(), isActive: true, minAmount: 0, maxAmount: 0, taxPercent: 0, createdBy: userId });
    await logAdminAction(userId, ctx.from.first_name || "Admin", "Gateway Added", gwName, 0, null);
    await ctx.reply(`✅ Gateway Created!\n\n📛 ${gwName}\n🟢 ON`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_gateway_menu") });
    return true;
  }

  if (state.startsWith("GW_EDIT_URL_")) {
    let gwName = state.replace("GW_EDIT_URL_", "");
    delete userState[userId];
    if (!text.startsWith("http")) { await ctx.reply(`❌ Invalid URL!`); return true; }
    await Gateway.findOneAndUpdate({ name: gwName }, { url: text.trim(), url_template: text.trim(), updatedAt: new Date() });
    await ctx.reply(`✅ Gateway Updated!`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_view_${gwName}`) });
    return true;
  }

  if (state.startsWith("GW_MIN_")) {
    let gwName = state.replace("GW_MIN_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) { await ctx.reply(`❌ Invalid!`); return true; }
    await Gateway.updateOne({ name: gwName }, { minAmount: amt, updatedAt: new Date() });
    await ctx.reply(`✅ Min: ₹${amt}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${gwName}`) });
    return true;
  }

  if (state.startsWith("GW_MAX_")) {
    let gwName = state.replace("GW_MAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0) { await ctx.reply(`❌ Invalid!`); return true; }
    await Gateway.updateOne({ name: gwName }, { maxAmount: amt, updatedAt: new Date() });
    await ctx.reply(`✅ Max: ₹${amt}`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${gwName}`) });
    return true;
  }

  if (state.startsWith("GW_TAX_")) {
    let gwName = state.replace("GW_TAX_", "");
    delete userState[userId];
    let amt = parseFloat(text);
    if (isNaN(amt) || amt < 0 || amt > 50) { await ctx.reply(`❌ Tax must be 0-50%!`); return true; }
    await Gateway.updateOne({ name: gwName }, { taxPercent: amt, updatedAt: new Date() });
    await ctx.reply(`✅ Tax: ${amt}%`, { reply_markup: new InlineKeyboard().text(makeBtn("Back"), `gw_edit_${gwName}`) });
    return true;
  }

  return false;
}

// ============ TASK MANAGER, GIFT CODES, QUICKPAY, DEPOSIT PANEL, BROADCAST, PAYOUT MENU ============
// (These are the same as your original file — inserted below)

// Task manager, gift code, deposit step panel, status pages, etc.
// I'm including the ESSENTIAL handlers — full code continues below

bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

async function renderTaskManager(ctx) {
  const pad = "\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let tasks = await Task.find({ isComplete: true }).sort({ createdAt: -1 }).lean();
  let text = `💡 <b>Here You Can Manage Your Tasks</b>\n\nSelect a task to view, edit, or delete it.`;
  let kb = new InlineKeyboard();
  if (tasks.length === 0) kb.text(makeBtn("No Tasks"), "noop").row();
  else {
    for (let t of tasks) {
      let shortName = t.title.length > 12 ? t.title.substring(0, 12) + ".." : t.title;
      let statusIcon = t.isActive !== false ? "🟢" : "🔴";
      kb.text(`📄 ${shortName}`, `view_task_${t.taskId}`).text("✏️", `edit_task_${t.taskId}`).text("🗑️", `del_task_${t.taskId}`).text(statusIcon, `toggle_task_${t.taskId}`).row();
    }
  }
  kb.text(makeBtn("➕ Add New Task"), "adm_create_task").text(makeBtn("Search Task"), "adm_search_task").row();
  kb.text(makeBtn("➕ Add Channel For Task Alert"), "adm_task_alert_channel").row();
  kb.text(makeBtn("⬅️ Back"), "admin");
  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery("adm_status", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let pendingCount = await Withdrawal.countDocuments({ status: "Pending" });
  let pendingDeposit = await DepositRequest.countDocuments({ status: "Pending" });
  let text = `<b>Status</b>\n\n👇 Choose option:`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Live Balance Tracker"), "status_live_tracker").row()
    .text(makeBtn("Users List"), "status_users_list").row()
    .text(makeBtn("Live Fund"), "status_live_fund").row()
    .text(makeBtn("New Users"), "adm_new_users").row()
    .text(makeBtn(`Withdraw Requests (${pendingCount})`), "status_wd_requests").row()
    .text(makeBtn(`Deposit Requests (${pendingDeposit})`), "status_dep_requests").row()
    .text(makeBtn("Withdraw Stats"), "status_wd_stats").row()
    .text(makeBtn("Back to Admin"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("status_wd_requests", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let withdrawals = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(30).lean();
  if (withdrawals.length === 0) return ctx.editMessageText(`<b>Withdraw Requests</b>\n\n<blockquote>No pending requests</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_status") }).catch(() => { });
  let bodyText = `Pending: ${withdrawals.length}\n\nClick to approve:`;
  let kb = new InlineKeyboard();
  for (let w of withdrawals) {
    let u = await User.findOne({ userId: w.userId }).lean();
    let name = u?.firstName || "User";
    let label = `${name} — ₹${w.amount} (${w.method})`;
    if (label.length > 30) label = label.substring(0, 30) + "..";
    kb.text(makeBtn(label), `status_wd_view_${w.withdrawalId}`).row();
  }
  kb.text(makeBtn("Back"), "adm_status");
  await ctx.editMessageText(`<b>Withdraw Requests</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("status_dep_requests", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let deposits = await DepositRequest.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(30).lean();
  if (deposits.length === 0) return ctx.editMessageText(`<b>Deposit Requests</b>\n\n<blockquote>No pending requests</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_status") }).catch(() => { });
  let bodyText = `Pending: ${deposits.length}\n\nClick to view:`;
  let kb = new InlineKeyboard();
  for (let d of deposits) {
    let u = await User.findOne({ userId: d.userId }).lean();
    let name = u?.firstName || "User";
    let label = `${name} — ₹${d.amount} (${d.gatewayName})`;
    if (label.length > 30) label = label.substring(0, 30) + "..";
    kb.text(makeBtn(label), `dep_req_${d.requestId}`).row();
  }
  kb.text(makeBtn("Back"), "adm_status");
  await ctx.editMessageText(`<b>Deposit Requests</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery(/^status_wd_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let wdId = ctx.callbackQuery.data.replace("status_wd_view_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wdId }).lean();
  if (!wd) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  let maskedDetails = halfMaskDetails(wd.method, wd.details);
  let methodDisplay = wd.method.toUpperCase();
  let text =
    `⚠️ <b>New ${methodDisplay} Payout Request!</b> <code>(#${wd.userWithdrawalCount})</code>\n\n` +
    `👤 <b>User:</b> <a href="tg://user?id=${wd.userId}">${wd.userId}</a>\n` +
    `💰 <b>Request Amount:</b> <b>₹${wd.amount}</b>\n` +
    `📌 <b>${methodDisplay} ID:</b> <code>${maskedDetails}</code>\n\n` +
    `📊 <b>Status:</b> ⏳ Pending`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Approve ✅"), `wd_app_${wd.withdrawalId}`).row()
    .text(makeBtn("Reject ❌"), `wd_rej_${wd.withdrawalId}`).row()
    .text(makeBtn("Back"), "status_wd_requests");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

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
  await ctx.editMessageText(`<b>Quick Pay Tax</b>\n\n📊 Status: ${enabled ? "🟢 ON" : "🔴 OFF"}\n💸 Tax: ${percent}%`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("adm_set_qp_tax", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_QUICK_PAY_TAX";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💸 Send tax % (0-50):`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "adm_quick_pay") });
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

bot.callbackQuery("qp_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.quickPayCache) delete global.quickPayCache[userId];
  ctx.answerCallbackQuery({ text: "Cancelled!" }).catch(() => { });
  await sendBalancePage(ctx, true);
});

bot.callbackQuery("qp_retry", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => { });
  let userId = ctx.from.id;
  userState[userId] = "QP_WAIT_INPUT";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`💡 ${toSmallCaps("Send payments format")}\n\n<code>${userId} 1</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "qp_cancel") }).catch(() => { });
});

bot.callbackQuery("qp_confirm_multi", async (ctx) => {
  let userId = ctx.from.id;
  let cacheObj = global.quickPayCache?.[userId];
  if (!cacheObj || !cacheObj.payments || cacheObj.payments.length === 0) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  let payments = cacheObj.payments;
  let totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  delete userState[userId];
  delete global.quickPayCache[userId];
  let sender = await getUser(userId);
  let isPrivileged = (await isAdmin(userId)) || (await isOwner(userId));
  if (!isPrivileged && sender.balance < totalAmount) return ctx.answerCallbackQuery({ text: "Insufficient!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "Processing..." });
  let senderBefore = sender.balance;
  if (!isPrivileged) { sender.balance -= totalAmount; await sender.save(); await logBalanceHistory(sender.userId, `Quick Pay (${payments.length} payments)`, -totalAmount); }
  let resultList = [];
  for (let p of payments) {
    let receiver = await User.findOne({ userId: p.receiver.userId });
    if (!receiver) continue;
    let before = receiver.balance;
    receiver.balance += p.amount;
    await receiver.save();
    await logBalanceHistory(receiver.userId, `Quick Pay from ${isPrivileged ? "Admin" : sender.userId}`, p.amount);
    resultList.push({ userId: receiver.userId, firstName: receiver.firstName || "User", amount: p.amount, before, after: receiver.balance });
    try { await ctx.api.sendMessage(receiver.userId, `💸 ${toSmallCaps("You Received")} ₹${p.amount.toFixed(2)} ${toSmallCaps("From")} <a href="tg://user?id=${sender.userId}">${escapeHtml(sender.firstName || "User")}</a>`, { parse_mode: "HTML" }); } catch (e) { }
  }
  let bodyText = "";
  resultList.forEach((r, i) => { bodyText += `${i + 1}. ${r.firstName} (${r.userId})\nAmount: ₹${r.amount}\n\n`; });
  bodyText += `Total: ₹${totalAmount.toFixed(2)}`;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>${toSmallCaps("Payment Successful")}</b>\n\n<blockquote>${bodyText}</blockquote>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "back_to_balance") }).catch(() => { });
});

bot.callbackQuery("refresh_balance_only", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Refreshed!" }).catch(() => { });
  try { await sendBalancePage(ctx, true); } catch (e) { }
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => { });
  delete userState[ctx.from.id];
  try { await sendBalancePage(ctx, true); } catch (e) { }
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let userId = ctx.from.id;
  await ctx.answerCallbackQuery().catch(() => { });
  let history = await BalanceHistory.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
  let user = await getUser(userId);
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `${toSmallCaps("Wallet ID")}: ${userId}\n${toSmallCaps("Balance")}: ${formatBalance(user.balance)}\n\n`;
  if (history.length === 0) bodyText += `📭 No transactions.`;
  else {
    let totalIn = 0, totalOut = 0;
    history.forEach((h) => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      bodyText += `${icon} ${h.action}\n   ${sign}₹${h.amount.toFixed(2)} • ${formatDateTime(h.createdAt)}\n\n`;
      if (h.amount >= 0) totalIn += h.amount; else totalOut += Math.abs(h.amount);
    });
    bodyText += `━━━━━━━━━━━━━━━━━━━━\n🟢 Earned: ₹${totalIn.toFixed(2)}\n🔴 Spent: ₹${totalOut.toFixed(2)}`;
  }
  let kb = new InlineKeyboard().text(makeBtn("Refresh"), "balance_statement").row().text(makeBtn("Back"), "back_to_balance");
  await ctx.editMessageText(`<b>${toSmallCaps("Balance Statement")}</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Loading..." });
  let users = await User.find({}).lean();
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance; });
  let liveFund = await LiveFund.findOne({ key: "main_fund" }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `Users: ${users.length}\nTotal: ₹${totalBalance.toFixed(2)}`;
  if (liveFund && liveFund.isActive) {
    let running = (liveFund.totalFund || 0) - (liveFund.usedFund || 0);
    bodyText += `\n\nLive Fund:\n💰 Set Fund: ₹${(liveFund.totalFund || 0).toFixed(2)}\n📉 Running: ₹${running.toFixed(2)}\n📊 Used: ₹${(liveFund.usedFund || 0).toFixed(2)}`;
  }
  let kb = new InlineKeyboard().text(makeBtn("Refresh"), "live_fund").row().text(makeBtn("Back"), "back_to_balance");
  await ctx.editMessageText(`<b>${toSmallCaps("Live Fund Report")}</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery({ text: "No tasks", show_alert: false }).catch(() => { }); });

bot.callbackQuery("adm_deposit_steps", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let gateways = await DepositGateway.find({}).sort({ order: 1, createdAt: 1 }).lean();
  let text = `📥 <b>Deposit Management</b>\n\n`;
  if (gateways.length === 0) text += `⚠️ No Deposit Gateways. Click + Add Gateway.`;
  else {
    text += `Manage all Deposit gateways:\n\n`;
    for (let gw of gateways) {
      let statusIcon = gw.status === "active" ? "🟢" : (gw.status === "temp_off" ? "🟡" : "🔴");
      text += `${statusIcon} <b>${gw.name}</b> [${gw.method}]\n`;
      text += `   Min: ₹${gw.minAmount} | Max: ₹${gw.maxAmount}\n`;
      text += `   Tax: ₹${gw.tax} | Number: ${gw.upiOrNumber}\n`;
      text += `   Deposits: ${gw.totalDeposits} | ₹${gw.totalDeposited.toFixed(2)}\n\n`;
    }
  }
  let kb = new InlineKeyboard();
  for (let gw of gateways) {
    let shortName = gw.name.length > 8 ? gw.name.substring(0, 8) + ".." : gw.name;
    let statusButtonIcon = gw.status === "active" ? "✅" : gw.status === "temp_off" ? "⏳" : "🚫";
    kb.text(`📥 ${shortName}`, `dep_name_${gw.gatewayId}`).text("✏️", `dep_edit_${gw.gatewayId}`).text(statusButtonIcon, `dep_status_${gw.gatewayId}`).text("🗑️", `dep_del_${gw.gatewayId}`).row();
  }
  kb.text(makeBtn("➕ Add Gateway"), "dep_add").row();
  kb.text(makeBtn("⬅️ Back"), "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
});

// ============ TASK MANAGER INPUTS (basic) ============
bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let newTaskId = "T" + Date.now().toString().slice(-10);
  global.taskCreation = global.taskCreation || {};
  global.taskCreation[ctx.from.id] = { taskId: newTaskId, title: null, reward: null, link: null, description: null, expiryMinutes: null };
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`<b>Task ID Auto-Generated</b>\n\n<code>${newTaskId}</code>`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Create Task"), "task_create_start").row().text(makeBtn("Back"), "adm_tasks_manager") }).catch(() => { });
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
  let bodyText = `Task ID: <code>${temp.taskId}</code>\n\nTask Name: ${temp.title || "Not Set"}\nReward: ${temp.reward ? `₹${temp.reward}` : "Not Set"}\nLink: ${temp.link || "Not Set"}\nTime Limit: ${temp.expiryMinutes ? formatMinutes(temp.expiryMinutes) : "Not Set"}`;
  let kb = new InlineKeyboard()
    .text(makeBtn("Task Name"), "task_field_name").row()
    .text(makeBtn("Reward"), "task_field_reward").row()
    .text(makeBtn("Link"), "task_field_link").row()
    .text(makeBtn("Time Limit"), "task_field_timelimit").row()
    .text(makeBtn("Generate"), "task_field_submit").row()
    .text(makeBtn("Back"), "adm_tasks_manager");
  await ctx.editMessageText(`<b>Create New Task</b>\n\n<blockquote>${bodyText}</blockquote>`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
}

bot.callbackQuery("task_field_name", async (ctx) => { ctx.answerCallbackQuery().catch(() => { }); if (!(await isAdmin(ctx.from.id))) return; userState[ctx.from.id] = "TASK_FIELD_NAME"; const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003"; const makeBtn = (text) => `${pad}${text}${pad}`; await ctx.editMessageText(`Enter Task Name:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start") }).catch(() => { }); });
bot.callbackQuery("task_field_reward", async (ctx) => { ctx.answerCallbackQuery().catch(() => { }); if (!(await isAdmin(ctx.from.id))) return; userState[ctx.from.id] = "TASK_FIELD_REWARD"; const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003"; const makeBtn = (text) => `${pad}${text}${pad}`; await ctx.editMessageText(`Enter Reward (INR):`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start") }).catch(() => { }); });
bot.callbackQuery("task_field_link", async (ctx) => { ctx.answerCallbackQuery().catch(() => { }); if (!(await isAdmin(ctx.from.id))) return; userState[ctx.from.id] = "TASK_FIELD_LINK"; const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003"; const makeBtn = (text) => `${pad}${text}${pad}`; await ctx.editMessageText(`Enter Task Link:`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start") }).catch(() => { }); });
bot.callbackQuery("task_field_timelimit", async (ctx) => { ctx.answerCallbackQuery().catch(() => { }); if (!(await isAdmin(ctx.from.id))) return; const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003"; const makeBtn = (text) => `${pad}${text}${pad}`; let kb = new InlineKeyboard().text(makeBtn("5 Minutes"), "task_tl_5").row().text(makeBtn("30 Minutes"), "task_tl_30").row().text(makeBtn("1 Hour"), "task_tl_60").row().text(makeBtn("Back"), "task_create_start"); await ctx.editMessageText(`Select Task Time Limit:`, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { }); });
bot.callbackQuery(/^task_tl_(\d+)$/, async (ctx) => { ctx.answerCallbackQuery().catch(() => { }); if (!(await isAdmin(ctx.from.id))) return; let minutes = parseInt(ctx.callbackQuery.data.replace("task_tl_", ""), 10); let temp = global.taskCreation?.[ctx.from.id]; if (!temp) return ctx.answerCallbackQuery({ text: "Expired", show_alert: true }); temp.expiryMinutes = minutes; const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003"; const makeBtn = (text) => `${pad}${text}${pad}`; await ctx.editMessageText(`✅ Time Limit: ${formatMinutes(minutes)}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "task_create_start") }).catch(() => { }); });

bot.callbackQuery("task_field_submit", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let temp = global.taskCreation?.[ctx.from.id];
  if (!temp) return ctx.answerCallbackQuery({ text: "Session expired", show_alert: true });
  let missing = [];
  if (!temp.title) missing.push("Task Name");
  if (!temp.reward) missing.push("Reward");
  if (!temp.link) missing.push("Link");
  if (missing.length > 0) return ctx.answerCallbackQuery({ text: `Missing: ${missing.join(", ")}`, show_alert: true });
  let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
  let expiresAt = null;
  if (temp.expiryMinutes && temp.expiryMinutes > 0) expiresAt = new Date(Date.now() + temp.expiryMinutes * 60 * 1000);
  try {
    await Task.create({ taskId: temp.taskId, title: temp.title, reward: temp.reward, link: temp.link, description: temp.description || "", taskType: "photo", alertChannel: alertChannel, isActive: true, isComplete: true, completedUsers: [], expiryMinutes: temp.expiryMinutes || 0, expiresAt: expiresAt });
    await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Task Created", temp.title, temp.reward);
    delete global.taskCreation[ctx.from.id];
    const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
    const makeBtn = (text) => `${pad}${text}${pad}`;
    await ctx.editMessageText(`<b>Task Created Successfully</b>\n\nTask: ${temp.title}\nReward: ₹${temp.reward}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "adm_tasks_manager") }).catch(() => { });
  } catch (e) { await ctx.reply(`Error: ${e.message}`); }
});

bot.callbackQuery(/^do_task_/, async (ctx) => {
  let userId = ctx.from.id;
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Task not found", show_alert: true });
  if (task.completedUsers.includes(userId)) return ctx.answerCallbackQuery({ text: "Already submitted!", show_alert: true });
  await ctx.answerCallbackQuery();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let bodyText = `Task: ${task.title}\nReward: ₹${task.reward}\nLink: ${task.link}`;
  await ctx.editMessageText(`<b>Task Details</b>\n\n<blockquote>${bodyText}</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .url(`Task Link`, task.link).row()
      .text(makeBtn(`Upload Screenshot`), `task_upload_${taskId}`).row()
      .text(makeBtn("Back"), "back_to_tasks")
  }).catch(() => { });
});

bot.callbackQuery("back_to_tasks", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  let tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).sort({ createdAt: -1 }).lean();
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  if (!tasks || tasks.length === 0) return ctx.editMessageText(`<b>Available Tasks</b>\n\nNo tasks available.`, { parse_mode: "HTML" }).catch(() => { });
  let taskButtons = [];
  tasks.forEach(t => taskButtons.push([{ text: `${t.title} (₹${t.reward})`, callback_data: `do_task_${t.taskId}` }]));
  taskButtons.push([{ text: makeBtn("Back"), callback_data: "back_to_balance" }]);
  return ctx.editMessageText(`<b>Available Tasks</b>`, { reply_markup: await buildStyledKb(taskButtons), parse_mode: "HTML" }).catch(() => { });
});

bot.callbackQuery("canc_task", async (ctx) => {
  delete userState[ctx.from.id];
  ctx.answerCallbackQuery({ text: "Cancelled" }).catch(() => { });
  await sendBalancePage(ctx, true);
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
  await ctx.editMessageText(`<b>Upload Screenshot</b>\n\nSend your task completion screenshot:\n\nTask: ${task.title}\nReward: ₹${task.reward}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Cancel"), "canc_task") }).catch(() => { });
});

bot.on("message:photo", async (ctx, next) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state) return sendUnknownCommand(ctx);
  if (state.startsWith("WAITING_TASK_PHOTO_")) {
    let taskId = state.replace("WAITING_TASK_PHOTO_", "");
    let task = await Task.findOne({ taskId });
    if (!task) { delete userState[userId]; return ctx.reply(`${toSmallCaps("Task not found!")}`, { parse_mode: "HTML" }); }
    if (task.completedUsers.includes(userId)) { delete userState[userId]; return ctx.reply(`${toSmallCaps("Already completed!")}`, { parse_mode: "HTML" }); }
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let submissionId = Math.floor(100000 + Math.random() * 900000).toString();
    await TaskSubmission.create({ submissionId, userId, userName: ctx.from.first_name || "User", taskId: task.taskId, taskTitle: task.title, reward: task.reward, photoFileId: photo.file_id, status: "Pending" });
    delete userState[userId];
    await ctx.reply(`${toSmallCaps("Task Submitted!")}\n\n${toSmallCaps("Task")}: ${task.title}\n${toSmallCaps("Reward")}: ₹${task.reward}\n\n🕐 ${toSmallCaps("Wait for admin approval.")}`, { parse_mode: "HTML", reply_markup: await buildKeyboardFromLayout(userId) });
    let alertChannel = await getConfig("default_task_alert_channel", "Not Set");
    if (alertChannel && alertChannel !== "Not Set") {
      let userLink = `<a href="tg://user?id=${userId}">${ctx.from.first_name || "User"} (${userId})</a>`;
      let caption = `<b>NEW TASK SUBMISSION</b>\n\nUser: ${userLink}\nTask: ${task.title}\nReward: ₹${task.reward}\nLink: ${task.link}\nType: Screenshot`;
      let kb = new InlineKeyboard().text("Approve ✅", `task_app_${submissionId}`).text("Reject ❌", `task_rej_${submissionId}`);
      try { await ctx.api.sendPhoto(alertChannel, photo.file_id, { caption, parse_mode: "HTML", reply_markup: kb }); } catch (e) { }
    }
    return;
  }
  return sendUnknownCommand(ctx);
});

bot.callbackQuery(/^task_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_app_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  sub.status = "Approved"; await sub.save();
  let user = await getUser(sub.userId);
  user.balance += sub.reward; await user.save();
  await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
  await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });
  await ctx.answerCallbackQuery({ text: "Approved!" });
  try { await ctx.api.sendMessage(sub.userId, `<b>${toSmallCaps("Task Approved!")}</b>\n\n${toSmallCaps("Task")}: ${sub.taskTitle}\n${toSmallCaps("Reward")}: ₹${sub.reward}`, { parse_mode: "HTML" }); } catch (e) { }
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  sub.status = "Rejected"; await sub.save();
  await ctx.answerCallbackQuery({ text: "Rejected!" });
  try { await ctx.api.sendMessage(sub.userId, `<b>${toSmallCaps("Task Rejected")}</b>\n\n${toSmallCaps("Task")}: ${sub.taskTitle}`, { parse_mode: "HTML" }); } catch (e) { }
});

// ============ BOT STARTUP ============
bot.catch((err) => console.error("❌ Bot Error:", err.message));

let botRetryCount = 0;
const MAX_BOT_RETRIES = 15;

async function startBotSafe() {
  try {
    await bot.start({ onStart: (info) => { console.log(`🚀 Bot @${info.username} running!`); botRetryCount = 0; } });
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

process.on("unhandledRejection", (reason) => { console.error("⚠️ Unhandled Rejection:", reason); });
process.on("uncaughtException", (err) => { console.error("⚠️ Uncaught Exception:", err.message); });

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");
    try {
      await User.collection.createIndex({ userId: 1 }, { unique: true });
      await User.collection.createIndex({ balance: -1 });
      await Withdrawal.collection.createIndex({ userId: 1, status: 1 });
      await BalanceHistory.collection.createIndex({ userId: 1, createdAt: -1 });
      await Config.collection.createIndex({ key: 1 }, { unique: true });
      await Channel.collection.createIndex({ channelId: 1 }, { unique: true });
      await DepositGateway.collection.createIndex({ gatewayId: 1 }, { unique: true });
      await DepositRequest.collection.createIndex({ requestId: 1 }, { unique: true });
      await AutoUpiOrder.collection.createIndex({ orderId: 1 }, { unique: true });
      console.log("⚡ MongoDB indexes created!");
    } catch (e) { console.log("⚠️ Index creation:", e.message); }
    await preloadAllConfigs();
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
    await getConfig("bot_status", "active");
    await getConfig("withdraw_enabled", true);
    await getConfig("quick_pay_tax_enabled", false);
    await getConfig("quick_pay_tax_percent", 0);
    await getConfig("new_user_notif", true);
    await getConfig("support_username", "Not Set");
    await getConfig("payout_channel", "Not Set");
    await getConfig("banned_in_channel_allowed", true);
    await getConfig("non_admin_channels_bypass", true);
    await getConfig("show_mode", "all");
    await getConfig("force_join_enabled", true);
    await getConfig("default_task_alert_channel", "Not Set");
    await getConfig("owner_id", MAIN_OWNER_ID);
    await getConfig("unknown_command_active", true);
    await getConfig("unknown_command_text", "❓ I didn't understand that.\n\nPlease /start the bot again.");
    await getConfig("bot_font", "normal");

    // AutoUpi init
    let aupiCfg = await AutoUpi.findOne({ key: "main_upi" });
    if (!aupiCfg) await AutoUpi.create({ key: "main_upi" });

    let fund = await LiveFund.findOne({ key: "main_fund" });
    if (!fund) await LiveFund.create({ key: "main_fund" });

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

    setInterval(async () => {
      try {
        let now = new Date();
        let expiredTasks = await Task.find({ expiresAt: { $ne: null, $lte: now }, isComplete: true });
        for (let task of expiredTasks) { await Task.deleteOne({ taskId: task.taskId }); console.log(`⏰ Expired task deleted: ${task.taskId}`); }
      } catch (e) { }
    }, 60 * 1000);

    console.log("⏳ Waiting 8s for cleanup...");
    await new Promise(r => setTimeout(r, 8000));
    console.log("🌐 Server ready");
    await startBotSafe();
  })
  .catch((err) => { console.error("❌ DB Error:", err); process.exit(1); });

const server = app.listen(PORT, "0.0.0.0", () => { console.log(`🌐 Server running on port ${PORT}`); });
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} in use. Retrying...`);
    setTimeout(() => { server.close(); server.listen(PORT, "0.0.0.0"); }, 2000);
  }
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });

setInterval(() => {
  let renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) fetch(renderUrl).catch(() => { });
}, 300000);

setInterval(() => {
  if (global.quickPayCache) { for (let uid in global.quickPayCache) delete global.quickPayCache[uid]; }
  if (global.broadcastCache) { for (let uid in global.broadcastCache) delete global.broadcastCache[uid]; }
  if (global.taskCreation) { for (let uid in global.taskCreation) delete global.taskCreation[uid]; }
}, 30 * 60 * 1000);


// ═══════════════════════════════════════════════════════════════
// ════════════ MISSING CODE BLOCK — PASTE AT BOTTOM ════════════
// ═══════════════════════════════════════════════════════════════

// ============ FIX 1: MongoDB Cleanup (Auto-run once) ============
(async () => {
  try {
    let cleanupFlag = await Config.findOne({ key: "cleanup_v230_done" }).lean();
    if (!cleanupFlag || cleanupFlag.value !== true) {
      console.log("🧹 Running one-time DB cleanup...");
      await Config.deleteMany({
        key: { $in: ["admin_panel_layout", "keyboard_layout", "bot_font", "owner_id", "payout_channel"] }
      });
      let allAdmins = await BotAdmin.find({}).lean();
      let seenIds = new Set();
      for (let a of allAdmins) {
        if (seenIds.has(a.userId)) await BotAdmin.deleteOne({ _id: a._id });
        else seenIds.add(a.userId);
      }
      await Config.findOneAndUpdate({ key: "cleanup_v230_done" }, { value: true }, { upsert: true });
      configCache.loaded = false;
      configCache.data = {};
      console.log("✅ DB cleanup complete.");
    }
  } catch (e) { console.error("Cleanup error:", e.message); }
})();

// ============ FIX 2: Override /admin command ============
bot.command("admin", async (ctx) => {
  try {
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
    let adminCheck = await isAdmin(userId);
    if (!adminCheck) {
      return ctx.reply(`❌ ${toSmallCaps("Not an admin!")}\n\nYour ID: <code>${userId}</code>`, { parse_mode: "HTML" });
    }
    configCache.data["admin_panel_layout"] = undefined;
    configCache.loaded = false;
    await sendAdminPanel(ctx, false);
  } catch (err) {
    console.error("admin command error:", err);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ============ FIX 3: Override sendAdminPanel (force Auto UPI btn) ============
async function sendAdminPanel(ctx, edit = true) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;

  let [userCount, activeAdmins, gatewayCount] = await Promise.all([
    User.countDocuments({}),
    BotAdmin.countDocuments({ isActive: true }),
    Gateway.countDocuments({ isActive: true })
  ]);

  let botStatus = await getConfig("bot_status", "active");
  let statusDisplay = botStatus === "active" ? "✅ Active" : (botStatus === "maintenance" ? "⚠️ Maintenance" : "❌ Disabled");
  let minW = await getConfig("min_withdraw", 0);
  let maxW = await getConfig("max_withdraw", 0);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let quickTaxEnabled = await getConfig("quick_pay_tax_enabled", false);
  let quickTaxPercent = await getConfig("quick_pay_tax_percent", 0);

  let panelText =
    `👑 <b>Admin Panel</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 <b>Bot Status:</b> ${statusDisplay}\n` +
    `💸 <b>Min:</b> ₹${minW} | 💰 <b>Max:</b> ₹${maxW}\n` +
    `📢 <b>Payout:</b> <code>${pChannel}</code>\n` +
    `💬 <b>Support:</b> <code>${supportId}</code>\n` +
    `🌐 <b>Gateways:</b> ${gatewayCount} active\n` +
    `⚡ <b>Quick Pay Tax:</b> ${quickTaxEnabled ? `🟢 ${quickTaxPercent}%` : "🔴 OFF"}\n` +
    `👥 <b>Users:</b> ${userCount} | 👑 <b>Admins:</b> ${activeAdmins}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let freshConfig = await Config.findOne({ key: "admin_panel_layout" }).lean();
  let layout = (freshConfig && Array.isArray(freshConfig.value) && freshConfig.value.length > 0)
    ? freshConfig.value
    : DEFAULT_ADMIN_PANEL_LAYOUT;

  let hasAutoUpi = layout.some(b => b.key === "adm_auto_upi");
  if (!hasAutoUpi) {
    layout = [...layout, { name: `🇮🇳 Auto Gateway UPI`, key: "adm_auto_upi", row: 99, hidden: false }];
  }

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

// ============ MISSING: Broadcast Handlers ============
bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  await renderBroadcastPage(ctx);
});

async function renderBroadcastPage(ctx) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let broadcasts = await Broadcast.find({ createdAt: { $gte: cutoff }, status: "Completed" }).sort({ createdAt: -1 }).limit(15).lean();
  let text = `📢 <b>Broadcast Setup</b>\n\n<b>Step 1 — Send Your Message</b>\nWrite your message just like a normal Telegram chat.\n\nYou can use Telegram's built-in formatting:\n• <b>Bold</b> • <i>Italic</i> • <u>Underline</u> • <s>Strike</s> • <code>Mono</code>\n• <a href="https://t.me">Clickable Links</a> • <tg-spoiler>Spoiler</tg-spoiler>\n<blockquote>Quote 💬</blockquote>\n\n<i>No HTML or coding is required.</i>\nThe bot will send the message exactly as you format it. ✅\n\n<b>Step 2 — Choose a Send Mode</b>\n🚀 Direct Mode — Clean message (no forwarding tag)\n🔄 Forward Mode — Shows Forwarded from channel\n\n👉 <b>Now, send your message below</b> 👇`;
  let kb = new InlineKeyboard();
  for (let b of broadcasts) {
    let preview = getBroadcastPreview(b);
    let timeAgo = formatTimeAgo(b.createdAt);
    let label = `${preview} — ${timeAgo}`;
    if (label.length > 40) label = label.substring(0, 38) + "..";
    kb.text(label, `bc_view_${b.broadcastId}`).row();
  }
  kb.text(makeBtn("Back"), "admin");
  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

function getBroadcastPreview(b) {
  if (b.messageType === "text") {
    let content = (b.content || "").replace(/<[^>]*>/g, "").trim();
    if (!content) return "📢 Text";
    return content.length > 25 ? content.substring(0, 25) + "..." : content;
  }
  let icons = { photo: "📸 Photo", video: "🎬 Video", audio: "🎵 Audio", document: "📄 Document", sticker: "🎨 Sticker", voice: "🎤 Voice", animation: "🎬 GIF" };
  return icons[b.messageType] || "📢 Broadcast";
}

async function renderBroadcastConfirm(ctx, cacheObj) {
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let mode = cacheObj.mode || "direct";
  let modeIcon = mode === "direct" ? "🚀" : "🔄";
  let modeText = mode === "direct" ? "DIRECT MODE" : "FORWARD MODE";
  let modeDesc = mode === "direct" ? "Clean broadcast, no forwarding tag" : "Shows 'Forwarded from channel' tag";
  let buttonCount = 0;
  if (cacheObj.buttonRows) buttonCount = cacheObj.buttonRows.reduce((s, r) => s + r.length, 0);
  let buttonText = buttonCount > 0 ? `✅ ${buttonCount} Buttons` : `❌ No Buttons`;
  let typeText = (cacheObj.type || "text").toUpperCase();
  let text = `⚠️ <b>Confirm Broadcast</b>\n\n<b>Type:</b> ${typeText}\n<b>Mode:</b> ${modeIcon} <b>${modeText}</b> (${modeDesc})\n<b>Buttons:</b> ${buttonText}\n\n<i>Select mode then click Confirm:</i>\n• 🚀 Direct Mode: Fast, clean (recommended)\n• 🔄 Forward Mode: Shows 'Forwarded from channel' tag\n\n<b>Do you want to send this message to all users?</b>`;
  let directBtn = mode === "direct" ? `✅ Direct Mode` : `Direct Mode`;
  let forwardBtn = mode === "forward" ? `✅ Forward Mode` : `Forward Mode`;
  let kb = new InlineKeyboard()
    .text(directBtn, "broadcast_mode_direct")
    .text(forwardBtn, "broadcast_mode_forward").row()
    .text(makeBtn("Add Buttons"), "broadcast_add_buttons").row()
    .text(makeBtn("Confirm & Send"), "broadcast_confirm_send")
    .text(makeBtn("Cancel"), "broadcast_cancel").row()
    .text(makeBtn("Back"), "adm_broadcast");
  if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML" }).catch(() => { });
  else await ctx.reply(text, { reply_markup: kb, parse_mode: "HTML" });
}

bot.callbackQuery("broadcast_mode_direct", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  if (!global.broadcastCache?.[userId]) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  global.broadcastCache[userId].mode = "direct";
  await ctx.answerCallbackQuery({ text: "🚀 Direct Mode" });
  await renderBroadcastConfirm(ctx, global.broadcastCache[userId]);
});

bot.callbackQuery("broadcast_mode_forward", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  if (!global.broadcastCache?.[userId]) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  global.broadcastCache[userId].mode = "forward";
  await ctx.answerCallbackQuery({ text: "🔄 Forward Mode" });
  await renderBroadcastConfirm(ctx, global.broadcastCache[userId]);
});

bot.callbackQuery("broadcast_add_buttons", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "BROADCAST_ADD_BUTTONS";
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let text = `⌨️ <b>Add Inline Buttons</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🟢 <b>Basic Format (One Button)</b>\n<code>Button Text - https://example.com</code>\n\n🟢 <b>Multiple Buttons (New Row)</b>\n<code>Join Channel - https://t.me/YourChannel\nSupport - https://t.me/YourSupport</code>\n\n🟢 <b>Two Buttons In Same Row</b>\n<code>Join - https://t.me/A && Support - https://t.me/B</code>\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📌 <b>Rules:</b>\n• Each new line = new row\n• Use && to place buttons in same row`;
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back"), "broadcast_confirm_back") }).catch(() => { });
});

bot.callbackQuery("broadcast_confirm_back", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  await renderBroadcastConfirm(ctx, cacheObj);
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.broadcastCache) delete global.broadcastCache[userId];
  await ctx.answerCallbackQuery({ text: "❌ Cancelled" }).catch(() => { });
  await renderBroadcastPage(ctx);
});

bot.callbackQuery("broadcast_confirm_send", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "Expired!", show_alert: true });
  if (cacheObj.confirmed) return ctx.answerCallbackQuery({ text: "Already confirmed!", show_alert: true });
  cacheObj.confirmed = true;
  let mode = cacheObj.mode || "direct";
  let modeIcon = mode === "direct" ? "🚀" : "🔄";
  let modeText = mode === "direct" ? "DIRECT MODE" : "FORWARD MODE";
  delete userState[userId];
  delete global.broadcastCache[userId];
  await ctx.answerCallbackQuery({ text: "🚀 Broadcasting..." });
  let totalUsers = await User.countDocuments({});
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  await ctx.editMessageText(`📢 <b>Broadcasting...</b>\n\n📢 <b>Mode:</b> ${modeIcon} ${modeText}\n👥 <b>Total Users:</b> ${totalUsers}\n\n⏳ Starting...`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(makeBtn("Back to Admin"), "admin") }).catch(() => { });
  setImmediate(async () => { await runBroadcast(userId, ctx, cacheObj, totalUsers); });
});

async function runBroadcast(adminId, ctx, cacheObj, totalUsers) {
  let startTime = Date.now();
  let allUsers = await User.find({}).lean();
  let total = allUsers.length;
  let sent = 0, failed = 0, processed = 0;
  let mode = cacheObj.mode || "direct";
  let modeIcon = mode === "direct" ? "🚀" : "🔄";
  let modeText = mode === "direct" ? "DIRECT MODE" : "FORWARD MODE";
  let inlineKb = null;
  if (cacheObj.buttonRows && cacheObj.buttonRows.length > 0) inlineKb = buildInlineKeyboardFromRows(cacheObj.buttonRows);
  let statusMsg;
  try {
    statusMsg = await bot.api.sendMessage(adminId, buildStatusMessage({ running: true, modeIcon, modeText, processed: 0, total, success: 0, failed: 0, speed: 0 }), { parse_mode: "HTML" });
  } catch (e) { }
  let lastUpdate = Date.now();
  const UPDATE_INTERVAL = 1500;
  for (let u of allUsers) {
    try {
      let sendOpts = { parse_mode: "HTML" };
      if (inlineKb) sendOpts.reply_markup = inlineKb;
      if (mode === "forward" && cacheObj.fromChatId && cacheObj.fromMessageId) await bot.api.forwardMessage(u.userId, cacheObj.fromChatId, cacheObj.fromMessageId);
      else {
        if (cacheObj.type === "text") await bot.api.sendMessage(u.userId, cacheObj.content, sendOpts);
        else if (cacheObj.type === "photo") await bot.api.sendPhoto(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
        else if (cacheObj.type === "video") await bot.api.sendVideo(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
        else if (cacheObj.type === "audio") await bot.api.sendAudio(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
        else if (cacheObj.type === "document") await bot.api.sendDocument(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
        else if (cacheObj.type === "sticker") await bot.api.sendSticker(u.userId, cacheObj.fileId, inlineKb ? { reply_markup: inlineKb } : {});
        else if (cacheObj.type === "animation") await bot.api.sendAnimation(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
        else if (cacheObj.type === "voice") await bot.api.sendVoice(u.userId, cacheObj.fileId, { ...sendOpts, caption: cacheObj.caption || "" });
      }
      sent++;
    } catch (e) { failed++; }
    processed++;
    let now = Date.now();
    if (now - lastUpdate > UPDATE_INTERVAL && statusMsg) {
      let elapsed = (now - startTime) / 1000;
      let speed = elapsed > 0 ? processed / elapsed : 0;
      try { await bot.api.editMessageText(adminId, statusMsg.message_id, buildStatusMessage({ running: true, modeIcon, modeText, processed, total, success: sent, failed, speed }), { parse_mode: "HTML" }); } catch (e) { }
      lastUpdate = now;
    }
    await new Promise(r => setTimeout(r, 40));
  }
  let totalTime = (Date.now() - startTime) / 1000;
  let avgSpeed = totalTime > 0 ? total / totalTime : 0;
  let broadcastId = Math.floor(100000 + Math.random() * 900000).toString();
  await Broadcast.create({ broadcastId, adminId, adminName: "Admin", messageType: cacheObj.type || "text", content: cacheObj.content || cacheObj.caption || "", fileId: cacheObj.fileId || "", sentCount: sent, failedCount: failed, totalCount: total, timeTaken: parseFloat(totalTime.toFixed(1)), status: "Completed" });
  if (statusMsg) {
    try { await bot.api.editMessageText(adminId, statusMsg.message_id, buildStatusMessage({ running: false, modeIcon, modeText, processed: total, total, success: sent, failed, speed: avgSpeed }), { parse_mode: "HTML", reply_markup: new InlineKeyboard().text(`⬅️ Back`, "admin") }); } catch (e) { }
  }
}

function buildStatusMessage({ running = true, modeIcon = "🚀", modeText = "DIRECT MODE", processed = 0, total = 0, success = 0, failed = 0, speed = 0 }) {
  let percent = total > 0 ? (processed / total) * 100 : 0;
  let bar = makeProgressBar(percent);
  let title = running ? `🚀 <b>Broadcast Running...</b>` : `🚀 <b>Broadcast Completed!</b>`;
  return `${title}\n\n📢 <b>Mode:</b> ${modeIcon} ${modeText}\n📊 <b>Progress:</b> ${percent.toFixed(1)}%\n${bar}\n\n👥 <b>Total Users:</b> ${total}\n✅ <b>Total Success:</b> ${success}\n❌ <b>Total Failed:</b> ${failed}\n⚡ <b>Speed:</b> ${speed.toFixed(1)} users/sec\n📈 <b>Processed:</b> ${processed} / ${total}`;
}

bot.callbackQuery(/^bc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => { });
  if (!(await isAdmin(ctx.from.id))) return;
  let bcId = ctx.callbackQuery.data.replace("bc_view_", "");
  let b = await Broadcast.findOne({ broadcastId: bcId }).lean();
  if (!b) return ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
  const pad = "\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003";
  const makeBtn = (text) => `${pad}${text}${pad}`;
  let typeIcon = { text: "📝", photo: "📸", video: "🎬", audio: "🎵", document: "📄", sticker: "🎨", voice: "🎤", animation: "🎬" }[b.messageType] || "📢";
  let bodyText = `${typeIcon} Type: ${b.messageType}\n👥 Sent: ${b.sentCount}\n❌ Failed: ${b.failedCount}\n📊 Total: ${b.totalCount}\n⏱️ Time: ${b.timeTaken}s\n🕐 ${formatDateTime(b.createdAt)}\n`;
  if (b.content) bodyText += `\nContent:\n${b.content}`;
  let kb = new InlineKeyboard().text(makeBtn("🗑️ Delete"), `bc_del_${bcId}`).row().text(makeBtn("Back"), "adm_broadcast");
  await ctx.editMessageText(`📢 <b>Broadcast Details</b>\n\n<blockquote>${bodyText}</blockquote>`, { parse_mode: "HTML", reply_markup: kb }).catch(() => { });
});

bot.callbackQuery(/^bc_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let bcId = ctx.callbackQuery.data.replace("bc_del_", "");
  await Broadcast.deleteOne({ broadcastId: bcId });
  await logAdminAction(ctx.from.id, ctx.from.first_name || "Admin", "Broadcast Deleted", bcId, 0, null);
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" }).catch(() => { });
  await renderBroadcastPage(ctx);
});

console.log("✅ Missing block loaded: broadcast handlers, /admin override, sendAdminPanel override, DB cleanup");

// ═══════════════════════════════════════════════════════════════
// ════════════ END MISSING CODE BLOCK ══════════════════════════
// ═══════════════════════════════════════════════════════════════  
