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
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE"; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "8061612320"); 
const SUPPORT_USERNAME = "YourSupportUsername"; // നിങ്ങളുടെ സപ്പോർട്ട് യൂസർനെയിം (@ ഇല്ലാതെ)
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
            mobile_no TEXT DEFAULT NULL
        );
    `);

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

    // Dynamic Keyboard default setup (Requested Row Order)
    const initBtn = db.prepare("INSERT OR IGNORE INTO custom_buttons (btn_key, label, row_idx) VALUES (?, ?, ?)");
    initBtn.run("btn_tasks", "📋 Tasks", 1);
    initBtn.run("btn_balance", "💳 My Balance", 1);
    initBtn.run("btn_gift", "🎁 Gift Code", 2);
    initBtn.run("btn_p2p", "💸 P2P Transfer", 2);
    initBtn.run("btn_withdraw", "🏧 Withdraw", 3);
    initBtn.run("btn_payment", "⚙️ Payment Method", 3);
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
        db.prepare("INSERT INTO users (user_id, balance, upi_id, mobile_no) VALUES (?, ?, NULL, NULL)").run(userId, initialBal);
        user = { user_id: userId, balance: initialBal, upi_id: null, mobile_no: null };
    }
    return user;
}

function updateBalance(userId, amount) {
    getUser(userId);
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id = ?").run(amount, userId);
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
    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Deduct Balance", "admin_rem_bal").row()
        .text("⌨️ Customize Keyboard", "admin_custom_kb").text("📊 Bot Stats", "admin_stats").row()
        .text("📢 Broadcast Message", "admin_broadcast").text("⚙️ Toggle Bonus", "admin_toggle_bonus").row()
        .text("❌ Close Panel", "admin_close");
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
    await ctx.reply(`🔐 **Advanced Admin Panel**\nSelect an operation:`, {
        parse_mode: "Markdown",
        reply_markup: getAdminPanelInline()
    });
});

bot.command("linkupi", async (ctx) => {
    const userId = ctx.from.id;
    const upiInput = ctx.match;
    if (!upiInput) return ctx.reply("❌ **Use:** `/linkupi YOUR_UPI_ID`", { parse_mode: "Markdown" });
    db.prepare("UPDATE users SET upi_id = ? WHERE user_id = ?").run(upiInput.trim(), userId);
    await ctx.reply(`✅ **UPI ID Linked Successfully!**\n\`${upiInput.trim()}\``, { parse_mode: "Markdown" });
});

bot.command("linkmobile", async (ctx) => {
    const userId = ctx.from.id;
    const mobileInput = ctx.match;
    if (!mobileInput) return ctx.reply("❌ **Use:** `/linkmobile YOUR_NUMBER`", { parse_mode: "Markdown" });
    db.prepare("UPDATE users SET mobile_no = ? WHERE user_id = ?").run(mobileInput.trim(), userId);
    await ctx.reply(`✅ **Gateway Mobile Number Linked!**\n\`${mobileInput.trim()}\``, { parse_mode: "Markdown" });
});

bot.command("p2p", async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.match ? ctx.match.split(" ") : [];

    if (args.length < 2) {
        return ctx.reply("❌ **Use:** `/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    }

    const targetId = parseInt(args[0]);
    const amount = parseFloat(args[1]);

    if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Invalid User ID or Amount!");
    }

    if (targetId === userId) {
        return ctx.reply("❌ You cannot send balance to yourself!");
    }

    const sender = getUser(userId);
    if (sender.balance < amount) {
        return ctx.reply("❌ **Insufficient Balance!**");
    }

    updateBalance(userId, -amount);
    updateBalance(targetId, amount);

    await ctx.reply(`✅ **Successfully transferred ₹${amount.toFixed(2)} to ID:** \`${targetId}\``, { parse_mode: "Markdown" });

    try {
        await ctx.api.sendMessage(targetId, `🎉 **You received ₹${amount.toFixed(2)} from Telegram ID:** \`${userId}\``, { parse_mode: "Markdown" });
    } catch (err) {}
});

bot.command("withdraw", async (ctx) => {
    const userId = ctx.from.id;
    const amount = parseFloat(ctx.match);
    const user = getUser(userId);

    if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ **Use:** `/withdraw AMOUNT`", { parse_mode: "Markdown" });
    }

    if (user.balance < amount) {
        return ctx.reply("❌ **Insufficient Balance!**");
    }

    if (!user.upi_id && !user.mobile_no) {
        return ctx.reply("❌ Please link your Payment Method first!");
    }

    updateBalance(userId, -amount);
    await ctx.reply(`✅ **Withdrawal Request Submitted!**\nAmount: ₹${amount.toFixed(2)}\nStatus: Pending Approval`);

    if (ADMIN_ID) {
        try {
            await ctx.api.sendMessage(
                ADMIN_ID,
                `📥 **Withdrawal Request!**\nUser ID: \`${userId}\`\nAmount: ₹${amount.toFixed(2)}\nUPI ID: \`${user.upi_id || "None"}\`\nMobile: \`${user.mobile_no || "None"}\``,
                { parse_mode: "Markdown" }
            );
        } catch (e) {}
    }
});

function processRedeemCode(ctx, codeRaw) {
    const userId = ctx.from.id;
    let code = codeRaw.trim().toUpperCase();
    if (!code) return ctx.reply("❌ Enter a valid Gift Code!");

    const gift = db.prepare("SELECT * FROM gift_codes WHERE code = ?").get(code);
    if (!gift) return ctx.reply("❌ **Invalid Gift Code!**");
    if (gift.is_used === 1) return ctx.reply("❌ **Already Redeemed!**");

    db.prepare("UPDATE gift_codes SET is_used = 1 WHERE code = ?").run(code);
    updateBalance(userId, gift.reward);
    return ctx.reply(`🎉 **Congratulations!** ₹${gift.reward} added to your wallet!`, { parse_mode: "Markdown" });
}

// --- CALLBACK QUERY HANDLERS ---
bot.callbackQuery("admin_main_menu", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.editMessageText("🔐 **Advanced Admin Panel**\nSelect an operation:", { reply_markup: getAdminPanelInline() });
});

bot.callbackQuery("admin_custom_kb", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.editMessageText("⌨️ **Keyboard Customizer Panel**\n\n- Click **Edit** to change button text.\n- Click **Row Up/Down (Arrows)** to move button position:", {
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

bot.callbackQuery("refresh_balance", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    const balanceText = 
        `✨ **My Balance Dashboard** ✨\n\n` +
        `🆔 **Telegram ID:** \`${userId}\` *(Tap to Copy)*\n` +
        `💰 **Balance:** ₹${user.balance.toFixed(2)}`;

    const balanceInline = new InlineKeyboard()
        .text("🔄 Refresh", "refresh_balance")
        .url("💬 Customer Support", `https://t.me/${SUPPORT_USERNAME}`);

    try {
        await ctx.editMessageText(balanceText, { parse_mode: "Markdown", reply_markup: balanceInline });
        await ctx.answerCallbackQuery({ text: "✅ Balance Refreshed!" });
    } catch (err) {
        await ctx.answerCallbackQuery({ text: "Already Up to date!" });
    }
});

bot.callbackQuery(/^submit_proof_(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    userState[ctx.from.id] = `awaiting_proof_${taskId}`;
    await ctx.reply(`📸 **Submit Task Proof**\nSend screenshot or proof message for Task #${taskId}:`);
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("pay_link_upi", async (ctx) => {
    await ctx.reply("💳 **Link UPI ID**\nSend command:\n\n`/linkupi YOUR_UPI_ID`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("pay_link_mobile", async (ctx) => {
    await ctx.reply("📱 **Link Gateway / Mobile**\nSend command:\n\n`/linkmobile YOUR_NUMBER`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

// Admin standard callbacks
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
    const totalTasks = db.prepare("SELECT COUNT(*) as count FROM tasks").get().count;
    await ctx.reply(`📊 **Bot Stats**\nUsers: \`${totalUsers}\`\nTotal Balance: ₹\`${totalBal.toFixed(2)}\`\nTasks: \`${totalTasks}\``, { parse_mode: "Markdown" });
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

    // 1. Task proof submission
    if (userState[userId] && userState[userId].startsWith("awaiting_proof_")) {
        const taskId = userState[userId].replace("awaiting_proof_", "");
        delete userState[userId];
        await ctx.reply("✅ **Proof Received!** Admin will review soon.");
        if (ADMIN_ID) {
            try {
                await ctx.api.sendMessage(ADMIN_ID, `📥 **Task Proof Submitted!**\nUser: \`${userId}\` | Task: #${taskId}`, { parse_mode: "Markdown" });
                await ctx.forwardMessage(ADMIN_ID, ctx.message.message_id);
            } catch (e) {}
        }
        return;
    }

    // 2. Admin inputs
    if (userId === ADMIN_ID && adminState[ADMIN_ID]) {
        const state = adminState[ADMIN_ID];
        delete adminState[ADMIN_ID];

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

    // 3. User Gift Code Input
    if (userState[userId] === "awaiting_gift_code") {
        delete userState[userId];
        return processRedeemCode(ctx, text);
    }

    // 4. MAIN DYNAMIC BUTTON HANDLERS
    const lblTasks = getButtonLabel("btn_tasks");
    const lblBal = getButtonLabel("btn_balance");
    const lblGift = getButtonLabel("btn_gift");
    const lblP2p = getButtonLabel("btn_p2p");
    const lblWithdraw = getButtonLabel("btn_withdraw");
    const lblPayment = getButtonLabel("btn_payment");

    if (text === lblBal) {
        const balanceText = 
            `✨ **My Balance Dashboard** ✨\n\n` +
            `🆔 **Telegram ID:** \`${userId}\` *(Tap to Copy)*\n` +
            `💰 **Balance:** ₹${user.balance.toFixed(2)}`;

        const balanceInline = new InlineKeyboard()
            .text("🔄 Refresh", "refresh_balance")
            .url("💬 Customer Support", `https://t.me/${SUPPORT_USERNAME}`);

        await ctx.reply(balanceText, { parse_mode: "Markdown", reply_markup: balanceInline });
    } 
    else if (text === lblTasks) {
        const tasks = db.prepare("SELECT * FROM tasks").all();
        if (tasks.length === 0) return ctx.reply("✨ No tasks available currently.");

        await ctx.reply("🎯 **Available Tasks:**");
        for (const t of tasks) {
            const taskInline = new InlineKeyboard()
                .url("🔗 Open Link", t.link).row()
                .text("📤 Submit Proof / Screenshot", `submit_proof_${t.id}`);

            await ctx.reply(`📌 **${t.title}**\n💵 **Reward:** ₹${t.reward}`, {
                parse_mode: "Markdown",
                reply_markup: taskInline
            });
        }
    } 
    else if (text === lblGift) {
        userState[userId] = "awaiting_gift_code";
        await ctx.reply("🎁 **Gift Code Enter**\n\nദയവായി നിങ്ങളുടെ ഗിഫ്റ്റ് കോഡ് താഴെ ടൈപ്പ് ചെയ്തു അയക്കുക:", { parse_mode: "Markdown" });
    } 
    else if (text === lblPayment) {
        const payInline = new InlineKeyboard()
            .text("💳 Link UPI ID", "pay_link_upi").row()
            .text("📱 Link Gateway / Mobile Number", "pay_link_mobile");

        await ctx.reply("⚙️ **Payment Method Settings**", { parse_mode: "Markdown", reply_markup: payInline });
    } 
    else if (text === lblP2p) {
        await ctx.reply("💸 **P2P Transfer**\n\nവഴി പണം അയക്കാൻ:\n`/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    } 
    else if (text === lblWithdraw) {
        if (!user.upi_id && !user.mobile_no) return ctx.reply("❌ Link payment method first!");
        await ctx.reply(`🏧 **Withdrawal Panel**\nBalance: ₹${user.balance.toFixed(2)}\n\nപണം പിൻവലിക്കാൻ:\n\`/withdraw AMOUNT\``, { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Custom Editable Keyboard Bot is active!");
