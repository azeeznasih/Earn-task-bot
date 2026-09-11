const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const Database = require("better-sqlite3");
const http = require("http");

// --- RENDER PORT DUMMY SERVER ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Telegram Bot Service is active and running 24/7!");
}).listen(PORT, () => {
    console.log(`HTTP Server listening on port ${PORT}`);
});

// ---------------- CONFIGURATION ----------------
const BOT_TOKEN = "8883226932:AAHUseWqnyaHF3vBB9N_23H_0wBoAb9vtzE"; 
const ADMIN_ID = 8061612320; 
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);
const db = new Database("bot_database.db");

const userState = {};
const adminState = {};

// --- DATABASE SETUP ---
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance REAL DEFAULT 0.0,
            upi_id TEXT DEFAULT NULL,
            mobile_no TEXT DEFAULT NULL,
            bank_acc TEXT DEFAULT NULL,
            bank_ifsc TEXT DEFAULT NULL,
            redeem_email TEXT DEFAULT NULL,
            amazon_email TEXT DEFAULT NULL
        );
    `);

    try { db.exec("ALTER TABLE users ADD COLUMN bank_acc TEXT DEFAULT NULL;"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN bank_ifsc TEXT DEFAULT NULL;"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN redeem_email TEXT DEFAULT NULL;"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN amazon_email TEXT DEFAULT NULL;"); } catch (e) {}

    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            reward REAL,
            link TEXT
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS gift_codes (
            code TEXT PRIMARY KEY,
            reward REAL,
            is_used INTEGER DEFAULT 0
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS custom_buttons (
            btn_key TEXT PRIMARY KEY,
            label TEXT,
            row_idx INTEGER
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            method TEXT,
            details TEXT,
            status TEXT DEFAULT 'PENDING'
        );
    `);

    const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("welcome_bonus_enabled", "OFF");
    insertSetting.run("welcome_bonus_amount", "10");
    insertSetting.run("support_username", "https://t.me/telegram");
    insertSetting.run("payout_channel", ""); 
    insertSetting.run("custom_live_fund", "10000");
    insertSetting.run("payment_gateway_url", "Not Linked");

    const initBtn = db.prepare("INSERT OR IGNORE INTO custom_buttons (btn_key, label, row_idx) VALUES (?, ?, ?)");
    initBtn.run("btn_tasks", "📋 Tasks", 1);
    initBtn.run("btn_balance", "🚀 My Balance", 1);
    initBtn.run("btn_gift", "🎁 Gift Code", 2);
    initBtn.run("btn_p2p", "💸 P2P Transfer", 2);
    initBtn.run("btn_withdraw", "🏧 Withdraw", 3);
    initBtn.run("btn_payment", "💳 Payout Method", 3);
}

initDatabase();

// --- HELPER FUNCTIONS ---
function getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function getUser(userId) {
    let user = db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId);
    if (!user) {
        const bonusEnabled = getSetting("welcome_bonus_enabled");
        let initialBal = 0.0;
        if (bonusEnabled === "ON") {
            initialBal = parseFloat(getSetting("welcome_bonus_amount") || "0");
        }
        db.prepare("INSERT INTO users (user_id, balance) VALUES (?, ?)").run(userId, initialBal);
        user = { user_id: userId, balance: initialBal, upi_id: null, mobile_no: null, bank_acc: null, bank_ifsc: null, redeem_email: null, amazon_email: null };
    }
    return user;
}

function updateBalance(userId, amount) {
    getUser(userId);
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id = ?").run(amount, userId);
}

// Validations
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidIFSC(ifsc) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase()); }
function isValidBankAcc(acc) { return /^\d{9,18}$/.test(acc); }

// --- KEYBOARDS ---
function getDynamicMainKeyboard() {
    const buttons = db.prepare("SELECT * FROM custom_buttons ORDER BY row_idx ASC, btn_key ASC").all();
    const rows = {};

    buttons.forEach(b => {
        if (!rows[b.row_idx]) rows[b.row_idx] = [];
        rows[b.row_idx].push(b.label);
    });

    const kb = new Keyboard();
    Object.keys(rows).sort((a,b) => Number(a) - Number(b)).forEach(r => {
        rows[r].forEach(lbl => kb.text(lbl));
        kb.row();
    });

    return kb.resized();
}

function getButtonLabel(key) {
    const row = db.prepare("SELECT label FROM custom_buttons WHERE btn_key = ?").get(key);
    return row ? row.label : "";
}

function getAdminPanelInline() {
    const liveFund = getSetting("custom_live_fund") || "10000";
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'PENDING'").get().count;

    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Deduct Balance", "admin_rem_bal").row()
        .text(`⏳ Withdraw Requests (${pendingCount})`, "admin_view_withdraws").row()
        .text("🌐 Set Payment Gateway", "admin_set_gateway").text("🛠 Set Support Link", "admin_set_support").row()
        .text("📢 Set Payout Channel", "admin_set_payout_channel").text("💰 Set Custom Fund", "admin_set_fund").row()
        .text(`💵 Fund: ₹${liveFund}`, "admin_noop").text("📢 Broadcast", "admin_broadcast").row()
        .text("❌ Close Panel", "admin_close");
}

function getBalanceOverviewKeyboard() {
    const supportLink = getSetting("support_username") || "https://t.me/telegram";
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
    getUser(userId);
    await ctx.reply(`👋 **Welcome to Earn Task Bot!**\nComplete simple tasks and earn real cash rewards.`, {
        parse_mode: "Markdown",
        reply_markup: getDynamicMainKeyboard()
    });
});

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply(`🔐 **Advanced Admin Panel**`, {
        parse_mode: "Markdown",
        reply_markup: getAdminPanelInline()
    });
});

bot.command("redeem", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.split(" ")[1];
    if (!text) return ctx.reply("❌ Please provide code: `/redeem CODE`", { parse_mode: "Markdown" });

    const codeRow = db.prepare("SELECT * FROM gift_codes WHERE code = ? AND is_used = 0").get(text.toUpperCase());
    if (!codeRow) return ctx.reply("❌ Invalid or already used Gift Code!");

    db.prepare("UPDATE gift_codes SET is_used = 1 WHERE code = ?").run(text.toUpperCase());
    updateBalance(userId, codeRow.reward);
    return ctx.reply(`🎉 **Success!** You redeemed ₹${codeRow.reward}!`);
});

// --- CALLBACK QUERIES ---

// EDIT MESSAGE ON BALANCE PANEL CLICK
bot.callbackQuery("view_statement", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    const statementMsg = 
        `📒 **Balance Statement** 📒\n\n` +
        `🌐 **User ID:** \`${userId}\`\n` +
        `💵 **Current Balance:** ₹${user.balance.toFixed(2)}\n` +
        `📊 **Account Status:** Active ✅\n\n` +
        `*All earnings and withdrawal records are logged securely.*`;

    const backInline = new InlineKeyboard().text("🔙 Back", "view_wallet_overview");

    try {
        await ctx.editMessageText(statementMsg, { parse_mode: "Markdown", reply_markup: backInline });
    } catch (e) {}
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("view_live_fund", async (ctx) => {
    const liveFundVal = parseFloat(getSetting("custom_live_fund") || "10000");
    
    const fundMsg = 
        `💰 **Live Bot Fund** 💰\n\n` +
        `🏦 **Available Reserve Liquidity:** ₹${liveFundVal.toFixed(2)}\n\n` +
        `*Bot reserves are fully backed to process instant payouts! ✅*`;

    const backInline = new InlineKeyboard().text("🔙 Back", "view_wallet_overview");

    try {
        await ctx.editMessageText(fundMsg, { parse_mode: "Markdown", reply_markup: backInline });
    } catch (e) {}
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("view_wallet_overview", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    const balMsg = 
        `💳 Wallet Overview 💳\n\n` +
        `🌐 Wallet ID → ${userId}\n` +
        `💵 Balance → ₹${user.balance.toFixed(2)}\n\n` +
        `Built with security you can Trust. Support that responds promptly. ✅`;

    try {
        await ctx.editMessageText(balMsg, { reply_markup: getBalanceOverviewKeyboard() });
    } catch (e) {}
    await ctx.answerCallbackQuery();
});

// ADMIN CALLBACKS
bot.callbackQuery("admin_set_gateway", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_gateway_url";
    await ctx.reply("🌐 **Enter Payment Gateway / UPI Gateway URL:**\n(Example: `https://api.upigateway.com/pay` or merchant link)", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_view_withdraws", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const pendingList = db.prepare("SELECT * FROM withdrawals WHERE status = 'PENDING' LIMIT 5").all();
    
    if (pendingList.length === 0) {
        return ctx.reply("✨ No pending withdrawal requests found!");
    }

    for (const w of pendingList) {
        const actionKb = new InlineKeyboard()
            .text("✅ Approve", `app_wd_${w.id}`)
            .text("❌ Reject", `rej_wd_${w.id}`);

        const msg = 
            `⏳ **WITHDRAW REQUEST (WAITING)**\n\n` +
            `🆔 **Request ID:** #${w.id}\n` +
            `👤 **User ID:** \`${w.user_id}\`\n` +
            `💰 **Amount:** ₹${w.amount}\n` +
            `💳 **Method:** ${w.method.toUpperCase()}\n` +
            `📌 **Details:** \`${w.details}\``;

        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: actionKb });
    }
    await ctx.answerCallbackQuery();
});

// APPROVE / REJECT WITHDRAWAL
bot.callbackQuery(/^app_wd_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const reqId = ctx.match[1];
    const req = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(reqId);

    if (!req || req.status !== 'PENDING') {
        return ctx.reply("❌ Request already processed or invalid.");
    }

    db.prepare("UPDATE withdrawals SET status = 'APPROVED' WHERE id = ?").run(reqId);
    
    // Notify User
    try {
        await ctx.api.sendMessage(req.user_id, `🎉 **Withdrawal Approved!**\n\nYour request for ₹${req.amount} via ${req.method.toUpperCase()} has been processed successfully! ✅`, { parse_mode: "Markdown" });
    } catch(e) {}

    await ctx.editMessageText(`✅ **Request #${reqId} Approved Successfully!**`);
    await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^rej_wd_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const reqId = ctx.match[1];
    const req = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(reqId);

    if (!req || req.status !== 'PENDING') {
        return ctx.reply("❌ Request already processed or invalid.");
    }

    // Refund Balance to User
    updateBalance(req.user_id, req.amount);
    db.prepare("UPDATE withdrawals SET status = 'REJECTED' WHERE id = ?").run(reqId);

    // Notify User
    try {
        await ctx.api.sendMessage(req.user_id, `❌ **Withdrawal Request Rejected!**\n\n₹${req.amount} has been refunded back to your wallet.`, { parse_mode: "Markdown" });
    } catch(e) {}

    await ctx.editMessageText(`❌ **Request #${reqId} Rejected & Amount Refunded!**`);
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_fund", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_custom_fund";
    await ctx.reply("💰 Enter the Custom Live Bot Fund Amount (e.g., `50000`):", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_payout_channel", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_payout_channel";
    await ctx.reply("📢 Send your Payout Channel Username or ID (e.g., `@MyPayoutChannel`):");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_support", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_support_link";
    await ctx.reply("🔗 Send new Customer Support Telegram Link:");
    await ctx.answerCallbackQuery();
});

// PAYOUT METHOD SETTINGS
bot.callbackQuery("set_wallet_action", async (ctx) => { userState[ctx.from.id] = "awaiting_wallet_input"; await ctx.reply("📱 Enter your Mobile / Wallet Number:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_upi_action", async (ctx) => { userState[ctx.from.id] = "awaiting_upi_input"; await ctx.reply("💵 Enter your UPI ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_bank_action", async (ctx) => { userState[ctx.from.id] = "awaiting_bank_acc"; await ctx.reply("🏦 Enter your Bank Account Number:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_redeem_action", async (ctx) => { userState[ctx.from.id] = "awaiting_redeem_email"; await ctx.reply("📧 Enter your Email ID for Redeem Code:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_amazon_action", async (ctx) => { userState[ctx.from.id] = "awaiting_amazon_email"; await ctx.reply("🛒 Enter your Email ID for Amazon Gift Card:"); await ctx.answerCallbackQuery(); });

// WITHDRAW CALLBACK HANDLERS
bot.callbackQuery(/^wd_(.+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[1];
    const user = getUser(userId);

    let details = "";
    if (method === "upi") details = user.upi_id ? `UPI: ${user.upi_id}` : null;
    else if (method === "bank") details = user.bank_acc ? `Acc: ${user.bank_acc} | IFSC: ${user.bank_ifsc}` : null;
    else if (method === "wallet") details = user.mobile_no ? `Mobile: ${user.mobile_no}` : null;
    else if (method === "amazon") details = user.amazon_email ? `Email: ${user.amazon_email}` : null;
    else if (method === "redeem") details = user.redeem_email ? `Email: ${user.redeem_email}` : null;

    if (!details) {
        return ctx.reply(`❌ You haven't set up your payout method for this option yet. Please go to **Payout Method** first!`, { parse_mode: "Markdown" });
    }

    userState[userId] = `awaiting_withdraw_amount_${method}`;
    await ctx.reply(`🏧 **Enter Amount to Withdraw via ${method.toUpperCase()}**\n\nYour Linked Details: \`${details}\`\nCurrent Balance: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_add_task", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_task"; await ctx.reply("📝 Send: `Title | Reward | Link`"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_create_code", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_giftcode"; await ctx.reply("🔑 Send: `CODE AMOUNT`"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_add_bal", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_addbal"; await ctx.reply("💰 Send: `USER_ID AMOUNT`"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_rem_bal", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_rembal"; await ctx.reply("➖ Send: `USER_ID AMOUNT`"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_broadcast", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; adminState[ADMIN_ID] = "awaiting_broadcast"; await ctx.reply("📢 Send broadcast text:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("admin_close", async (ctx) => { if (ctx.from.id !== ADMIN_ID) return; await ctx.deleteMessage(); });

// --- MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";
    const user = getUser(userId);

    // WITHDRAW AMOUNT PROCESSING
    if (userState[userId] && userState[userId].startsWith("awaiting_withdraw_amount_")) {
        const method = userState[userId].replace("awaiting_withdraw_amount_", "");
        delete userState[userId];

        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply("❌ Invalid amount entered! Withdrawal cancelled.");
        }

        if (user.balance < amount) {
            return ctx.reply(`❌ **Insufficient Balance!**\nYour Balance: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown" });
        }

        let payoutInfo = "";
        if (method === "upi") payoutInfo = `UPI: ${user.upi_id}`;
        else if (method === "bank") payoutInfo = `Acc: ${user.bank_acc} | IFSC: ${user.bank_ifsc}`;
        else if (method === "wallet") payoutInfo = `Mobile: ${user.mobile_no}`;
        else if (method === "amazon") payoutInfo = `Amazon Email: ${user.amazon_email}`;
        else if (method === "redeem") payoutInfo = `Redeem Email: ${user.redeem_email}`;

        // Deduct balance and record withdrawal in status "PENDING (WAITING)"
        updateBalance(userId, -amount);
        db.prepare("INSERT INTO withdrawals (user_id, amount, method, details, status) VALUES (?, ?, ?, ?, 'PENDING')").run(userId, amount, method, payoutInfo);

        await ctx.reply(`⏳ **Withdrawal Request Placed (Please Wait)!**\n\n💵 **Amount:** ₹${amount}\n💳 **Method:** ${method.toUpperCase()}\n📌 **Details:** \`${payoutInfo}\`\n\nStatus: ⏳ *Waiting for Admin Approval*`, { parse_mode: "Markdown" });

        const payoutChannel = getSetting("payout_channel");
        if (payoutChannel) {
            try {
                const proofMsg = 
                    `⏳ **NEW WITHDRAWAL REQUEST (WAITING)** 🎉\n\n` +
                    `👤 **User ID:** \`${userId}\`\n` +
                    `💰 **Amount:** ₹${amount.toFixed(2)}\n` +
                    `💳 **Method:** ${method.toUpperCase()}\n` +
                    `📌 **Details:** \`${payoutInfo}\`\n\n` +
                    `STATUS: ⏳ Pending Admin Review`;

                await ctx.api.sendMessage(payoutChannel, proofMsg, { parse_mode: "Markdown" });
            } catch (err) {
                console.error("Payout channel error:", err);
            }
        }
        return;
    }

    // USER SETTINGS INPUTS
    if (userState[userId] === "awaiting_wallet_input") {
        delete userState[userId];
        db.prepare("UPDATE users SET mobile_no = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **Wallet Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_upi_input") {
        delete userState[userId];
        db.prepare("UPDATE users SET upi_id = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **UPI Address Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_bank_acc") {
        if (!isValidBankAcc(text)) return ctx.reply("❌ Invalid Account Number! Enter 9-18 digits:");
        db.prepare("UPDATE users SET bank_acc = ? WHERE user_id = ?").run(text, userId);
        userState[userId] = "awaiting_bank_ifsc";
        return ctx.reply(`✅ Account saved! Now enter **Bank IFSC Code**:`);
    }

    if (userState[userId] === "awaiting_bank_ifsc") {
        if (!isValidIFSC(text)) return ctx.reply("❌ Invalid IFSC Code! (e.g. SBIN0001234):");
        delete userState[userId];
        db.prepare("UPDATE users SET bank_ifsc = ? WHERE user_id = ?").run(text.toUpperCase(), userId);
        return ctx.reply(`✅ **Bank Account Linked Successfully!**`, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_redeem_email") {
        if (!isValidEmail(text)) return ctx.reply("❌ Invalid Email! Enter valid email:");
        delete userState[userId];
        db.prepare("UPDATE users SET redeem_email = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **Redeem Code Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_amazon_email") {
        if (!isValidEmail(text)) return ctx.reply("❌ Invalid Email! Enter valid email:");
        delete userState[userId];
        db.prepare("UPDATE users SET amazon_email = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **Amazon Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    // ADMIN INPUTS
    if (userId === ADMIN_ID && adminState[ADMIN_ID]) {
        const state = adminState[ADMIN_ID];
        delete adminState[ADMIN_ID];

        if (state === "awaiting_gateway_url") {
            setSetting("payment_gateway_url", text);
            return ctx.reply(`✅ **Payment Gateway / URL Gateway Set To:**\n\`${text}\``, { parse_mode: "Markdown" });
        }

        if (state === "awaiting_custom_fund") {
            const fundAmt = parseFloat(text);
            if (isNaN(fundAmt)) return ctx.reply("❌ Invalid Amount!");
            setSetting("custom_live_fund", fundAmt.toString());
            return ctx.reply(`✅ **Custom Live Fund Updated to:** ₹${fundAmt.toFixed(2)}`);
        }

        if (state === "awaiting_payout_channel") { setSetting("payout_channel", text); return ctx.reply(`✅ Payout Channel updated: ${text}`); }
        if (state === "awaiting_support_link") { setSetting("support_username", text); return ctx.reply(`✅ Support Link Updated!`); }
        if (state === "awaiting_task") { const p = text.split("|"); db.prepare("INSERT INTO tasks (title, reward, link) VALUES (?, ?, ?)").run(p[0].trim(), parseFloat(p[1].trim()), p[2].trim()); return ctx.reply("✅ Task created!"); }
        if (state === "awaiting_giftcode") { const a = text.split(" "); db.prepare("INSERT INTO gift_codes (code, reward) VALUES (?, ?)").run(a[0].toUpperCase().trim(), parseFloat(a[1])); return ctx.reply("✅ Gift code created!"); }
        if (state === "awaiting_addbal") { const a = text.split(" "); updateBalance(parseInt(a[0]), parseFloat(a[1])); return ctx.reply("✅ Balance added!"); }
        if (state === "awaiting_rembal") { const a = text.split(" "); updateBalance(parseInt(a[0]), -parseFloat(a[1])); return ctx.reply("✅ Balance deducted!"); }
        if (state === "awaiting_broadcast") { const users = db.prepare("SELECT user_id FROM users").all(); for (const u of users) { try { await ctx.api.sendMessage(u.user_id, `📢 ${text}`); } catch (e) {} } return ctx.reply("✅ Broadcast done!"); }
    }

    // BUTTON HANDLERS
    const lblTasks = getButtonLabel("btn_tasks");
    const lblBal = getButtonLabel("btn_balance");
    const lblGift = getButtonLabel("btn_gift");
    const lblP2p = getButtonLabel("btn_p2p");
    const lblWithdraw = getButtonLabel("btn_withdraw");
    const lblPayment = getButtonLabel("btn_payment");

    if (text === lblBal) {
        const balMsg = 
            `💳 Wallet Overview 💳\n\n` +
            `🌐 Wallet ID → ${userId}\n` +
            `💵 Balance → ₹${user.balance.toFixed(2)}\n\n` +
            `Built with security you can Trust. Support that responds promptly. ✅`;

        await ctx.reply(balMsg, { reply_markup: getBalanceOverviewKeyboard() });
    } 
    else if (text === lblPayment) {
        const walletVal = user.mobile_no ? `\`${user.mobile_no}\`` : "*Not Set*";
        const upiVal = user.upi_id ? `\`${user.upi_id}\`` : "*Not Set*";
        const bankVal = user.bank_acc ? `\`${user.bank_acc}\`` : "*Not Set*";
        const redeemVal = user.redeem_email ? `\`${user.redeem_email}\`` : "*Not Set*";
        const amazonVal = user.amazon_email ? `\`${user.amazon_email}\`` : "*Not Set*";

        const payMsg = 
            `Choose Desired Payment Method From Below 👇\n\n` +
            `Your Current Wallet - ${walletVal}\n` +
            `Your Current UPI - ${upiVal}\n` +
            `Your Current Bank - ${bankVal}\n` +
            `Your Current Redeem Email - ${redeemVal}\n` +
            `Your Current Amazon Email - ${amazonVal}`;

        await ctx.reply(payMsg, { parse_mode: "Markdown", reply_markup: getPayoutMethodsInline() });
    }
    else if (text === lblWithdraw) {
        await ctx.reply(`🏧 **Select Withdrawal Method:**\nYour Balance: ₹${user.balance.toFixed(2)}`, { parse_mode: "Markdown", reply_markup: getWithdrawInline() });
    }
    else if (text === lblTasks) {
        const tasks = db.prepare("SELECT * FROM tasks").all();
        if (tasks.length === 0) return ctx.reply("✨ No tasks available currently.");
        for (const t of tasks) {
            await ctx.reply(`📌 **${t.title}**\n💵 Reward: ₹${t.reward}`, { reply_markup: new InlineKeyboard().url("🔗 Open Link", t.link) });
        }
    } 
    else if (text === lblGift) {
        await ctx.reply("🎁 **Gift Code Enter**\n\nSend your code using: `/redeem CODE`", { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Bot running with ALL Gateway and Wait-System Admin features!");
