const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const { Pool } = require("pg");
const http = require("http");

// --- RENDER PORT & SELF-PING SERVER (For 24/7 Uptime) ---
const PORT = process.env.PORT || 3000;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Telegram Bot Service is active and running 24/7!");
}).listen(PORT, () => {
    console.log(`HTTP Server listening on port ${PORT}`);
});

// Self-Ping to prevent Render Sleep
setInterval(() => {
    http.get(RENDER_EXTERNAL_URL, () => {}).on('error', () => {});
}, 5 * 60 * 1000);

// ---------------- CONFIGURATION ----------------
const BOT_TOKEN = process.env.BOT_TOKEN || "8883226932:AAHUseWqnyaHF3vBB9N_23H_0wBoAb9vtzE"; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "8061612320"); 
const DATABASE_URL = process.env.DATABASE_URL; // External Database URI
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);

// Global Error Catch to prevent bot crash on Render
bot.catch((err) => {
    console.error("Caught bot error:", err.error || err);
});

let pool = null;

if (DATABASE_URL) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.warn("⚠️ DATABASE_URL set ചെയ്തിട്ടില്ല! ഡാറ്റാബേസ് കണക്ഷൻ ലഭ്യമല്ല.");
}

const userState = {};
const adminState = {};

// Safe Query Helper
async function query(text, params) {
    if (!pool) {
        throw new Error("Database connection is missing. Please set DATABASE_URL.");
    }
    return await pool.query(text, params);
}

// --- DATABASE SETUP (POSTGRESQL) ---
async function initDatabase() {
    if (!pool) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id BIGINT PRIMARY KEY,
                username TEXT,
                phone_number TEXT,
                balance NUMERIC DEFAULT 0.0,
                upi_id TEXT,
                mobile_no TEXT,
                bank_acc TEXT,
                bank_ifsc TEXT,
                redeem_email TEXT,
                amazon_email TEXT
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                title TEXT,
                reward NUMERIC,
                link TEXT
            );

            CREATE TABLE IF NOT EXISTS gift_codes (
                code TEXT PRIMARY KEY,
                reward NUMERIC,
                is_used INT DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS custom_buttons (
                btn_key TEXT PRIMARY KEY,
                label TEXT,
                row_idx INT
            );

            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id BIGINT,
                amount NUMERIC,
                method TEXT,
                details TEXT,
                status TEXT DEFAULT 'PENDING'
            );
        `);

        // Default Settings
        const defaultSettings = [
            ["welcome_bonus_enabled", "OFF"],
            ["welcome_bonus_amount", "10"],
            ["support_username", "https://t.me/telegram"],
            ["payout_channel", ""],
            ["custom_live_fund", "10000"],
            ["gateway_base_url", "https://paytm.me/"], // Default payment gateway link base
            ["merchant_upi_id", "merchant@upi"],
            ["admin_withdraw_panel_toggle", "ON"],
            ["min_wd_upi", "50"], ["max_wd_upi", "5000"],
            ["min_wd_bank", "100"], ["max_wd_bank", "10000"],
            ["min_wd_wallet", "30"], ["max_wd_wallet", "2000"],
            ["min_wd_amazon", "50"], ["max_wd_amazon", "5000"],
            ["min_wd_redeem", "50"], ["max_wd_redeem", "5000"]
        ];

        for (const [key, val] of defaultSettings) {
            await query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING;`, [key, val]);
        }

        const buttons = [
            ["btn_tasks", "📋 Tasks", 1],
            ["btn_balance", "🚀 My Balance", 1],
            ["btn_gift", "🎁 Gift Code", 2],
            ["btn_p2p", "💸 P2P Transfer", 2],
            ["btn_withdraw", "🏧 Withdraw", 3],
            ["btn_payment", "💳 Payout Method", 3]
        ];

        for (const [btn_key, label, row_idx] of buttons) {
            await query(`INSERT INTO custom_buttons (btn_key, label, row_idx) VALUES ($1, $2, $3) ON CONFLICT (btn_key) DO NOTHING;`, [btn_key, label, row_idx]);
        }

        console.log("Database Initialized Successfully!");
    } catch (e) {
        console.error("Database initialization error:", e.message);
    }
}

initDatabase();

// --- HELPER FUNCTIONS ---
async function getSetting(key) {
    try {
        const res = await query("SELECT value FROM settings WHERE key = $1", [key]);
        return res.rows[0] ? res.rows[0].value : null;
    } catch (e) {
        return null;
    }
}

async function setSetting(key, value) {
    try {
        await query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, value]);
    } catch (e) {}
}

async function getUser(userId, username = "", phone = "") {
    try {
        let res = await query("SELECT * FROM users WHERE user_id = $1", [userId]);
        if (res.rows.length === 0) {
            const bonusEnabled = await getSetting("welcome_bonus_enabled");
            let initialBal = 0.0;
            if (bonusEnabled === "ON") {
                initialBal = parseFloat(await getSetting("welcome_bonus_amount") || "0");
            }
            await query(
                "INSERT INTO users (user_id, username, phone_number, balance) VALUES ($1, $2, $3, $4)",
                [userId, username, phone, initialBal]
            );
            res = await query("SELECT * FROM users WHERE user_id = $1", [userId]);
        } else {
            if (username || phone) {
                await query(
                    "UPDATE users SET username = COALESCE(NULLIF($2, ''), username), phone_number = COALESCE(NULLIF($3, ''), phone_number) WHERE user_id = $1",
                    [userId, username, phone]
                );
            }
        }
        return res.rows[0];
    } catch (e) {
        return { user_id: userId, balance: 0.0, username: username, phone_number: phone };
    }
}

async function updateBalance(userId, amount) {
    try {
        await query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, userId]);
    } catch (e) {}
}

function isValidIFSC(ifsc) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase()); }
function isValidBankAcc(acc) { return /^\d{9,18}$/.test(acc); }

// --- KEYBOARDS ---
async function getDynamicMainKeyboard() {
    try {
        const res = await query("SELECT * FROM custom_buttons ORDER BY row_idx ASC, btn_key ASC");
        const rows = {};

        res.rows.forEach(b => {
            if (!rows[b.row_idx]) rows[b.row_idx] = [];
            rows[b.row_idx].push(b.label);
        });

        const kb = new Keyboard();
        Object.keys(rows).sort((a,b) => Number(a) - Number(b)).forEach(r => {
            rows[r].forEach(lbl => kb.text(lbl));
            kb.row();
        });

        return kb.resized();
    } catch (e) {
        return new Keyboard().text("📋 Tasks").text("🚀 My Balance").row().text("🏧 Withdraw").text("💳 Payout Method").resized();
    }
}

async function getButtonLabel(key) {
    try {
        const res = await query("SELECT label FROM custom_buttons WHERE btn_key = $1", [key]);
        return res.rows[0] ? res.rows[0].label : "";
    } catch(e) {
        return "";
    }
}

async function getAdminPanelInline() {
    const liveFund = await getSetting("custom_live_fund") || "10000";
    const panelToggle = await getSetting("admin_withdraw_panel_toggle") || "ON";
    let pendingCount = 0;
    try {
        const pendingRes = await query("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'PENDING'");
        pendingCount = pendingRes.rows[0].count;
    } catch(e) {}

    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Deduct Balance", "admin_rem_bal").row()
        .text(`⏳ Withdraw Requests (${pendingCount})`, "admin_view_withdraws").text(`⚙️ Toggle Admin Panel Requests [${panelToggle}]`, "admin_toggle_wd_panel").row()
        .text("⚙️ Set Min/Max Withdraw Limits", "admin_set_limits").row()
        .text("🌐 Set Gateway URL / UPI Link", "admin_set_gateway").text("🛠 Set Support Link", "admin_set_support").row()
        .text("📢 Set Payout Channel", "admin_set_payout_channel").text("💰 Set Custom Fund", "admin_set_fund").row()
        .text(`💵 Fund: ₹${liveFund}`, "admin_noop").text("📢 Broadcast", "admin_broadcast").row()
        .text("❌ Close Panel", "admin_close");
}

async function getBalanceOverviewKeyboard() {
    const supportLink = await getSetting("support_username") || "https://t.me/telegram";
    return new InlineKeyboard()
        .text("📒 Balance Statement", "view_statement").row()
        .text("💰 Live Bot Fund", "view_live_fund").row()
        .url("📣 Contact Support", supportLink);
}

function getPayoutMethodsInline() {
    return new InlineKeyboard()
        .text("🔗 Set Wallet", "set_wallet_action").text("💵 Set UPI Address", "set_upi_action").row()
        .text("🏦 Set Bank Account", "set_bank_action").text("🎁 Redeem Code Email", "set_redeem_action").row()
        .text("🛒 Amazon Gift Card", "set_amazon_action");
}

function getWithdrawInline() {
    return new InlineKeyboard()
        .text("📱 Wallet Withdraw", "wd_wallet").text("💵 UPI Withdraw", "wd_upi").row()
        .text("🏦 Bank Transfer", "wd_bank").text("🎁 Redeem Code", "wd_redeem").row()
        .text("🛒 Amazon Gift Card", "wd_amazon");
}

// --- COMMAND HANDLERS ---
bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "N/A";
    await getUser(userId, username);

    const sharePhoneKb = new Keyboard().requestContact("📱 Share Phone Number to Register").resized();

    await ctx.reply(`👋 **Welcome to Earn Task Bot!**\n\n🆔 **User ID:** \`${userId}\`\n👤 **Username:** @${username}\n\nPlease click below to complete profile integration or continue to main menu.`, {
        parse_mode: "Markdown",
        reply_markup: sharePhoneKb
    });

    await ctx.reply("Main Menu:", { reply_markup: await getDynamicMainKeyboard() });
});

bot.on("message:contact", async (ctx) => {
    const userId = ctx.from.id;
    const phone = ctx.message.contact.phone_number;
    await getUser(userId, ctx.from.username || "", phone);
    await ctx.reply(`✅ **Phone number updated successfully:** \`${phone}\``, { parse_mode: "Markdown", reply_markup: await getDynamicMainKeyboard() });
});

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply(`🔐 **Professional Admin Management Panel**`, {
        parse_mode: "Markdown",
        reply_markup: await getAdminPanelInline()
    });
});

// WORKING AUTO PAYMENT GATEWAY HANDLER
bot.command("pay", async (ctx) => {
    const args = ctx.message.text.split(" ");
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid Amount! Usage: `/pay 100`", { parse_mode: "Markdown" });

    let gatewayUrl = await getSetting("gateway_base_url") || "https://paytm.me/";
    
    // Gateway URL Formatting (Direct Link Generation)
    let finalPayUrl = gatewayUrl;
    if (gatewayUrl.startsWith("upi://")) {
        finalPayUrl = `${gatewayUrl}&am=${amount}`;
    } else {
        finalPayUrl = gatewayUrl.includes("?") ? `${gatewayUrl}&amount=${amount}` : `${gatewayUrl}?amount=${amount}`;
    }

    const payKb = new InlineKeyboard().url("💳 Click Here To Pay Now", finalPayUrl);

    await ctx.reply(
        `💳 **Instant Payment Gateway**\n\n` +
        `💵 **Amount:** ₹${amount}\n` +
        `STATUS: Ready for Instant Processing ✅\n\n` +
        `താഴെയുള്ള ബട്ടണിൽ ക്ലിക്ക് ചെയ്ത് പേയ്‌മെന്റ് പൂർത്തിയാക്കൂ:`,
        {
            parse_mode: "Markdown",
            reply_markup: payKb
        }
    );
});

// --- CALLBACK QUERIES ---
bot.callbackQuery("view_statement", async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const statementMsg = 
        `📒 **Balance Statement** 📒\n\n` +
        `🌐 **User ID:** \`${userId}\`\n` +
        `👤 **Username:** @${user.username || 'N/A'}\n` +
        `📱 **Phone:** \`${user.phone_number || 'Not Linked'}\`\n` +
        `💵 **Current Balance:** ₹${parseFloat(user.balance || 0).toFixed(2)}\n` +
        `📊 **Account Status:** Active ✅`;

    const backInline = new InlineKeyboard().text("🔙 Back", "view_wallet_overview");
    try { await ctx.editMessageText(statementMsg, { parse_mode: "Markdown", reply_markup: backInline }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("view_live_fund", async (ctx) => {
    const liveFundVal = parseFloat(await getSetting("custom_live_fund") || "10000");
    const fundMsg = `💰 **Live Bot Fund** 💰\n\n🏦 **Available Liquidity:** ₹${liveFundVal.toFixed(2)}`;
    const backInline = new InlineKeyboard().text("🔙 Back", "view_wallet_overview");
    try { await ctx.editMessageText(fundMsg, { parse_mode: "Markdown", reply_markup: backInline }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("view_wallet_overview", async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const balMsg = `💳 Wallet Overview 💳\n\n🌐 Wallet ID → ${userId}\n💵 Balance → ₹${parseFloat(user.balance || 0).toFixed(2)}`;
    try { await ctx.editMessageText(balMsg, { reply_markup: await getBalanceOverviewKeyboard() }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

// ADMIN ACTIONS
bot.callbackQuery("admin_toggle_wd_panel", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const current = await getSetting("admin_withdraw_panel_toggle") || "ON";
    const updated = current === "ON" ? "OFF" : "ON";
    await setSetting("admin_withdraw_panel_toggle", updated);
    await ctx.editMessageText(`🔐 **Professional Admin Management Panel**`, { parse_mode: "Markdown", reply_markup: await getAdminPanelInline() });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_limits", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_limits";
    await ctx.reply("⚙️ **Set Min/Max Withdraw Limits**\n\nSend format: `method min max`\n\nExample: `upi 50 2000`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_gateway", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_upi_merchant";
    await ctx.reply("🌐 **നിങ്ങളുടെ പേയ്‌മെന്റ് ഗേറ്റ്‌വേ ലിങ്ക് അല്ലെങ്കിൽ UPI Link നൽകുക:**\n(ഉദാഹരണത്തിന്: `https://razorpay.me/@yourname` അല്ലെങ്കിൽ `upi://pay?pa=yourvpa@upi&pn=Store`)");
    await ctx.answerCallbackQuery();
});

// WITHDRAW APPROVAL/REJECTION
bot.callbackQuery(/^app_wd_(\d+)$/, async (ctx) => {
    const reqId = ctx.match[1];
    let req;
    try {
        const res = await query("SELECT * FROM withdrawals WHERE id = $1", [reqId]);
        req = res.rows[0];
    } catch(e) {}

    if (!req || req.status !== 'PENDING') {
        return ctx.reply("❌ Request already processed.");
    }

    await query("UPDATE withdrawals SET status = 'APPROVED' WHERE id = $1", [reqId]);

    try {
        await ctx.api.sendMessage(req.user_id, `🎉 **Withdrawal Approved!**\n\n₹${req.amount} sent via ${req.method.toUpperCase()}! ✅`, { parse_mode: "Markdown" });
    } catch(e) {}

    await ctx.editMessageText(`✅ **WITHDRAWAL APPROVED & PROCESSED**\n\n🆔 Request: #${reqId}\n👤 User: \`${req.user_id}\`\n💰 Amount: ₹${req.amount}`);
    await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^rej_wd_(\d+)$/, async (ctx) => {
    const reqId = ctx.match[1];
    let req;
    try {
        const res = await query("SELECT * FROM withdrawals WHERE id = $1", [reqId]);
        req = res.rows[0];
    } catch(e) {}

    if (!req || req.status !== 'PENDING') {
        return ctx.reply("❌ Request already processed.");
    }

    await updateBalance(req.user_id, req.amount);
    await query("UPDATE withdrawals SET status = 'REJECTED' WHERE id = $1", [reqId]);

    try {
        await ctx.api.sendMessage(req.user_id, `❌ **Withdrawal Rejected!**\n\n₹${req.amount} refunded back to your wallet.`, { parse_mode: "Markdown" });
    } catch(e) {}

    await ctx.editMessageText(`❌ **WITHDRAWAL REJECTED & REFUNDED**\n\n🆔 Request: #${reqId}\n👤 User: \`${req.user_id}\`\n💰 Amount: ₹${req.amount}`);
    await ctx.answerCallbackQuery();
});

// WITHDRAW METHOD CLICK HANDLER
bot.callbackQuery(/^wd_(.+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[1];
    const user = await getUser(userId);

    let details = "";
    if (method === "upi") details = user.upi_id ? `UPI: ${user.upi_id}` : null;
    else if (method === "bank") details = user.bank_acc ? `Acc: ${user.bank_acc} | IFSC: ${user.bank_ifsc}` : null;
    else if (method === "wallet") details = user.mobile_no ? `Mobile: ${user.mobile_no}` : null;
    else if (method === "amazon") details = user.amazon_email ? `Email: ${user.amazon_email}` : null;
    else if (method === "redeem") details = user.redeem_email ? `Email: ${user.redeem_email}` : null;

    if (!details) {
        return ctx.reply(`❌ Set up your ${method.toUpperCase()} in **Payout Method** first!`, { parse_mode: "Markdown" });
    }

    const minLim = parseFloat(await getSetting(`min_wd_${method}`) || "10");
    const maxLim = parseFloat(await getSetting(`max_wd_${method}`) || "10000");

    userState[userId] = `awaiting_withdraw_amount_${method}`;
    await ctx.reply(`🏧 **Withdraw via ${method.toUpperCase()}**\n\n📌 Min Limit: ₹${minLim}\n📌 Max Limit: ₹${maxLim}\n💳 Balance: ₹${parseFloat(user.balance || 0).toFixed(2)}\n\nEnter Amount:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

// PAYOUT SETTINGS CALLBACKS
bot.callbackQuery("set_wallet_action", async (ctx) => { userState[ctx.from.id] = "awaiting_wallet_input"; await ctx.reply("📱 Enter Mobile Number:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_upi_action", async (ctx) => { userState[ctx.from.id] = "awaiting_upi_input"; await ctx.reply("💵 Enter UPI ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_bank_action", async (ctx) => { userState[ctx.from.id] = "awaiting_bank_acc"; await ctx.reply("🏦 Enter Bank Account Number:"); await ctx.answerCallbackQuery(); });

// ADMIN BASIC CALLBACKS
bot.callbackQuery("admin_set_fund", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_custom_fund"; await ctx.reply("💰 Enter Custom Live Bot Fund:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_set_payout_channel", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_payout_channel"; await ctx.reply("📢 Send Payout Channel Username/ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_close", async (ctx) => { if (ctx.from.id === ADMIN_ID) await ctx.deleteMessage(); });

// --- MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";
    const user = await getUser(userId, ctx.from.username || "");

    // WITHDRAW AMOUNT SUBMISSION
    if (userState[userId] && userState[userId].startsWith("awaiting_withdraw_amount_")) {
        const method = userState[userId].replace("awaiting_withdraw_amount_", "");
        delete userState[userId];

        const amount = parseFloat(text);
        const minLim = parseFloat(await getSetting(`min_wd_${method}`) || "10");
        const maxLim = parseFloat(await getSetting(`max_wd_${method}`) || "10000");

        if (isNaN(amount) || amount < minLim || amount > maxLim) {
            return ctx.reply(`❌ Invalid amount! Limit for ${method.toUpperCase()} is ₹${minLim} - ₹${maxLim}.`);
        }

        if (parseFloat(user.balance || 0) < amount) {
            return ctx.reply(`❌ **Insufficient Balance!** Current Balance: ₹${parseFloat(user.balance || 0).toFixed(2)}`);
        }

        let payoutInfo = "";
        if (method === "upi") payoutInfo = `UPI: ${user.upi_id}`;
        else if (method === "bank") payoutInfo = `Acc: ${user.bank_acc} | IFSC: ${user.bank_ifsc}`;
        else if (method === "wallet") payoutInfo = `Mobile: ${user.mobile_no}`;
        else if (method === "amazon") payoutInfo = `Amazon: ${user.amazon_email}`;
        else if (method === "redeem") payoutInfo = `Redeem: ${user.redeem_email}`;

        await updateBalance(userId, -amount);
        let reqId = Math.floor(Math.random() * 90000) + 10000;
        try {
            const wRes = await query(
                "INSERT INTO withdrawals (user_id, amount, method, details, status) VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id",
                [userId, amount, method, payoutInfo]
            );
            reqId = wRes.rows[0].id;
        } catch(e) {}

        await ctx.reply(`⏳ **Withdrawal Placed!**\n\n💵 Amount: ₹${amount}\n💳 Method: ${method.toUpperCase()}\nStatus: *Pending Review*`, { parse_mode: "Markdown" });

        const actionKb = new InlineKeyboard()
            .text("✅ Approve", `app_wd_${reqId}`)
            .text("❌ Reject", `rej_wd_${reqId}`);

        const payoutChannel = await getSetting("payout_channel");
        if (payoutChannel) {
            try {
                const proofMsg = 
                    `⏳ **NEW WITHDRAWAL REQUEST** 🎉\n\n` +
                    `🆔 **ID:** #${reqId}\n` +
                    `👤 **User:** \`${userId}\` (@${user.username || 'N/A'})\n` +
                    `📱 **Phone:** \`${user.phone_number || 'N/A'}\`\n` +
                    `💰 **Amount:** ₹${amount.toFixed(2)}\n` +
                    `💳 **Method:** ${method.toUpperCase()}\n` +
                    `📌 **Details:** \`${payoutInfo}\``;

                await ctx.api.sendMessage(payoutChannel, proofMsg, { parse_mode: "Markdown", reply_markup: actionKb });
            } catch (err) {}
        }
        return;
    }

    // USER SETTINGS INPUTS
    if (userState[userId] === "awaiting_wallet_input") {
        delete userState[userId];
        await query("UPDATE users SET mobile_no = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **Wallet Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_upi_input") {
        delete userState[userId];
        await query("UPDATE users SET upi_id = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **UPI Address Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_bank_acc") {
        if (!isValidBankAcc(text)) return ctx.reply("❌ Invalid Account Number!");
        await query("UPDATE users SET bank_acc = $1 WHERE user_id = $2", [text, userId]);
        userState[userId] = "awaiting_bank_ifsc";
        return ctx.reply(`✅ Account saved! Enter **Bank IFSC Code**:`);
    }

    if (userState[userId] === "awaiting_bank_ifsc") {
        if (!isValidIFSC(text)) return ctx.reply("❌ Invalid IFSC Code!");
        delete userState[userId];
        await query("UPDATE users SET bank_ifsc = $1 WHERE user_id = $2", [text.toUpperCase(), userId]);
        return ctx.reply(`✅ **Bank Account Linked Successfully!**`, { parse_mode: "Markdown" });
    }

    // ADMIN INPUTS
    if (userId === ADMIN_ID && adminState[ADMIN_ID]) {
        const state = adminState[ADMIN_ID];
        delete adminState[ADMIN_ID];

        if (state === "awaiting_limits") {
            const parts = text.split(" ");
            if (parts.length === 3) {
                const method = parts[0].toLowerCase();
                await setSetting(`min_wd_${method}`, parts[1]);
                await setSetting(`max_wd_${method}`, parts[2]);
                return ctx.reply(`✅ Limits updated for **${method.toUpperCase()}**: Min ₹${parts[1]} | Max ₹${parts[2]}`, { parse_mode: "Markdown" });
            }
            return ctx.reply("❌ Invalid Format!");
        }

        if (state === "awaiting_upi_merchant") {
            await setSetting("gateway_base_url", text);
            return ctx.reply(`✅ **Payment Gateway Link Set To:** \`${text}\``, { parse_mode: "Markdown" });
        }

        if (state === "awaiting_custom_fund") {
            await setSetting("custom_live_fund", text);
            return ctx.reply(`✅ **Live Fund Updated:** ₹${text}`);
        }

        if (state === "awaiting_payout_channel") {
            await setSetting("payout_channel", text);
            return ctx.reply(`✅ Payout Channel Set To: ${text}`);
        }
    }

    // DYNAMIC MAIN BUTTON HANDLERS
    const lblBal = await getButtonLabel("btn_balance");
    const lblPayment = await getButtonLabel("btn_payment");
    const lblWithdraw = await getButtonLabel("btn_withdraw");

    if (text === lblBal || text === "🚀 My Balance") {
        const balMsg = `💳 Wallet Overview 💳\n\n🌐 Wallet ID → ${userId}\n💵 Balance → ₹${parseFloat(user.balance || 0).toFixed(2)}`;
        await ctx.reply(balMsg, { reply_markup: await getBalanceOverviewKeyboard() });
    } 
    else if (text === lblPayment || text === "💳 Payout Method") {
        await ctx.reply(`Choose Payment Method Below 👇`, { reply_markup: getPayoutMethodsInline() });
    }
    else if (text === lblWithdraw || text === "🏧 Withdraw") {
        await ctx.reply(`🏧 **Select Withdrawal Method:**`, { parse_mode: "Markdown", reply_markup: getWithdrawInline() });
    }
});

// START BOT
bot.start();
console.log("Bot running successfully with Database Safety & Working Gateway Link!");
