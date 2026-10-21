require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, InputFile } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

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
    if (["left", "restricted"].includes(status)) {
      return false;
    }
    if (["member", "administrator", "creator"].includes(status)) {
      joinedChannels.push(ch.channelId);
    }
  }

  if (joinedChannels.length > 0) {
    await User.updateOne({ userId }, { joinedChannels });
  }

  return true;
}

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
  { name: `🔄 Refresh Panel`, key: "admin", row: 13, hidden: false }
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

    let response;
    let resData;
    try {
      response = await axios.get(finalUrl, { timeout: 15000 });
      try { resData = JSON.stringify(response.data); }
      catch (e) { resData = String(response.data); }
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
      try { await bot.api.sendMessage(ch, msg, { parse_mode: "HTML" }); }
      catch (channelErr) { }
    }

    return { status: 'success', txnNumber: txnNumber || generateTxnNumber(), rawResponse: resData };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

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
  // Unknown-command auto-reply feature removed per admin request (was causing conflicts
  // with other input flows). This is now a safe no-op.
  return;
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
  try {
    const tasks = await Task.find({ isActive: { $ne: false }, isComplete: true }).lean();
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
      if (photos.total_count > 0) photoUrl = `/miniapp/api/photo-proxy/${userId}`;
    } catch (e) { }
    res.json({ success: true, user: { userId: user.userId, firstName: user.firstName, username: user.username, balance: user.balance, photoUrl } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/gateways", async (req, res) => {
  try {
    const gateways = await Gateway.find({ isActive: true }).lean();
    res.json({ success: true, gateways });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/deposit-gateways", async (req, res) => {
  try {
    const gateways = await DepositGateway.find({ status: "active" }).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ success: true, gateways });
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
        try { await ctx.api.sendMessage(MAIN_OWNER_ID, not
