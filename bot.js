// ============================================================
// 🚀 /ADMIN COMMAND & PANEL
// ============================================================
bot.command("admin", async (ctx) => {
  let userId = ctx.from.id;
  if (!(await isAdmin(userId))) return ctx.reply("❌ Not an admin!");
  await sendAdminPanel(ctx, false);
});

async function sendAdminPanel(ctx, edit = true) {
  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");
  let userCount = await User.countDocuments({});
  let admins = await getConfig("admins", []);
  let adminCount = admins.length + 1;
  let activeGateway = await Gateway.findOne({ isActive: true });
  let verifyEnabled = await getConfig("verification_enabled", false);
  let autoUPIEnabled = await getConfig("auto_upi_enabled", true);

  let panelText =
    `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 *Status:* ${botActive ? "✅ Active" : "❌ Off"}\n` +
    `💸 *Min:* ₹${minW} | 💰 *Max:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n` +
    `💬 *Support:* \`${supportId}\`\n` +
    `🌐 *Gateway:* ${activeGateway ? "`" + activeGateway.name + "`" : "❌ None"}\n` +
    `✅ *Verify:* ${verifyEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `💠 *Auto UPI:* ${autoUPIEnabled ? "🟢 ON" : "🔴 OFF"}\n` +
    `👥 *Users:* ${userCount} | 👑 *Admins:* ${adminCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let rawButtons = [
    [
      { text: "💰 Balance", callback_data: "adm_balance_menu" },
      { text: "👥 Users", callback_data: "adm_users_menu" }
    ],
    [
      { text: "📋 Tasks", callback_data: "adm_tasks_manager" },
      { text: "🎁 Gifts", callback_data: "adm_create_gift" }
    ],
    [
      { text: "📧 Amazon", callback_data: "adm_amazon" },
      { text: "🎁 Redeem", callback_data: "adm_redeem" }
    ],
    [
      { text: "💠 Auto UPI", callback_data: "adm_auto_upi" },
      { text: "🌐 Gateway", callback_data: "adm_gateway_menu" }
    ],
    [
      { text: "📢 Broadcast", callback_data: "adm_broadcast" },
      { text: "💬 User Message", callback_data: "adm_user_message" }
    ],
    [
      { text: "👑 Admins", callback_data: "adm_admins" },
      { text: "✅ Verification", callback_data: "adm_verification" }
    ],
    [
      { text: "🎨 Theme", callback_data: "adm_customize_theme" },
      { text: "🖌️ Inline Styles", callback_data: "adm_edit_styles" }
    ],
    [
      { text: "💸 Withdraw Toggle", callback_data: "adm_withdraw_toggle" },
      { text: "📊 Add Fund", callback_data: "adm_addfund_menu" }
    ],
    [
      { text: "🔄 Reset Balance", callback_data: "adm_reset_all_bal" },
      { text: "⚙️ Settings", callback_data: "adm_settings" }
    ],
    [{ text: "🔄 Refresh Panel", callback_data: "admin" }]
  ];

  let styledKb = await buildStyledKb(rawButtons);

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(panelText, { reply_markup: styledKb, parse_mode: "Markdown" }).catch(() => {});
  } else {
    await ctx.reply(panelText, { reply_markup: styledKb, parse_mode: "Markdown" });
  }
}

bot.callbackQuery("admin", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await sendAdminPanel(ctx, true);
});

bot.callbackQuery("noop", async (ctx) => ctx.answerCallbackQuery());

// ============================================================
// 💰 BALANCE MENU
// ============================================================
bot.callbackQuery("adm_balance_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let kb = await buildStyledKb([
    [
      { text: "➕ Add Balance", callback_data: "adm_add_bal" },
      { text: "➖ Remove Balance", callback_data: "adm_rem_bal" }
    ],
    [{ text: "🔄 Reset User Balance", callback_data: "adm_reset_bal" }],
    [{ text: "📊 All User Balances", callback_data: "adm_all_balances" }],
    [{ text: "🔙 Back", callback_data: "admin" }]
  ]);
  await ctx.editMessageText(`💰 *Balance Management*\n\n━━━━━━━━━━━━━━━━━━━━`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_users_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let totalUsers = await User.countDocuments({});
  let banned = await User.countDocuments({ isBanned: true });
  let active = totalUsers - banned;
  let kb = await buildStyledKb([
    [{ text: "🔍 User Tracker", callback_data: "adm_user_tracker" }],
    [{ text: "📊 All Balances", callback_data: "adm_all_balances" }],
    [{ text: "📢 Broadcast", callback_data: "adm_broadcast" }],
    [{ text: "🔙 Back", callback_data: "admin" }]
  ]);
  await ctx.editMessageText(
    `👥 *User Management*\n\n👥 Total: ${totalUsers}\n✅ Active: ${active}\n🚫 Banned: ${banned}`,
    { reply_markup: kb, parse_mode: "Markdown" }
  ).catch(() => {});
});

// ============================================================
// ⚙️ ADMIN SETTINGS
// ============================================================
bot.callbackQuery("adm_settings", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let botActive = await getConfig("bot_active", true);
  let minW = await getConfig("min_withdraw", 1);
  let maxW = await getConfig("max_withdraw", 100);
  let pChannel = await getConfig("payout_channel", "Not Set");
  let supportId = await getConfig("support_username", "Not Set");

  let text =
    `⚙️ *Admin Settings*\n\n🤖 *Bot:* ${botActive ? "✅" : "❌"}\n` +
    `💸 *Min WD:* ₹${minW}\n💰 *Max WD:* ₹${maxW}\n` +
    `📢 *Payout:* \`${pChannel}\`\n💬 *Support:* \`${supportId}\``;

  let kb = new InlineKeyboard()
    .text(botActive ? "🔴 Turn OFF" : "🟢 Turn ON", "adm_toggle_bot").row()
    .text("📉 Min Withdraw", "adm_set_min_w")
    .text("📈 Max Withdraw", "adm_set_max_w").row()
    .text("📢 Payout Channel", "adm_set_p_chan")
    .text("📢 Force Join", "adm_channels").row()
    .text("💬 Support ID", "adm_set_support").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("adm_toggle_bot", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("bot_active", true);
  await setConfig("bot_active", !current);
  await ctx.answerCallbackQuery({ text: !current ? "✅ Bot ON" : "❌ Bot OFF" });
  await bot.callbackQuery("adm_settings", ctx);
});

bot.callbackQuery("adm_set_support", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_SUPPORT_ID";
  await ctx.editMessageText("💬 Send Support ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") }).catch(() => {});
});

bot.callbackQuery("adm_add_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_ADD_BAL";
  await ctx.editMessageText("➕ Add Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

bot.callbackQuery("adm_rem_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_REM_BAL";
  await ctx.editMessageText("➖ Remove Balance:\n\nSend: UserID Amount", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

bot.callbackQuery("adm_user_tracker", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TRACKER_ID";
  await ctx.editMessageText("🔍 Send User ID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_users_menu") });
});

bot.callbackQuery("adm_set_min_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MIN_W";
  await ctx.editMessageText("📉 Min Withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_max_w", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_MAX_W";
  await ctx.editMessageText("📈 Max Withdraw:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_set_p_chan", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_P_CHAN";
  await ctx.editMessageText("📢 Payout Channel:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_settings") });
});

bot.callbackQuery("adm_reset_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_RESET_BAL";
  await ctx.editMessageText("🔄 Send UserID:", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_balance_menu") });
});

bot.callbackQuery("adm_broadcast", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_BROADCAST";
  await ctx.editMessageText(`📢 *Broadcast Message*\n\nSend the message:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") });
});

bot.callbackQuery("adm_user_message", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_USER_MESSAGE";
  await ctx.editMessageText(`💬 *Send Message to User*\n\n📝 Format:\n\`UserID | Message\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "admin") }).catch(() => {});
});

// ============================================================
// 💸 WITHDRAW TOGGLE
// ============================================================
async function isWithdrawEnabled(method) {
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  return toggles[method.toLowerCase()] !== false;
}

async function toggleWithdraw(method) {
  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  toggles[method.toLowerCase()] = !toggles[method.toLowerCase()];
  await setConfig("withdraw_toggles", toggles);
  return toggles[method.toLowerCase()];
}

bot.callbackQuery("adm_withdraw_toggle", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let toggles = await getConfig("withdraw_toggles", {
    wallet: true, upi: true, bank: true, amazon: true, redeem: true
  });
  let onCount = Object.values(toggles).filter(v => v === true).length;

  let text = `💸 *Withdraw Toggle*\n\n✅ ON: ${onCount}\n🔴 OFF: ${5 - onCount}`;

  let kb = new InlineKeyboard()
    .text(`${toggles.wallet ? "✅" : "🔴"} Wallet`, "wt_toggle_wallet").row()
    .text(`${toggles.upi ? "✅" : "🔴"} UPI`, "wt_toggle_upi").row()
    .text(`${toggles.bank ? "✅" : "🔴"} Bank`, "wt_toggle_bank").row()
    .text(`${toggles.amazon ? "✅" : "🔴"} Amazon`, "wt_toggle_amazon").row()
    .text(`${toggles.redeem ? "✅" : "🔴"} Redeem`, "wt_toggle_redeem").row()
    .text("🔄 Refresh", "adm_withdraw_toggle").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^wt_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let method = ctx.callbackQuery.data.replace("wt_toggle_", "");
  let newState = await toggleWithdraw(method);
  await ctx.answerCallbackQuery({ text: newState ? `✅ ${method} ON` : `🔴 ${method} OFF` });
  await bot.callbackQuery("adm_withdraw_toggle", ctx);
});

// ============================================================
// 👑 ADMINS
// ============================================================
bot.callbackQuery("adm_admins", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  await renderAdminsPanel(ctx);
});

async function renderAdminsPanel(ctx) {
  let ownerId = await getConfig("owner_id", MAIN_OWNER_ID);
  let admins = await getConfig("admins", []);
  let ownerUser = await User.findOne({ userId: ownerId });
  let ownerName = ownerUser ? (ownerUser.firstName || "Owner") : "Owner";

  let text = `👑 *Admin Management*\n\n👑 *Owner:* \`${ownerId}\`\n📛 ${ownerName}\n\n📊 *Total Admins:* ${admins.length}`;

  let kb = new InlineKeyboard();
  if (admins.length === 0) {
    kb = kb.text("📂 No Admins Yet", "noop").row();
  } else {
    for (let adminId of admins) {
      let adminUser = await User.findOne({ userId: adminId });
      let displayName = adminUser ? (adminUser.firstName || "User") : "Unknown";
      kb = kb.text(`👤 ${displayName} — ${adminId}`, `admin_view_${adminId}`).row();
    }
  }
  kb = kb.text("➕ Add New Admin", "admin_add").row();
  kb = kb.text("👑 Transfer Ownership", "admin_transfer").row();
  kb = kb.text("🔙 Back to Admin", "admin");

  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
  }
}

bot.callbackQuery(/^admin_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_view_", ""), 10);
  let adminUser = await User.findOne({ userId: adminId });
  if (!adminUser) return;

  let text = `👤 *Admin Details*\n\n📛 *Name:* ${adminUser.firstName || "Unknown"}\n🆔 \`${adminId}\`\n💰 ₹${adminUser.balance.toFixed(2)}`;

  let kb = new InlineKeyboard()
    .url("👤 Open Profile", `tg://user?id=${adminId}`).row()
    .text("💬 Send Message", `admin_msg_${adminId}`).row()
    .text("🔍 View Tracker", `track_ref_${adminId}`).row()
    .text("🗑️ Remove Admin", `admin_remove_${adminId}`).row()
    .text("🔙 Back", "adm_admins");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^admin_remove_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_remove_", ""), 10);
  let admins = await getConfig("admins", []);
  admins = admins.filter(id => Number(id) !== Number(adminId));
  await setConfig("admins", admins);
  cache.admins = admins;
  cache.adminsTime = Date.now();
  await ctx.answerCallbackQuery({ text: "🗑️ Admin removed!" });
  await renderAdminsPanel(ctx);
});

bot.callbackQuery(/^admin_msg_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  let adminId = parseInt(ctx.callbackQuery.data.replace("admin_msg_", ""), 10);
  userState[ctx.from.id] = `WAITING_MSG_ADMIN_${adminId}`;
  await ctx.editMessageText(`💬 *Send Message*\n\nTo: \`${adminId}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `admin_view_${adminId}`) }).catch(() => {});
});

bot.callbackQuery("admin_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_ADMIN_ADD";
  await ctx.editMessageText(`➕ *Add New Admin*\n\n📝 Send User ID:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") }).catch(() => {});
});

bot.callbackQuery("admin_transfer", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isOwner(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_NEW_OWNER";
  await ctx.editMessageText(`👑 *Transfer Ownership*\n\n⚠️ WARNING!\n\n📝 Send new Owner User ID:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_admins") }).catch(() => {});
});

bot.callbackQuery(/^admin_transfer_confirm_/, async (ctx) => {
  if (!(await isOwner(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Owner only!", show_alert: true });
  let newOwnerId = parseInt(ctx.callbackQuery.data.replace("admin_transfer_confirm_", ""), 10);
  let currentOwner = ctx.from.id;
  let admins = await getConfig("admins", []);
  if (!admins.some(id => Number(id) === Number(currentOwner))) admins.push(Number(currentOwner));
  await setConfig("admins", admins);
  await setConfig("owner_id", newOwnerId);
  cache.admins = admins;
  cache.ownerId = newOwnerId;
  cache.adminsTime = Date.now();
  await ctx.answerCallbackQuery({ text: "👑 Transferred!" });
  await ctx.editMessageText(`✅ *Ownership Transferred!*\n\n👑 New Owner: \`${newOwnerId}\``, { parse_mode: "Markdown" }).catch(() => {});
  try {
    await ctx.api.sendMessage(newOwnerId, `👑 *Congratulations!*\n\nYou are now the *Owner*!`, { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🔍 USER TRACKER
// ============================================================
bot.callbackQuery(/^track_bal_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_bal_", ""), 10);
  let history = await BalanceHistory.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `📊 *Balance Record (${targetId})*\n\n`;
  if (history.length === 0) msg += "No records.";
  else history.forEach((h, idx) => {
    let dateStr = new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. *${h.action}*: ₹${h.amount} (${dateStr})\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_wd_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_wd_", ""), 10);
  let withdrawals = await Withdrawal.find({ userId: targetId }).sort({ createdAt: -1 }).limit(15);
  let msg = `🏧 *Withdraw History (${targetId})*\n\n`;
  if (withdrawals.length === 0) msg += "No records.";
  else withdrawals.forEach((w, idx) => {
    let dateStr = new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    msg += `${idx + 1}. ₹${w.amount} | ${w.method}\n   ${w.status} | ${dateStr}\n\n`;
  });
  await ctx.editMessageText(msg, { reply_markup: new InlineKeyboard().text("🔙 Back", `track_ref_${targetId}`), parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^track_ref_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let targetId = parseInt(ctx.callbackQuery.data.replace("track_ref_", ""), 10);
  let targetUser = await User.findOne({ userId: targetId });
  if (!targetUser) return;
  let kb = new InlineKeyboard()
    .text("📜 Balance", `track_bal_${targetId}`).row()
    .text("🏧 Withdraw", `track_wd_${targetId}`).row()
    .text("🔄 Refresh", `track_ref_${targetId}`).row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(generateTrackerText(targetUser), { reply_markup: kb }).catch(() => {});
});

// ============================================================
// 📊 ALL USERS BALANCE
// ============================================================
bot.callbackQuery("adm_all_balances", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let users = await User.find({}).sort({ balance: -1 });
  if (users.length === 0) return ctx.reply("📊 No users.");

  let totalBalance = 0;
  let chunks = [];
  let current = `📊 *All Users Balance List*\n\n`;

  users.forEach((u, idx) => {
    totalBalance += u.balance;
    let line = `\`${idx + 1}.\` 🆔 \`${u.userId}\` 💰 ₹${u.balance.toFixed(2)}\n`;
    if (current.length + line.length > 3500) { chunks.push(current); current = ""; }
    current += line;
  });

  let summary = `\n👥 Total: \`${users.length}\`\n💵 Balance: \`₹${totalBalance.toFixed(2)}\``;
  if (current.length + summary.length > 4000) { chunks.push(current); current = summary; }
  else current += summary;
  chunks.push(current);

  let kb = new InlineKeyboard().text("🔙 Back", "admin");
  for (let i = 0; i < chunks.length; i++) {
    if (i === chunks.length - 1) await ctx.reply(chunks[i], { parse_mode: "Markdown", reply_markup: kb });
    else await ctx.reply(chunks[i], { parse_mode: "Markdown" });
  }
});

// ============================================================
// 🔄 RESET ALL BALANCE
// ============================================================
bot.callbackQuery("adm_reset_all_bal", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userCount = await User.countDocuments({});
  let users = await User.find({});
  let totalBalance = 0;
  users.forEach(u => { totalBalance += u.balance || 0; });
  let text = `⚠️ *RESET ALL BALANCES* ⚠️\n\n👥 Users: \`${userCount}\`\n💰 ₹${totalBalance.toFixed(2)}\n\n👇 Confirm?`;
  let kb = new InlineKeyboard().text("✅ Yes", "adm_reset_all_confirm").row().text("❌ Cancel", "admin");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("adm_reset_all_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Resetting..." });
  let users = await User.find({});
  let totalBalanceBefore = 0;
  users.forEach(u => { totalBalanceBefore += u.balance || 0; });
  await User.updateMany({}, { $set: { balance: 0, withdrawnTotal: 0 } });
  await ctx.editMessageText(
    `✅ *ALL BALANCES RESET!*\n\n👥 ${users.length}\n💰 Before: ₹${totalBalanceBefore.toFixed(2)}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

// ============================================================
// 🎁 GIFT CODE MANAGEMENT
// ============================================================
bot.callbackQuery("adm_create_gift", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGiftCodePanel(ctx);
});

async function renderGiftCodePanel(ctx) {
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(30);
  let totalCodes = await GiftCode.countDocuments({ type: "redeem" });
  let notifEnabled = await getConfig("gift_notification_enabled", true);

  let text = `🎁 *Gift Code Management*\n\n📊 Total: ${totalCodes}\n🔔 Notif: ${notifEnabled ? "✅" : "❌"}`;

  let kb = new InlineKeyboard();
  for (let c of codes) {
    let icon = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    let shortCode = c.code.length > 15 ? c.code.substring(0, 15) + "..." : c.code;
    kb = kb.text(`${icon} ${shortCode} — ₹${c.amount}`, `gc_view_${c.code}`).row();
  }
  kb = kb.text(notifEnabled ? "🔕 OFF" : "🔔 ON", "gc_notif_toggle").row();
  kb = kb.text("➕ Add Code", "adm_redeem_add").row();
  kb = kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery(/^gc_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_view_", "");
  let gc = await GiftCode.findOne({ code, type: "redeem" });
  if (!gc) return;

  let text = `🎁 *Code: \`${gc.code}\`*\n\n💰 ₹${gc.amount}\n👥 Max: ${gc.maxUses}\n✅ Claimed: ${gc.usedUsers.length}`;

  let kb = new InlineKeyboard()
    .text("✏️ Amount", `gc_edit_amt_${gc.code}`)
    .text("👥 Max", `gc_edit_max_${gc.code}`).row()
    .text("🗑️ Delete", `gc_del_${gc.code}`).row()
    .text("🔙 Back", "adm_create_gift");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^gc_edit_amt_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_amt_", "");
  userState[ctx.from.id] = `WAITING_GC_AMT_${code}`;
  await ctx.editMessageText(`✏️ Send new amount:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let code = ctx.callbackQuery.data.replace("gc_edit_max_", "");
  userState[ctx.from.id] = `WAITING_GC_MAX_${code}`;
  await ctx.editMessageText(`✏️ Send new max:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `gc_view_${code}`) });
});

bot.callbackQuery(/^gc_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let code = ctx.callbackQuery.data.replace("gc_del_", "");
  await GiftCode.deleteOne({ code, type: "redeem" });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderGiftCodePanel(ctx);
});

bot.callbackQuery("gc_notif_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("gift_notification_enabled", true);
  await setConfig("gift_notification_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🔔 ON" : "🔕 OFF" });
  await renderGiftCodePanel(ctx);
});

// ============================================================
// 📧 AMAZON PANEL
// ============================================================
bot.callbackQuery("adm_amazon", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAmazonPanel(ctx);
});

async function renderAmazonPanel(ctx) {
  let mode = await getConfig("amazon_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";
  let codeCount = await GiftCode.countDocuments({ type: "amazon" });

  let msg = `📧 *Amazon Gift Code*\n\n📌 Mode: ${toggleLabel}\n📦 Total: ${codeCount}`;

  let kb = new InlineKeyboard()
    .text(toggleLabel === "📝 Manual" ? "⚡ Auto" : "📝 Manual", "toggle_amazon_mode").row()
    .text("➕ Add Code", "adm_amazon_add").row()
    .text("📋 View All", "adm_amazon_list").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("toggle_amazon_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("amazon_mode", "manual");
  let newMode = current === "manual" ? "auto" : "manual";
  await setConfig("amazon_mode", newMode);
  await ctx.answerCallbackQuery({ text: `Switched to ${newMode.toUpperCase()}` });
  await renderAmazonPanel(ctx);
});

bot.callbackQuery("adm_amazon_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_AMAZON_CODES";
  await ctx.editMessageText(`➕ *Add Amazon Code*\n\n📝 Format: \`CODE AMOUNT\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_amazon") }).catch(() => {});
});

bot.callbackQuery("adm_amazon_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let codes = await GiftCode.find({ type: "amazon" }).sort({ createdAt: -1 }).limit(50);
  if (codes.length === 0) return ctx.reply("📦 No Amazon codes yet.");
  let text = `📋 *Amazon Codes (${codes.length})*\n\n`;
  codes.forEach((c, i) => {
    let used = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    text += `${i+1}. ${used} \`${c.code}\` — ₹${c.amount}\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_amazon") });
});

// ============================================================
// 🎁 REDEEM PANEL
// ============================================================
bot.callbackQuery("adm_redeem", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderRedeemPanel(ctx);
});

async function renderRedeemPanel(ctx) {
  let mode = await getConfig("redeem_mode", "manual");
  let toggleLabel = mode === "manual" ? "📝 Manual" : "⚡ Auto";
  let codeCount = await GiftCode.countDocuments({ type: "redeem" });

  let msg = `🎁 *Redeem Code*\n\n📌 Mode: ${toggleLabel}\n📦 Total: ${codeCount}`;

  let kb = new InlineKeyboard()
    .text(toggleLabel === "📝 Manual" ? "⚡ Auto" : "📝 Manual", "toggle_redeem_mode").row()
    .text("➕ Add Code", "adm_redeem_add").row()
    .text("📋 View All", "adm_redeem_list").row()
    .text("🔙 Back", "admin");

  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("toggle_redeem_mode", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("redeem_mode", "manual");
  let newMode = current === "manual" ? "auto" : "manual";
  await setConfig("redeem_mode", newMode);
  await ctx.answerCallbackQuery({ text: `Switched to ${newMode.toUpperCase()}` });
  await renderRedeemPanel(ctx);
});

bot.callbackQuery("adm_redeem_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_REDEEM_CODES";
  await ctx.editMessageText(`➕ *Add Redeem Code*\n\n📝 Format: \`CODE AMOUNT\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_redeem") }).catch(() => {});
});

bot.callbackQuery("adm_redeem_list", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let codes = await GiftCode.find({ type: "redeem" }).sort({ createdAt: -1 }).limit(50);
  if (codes.length === 0) return ctx.reply("📦 No Redeem codes yet.");
  let text = `📋 *Redeem Codes (${codes.length})*\n\n`;
  codes.forEach((c, i) => {
    let used = c.usedUsers.length >= c.maxUses ? "❌" : "✅";
    text += `${i+1}. ${used} \`${c.code}\` — ₹${c.amount}\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_redeem") });
});

// ============================================================
// 💾 SHARED: Save Codes
// ============================================================
async function saveCodes(text, type, ctx) {
  let lines = text.trim().split("\n").filter(l => l.trim() !== "");
  let added = [], failed = [];

  for (let line of lines) {
    let parts = line.trim().split(/\s+/);
    if (parts.length !== 2) { failed.push(`${line} (invalid)`); continue; }
    let code = parts[0].trim();
    let amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) { failed.push(`${line} (invalid)`); continue; }
    let existing = await GiftCode.findOne({ code, type });
    if (existing) { failed.push(`${code} (exists)`); continue; }
    await GiftCode.create({ code, amount, type, maxUses: 1, usedUsers: [] });
    added.push(`✅ \`${code}\` → ₹${amount}`);
  }

  let icon = type === "amazon" ? "📧" : "🎁";
  let title = type === "amazon" ? "Amazon Gift Codes" : "Redeem Codes";
  let summary = `${icon} *${title} Added*\n\n`;
  if (added.length > 0) summary += `✅ Added (${added.length}):\n${added.join("\n")}\n\n`;
  if (failed.length > 0) summary += `❌ Failed (${failed.length}):\n${failed.map(f => `• ${f}`).join("\n")}\n\n`;
  summary += `📊 Added: ${added.length} | ❌ Failed: ${failed.length}`;

  await ctx.reply(summary, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 Back", type === "amazon" ? "adm_amazon" : "adm_redeem")
  });
}

// ============================================================
// 📝 Part 3 (1/2) END
// ============================================================

// ============================================================
// 📋 TASK MANAGER
// ============================================================
bot.callbackQuery("adm_tasks_manager", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderTaskManager(ctx);
});

async function renderTaskManager(ctx) {
  let tasks = await Task.find({});
  let keyboard = new InlineKeyboard();
  if (tasks.length === 0) keyboard.text("📂 No Tasks", "noop").row();
  else tasks.forEach(t => {
    keyboard.text(`📄 ${t.title}`, `view_task_${t.taskId}`)
            .text("✏️", `edit_task_${t.taskId}`)
            .text("🗑️", `del_task_${t.taskId}`).row();
  });
  keyboard.text("➕ Add New Task", "adm_create_task").row();
  keyboard.text("🔙 Back", "admin");
  let taskText = "💡 *Manage Tasks*\n\nSelect a task:";
  if (ctx.callbackQuery) await ctx.editMessageText(taskText, { reply_markup: keyboard, parse_mode: "Markdown" }).catch(() => {});
  else await ctx.reply(taskText, { reply_markup: keyboard, parse_mode: "Markdown" });
}

bot.callbackQuery(/^view_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("view_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let msg = `📋 *Task Details*\n\n🆔 ${task.taskId}\n📌 ${task.title}\n💰 ₹${task.reward}\n🔗 ${task.link}`;
  let kb = new InlineKeyboard()
    .text("✏️ Edit", `edit_task_${task.taskId}`)
    .text("🗑️ Delete", `del_task_${task.taskId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(msg, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^edit_task_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("edit_task_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  let kb = new InlineKeyboard()
    .text("⏱️ Set Time Limit", `set_t_time_${tId}`)
    .text(task.alertEnabled ? "🔔 Alert: ON" : "🔕 Alert: OFF", `toggle_t_alert_${tId}`).row()
    .text("🗑️ Delete Task", `del_task_${tId}`).row()
    .text("🔙 Back", "adm_tasks_manager");
  await ctx.editMessageText(`✏️ *Edit Task: ${task.title}*`, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^toggle_t_alert_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("toggle_t_alert_", "");
  let task = await Task.findOne({ taskId: tId });
  if (!task) return;
  task.alertEnabled = !task.alertEnabled;
  await task.save();
  await ctx.answerCallbackQuery({ text: `Alert ${task.alertEnabled ? 'ON' : 'OFF'}` });
});

bot.callbackQuery(/^set_t_time_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let tId = ctx.callbackQuery.data.replace("set_t_time_", "");
  userState[ctx.from.id] = `WAITING_FOR_TASK_TIME_${tId}`;
  await ctx.editMessageText(`⏱️ Set Time Limit:\n\nSend minutes:`, { reply_markup: new InlineKeyboard().text("🔙 Back", `edit_task_${tId}`) });
});

bot.callbackQuery(/^del_task_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let tId = ctx.callbackQuery.data.replace("del_task_", "");
  await Task.deleteOne({ taskId: tId });
  await ctx.answerCallbackQuery({ text: "Task deleted!" });
  await renderTaskManager(ctx);
});

bot.callbackQuery("adm_create_task", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_FOR_TASK_CREATE";
  await ctx.editMessageText("📋 Format: TaskID | Title | Reward | Link", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_tasks_manager") });
});

// ============================================================
// 🌐 GATEWAY MANAGEMENT
// ============================================================
bot.callbackQuery("adm_gateway_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderGatewayPanel(ctx);
});

async function renderGatewayPanel(ctx) {
  let gateways = await Gateway.find({}).sort({ createdAt: -1 });
  let activeGW = await Gateway.findOne({ isActive: true });

  let text = `🌐 *Gateway Management*\n\n📋 *Active:* ${activeGW ? "`" + activeGW.name + "`" : "❌ None"}\n📊 *Total:* ${gateways.length}`;

  let kb = new InlineKeyboard();
  for (let gw of gateways) {
    let icon = gw.isActive ? "✅" : "⚪";
    kb = kb.text(`${icon} ${gw.name}`, `gw_view_${gw.name}`).row();
  }
  kb = kb.text("➕ Add New Gateway", "gw_add").row();
  kb = kb.text("🔙 Back", "admin");

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery(/^gw_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let gwName = ctx.callbackQuery.data.replace("gw_view_", "");
  let gw = await Gateway.findOne({ name: gwName });
  if (!gw) return;
  let text = `🌐 *Gateway: ${gw.name}*\n\n⚡ ${gw.isActive ? "✅ Active" : "⚪ Inactive"}`;
  let kb = new InlineKeyboard();
  if (gw.isActive) kb = kb.text("🔴 Deactivate", `gw_deactivate_${gw.name}`).row();
  else kb = kb.text("🟢 Activate", `gw_activate_${gw.name}`).row();
  kb = kb.text("🗑️ Delete", `gw_del_${gw.name}`).row();
  kb = kb.text("🔙 Back", "adm_gateway_menu");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery("gw_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_GW_NAME";
  await ctx.editMessageText(`➕ *Add Gateway*\n\n📝 Send Gateway Name:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_gateway_menu") }).catch(() => {});
});

bot.callbackQuery(/^gw_activate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_activate_", "");
  await Gateway.updateMany({}, { isActive: false });
  await Gateway.updateOne({ name: gwName }, { isActive: true });
  await ctx.answerCallbackQuery({ text: `✅ ${gwName} activated!` });
  await renderGatewayPanel(ctx);
});

bot.callbackQuery(/^gw_deactivate_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_deactivate_", "");
  await Gateway.updateOne({ name: gwName }, { isActive: false });
  await ctx.answerCallbackQuery({ text: `🔴 Deactivated!` });
  await renderGatewayPanel(ctx);
});

bot.callbackQuery(/^gw_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let gwName = ctx.callbackQuery.data.replace("gw_del_", "");
  await Gateway.deleteOne({ name: gwName });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderGatewayPanel(ctx);
});

// ============================================================
// 📢 MANAGE CHANNELS
// ============================================================
bot.callbackQuery("adm_channels", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderChannelsPanel(ctx);
});

async function renderChannelsPanel(ctx) {
  let channels = await Channel.find({}).sort({ addedAt: -1 });
  let text = `📢 *Manage Channels*\n\n📊 Total: ${channels.length}`;
  let kb = new InlineKeyboard();
  for (let ch of channels) {
    let status = ch.isActive ? "✅" : "❌";
    let safeId = ch.channelId.replace('@', '').replace(/-/g, '');
    kb = kb.text(`${status} ${ch.channelId}`, `ch_view_${safeId}`).row();
  }
  kb = kb.text("➕ Add Channel", "ch_add").row();
  kb = kb.text("🔙 Back", "admin");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
}

bot.callbackQuery("ch_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_CHANNEL_ADD";
  await ctx.editMessageText(`➕ *Add Channel*\n\n📝 Format: \`ChannelID | InviteLink\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_channels") }).catch(() => {});
});

bot.callbackQuery(/^ch_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_view_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;

  let text = `📢 *${ch.channelId}*\n\n📛 ${ch.displayName}\n🔗 ${ch.inviteLink}\n⚡ ${ch.isActive ? "✅ Active" : "❌ Inactive"}`;
  let kb = new InlineKeyboard()
    .text("✏️ Rename", `ch_rename_${safeId}`).row()
    .text("🔗 Update Link", `ch_link_${safeId}`).row()
    .text(ch.isActive ? "🔴 Deactivate" : "🟢 Activate", `ch_toggle_${safeId}`).row()
    .text("🗑️ Delete", `ch_del_${safeId}`).row()
    .text("🔙 Back", "adm_channels");
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "Markdown" }).catch(() => {});
});

bot.callbackQuery(/^ch_rename_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_rename_", "");
  userState[ctx.from.id] = `WAITING_CH_RENAME_${safeId}`;
  await ctx.editMessageText(`✏️ Send new display name:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `ch_view_${safeId}`) }).catch(() => {});
});

bot.callbackQuery(/^ch_link_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let safeId = ctx.callbackQuery.data.replace("ch_link_", "");
  userState[ctx.from.id] = `WAITING_CH_LINK_${safeId}`;
  await ctx.editMessageText(`🔗 Send new link:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `ch_view_${safeId}`) }).catch(() => {});
});

bot.callbackQuery(/^ch_toggle_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let safeId = ctx.callbackQuery.data.replace("ch_toggle_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;
  ch.isActive = !ch.isActive;
  await ch.save();
  await ctx.answerCallbackQuery({ text: ch.isActive ? "🟢 Activated!" : "🔴 Deactivated!" });
  await renderChannelsPanel(ctx);
});

bot.callbackQuery(/^ch_del_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let safeId = ctx.callbackQuery.data.replace("ch_del_", "");
  let channels = await Channel.find({});
  let ch = channels.find(c => c.channelId.replace('@', '').replace(/-/g, '') === safeId);
  if (!ch) return;
  await Channel.deleteOne({ channelId: ch.channelId });
  await ctx.answerCallbackQuery({ text: "🗑️ Deleted!" });
  await renderChannelsPanel(ctx);
});

// ============================================================
// ✅ VERIFICATION
// ============================================================
bot.callbackQuery("adm_verification", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderVerificationPanel(ctx);
});

async function renderVerificationPanel(ctx) {
  let verifyEnabled = await getConfig("verification_enabled", false);
  let totalUsers = await User.countDocuments({});
  let verifiedUsers = await Verification.countDocuments({ verified: true });

  let text = `✅ *Verification*\n\n🔘 ${verifyEnabled ? "✅ ON" : "❌ OFF"}\n👥 Total: ${totalUsers}\n✅ Verified: ${verifiedUsers}`;
  let kb = new InlineKeyboard()
    .text(verifyEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "verify_toggle").row()
    .text("📛 Set Bot Name", "verify_set_name").row()
    .text("🖼️ Set Bot Photo", "verify_set_photo").row()
    .text("📋 Verified Users", "verify_list_users").row()
    .text("🔙 Back", "admin");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("verify_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let current = await getConfig("verification_enabled", false);
  await setConfig("verification_enabled", !current);
  await ctx.answerCallbackQuery({ text: !current ? "✅ ON" : "❌ OFF" });
  await renderVerificationPanel(ctx);
});

bot.callbackQuery("verify_set_name", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_NAME";
  await ctx.editMessageText(`📛 Send the bot name:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_verification") }).catch(() => {});
});

bot.callbackQuery("verify_set_photo", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "WAITING_VERIFY_BOT_PHOTO";
  await ctx.editMessageText(`🖼️ Send image URL:`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_verification") }).catch(() => {});
});

bot.callbackQuery("verify_list_users", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let verified = await Verification.find({ verified: true }).sort({ verifiedAt: -1 }).limit(50);
  if (verified.length === 0) return ctx.reply("📋 No verified users yet.");
  let text = `📋 *Verified Users (${verified.length})*\n\n`;
  for (let v of verified) {
    let u = await User.findOne({ userId: v.userId });
    let name = u ? (u.firstName || "User") : "Unknown";
    text += `✅ ${name} — \`${v.userId}\`\n`;
  }
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "adm_verification") });
});

// ============================================================
// 💰 ADD FUND ADMIN MENU
// ============================================================
bot.callbackQuery("adm_addfund_menu", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  await renderAddFundPanel(ctx);
});

async function renderAddFundPanel(ctx) {
  let methods = await getAddFundMethods();
  let addFundEnabled = await getConfig("add_fund_enabled", true);
  let pendingCount = await AddFund.countDocuments({ status: "Pending" });

  let text = `💰 *Add Fund Management*\n\n🔘 ${addFundEnabled ? "✅ ON" : "❌ OFF"}\n📊 Methods: ${methods.length}\n⏳ Pending: ${pendingCount}`;
  let kb = new InlineKeyboard();
  for (let m of methods) {
    kb = kb.text(`⚪ ${m.name}`, `afm_view_${m.key}`).row();
  }
  kb = kb.text("➕ Add New Method", "afm_add").row();
  kb = kb.text(addFundEnabled ? "🔴 Turn OFF" : "🟢 Turn ON", "addfund_toggle").row();
  kb = kb.text("📋 Pending Requests", "addfund_pending").row();
  kb = kb.text("🔙 Back", "admin");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
}

bot.callbackQuery("addfund_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("add_fund_enabled", true);
  await setConfig("add_fund_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  await renderAddFundPanel(ctx);
});

bot.callbackQuery("afm_add", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "AFM_WAIT_NAME";
  global.afmTemp = global.afmTemp || {};
  global.afmTemp[ctx.from.id] = {};
  await ctx.editMessageText(`➕ *Add Method*\n\n📝 Step 1/5: Send Name`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", "adm_addfund_menu") }).catch(() => {});
});

bot.callbackQuery(/^afm_view_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_view_", "");
  let m = await getMethodByKey(key);
  if (!m) return;
  let text = `💠 *${m.name}*\n\n💳 \`${m.address || "Not Set"}\`\n📉 ₹${m.min || 1} - 📈 ₹${m.max || 1000}`;
  let kb = new InlineKeyboard()
    .text("✏️ Name", `afm_edit_name_${m.key}`)
    .text("💳 Address", `afm_edit_addr_${m.key}`).row()
    .text("📉 Min", `afm_edit_min_${m.key}`)
    .text("📈 Max", `afm_edit_max_${m.key}`).row()
    .text("🗑️ Delete", `afm_del_${m.key}`).row()
    .text("🔙 Back", "adm_addfund_menu");
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^afm_edit_name_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_name_", "");
  userState[ctx.from.id] = `AFM_EDIT_NAME_${key}`;
  await ctx.editMessageText(`✏️ Send new name:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_addr_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_addr_", "");
  userState[ctx.from.id] = `AFM_EDIT_ADDR_${key}`;
  await ctx.editMessageText(`💳 Send new address:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_min_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_min_", "");
  userState[ctx.from.id] = `AFM_EDIT_MIN_${key}`;
  await ctx.editMessageText(`📉 Send min amount:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_edit_max_/, async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_edit_max_", "");
  userState[ctx.from.id] = `AFM_EDIT_MAX_${key}`;
  await ctx.editMessageText(`📈 Send max amount:`, { reply_markup: new InlineKeyboard().text("🔙 Cancel", `afm_view_${key}`) });
});

bot.callbackQuery(/^afm_del_/, async (ctx) => {
  ctx.answerCallbackQuery({ text: "🗑️ Deleted!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let key = ctx.callbackQuery.data.replace("afm_del_", "");
  await deleteMethod(key);
  await renderAddFundPanel(ctx);
});

bot.callbackQuery("addfund_pending", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let pending = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(20);
  if (pending.length === 0) {
    return ctx.reply("📋 No pending requests.", { reply_markup: new InlineKeyboard().text("🔙 Back", "adm_addfund_menu") });
  }
  for (let req of pending) {
    let kb = new InlineKeyboard()
      .text("✅ Approve", `af_app_${req.requestId}`)
      .text("❌ Reject", `af_rej_${req.requestId}`);
    let caption = `💰 *Add Fund Request*\n\n👤 ${req.userName}\n🆔 \`${req.userId}\`\n💵 ₹${req.amount}\n💳 ${req.method}`;
    if (req.proofFileId && !req.proofFileId.startsWith("REFER:")) {
      try { await ctx.replyWithPhoto(req.proofFileId, { caption, parse_mode: "Markdown", reply_markup: kb }); } catch (e) {
        await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });
      }
    } else {
      await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });
    }
  }
});

// ============================================================
// 💠 AUTO UPI ADMIN PANEL
// ============================================================
bot.callbackQuery("adm_auto_upi", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;

  let upiId = await getConfig("auto_upi_id", "nasih@fam");
  let minAmt = await getConfig("auto_upi_min", 5);
  let maxAmt = await getConfig("auto_upi_max", 200);
  let enabled = await getConfig("auto_upi_enabled", true);
  let autoVerify = await getConfig("auto_upi_verify", true);

  let text =
    `💠 *Auto UPI Settings*\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 UPI ID: \`${upiId}\`\n` +
    `📉 Min Amount: ₹${minAmt}\n` +
    `📈 Max Amount: ₹${maxAmt}\n\n` +
    `⚡ Status: ${enabled ? "✅ ON" : "❌ OFF"}\n` +
    `🤖 Verify: ${autoVerify ? "✅ Auto" : "✋ Manual"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  let kb = new InlineKeyboard()
    .text("📌 Change UPI ID", "upiset_id").row()
    .text("📉 Min Amount", "upiset_min")
    .text("📈 Max Amount", "upiset_max").row()
    .text(autoVerify ? "🤖 Auto: ON" : "✋ Manual: ON", "upiset_toggle_auto").row()
    .text(enabled ? "🔴 Turn OFF" : "🟢 Turn ON", "upiset_toggle").row()
    .text("🔙 Back to Admin", "admin");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("upiset_id", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_ID";
  await ctx.reply("📌 Send new UPI ID (e.g., `nasih@fam`):", { parse_mode: "Markdown" });
});

bot.callbackQuery("upiset_min", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MIN";
  await ctx.reply("📉 Send new minimum amount:");
});

bot.callbackQuery("upiset_max", async (ctx) => {
  ctx.answerCallbackQuery().catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  userState[ctx.from.id] = "UPI_SET_MAX";
  await ctx.reply("📈 Send new maximum amount:");
});

bot.callbackQuery("upiset_toggle", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_upi_enabled", true);
  await setConfig("auto_upi_enabled", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "✅ ON" : "❌ OFF" });
  return bot.callbackQuery("adm_auto_upi", ctx);
});

bot.callbackQuery("upiset_toggle_auto", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let cur = await getConfig("auto_upi_verify", true);
  await setConfig("auto_upi_verify", !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "🤖 Auto ON" : "✋ Manual" });
  return bot.callbackQuery("adm_auto_upi", ctx);
});

// ============================================================
// 💰 WITHDRAWAL APPROVE
// ============================================================
bot.callbackQuery(/^wd_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_app_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "⏳ Processing..." });
  await manualApprove(ctx, wd);
});

bot.callbackQuery(/^wd_manual_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_manual_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });
  await ctx.answerCallbackQuery({ text: "✅ Manual approving..." });
  await manualApprove(ctx, wd);
});

async function manualApprove(ctx, wd) {
  let txnNumber = generateTxnNumber();
  let gateway = await Gateway.findOne({ isActive: true });
  let gatewayName = gateway ? gateway.name : "TASK EARN";

  wd.status = "Approved";
  wd.gateway = gatewayName;
  wd.txnNumber = txnNumber;
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let maskedDetails = maskDetails(wd.method, wd.details);
  let displayCount = wd.userWithdrawalCount || wd.withdrawalId;

  let channelMsg =
    `⚠️ <b>New ${wd.method.toUpperCase()} Payout Request!</b> (#${displayCount})\n\n` +
    `<b>User :</b> <code>${wd.userId}</code>\n` +
    `<b>Amount :</b> ₹${wd.amount}\n` +
    `<b>${wd.method} :</b> <code>${maskedDetails}</code>\n` +
    `<b>Transaction ID :</b> <code>${txnNumber}</code>\n\n` +
    `✅ <b>Approved by ${wd.approvedBy}</b>`;

  await ctx.editMessageText(channelMsg, { parse_mode: "HTML" }).catch(() => {});
  await sendSuccessMessage(ctx, wd, gatewayName, txnNumber);
}

async function sendSuccessMessage(ctx, wd, gatewayName, txnNumber) {
  let amount = wd.amount.toFixed(2);
  let destination = wd.details || wd.userId;
  let dateStr = formatDateTime(wd.approvedAt || new Date());
  let accountType = wd.method === "UPI" ? "UPI" : (wd.method === "Wallet" ? "Wallet" : (wd.method === "Bank" ? "Bank" : (wd.method === "Amazon" ? "Amazon" : "Redeem")));

  let userMsg =
    `🎁Your Withdrawal of Rs.${amount} is Successfully Processed!🔥🔥\n\n` +
    `🏦 Destination ==> ${destination}\n` +
    `🚀Transaction ID ==> ${txnNumber}\n` +
    `🗓 Date ==> ${dateStr}\n\n` +
    `✅Please Check Your ${accountType} Account!`;

  let serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  if (!serverUrl.startsWith("http")) serverUrl = `https://${serverUrl}`;
  let receiptUrl = `${serverUrl}/receipt/${wd.withdrawalId}`;

  let kb = new InlineKeyboard().url("🚀 Check Status", receiptUrl);

  try {
    await ctx.api.sendMessage(wd.userId, userMsg, { reply_markup: kb });
  } catch (e) {}
}

// ============================================================
// ❌ WITHDRAWAL REJECT
// ============================================================
bot.callbackQuery(/^wd_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let wId = ctx.callbackQuery.data.replace("wd_rej_", "");
  let wd = await Withdrawal.findOne({ withdrawalId: wId });
  if (!wd || wd.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  wd.status = "Rejected";
  wd.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  wd.approvedAt = new Date();
  await wd.save();

  let user = await getUser(wd.userId);
  user.balance += wd.amount;
  user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
  await user.save();
  await logBalanceHistory(wd.userId, `Withdrawal Refunded`, wd.amount);

  await ctx.answerCallbackQuery({ text: "Rejected & Refunded!" });

  await ctx.editMessageText(
    `⚠️ <b>Payout Request (#${wId})</b>\n\n<b>User:</b> <code>${wd.userId}</code>\n<b>Amount:</b> ₹${wd.amount}\n\n❌ <b>REJECTED by ${wd.approvedBy}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  try {
    await ctx.api.sendMessage(wd.userId,
      `❌ *Withdrawal Rejected!*\n\n🆔 \`#${wId}\`\n💰 ₹${wd.amount}\n\n💵 Refunded.\n\nNew Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📋 TASK APPROVAL
// ============================================================
bot.callbackQuery(/^task_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_app_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });
  sub.status = "Approved";
  await sub.save();
  let user = await getUser(sub.userId);
  user.balance += sub.reward;
  await user.save();
  await logBalanceHistory(sub.userId, `Task Approved (${sub.taskTitle})`, sub.reward);
  await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });
  await ctx.answerCallbackQuery({ text: "✅ Approved!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ *APPROVED* by ${ctx.from.first_name || "Admin"}`,
    parse_mode: "Markdown"
  }).catch(() => {});
  try {
    await ctx.api.sendMessage(sub.userId,
      `🎉 *Payment Received!*\n\n📌 *${sub.taskTitle}*\n💰 *₹${sub.reward}*\n✅ Approved`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^task_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let subId = ctx.callbackQuery.data.replace("task_rej_", "");
  let sub = await TaskSubmission.findOne({ submissionId: subId });
  if (!sub) return ctx.answerCallbackQuery({ text: "Not found!", show_alert: true });
  if (sub.status !== "Pending") return ctx.answerCallbackQuery({ text: `Already ${sub.status}`, show_alert: true });
  sub.status = "Rejected";
  await sub.save();
  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ *REJECTED*`,
    parse_mode: "Markdown"
  }).catch(() => {});
  try {
    await ctx.api.sendMessage(sub.userId,
      `❌ *Task Rejected!*\n\n📌 *${sub.taskTitle}*\n💰 *₹${sub.reward}*\n\nProof not valid.`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 📢 BROADCAST
// ============================================================
bot.callbackQuery("broadcast_confirm", async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let userId = ctx.from.id;
  let cacheObj = global.broadcastCache?.[userId];
  if (!cacheObj) return ctx.answerCallbackQuery({ text: "❌ Expired!", show_alert: true });

  delete userState[userId];
  delete global.broadcastCache[userId];

  await ctx.answerCallbackQuery({ text: "⏳ Broadcasting..." });

  let allUsers = await User.find({});
  let count = 0, failed = 0;

  for (let u of allUsers) {
    try {
      await ctx.api.sendMessage(u.userId, cacheObj.text);
      count++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { failed++; }
  }

  await ctx.editMessageText(
    `✅ *Broadcast Complete!*\n\n✅ Sent: ${count}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Back", "admin") }
  ).catch(() => {});
});

bot.callbackQuery("broadcast_cancel", async (ctx) => {
  ctx.answerCallbackQuery({ text: "❌ Cancelled!" }).catch(() => {});
  if (!(await isAdmin(ctx.from.id))) return;
  let userId = ctx.from.id;
  delete userState[userId];
  if (global.broadcastCache) delete global.broadcastCache[userId];
  await ctx.editMessageText("❌ *Broadcast cancelled.*", { parse_mode: "Markdown" }).catch(() => {});
});

// ============================================================
// 💰 ADD FUND APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^af_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_app_", "");
  let req = await AddFund.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Approved";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();

  let user = await getUser(req.userId);
  user.balance += req.amount;
  await user.save();
  await logBalanceHistory(req.userId, `Add Fund Approved (#${reqId})`, req.amount);

  await ctx.answerCallbackQuery({ text: "✅ Approved!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${req.userName}\n` +
    `<b>Amount :</b> ₹${req.amount}\n\n` +
    `✅ <b>Approved by ${req.approvedBy}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => {});
  });

  try {
    await ctx.api.sendMessage(req.userId,
      `✅ *Add Fund Approved!*\n\n💰 ₹${req.amount} added\n\n💵 New Balance: ₹${user.balance.toFixed(2)}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

bot.callbackQuery(/^af_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("af_rej_", "");
  let req = await AddFund.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  req.approvedBy = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Admin");
  req.approvedAt = new Date();
  await req.save();

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });

  let caption =
    `💰 <b>Add Fund Request</b> (#${reqId})\n\n` +
    `<b>User :</b> ${req.userName}\n` +
    `<b>Amount :</b> ₹${req.amount}\n\n` +
    `❌ <b>Rejected by ${req.approvedBy}</b>`;

  await ctx.editMessageCaption({ caption, parse_mode: "HTML" }).catch(async () => {
    await ctx.editMessageText(caption, { parse_mode: "HTML" }).catch(() => {});
  });

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Add Fund Rejected*\n\n💰 ₹${req.amount}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🎁 REDEEM APPROVE/REJECT
// ============================================================
bot.callbackQuery(/^rdm_app_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_app_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  userState[ctx.from.id] = `WAITING_RDM_CODE_${reqId}`;
  await ctx.answerCallbackQuery({ text: "Send code" });

  let icon = req.type === "amazon" ? "📧" : "🎁";
  await ctx.reply(
    `📝 *Send code for user:*\n\n🆔 \`${req.userId}\`\n💰 ₹${req.amount}\n${icon} ${req.type}`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 Cancel", `rdm_rej_${reqId}`) }
  );
});

bot.callbackQuery(/^rdm_rej_/, async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
  let reqId = ctx.callbackQuery.data.replace("rdm_rej_", "");
  let req = await RedeemRequest.findOne({ requestId: reqId });
  if (!req || req.status !== "Pending") return ctx.answerCallbackQuery({ text: "Processed!", show_alert: true });

  req.status = "Rejected";
  await req.save();
  delete userState[ctx.from.id];

  await ctx.answerCallbackQuery({ text: "❌ Rejected!" });
  await ctx.editMessageText((ctx.callbackQuery.message.text || "") + `\n\n❌ *REJECTED*`).catch(() => {});

  try {
    await ctx.api.sendMessage(req.userId,
      `❌ *Request Rejected*\n\n🆔 \`${req.requestId}\`\n💰 ₹${req.amount}`,
      { parse_mode: "Markdown" });
  } catch (e) {}
});

// ============================================================
// 🚀 FINAL START — Mongoose + Bot
// ============================================================
bot.catch((err) => console.error("❌ Bot Error:", err));

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🍃 MongoDB Connected!");
    let oldChannels = await getConfig("forced_channels", null);
    if (oldChannels && Array.isArray(oldChannels) && oldChannels.length > 0) {
      await setConfig("forced_channels", []);
      console.log("🧹 Old config cleaned!");
    }
    bot.start({ onStart: (info) => console.log(`🚀 Bot @${info.username} running!`) });
  })
  .catch((err) => console.error("❌ DB Error:", err));

// ============================================================
// 👑 MINI APP — ADMIN APIs
// ============================================================
app.get("/miniapp/api/admin/pending-withdrawals", async (req, res) => {
  try {
    const wds = await Withdrawal.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals: wds });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    let txnNumber = generateTxnNumber();
    let gateway = await Gateway.findOne({ isActive: true });
    let gatewayName = gateway ? gateway.name : "TASK EARN";

    wd.status = "Approved";
    wd.gateway = gatewayName;
    wd.txnNumber = txnNumber;
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    try {
      await bot.api.sendMessage(wd.userId,
        `🎁Your Withdrawal of Rs.${wd.amount.toFixed(2)} is Successfully Processed!🔥🔥\n\n` +
        `🏦 Destination ==> ${wd.details}\n` +
        `🚀Transaction ID ==> ${txnNumber}\n\n` +
        `✅Please Check Your ${gatewayName} Account!`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-wd/:id", async (req, res) => {
  try {
    const wd = await Withdrawal.findOne({ withdrawalId: req.params.id });
    if (!wd || wd.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    wd.status = "Rejected";
    wd.approvedBy = "MiniApp Admin";
    wd.approvedAt = new Date();
    await wd.save();

    let user = await getUser(wd.userId);
    user.balance += wd.amount;
    user.withdrawnTotal = Math.max(0, (user.withdrawnTotal || 0) - wd.amount);
    await user.save();

    try {
      await bot.api.sendMessage(wd.userId, `❌ Withdrawal of ₹${wd.amount} rejected & refunded.`);
    } catch (e) {}

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-addfunds", async (req, res) => {
  try {
    const afs = await AddFund.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, addFunds: afs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    af.status = "Approved";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    let user = await getUser(af.userId);
    user.balance += af.amount;
    await user.save();

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-af/:id", async (req, res) => {
  try {
    const af = await AddFund.findOne({ requestId: req.params.id });
    if (!af || af.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    af.status = "Rejected";
    af.approvedBy = "MiniApp Admin";
    af.approvedAt = new Date();
    await af.save();

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/pending-submissions", async (req, res) => {
  try {
    const subs = await TaskSubmission.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, submissions: subs });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/approve-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    sub.status = "Approved";
    await sub.save();

    let user = await getUser(sub.userId);
    user.balance += sub.reward;
    await user.save();
    await Task.updateOne({ taskId: sub.taskId }, { $addToSet: { completedUsers: sub.userId } });

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post("/miniapp/api/admin/reject-sub/:id", async (req, res) => {
  try {
    const sub = await TaskSubmission.findOne({ submissionId: req.params.id });
    if (!sub || sub.status !== "Pending") return res.json({ success: false, error: "Already processed" });

    sub.status = "Rejected";
    await sub.save();

    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get("/miniapp/api/admin/all-users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ balance: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ============================================================
// 🎉 END OF FILE
// ============================================================
console.log("✅ bot.js loaded — Bot + Server + All APIs");

