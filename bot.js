const { Bot, Keyboard } = require("grammy");
const Database = require("better-sqlite3");

// ---------------- CONFIGURATION ----------------
// നിങ്ങളുടെ BotFather-ൽ നിന്നുള്ള Token-ഉം Telegram ID-യും താഴെ നൽകുക
const BOT_TOKEN = "8883226932:AAEL-FwpMxwiBVcxfn-i6O5ga1W1BWSj7ik"; 
const ADMIN_ID = 8061612320; 
// -----------------------------------------------

const bot = new Bot(BOT_TOKEN);
const db = new Database("bot_database.db");

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

    // System Settings Table (Bonus ON/OFF)
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // Default settings setup
    const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("welcome_bonus_enabled", "OFF");
    insertSetting.run("welcome_bonus_amount", "10");
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
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id = ?").run(amount, userId);
}

function setUserUPI(userId, upiId) {
    db.prepare("UPDATE users SET upi_id = ? WHERE user_id = ?").run(upiId, userId);
}

// --- MAIN KEYBOARD ---
function getMainKeyboard(userId) {
    const kb = new Keyboard()
        .text("📋 Tasks").text("💳 Wallet / Balance").row()
        .text("⚙️ Link Payment Method").text("💸 P2P Transfer").row()
        .text("🎁 Redeem Gift Code").text("🏧 Withdraw").row();

    if (userId === ADMIN_ID) {
        kb.text("➕ Add Task").text("🔑 Create Gift Code").row();
        kb.text("⚙️ Admin Settings").row();
    }

    return kb.resized();
}

// --- COMMANDS & HANDLERS ---

// /start Command
bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const bonusStatus = getSetting("welcome_bonus_enabled");

    let bonusMsg = "";
    if (bonusStatus === "ON") {
        const amt = getSetting("welcome_bonus_amount");
        bonusMsg = `\n🎉 നിങ്ങൾക്ക് ₹${amt} വെൽക്കം ബോണസ് ലഭിച്ചിട്ടുണ്ട്!`;
    }

    await ctx.reply(`👋 സ്വാഗതം! ടാസ്കുകൾ പൂർത്തിയാക്കി പണം സമ്പാദിക്കുക.${bonusMsg}`, {
        reply_markup: getMainKeyboard(userId)
    });
});

// Link UPI Command: /linkupi YOUR_UPI_ID
bot.command("linkupi", async (ctx) => {
    const userId = ctx.from.id;
    const upiInput = ctx.match;

    if (!upiInput) {
        return ctx.reply("❌ ഫോർമാറ്റ് തെറ്റാണ്!\nഉപയോഗിക്കേണ്ടത്: `/linkupi YOUR_UPI_OR_NUMBER`", { parse_mode: "Markdown" });
    }

    setUserUPI(userId, upiInput.trim());
    await ctx.reply(`✅ നിങ്ങളുടെ പേയ്‌മെന്റ് മെത്തേഡ് ലിങ്ക് ചെയ്തു: \`${upiInput.trim()}\``, { parse_mode: "Markdown" });
});

// Admin Bonus Toggle: /setbonus ON / OFF
bot.command("setbonus", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const status = ctx.match.toUpperCase().trim();

    if (status === "ON" || status === "OFF") {
        setSetting("welcome_bonus_enabled", status);
        await ctx.reply(`✅ Welcome Bonus ഇപ്പോൾ *${status}* ആക്കിയിട്ടുണ്ട്.`, { parse_mode: "Markdown" });
    } else {
        await ctx.reply("ഉപയോഗിക്കേണ്ടത്: `/setbonus ON` അല്ലെങ്കിൽ `/setbonus OFF`");
    }
});

// Admin Bonus Amount: /setbonusamt 20
bot.command("setbonusamt", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const amt = parseFloat(ctx.match);

    if (isNaN(amt)) {
        return ctx.reply("ഉപയോഗിക്കേണ്ടത്: `/setbonusamt 20`");
    }

    setSetting("welcome_bonus_amount", amt.toString());
    await ctx.reply(`✅ Welcome Bonus തുക *₹${amt}* ആയി സെറ്റ് ചെയ്തു.`, { parse_mode: "Markdown" });
});

// P2P Transfer: /p2p USER_ID AMOUNT
bot.command("p2p", async (ctx) => {
    const senderId = ctx.from.id;
    const args = ctx.match.split(" ");
    const receiverId = parseInt(args[0]);
    const amount = parseFloat(args[1]);

    if (!receiverId || isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ തെറ്റായ ഫോർമാറ്റ്!\nഉപയോഗിക്കേണ്ടത്: `/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    }

    const sender = getUser(senderId);
    if (sender.balance < amount) {
        return ctx.reply("❌ നിങ്ങളുടെ വാലറ്റിൽ ആവശ്യത്തിന് ബാലൻസ് ഇല്ല!");
    }

    updateBalance(senderId, -amount);
    updateBalance(receiverId, amount);

    await ctx.reply(`✅ ₹${amount} വിജയകരമായി User \`${receiverId}\` ലേക്ക് അയച്ചു!`, { parse_mode: "Markdown" });

    try {
        await ctx.api.sendMessage(receiverId, `🎉 നിങ്ങൾക്ക് User \`${senderId}\` ൽ നിന്ന് ₹${amount} വാലറ്റിൽ ലഭിച്ചിരിക്കുന്നു!`, { parse_mode: "Markdown" });
    } catch (err) {
        // User blocked bot or invalid ID
    }
});

// Redeem Gift Code: /redeem CODE
bot.command("redeem", async (ctx) => {
    const userId = ctx.from.id;
    const code = ctx.match.toUpperCase().trim();

    if (!code) {
        return ctx.reply("ദയവായി കോഡ് നൽകുക. ഉദാഹരണം: `/redeem CODE`", { parse_mode: "Markdown" });
    }

    const gift = db.prepare("SELECT * FROM gift_codes WHERE code = ?").get(code);

    if (!gift) {
        await ctx.reply("❌ ഈ ഗിഫ്റ്റ് കോഡ് സാധുവല്ല!");
    } else if (gift.is_used === 1) {
        await ctx.reply("❌ ഈ ഗിഫ്റ്റ് കോഡ് മുൻപ് ഉപയോഗിച്ചതാണ്!");
    } else {
        db.prepare("UPDATE gift_codes SET is_used = 1 WHERE code = ?").run(code);
        updateBalance(userId, gift.reward);
        await ctx.reply(`🎉 അഭിനന്ദനങ്ങൾ! ₹${gift.reward} വാലറ്റിൽ ആഡ് ചെയ്തു.`);
    }
});

// Withdraw Command: /withdraw AMOUNT
bot.command("withdraw", async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const amount = parseFloat(ctx.match);

    if (!user.upi_id) {
        return ctx.reply("❌ ദയവായി ആദ്യം നിങ്ങളുടെ UPI / Mobile Number ലിങ്ക് ചെയ്യുക!");
    }

    if (isNaN(amount) || amount <= 0 || amount > user.balance) {
        return ctx.reply("❌ സാധുവായ തുക നൽകുക അല്ലെങ്കിൽ നിങ്ങളുടെ വാലറ്റിൽ ആവശ്യത്തിന് ബാലൻസ് ഇല്ല!");
    }

    updateBalance(userId, -amount);
    await ctx.reply("✅ വിത്ത്‌ഡ്രോവൽ റിക്വസ്റ്റ് സമർപ്പിച്ചു. അഡ്മിൻ ഉടൻ പ്രോസസ്സ് ചെയ്യും.");

    // Notify Admin
    await ctx.api.sendMessage(
        ADMIN_ID,
        `🔔 **പുതിയ Withdrawal Request!**\n\n👤 User ID: \`${userId}\`\n💳 UPI/Number: \`${user.upi_id}\`\n💰 Amount: ₹${amount}`,
        { parse_mode: "Markdown" }
    );
});

// Admin Add Task: /addtask Title | Reward | Link
bot.command("addtask", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const parts = ctx.match.split("|");

    if (parts.length < 3) {
        return ctx.reply("ഫോർമാറ്റ്: `/addtask Title | Reward | Link`", { parse_mode: "Markdown" });
    }

    const title = parts[0].trim();
    const reward = parseFloat(parts[1].trim());
    const link = parts[2].trim();

    db.prepare("INSERT INTO tasks (title, reward, link) VALUES (?, ?, ?)").run(title, reward, link);
    await ctx.reply(`✅ പുതിയ ടാസ്ക് ചേർത്തു: *${title}*`, { parse_mode: "Markdown" });
});

// Admin Add Gift Code: /addcode CODE AMOUNT
bot.command("addcode", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.match.split(" ");
    const code = args[0]?.toUpperCase().trim();
    const reward = parseFloat(args[1]);

    if (!code || isNaN(reward)) {
        return ctx.reply("ഫോർമാറ്റ്: `/addcode CODE AMOUNT`", { parse_mode: "Markdown" });
    }

    db.prepare("INSERT INTO gift_codes (code, reward) VALUES (?, ?)").run(code, reward);
    await ctx.reply(`✅ പുതിയ ഗിഫ്റ്റ് കോഡ് ഉണ്ടാക്കി: \`${code}\` (₹${reward})`, { parse_mode: "Markdown" });
});

// KEYBOARD BUTTON TEXT HANDLERS
bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (text === "💳 Wallet / Balance") {
        const upi = user.upi_id ? user.upi_id : "ലിങ്ക് ചെയ്തിട്ടില്ല ❌";
        await ctx.reply(
            `💰 **വാലറ്റ് വിവരങ്ങൾ:**\n\n💵 ബാലൻസ്: ₹${user.balance.toFixed(2)}\n🔗 UPI/Number: \`${upi}\``,
            { parse_mode: "Markdown" }
        );
    } else if (text === "📋 Tasks") {
        const tasks = db.prepare("SELECT * FROM tasks").all();

        if (tasks.length === 0) {
            return ctx.reply("തൽക്കാലം പുതിയ ടാസ്കുകൾ ഒന്നുമില്ല.");
        }

        let msg = "🎯 **ലഭ്യമായ ടാസ്കുകൾ:**\n\n";
        for (const t of tasks) {
            msg += `🔹 *${t.title}*\n💰 പ്രതിഫലം: ₹${t.reward}\n🔗 [ടാസ്ക് തുറക്കുക](${t.link})\n\n`;
        }
        await ctx.reply(msg, { parse_mode: "Markdown" });
    } else if (text === "⚙️ Link Payment Method") {
        await ctx.reply(
            "നിങ്ങളുടെ UPI ID അല്ലെങ്കിൽ Mobile Number ലിങ്ക് ചെയ്യാൻ കമാൻഡ് അയക്കുക:\n\n`/linkupi YOUR_UPI_OR_NUMBER`",
            { parse_mode: "Markdown" }
        );
    } else if (text === "💸 P2P Transfer") {
        await ctx.reply("മറ്റൊരു യൂസർക്ക് പണം അയക്കാൻ:\n\n`/p2p USER_ID AMOUNT`", { parse_mode: "Markdown" });
    } else if (text === "🎁 Redeem Gift Code") {
        await ctx.reply("ഗിഫ്റ്റ് കോഡ് റെഡീം ചെയ്യാൻ:\n\n`/redeem CODE`", { parse_mode: "Markdown" });
    } else if (text === "🏧 Withdraw") {
        if (!user.upi_id) {
            return ctx.reply("❌ ദയവായി ആദ്യം '⚙️ Link Payment Method' ഉപയോഗിച്ച് UPI/Number ലിങ്ക് ചെയ്യുക.");
        }
        await ctx.reply(`💳 ബാലൻസ്: ₹${user.balance.toFixed(2)}\n\nപിൻവലിക്കാൻ:\n\n\`/withdraw AMOUNT\``, { parse_mode: "Markdown" });
    } else if (text === "⚙️ Admin Settings" && userId === ADMIN_ID) {
        const bonusStatus = getSetting("welcome_bonus_enabled");
        const bonusAmt = getSetting("welcome_bonus_amount");
        await ctx.reply(
            `⚙️ **അഡ്മിൻ കൺട്രോൾസ്:**\n\n• Welcome Bonus: *${bonusStatus}*\n• Bonus Amount: *₹${bonusAmt}*\n\n മാറ്റി ക്രമീകരിക്കാൻ:\n\`/setbonus ON\` / \`/setbonus OFF\`\n\`/setbonusamt 20\``,
            { parse_mode: "Markdown" }
        );
    } else if (text === "➕ Add Task" && userId === ADMIN_ID) {
        await ctx.reply("ടാസ്ക് ചേർക്കാൻ:\n\`/addtask Title | Reward | Link\`", { parse_mode: "Markdown" });
    } else if (text === "🔑 Create Gift Code" && userId === ADMIN_ID) {
        await ctx.reply("ഗിഫ്റ്റ് കോഡ് ഉണ്ടാക്കാൻ:\n\`/addcode CODE AMOUNT\`", { parse_mode: "Markdown" });
    }
});

// START BOT
bot.start();
console.log("Grammy.js Task Bot is online!");
