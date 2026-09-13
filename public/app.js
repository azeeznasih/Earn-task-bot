// ============================================================
// 🎯 Mini App Logic
// ============================================================
const tg = window.Telegram?.WebApp;
let currentUser = null;
let currentUserId = null;

// ----- Get User ID -----
function getUserId() {
  if (tg && tg.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }
  // Fallback for testing in browser
  let testId = localStorage.getItem('miniapp_test_id');
  if (!testId) {
    testId = prompt("Enter Test User ID (browser testing):", "8061612320") || "8061612320";
    localStorage.setItem('miniapp_test_id', testId);
  }
  return testId;
}

// ----- Init -----
async function initMiniApp() {
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#0a0f0a");
    tg.setBackgroundColor("#0a0f0a");
  }
  currentUserId = getUserId();
  await loadUser();
}

// ----- Load User -----
async function loadUser() {
  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();
    if (!data.success) {
      document.body.innerHTML = `<div class="loading">❌ User not found. Please start the bot first.</div>`;
      return;
    }
    currentUser = data.user;

    // Update Home page
    const usernameEl = document.getElementById('username');
    const userIdEl = document.getElementById('userid');
    const balanceEl = document.getElementById('balance');
    const linkedEl = document.getElementById('linkedStatus');

    if (usernameEl) usernameEl.textContent = data.user.firstName || "User";
    if (userIdEl) userIdEl.textContent = 'ID: ' + data.user.userId;
    if (balanceEl) balanceEl.textContent = '₹' + (data.user.balance || 0).toFixed(2);
    if (linkedEl) linkedEl.textContent = data.user.linkedInfo || "Not Linked";

    // Load payment methods
    await loadPaymentMethods();
  } catch (e) {
    console.error("loadUser:", e);
  }
}

// ----- Load Payment Methods -----
async function loadPaymentMethods() {
  try {
    const res = await fetch(`/miniapp/api/payment-methods/${currentUserId}`);
    const data = await res.json();
    const list = document.getElementById('paymentList');
    if (!list || !data.success) return;

    list.innerHTML = data.methods.map(m => `
      <div class="payment-item">
        <span>${m.icon} ${m.name}</span>
        <span>${m.value || "Not Set"}</span>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// ----- Withdraw Modal -----
function openWithdraw() {
  const modal = document.getElementById('withdrawModal');
  const methods = document.getElementById('withdrawMethods');
  if (!modal) return;

  const balance = currentUser?.balance || 0;
  methods.innerHTML = `<p style="margin-bottom:12px;color:#7a9a7a;font-size:13px;">Balance: ₹${balance.toFixed(2)}</p>`;

  const options = [
    { key: "Wallet", icon: "👛", label: "Wallet" },
    { key: "UPI", icon: "⚡", label: "UPI" },
    { key: "Bank", icon: "🏦", label: "Bank" }
  ];

  options.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'withdraw-method-btn';
    btn.innerHTML = `<span class="icon">${o.icon}</span> ${o.label}`;
    btn.onclick = () => requestWithdraw(o.key);
    methods.appendChild(btn);
  });

  modal.classList.add('active');
}

function closeWithdraw() {
  document.getElementById('withdrawModal')?.classList.remove('active');
}

async function requestWithdraw(method) {
  const amountStr = prompt(`Enter amount to withdraw via ${method}:`);
  if (!amountStr) return;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return alert("Invalid amount!");

  try {
    const res = await fetch('/miniapp/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, amount, method })
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Withdrawal of ₹${amount} submitted!\nRequest ID: #${data.withdrawalId}`);
      closeWithdraw();
      await loadUser();
    } else {
      alert("❌ " + data.error);
    }
  } catch (e) { alert("❌ Error: " + e.message); }
}

// ----- Payment Methods Modal -----
function openPaymentMethods() {
  const modal = document.getElementById('paymentModal');
  const list = document.getElementById('paymentUpdateList');
  if (!modal) return;

  const fields = [
    { key: "walletAccount", label: "👛 Wallet ID" },
    { key: "upiId", label: "⚡ UPI ID" },
    { key: "bankAccNo", label: "🏦 Bank Account No" },
    { key: "bankIfsc", label: "🔢 IFSC Code" },
    { key: "amazonEmail", label: "📧 Amazon Email" },
    { key: "redeemCodeAddr", label: "🎁 Redeem Code" }
  ];

  list.innerHTML = "";
  fields.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'withdraw-method-btn';
    btn.innerHTML = `<span class="icon">${f.label.split(' ')[0]}</span> ${f.label.slice(2)}`;
    btn.onclick = () => updateField(f.key, f.label);
    list.appendChild(btn);
  });

  modal.classList.add('active');
}

function closePaymentModal() {
  document.getElementById('paymentModal')?.classList.remove('active');
}

async function updateField(field, label) {
  const value = prompt(`Enter new value for ${label}:`);
  if (!value) return;
  try {
    const res = await fetch('/miniapp/api/update-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, field, value })
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ Updated!");
      await loadUser();
      closePaymentModal();
    } else {
      alert("❌ " + data.error);
    }
  } catch (e) { alert("❌ " + e.message); }
}

// ============================================================
// 📋 TASKS PAGE
// ============================================================
async function loadTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;

  try {
    const res = await fetch('/miniapp/api/tasks');
    const data = await res.json();
    if (!data.success || data.tasks.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📭</div>No tasks available right now</div>`;
      return;
    }

    list.innerHTML = "";
    data.tasks.forEach(t => {
      // ⚠️ Only Title + Reward (No emoji, no description)
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-info">
          <div class="task-title">${t.title}</div>
          <div class="task-reward">₹${t.reward}</div>
        </div>
        <button class="task-btn">GO</button>
      `;
      card.onclick = () => openTaskDetail(t);
      list.appendChild(card);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading">Error loading tasks</div>`;
  }
}

function openTaskDetail(task) {
  const modal = document.getElementById('taskModal');
  const detail = document.getElementById('taskDetail');
  if (!modal) return;

  const miniAppUrl = window.location.origin + "/miniapp/task";
  const botUsername = "YourBotUsername"; // optional
  const telegramLink = `https://t.me/YourBotUsername`;

  detail.innerHTML = `
    <h3>📋 ${task.title}</h3>
    <p style="color:#00ff88; font-weight:700; font-size:18px; margin:12px 0;">💰 ₹${task.reward}</p>
    <p style="color:#7a9a7a; font-size:13px; margin-bottom:16px;">
      🔗 <a href="${task.link}" target="_blank" style="color:#00ff88;">Open Task Link</a>
    </p>
    <div style="background:#0a0f0a; border-radius:10px; padding:14px; font-size:13px; line-height:1.7; color:#ccc;">
      <b style="color:#fff;">📸 How to complete:</b><br>
      1️⃣ Click the task link above<br>
      2️⃣ Take a screenshot as proof<br>
      3️⃣ Go back to the bot and send the screenshot<br><br>
      <b style="color:#00ff88;">⏳ Admin will verify and credit ₹${task.reward}</b>
    </div>
    <button onclick="goToBotForScreenshot()" style="width:100%; background:#00ff88; color:#000; border:none; padding:14px; border-radius:10px; font-weight:800; font-size:14px; margin-top:16px; cursor:pointer;">
      📤 Send Screenshot in Bot
    </button>
  `;
  modal.classList.add('active');
}

function goToBotForScreenshot() {
  // Close the Mini App and go back to Telegram bot chat
  if (tg) {
    tg.close();
  } else {
    alert("Please go back to the Telegram bot and send your screenshot.");
  }
}

function closeTaskModal() {
  document.getElementById('taskModal')?.classList.remove('active');
}

// ============================================================
// 🎁 GIFT PAGE
// ============================================================
async function claimGift() {
  const input = document.getElementById('giftCode');
  const msg = document.getElementById('giftMsg');
  if (!input || !msg) return;

  const code = input.value.trim();
  if (!code) {
    msg.textContent = "Please enter a code";
    msg.className = 'gift-msg error';
    return;
  }

  try {
    const res = await fetch('/miniapp/api/claim-gift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, code })
    });
    const data = await res.json();
    if (data.success) {
      msg.textContent = `✅ ₹${data.amount} added! New balance: ₹${data.newBalance.toFixed(2)}`;
      msg.className = 'gift-msg success';
      input.value = '';
    } else {
      msg.textContent = "❌ " + data.error;
      msg.className = 'gift-msg error';
    }
  } catch (e) {
    msg.textContent = "❌ Error: " + e.message;
    msg.className = 'gift-msg error';
  }
}

// ============================================================
// 👤 PROFILE PAGE
// ============================================================
async function loadProfile() {
  // Load total balance
  try {
    const tb = await fetch('/miniapp/api/total-balance');
    const tbData = await tb.json();
    if (tbData.success) {
      const totalEl = document.getElementById('totalBalance');
      const usersEl = document.getElementById('totalUsers');
      if (totalEl) totalEl.textContent = '₹' + tbData.totalBalance.toFixed(2);
      if (usersEl) usersEl.textContent = 'Users: ' + tbData.totalUsers;
    }
  } catch (e) { console.error(e); }

  // Load user profile
  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();
    if (!data.success) return;

    const u = data.user;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('profileName', u.firstName || "User");
    set('profileId', 'ID: ' + u.userId);
    set('pBalance', '₹' + (u.balance || 0).toFixed(2));
    set('pWithdrawn', '₹' + (u.withdrawnTotal || 0).toFixed(2));
    set('pBlocked', u.blockedRefs || 0);
    set('pLinked', u.linkedInfo || "Not Linked");
    set('pReferred', u.referredBy || "Auto Started");

    if (u.joined) {
      const d = new Date(u.joined);
      set('pJoined', d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
    }
  } catch (e) { console.error(e); }
}

// ============================================================
// 🚀 INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await initMiniApp();

  // Route-specific loaders
  if (document.getElementById('taskList')) await loadTasks();
  if (document.getElementById('totalBalance')) await loadProfile();
});
