const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const Database = require("better-sqlite3");
const http = require("http");

// --- RENDER PORT DUMMY SERVER (FOR 24/7 UNINTERRUPTED UPTIME) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Telegram Bot Service is active and running 24/7!");
}).listen(PORT, () => {
    console.log(`HTTP Server listening on port ${PORT}`);
});

// ---------------- CONFIGURATION ----------------
const BOT_TOKEN = process.env.BOT_TOKEN || "8883226932:AAGIszZzzfhLfl6EMJx-GtRhw4gc371FE_w"; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "8061612320"); 
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);
const db = new Database("bot_database.db");

// Temporary state management for admin inputs
const adminState = {};

// --- DATABASE SETUP ---
function initDatabase() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance REAL DEFAULT 0.0,
            upi_id TEXT DEFAULT NULL
        );
    `);

    // Tasks table
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            reward REAL,
            link TEXT
        );
    `);

    // Gift Codes table
    db.exec(`
        CREATE TABLE IF NOT EXISTS gift_codes (
            code TEXT PRIMARY KEY,
            reward REAL,
            is_used INTEGER DEFAULT 0
        );
    `);

    // System Settings Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // Default settings
    const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("welcome_bonus_enabled", "OFF");
    insertSetting.run("welcome_bonus_amount", "10");
    insertSetting.run("admin_upi_id", "Not Set");
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

        db.prepare("INSERT INTO users (user_id, balance, upi_id) VALUES (?, ?, NULL)").run(userId, initialBal);
        user = { user_id: userId, balance: initialBal, upi_id: null };
    }
    return user;
}

function updateBalance(userId, amount) {
    getUser(userId); // Ensure user exists
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id = ?").run(amount, userId);
}

function setUserUPI(userId, upiId) {
    db.prepare("UPDATE users SET upi_id = ? WHERE user_id = ?").run(upiId, userId);
}

// --- MAIN USER KEYBOARD ---
function getMainKeyboard() {
    return new Keyboard()
        .text("📋 Tasks").text("💳 Wallet / Balance").row()
        .text("⚙️ Link Payment Method").text("💸 P2P Transfer").row()
        .text("🎁 Redeem Gift Code").text("🏧 Withdraw").row()
        .resized();
}

// --- SECURE INLINE ADMIN PANEL ---
function getAdminPanelInline() {
    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Remove Balance", "admin_rem_bal").row()
        .text("💳 Set Gateway / UPI", "admin_set_gateway").text("⚙️ Toggle Bonus", "admin_toggle_bonus").row()
        .text("❌ Close Panel", "admin_close");
}

// --- COMMANDS ---

// /start Command
bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    getUser(userId);
    const bonusStatus = getSetting("welcome_bonus_enabled");

    let bonusMsg = "";
    if (bonusStatus === "ON") {
        const amt = getSetting("welcome_bonus_amount");
        bonusMsg = `\n🎉 You received ₹${amt} Welcome Bonus!`;
    }

    await ctx.reply(`👋 Welcome to Earn Task Bot!\nComplete simple tasks and earn cash rewards.${bonusMsg}`, {
        reply_markup: getMainKeyboard()
    });
});

// /admin Command (STRICTLY FOR ADMIN ONLY)
bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return; // Completely ignores non-admin users

    const gateway = getSetting("admin_upi_id");
    const bonusStatus = getSetting("welcome_bonus_enabled");

    await ctx.reply(
        `🔐 **Secret Admin Control Panel**\n\n• Payment Gateway: \`${gateway}\`\n• Welcome Bonus: *${bonusStatus}*\n\nSelect an option to manage:`,
        {
            parse_mode: "Markdown",
            reply_markup: getAdminPanelInline()
        }
    );
});

// Link UPI
bot.command("linkupi", async (ctx) => {
    const userId = ctx.from.id;
    const upiInput = ctx.match;

    if (!upiInput) {
        return ctx.reply("❌ Invalid Format!\nUse: `/linkupi YOUR_UPI_OR_NUMBER`", { parse_mode: "Markdown" });
    }

    setUserUPI(userId, upiInput.trim());
    await ctx.reply(`✅ Your payment method has been linked: \`${upiInput.trim()}\``, { parse_mode: "Markdown" });
});

// P2P Transfer
bot.command("p2p", async (ctx) => {
    const senderId = ctx.from.id;
    const args = ctx.match.split(" ");
    const receiverId = parseInt(args[0]);
    const amount = parseFloat(args[1]);

    if (!receiverId || isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Invalid Format!\nUse: `/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    }

    const sender = getUser(senderId);
    if (sender.balance < amount) {
        return ctx.reply("❌ Insufficient balance in your wallet!");
    }

    updateBalance(senderId, -amount);
    updateBalance(receiverId, amount);

    await ctx.reply(`✅ Successfully transferred ₹${amount} to User \`${receiverId}\`!`, { parse_mode: "Markdown" });

    try {
        await ctx.api.sendMessage(receiverId, `🎉 You received ₹${amount} from User \`${senderId}\`!`, { parse_mode: "Markdown" });
    } catch (err) {}
});

// Redeem Gift Code
bot.command("redeem", async (ctx) => {
    const userId = ctx.from.id;
    const code = ctx.match.toUpperCase().trim();

    if (!code) {
        return ctx.reply("Please enter a code. Example: `/redeem CODE`", { parse_mode: "Markdown" });
    }

    const gift = db.prepare("SELECT * FROM gift_codes WHERE code = ?").get(code);

    if (!gift) {
        await ctx.reply("❌ Invalid Gift Code!");
    } else if (gift.is_used === 1) {
        await ctx.reply("❌ This Gift Code has already been redeemed!");
    } else {
        db.prepare("UPDATE gift_codes SET is_used = 1 WHERE code = ?").run(code);
        updateBalance(userId, gift.reward);
        await ctx.reply(`🎉 Congratulations! ₹${gift.reward} added to your wallet.`);
    }
});

// Withdraw
bot.command("withdraw", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const amount = parseFloat(ctx.match);

    if (!user.upi_id) {
        return ctx.reply("❌ Please link your UPI / Mobile Number first!");
    }

    if (isNaN(amount) || amount <= 0 || amount > user.balance) {
        return ctx.reply("❌ Invalid amount or insufficient balance!");
    }

    updateBalance(userId, -amount);
    await ctx.reply("✅ Withdrawal request submitted successfully! Admin will process it soon.");

    // Notify Admin
    if (ADMIN_ID) {
        try {
            await ctx.api.sendMessage(
                ADMIN_ID,
                `🔔 **New Withdrawal Request!**\n\n👤 User ID: \`${userId}\`\n💳 UPI/Number: \`${user.upi_id}\`\n💰 Amount: ₹${amount}`,
                { parse_mode: "Markdown" }
            );
        } catch (err) {}
    }
});

// --- INLINE KEYBOARD ACTIONS (ADMIN PANEL) ---
bot.callbackQuery("admin_add_task", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_task";
    await ctx.reply("📝 Send task details in this format:\n\n`Title | Reward | Link`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_create_code", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_giftcode";
    await ctx.reply("🔑 Send Gift Code details in this format:\n\n`CODE AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_add_bal", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_addbal";
    await ctx.reply("💰 Send user details to ADD balance:\n\n`USER_ID AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_rem_bal", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_rembal";
    await ctx.reply("➖ Send user details to REMOVE balance:\n\n`USER_ID AMOUNT`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_set_gateway", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_gateway";
    await ctx.reply("💳 Send Admin Payment UPI ID / Gateway ID:\n\nExample: `admin@upi`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_toggle_bonus", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const curr = getSetting("welcome_bonus_enabled");
    const next = curr === "ON" ? "OFF" : "ON";
    setSetting("welcome_bonus_enabled", next);
    await ctx.reply(`⚙️ Welcome Bonus status changed to: *${next}*`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_close", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
});

// --- TEXT MESSAGE HANDLER ---
bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const user = getUser(userId);

    // Process Admin Input State
    if (userId === ADMIN_ID && adminState[ADMIN_ID]) {
        const state = adminState[ADMIN_ID];
        delete adminState[ADMIN_ID];

        if (state === "awaiting_task") {
            const parts = text.split("|");
            if (parts.length < 3) return ctx.reply("❌ Invalid format. Use: `Title | Reward | Link`", { parse_mode: "Markdown" });
            db.prepare("INSERT INTO tasks (title, reward, link) VALUES (?, ?, ?)").run(parts[0].trim(), parseFloat(parts[1].trim()), parts[2].trim());
            return ctx.reply("✅ Task created successfully!");
        }

        if (state === "awaiting_giftcode") {
            const args = text.split(" ");
            if (args.length < 2) return ctx.reply("❌ Invalid format. Use: `CODE AMOUNT`", { parse_mode: "Markdown" });
            db.prepare("INSERT INTO gift_codes (code, reward) VALUES (?, ?)").run(args[0].toUpperCase().trim(), parseFloat(args[1]));
            return ctx.reply(`✅ Gift code \`${args[0].toUpperCase().trim()}\` created!`, { parse_mode: "Markdown" });
        }

        if (state === "awaiting_addbal") {
            const args = text.split(" ");
            const targetId = parseInt(args[0]);
            const amt = parseFloat(args[1]);
            if (!targetId || isNaN(amt)) return ctx.reply("❌ Invalid format. Use: `USER_ID AMOUNT`", { parse_mode: "Markdown" });
            updateBalance(targetId, amt);
            return ctx.reply(`✅ Added ₹${amt} to User \`${targetId}\``, { parse_mode: "Markdown" });
        }

        if (state === "awaiting_rembal") {
            const args = text.split(" ");
            const targetId = parseInt(args[0]);
            const amt = parseFloat(args[1]);
            if (!targetId || isNaN(amt)) return ctx.reply("❌ Invalid format. Use: `USER_ID AMOUNT`", { parse_mode: "Markdown" });
            updateBalance(targetId, -amt);
            return ctx.reply(`✅ Deducted ₹${amt} from User \`${targetId}\``, { parse_mode: "Markdown" });
        }

        if (state === "awaiting_gateway") {
            setSetting("admin_upi_id", text.trim());
            return ctx.reply(`✅ Admin Payment Gateway/UPI updated to: \`${text.trim()}\``, { parse_mode: "Markdown" });
        }
    }

    // MAIN BUTTON HANDLERS
    if (text === "💳 Wallet / Balance") {
        const upi = user.upi_id ? user.upi_id : "Not Linked ❌";
        await ctx.reply(
            `💰 **Wallet Information:**\n\n💵 Balance: ₹${user.balance.toFixed(2)}\n🔗 Linked UPI/No: \`${upi}\``,
            { parse_mode: "Markdown" }
        );
    } else if (text === "📋 Tasks") {
        const tasks = db.prepare("SELECT * FROM tasks").all();

        if (tasks.length === 0) {
            return ctx.reply("Currently no tasks are available. Check back later!");
        }

        let msg = "🎯 **Available Tasks:**\n\n";
        for (const t of tasks) {
            msg += `🔹 *${t.title}*\n💰 Reward: ₹${t.reward}\n🔗 [Open Task](${t.link})\n\n`;
        }
        await ctx.reply(msg, { parse_mode: "Markdown" });
    } else if (text === "⚙️ Link Payment Method") {
        await ctx.reply("To link your UPI ID or Mobile Number, send command:\n\n`/linkupi YOUR_UPI_OR_NUMBER`", { parse_mode: "Markdown" });
    } else if (text === "💸 P2P Transfer") {
        await ctx.reply("To send money to another user:\n\n`/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    } else if (text === "🎁 Redeem Gift Code") {
        await ctx.reply("To redeem a gift code:\n\n`/redeem CODE`", { parse_mode: "Markdown" });
    } else if (text === "🏧 Withdraw") {
        if (!user.upi_id) {
            return ctx.reply("❌ Please link your payment method first using '⚙️ Link Payment Method'.");
        }
        await ctx.reply(`💳 Current Balance: ₹${user.balance.toFixed(2)}\n\nTo withdraw money, send command:\n\n\`/withdraw AMOUNT\``, { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Grammy.js Task Bot is online!");
