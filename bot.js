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

    // Migration logic for existing databases
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

    const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("welcome_bonus_enabled", "OFF");
    insertSetting.run("welcome_bonus_amount", "10");
    insertSetting.run("support_username", "https://t.me/telegram");
    insertSetting.run("show_live_fund", "ON");
    insertSetting.run("show_statement", "ON");

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

// Validation Helpers
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidIFSC(ifsc) {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
}

function isValidBankAcc(acc) {
    return /^\d{9,18}$/.test(acc);
}

// --- DYNAMIC KEYBOARD BUILDER ---
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

// --- ADMIN INLINE PANELS ---
function getAdminPanelInline() {
    const fundStatus = getSetting("show_live_fund");
    const stmtStatus = getSetting("show_statement");

    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Deduct Balance", "admin_rem_bal").row()
        .text("⌨️ Customize Keyboard", "admin_custom_kb").text("📊 Bot Stats", "admin_stats").row()
        .text("🛠 Set Support Link", "admin_set_support").text("📢 Broadcast", "admin_broadcast").row()
        .text(`💰 Fund Button: ${fundStatus}`, "admin_toggle_fund").text(`📒 Stmt Button: ${stmtStatus}`, "admin_toggle_stmt").row()
        .text("⚙️ Toggle Bonus", "admin_toggle_bonus").text("❌ Close Panel", "admin_close");
}

function getKeyboardManagerInline() {
    const buttons = db.prepare("SELECT * FROM custom_buttons ORDER BY row_idx ASC, btn_key ASC").all();
    const inline = new InlineKeyboard();

    buttons.forEach(b => {
        inline.text(`✏️ ${b.label} (Row ${b.row_idx})`, `kb_edit_${b.btn_key}`).row();
        inline.text("⬅️ Row Up", `kb_move_up_${b.btn_key}`).text("Row Down ➡️", `kb_move_down_${b.btn_key}`).row();
    });

    inline.text("🔙 Back to Admin", "admin_main_menu");
    return inline;
}

// --- COMMAND HANDLERS ---
bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    getUser(userId);
    const bonusStatus = getSetting("welcome_bonus_enabled");

    let bonusMsg = "";
    if (bonusStatus === "ON") {
        const amt = getSetting("welcome_bonus_amount");
        bonusMsg = `\n🎉 **You received ₹${amt} Welcome Bonus!**`;
    }

    await ctx.reply(`👋 **Welcome to Earn Task Bot!**\nComplete simple tasks and earn real cash rewards.${bonusMsg}`, {
        parse_mode: "Markdown",
        reply_markup: getDynamicMainKeyboard()
    });
});

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply(`🔐 **Advanced Admin Panel**\nSelect an operation to configure your bot:`, {
        parse_mode: "Markdown",
        reply_markup: getAdminPanelInline()
    });
});

// --- CALLBACK QUERY HANDLERS ---
bot.callbackQuery("admin_main_menu", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.editMessageText("🔐 **Advanced Admin Panel**\nSelect an operation:", { reply_markup: getAdminPanelInline() });
});

bot.callbackQuery("admin_custom_kb", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.editMessageText("⌨️ **Keyboard Customizer Panel**\n\n- Click **Edit** to change label.\n- Click **Row Up/Down** to re-arrange buttons:", {
        reply_markup: getKeyboardManagerInline()
    });
});

bot.callbackQuery(/^kb_edit_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const btnKey = ctx.match[1];
    adminState[ADMIN_ID] = `edit_label_${btnKey}`;
    await ctx.reply(`✏️ Send new text/label for button \`${btnKey}\`:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^kb_move_up_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const btnKey = ctx.match[1];
    db.prepare("UPDATE custom_buttons SET row_idx = MAX(1, row_idx - 1) WHERE btn_key = ?").run(btnKey);
    await ctx.editMessageReplyMarkup({ reply_markup: getKeyboardManagerInline() });
    await ctx.answerCallbackQuery({ text: "Moved Row Up!" });
});

bot.callbackQuery(/^kb_move_down_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const btnKey = ctx.match[1];
    db.prepare("UPDATE custom_buttons SET row_idx = row_idx + 1 WHERE btn_key = ?").run(btnKey);
    await ctx.editMessageReplyMarkup({ reply_markup: getKeyboardManagerInline() });
    await ctx.answerCallbackQuery({ text: "Moved Row Down!" });
});

bot.callbackQuery("admin_set_support", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_support_link";
    await ctx.reply("🔗 Send new Customer Support Telegram Link (e.g., `https://t.me/YourUsername`):", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_toggle_fund", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const curr = getSetting("show_live_fund");
    const next = curr === "ON" ? "OFF" : "ON";
    setSetting("show_live_fund", next);
    await ctx.editMessageReplyMarkup({ reply_markup: getAdminPanelInline() });
    await ctx.answerCallbackQuery({ text: `Live Fund Button set to ${next}` });
});

bot.callbackQuery("admin_toggle_stmt", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const curr = getSetting("show_statement");
    const next = curr === "ON" ? "OFF" : "ON";
    setSetting("show_statement", next);
    await ctx.editMessageReplyMarkup({ reply_markup: getAdminPanelInline() });
    await ctx.answerCallbackQuery({ text: `Statement Button set to ${next}` });
});

// PAYOUT METHOD CALLBACKS
bot.callbackQuery("set_wallet_action", async (ctx) => {
    userState[ctx.from.id] = "awaiting_wallet_input";
    await ctx.reply("📱 Please enter your Mobile / Wallet Number:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("set_upi_action", async (ctx) => {
    userState[ctx.from.id] = "awaiting_upi_input";
    await ctx.reply("💵 Please enter your UPI ID:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("set_bank_action", async (ctx) => {
    userState[ctx.from.id] = "awaiting_bank_acc";
    await ctx.reply("🏦 Please enter your Bank Account Number:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("set_redeem_action", async (ctx) => {
    userState[ctx.from.id] = "awaiting_redeem_email";
    await ctx.reply("📧 Please enter your Email ID for Redeem Code:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("set_amazon_action", async (ctx) => {
    userState[ctx.from.id] = "awaiting_amazon_email";
    await ctx.reply("🛒 Please enter your Email ID for Amazon Gift Card:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("user_balance_statement", async (ctx) => {
    const user = getUser(ctx.from.id);
    await ctx.reply(`📒 **Balance Statement**\n\nCurrent Balance: ₹${user.balance.toFixed(2)}\nStatus: Active Account\nAll transactions processed securely.`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("user_live_fund", async (ctx) => {
    const totalBal = db.prepare("SELECT SUM(balance) as sum FROM users").get().sum || 0;
    await ctx.reply(`💰 **Live Bot Fund**\n\nTotal Liquidity/Fund in System: ₹${(totalBal + 10000).toFixed(2)}`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_add_task", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_task";
    await ctx.reply("📝 Send task details: `Title | Reward | Link`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_create_code", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_giftcode";
    await ctx.reply("🔑 Send Gift Code: `CODE AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_add_bal", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_addbal";
    await ctx.reply("💰 Send: `USER_ID AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_rem_bal", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_rembal";
    await ctx.reply("➖ Send: `USER_ID AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_stats", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const totalBal = db.prepare("SELECT SUM(balance) as sum FROM users").get().sum || 0;
    await ctx.reply(`📊 **Bot Stats**\nUsers: \`${totalUsers}\`\nTotal Balance: ₹\`${totalBal.toFixed(2)}\``, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_broadcast", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_broadcast";
    await ctx.reply("📢 Send broadcast message:");
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_toggle_bonus", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const curr = getSetting("welcome_bonus_enabled");
    const next = curr === "ON" ? "OFF" : "ON";
    setSetting("welcome_bonus_enabled", next);
    await ctx.reply(`⚙️ Bonus status: *${next}*`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_close", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
});

// --- MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";
    const user = getUser(userId);

    // USER INPUT PROCESSING
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
        if (!isValidBankAcc(text)) {
            return ctx.reply("❌ **Invalid Account Number!** Please enter a valid Bank Account Number (9-18 digits):");
        }
        db.prepare("UPDATE users SET bank_acc = ? WHERE user_id = ?").run(text, userId);
        userState[userId] = "awaiting_bank_ifsc";
        return ctx.reply(`✅ Account Number saved!\n\n🏦 **Now, please enter your Bank IFSC Code:**`);
    }

    if (userState[userId] === "awaiting_bank_ifsc") {
        if (!isValidIFSC(text)) {
            return ctx.reply("❌ **Invalid IFSC Code!** Please enter a valid 11-digit IFSC code (e.g., SBIN0001234):");
        }
        delete userState[userId];
        db.prepare("UPDATE users SET bank_ifsc = ? WHERE user_id = ?").run(text.toUpperCase(), userId);
        return ctx.reply(`✅ **Bank Account Linked Successfully!**\n\nAccount: \`${user.bank_acc}\`\nIFSC: \`${text.toUpperCase()}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_redeem_email") {
        if (!isValidEmail(text)) {
            return ctx.reply("❌ **Invalid Email Address!** Please enter a valid Email ID for Redeem Code:");
        }
        delete userState[userId];
        db.prepare("UPDATE users SET redeem_email = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **Redeem Code Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    if (userState[userId] === "awaiting_amazon_email") {
        if (!isValidEmail(text)) {
            return ctx.reply("❌ **Invalid Email Address!** Please enter a valid Email ID for Amazon Gift Card:");
        }
        delete userState[userId];
        db.prepare("UPDATE users SET amazon_email = ? WHERE user_id = ?").run(text, userId);
        return ctx.reply(`✅ **Amazon Gift Card Email Updated:** \`${text}\``, { parse_mode: "Markdown" });
    }

    // ADMIN INPUT PROCESSING
    if (userId === ADMIN_ID && adminState[ADMIN_ID]) {
        const state = adminState[ADMIN_ID];
        delete adminState[ADMIN_ID];

        if (state === "awaiting_support_link") {
            setSetting("support_username", text);
            return ctx.reply(`✅ **Support Link Updated:** ${text}`);
        }

        if (state.startsWith("edit_label_")) {
            const btnKey = state.replace("edit_label_", "");
            db.prepare("UPDATE custom_buttons SET label = ? WHERE btn_key = ?").run(text, btnKey);
            return ctx.reply(`✅ Button label updated to: *${text}*`, { parse_mode: "Markdown", reply_markup: getDynamicMainKeyboard() });
        }

        if (state === "awaiting_task") {
            const parts = text.split("|");
            if (parts.length < 3) return ctx.reply("❌ Invalid format.");
            db.prepare("INSERT INTO tasks (title, reward, link) VALUES (?, ?, ?)").run(parts[0].trim(), parseFloat(parts[1].trim()), parts[2].trim());
            return ctx.reply("✅ Task created!");
        }

        if (state === "awaiting_giftcode") {
            const args = text.split(" ");
            db.prepare("INSERT INTO gift_codes (code, reward) VALUES (?, ?)").run(args[0].toUpperCase().trim(), parseFloat(args[1]));
            return ctx.reply("✅ Gift code created!");
        }

        if (state === "awaiting_addbal") {
            const args = text.split(" ");
            updateBalance(parseInt(args[0]), parseFloat(args[1]));
            return ctx.reply("✅ Balance added!");
        }

        if (state === "awaiting_rembal") {
            const args = text.split(" ");
            updateBalance(parseInt(args[0]), -parseFloat(args[1]));
            return ctx.reply("✅ Balance deducted!");
        }

        if (state === "awaiting_broadcast") {
            const users = db.prepare("SELECT user_id FROM users").all();
            for (const u of users) {
                try { await ctx.api.sendMessage(u.user_id, `📢 **Announcement:**\n\n${text}`, { parse_mode: "Markdown" }); } catch (e) {}
            }
            return ctx.reply("✅ Broadcast completed!");
        }
    }

    const lblTasks = getButtonLabel("btn_tasks");
    const lblBal = getButtonLabel("btn_balance");
    const lblGift = getButtonLabel("btn_gift");
    const lblP2p = getButtonLabel("btn_p2p");
    const lblWithdraw = getButtonLabel("btn_withdraw");
    const lblPayment = getButtonLabel("btn_payment");

    if (text === lblBal) {
        const supportLink = getSetting("support_username") || "https://t.me/telegram";
        const fundStatus = getSetting("show_live_fund");
        const stmtStatus = getSetting("show_statement");

        const balMsg = 
            `💳 **Wallet Overview** 💳\n\n` +
            `🌐 **Wallet ID** → \`${userId}\`\n` +
            `💵 **Balance** → ₹${user.balance.toFixed(2)}\n\n` +
            `*Built with security you can Trust. Support that responds promptly. ✅*`;

        const balInline = new InlineKeyboard();

        if (stmtStatus === "ON") {
            balInline.text("📒 Balance Statement", "user_balance_statement").row();
        }
        if (fundStatus === "ON") {
            balInline.text("💰 Live Bot Fund", "user_live_fund").row();
        }

        balInline.url("📣 Contact Support", supportLink);

        await ctx.reply(balMsg, { parse_mode: "Markdown", reply_markup: balInline });
    } 
    else if (text === lblPayment) {
        const walletVal = user.mobile_no ? `\`${user.mobile_no}\`` : "*Not Set*";
        const upiVal = user.upi_id ? `\`${user.upi_id}\`` : "*Not Set*";
        const bankVal = user.bank_acc ? `\`${user.bank_acc} (${user.bank_ifsc})\`` : "*Not Set*";
        const redeemVal = user.redeem_email ? `\`${user.redeem_email}\`` : "*Not Set*";
        const amazonVal = user.amazon_email ? `\`${user.amazon_email}\`` : "*Not Set*";

        const payMsg = 
            `Choose Desired Payment Method From Below 👇\n\n` +
            `Your Current Wallet - ${walletVal}\n` +
            `Your Current UPI - ${upiVal}\n` +
            `Your Current Bank - ${bankVal}\n` +
            `Your Current Redeem Email - ${redeemVal}\n` +
            `Your Current Amazon Email - ${amazonVal}`;

        const payInline = new InlineKeyboard()
            .text("🔗 Set Wallet", "set_wallet_action").row()
            .text("💵 Set UPI Address", "set_upi_action").row()
            .text("🏦 Set Bank Account", "set_bank_action").row()
            .text("🎁 Set Redeem Code Email", "set_redeem_action").row()
            .text("🛒 Set Amazon Gift Card Email", "set_amazon_action");

        await ctx.reply(payMsg, { parse_mode: "Markdown", reply_markup: payInline });
    }
    else if (text === lblTasks) {
        const tasks = db.prepare("SELECT * FROM tasks").all();
        if (tasks.length === 0) return ctx.reply("✨ No tasks available currently.");

        await ctx.reply("🎯 **Available Tasks:**");
        for (const t of tasks) {
            const taskInline = new InlineKeyboard().url("🔗 Open Link", t.link);
            await ctx.reply(`📌 **${t.title}**\n💵 **Reward:** ₹${t.reward}`, { parse_mode: "Markdown", reply_markup: taskInline });
        }
    } 
    else if (text === lblGift) {
        await ctx.reply("🎁 **Gift Code Enter**\n\nSend your code using: `/redeem CODE`", { parse_mode: "Markdown" });
    } 
    else if (text === lblP2p) {
        await ctx.reply("💸 **P2P Transfer**\n\nUse command:\n`/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    } 
    else if (text === lblWithdraw) {
        if (!user.upi_id && !user.mobile_no && !user.bank_acc && !user.redeem_email && !user.amazon_email) {
            return ctx.reply("❌ Link at least one payment method first!");
        }
        await ctx.reply(`🏧 **Withdrawal Panel**\nBalance: ₹${user.balance.toFixed(2)}\n\nUse command:\n\`/withdraw AMOUNT\``, { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Bot updated with Bank Account, Redeem Email & Amazon Gift Card options!");
