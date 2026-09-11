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
const SUPPORT_USERNAME = "YourSupportUsername"; // നിങ്ങളുടെ സപ്പോർട്ട് യൂസർനെയിം ഇവിടെ നൽകാം (@ ഒഴിവാക്കി)
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);
const db = new Database("bot_database.db");

// State management
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

        db.prepare("INSERT INTO users (user_id, balance, upi_id, mobile_no) VALUES (?, ?, NULL, NULL)").run(userId, initialBal);
        user = { user_id: userId, balance: initialBal, upi_id: null, mobile_no: null };
    }
    return user;
}

function updateBalance(userId, amount) {
    getUser(userId);
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id = ?").run(amount, userId);
}

function setUserUPI(userId, upiId) {
    db.prepare("UPDATE users SET upi_id = ? WHERE user_id = ?").run(upiId, userId);
}

function setUserMobile(userId, mobileNo) {
    db.prepare("UPDATE users SET mobile_no = ? WHERE user_id = ?").run(mobileNo, userId);
}

// --- MAIN KEYBOARD LAYOUT ---
function getMainKeyboard() {
    return new Keyboard()
        .text("💳 My Balance").text("💸 P2P Transfer").row()
        .text("🎁 Gift Code").text("ℹ️ Help / Info").row()
        .text("🏧 Withdraw").text("⚙️ Payment Method").row() // വിത്ഡ്രോ ഇടത്, പേയ്മെന്റ് മെത്തേഡ് വലത് (3rd row)
        .text("📋 Tasks") // എന്റ് ലൈൻ ബട്ടൺ
        .resized();
}

// --- ADMIN PANEL INLINE KEYBOARD ---
function getAdminPanelInline() {
    return new InlineKeyboard()
        .text("➕ Add Task", "admin_add_task").text("🔑 Create Gift Code", "admin_create_code").row()
        .text("💰 Add Balance", "admin_add_bal").text("➖ Remove Balance", "admin_rem_bal").row()
        .text("💳 Set Gateway / UPI", "admin_set_gateway").text("⚙️ Toggle Bonus", "admin_toggle_bonus").row()
        .text("❌ Close Panel", "admin_close");
}

// --- COMMAND HANDLERS ---

// /start Command
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
        reply_markup: getMainKeyboard()
    });
});

// /admin Command
bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

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
        return ctx.reply("❌ **Invalid Format!**\nUse: `/linkupi YOUR_UPI_ID`", { parse_mode: "Markdown" });
    }

    setUserUPI(userId, upiInput.trim());
    await ctx.reply(`✅ **UPI ID Linked Successfully!**\n\n` + "```\n" + upiInput.trim() + "\n```", { parse_mode: "Markdown" });
});

// Link Mobile / Gateway
bot.command("linkmobile", async (ctx) => {
    const userId = ctx.from.id;
    const mobileInput = ctx.match;

    if (!mobileInput) {
        return ctx.reply("❌ **Invalid Format!**\nUse: `/linkmobile YOUR_NUMBER`", { parse_mode: "Markdown" });
    }

    setUserMobile(userId, mobileInput.trim());
    await ctx.reply(`✅ **Gateway Mobile Number Linked!**\n\n` + "```\n" + mobileInput.trim() + "\n```", { parse_mode: "Markdown" });
});

// Redeem Gift Code Process
function processRedeemCode(ctx, codeRaw) {
    const userId = ctx.from.id;
    let code = codeRaw.trim().toUpperCase();

    if (!code) {
        return ctx.reply("❌ Please enter a valid Gift Code!", { parse_mode: "Markdown" });
    }

    const gift = db.prepare("SELECT * FROM gift_codes WHERE code = ?").get(code);

    if (!gift) {
        return ctx.reply("❌ **Invalid Gift Code!** Please check and try again.", { parse_mode: "Markdown" });
    } else if (gift.is_used === 1) {
        return ctx.reply("❌ **Already Redeemed!** This gift code was used.", { parse_mode: "Markdown" });
    } else {
        db.prepare("UPDATE gift_codes SET is_used = 1 WHERE code = ?").run(code);
        updateBalance(userId, gift.reward);
        return ctx.reply(`🎉 **Congratulations!** ₹${gift.reward} added to your wallet!`, { parse_mode: "Markdown" });
    }
}

bot.command("redeem", async (ctx) => {
    processRedeemCode(ctx, ctx.match);
});

// P2P Command
bot.command("p2p", async (ctx) => {
    const senderId = ctx.from.id;
    const args = ctx.match.split(" ");
    const receiverId = parseInt(args[0]);
    const amount = parseFloat(args[1]);

    if (!receiverId || isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ **Invalid Format!**\nUse: `/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
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

// Withdraw Command
bot.command("withdraw", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const amount = parseFloat(ctx.match);

    if (!user.upi_id && !user.mobile_no) {
        return ctx.reply("❌ Please link your payment method first using '⚙️ Payment Method'.");
    }

    if (isNaN(amount) || amount <= 0 || amount > user.balance) {
        return ctx.reply("❌ Invalid amount or insufficient balance!");
    }

    updateBalance(userId, -amount);
    await ctx.reply("✅ Withdrawal request submitted successfully! Admin will process it soon.");

    if (ADMIN_ID) {
        try {
            await ctx.api.sendMessage(
                ADMIN_ID,
                `🔔 **New Withdrawal Request!**\n\n👤 User ID: \`${userId}\`\n💳 UPI: \`${user.upi_id || "N/A"}\`\n📱 Mobile: \`${user.mobile_no || "N/A"}\`\n💰 Amount: ₹${amount}`,
                { parse_mode: "Markdown" }
            );
        } catch (err) {}
    }
});

// --- INLINE CALLBACK QUERY HANDLERS ---

// Refresh Balance Action
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
        await ctx.editMessageText(balanceText, {
            parse_mode: "Markdown",
            reply_markup: balanceInline
        });
        await ctx.answerCallbackQuery({ text: "✅ Balance Refreshed!" });
    } catch (err) {
        await ctx.answerCallbackQuery({ text: "Already Up to date!" });
    }
});

// Task Submit Proof Action
bot.callbackQuery(/^submit_proof_(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    userState[ctx.from.id] = `awaiting_proof_${taskId}`;
    await ctx.reply(`📸 **Submit Task Proof**\n\nPlease send the screenshot or proof for Task #${taskId} as an image/text here.`);
    await ctx.answerCallbackQuery();
});

// Payment Method Actions
bot.callbackQuery("pay_link_upi", async (ctx) => {
    await ctx.reply("💳 **Link UPI ID**\n\nTo link your UPI ID, send command:\n\n`/linkupi YOUR_UPI_ID`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("pay_link_mobile", async (ctx) => {
    await ctx.reply("📱 **Link Gateway / Mobile Number**\n\nTo link mobile number, send command:\n\n`/linkmobile YOUR_NUMBER`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

// Admin Callbacks
bot.callbackQuery("admin_add_task", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_task";
    await ctx.reply("📝 Send task details in format:\n\n`Title | Reward | Link`", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("admin_create_code", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ADMIN_ID] = "awaiting_giftcode";
    await ctx.reply("🔑 Send Gift Code details in format:\n\n`CODE AMOUNT`", { parse_mode: "Markdown" });
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

// --- MAIN MESSAGE HANDLER ---
bot.on("message", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text ? ctx.message.text.trim() : "";
    const user = getUser(userId);

    // 1. Process Task Proof Submission (Photo / Text)
    if (userState[userId] && userState[userId].startsWith("awaiting_proof_")) {
        const taskId = userState[userId].replace("awaiting_proof_", "");
        delete userState[userId];

        await ctx.reply("✅ **Proof Received!** Admin will review and credit your reward soon.");

        if (ADMIN_ID) {
            try {
                await ctx.api.sendMessage(
                    ADMIN_ID,
                    `📥 **New Task Proof Submitted!**\n\n👤 User ID: \`${userId}\`\n📌 Task ID: #${taskId}`,
                    { parse_mode: "Markdown" }
                );
                // Forward the screenshot or proof message to admin
                await ctx.forwardMessage(ADMIN_ID, ctx.message.message_id);
            } catch (err) {}
        }
        return;
    }

    // 2. Check Admin Inputs
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
            setSetting("admin_upi_id", text);
            return ctx.reply(`✅ Admin Payment Gateway/UPI updated to: \`${text}\``, { parse_mode: "Markdown" });
        }
    }

    // 3. Gift Code User Input
    if (userState[userId] === "awaiting_gift_code") {
        delete userState[userId];
        return processRedeemCode(ctx, text);
    }

    // 4. MAIN BUTTON HANDLERS
    if (text === "💳 My Balance") {
        const balanceText = 
            `✨ **My Balance Dashboard** ✨\n\n` +
            `🆔 **Telegram ID:** \`${userId}\` *(Tap to Copy)*\n` +
            `💰 **Balance:** ₹${user.balance.toFixed(2)}`;

        const balanceInline = new InlineKeyboard()
            .text("🔄 Refresh", "refresh_balance")
            .url("💬 Customer Support", `https://t.me/${SUPPORT_USERNAME}`);

        await ctx.reply(balanceText, {
            parse_mode: "Markdown",
            reply_markup: balanceInline
        });
    } 
    else if (text === "🎁 Gift Code") {
        userState[userId] = "awaiting_gift_code";
        await ctx.reply("🎁 **Gift Code Enter**\n\nദയവായി നിങ്ങളുടെ ഗിഫ്റ്റ് കോഡ് താഴെ ടൈപ്പ് ചെയ്തു അയക്കുക:", { parse_mode: "Markdown" });
    } 
    else if (text === "📋 Tasks") {
        const tasks = db.prepare("SELECT * FROM tasks").all();

        if (tasks.length === 0) {
            return ctx.reply("✨ Currently no tasks are available. Check back later!");
        }

        await ctx.reply("🎯 **Available Tasks:**\n\nസമ്പാദിക്കാനായി താഴെ കാണുന്ന ടാസ്ക് ഓപ്പൺ ചെയ്യുകയും പൂർത്തിയാക്കിയ ശേഷം പ്രൂഫ് അപ്‌ലോഡ് ചെയ്യുകയും ചെയ്യുക:");

        for (const t of tasks) {
            const taskInlineKeyboard = new InlineKeyboard()
                .url("🔗 Open Link", t.link).row()
                .text("📤 Submit Proof / Screenshot", `submit_proof_${t.id}`);

            await ctx.reply(
                `📌 **${t.title}**\n💵 **Reward:** ₹${t.reward}`,
                {
                    parse_mode: "Markdown",
                    reply_markup: taskInlineKeyboard
                }
            );
        }
    } 
    else if (text === "⚙️ Payment Method") {
        const payInline = new InlineKeyboard()
            .text("💳 Link UPI ID", "pay_link_upi").row()
            .text("📱 Link Gateway / Mobile Number", "pay_link_mobile");

        await ctx.reply("⚙️ **Payment Method Settings**\n\nതാഴെ നൽകിയിരിക്കുന്നതിൽ ഏതെങ്കിലും പേയ്‌മെന്റ് രീതി തിരഞ്ഞെടുക്കുക:", {
            parse_mode: "Markdown",
            reply_markup: payInline
        });
    } 
    else if (text === "💸 P2P Transfer") {
        await ctx.reply(
            "💸 **P2P Transfer (Pay to User)**\n\n" +
            "മറ്റൊരു യൂസർക്ക് പണം അയക്കാൻ താഴെ കാണുന്ന രീതിയിൽ ടൈപ്പ് ചെയ്തു അയക്കുക:\n\n" +
            "`/p2p USER_ID AMOUNT`\n\n" +
            "*Example:* `/p2p 123456789 50`",
            { parse_mode: "Markdown" }
        );
    } 
    else if (text === "🏧 Withdraw") {
        if (!user.upi_id && !user.mobile_no) {
            return ctx.reply("❌ Please link your payment method first using '⚙️ Payment Method'.");
        }
        await ctx.reply(`🏧 **Withdrawal Panel**\n\n💰 Current Balance: ₹${user.balance.toFixed(2)}\n\nപണം വിത്ഡ്രോ ചെയ്യാൻ താഴെ കാണുന്ന രീതിയിൽ അയക്കുക:\n\n\`/withdraw AMOUNT\``, { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Upgraded Custom Task Bot is online!");
