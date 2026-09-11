const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const { Pool } = require("pg");
const http = require("http");

// --- RENDER PORT & SELF-PING SERVER ---
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
                balance NUMERIC DEFAULT 0.0,
                task_earnings NUMERIC DEFAULT 0.0,
                referral_earnings NUMERIC DEFAULT 0.0,
                total_withdrawals NUMERIC DEFAULT 0.0,
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
            ["start_message", "Welcome to Payment Task Bot!"],
            ["cancel_button_text", "❌ Cancel"],
            ["support_username", "https://t.me/telegram"],
            ["payout_channel", ""],
            ["gateway_name", "VSP"],
            ["gateway_url", ""],
            ["custom_live_fund", "10000"],
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
            ["btn_tasks", "📋 Daily Tasks", 1],
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

async function getUser(userId, username = "") {
    let res = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    if (res.rows.length === 0) {
        await pool.query("INSERT INTO users (user_id, username, balance) VALUES ($1, $2, 0.0)", [userId, username]);
        res = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    }
    return res.rows[0];
}

async function updateBalance(userId, amount) {
    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, userId]);
}

async function updateLiveFund(deductAmount) {
    const currentFund = parseFloat(await getSetting("custom_live_fund") || "10000");
    const updated = Math.max(0, currentFund - deductAmount);
    await setSetting("custom_live_fund", updated.toString());
}

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

// MATCHING IMAGE UI EXACTLY
async function getBalanceOverviewKeyboard() {
    const supportLink = await getSetting("support_username") || "https://t.me/telegram";
    return new InlineKeyboard()
        .text("📒 Balance Statement", "view_statement").row()
        .text("💰 Live Bot Fund", "view_live_fund").row()
        .url("📣 Contact Support", supportLink);
}

async function getPayoutMethodsInline() {
    const gwName = await getSetting("gateway_name") || "Gateway";
    return new InlineKeyboard()
        .text(`🔗 Link ${gwName} Wallet`, "set_wallet_action").row()
        .text("💵 Set UPI Address", "set_upi_action").row()
        .text("🏦 Set Bank Account", "set_bank_action").row()
        .text("🎁 Redeem Code Email", "set_redeem_action").row()
        .text("🛒 Amazon Gift Card", "set_amazon_action");
}

async function getWithdrawInline() {
    const gwName = await getSetting("gateway_name") || "Gateway";
    return new InlineKeyboard()
        .text(`🌐 ${gwName} Auto Wallet`, "wd_wallet").text("💵 UPI Address", "wd_upi").row()
        .text("🏦 Bank Transfer", "wd_bank").text("🎁 Redeem Code", "wd_redeem").row()
        .text("🛒 Amazon Gift Card", "wd_amazon");
}

function getAdminKeyboard() {
    return new InlineKeyboard()
        .text("➕ / ➖ Add/Subtract Balance", "adm_change_balance").row()
        .text("⚙️ Gateway Setup (Name & URI)", "adm_setup_gateway").row()
        .text("📢 Set Payout Channel", "adm_set_payout_channel").row()
        .text("🏧 Min & Max Withdraw Limits", "adm_withdraw_limits").row()
        .text("✏️ Edit Start Message", "adm_edit_start_msg");
}

async function getAdminWithdrawSettingsKeyboard() {
    const minUpi = await getSetting("min_wd_upi"); const maxUpi = await getSetting("max_wd_upi");
    const minBank = await getSetting("min_wd_bank"); const maxBank = await getSetting("max_wd_bank");
    const minWallet = await getSetting("min_wd_wallet"); const maxWallet = await getSetting("max_wd_wallet");

    return new InlineKeyboard()
        .text(`💵 UPI Limit (${minUpi}-${maxUpi})`, "adm_set_limit_upi").row()
        .text(`🏦 Bank Limit (${minBank}-${maxBank})`, "adm_set_limit_bank").row()
        .text(`🌐 Gateway Wallet Limit (${minWallet}-${maxWallet})`, "adm_set_limit_wallet").row();
}

// --- COMMAND HANDLERS ---
bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    await getUser(userId, ctx.from.username || "N/A");

    const startMsg = await getSetting("start_message") || "Welcome to Payment Task Bot!";
    await ctx.reply(startMsg, { reply_markup: await getDynamicMainKeyboard() });
});

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply("⚡ **Admin Dashboard Control** ⚡", {
        parse_mode: "Markdown",
        reply_markup: getAdminKeyboard()
    });
});

// --- ADMIN INLINE ACTIONS ---
bot.callbackQuery("adm_change_balance", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = "awaiting_balance_change";
    await ctx.reply("💰 **ആഡ്/കുറയ്‌ക്കേണ്ട യൂസർ ഐഡിയും തുകയും നൽകുക:**\n\n*Format:* `User_ID,Amount`\n*Example:* `8061612320,100` (Add)\n*Example:* `8061612320,-50` (Deduct)", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_setup_gateway", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = "awaiting_gateway_name";
    await ctx.reply("🌐 **Gateway Name എൻ്റർ ചെയ്യുക (e.g. VSP):**");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_set_payout_channel", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = "awaiting_payout_channel";
    await ctx.reply("📢 **Payout Channel Username നൽകുക (e.g. @MyChannel):**");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_withdraw_limits", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply("🏧 **Withdraw Limits:**", { reply_markup: await getAdminWithdrawSettingsKeyboard() });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^adm_set_limit_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const method = ctx.match[1];
    adminState[ctx.from.id] = `awaiting_min_max_${method}`;
    await ctx.reply(`⚙️ **${method.toUpperCase()} Limits Update (Format: Min,Max):**`);
    await ctx.answerCallbackQuery();
});

// --- WITHDRAWAL APPROVAL & LIVE DEDUCTION ---
bot.callbackQuery(/^wd_app_(.+)_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const action = ctx.match[1];
    const wdId = ctx.match[2];

    const wdRes = await pool.query("SELECT * FROM withdrawals WHERE id = $1 AND status = 'PENDING'", [wdId]);
    if (wdRes.rows.length === 0) return ctx.answerCallbackQuery({ text: "Already processed!" });

    const wd = wdRes.rows[0];

    if (action === "yes") {
        await pool.query("UPDATE withdrawals SET status = 'APPROVED' WHERE id = $1", [wdId]);
        await pool.query("UPDATE users SET total_withdrawals = total_withdrawals + $1 WHERE user_id = $2", [wd.amount, wd.user_id]);
        
        // Deduct Live Bot Fund dynamically
        await updateLiveFund(parseFloat(wd.amount));

        try {
            await ctx.api.sendMessage(wd.user_id, `🎉 **Withdrawal Approved!**\n\n💵 Amount: ₹${wd.amount}\n💳 Method: ${wd.method.toUpperCase()}\n✅ Payment transferred! Check your account.`, { parse_mode: "Markdown" });
        } catch (e) {}

        const payoutChan = await getSetting("payout_channel");
        if (payoutChan) {
            try {
                await ctx.api.sendMessage(payoutChan, `✅ **PAYOUT SUCCESSFUL** ✅\n\n👤 User ID: \`${wd.user_id}\`\n💰 Amount: ₹${wd.amount}\n💳 Method: ${wd.method.toUpperCase()}\n⚡ Status: Processed Automatically`, { parse_mode: "Markdown" });
            } catch (e) {}
        }

        await ctx.editMessageText(`✅ **Withdrawal #${wdId} Approved & Fund Updated!**`);
    } else {
        await pool.query("UPDATE withdrawals SET status = 'REJECTED' WHERE id = $1", [wdId]);
        await updateBalance(wd.user_id, parseFloat(wd.amount)); // Refund

        try {
            await ctx.api.sendMessage(wd.user_id, `❌ **Withdrawal Rejected & Refunded!**\n\n₹${wd.amount} returned to your balance.`);
        } catch (e) {}

        await ctx.editMessageText(`❌ **Withdrawal #${wdId} Rejected and Refunded.**`);
    }
    await ctx.answerCallbackQuery();
});

// --- IN-PLACE SAME MESSAGE UPDATES ---
bot.callbackQuery(["view_statement", "refresh_statement"], async (ctx) => {
    const user = await getUser(ctx.from.id);
    const msg = 
        `📒 **Balance Statement** 📒\n\n` +
        `🌐 **User ID:** \`${ctx.from.id}\`\n` +
        `👤 **Username:** @${user.username || 'N/A'}\n\n` +
        `💵 **Total Available Balance:** ₹${parseFloat(user.balance).toFixed(2)}\n` +
        `📋 **Task Earnings:** ₹${parseFloat(user.task_earnings || 0).toFixed(2)}\n` +
        `👥 **Referral Earnings:** ₹${parseFloat(user.referral_earnings || 0).toFixed(2)}\n` +
        `🏧 **Total Withdrawals:** ₹${parseFloat(user.total_withdrawals || 0).toFixed(2)}\n\n` +
        `Last updated just now. Click **Refresh** to check new additions.`;

    const navKb = new InlineKeyboard()
        .text("🔄 Refresh", "refresh_statement").row()
        .text("🔙 Back", "view_wallet_overview");

    try { await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: navKb }); } catch (e) {}
    await ctx.answerCallbackQuery({ text: "Updated!" });
});

bot.callbackQuery("view_live_fund", async (ctx) => {
    const liveFundVal = parseFloat(await getSetting("custom_live_fund") || "10000");
    const fundMsg = `💳 **Live Bot Fund** 💳\n\n🏦 **Current Liquidity Fund:** ₹${liveFundVal.toFixed(2)}\n\n(Updates automatically upon every payout approval) ✅`;
    const backKb = new InlineKeyboard().text("🔙 Back", "view_wallet_overview");
    try { await ctx.editMessageText(fundMsg, { parse_mode: "Markdown", reply_markup: backKb }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("view_wallet_overview", async (ctx) => {
    const user = await getUser(ctx.from.id);
    const balMsg = 
        `💳 Wallet Overview 💳\n\n` +
        `🌐 Wallet ID → ${ctx.from.id}\n` +
        `💵 Balance → ₹${parseFloat(user.balance).toFixed(2)}\n\n` +
        `Built with security you can Trust. Support that responds promptly. ✅`;

    try { await ctx.editMessageText(balMsg, { reply_markup: await getBalanceOverviewKeyboard() }); } catch (e) {}
    await ctx.answerCallbackQuery();
});

// WITHDRAW METHOD CLICK
bot.callbackQuery(/^wd_(.+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[1];
    const user = await getUser(userId);

    const minLim = parseFloat(await getSetting(`min_wd_${method}`) || "10");
    const maxLim = parseFloat(await getSetting(`max_wd_${method}`) || "10000");

    userState[userId] = `awaiting_withdraw_amount_${method}`;
    await ctx.reply(`🏧 **Withdraw via ${method.toUpperCase()}**\n\n📌 Min: ₹${minLim} | Max: ₹${maxLim}\n💳 Balance: ₹${parseFloat(user.balance).toFixed(2)}\n\nEnter Amount:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

// PAYOUT SETTINGS ACTIONS
bot.callbackQuery("set_wallet_action", async (ctx) => {
    const gwName = await getSetting("gateway_name") || "Gateway";
    userState[ctx.from.id] = "awaiting_wallet_input";
    await ctx.reply(`📱 Enter Mobile Number linked with **${gwName}**:`);
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("set_upi_action", async (ctx) => { userState[ctx.from.id] = "awaiting_upi_input"; await ctx.reply("💵 Enter UPI ID:"); await ctx.answerCallbackQuery(); });
bot.callbackQuery("set_bank_action", async (ctx) => { userState[ctx.from.id] = "awaiting_bank_acc"; await ctx.reply("🏦 Enter Bank Account Number:"); await ctx.answerCallbackQuery(); });

// --- MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";

    // ADMIN STATE LOGIC
    if (userId === ADMIN_ID) {
        if (adminState[userId] === "awaiting_balance_change") {
            delete adminState[userId];
            const parts = text.split(",");
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const targetId = parts[0].trim();
                const amt = parseFloat(parts[1].trim());

                await updateBalance(targetId, amt);
                const updatedUser = await getUser(targetId);

                // Send notification to User
                try {
                    await ctx.api.sendMessage(targetId, `🔔 **Balance Updated!**\n\nAdmin has ${amt >= 0 ? 'added' : 'deducted'} ₹${Math.abs(amt)}.\n💳 **New Total Balance:** ₹${parseFloat(updatedUser.balance).toFixed(2)}`, { parse_mode: "Markdown" });
                } catch (e) {}

                return ctx.reply(`✅ **Balance Updated Successfully!**\n\n👤 **User ID:** \`${targetId}\`\n➕/➖ **Change:** ₹${amt}\n💳 **User's Current Balance:** ₹${parseFloat(updatedUser.balance).toFixed(2)}`, { parse_mode: "Markdown" });
            } else {
                return ctx.reply("❌ Invalid format! Example: `8061612320,100`", { parse_mode: "Markdown" });
            }
        }

        if (adminState[userId] === "awaiting_gateway_name") {
            adminState[userId] = `awaiting_gateway_url_${text}`;
            return ctx.reply(`✅ Name saved: **"${text}"**.\n\n🔗 Enter Gateway URI Link:`);
        }

        if (adminState[userId] && adminState[userId].startsWith("awaiting_gateway_url_")) {
            const gwName = adminState[userId].replace("awaiting_gateway_url_", "");
            delete adminState[userId];
            await setSetting("gateway_name", gwName);
            await setSetting("gateway_url", text);
            return ctx.reply(`🎉 **Gateway Ready!**\nName: ${gwName}\nURI: ${text}`);
        }

        if (adminState[userId] === "awaiting_payout_channel") {
            delete adminState[userId];
            await setSetting("payout_channel", text);
            return ctx.reply(`📢 **Payout Channel Saved:** \`${text}\``, { parse_mode: "Markdown" });
        }

        if (adminState[userId] && adminState[userId].startsWith("awaiting_min_max_")) {
            const method = adminState[userId].replace("awaiting_min_max_", "");
            delete adminState[userId];
            const parts = text.split(",");
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                await setSetting(`min_wd_${method}`, parts[0].trim());
                await setSetting(`max_wd_${method}`, parts[1].trim());
                return ctx.reply(`✅ **${method.toUpperCase()} Limits Updated!**`);
            }
        }
    }

    const user = await getUser(userId, ctx.from.username || "");

    // P2P TRANSFER
    if (userState[userId] && userState[userId].startsWith("awaiting_p2p_amount_")) {
        const targetId = userState[userId].replace("awaiting_p2p_amount_", "");
        delete userState[userId];

        const transferAmt = parseFloat(text);
        if (isNaN(transferAmt) || transferAmt <= 0) return ctx.reply("❌ Invalid amount!");
        if (parseFloat(user.balance) < transferAmt) return ctx.reply("❌ Insufficient Balance!");

        await updateBalance(userId, -transferAmt);
        await updateBalance(targetId, transferAmt);

        await ctx.reply(`✅ Transferred ₹${transferAmt} to User ID \`${targetId}\`!`, { parse_mode: "Markdown" });
        try { await ctx.api.sendMessage(targetId, `💸 Received ₹${transferAmt} via P2P Transfer!`); } catch (e) {}
        return;
    }

    if (userState[userId] === "awaiting_p2p_target") {
        const targetId = parseInt(text);
        if (isNaN(targetId) || targetId === userId) {
            delete userState[userId];
            return ctx.reply("❌ Invalid User ID!");
        }
        userState[userId] = `awaiting_p2p_amount_${targetId}`;
        return ctx.reply(`💸 **Transfer to:** \`${targetId}\`\nEnter Amount:`, { parse_mode: "Markdown" });
    }

    // GIFT CODE REDEEM
    if (userState[userId] === "awaiting_gift_code_input") {
        delete userState[userId];
        const res = await pool.query("SELECT * FROM gift_codes WHERE code = $1 AND is_used = 0", [text]);
        if (res.rows.length === 0) return ctx.reply("❌ Invalid or used Gift Code!");

        const gift = res.rows[0];
        await pool.query("UPDATE gift_codes SET is_used = 1 WHERE code = $1", [text]);
        await updateBalance(userId, parseFloat(gift.reward));
        return ctx.reply(`🎉 **Gift Code Redeemed!** ₹${gift.reward} added to balance.`, { parse_mode: "Markdown" });
    }

    // WITHDRAW REQUEST SUBMISSION
    if (userState[userId] && userState[userId].startsWith("awaiting_withdraw_amount_")) {
        const method = userState[userId].replace("awaiting_withdraw_amount_", "");
        delete userState[userId];

        const amount = parseFloat(text);
        const minLim = parseFloat(await getSetting(`min_wd_${method}`) || "10");
        const maxLim = parseFloat(await getSetting(`max_wd_${method}`) || "10000");

        if (isNaN(amount) || amount < minLim || amount > maxLim) return ctx.reply(`❌ Limit for ${method.toUpperCase()} is ₹${minLim} - ₹${maxLim}`);
        if (parseFloat(user.balance) < amount) return ctx.reply("❌ Insufficient Balance!");

        // Deduct balance initially
        await updateBalance(userId, -amount);

        const wdRes = await pool.query("INSERT INTO withdrawals (user_id, amount, method, status) VALUES ($1, $2, $3, 'PENDING') RETURNING id", [userId, amount, method]);
        const wdId = wdRes.rows[0].id;

        await ctx.reply(`⏳ **Withdrawal Request Submitted!**\n\n💵 Amount: ₹${amount}\n💳 Method: ${method.toUpperCase()}\nStatus: Processing...`, { parse_mode: "Markdown" });

        const appKb = new InlineKeyboard()
            .text("✅ Approve", `wd_app_yes_${wdId}`)
            .text("❌ Reject & Refund", `wd_app_no_${wdId}`);

        try {
            await ctx.api.sendMessage(ADMIN_ID, `🔔 **NEW WITHDRAWAL REQUEST (#${wdId})**\n\n👤 User ID: \`${userId}\`\n💰 Amount: ₹${amount}\n💳 Method: ${method.toUpperCase()}`, { parse_mode: "Markdown", reply_markup: appKb });
        } catch (e) {}
        return;
    }

    // PAYOUT INPUTS
    if (userState[userId] === "awaiting_wallet_input") {
        delete userState[userId];
        const gwName = await getSetting("gateway_name") || "Gateway";
        await pool.query("UPDATE users SET mobile_no = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **${gwName} Wallet Linked:** \`${text}\``, { parse_mode: "Markdown" });
    }
    if (userState[userId] === "awaiting_upi_input") {
        delete userState[userId];
        await pool.query("UPDATE users SET upi_id = $1 WHERE user_id = $2", [text, userId]);
        return ctx.reply(`✅ **UPI Saved:** \`${text}\``, { parse_mode: "Markdown" });
    }

    // MAIN BUTTON TRIGGERS
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
        const gwName = await getSetting("gateway_name") || "Gateway";
        const walletTxt = user.mobile_no ? `${user.mobile_no} (${gwName} Valid ✅)` : "Not Set";
        const upiTxt = user.upi_id || "Not Set";
        const msg = `💳 **Payout Method**\n\nChoose Desired Payment Method From Below 👇\n\nYour Current ${gwName} Wallet - ${walletTxt}\nYour Current UPI - ${upiTxt}`;
        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: await getPayoutMethodsInline() });
    }
    else if (text === lblWithdraw) {
        await ctx.reply(`✨ Choose Withdrawal Method:`, { parse_mode: "Markdown", reply_markup: await getWithdrawInline() });
    }
    else if (text === lblP2p) {
        userState[userId] = "awaiting_p2p_target";
        await ctx.reply("💸 **P2P Balance Transfer**\n\nEnter Target **User ID**:");
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
