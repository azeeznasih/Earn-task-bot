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

setInterval(() => {
    http.get(RENDER_EXTERNAL_URL, (res) => {}).on('error', (err) => {
        console.error("Self-ping error:", err.message);
    });
}, 5 * 60 * 1000);

// ---------------- CONFIGURATION ----------------
const BOT_TOKEN = process.env.BOT_TOKEN || "8883226932:AAHUseWqnyaHF3vBB9N_23H_0wBoAb9vtzE"; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "8061612320"); 
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/postgres";
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const userState = {};
const adminState = {};

// --- DATABASE SETUP ---
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
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

        const defaultSettings = [
            ["welcome_bonus_enabled", "OFF"],
            ["welcome_bonus_amount", "10"],
            ["support_username", "https://t.me/telegram"],
            ["payout_channel", ""],
            ["custom_live_fund", "10000"],
            ["merchant_upi_id", "merchant@upi"],
            ["merchant_name", "EarnBot"],
            ["admin_withdraw_panel_toggle", "ON"],
            ["min_wd_upi", "50"], ["max_wd_upi", "5000"],
            ["min_wd_bank", "100"], ["max_wd_bank", "10000"],
            ["min_wd_wallet", "30"], ["max_wd_wallet", "2000"],
            ["min_wd_amazon", "50"], ["max_wd_amazon", "5000"],
            ["min_wd_redeem", "50"], ["max_wd_redeem", "5000"]
        ];

        for (const [key, val] of defaultSettings) {
            await client.query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING;`, [key, val]);
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
            await client.query(`INSERT INTO custom_buttons (btn_key, label, row_idx) VALUES ($1, $2, $3) ON CONFLICT (btn_key) DO NOTHING;`, [btn_key, label, row_idx]);
        }
    } finally {
        client.release();
    }
}

initDatabase().catch(console.error);

// --- HELPER FUNCTIONS ---
async function getSetting(key) {
    const res = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
    return res.rows[0] ? res.rows[0].value : null;
}

async function setSetting(key, value) {
    await pool.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, value]);
}

async function getUser(userId, username = "", phone = "") {
    let res = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    if (res.rows.length === 0) {
        const bonusEnabled = await getSetting("welcome_bonus_enabled");
        let initialBal = 0.0;
        if (bonusEnabled === "ON") {
            initialBal = parseFloat(await getSetting("welcome_bonus_amount") || "0");
        }
        await pool.query(
            "INSERT INTO users (user_id, username, phone_number, balance) VALUES ($1, $2, $3, $4)",
            [userId, username, phone, initialBal]
        );
        res = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    } else if (username || phone) {
        await pool.query(
            "UPDATE users SET username = COALESCE(NULLIF($2, ''), username), phone_number = COALESCE(NULLIF($3, ''), phone_number) WHERE user_id = $1",
            [userId, username, phone]
        );
    }
    return res.rows[0];
}

async function updateBalance(userId, amount) {
    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, userId]);
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidIFSC(ifsc) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase()); }
function isValidBankAcc(acc) { return /^\d{9,18}$/.test(acc); }

// --- KEYBOARDS & UI BUILDERS ---
async function getDynamicMainKeyboard() {
    const res = await pool.query("SELECT * FROM custom_buttons ORDER BY row_idx ASC, btn_key ASC");
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
}

async function getButtonLabel(key) {
    const res = await pool.query("SELECT label FROM custom_buttons WHERE btn_key = $1", [key]);
    return res.rows[0] ? res.rows[0].label : "";
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
        .text("🔗 Set Wallet", "set_wallet_action").row()
        .text("💵 Set UPI Address", "set_upi_action").row()
        .text("🏦 Set Bank Account", "set_bank_action").row()
        .text("🎁 Redeem Code Email", "set_redeem_action").row()
        .text("🛒 Amazon Gift Card", "set_amazon_action");
}

function getWithdrawInline() {
    return new InlineKeyboard()
        .text("🌐 Ultra-Pay Wallet", "wd_wallet").text("💵 UPI Address", "wd_upi").row()
        .text("👤 VSV Wallet", "wd_wallet").row()
        .text("🏦 Bank Transfer", "wd_bank").text("🎁 Redeem Code", "wd_redeem").row()
        .text("🛒 Amazon Gift Card", "wd_amazon");
}

async function getAdminWithdrawSettingsKeyboard() {
    const minUpi = await getSetting("min_wd_upi"); const maxUpi = await getSetting("max_wd_upi");
    const minBank = await getSetting("min_wd_bank"); const maxBank = await getSetting("max_wd_bank");
    const minWallet = await getSetting("min_wd_wallet"); const maxWallet = await getSetting("max_wd_wallet");
    const minAmazon = await getSetting("min_wd_amazon"); const maxAmazon = await getSetting("max_wd_amazon");
    const minRedeem = await getSetting("min_wd_redeem"); const maxRedeem = await getSetting("max_wd_redeem");

    return new InlineKeyboard()
        .text(`💵 UPI Limit (${minUpi}-${maxUpi})`, "adm_set_limit_upi").row()
        .text(`🏦 Bank Limit (${minBank}-${maxBank})`, "adm_set_limit_bank").row()
        .text(`🌐 Wallet Limit (${minWallet}-${maxWallet})`, "adm_set_limit_wallet").row()
        .text(`🛒 Amazon Limit (${minAmazon}-${maxAmazon})`, "adm_set_limit_amazon").row()
        .text(`🎁 Redeem Limit (${minRedeem}-${maxRedeem})`, "adm_set_limit_redeem");
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

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply("⚡ **Admin Panel - Withdraw Limits Control** ⚡\n\n താഴെ കാണുന്ന ബട്ടണുകളിൽ ക്ലിക്ക് ചെയ്ത് Min, Max അപ്ഡേറ്റ് ചെയ്യാം:", {
        parse_mode: "Markdown",
        reply_markup: await getAdminWithdrawSettingsKeyboard()
    });
});

bot.on("message:contact", async (ctx) => {
    const userId = ctx.from.id;
    const phone = ctx.message.contact.phone_number;
    await getUser(userId, ctx.from.username || "", phone);
    await ctx.reply(`✅ **Phone number updated successfully:** \`${phone}\``, { parse_mode: "Markdown", reply_markup: await getDynamicMainKeyboard() });
});

// --- ADMIN LIMIT SETTING ACTIONS ---
bot.callbackQuery(/^adm_set_limit_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery({ text: "Unauthorized!" });
    const method = ctx.match[1];
    adminState[ctx.from.id] = `awaiting_min_max_${method}`;

    const minVal = await getSetting(`min_wd_${method}`);
    const maxVal = await getSetting(`max_wd_${method}`);

    await ctx.reply(
        `⚙️ **Set Min & Max Withdraw Limits for ${method.toUpperCase()}**\n\n` +
        `Current Minimum: ₹${minVal}\n` +
        `Current Maximum: ₹${maxVal}\n\n` +
        `👉 **പുതിയ Min, Max എൻ്റർ ചെയ്യുക (Format: Min,Max):**\n` +
        `*Example:* \`50,5000\``, 
        { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
});

// --- CALLBACK QUERIES (IN-PLACE REFRESH / SAME MESSAGE UPDATE) ---
bot.callbackQuery("view_statement", async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const statementMsg = 
        `📒 **Balance Statement** 📒\n\n` +
        `🌐 **User ID:** \`${userId}\`\n` +
        `👤 **Username:** @${user.username || 'N/A'}\n` +
        `📱 **Phone:** \`${user.phone_number || 'Not Linked'}\`\n` +
        `💵 **Current Balance:** ₹${parseFloat(user.balance).toFixed(2)}\n` +
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
    const balMsg = 
        `💳 Wallet Overview 💳\n\n` +
        `🌐 Wallet ID → ${userId}\n` +
        `💵 Balance → ₹${parseFloat(user.balance).toFixed(2)}\n\n` +
        `Built with security you can Trust. Support that responds promptly. ✅`;

    try { await ctx.editMessageText(balMsg, { reply_markup: await getBalanceOverviewKeyboard() }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

// WITHDRAW METHOD HANDLERS
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
    await ctx.reply(`🏧 **Withdraw via ${method.toUpperCase()}**\n\n📌 Min Limit: ₹${minLim}\n📌 Max Limit: ₹${maxLim}\n💳 Balance: ₹${parseFloat(user.balance).toFixed(2)}\n\nEnter Amount:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

// PAYOUT SETTINGS ACTIONS
bot.callbackQuery("set_wallet_action", async (ctx) => { userState[ctx.from.id] = "awaiting_wallet_input"; await ctx.reply("📱 Enter Mobile Number / Wallet ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_upi_action", async (ctx) => { userState[ctx.from.id] = "awaiting_upi_input"; await ctx.reply("💵 Enter UPI ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_bank_action", async (ctx) => { userState[ctx.from.id] = "awaiting_bank_acc"; await ctx.reply("🏦 Enter Bank Account Number:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_redeem_action", async (ctx) => { userState[ctx.from.id] = "awaiting_redeem_email"; await ctx.reply("🎁 Enter Redeem Code Email:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_amazon_action", async (ctx) => { userState[ctx.from.id] = "awaiting_amazon_email"; await ctx.reply("🛒 Enter Amazon Gift Card Email:"); await ctx.answerCallbackQuery(); });

// --- MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";

    // ADMIN MIN/MAX SETTING UPDATE
    if (userId === ADMIN_ID && adminState[userId] && adminState[userId].startsWith("awaiting_min_max_")) {
        const method = adminState[userId].replace("awaiting_min_max_", "");
        delete adminState[userId];

        const parts = text.split(",");
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
            return ctx.reply("❌ Invalid format! Please enter like: `50,5000`", { parse_mode: "Markdown" });
        }

        const newMin = parseFloat(parts[0].trim());
        const newMax = parseFloat(parts[1].trim());

        await setSetting(`min_wd_${method}`, newMin.toString());
        await setSetting(`max_wd_${method}`, newMax.toString());

        return ctx.reply(
            `✅ **Limits Updated Successfully!**\n\n` +
            `💳 Method: ${method.toUpperCase()}\n` +
            `📌 New Min: ₹${newMin}\n` +
            `📌 New Max: ₹${newMax}`, 
            { parse_mode: "Markdown", reply_markup: await getAdminWithdrawSettingsKeyboard() }
        );
    }

    const user = await getUser(userId, ctx.from.username || "");

    // P2P TRANSFER
    if (userState[userId] && userState[userId].startsWith("awaiting_p2p_amount_")) {
        const targetId = userState[userId].replace("awaiting_p2p_amount_", "");
        delete userState[userId];

        const transferAmt = parseFloat(text);
        if (isNaN(transferAmt) || transferAmt <= 0) return ctx.reply("❌ Invalid amount!");
        if (parseFloat(user.balance) < transferAmt) return ctx.reply(`❌ Insufficient Balance!`);

        await updateBalance(userId, -transferAmt);
        await updateBalance(targetId, transferAmt);

        await ctx.reply(`✅ Successfully Transferred ₹${transferAmt} to User ID \`${targetId}\`!`, { parse_mode: "Markdown" });
        try { await ctx.api.sendMessage(targetId, `💸 You received ₹${transferAmt} via P2P Transfer from User ID \`${userId}\`!`, { parse_mode: "Markdown" }); } catch (e) {}
        return;
    }

    if (userState[userId] === "awaiting_p2p_target") {
        const targetId = parseInt(text);
        if (isNaN(targetId) || targetId === userId) {
            delete userState[userId];
            return ctx.reply("❌ Invalid User ID!");
        }
        userState[userId] = `awaiting_p2p_amount_${targetId}`;
        return ctx.reply(`💸 **Transferring to User:** \`${targetId}\`\n💳 **Your Balance:** ₹${parseFloat(user.balance).toFixed(2)}\n\nEnter Transfer Amount:`, { parse_mode: "Markdown" });
    }

    // GIFT CODE REDEEM
    if (userState[userId] === "awaiting_gift_code_input") {
        delete userState[userId];
        const res = await pool.query("SELECT * FROM gift_codes WHERE code = $1 AND is_used = 0", [text]);
        if (res.rows.length === 0) return ctx.reply("❌ Invalid or already used Gift Code!");

        const gift = res.rows[0];
        await pool.query("UPDATE gift_codes SET is_used = 1 WHERE code = $1", [text]);
        await updateBalance(userId, parseFloat(gift.reward));
        return ctx.reply(`🎉 **Gift Code Redeemed!** Added **₹${gift.reward}** to your balance.`, { parse_mode: "Markdown" });
    }

    // WITHDRAW AMOUNT SUBMISSION
    if (userState[userId] && userState[userId].startsWith("awaiting_withdraw_amount_")) {
        const method = userState[userId].replace("awaiting_withdraw_amount_", "");
        delete userState[userId];

        const amount = parseFloat(text);
        const minLim = parseFloat(await getSetting(`min_wd_${method}`) || "10");
        const maxLim = parseFloat(await getSetting(`max_wd_${method}`) || "10000");

        if (isNaN(amount) || amount < minLim || amount > maxLim) return ctx.reply(`❌ Limit for ${method.toUpperCase()} is ₹${minLim} - ₹${maxLim}.`);
        if (parseFloat(user.balance) < amount) return ctx.reply(`❌ Insufficient Balance!`);

        let payoutInfo = "";
        if (method === "upi") payoutInfo = `UPI: ${user.upi_id}`;
        else if (method === "bank") payoutInfo = `Acc: ${user.bank_acc} | IFSC: ${user.bank_ifsc}`;
        else if (method === "wallet") payoutInfo = `Mobile: ${user.mobile_no}`;
        else if (method === "amazon") payoutInfo = `Amazon: ${user.amazon_email}`;
        else if (method === "redeem") payoutInfo = `Redeem: ${user.redeem_email}`;

        await updateBalance(userId, -amount);
        await pool.query(
            "INSERT INTO withdrawals (user_id, amount, method, details, status) VALUES ($1, $2, $3, $4, 'PENDING')",
            [userId, amount, method, payoutInfo]
        );

        await ctx.reply(`⏳ **Withdrawal Placed!**\n💵 Amount: ₹${amount}\n💳 Method: ${method.toUpperCase()}`, { parse_mode: "Markdown" });
        return;
    }

    // USER PAYOUT INPUTS
    if (userState[userId] === "awaiting_wallet_input") {
        delete userState[userId];
        await pool.query("UPDATE users SET mobile_no = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **Wallet Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_upi_input") {
        delete userState[userId];
        await pool.query("UPDATE users SET upi_id = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **UPI Address Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_redeem_email") {
        if (!isValidEmail(text)) return ctx.reply("❌ Invalid Email!");
        delete userState[userId];
        await pool.query("UPDATE users SET redeem_email = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **Redeem Code Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_amazon_email") {
        if (!isValidEmail(text)) return ctx.reply("❌ Invalid Email!");
        delete userState[userId];
        await pool.query("UPDATE users SET amazon_email = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **Amazon Gift Card Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_bank_acc") {
        if (!isValidBankAcc(text)) return ctx.reply("❌ Invalid Account Number!");
        await pool.query("UPDATE users SET bank_acc = $1 WHERE user_id = $2", [text, userId]);
        userState[userId] = "awaiting_bank_ifsc";
        return ctx.reply(`✅ Account saved! Enter **Bank IFSC Code**:`);
    }

    if (userState[userId] === "awaiting_bank_ifsc") {
        if (!isValidIFSC(text)) return ctx.reply("❌ Invalid IFSC Code!");
        delete userState[userId];
        await pool.query("UPDATE users SET bank_ifsc = $1 WHERE user_id = $2", [text.toUpperCase(), userId]);
        return ctx.reply(`✅ **Bank Account Linked Successfully!**`, { parse_mode: "Markdown" });
    }

    // MAIN BUTTON HANDLERS
    const lblBal = await getButtonLabel("btn_balance");
    const lblPayment = await getButtonLabel("btn_payment");
    const lblWithdraw = await getButtonLabel("btn_withdraw");
    const lblTasks = await getButtonLabel("btn_tasks");
    const lblGift = await getButtonLabel("btn_gift");
    const lblP2p = await getButtonLabel("btn_p2p");

    if (text === lblBal) {
        const balMsg = 
            `💳 Wallet Overview 💳\n\n` +
            `🌐 Wallet ID → ${userId}\n` +
            `💵 Balance → ₹${parseFloat(user.balance).toFixed(2)}\n\n` +
            `Built with security you can Trust. Support that responds promptly. ✅`;

        await ctx.reply(balMsg, { reply_markup: await getBalanceOverviewKeyboard() });
    } 
    else if (text === lblPayment) {
        const walletTxt = user.mobile_no || "Not Set";
        const upiTxt = user.upi_id || "Not Set";

        const msg = 
            `💳 Payout Method\n\n` +
            `Choose Desired Payment Method From Below 👇\n\n` +
            `Your Current Wallet - ${walletTxt}\n` +
            `Your Current UPI - ${upiTxt}`;

        await ctx.reply(msg, { reply_markup: getPayoutMethodsInline() });
    }
    else if (text === lblWithdraw) {
        await ctx.reply(`✨ Choose Withdrawal Method:`, { parse_mode: "Markdown", reply_markup: getWithdrawInline() });
    }
    else if (text === lblP2p) {
        userState[userId] = "awaiting_p2p_target";
        await ctx.reply("💸 **P2P Balance Transfer**\n\nEnter Target **User ID** to send funds:");
    }
    else if (text === lblGift) {
        userState[userId] = "awaiting_gift_code_input";
        await ctx.reply("🎁 **Redeem Gift Code**\n\nEnter your Gift Code below:");
    }
    else if (text === lblTasks) {
        const tasksRes = await pool.query("SELECT * FROM tasks");
        if (tasksRes.rows.length === 0) return ctx.reply("📋 No active tasks available right now.");
        
        let msg = "📋 **Available Tasks:**\n\n";
        const taskKb = new InlineKeyboard();
        tasksRes.rows.forEach(t => {
            msg += `• **${t.title}** - Reward: ₹${t.reward}\n`;
            taskKb.url(`👉 ${t.title}`, t.link).row();
        });
        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: taskKb });
    }
});

// START BOT
bot.start();
console.log("Bot updated with Admin Min/Max Withdraw Inline controls!");
