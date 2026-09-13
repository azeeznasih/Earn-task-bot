// ============================================================
// 🤖 TELEGRAM PAYMENT TASK BOT - FULL WORKING
// grammy | mongoose | express
// With: Universal Gateway Auto-Pay, Privacy Mask, Validators
// ============================================================
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const express = require("express");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const withdrawalSchema = new mongoose.Schema({
  withdrawalId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  details: { type: String, required: true },
  gatewayName: { type: String, default: "" },
  gatewayRef: { type: String, default: "" },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, default: "Pending" },
  autoPaid: { type: Boolean, default: false },
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
  try { await BalanceHistory.create({ userId, action, amount }); } catch (e) {}
}

// ============================================================
// 🧾 RECEIPT WEB PAGE
// ============================================================
app.get("/receipt/:id", async (req, res) => {
  try {
    let wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd) return res.status(404).send("<h2 style='color:white;background:#111;text-align:center;padding:50px;'>Receipt not found!</h2>");
    let isSuccess = ["Approved", "AutoSuccess"].includes(wd.status);
    let isFailed = ["Rejected", "AutoFailed"].includes(wd.status);
    let statusTitle = isSuccess ? "TRANSFER COMPLETE" : (isFailed ? "TRANSFER FAILED" : "TRANSFER PENDING");
    let statusSubtitle = isSuccess ? "FUNDS CREDITED" : (isFailed ? "TRANSACTION REJECTED" : "PROCESSING PAYMENT");
    let accentColor = isSuccess ? "#00ffcc" : (isFailed ? "#ff4d4d" : "#ffa500");
    let iconSvg = isSuccess ? "&#10003;" : (isFailed ? "&#10005;" : "&#8943;");
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt</title>
    <style>body{background:#0b0e14;color:#fff;font-family:'Segoe UI',sans-serif;margin:0;padding:20px;display:flex;align-items:center;justify-content:center;min-height:100vh;}
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
      <div class="card-box"><div class="amount-label">AMOUNT</div><div class="amount-val">₹ ${wd.amount.toFixed(1)}</div></div>
      <div class="info-row"><span class="info-title">METHOD</span><span class="info-value">${wd.method.toUpperCase()}</span></div>
      <div class="info-row"><span class="info-title">REF NO</span><span class="info-value">TXN${wd.withdrawalId}</span></div>
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
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  maxUses: { type: Number, default: 1 },
  usedUsers: { type: [Number], default: [] }
});

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

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

// ⚡ Gateway — Universal Format (supports ALL gateways)
const gatewaySchema = new mongoose.Schema({
  gatewayId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  method: { type: String, default: "GET" },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  headers: { type: mongoose.Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Gateway = mongoose.models.Gateway || mongoose.model("Gateway", gatewaySchema);

const keyboardLayoutSchema = new mongoose.Schema({
  buttonKey: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  row: { type: Number, default: 0 },
  position: { type: Number, default: 0 }
});

const keyboardStyleSchema = new mongoose.Schema({
  buttonKey: { type: String, required: true, unique: true },
  style: { type: String, default: null }
});

const inlineStyleSchema = new mongoose.Schema({
  buttonId: { type: String, required: true, unique: true },
  style: { type: String, default: null }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const GiftCode = mongoose.model("GiftCode", giftCodeSchema);
const TaskSubmission = mongoose.model("TaskSubmission", taskSubmissionSchema);
const Config = mongoose.model("Config", configSchema);
const KeyboardLayout = mongoose.models.KeyboardLayout || mongoose.model("KeyboardLayout", keyboardLayoutSchema);
const KeyboardStyle = mongoose.models.KeyboardStyle || mongoose.model("KeyboardStyle", keyboardStyleSchema);
const InlineStyle = mongoose.models.InlineStyle || mongoose.model("InlineStyle", inlineStyleSchema);

// ============================================================
// 🔧 HELPERS
// ============================================================
async function getConfig(key, defaultValue) {
  let conf = await Config.findOne({ key });
  return conf ? conf.value : defaultValue;
}
async function setConfig(key, value) {
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}
async function isAdmin(userId) {
  if (userId === MAIN_OWNER_ID) return true;
  let admins = await getConfig("admins", []);
  return admins.includes(userId);
}
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({
      userId,
      walletId: Math.floor(1000000000 + Math.random() * 9000000000).toString()
    });
  }
  return user;
}
async function checkForceJoin(ctx) {
  let channels = await getConfig("forced_channels", []);
  if (!channels || channels.length === 0) return true;
  for (let ch of channels) {
    try {
      let member = await ctx.api.getChatMember(ch, ctx.from.id);
      if (["left", "kicked", "restricted"].includes(member.status)) return false;
    } catch (e) {}
  }
  return true;
}
function generateTrackerText(targetUser) {
  let linkedWalletInfo = targetUser.walletAccount !== "Not Set" ? targetUser.walletAccount :
                         (targetUser.upiId !== "Not Set" ? targetUser.upiId :
                         (targetUser.bankAccNo !== "Not Set" ? `${targetUser.bankAccNo} (${targetUser.bankIfsc})` :
                         (targetUser.amazonEmail !== "Not Set" ? targetUser.amazonEmail :
                         (targetUser.redeemCodeAddr !== "Not Set" ? targetUser.redeemCodeAddr : "Not Linked"))));
  return `🙇‍♂️ Uꜱᴇʀ Dᴇᴛᴀɪʟꜱ Fᴏᴜɴᴅ Cʜᴇᴄᴋ\n\n` +
         `🚻 Usᴇʀ : ${targetUser.userId}\n` +
         `🆔 Usᴇʀ ID : ${targetUser.userId}\n` +
         `💵 Aᴠᴀɪʟᴀʙʟᴇ Bᴀʟᴀɴᴄᴇ : ₹${targetUser.balance.toFixed(2)}\n` +
         `🏧 Wɪᴛʜᴅʀᴀᴡ Bᴀʟᴀɴᴄᴇ : ₹${(targetUser.withdrawnTotal || 0).toFixed(2)}\n` +
         `⛔ Bʟᴏᴄᴋᴇᴅ Rᴇғᴇʀs : ${targetUser.blockedRefs || 0}\n` +
         `🔗 Rᴇғᴇʀʀᴀls Wɪɴ Lɪɴᴋ : ${targetUser.referralsWithLinkWallet || 0}\n` +
         `🎴 Lɪɴᴋᴇᴅ Aᴄᴄᴏᴜɴᴛ / UPI : ${linkedWalletInfo}\n` +
         `👩‍💻 Rᴇғᴇʀᴇᴅ Bʏ : ${targetUser.referredBy || "Aᴜᴛᴏ Sᴛᴀʀᴛᴇᴅ"}`;
}

// ============================================================
// 🔒 PRIVACY MASK HELPERS
// ============================================================
function maskValue(val) {
  if (!val || val === "Not Set") return "Not Set";
  val = String(val);
  if (val.length <= 6) return val;
  return `${val.substring(0, 3)}*****${val.slice(-3)}`;
}
function maskUPI(upi) {
  if (!upi || upi === "Not Set") return "Not Set";
  if (!upi.includes("@")) return maskValue(upi);
  let [name, domain] = upi.split("@");
  if (name.length <= 3) return `${name[0]}*****@${domain}`;
  return `${name.substring(0, 3)}*****@${domain}`;
}
function maskEmail(email) {
  if (!email || email === "Not Set") return "Not Set";
  if (!email.includes("@")) return maskValue(email);
  let [name, domain] = email.split("@");
  if (name.length <= 3) return `${name[0]}*****@${domain}`;
  return `${name.substring(0, 3)}*****@${domain}`;
}
function maskBank(acc) {
  if (!acc || acc === "Not Set") return "Not Set";
  if (acc.length <= 6) return acc;
  return `${acc.substring(0, 3)}*****${acc.slice(-3)}`;
}
function maskAddress(addr) {
  if (!addr || addr === "Not Set") return "Not Set";
  addr = String(addr);
  if (addr.length <= 6) return addr;
  return `${addr.substring(0, 3)}*****${addr.slice(-3)}`;
}
function maskDetails(method, details) {
  if (!details || details === "Not Set") return "Not Set";
  if (method === "UPI") return maskUPI(details);
  if (method === "Amazon") return maskEmail(details);
  if (method === "Bank") {
    let parts = details.split(",");
    if (parts.length >= 1) return `${maskBank(parts[0].trim())}${parts[1] ? ", " + parts[1].trim() : ""}`;
    return details;
  }
  if (method === "Wallet") return maskValue(details);
  return details;
}

// ============================================================
// ✅ VALIDATORS
// ============================================================
function isValidUPI(upi) {
  if (!upi) return false;
  let regex = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
  return regex.test(upi.trim());
}
function isValidEmail(email) {
  if (!email) return false;
  let regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}
function isValidAccountNo(acc) {
  if (!acc) return false;
  let regex = /^\d{9,18}$/;
  return regex.test(acc.trim());
}
function isValidIFSC(ifsc) {
  if (!ifsc) return false;
  let regex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return regex.test(ifsc.trim().toUpperCase());
}

// ============================================================
// ⚡ UNIVERSAL API GATEWAY SYSTEM
// ============================================================
async function getActiveGateways() {
  return await Gateway.find({ active: true }).sort({ createdAt: 1 });
}
async function getGatewayById(gatewayId) {
  return await Gateway.findOne({ gatewayId });
}
async function getActiveGateway() {
  return await Gateway.findOne({ active: true }).sort({ createdAt: 1 });
}
function getNestedField(obj, path) {
  if (!obj || !path) return undefined;
  let parts = path.split(".");
  let cur = obj;
  for (let p of parts) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// 🔄 Replace {upi}, {amount}, {userId}, {orderId} with actual values
function replaceDynamicParams(params, paymentData) {
  let result = {};
  for (let [key, val] of Object.entries(params || {})) {
    if (typeof val === "string") {
      result[key] = val
        .replace(/{upi}/g, String(paymentData.details || ""))
        .replace(/{amount}/g, String(paymentData.amount || ""))
        .replace(/{userId}/g, String(paymentData.userId || ""))
        .replace(/{orderId}/g, String(paymentData.orderId || ""))
        .replace(/{name}/g, String(paymentData.name || ""))
        .replace(/{method}/g, String(paymentData.method || ""));
    } else {
      result[key] = val;
    }
  }
  return result;
}

async function sendPaymentToGateway(gateway, paymentData) {
  try {
    console.log("🚀 [GATEWAY] Sending payment...");
    console.log("   Gateway:", gateway.name);
    console.log("   URL:", gateway.url);
    console.log("   Payment:", JSON.stringify(paymentData));

    let finalParams = replaceDynamicParams(gateway.params, paymentData);
    console.log("   Params:", JSON.stringify(finalParams));

    let method = (gateway.method || "GET").toUpperCase();
    let finalUrl = gateway.url;
    let fetchOptions = {
      method,
      headers: { "Content-Type": "application/json", ...(gateway.headers || {}) },
      signal: AbortSignal.timeout(30000)
    };

    if (method === "POST") {
      fetchOptions.body = JSON.stringify(finalParams);
    } else {
      let qs = new URLSearchParams();
      for (let [k, v] of Object.entries(finalParams)) {
        qs.append(k, String(v));
      }
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs.toString();
    }

    console.log("   Final URL:", finalUrl);

    let response = await fetch(finalUrl, fetchOptions);
    let httpOk = response.status >= 200 && response.status < 300;

    let rawText = "";
    let data = null;
    try {
      rawText = await response.text();
      console.log("   Response:", rawText);
      data = JSON.parse(rawText);
    } catch (e) {
      data = { raw: rawText };
    }

    console.log("   HTTP:", response.status);

    // 🔍 Flexible success detection
    let isSuccess = false;
    let statusField = data.status || (data.data && data.data.status);
    let codeField = data.code || (data.data && data.data.code);
    let messageField = data.message || (data.data && data.data.message);
    let successField = data.success || (data.data && data.data.success);

    if (typeof successField === "boolean") {
      isSuccess = successField;
    } else if (statusField) {
      let s = String(statusField).toLowerCase();
      isSuccess = ["success", "ok", "true", "completed", "paid", "approved", "1"].includes(s);
    } else if (codeField) {
      let c = String(codeField).toLowerCase();
      isSuccess = c.includes("success") || c.includes("200") || c.includes("00") || c.includes("ppt_200");
    } else if (messageField) {
      let m = String(messageField).toLowerCase();
      isSuccess = m.includes("success") || m.includes("completed") || m.includes("paid");
    } else if (httpOk) {
      isSuccess = true;
    }
    if (!httpOk) isSuccess = false;

    let ref = "";
    if (data && typeof data === "object") {
      ref = data.referenceId || data.refId || data.ref || data.transactionId ||
            data.txnId || data.txn_id || data.orderId || data.order_id ||
            data.paymentId || data.payment_id || data.utr || data.id ||
            (data.data && (data.data.referenceId || data.data.refId || data.data.txnId || data.data.id || data.data.utr)) || "";
    }

    console.log("   Success:", isSuccess, "| Ref:", ref);

    return {
      success: isSuccess,
      httpStatus: response.status,
      data,
      ref: String(ref || ""),
      raw: rawText,
      error: null
    };
  } catch (err) {
    console.error("❌ [GATEWAY] Error:", err.message);
    return {
      success: false,
      httpStatus: 0,
      data: null,
      ref: "",
      raw: "",
      error: err.message || String(err)
    };
  }
}


// ============================================================
// ⌨️ REPLY KEYBOARD LAYOUT SYSTEM
// ============================================================
const DEFAULT_LAYOUT = [
  { buttonKey: "btn_task",     name: "📋 Task Earn",      row: 0, position: 0 },
  { buttonKey: "btn_balance",  name: "💰 My Balance",     row: 1, position: 0 },
  { buttonKey: "btn_quickpay", name: "⚡ Quick Pay",       row: 1, position: 1 },
  { buttonKey: "btn_gift",     name: "🎁 Gift Code",      row: 2, position: 0 },
  { buttonKey: "btn_payout",   name: "💳 Payment Method", row: 2, position: 1 },
  { buttonKey: "btn_withdraw", name: "🚀 Withdraw",       row: 3, position: 0 }
];

const DEFAULT_REPLY_STYLES = {
  "btn_task": "primary", "btn_balance": "success",
  "btn_quickpay": "primary", "btn_gift": "success",
  "btn_payout": "primary", "btn_withdraw": "danger"
};

const STYLE_EMOJI = { "primary": "🔵", "success": "🟢", "danger": "🔴", "default": "⚪" };
const STYLE_LABEL = { "primary": "Primary (Blue)", "success": "Success (Green)", "danger": "Danger (Red)", "default": "Default" };

async function getKeyboardLayout() {
  let layout = await KeyboardLayout.find({}).sort({ row: 1, position: 1 });
  if (!layout || layout.length === 0) {
    await KeyboardLayout.insertMany(DEFAULT_LAYOUT);
    layout = await KeyboardLayout.find({}).sort({ row: 1, position: 1 });
  }
  return layout;
}
async function getReplyStyle(buttonKey) {
  let rec = await KeyboardStyle.findOne({ buttonKey });
  if (rec) {
    if (rec.style === "default" || rec.style === null) return null;
    return rec.style;
  }
  return DEFAULT_REPLY_STYLES[buttonKey] || null;
}
async function setReplyStyle(buttonKey, style) {
  if (style === "default" || style === null) {
    await KeyboardStyle.findOneAndUpdate({ buttonKey }, { buttonKey, style: "default" }, { upsert: true });
  } else {
    await KeyboardStyle.findOneAndUpdate({ buttonKey }, { buttonKey, style }, { upsert: true });
  }
}
async function resetReplyStyle(buttonKey) {
  await KeyboardStyle.findOneAndDelete({ buttonKey });
}
async function buildReplyKeyboard() {
  let layout = await getKeyboardLayout();
  let kb = new Keyboard();
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowBtns = layout.filter(b => b.row === r).sort((a, b) => a.position - b.position);
    for (let btn of rowBtns) {
      let style = await getReplyStyle(btn.buttonKey);
      if (style) kb = kb.text(btn.name, { style });
      else kb = kb.text(btn.name);
    }
    if (rowBtns.length > 0) kb = kb.row();
  }
  return kb.resized();
}
async function getKeyboardManageText() {
  let layout = await getKeyboardLayout();
  let text = "⚙️ Here You Can Manage Your Keyboard Layout:\n\n";
  text += "✏️ To Rename, Simply Click On The Button Name.\n\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n";
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowBtns = layout.filter(b => b.row === r).sort((a, b) => a.position - b.position);
    let rowText = rowBtns.map(b => b.name).join(" | ");
    if (rowText) text += rowText + "\n";
  }
  text += "━━━━━━━━━━━━━━━━━━━━\n";
  text += "🎨 Style: 🔵 Primary | 🟢 Success | 🔴 Danger | ⚪ Default";
  return text;
}
async function getKeyboardManageKeyboard() {
  let layout = await getKeyboardLayout();
  let kb = new InlineKeyboard();
  let maxRow = layout.length > 0 ? Math.max(...layout.map(b => b.row)) : 0;
  for (let r = 0; r <= maxRow; r++) {
    let rowBtns = layout.filter(b => b.row === r).sort((a, b) => a.position - b.position);
    if (rowBtns.length === 0) continue;
    kb = kb.text(`📁 Row ${r + 1}`, `kbd_rowview_${r}`)
           .text("⬆️ Row", `kbd_rowup_${r}`)
           .text("⬇️ Row", `kbd_rowdown_${r}`).row();
  }
  for (let btn of layout) {
    let style = await getReplyStyle(btn.buttonKey);
    let emoji = STYLE_EMOJI[style || "default"];
    let shortName = btn.name.substring(0, 10);
    kb = kb.text(`${emoji} ${shortName}`, `kbd_edit_${btn.buttonKey}`)
           .text("⬆️ Btn", `kbd_btnup_${btn.buttonKey}`)
           .text("⬇️ Btn", `kbd_btndown_${btn.buttonKey}`)
           .text("📦 Move", `kbd_move_${btn.buttonKey}`).row();
  }
  kb = kb.text("♻️ Reset Keyboard To Default", "kbd_reset").row();
  kb = kb.text("🎨 Update Keyboard For All Users", "kbd_update_all").row();
  kb = kb.text("⬅️ Back", "admin");
  return kb;
}

// ============================================================
// 🎨 INLINE BUTTON STYLE SYSTEM
// ============================================================
const INLINE_BUTTONS_REGISTRY = [
  { id: "balance_statement",     label: "📊 Balance Statement",  screen: "💰 Wallet" },
  { id: "customer_support",      label: "💬 Customer Support",   screen: "💰 Wallet" },
  { id: "refresh_balance_only",  label: "🔄 Refresh Balance",    screen: "💰 Wallet" },
  { id: "live_fund",             label: "💰 Live Fund",          screen: "💰 Wallet" },
  { id: "back_to_balance",       label: "🔙 Back to Balance",    screen: "💰 Wallet" },
  { id: "wd_wallet",             label: "🌐 Wallet",             screen: "🏦 Withdraw" },
  { id: "wd_upi",                label: "⚡ UPI",                 screen: "🏦 Withdraw" },
  { id: "wd_bank",               label: "🏦 Bank",               screen: "🏦 Withdraw" },
  { id: "wd_amazon",             label: "📧 Amazon",             screen: "🏦 Withdraw" },
  { id: "wd_redeem",             label: "🎁 Redeem Code",        screen: "🏦 Withdraw" },
  { id: "confirm_wd",            label: "✅ Confirm Withdraw",    screen: "🏦 Withdraw" },
  { id: "cancel_wd",             label: "❌ Cancel Withdraw",     screen: "🏦 Withdraw" },
  { id: "set_wallet",            label: "🌐 Set Wallet",         screen: "💳 Payment" },
  { id: "set_upi",               label: "⚡ Set UPI",              screen: "💳 Payment" },
  { id: "set_bank",              label: "🏦 Set Bank",           screen: "💳 Payment" },
  { id: "set_amazon",            label: "📧 Set Amazon",         screen: "💳 Payment" },
  { id: "set_redeem",            label: "🎁 Set Redeem",         screen: "💳 Payment" },
  { id: "task_approve",          label: "✅ Approve Task",       screen: "📋 Task" },
  { id: "task_reject",           label: "❌ Reject Task",        screen: "📋 Task" },
  { id: "cancel_task",           label: "❌ Cancel Task",        screen: "📋 Task" },
  { id: "open_task_link",        label: "🔗 Open Task Link",     screen: "📋 Task" },
  { id: "join_channel",          label: "📢 Join Channel",       screen: "📢 Force Join" },
  { id: "joined_verify",         label: "✅ I have Joined",       screen: "📢 Force Join" },
  { id: "adm_back",              label: "🔙 Back (Admin)",       screen: "👑 Admin" }
];

const DEFAULT_INLINE_STYLES = {
  "balance_statement": "primary",  "customer_support": "success",
  "refresh_balance_only": "primary", "live_fund": "success",
  "back_to_balance": "primary",
  "wd_wallet": "primary", "wd_upi": "primary", "wd_bank": "primary",
  "wd_amazon": "primary", "wd_redeem": "primary",
  "confirm_wd": "success", "cancel_wd": "danger",
  "set_wallet": "primary", "set_upi": "primary", "set_bank": "primary",
  "set_amazon": "primary", "set_redeem": "primary",
  "task_approve": "success", "task_reject": "danger",
  "cancel_task": "danger", "open_task_link": "primary",
  "join_channel": "primary", "joined_verify": "success",
  "adm_back": "primary"
};

async function getInlineStyle(buttonId) {
  let rec = await InlineStyle.findOne({ buttonId });
  if (rec) {
    if (rec.style === "default" || rec.style === null) return null;
    return rec.style;
  }
  return DEFAULT_INLINE_STYLES[buttonId] || null;
}
async function setInlineStyle(buttonId, style) {
  if (style === "default" || style === null) {
    await InlineStyle.findOneAndUpdate({ buttonId }, { buttonId, style: "default" }, { upsert: true });
  } else {
    await InlineStyle.findOneAndUpdate({ buttonId }, { buttonId, style }, { upsert: true });
  }
}
async function resetInlineStyle(buttonId) {
  await InlineStyle.findOneAndDelete({ buttonId });
}
async function ibtn(buttonId, text, callbackData) {
  let style = await getInlineStyle(buttonId);
  let btn = { text, callback_data: callbackData };
  if (style) btn.style = style;
  return btn;
}
async function iurl(buttonId, text, url) {
  let style = await getInlineStyle(buttonId);
  let btn = { text, url };
  if (style) btn.style = style;
  return btn;
}
function buildIKB(rows) { return { inline_keyboard: rows }; }

// ============================================================
// 🎨 INLINE STYLE EDITOR
// ============================================================
async function getInlineStylesText() {
  return "🖌️ *Inline Button Styles Editor*\n\n━━━━━━━━━━━━━━━━━━━━\n\nTap a screen below to edit button colors.\n\n🔵 Primary  🟢 Success  🔴 Danger  ⚪ Default\n\n━━━━━━━━━━━━━━━━━━━━";
}
async function getInlineStylesKeyboard() {
  let kb = new InlineKeyboard();
  let screens = [...new Set(INLINE_BUTTONS_REGISTRY.map(b => b.screen))];
  for (let s of screens) {
    kb = kb.text(`📂 ${s}`, `inline_scr_${encodeURIComponent(s)}`).row();
  }
  kb = kb.text("♻️ Reset All to Default", "inline_reset_all").row();
  kb = kb.text("⬅️ Back to Admin", "admin");
  return kb;
}
async function getScreenText(screen) {
  let btns = INLINE_BUTTONS_REGISTRY.filter(b => b.screen === screen);
  let text = `🖌️ *${screen}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (let b of btns) {
    let style = await getInlineStyle(b.id);
    text += `${STYLE_EMOJI[style || "default"]} ${b.label}\n`;
  }
  text += "\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Tap a button to edit style.";
  return text;
}
async function getScreenKeyboard(screen) {
  let btns = INLINE_BUTTONS_REGISTRY.filter(b => b.screen === screen);
  let kb = new InlineKeyboard();
  for (let b of btns) {
    let style = await getInlineStyle(b.id);
    kb = kb.text(`${STYLE_EMOJI[style || "default"]} ${b.label}`, `inline_btn_${b.id}`).row();
  }
  kb = kb.text("🔙 Back", "adm_edit_inline_styles");
  return kb;
}

// ============================================================
// 🔌 UNIVERSAL GATEWAY MANAGEMENT (with params)
// ============================================================
async function getGatewayListText() {
  let gateways = await Gateway.find({}).sort({ createdAt: 1 });
  let text = "🔌 *API Gateways — Auto Payment*\n\n━━━━━━━━━━━━━━━━━━━━\n\n";
  if (gateways.length === 0) {
    text += "📭 No gateways added yet.\n\nTap *➕ Add New Gateway* below.";
  } else {
    gateways.forEach((g, i) => {
      let statusIcon = g.active ? "🟢" : "⚪";
      let paramCount = g.params ? Object.keys(g.params).length : 0;
      text += `${i + 1}. ${statusIcon} *${g.name}*\n`;
      text += `   📡 ${g.method} • 🔑 ${paramCount} params\n`;
      text += `   🔗 \`${g.url.substring(0, 45)}${g.url.length > 45 ? "..." : ""}\`\n\n`;
    });
  }
  text += "━━━━━━━━━━━━━━━━━━━━\n💡 Tap a gateway to Edit / Delete / Toggle.";
  return text;
}
async function getGatewayListKeyboard() {
  let gateways = await Gateway.find({}).sort({ createdAt: 1 });
  let kb = new InlineKeyboard();
  gateways.forEach(g => {
    let statusIcon = g.active ? "🟢" : "⚪";
    kb = kb.text(`${statusIcon} ${g.name}`, `gw_view_${g.gatewayId}`).row();
  });
  kb = kb.text("➕ Add New Gateway", "gw_add_new").row();
  kb = kb.text("⬅️ Back to Admin", "admin");
  return kb;
}

// ============================================================
// 👑 ADMIN PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.reply("❌ Not admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let gwCount = await Gateway.countDocuments({});

  let panelText = `👑 *Admin Panel*\n\n` +
                  `👨‍💻 Owner: ${ownerId}\n` +
                  `💸 Min Withdraw: ₹${minW}\n` +
                  `💰 Max Withdraw: ₹${maxW}\n` +
                  `📢 Payout Channel: ${pChannel}\n` +
                  `💬 Support: ${supportId}\n` +
                  `🔌 Gateways: ${gwCount}`;

  let kb = new InlineKeyboard()
    .text("➕ Add Balance", "adm_add_bal").text("➖ Remove Balance", "adm_rem_bal").row()
    .text("👥 User Tracker", "adm_user_tracker").text("📊 All Balances", "adm_all_balances").row()
    .text("📉 Min Withdraw", "adm_set_min_w").text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Set Payout Channel", "adm_set_p_chan").text("📢 Manage Channels", "adm_channels").row()
    .text("🔄 Reset Balance", "adm_reset_bal").text("📋 Manage Tasks", "adm_tasks_manager").row()
    .text("🎁 Create Gift", "adm_create_gift").text("📢 Broadcast", "adm_broadcast").row()
    .text("👥 Manage Admins", "adm_admins").text("👑 Transfer Ownership", "adm_transfer").row()
    .text("🔌 Setup Gateway", "adm_gateway_list").row()
    .text("🎨 Customize Keyboard", "adm_customize_keyboard").row()
    .text("🖌️ Edit Inline Styles", "adm_edit_inline_styles").row()
    .text("💬 Set Support ID", "adm_set_support").text("🔄 Refresh", "admin");

  if (edit && ctx.callbackQuery) await ctx.editMessageText(panelText, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
  else await ctx.reply(panelText, { reply_markup: kb, parse_mode: "Markdown" });
}

bot.callbackQuery("admin", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery().catch(() => {});
  await sendAdminPanel(ctx, true);
});

// ============================================================
// 🔌 GATEWAY LIST
// ============================================================
bot.callbackQuery("adm_gateway_list", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getGatewayListText(), {
    reply_markup: await getGatewayListKeyboard(),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// ============================================================
// 🔌 VIEW SINGLE GATEWAY (with params)
// ============================================================
bot.callbackQuery(/^gw_view_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await ctx.answerCallbackQuery();

  let paramsText = "";
  if (gw.params && Object.keys(gw.params).length > 0) {
    for (let [k, v] of Object.entries(gw.params)) {
      let displayVal = String(v);
      if (displayVal.length > 40) displayVal = displayVal.substring(0, 40) + "...";
      paramsText += `   • \`${k}\` = \`${displayVal}\`\n`;
    }
  } else {
    paramsText = "   _(none)_\n";
  }

  let text = `🔌 *Gateway Details*\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📛 *Name:* ${gw.name}\n`;
  text += `📡 *Method:* ${gw.method}\n`;
  text += `🔗 *URL:*\n\`${gw.url}\`\n\n`;
  text += `🔑 *Params:*\n${paramsText}\n`;
  text += `📊 *Status:* ${gw.active ? "🟢 Active" : "⚪ Inactive"}\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("✏️ Edit Name", `gw_edit_name_${gwId}`).row()
    .text("✏️ Edit URL", `gw_edit_url_${gwId}`).row()
    .text("🔑 Edit Params", `gw_edit_params_${gwId}`).row()
    .text("📡 Toggle Method", `gw_toggle_method_${gwId}`).row()
    .text(gw.active ? "⚪ Deactivate" : "🟢 Activate", `gw_toggle_${gwId}`).row()
    .text("🗑️ Delete Gateway", `gw_delete_${gwId}`).row()
    .text("🔙 Back", "adm_gateway_list");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🔌 ADD NEW GATEWAY — Step 1/3 (Name)
// ============================================================
bot.callbackQuery("gw_add_new", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "GW_ADD_NAME";
  await ctx.editMessageText(
    `🔌 *Add New Gateway — Step 1/3*\n\n` +
    `📛 Send the *Gateway Name*\n\n` +
    `Examples:\n• \`Ultra Pay\`\n• \`Paytm\`\n• \`Cashfree\`\n• \`PhonePe\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_gateway_list") }
  ).catch(() => {});
});

// ============================================================
// 🔌 TOGGLE ACTIVE
// ============================================================
bot.callbackQuery(/^gw_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_toggle_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  gw.active = !gw.active;
  await gw.save();
  await ctx.answerCallbackQuery({ text: gw.active ? "🟢 Activated!" : "⚪ Deactivated!" });
  return bot.api.sendMessage(ctx.from.id, "🔄 Refreshed!", { reply_markup: new InlineKeyboard().text("🔌 View Gateway", `gw_view_${gwId}`) }).catch(() => {});
});

// ============================================================
// 🔌 TOGGLE METHOD (GET/POST)
// ============================================================
bot.callbackQuery(/^gw_toggle_method_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_toggle_method_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  gw.method = (gw.method || "GET").toUpperCase() === "GET" ? "POST" : "GET";
  await gw.save();
  await ctx.answerCallbackQuery({ text: `📡 Method: ${gw.method}` });
  await ctx.editMessageText(`📡 Method changed to *${gw.method}*`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back to Gateway", `gw_view_${gwId}`)
  }).catch(() => {});
});

// ============================================================
// 🔌 DELETE CONFIRM
// ============================================================
bot.callbackQuery(/^gw_delete_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_delete_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🗑️ *Delete Gateway?*\n\n📛 Name: *${gw.name}*\n🔗 URL: \`${gw.url}\`\n\n⚠️ This cannot be undone!`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Yes, Delete", `gw_confirmdel_${gwId}`).row()
        .text("❌ Cancel", `gw_view_${gwId}`)
    }
  ).catch(() => {});
});

bot.callbackQuery(/^gw_confirmdel_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_confirmdel_", "");
  await Gateway.deleteOne({ gatewayId: gwId });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!", show_alert: true });
  await ctx.editMessageText(await getGatewayListText(), {
    reply_markup: await getGatewayListKeyboard(),
    parse_mode: "Markdown"
  }).catch(() => {});
});

// ============================================================
// 🔌 EDIT NAME
// ============================================================
bot.callbackQuery(/^gw_edit_name_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_edit_name_", "");
  userState[ctx.from.id] = `GW_EDIT_NAME_${gwId}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📛 Send new *Gateway Name*:`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Cancel", `gw_view_${gwId}`)
  }).catch(() => {});
});

// ============================================================
// 🔌 EDIT URL
// ============================================================
bot.callbackQuery(/^gw_edit_url_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_edit_url_", "");
  userState[ctx.from.id] = `GW_EDIT_URL_${gwId}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔗 Send new *API URL*:\n\n` +
    `Example:\n\`https://api.gateway.com/pay\``,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Cancel", `gw_view_${gwId}`)
    }
  ).catch(() => {});
});

// ============================================================
// 🔌 EDIT PARAMS (KEY-VALUE PAIRS)
// ============================================================
bot.callbackQuery(/^gw_edit_params_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_edit_params_", "");
  userState[ctx.from.id] = `GW_EDIT_PARAMS_${gwId}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔑 *Edit Params*\n\n` +
    `Send params in this format:\n\n` +
    `\`\`\`\n` +
    `token=P7HrpXCZLTQpd1hLNroxduBqpOmg0cTXpYnX7b5n1B\n` +
    `key=2j6djFlhsWBT7o7O\n` +
    `paytoNumber={upi}\n` +
    `amount={amount}\n` +
    `comment=Monthly payment\n` +
    `\`\`\`\n\n` +
    `💡 *Dynamic values:*\n` +
    `• \`{upi}\` → user UPI/wallet\n` +
    `• \`{amount}\` → withdrawal amount\n` +
    `• \`{userId}\` → user ID\n` +
    `• \`{orderId}\` → order ID\n\n` +
    `⚠️ Each param on *new line*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Cancel", `gw_view_${gwId}`)
    }
  ).catch(() => {});
});

// ============================================================
// 🔌 CLEAR PARAMS
// ============================================================
bot.callbackQuery(/^gw_clear_params_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwId = ctx.callbackQuery.data.replace("gw_clear_params_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  gw.params = {};
  await gw.save();
  await ctx.answerCallbackQuery({ text: "🔑 Params cleared!" });
  await ctx.editMessageText(`🔑 Params cleared for *${gw.name}*`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", `gw_view_${gwId}`)
  }).catch(() => {});
});

// ============================================================
// ⌨️ KEYBOARD CUSTOMIZE
// ============================================================
bot.callbackQuery("adm_customize_keyboard", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^kbd_rowview_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let row = parseInt(ctx.callbackQuery.data.replace("kbd_rowview_", ""), 10);
  let rowBtns = await KeyboardLayout.find({ row }).sort({ position: 1 });
  await ctx.answerCallbackQuery({ text: `Row ${row + 1}: ${rowBtns.map(b => b.name).join(", ")}`, show_alert: true });
});

bot.callbackQuery(/^kbd_edit_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_edit_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  let style = await getReplyStyle(btnKey);
  let emoji = STYLE_EMOJI[style || "default"];
  let label = STYLE_LABEL[style || "default"];
  let text = `✏️ *Edit Button*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Name: *${btn.name}*\n🎨 Style: ${emoji} \`${label}\`\n📍 Row: ${btn.row + 1}\n\n━━━━━━━━━━━━━━━━━━━━`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `kbd_rename_${btnKey}`).row()
    .text("🎨 Set Style", `kbd_style_${btnKey}`).row()
    .text("🔄 Reset this Button", `kbd_resetbtn_${btnKey}`).row()
    .text("🔙 Back", "adm_customize_keyboard");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbd_rename_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_rename_", "");
  userState[ctx.from.id] = `KBD_RENAME_${btnKey}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📝 Send new name for this button:\n\nExample: \`🚀 Withdraw\``, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_customize_keyboard")
  }).catch(() => {});
});

bot.callbackQuery(/^kbd_style_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_style_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Button not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  let current = await getReplyStyle(btnKey) || "default";
  let text = `🎨 *Set Style for ${btn.name}*\n\nCurrent: ${STYLE_EMOJI[current]} \`${STYLE_LABEL[current]}\`\n\n👇 Pick a color:`;
  let kb = new InlineKeyboard()
    .text(current === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `kbd_setstyle_${btnKey}_primary`).row()
    .text(current === "success" ? "✅ 🟢 Success" : "🟢 Success", `kbd_setstyle_${btnKey}_success`).row()
    .text(current === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `kbd_setstyle_${btnKey}_danger`).row()
    .text(current === "default" ? "✅ ⚪ Default" : "⚪ Default (No Color)", `kbd_setstyle_${btnKey}_default`).row()
    .text("🔙 Back", `kbd_edit_${btnKey}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbd_setstyle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let raw = ctx.callbackQuery.data.replace("kbd_setstyle_", "");
  let lastIdx = raw.lastIndexOf("_");
  let btnKey = raw.substring(0, lastIdx);
  let style = raw.substring(lastIdx + 1);
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });

  if (style === "default") {
    await setReplyStyle(btnKey, "default");
    await ctx.answerCallbackQuery({ text: "⚪ Style removed (default)" });
  } else if (["primary", "success", "danger"].includes(style)) {
    await setReplyStyle(btnKey, style);
    await ctx.answerCallbackQuery({ text: `${STYLE_EMOJI[style]} ${STYLE_LABEL[style]} applied!` });
  } else {
    return ctx.answerCallbackQuery({ text: "❌ Invalid!", show_alert: true });
  }

  let current = await getReplyStyle(btnKey) || "default";
  let text = `✏️ *Edit Button*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Name: *${btn.name}*\n🎨 Style: ${STYLE_EMOJI[current]} \`${STYLE_LABEL[current]}\`\n📍 Row: ${btn.row + 1}\n\n━━━━━━━━━━━━━━━━━━━━`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `kbd_rename_${btnKey}`).row()
    .text("🎨 Set Style", `kbd_style_${btnKey}`).row()
    .text("🔄 Reset this Button", `kbd_resetbtn_${btnKey}`).row()
    .text("🔙 Back", "adm_customize_keyboard");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbd_resetbtn_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_resetbtn_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await resetReplyStyle(btnKey);
  await ctx.answerCallbackQuery({ text: "✅ Reset to default!", show_alert: true });
  let newStyle = await getReplyStyle(btnKey);
  let text = `✏️ *Edit Button*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 Name: *${btn.name}*\n🎨 Style: ${STYLE_EMOJI[newStyle || "default"]} \`${STYLE_LABEL[newStyle || "default"]}\`\n📍 Row: ${btn.row + 1}\n\n━━━━━━━━━━━━━━━━━━━━`;
  let kb = new InlineKeyboard()
    .text("📝 Rename", `kbd_rename_${btnKey}`).row()
    .text("🎨 Set Style", `kbd_style_${btnKey}`).row()
    .text("🔄 Reset this Button", `kbd_resetbtn_${btnKey}`).row()
    .text("🔙 Back", "adm_customize_keyboard");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbd_rowup_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let row = parseInt(ctx.callbackQuery.data.replace("kbd_rowup_", ""), 10);
  if (row <= 0) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move higher!", show_alert: true });
  let btnsInRow = await KeyboardLayout.find({ row });
  let btnsAbove = await KeyboardLayout.find({ row: row - 1 });
  for (let b of btnsInRow) { b.row = row - 1; await b.save(); }
  for (let b of btnsAbove) { b.row = row; await b.save(); }
  await ctx.answerCallbackQuery({ text: "⬆️ Row moved up!" });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^kbd_rowdown_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let row = parseInt(ctx.callbackQuery.data.replace("kbd_rowdown_", ""), 10);
  let allRows = await KeyboardLayout.distinct("row");
  let maxRow = Math.max(...allRows);
  if (row >= maxRow) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move lower!", show_alert: true });
  let btnsInRow = await KeyboardLayout.find({ row });
  let btnsBelow = await KeyboardLayout.find({ row: row + 1 });
  for (let b of btnsInRow) { b.row = row + 1; await b.save(); }
  for (let b of btnsBelow) { b.row = row; await b.save(); }
  await ctx.answerCallbackQuery({ text: "⬇️ Row moved down!" });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^kbd_btnup_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_btnup_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  let rowBtns = await KeyboardLayout.find({ row: btn.row }).sort({ position: 1 });
  let idx = rowBtns.findIndex(b => b.buttonKey === btnKey);
  if (idx <= 0) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move higher!", show_alert: true });
  let prev = rowBtns[idx - 1];
  let temp = prev.position; prev.position = btn.position; btn.position = temp;
  await prev.save(); await btn.save();
  await ctx.answerCallbackQuery({ text: "⬆️ Moved up!" });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^kbd_btndown_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_btndown_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  let rowBtns = await KeyboardLayout.find({ row: btn.row }).sort({ position: 1 });
  let idx = rowBtns.findIndex(b => b.buttonKey === btnKey);
  if (idx >= rowBtns.length - 1) return ctx.answerCallbackQuery({ text: "⚠️ Cannot move lower!", show_alert: true });
  let next = rowBtns[idx + 1];
  let temp = next.position; next.position = btn.position; btn.position = temp;
  await next.save(); await btn.save();
  await ctx.answerCallbackQuery({ text: "⬇️ Moved down!" });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery(/^kbd_move_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let btnKey = ctx.callbackQuery.data.replace("kbd_move_", "");
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  let allRows = await KeyboardLayout.distinct("row");
  let maxRow = Math.max(...allRows);
  let kb = new InlineKeyboard();
  for (let r = 0; r <= maxRow; r++) {
    let label = (r === btn.row) ? `✅ Row ${r + 1}` : `➡️ Row ${r + 1}`;
    kb = kb.text(label, `kbd_moveto_${btnKey}_${r}`).row();
  }
  kb = kb.text("🔙 Back", `kbd_edit_${btnKey}`);
  await ctx.editMessageText(`📦 *Move Button*\n\n📝 ${btn.name}\n📍 Current Row: ${btn.row + 1}\n\n👇 Choose target row:`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^kbd_moveto_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let raw = ctx.callbackQuery.data.replace("kbd_moveto_", "");
  let lastIdx = raw.lastIndexOf("_");
  let btnKey = raw.substring(0, lastIdx);
  let newRow = parseInt(raw.substring(lastIdx + 1), 10);
  let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
  if (!btn) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  let posInNew = await KeyboardLayout.countDocuments({ row: newRow });
  btn.row = newRow;
  btn.position = posInNew;
  await btn.save();
  await ctx.answerCallbackQuery({ text: `📦 Moved to Row ${newRow + 1}!` });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery("kbd_reset", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await KeyboardLayout.deleteMany({});
  await KeyboardStyle.deleteMany({});
  await KeyboardLayout.insertMany(DEFAULT_LAYOUT);
  await ctx.answerCallbackQuery({ text: "♻️ Reset to default!", show_alert: true });
  await ctx.editMessageText(await getKeyboardManageText(), { reply_markup: await getKeyboardManageKeyboard() }).catch(() => {});
});

bot.callbackQuery("kbd_update_all", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Updating..." });
  let allUsers = await User.find({});
  let kb = await buildReplyKeyboard();
  let count = 0, failed = 0;
  for (let u of allUsers) {
    try {
      await ctx.api.sendMessage(u.userId, "🎨 *Keyboard Updated by Admin!*", { parse_mode: "Markdown", reply_markup: kb });
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }
  await ctx.reply(`📊 *Update Report*\n\n✅ Updated: \`${count}\`\n❌ Failed: \`${failed}\`\n👥 Total: \`${allUsers.length}\``, { parse_mode: "Markdown" });
});

// ============================================================
// 🖌️ INLINE STYLE CALLBACKS
// ============================================================
bot.callbackQuery("adm_edit_inline_styles", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getInlineStylesText(), { reply_markup: await getInlineStylesKeyboard(), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^inline_scr_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let screen = decodeURIComponent(ctx.callbackQuery.data.replace("inline_scr_", ""));
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await getScreenText(screen), { reply_markup: await getScreenKeyboard(screen), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^inline_btn_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let buttonId = ctx.callbackQuery.data.replace("inline_btn_", "");
  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await ctx.answerCallbackQuery();
  let currentStyle = await getInlineStyle(buttonId) || "default";
  let text = `🎨 *Edit Style*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 *${meta.label}*\n📍 ${meta.screen}\n🎨 Current: ${STYLE_EMOJI[currentStyle]} \`${STYLE_LABEL[currentStyle]}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Pick a style:`;
  let kb = new InlineKeyboard()
    .text(currentStyle === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `inline_set_${buttonId}_primary`).row()
    .text(currentStyle === "success" ? "✅ 🟢 Success" : "🟢 Success", `inline_set_${buttonId}_success`).row()
    .text(currentStyle === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `inline_set_${buttonId}_danger`).row()
    .text(currentStyle === "default" ? "✅ ⚪ Default" : "⚪ Default (No Color)", `inline_set_${buttonId}_default`).row()
    .text("🔄 Reset this Button", `inline_reset_${buttonId}`).row()
    .text("🔙 Back", `inline_scr_${encodeURIComponent(meta.screen)}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^inline_set_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let raw = ctx.callbackQuery.data.replace("inline_set_", "");
  let lastIdx = raw.lastIndexOf("_");
  let buttonId = raw.substring(0, lastIdx);
  let newStyle = raw.substring(lastIdx + 1);
  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });

  if (newStyle === "default") {
    await setInlineStyle(buttonId, "default");
    await ctx.answerCallbackQuery({ text: "⚪ Style removed (default)" });
  } else if (["primary", "success", "danger"].includes(newStyle)) {
    await setInlineStyle(buttonId, newStyle);
    await ctx.answerCallbackQuery({ text: `${STYLE_EMOJI[newStyle]} Applied!` });
  } else {
    return ctx.answerCallbackQuery({ text: "❌ Invalid!", show_alert: true });
  }

  let currentStyle = await getInlineStyle(buttonId) || "default";
  let text = `🎨 *Edit Style*\n\n━━━━━━━━━━━━━━━━━━━━\n\n📝 *${meta.label}*\n📍 ${meta.screen}\n🎨 Current: ${STYLE_EMOJI[currentStyle]} \`${STYLE_LABEL[currentStyle]}\`\n\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Pick a style:`;
  let kb = new InlineKeyboard()
    .text(currentStyle === "primary" ? "✅ 🔵 Primary" : "🔵 Primary", `inline_set_${buttonId}_primary`).row()
    .text(currentStyle === "success" ? "✅ 🟢 Success" : "🟢 Success", `inline_set_${buttonId}_success`).row()
    .text(currentStyle === "danger" ? "✅ 🔴 Danger" : "🔴 Danger", `inline_set_${buttonId}_danger`).row()
    .text(currentStyle === "default" ? "✅ ⚪ Default" : "⚪ Default (No Color)", `inline_set_${buttonId}_default`).row()
    .text("🔄 Reset this Button", `inline_reset_${buttonId}`).row()
    .text("🔙 Back", `inline_scr_${encodeURIComponent(meta.screen)}`);
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^inline_reset_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let buttonId = ctx.callbackQuery.data.replace("inline_reset_", "");
  let meta = INLINE_BUTTONS_REGISTRY.find(b => b.id === buttonId);
  if (!meta) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  await resetInlineStyle(buttonId);
  await ctx.answerCallbackQuery({ text: "✅ Reset!", show_alert: true });
  await ctx.editMessageText(await getScreenText(meta.screen), { reply_markup: await getScreenKeyboard(meta.screen), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("inline_reset_all", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await InlineStyle.deleteMany({});
  await ctx.answerCallbackQuery({ text: "🔄 All reset!", show_alert: true });
  await ctx.editMessageText(await getInlineStylesText(), { reply_markup: await getInlineStylesKeyboard(), parse_mode: "Markdown" }).catch(() => {});
});


// ============================================================
// 🚀 /start COMMAND
// ============================================================
bot.command("start", async (ctx) => {
  try {
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
      let notifMsg = `🆕 *New User Started Bot!*\n\n👤 ${nameStr}\n🆔 \`${userId}\`\n📛 ${usernameStr}\n📅 ${new Date().toLocaleString('en-IN')}`;
      let profileKb = new InlineKeyboard().url("👤 Open Profile", `tg://user?id=${userId}`);
      try { await ctx.api.sendMessage(MAIN_OWNER_ID, notifMsg, { parse_mode: "Markdown", reply_markup: profileKb }); } catch (e) {}
    }

    if (user.isBanned) return ctx.reply("❌ You are banned from using this bot.");

    let isJoined = await checkForceJoin(ctx);
    if (!isJoined) {
      let channels = await getConfig("forced_channels", []);
      let rows = [];
      for (let i = 0; i < channels.length; i++) {
        let ch = channels[i];
        let btn = await iurl("join_channel", `📢 Join Channel ${i + 1}`, `https://t.me/${ch.replace('@', '')}`);
        rows.push([btn]);
      }
      let verifyBtn = await ibtn("joined_verify", "✅ I have Joined", "check_join");
      rows.push([verifyBtn]);
      let joinText = await getConfig("text_forced_join", "⚠️ You must join our channels to use this bot!\n\nJoin the channels below and click 'I have Joined':");
      return ctx.reply(joinText, { reply_markup: buildIKB(rows) });
    }

    let welcomeText = await getConfig("text_welcome", `👋 Hello ${ctx.from.first_name || "User"}!\n\nWelcome to Payment Task Bot!`);
    await ctx.reply(welcomeText, { reply_markup: await buildReplyKeyboard() });
  } catch (err) { console.error("Error /start:", err); }
});

bot.callbackQuery("check_join", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  let isJoined = await checkForceJoin(ctx);
  if (!isJoined) return ctx.answerCallbackQuery({ text: "❌ Join all channels first!", show_alert: true });
  await ctx.deleteMessage().catch(() => {});
  let welcomeText = await getConfig("text_welcome", `👋 Welcome back! Choose an option below:`);
  await ctx.reply(welcomeText, { reply_markup: await buildReplyKeyboard() });
});

// ============================================================
// 👑 OTHER ADMIN CALLBACKS
// ============================================================
bot.callbackQuery("adm_add_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_rem_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_user_tracker", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 Send User ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_min_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Send new Min:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_max_w", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Send new Max:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Send Payout Channel:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_reset_bal", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Send UserID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_channels", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let channels = await getConfig("forced_channels", []);
  userState[ctx.from.id] = "WAITING_FOR_CHANNEL_ADD";
  await ctx.editMessageText(`📢 Channels: ${channels.join(", ") || "None"}\n\nSend channel or "clear":`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_create_gift", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_GIFT_CREATE";
  await ctx.editMessageText("🎁 Format: CODE Amount MaxUses", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_broadcast", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText("📢 Send broadcast:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_admins", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let admins = await getConfig("admins", []);
  userState[ctx.from.id] = "WAITING_FOR_ADMIN_ID";
  await ctx.editMessageText(`👥 Admins: ${admins.join(", ") || "None"}\n\nSend UserID to add/remove:`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_transfer", async (ctx) => {
  if (ctx.from.id !== (await getConfig("owner_id", MAIN_OWNER_ID))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  userState[ctx.from.id] = "WAITING_FOR_NEW_OWNER";
  await ctx.editMessageText("👑 Send new Owner UserID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});
bot.callbackQuery("adm_set_support", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let cur = await getConfig("support_username", "Not Set");
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.editMessageText(`💬 Current: \`${cur}\`\n\nSend new support:`, { reply_markup: new InlineKeyboard().text("🔙 Back", "admin"), parse_mode: "Markdown" });
});

bot.callbackQuery("adm_all_balances", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery();
  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) return ctx.reply("📊 No users.");
  let total = 0;
  let msg = "📊 *All Users Balance*\n\n";
  users.forEach((u, i) => {
    total += u.balance;
    msg += `${i + 1}. \`${u.userId}\` → ₹${u.balance.toFixed(2)}\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━\n👥 ${users.length} | 💵 ₹${total.toFixed(2)}`;
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") });
});

// ============================================================
// 📋 TASK MANAGER
// ============================================================
async function renderTaskManager(ctx) {
  let tasks = await Task.find({});
  let kb = new InlineKeyboard();
  if (tasks.length === 0) kb.text("📂 No Tasks", "noop").row();
  else tasks.forEach(t => {
    kb.text(`📄 ${t.title}`, `view_task_${t.taskId}`).text("✏️", `edit_task_${t.taskId}`).text("🗑️", `del_task_${t.taskId}`).row();
  });
  kb.text("➕ Add New Task", "adm_create_task").row();
  kb.text("➕ Add Channel For Task Alert", "adm_add_task_channel").row();
  kb.text("🔙 Back", "admin");
  await ctx.editMessageText("💡 *Task Manager*\n\nSelect a task:", { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}
bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  await ctx.answerCallbackQuery();
  await renderTaskManager(ctx);
});
bot.callbackQuery(/^view_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  let msg = `📋 *Task: ${task.title}*\n\n💰 ₹${task.reward}\n🔗 ${task.link}\n⏱️ ${task.timeLimitMinutes || 0} min\n🔔 ${task.alertEnabled ? "ON" : "OFF"}\n📢 ${task.alertChannel}`;
  let kb = new InlineKeyboard().text("✏️ Edit", `edit_task_${tId}`).text("🗑️ Delete", `del_task_${tId}`).row().text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});
bot.callbackQuery(/^edit_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("edit_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(`✏️ *Edit: ${task.title}*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});
bot.callbackQuery(/^toggle_t_alert_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("toggle_t_alert_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  task.alertEnabled = !task.alertEnabled;
  await task.save();
  await ctx.answerCallbackQuery({ text: `Alert ${task.alertEnabled ? "ON" : "OFF"}` });
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(`✏️ *Edit: ${task.title}*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});
bot.callbackQuery(/^set_t_time_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("set_t_time_", "");
  userState[ctx.from.id] = `WAITING_FOR_TASK_TIME_${tId}`;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`⏱️ Send minutes (0 to disable):`, { reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`) });
});
bot.callbackQuery(/^del_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  await Task.deleteOne({ taskId: tId });
  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await renderTaskManager(ctx);
});
bot.callbackQuery("adm_create_task", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText("📋 Format: TaskID | Title | Reward | Link", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});
bot.callbackQuery("adm_add_task_channel", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_ALERT_CHANNEL";
  await ctx.editMessageText("📢 Send channel username or ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});

// ============================================================
// 🔍 USER TRACKER
// ============================================================
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tid = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: tid }).sort({ createdAt: -1 }).limit(15);
  let msg = `📊 Balance Record\n\n`;
  history.forEach((h, i) => { msg += `${i + 1}. ${h.action}: ₹${h.amount}\n`; });
  await ctx.editMessageText(msg || "No records", { reply_markup: new InlineKeyboard().text("🔙 Back", `track_back_${tid}`) }).catch(() => {});
});
bot.callbackQuery(/^track_wd_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tid = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let wds = await Withdrawal.find({ userId: tid }).sort({ createdAt: -1 }).limit(15);
  let msg = `🏧 Withdrawals\n\n`;
  wds.forEach((w, i) => { msg += `${i + 1}. ₹${w.amount} | ${w.status}\n`; });
  await ctx.editMessageText(msg || "No records", { reply_markup: new InlineKeyboard().text("🔙 Back", `track_back_${tid}`) }).catch(() => {});
});
bot.callbackQuery(/^track_ref_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tid = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let u = await User.findOne({ userId: tid });
  if (!u) return;
  let kb = new InlineKeyboard()
    .text("📜 Balance Record", `track_bal_${tid}`).row()
    .text("🏧 Withdraw History", `track_wd_${tid}`).row()
    .text("🔄 Refresh", `track_ref_${tid}`).row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(generateTrackerText(u), { reply_markup: kb }).catch(() => {});
});
bot.callbackQuery(/^track_back_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let tid = parseInt(ctx.callbackQuery.data.replace("track_back_", ""), 10);
  let u = await User.findOne({ userId: tid });
  if (!u) return;
  let kb = new InlineKeyboard()
    .text("📜 Balance Record", `track_bal_${tid}`).row()
    .text("🏧 Withdraw History", `track_wd_${tid}`).row()
    .text("🔄 Refresh", `track_ref_${tid}`).row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(generateTrackerText(u), { reply_markup: kb }).catch(() => {});
});

// ============================================================
// 🏧 WITHDRAWAL — AUTO PAYMENT VIA UNIVERSAL GATEWAY
// ============================================================
bot.callbackQuery(/^conf_wd_/, async (ctx) => {
  let parts = ctx.callbackQuery.data.replace("conf_wd_", "").split("_");
  let amount = parseFloat(parts[parts.length - 1]);
  let method = parts.slice(0, parts.length - 1).join(" ");
  let userId = ctx.from.id;
  let user = await getUser(userId);
  if (user.balance < amount) return ctx.answerCallbackQuery({ text: "❌ Insufficient!", show_alert: true });

  // Deduct balance
  user.balance -= amount;
  user.withdrawnTotal = (user.withdrawnTotal || 0) + amount;
  await user.save();
  await logBalanceHistory(userId, `Withdrawal via ${method}`, -amount);

  // Get details based on method
  let details = method === "Wallet" ? user.walletAccount :
                method === "UPI" ? user.upiId :
                method === "Bank" ? `${user.bankAccNo}, ${user.bankIfsc}` :
                method === "Amazon" ? user.amazonEmail :
                user.redeemCodeAddr;

  let wId = Math.floor(100000 + Math.random() * 900000).toString();

  let wd = await Withdrawal.create({
    withdrawalId: wId, userId, amount, method, details,
    status: "Pending", autoPaid: false
  });

  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });
  await ctx.editMessageText(
    `⏳ *Processing Withdrawal...*\n\n` +
    `💰 Amount: ₹${amount}\n` +
    `💳 Method: ${method}\n\n` +
    `_Please wait while we process your payment._`,
    { parse_mode: "Markdown" }
  );

  // Find active gateway
  let activeGateway = await getActiveGateway();
  let botInfo = await ctx.api.getMe();
  let botUsername = `@${botInfo.username}`;

  if (!activeGateway) {
    // No gateway — manual approval
    let pChannel = await getConfig("payout_channel", null);
    if (pChannel) {
      let maskedDetails = maskDetails(method, details);
      let approveBtn = await ibtn("task_approve", "✅ Approve", `wd_app_${wId}`);
      let rejectBtn  = await ibtn("task_reject",  "❌ Reject",  `wd_rej_${wId}`);
      let userMention = `[${userId}](tg://user?id=${userId})`;
      let msg = `🔔 *New Withdrawal Request*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `👤 *User:* ${userMention}\n🆔 *User ID:* \`${userId}\`\n` +
                `💰 *Amount:* ₹${amount.toFixed(2)}\n💳 *Method:* ${method}\n` +
                `🏦 *Details:* \`${maskedDetails}\`\n` +
                `⚠️ *No gateway — Manual approval needed*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n👇 *Action:*`;
      try {
        await ctx.api.sendMessage(pChannel, msg, { parse_mode: "Markdown", reply_markup: buildIKB([[approveBtn, rejectBtn]]) });
      } catch (e) {}
    }
    await ctx.editMessageText(
      `✅ *Withdrawal Submitted!*\n\n💰 ₹${amount}\n💳 ${method}\n\n🕐 Status: *Pending* (Manual approval)`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ⚡ AUTO PAYMENT via gateway (Universal)
  let paymentData = { amount, details, userId, orderId: wId, name: ctx.from.first_name || "", method };
  let result = await sendPaymentToGateway(activeGateway, paymentData);

  // Update record
  wd.gatewayName = activeGateway.name;
  wd.gatewayRef = result.ref || "";
  wd.gatewayResponse = result.data;
  wd.autoPaid = true;

  let maskedAddress = maskAddress(details);

  let gatewayResponseText = "";
  if (result.data) {
    try { gatewayResponseText = JSON.stringify(result.data); }
    catch (e) { gatewayResponseText = String(result.data); }
  } else {
    gatewayResponseText = JSON.stringify({ error: result.error || "Unknown error" });
  }
  gatewayResponseText = gatewayResponseText.replace(/`/g, "'");

  if (result.success) {
    wd.status = "AutoSuccess";
    await wd.save();

    let successMsg =
      `✅ *New Withdrawal Processed* ✅\n\n` +
      `🟢 *User :* ${userId}\n` +
      `✌️ *Remaining Balance :-* ${user.balance.toFixed(2)}\n\n` +
      `🚀 *Amount :* ${amount.toFixed(1)} INR (-)\n` +
      `⛔ *Address :* ${maskedAddress}\n\n` +
      `💡 *Bot:* ${botUsername}\n\n` +
      `⚠️ *${activeGateway.name} Wallet Response:* \`${gatewayResponseText}\``;

    await ctx.editMessageText(successMsg, { parse_mode: "Markdown" });

    // Notify payout channel
    await sendPayoutChannelNotification(ctx, wd, activeGateway, result, user, maskedAddress, botUsername);
  } else {
    wd.status = "AutoFailed";
    await wd.save();

    // Refund
    user.balance += amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - amount);
    await user.save();
    await logBalanceHistory(userId, `Auto-Failed Refund`, amount);

    let failMsg =
      `❌ *Withdrawal Failed* ❌\n\n` +
      `🟢 *User :* ${userId}\n` +
      `✌️ *Remaining Balance :-* ${user.balance.toFixed(2)}\n\n` +
      `🚀 *Amount :* ${amount.toFixed(1)} INR\n` +
      `⛔ *Address :* ${maskedAddress}\n\n` +
      `💡 *Bot:* ${botUsername}\n\n` +
      `⚠️ *${activeGateway.name} Response:* \`${gatewayResponseText}\`\n\n` +
      `💵 _Amount refunded to your balance._`;

    await ctx.editMessageText(failMsg, { parse_mode: "Markdown" });

    await sendPayoutChannelNotification(ctx, wd, activeGateway, result, user, maskedAddress, botUsername);
  }
});

// Payout channel notification
async function sendPayoutChannelNotification(ctx, withdrawal, gateway, autoResult, user, maskedAddress, botUsername) {
  let pChannel = await getConfig("payout_channel", null);
  if (!pChannel) return;

  let gatewayResponseText = "";
  if (autoResult.data) {
    try { gatewayResponseText = JSON.stringify(autoResult.data); }
    catch (e) { gatewayResponseText = String(autoResult.data); }
  } else {
    gatewayResponseText = JSON.stringify({ error: autoResult.error || "Unknown" });
  }
  gatewayResponseText = gatewayResponseText.replace(/`/g, "'");

  if (autoResult.success) {
    let msg =
      `✅ *New Withdrawal Processed* ✅\n\n` +
      `🟢 *User :* ${withdrawal.userId}\n` +
      `✌️ *Remaining Balance :-* ${user ? user.balance.toFixed(2) : "0"}\n\n` +
      `🚀 *Amount :* ${withdrawal.amount.toFixed(1)} INR (-)\n` +
      `⛔ *Address :* ${maskedAddress}\n\n` +
      `💡 *Bot:* ${botUsername}\n\n` +
      `⚠️ *${gateway.name} Wallet Response:* \`${gatewayResponseText}\``;

    try { await ctx.api.sendMessage(pChannel, msg, { parse_mode: "Markdown" }); }
    catch (e) { console.error("Payout notify failed:", e); }
  } else {
    let msg =
      `❌ *Withdrawal Failed* ❌\n\n` +
      `🟢 *User :* ${withdrawal.userId}\n` +
      `🚀 *Amount :* ${withdrawal.amount.toFixed(1)} INR\n` +
      `⛔ *Address :* ${maskedAddress}\n\n` +
      `💡 *Bot:* ${botUsername}\n\n` +
      `⚠️ *${gateway.name} Response:* \`${gatewayResponseText}\`\n` +
      `🔴 *Error:* ${autoResult.error || "Unknown"}`;

    try { await ctx.api.sendMessage(pChannel, msg, { parse_mode: "Markdown" }); }
    catch (e) { console.error("Payout notify failed:", e); }
  }
}

// Cancel withdrawal
bot.callbackQuery("canc_wd", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  await ctx.editMessageText("❌ Cancelled.");
});

// Manual approve (no-gateway)
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  wd.status = "Approved"; await wd.save();
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let targetUser = await User.findOne({ userId: wd.userId });
  let userMention = targetUser ? `[${wd.userId}](tg://user?id=${wd.userId})` : `\`${wd.userId}\``;
  let maskedDetails = maskDetails(wd.method, wd.details);
  let adminName = ctx.from.first_name || "Admin";

  let newText = `✅ *WITHDRAWAL APPROVED*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `👤 *User:* ${userMention}\n` +
                `🆔 *User ID:* \`${wd.userId}\`\n` +
                `💰 *Amount:* ₹${wd.amount.toFixed(2)}\n` +
                `💳 *Method:* ${wd.method}\n` +
                `🏦 *Details:* \`${maskedDetails}\`\n` +
                `🕐 *Processed:* ${new Date().toLocaleString('en-IN')}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n✅ *APPROVED* by ${adminName}`;
  try { await ctx.editMessageText(newText, { parse_mode: "Markdown" }); } catch (e) {}

  try {
    let url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    await ctx.api.sendMessage(wd.userId, `💸 *Payment Successful!*\n\n💰 ₹${wd.amount.toFixed(2)}\n💳 ${wd.method}`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().webApp("🚀 Check Status", `${url}/receipt/${wd.withdrawalId}`)
    });
  } catch (e) {}
});

// Manual reject
bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  wd.status = "Rejected"; await wd.save();
  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Refunded`, wd.amount);
  await ctx.answerCallbackQuery({ text: "❌ Rejected & Refunded!" });

  let targetUser = await User.findOne({ userId: wd.userId });
  let userMention = targetUser ? `[${wd.userId}](tg://user?id=${wd.userId})` : `\`${wd.userId}\``;
  let maskedDetails = maskDetails(wd.method, wd.details);
  let adminName = ctx.from.first_name || "Admin";

  let newText = `❌ *WITHDRAWAL REJECTED*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `👤 *User:* ${userMention}\n` +
                `🆔 *User ID:* \`${wd.userId}\`\n` +
                `💰 *Amount:* ₹${wd.amount.toFixed(2)}\n` +
                `💳 *Method:* ${wd.method}\n` +
                `🏦 *Details:* \`${maskedDetails}\`\n` +
                `🕐 *Processed:* ${new Date().toLocaleString('en-IN')}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n❌ *REJECTED* by ${adminName}\n💵 *Amount Refunded*`;
  try { await ctx.editMessageText(newText, { parse_mode: "Markdown" }); } catch (e) {}
  try { await ctx.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected. Amount refunded.`); } catch (e) {}
});

// ============================================================
// 📋 TASK SUBMISSION APPROVAL
// ============================================================
bot.callbackQuery(/^task_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let subId = ctx.callbackQuery.data.replace("task_app_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  sub.status = "Approved"; await sub.save();
  let user = await getUser(sub.userId);
  user.balance += sub.reward;
  await user.save();
  await logBalanceHistory(sub.userId, `Task Approved`, sub.reward);
  let task = await Task.findOne({ taskId: sub.taskId });
  if (task && !task.completedUsers.includes(sub.userId)) { task.completedUsers.push(sub.userId); await task.save(); }
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  try {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED* by ${ctx.from.first_name || "Admin"}`,
      parse_mode: "Markdown"
    });
  } catch (e) {}
  try { await ctx.api.sendMessage(sub.userId, `🎉 *Task Approved!*\n\n📌 ${sub.taskTitle}\n💰 ₹${sub.reward}`, { parse_mode: "Markdown" }); } catch (e) {}
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub || sub.status !== "Pending") return ctx.answerCallbackQuery({ text: "Already processed!", show_alert: true });
  sub.status = "Rejected"; await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  try {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED* by ${ctx.from.first_name || "Admin"}`,
      parse_mode: "Markdown"
    });
  } catch (e) {}
  try { await ctx.api.sendMessage(sub.userId, `❌ Task Rejected: ${sub.taskTitle}`); } catch (e) {}
});

// ============================================================
// 💬 TEXT HANDLER (with 3-step Gateway setup)
// ============================================================
bot.on("message:text", async (ctx, next) => {
  let text = ctx.message.text.trim();
  let userId = ctx.from.id;
  let state = userState[userId];

  if (state) {
    if (text === "❌ Cancel Task") {
      delete userState[userId];
      await ctx.reply("❌ Cancelled.", { reply_markup: await buildReplyKeyboard() });
      return;
    }

    // ===== GATEWAY ADD — Step 1/3: Name =====
    if (state === "GW_ADD_NAME" && (await isAdmin(userId))) {
      userState[userId] = `GW_ADD_URL_${text}`;
      return ctx.reply(
        `✅ Name: *${text}*\n\n` +
        `🔌 *Step 2/3 — API URL*\n\n` +
        `Send the *full API URL*\n\n` +
        `Examples:\n` +
        `• \`https://ultra-pay.in/APIs/api\`\n` +
        `• \`https://api.paytm.com/pay\``,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_gateway_list") }
      );
    }

    // ===== GATEWAY ADD — Step 2/3: URL =====
    if (state.startsWith("GW_ADD_URL_") && (await isAdmin(userId))) {
      let name = state.replace("GW_ADD_URL_", "");
      let url = text.trim();
      userState[userId] = `GW_ADD_PARAMS_${name}|||${url}`;
      return ctx.reply(
        `✅ URL saved!\n\n` +
        `🔌 *Step 3/3 — Params*\n\n` +
        `Send params in this format:\n\n` +
        `\`\`\`\n` +
        `token=P7HrpXCZLTQpd1hLNroxduBqpOmg0cTXpYnX7b5n1B\n` +
        `key=2j6djFlhsWBT7o7O\n` +
        `paytoNumber={upi}\n` +
        `amount={amount}\n` +
        `comment=Monthly payment\n` +
        `\`\`\`\n\n` +
        `💡 *Dynamic values:*\n` +
        `• \`{upi}\` → user address\n` +
        `• \`{amount}\` → withdrawal amount\n` +
        `• \`{userId}\` → user ID\n` +
        `• \`{orderId}\` → order ID\n\n` +
        `⚠️ *Each param on a new line*\n` +
        `\`key=value\` format`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "adm_gateway_list") }
      );
    }

    // ===== GATEWAY ADD — Step 3/3: Params =====
    if (state.startsWith("GW_ADD_PARAMS_") && (await isAdmin(userId))) {
      let raw = state.replace("GW_ADD_PARAMS_", "");
      let [name, url] = raw.split("|||");
      let params = {};
      let lines = text.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line || !line.includes("=")) continue;
        let idx = line.indexOf("=");
        let k = line.substring(0, idx).trim();
        let v = line.substring(idx + 1).trim();
        if (k) params[k] = v;
      }
      delete userState[userId];

      if (Object.keys(params).length === 0) {
        return ctx.reply(
          `❌ *No valid params!*\n\n` +
          `Format: \`key=value\` on each line\n\n` +
          `Try again or use ➕ Add New Gateway.`,
          { parse_mode: "Markdown" }
        );
      }

      let gwId = "gw_" + uuidv4().replace(/-/g, "").substring(0, 12);
      await Gateway.create({
        gatewayId: gwId,
        name, url,
        method: "GET",
        params,
        active: true
      });

      let paramPreview = Object.entries(params).map(([k, v]) => `   • \`${k}\` = \`${v}\``).join("\n");

      return ctx.reply(
        `🎉 *Gateway Added Successfully!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📛 *Name:* ${name}\n` +
        `📡 *Method:* GET\n` +
        `🔗 *URL:*\n\`${url}\`\n\n` +
        `🔑 *Params (${Object.keys(params).length}):*\n${paramPreview}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✅ *Ready to use!* Every withdrawal will now auto-pay via this gateway.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔌 View Gateways", "adm_gateway_list") }
      );
    }

    // Edit gateway name
    if (state.startsWith("GW_EDIT_NAME_") && (await isAdmin(userId))) {
      let gwId = state.replace("GW_EDIT_NAME_", "");
      delete userState[userId];
      let gw = await getGatewayById(gwId);
      if (!gw) return ctx.reply("❌ Not found!");
      gw.name = text; await gw.save();
      return ctx.reply(`✅ Name updated to: *${text}*`, { parse_mode: "Markdown" });
    }

    // Edit gateway URL
    if (state.startsWith("GW_EDIT_URL_") && (await isAdmin(userId))) {
      let gwId = state.replace("GW_EDIT_URL_", "");
      delete userState[userId];
      let gw = await getGatewayById(gwId);
      if (!gw) return ctx.reply("❌ Not found!");
      gw.url = text; await gw.save();
      return ctx.reply(`✅ URL updated!`);
    }

    // Edit gateway params
    if (state.startsWith("GW_EDIT_PARAMS_") && (await isAdmin(userId))) {
      let gwId = state.replace("GW_EDIT_PARAMS_", "");
      delete userState[userId];
      let gw = await getGatewayById(gwId);
      if (!gw) return ctx.reply("❌ Not found!");
      let params = {};
      let lines = text.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line || !line.includes("=")) continue;
        let idx = line.indexOf("=");
        let k = line.substring(0, idx).trim();
        let v = line.substring(idx + 1).trim();
        if (k) params[k] = v;
      }
      if (Object.keys(params).length === 0) return ctx.reply("❌ No valid params! Use `key=value` format.", { parse_mode: "Markdown" });
      gw.params = params;
      await gw.save();
      return ctx.reply(
        `✅ *Params updated!* (${Object.keys(params).length} params)`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔌 View Gateway", `gw_view_${gwId}`) }
      );
    }

    // Keyboard rename
    if (state.startsWith("KBD_RENAME_") && (await isAdmin(userId))) {
      let btnKey = state.replace("KBD_RENAME_", "");
      delete userState[userId];
      let btn = await KeyboardLayout.findOne({ buttonKey: btnKey });
      if (!btn) return ctx.reply("❌ Not found!");
      btn.name = text; await btn.save();
      return ctx.reply(`✅ Renamed to: ${text}`);
    }

    if (state === "WAITING_FOR_SUPPORT_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("support_username", text);
      return ctx.reply(`✅ Support: ${text}`);
    }
    if (state.startsWith("WAITING_FOR_TASK_TIME_") && (await isAdmin(userId))) {
      let tId = state.replace("WAITING_FOR_TASK_TIME_", "");
      delete userState[userId];
      let mins = parseInt(text, 10);
      if (isNaN(mins)) return ctx.reply("❌ Invalid!");
      await Task.findOneAndUpdate({ taskId: tId }, { timeLimitMinutes: mins });
      return ctx.reply(`✅ Time: ${mins} min`);
    }
    if (state === "WAITING_FOR_TASK_ALERT_CHANNEL" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("default_task_alert_channel", text);
      return ctx.reply(`✅ Channel: ${text}`);
    }
    if (state === "WAITING_FOR_TRACKER_ID" && (await isAdmin(userId))) {
      delete userState[userId];
      let tid = parseInt(text, 10);
      if (isNaN(tid)) return ctx.reply("❌ Invalid!");
      let u = await User.findOne({ userId: tid });
      if (!u) return ctx.reply("❌ Not found!");
      let kb = new InlineKeyboard()
        .text("📜 Balance Record", `track_bal_${tid}`).row()
        .text("🏧 Withdraw History", `track_wd_${tid}`).row()
        .text("🔄 Refresh", `track_ref_${tid}`).row()
        .text("🔙 Back", "admin");
      return ctx.reply(generateTrackerText(u), { reply_markup: kb });
    }
    if (state === "WAITING_FOR_ADD_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let [tid, amt] = text.split(" ").map(x => x.trim());
      let t = parseInt(tid, 10), a = parseFloat(amt);
      if (isNaN(t) || isNaN(a)) return ctx.reply("❌ Use: UserID Amount");
      let u = await User.findOneAndUpdate({ userId: t }, { $inc: { balance: a } }, { new: true, upsert: true });
      await logBalanceHistory(t, "Admin Added", a);
      return ctx.reply(`✅ Added ₹${a}. New: ₹${u.balance.toFixed(2)}`);
    }
    if (state === "WAITING_FOR_REM_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let [tid, amt] = text.split(" ").map(x => x.trim());
      let t = parseInt(tid, 10), a = parseFloat(amt);
      if (isNaN(t) || isNaN(a)) return ctx.reply("❌ Use: UserID Amount");
      let u = await getUser(t);
      u.balance = Math.max(0, u.balance - a);
      await u.save();
      await logBalanceHistory(t, "Admin Removed", -a);
      return ctx.reply(`✅ Removed. New: ₹${u.balance.toFixed(2)}`);
    }
    if (state === "WAITING_FOR_MIN_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let a = parseFloat(text);
      if (isNaN(a)) return ctx.reply("❌ Invalid!");
      await setConfig("min_withdraw", a);
      return ctx.reply(`✅ Min: ₹${a}`);
    }
    if (state === "WAITING_FOR_MAX_W" && (await isAdmin(userId))) {
      delete userState[userId];
      let a = parseFloat(text);
      if (isNaN(a)) return ctx.reply("❌ Invalid!");
      await setConfig("max_withdraw", a);
      return ctx.reply(`✅ Max: ₹${a}`);
    }
    if (state === "WAITING_FOR_P_CHAN" && (await isAdmin(userId))) {
      delete userState[userId];
      await setConfig("payout_channel", text);
      return ctx.reply(`✅ Payout: ${text}`);
    }
    if (state === "WAITING_FOR_RESET_BAL" && (await isAdmin(userId))) {
      delete userState[userId];
      let t = parseInt(text, 10);
      if (isNaN(t)) return ctx.reply("❌ Invalid!");
      await User.findOneAndUpdate({ userId: t }, { balance: 0 });
      return ctx.reply(`✅ Reset done.`);
    }
    if (state === "WAITING_FOR_CHANNEL_ADD" && (await isAdmin(userId))) {
      delete userState[userId];
      if (text.toLowerCase() === "clear") { await setConfig("forced_channels", []); return ctx.reply("✅ Cleared."); }
      let ch = await getConfig("forced_channels", []);
      if (!ch.includes(text)) ch.push(text);
      await setConfig("forced_channels", ch);
      return ctx.reply(`✅ Channel: ${text}`);
    }
    if (state === "WAITING_FOR_TASK_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let p = text.split("|").map(x => x.trim());
      if (p.length < 4) return ctx.reply("❌ Use: ID | Title | Reward | Link");
      let alertCh = await getConfig("default_task_alert_channel", "Not Set");
      await Task.create({ taskId: p[0], title: p[1], reward: parseFloat(p[2]), link: p[3], alertChannel: alertCh });
      return ctx.reply(`✅ Task created!`);
    }
    if (state === "WAITING_FOR_GIFT_CREATE" && (await isAdmin(userId))) {
      delete userState[userId];
      let p = text.split(" ");
      if (p.length < 3) return ctx.reply("❌ Use: CODE Amount MaxUses");
      await GiftCode.create({ code: p[0], amount: parseFloat(p[1]), maxUses: parseInt(p[2], 10) });
      return ctx.reply(`✅ Gift code: ${p[0]}`);
    }
    if (state === "WAITING_FOR_BROADCAST" && (await isAdmin(userId))) {
      delete userState[userId];
      let users = await User.find({});
      let c = 0;
      for (let u of users) { try { await ctx.api.sendMessage(u.userId, text); c++; } catch (e) {} }
      return ctx.reply(`✅ Sent to ${c} users`);
    }
    if (state === "WAITING_FOR_ADMIN_ID") {
      delete userState[userId];
      let aid = parseInt(text, 10);
      if (isNaN(aid)) return ctx.reply("❌ Invalid!");
      let admins = await getConfig("admins", []);
      if (admins.includes(aid)) { admins = admins.filter(x => x !== aid); await setConfig("admins", admins); return ctx.reply(`✅ Removed.`); }
      admins.push(aid); await setConfig("admins", admins);
      return ctx.reply(`✅ Added ${aid}`);
    }
    if (state === "WAITING_FOR_NEW_OWNER") {
      delete userState[userId];
      let n = parseInt(text, 10);
      if (isNaN(n)) return ctx.reply("❌ Invalid!");
      await setConfig("owner_id", n);
      return ctx.reply(`👑 Transferred!`);
    }

    // ===== USER PAYMENT METHOD INPUTS =====
    if (state === "SET_WALLET_ACC") {
      if (!text || text.length < 3) return ctx.reply("❌ Invalid wallet details!");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { walletAccount: text });
      return ctx.reply(`✅ *Wallet saved:* \`${text}\``, { parse_mode: "Markdown" });
    }
    if (state === "SET_UPI_ACC") {
      if (!isValidUPI(text)) {
        return ctx.reply(
          `❌ *Invalid UPI ID!*\n\n` +
          `Format: \`username@bank\`\n\n` +
          `Examples:\n• \`user@ybl\`\n• \`john.doe@paytm\`\n• \`abc123@oksbi\`\n\n` +
          `👉 Try again:`,
          { parse_mode: "Markdown" }
        );
      }
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { upiId: text.trim() });
      return ctx.reply(`✅ *UPI saved:* \`${text.trim()}\``, { parse_mode: "Markdown" });
    }
    if (state === "SET_BANK_ACC") {
      let p = text.split("|").map(x => x.trim());
      if (p.length < 3) {
        return ctx.reply(
          `❌ *Invalid format!*\n\n` +
          `Use: \`AccNo | IFSC | BankName\`\n\n` +
          `Example:\n\`123456789012 | SBIN0001234 | State Bank\``,
          { parse_mode: "Markdown" }
        );
      }
      let [accNo, ifsc, bankName] = p;
      if (!isValidAccountNo(accNo)) {
        return ctx.reply(`❌ *Invalid Account Number!*\n\nMust be 9-18 digits.`, { parse_mode: "Markdown" });
      }
      if (!isValidIFSC(ifsc)) {
        return ctx.reply(`❌ *Invalid IFSC Code!*\n\nFormat: \`ABCD0123456\``, { parse_mode: "Markdown" });
      }
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, {
        bankAccNo: accNo,
        bankIfsc: ifsc.toUpperCase(),
        bankName: bankName
      });
      return ctx.reply(
        `✅ *Bank saved!*\n\n` +
        `🏦 Acc: \`${maskValue(accNo)}\`\n` +
        `🔢 IFSC: \`${ifsc.toUpperCase()}\`\n` +
        `🏛️ Bank: ${bankName}`,
        { parse_mode: "Markdown" }
      );
    }
    if (state === "SET_AMAZON_ACC") {
      if (!isValidEmail(text)) {
        return ctx.reply(`❌ *Invalid Email!*\n\nFormat: \`user@domain.com\``, { parse_mode: "Markdown" });
      }
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { amazonEmail: text.trim() });
      return ctx.reply(`✅ *Amazon email:* \`${text.trim()}\``, { parse_mode: "Markdown" });
    }
    if (state === "SET_REDEEM_ACC") {
      if (!text || text.length < 3) return ctx.reply("❌ Invalid redeem address!");
      delete userState[userId];
      await User.findOneAndUpdate({ userId }, { redeemCodeAddr: text });
      return ctx.reply(`✅ *Redeem:* \`${text}\``, { parse_mode: "Markdown" });
    }

    // ===== WITHDRAWAL AMOUNT =====
    if (state.startsWith("WD_AMT_")) {
      let method = state.replace("WD_AMT_", "");
      delete userState[userId];
      let amount = parseFloat(text);
      let user = await getUser(userId);
      let minW = await getConfig("min_withdraw", 1);
      let maxW = await getConfig("max_withdraw", 100);
      if (isNaN(amount) || amount < minW || amount > maxW) return ctx.reply(`❌ Invalid amount! (Min ₹${minW}, Max ₹${maxW})`);
      if (user.balance < amount) return ctx.reply("❌ Insufficient!");
      let details = method === "Wallet" ? user.walletAccount :
                    method === "UPI" ? user.upiId :
                    method === "Bank" ? `${user.bankAccNo}, ${user.bankIfsc}` :
                    method === "Amazon" ? user.amazonEmail : user.redeemCodeAddr;
      let safeMethod = method.replace(/ /g, "_");
      let confirmBtn = await ibtn("confirm_wd", "✅ Confirm", `conf_wd_${safeMethod}_${amount}`);
      let cancelBtn = await ibtn("cancel_wd", "❌ Cancel", "canc_wd");
      return ctx.reply(`📋 *Withdrawal Summary*\n\nMethod: ${method}\nDetails: ${details}\nAmount: ₹${amount}\n\nConfirm?`,
        { reply_markup: buildIKB([[confirmBtn, cancelBtn]]), parse_mode: "Markdown" });
    }

    // ===== P2P =====
    if (state === "WAITING_FOR_P2P") {
      delete userState[userId];
      let sender = await getUser(userId);
      let lines = text.split("\n");
      let total = 0;
      let list = [];
      for (let line of lines) {
        line = line.trim(); if (!line) continue;
        let p = line.split("-");
        if (p.length !== 2) continue;
        let tgt = p[0].trim(), amt = parseFloat(p[1].trim());
        if (!tgt || isNaN(amt) || amt <= 0) continue;
        total += amt; list.push({ tgt, amt });
      }
      if (list.length === 0 || sender.balance < total) return ctx.reply("❌ Invalid or insufficient!");
      sender.balance -= total; await sender.save();
      await logBalanceHistory(userId, "P2P Sent", -total);
      let summary = "✅ Transfer:\n";
      for (let t of list) {
        let receiver = await User.findOne({ $or: [{ walletId: t.tgt }, { userId: parseInt(t.tgt, 10) || 0 }] });
        if (receiver && receiver.userId !== sender.userId) {
          receiver.balance += t.amt; await receiver.save();
          await logBalanceHistory(receiver.userId, "P2P Received", t.amt);
          summary += `➡️ ₹${t.amt} to ${t.tgt}\n`;
          try { await ctx.api.sendMessage(receiver.userId, `🎉 Received ₹${t.amt} via P2P!`); } catch (e) {}
        } else {
          sender.balance += t.amt; await sender.save();
          summary += `⚠️ ${t.tgt} not found (refunded)\n`;
        }
      }
      return ctx.reply(summary);
    }

    // ===== GIFT REDEEM =====
    if (state === "WAITING_FOR_GIFT_REDEEM") {
      delete userState[userId];
      let g = await GiftCode.findOne({ code: text });
      if (!g || g.usedUsers.includes(userId) || g.usedUsers.length >= g.maxUses) return ctx.reply("🚫 Invalid!");
      g.usedUsers.push(userId); await g.save();
      let user = await getUser(userId);
      user.balance += g.amount; await user.save();
      await logBalanceHistory(userId, `Gift ${g.code}`, g.amount);
      return ctx.reply(`🎉 Added ₹${g.amount}!`);
    }
  }

  // ============================================================
  // 🔀 REPLY BUTTONS ROUTING
  // ============================================================
  let user = await getUser(userId);
  let layout = await getKeyboardLayout();
  let matchedBtn = layout.find(b => b.name === text);
  let key = matchedBtn ? matchedBtn.buttonKey : null;

  if (key === "btn_balance") {
    let msg = `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n🔵 Wallet ID ➝ \`${userId}\`\n🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\nBuilt with security you can Trust.`;
    let bs = await ibtn("balance_statement", "📊 Balance Statement", "balance_statement");
    let cs = await ibtn("customer_support", "💬 Customer Support", "customer_support");
    let rf = await ibtn("refresh_balance_only", "🔄 Refresh", "refresh_balance_only");
    let lf = await ibtn("live_fund", "💰 Live Fund", "live_fund");
    return ctx.reply(msg, { reply_markup: buildIKB([[bs, cs], [rf], [lf]]), parse_mode: "Markdown" });
  }
  else if (key === "btn_task") {
    let tasks = await Task.find({});
    if (!tasks.length) return ctx.reply("📋 No tasks.");
    let rows = [];
    for (let t of tasks) { rows.push([await ibtn("open_task_link", `📌 ${t.title} (₹${t.reward})`, `do_task_${t.taskId}`)]); }
    return ctx.reply("📋 *Available Tasks:*", { reply_markup: buildIKB(rows), parse_mode: "Markdown" });
  }
  else if (key === "btn_gift") {
    userState[userId] = "WAITING_FOR_GIFT_REDEEM";
    return ctx.reply("🎁 Gift Code\n\n💸 Send Gift Code:");
  }
  else if (key === "btn_quickpay") {
    userState[userId] = "WAITING_FOR_P2P";
    return ctx.reply("💸 Quick Pay\n\nFormat:\nWalletID_or_UserID-Amount");
  }
  else if (key === "btn_payout") {
    let activeGateway = await getActiveGateway();
    let gatewayName = activeGateway ? activeGateway.name : null;

    let walletDisplay = gatewayName ? `🌐 ${gatewayName}` : (user.walletAccount !== "Not Set" ? `🌐 ${maskValue(user.walletAccount)}` : "🌐 Not Set");
    let upiDisplay = user.upiId !== "Not Set" ? `⚡ ${maskUPI(user.upiId)}` : "⚡ Not Set";
    let bankDisplay = user.bankAccNo !== "Not Set" ? `🏦 ${maskBank(user.bankAccNo)} (${user.bankIfsc})` : "🏦 Not Set";
    let amazonDisplay = user.amazonEmail !== "Not Set" ? `📧 ${maskEmail(user.amazonEmail)}` : "📧 Not Set";
    let redeemDisplay = user.redeemCodeAddr !== "Not Set" ? `🎁 ${user.redeemCodeAddr}` : "🎁 Not Set";

    let msg = `💳 *Payment Method*\n\n` +
              `🌐 *Wallet:* ${walletDisplay}\n` +
              `⚡ *UPI:* ${upiDisplay}\n` +
              `🏦 *Bank:* ${bankDisplay}\n` +
              `📧 *Amazon:* ${amazonDisplay}\n` +
              `🎁 *Redeem:* ${redeemDisplay}`;

    let walletBtnLabel = gatewayName ? `🌐 ${gatewayName}` : (user.walletAccount !== "Not Set" ? "🌐 Change Wallet" : "🌐 Set Wallet");
    let upiBtnLabel = user.upiId !== "Not Set" ? "⚡ Change UPI" : "⚡ Set UPI";
    let bankBtnLabel = user.bankAccNo !== "Not Set" ? "🏦 Change Bank" : "🏦 Set Bank";
    let amazonBtnLabel = user.amazonEmail !== "Not Set" ? "📧 Change Amazon" : "📧 Set Amazon";
    let redeemBtnLabel = user.redeemCodeAddr !== "Not Set" ? "🎁 Change Redeem" : "🎁 Set Redeem";

    let sw = await ibtn("set_wallet", walletBtnLabel, "set_wallet");
    let su = await ibtn("set_upi", upiBtnLabel, "set_upi");
    let sb = await ibtn("set_bank", bankBtnLabel, "set_bank");
    let sa = await ibtn("set_amazon", amazonBtnLabel, "set_amazon");
    let sr = await ibtn("set_redeem", redeemBtnLabel, "set_redeem");

    let rows = [[sw], [su], [sb], [sa], [sr]];

    let walletIsSet = gatewayName !== null || user.walletAccount !== "Not Set";
    if (walletIsSet) {
      let backBtn = await ibtn("back_to_balance", "🔙 Back", "back_to_balance");
      rows.push([backBtn]);
    }

    return ctx.reply(msg, { reply_markup: buildIKB(rows), parse_mode: "Markdown" });
  }
  else if (key === "btn_withdraw") {
    let minW = await getConfig("min_withdraw", 1);
    let maxW = await getConfig("max_withdraw", 100);
    let msg = `🏦 Withdraw\n\nBalance: ₹${user.balance.toFixed(2)}\nMin: ₹${minW} | Max: ₹${maxW}`;
    let gateways = await getActiveGateways();
    let rows = [];
    let gatewayRow = [];
    for (let gw of gateways) {
      let btn = await ibtn("wd_wallet", `🌐 ${gw.name}`, `wd_gateway_${gw.gatewayId}`);
      gatewayRow.push(btn);
    }
    if (gatewayRow.length > 0) rows.push(gatewayRow);
    let wu = await ibtn("wd_upi", "⚡ UPI", "wd_upi");
    let wb = await ibtn("wd_bank", "🏦 Bank", "wd_bank");
    rows.push([wu, wb]);
    let wa = await ibtn("wd_amazon", "📧 Amazon", "wd_amazon");
    let wr = await ibtn("wd_redeem", "🎁 Redeem Code", "wd_redeem");
    rows.push([wa, wr]);
    return ctx.reply(msg, { reply_markup: buildIKB(rows) });
  }
  else {
    let g = await GiftCode.findOne({ code: text });
    if (g) {
      if (g.usedUsers.includes(userId)) return ctx.reply("❌ Already used!");
      if (g.usedUsers.length >= g.maxUses) return ctx.reply("❌ Expired!");
      g.usedUsers.push(userId); await g.save();
      user.balance += g.amount; await user.save();
      await logBalanceHistory(userId, `Gift ${g.code}`, g.amount);
      return ctx.reply(`🎉 Added ₹${g.amount}!`);
    }
    return next();
  }
});

// ============================================================
// 📸 PHOTO HANDLER — Task Proof
// ============================================================
bot.on("message:photo", async (ctx) => {
  let userId = ctx.from.id;
  let state = userState[userId];
  if (!state || !state.startsWith("WAITING_TASK_PHOTO_")) return;
  let taskId = state.replace("WAITING_TASK_PHOTO_", "");
  let task = await Task.findOne({ taskId });
  if (!task) { delete userState[userId]; return ctx.reply("❌ Task not found!"); }
  if (task.completedUsers.includes(userId)) { delete userState[userId]; return ctx.reply("❌ Already completed!"); }
  let photo = ctx.message.photo[ctx.message.photo.length - 1];
  let subId = Math.floor(100000 + Math.random() * 900000).toString();
  await TaskSubmission.create({
    submissionId: subId, userId, userName: ctx.from.first_name || "User",
    taskId, taskTitle: task.title, reward: task.reward,
    photoFileId: photo.file_id, status: "Pending"
  });
  delete userState[userId];
  await ctx.reply(`⏳ Proof submitted!\n📌 ${task.title}\n💰 ₹${task.reward}\n\nWait for admin approval.`, { reply_markup: await buildReplyKeyboard() });
  let alertCh = task.alertChannel && task.alertChannel !== "Not Set" ? task.alertChannel : await getConfig("default_task_alert_channel", null);
  if (alertCh && alertCh !== "Not Set") {
    let approveBtn = await ibtn("task_approve", "✅ Approve", `task_app_${subId}`);
    let rejectBtn = await ibtn("task_reject", "❌ Reject", `task_rej_${subId}`);
    try {
      await ctx.api.sendPhoto(alertCh, photo.file_id, {
        caption: `📸 New Task Submission!\n👤 ${ctx.from.first_name || "User"}\n🆔 \`${userId}\`\n📌 ${task.title}\n💰 ₹${task.reward}`,
        parse_mode: "Markdown", reply_markup: buildIKB([[approveBtn, rejectBtn]])
      });
    } catch (e) {}
  }
});

// ============================================================
// 📋 TASK CLICK
// ============================================================
bot.callbackQuery(/^do_task_/, async (ctx) => {
  let taskId = ctx.callbackQuery.data.replace("do_task_", "");
  let task = await Task.findOne({ taskId });
  if (!task) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (task.completedUsers.includes(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Already done!", show_alert: true });
  await ctx.answerCallbackQuery();
  let msg = `📋 *Task Details*\n\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}\n\n📸 Send screenshot as proof.`;
  let openBtn = await iurl("open_task_link", "🔗 Open Task Link", task.link);
  let cancelBtn = await ibtn("cancel_task", "❌ Cancel Task", `cancel_task_${taskId}`);
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: buildIKB([[openBtn], [cancelBtn]]) });
  userState[ctx.from.id] = `WAITING_TASK_PHOTO_${taskId}`;
  await ctx.reply("📸 Send screenshot now:", { reply_markup: new Keyboard().text("❌ Cancel Task").resized() });
});

bot.callbackQuery(/^cancel_task_/, async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  await ctx.editMessageText("❌ Task cancelled.").catch(() => {});
  await ctx.reply("🏠 Main Menu", { reply_markup: await buildReplyKeyboard() });
});

// ============================================================
// 💰 BALANCE SCREEN
// ============================================================
bot.callbackQuery("refresh_balance_only", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery("🔄 Refreshed!");
  let msg = `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n🔵 Wallet ID ➝ \`${ctx.from.id}\`\n🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\nBuilt with security you can Trust.`;
  let bs = await ibtn("balance_statement", "📊 Balance Statement", "balance_statement");
  let cs = await ibtn("customer_support", "💬 Customer Support", "customer_support");
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh", "refresh_balance_only");
  let lf = await ibtn("live_fund", "💰 Live Fund", "live_fund");
  await ctx.editMessageText(msg, { reply_markup: buildIKB([[bs, cs], [rf], [lf]]), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("balance_statement", async (ctx) => {
  let uid = ctx.from.id;
  await ctx.answerCallbackQuery();
  let history = await BalanceHistory.find({ userId: uid }).sort({ createdAt: -1 }).limit(30);
  let user = await getUser(uid);
  let msg = `📊 *Balance Statement*\n\n🆔 \`${uid}\`\n💰 *₹${user.balance.toFixed(2)}*\n━━━━━━━━━━━━━━━\n\n`;
  if (history.length === 0) msg += "📭 No transactions.";
  else {
    let tIn = 0, tOut = 0;
    history.forEach(h => {
      let icon = h.amount >= 0 ? "🟢" : "🔴";
      let sign = h.amount >= 0 ? "+" : "";
      msg += `${icon} *${h.action}*\n   ${sign}₹${h.amount.toFixed(2)}\n\n`;
      if (h.amount >= 0) tIn += h.amount; else tOut += Math.abs(h.amount);
    });
    msg += `━━━━━━━━━━━━━━━\n🟢 In: *₹${tIn.toFixed(2)}*\n🔴 Out: *₹${tOut.toFixed(2)}*`;
  }
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh", "balance_statement");
  let bk = await ibtn("back_to_balance", "🔙 Back", "back_to_balance");
  await ctx.editMessageText(msg, { reply_markup: buildIKB([[rf], [bk]]), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("back_to_balance", async (ctx) => {
  let user = await getUser(ctx.from.id);
  await ctx.answerCallbackQuery();
  let msg = `━━━━━━ 💳 *Wallet Overview* ━━━━━━\n\n🔵 Wallet ID ➝ \`${ctx.from.id}\`\n🧾 Balance ➝ *₹${user.balance.toFixed(2)}*\n\nBuilt with security you can Trust.`;
  let bs = await ibtn("balance_statement", "📊 Balance Statement", "balance_statement");
  let cs = await ibtn("customer_support", "💬 Customer Support", "customer_support");
  let rf = await ibtn("refresh_balance_only", "🔄 Refresh", "refresh_balance_only");
  let lf = await ibtn("live_fund", "💰 Live Fund", "live_fund");
  await ctx.editMessageText(msg, { reply_markup: buildIKB([[bs, cs], [rf], [lf]]), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("customer_support", async (ctx) => {
  await ctx.answerCallbackQuery();
  let sup = await getConfig("support_username", null);
  if (!sup || sup === "Not Set") return ctx.reply("💬 Support not set.");
  let link = /^\d+$/.test(sup) ? `tg://user?id=${sup}` : `https://t.me/${sup.replace('@', '')}`;
  let btn = await iurl("customer_support", "💬 Contact Support", link);
  await ctx.reply("💬 *Customer Support*\n\nTap below:", { parse_mode: "Markdown", reply_markup: buildIKB([[btn]]) });
});

bot.callbackQuery("live_fund", async (ctx) => {
  await ctx.answerCallbackQuery("💰 Loading...");
  let users = await User.find({});
  let total = 0;
  users.forEach(u => total += u.balance);
  let msg = `💰 *Live Fund*\n\n👥 Users: \`${users.length}\`\n💵 Total: \`₹${total.toFixed(2)}\`\n\n_Updated: ${new Date().toLocaleString('en-IN')}_`;
  let rf = await ibtn("live_fund", "🔄 Refresh", "live_fund");
  let bk = await ibtn("back_to_balance", "🔙 Back", "back_to_balance");
  await ctx.editMessageText(msg, { reply_markup: buildIKB([[rf], [bk]]), parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 🎯 PAYMENT METHOD CALLBACKS
// ============================================================
bot.callbackQuery("set_wallet", async (ctx) => {
  let activeGateway = await getActiveGateway();
  if (activeGateway) {
    return ctx.answerCallbackQuery({
      text: `🌐 ${activeGateway.name} is active for withdrawals`,
      show_alert: true
    });
  }
  userState[ctx.from.id] = "SET_WALLET_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("🌐 *Set Wallet*\n\nSend your wallet details:", { parse_mode: "Markdown" });
});
bot.callbackQuery("set_upi", async (ctx) => {
  userState[ctx.from.id] = "SET_UPI_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`⚡ *Set UPI ID*\n\nFormat: \`username@bank\`\n\nExamples:\n• \`user@ybl\`\n• \`abc@paytm\``, { parse_mode: "Markdown" });
});
bot.callbackQuery("set_bank", async (ctx) => {
  userState[ctx.from.id] = "SET_BANK_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 *Set Bank Account*\n\nFormat: \`AccNo | IFSC | BankName\`\n\nExample:\n\`123456789012 | SBIN0001234 | State Bank\``, { parse_mode: "Markdown" });
});
bot.callbackQuery("set_amazon", async (ctx) => {
  userState[ctx.from.id] = "SET_AMAZON_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("📧 *Set Amazon Email*\n\nFormat: `user@gmail.com`", { parse_mode: "Markdown" });
});
bot.callbackQuery("set_redeem", async (ctx) => {
  userState[ctx.from.id] = "SET_REDEEM_ACC";
  await ctx.answerCallbackQuery();
  await ctx.reply("🎁 *Set Redeem Address*\n\nSend your redeem address:", { parse_mode: "Markdown" });
});

// ============================================================
// 🎯 P2P / WITHDRAW CALLBACKS
// ============================================================
bot.callbackQuery("p2p_select_user", async (ctx) => {
  await ctx.answerCallbackQuery();
  let users = await User.find({ userId: { $ne: ctx.from.id } }).limit(10);
  if (!users.length) return ctx.reply("❌ No users!");
  let rows = [];
  users.forEach(u => rows.push([{ text: `Wallet: ${u.walletId} (ID: ${u.userId})`, callback_data: `p2p_target_${u.walletId}` }]));
  await ctx.reply("👥 Select user:", { reply_markup: buildIKB(rows) });
});
bot.callbackQuery(/^p2p_target_/, async (ctx) => {
  let w = ctx.callbackQuery.data.replace("p2p_target_", "");
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = "WAITING_FOR_P2P";
  await ctx.reply(`💡 Wallet: ${w}\n\nSend: \`${w}-Amount\``, { parse_mode: "Markdown" });
});

// Gateway withdraw method
bot.callbackQuery(/^wd_gateway_/, async (ctx) => {
  let gwId = ctx.callbackQuery.data.replace("wd_gateway_", "");
  let gw = await getGatewayById(gwId);
  if (!gw) return ctx.answerCallbackQuery({ text: "Gateway not found!", show_alert: true });
  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 1);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  await ctx.answerCallbackQuery();
  userState[ctx.from.id] = `WD_AMT_Wallet`;
  await ctx.reply(`🏦 Withdraw via *${gw.name}*\n\n💰 Balance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`, { parse_mode: "Markdown" });
});

async function promptWD(ctx, method) {
  let user = await getUser(ctx.from.id);
  let minW = await getConfig("min_withdraw", 1);
  if (user.balance < minW) return ctx.answerCallbackQuery({ text: `❌ Min ₹${minW}!`, show_alert: true });
  userState[ctx.from.id] = `WD_AMT_${method}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏦 Withdraw via ${method}\n\nBalance: ₹${user.balance.toFixed(2)}\n👉 Send amount:`);
}

bot.callbackQuery("wd_wallet", async (ctx) => { await promptWD(ctx, "Wallet"); });
bot.callbackQuery("wd_upi", async (ctx) => { await promptWD(ctx, "UPI"); });
bot.callbackQuery("wd_bank", async (ctx) => { await promptWD(ctx, "Bank"); });
bot.callbackQuery("wd_amazon", async (ctx) => { await promptWD(ctx, "Amazon"); });
bot.callbackQuery("wd_redeem", async (ctx) => { await promptWD(ctx, "Redeem Code"); });

// ============================================================
// 🚀 BOT START + DB
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🍃 MongoDB Connected!");
    bot.start({ onStart: (info) => console.log(`🚀 Bot @${info.username} running!`) });
  })
  .catch((err) => console.error("❌ DB Error:", err));
