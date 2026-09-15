// ============================================================
// TASK EARN BOT — Mini App Logic
// ============================================================
const tg = window.Telegram?.WebApp;
let currentUser = null;
let currentUserId = null;
let receiverUser = null;
let currentTask = null;

// ============================================================
// 🆔 Get User ID
// ============================================================
function getUserId() {
  if (tg && tg.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
  let testId = localStorage.getItem('miniapp_test_id');
  if (!testId) {
    testId = prompt("Enter Test User ID:", "8061612320") || "8061612320";
    localStorage.setItem('miniapp_test_id', testId);
  }
  return testId;
}

// ============================================================
// 🚀 INIT
// ============================================================
async function initMiniApp() {
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0a0f0a");
      tg.setBackgroundColor("#0a0f0a");
    } catch (e) {}
  }
  currentUserId = getUserId();
  await loadUser();
  await loadProfilePhoto();
}

// ============================================================
// 👤 Load User
// ============================================================
async function loadUser() {
  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();
    if (!data.success) {
      document.body.innerHTML = `<div class="loading">❌ User not found. Please start the bot first.</div>`;
      return;
    }
    currentUser = data.user;

    const usernameEl = document.getElementById('username');
    const userIdEl = document.getElementById('userid');
    const balanceEl = document.getElementById('balance');
    const linkedEl = document.getElementById('linkedStatus');
    const payBalanceEl = document.getElementById('payBalance');

    if (usernameEl) usernameEl.textContent = data.user.firstName || "User";
    if (userIdEl) userIdEl.textContent = 'ID: ' + data.user.userId;
    if (balanceEl) balanceEl.textContent = '₹' + (data.user.balance || 0).toFixed(2);
    if (linkedEl) linkedEl.textContent = data.user.linkedInfo || "Not Linked";
    if (payBalanceEl) payBalanceEl.textContent = '₹' + (data.user.balance || 0).toFixed(2);

    await loadPaymentMethods();
  } catch (e) { console.error("loadUser:", e); }
}

// ============================================================
// 📸 Load Profile Photo
// ============================================================
async function loadProfilePhoto() {
  try {
    const res = await fetch(`/miniapp/api/profile-photo/${currentUserId}`);
    const data = await res.json();
    if (data.success && data.photoUrl) {
      const avatarImg = document.getElementById('avatarImg');
      const avatarFallback = document.getElementById('avatarFallback');
      const profileAvatarImg = document.getElementById('profileAvatarImg');
      const profileAvatarFallback = document.getElementById('profileAvatarFallback');

      if (avatarImg) { avatarImg.src = data.photoUrl; avatarImg.style.display = 'block'; }
      if (avatarFallback) avatarFallback.style.display = 'none';
      if (profileAvatarImg) { profileAvatarImg.src = data.photoUrl; profileAvatarImg.style.display = 'block'; }
      if (profileAvatarFallback) profileAvatarFallback.style.display = 'none';
    }
  } catch (e) { console.error("photo:", e); }
}

// ============================================================
// 💳 Load Payment Methods
// ============================================================
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

// ============================================================
// 💸 Withdraw Modal
// ============================================================
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
  const modal = document.getElementById('withdrawModal');
  if (modal) modal.classList.remove('active');
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

// ============================================================
// 💳 Payment Methods Modal
// ============================================================
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
  const modal = document.getElementById('paymentModal');
  if (modal) modal.classList.remove('active');
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
  currentTask = task;
  const modal = document.getElementById('taskModal');
  const detail = document.getElementById('taskDetail');
  if (!modal) return;

  detail.innerHTML = `
    <h3>📋 ${task.title}</h3>
    <p style="color:#00ff88; font-weight:700; font-size:18px; margin:12px 0;">💰 ₹${task.reward}</p>
    <p style="color:#7a9a7a; font-size:13px; margin-bottom:16px;">
      🔗 <a href="${task.link}" target="_blank" style="color:#00ff88;">Open Task Link</a>
    </p>
    <div style="background:#0a0f0a; border-radius:10px; padding:14px; font-size:13px; line-height:1.7; color:#ccc; margin-bottom:16px;">
      <b style="color:#fff;">📸 How to complete:</b><br>
      1️⃣ Click the task link above<br>
      2️⃣ Take a screenshot OR copy refer ID<br>
      3️⃣ Upload screenshot OR paste refer ID below<br><br>
      <b style="color:#00ff88;">⏳ Admin will verify and credit ₹${task.reward}</b>
    </div>

    <button onclick="openUploadModal()" style="width:100%; background:#00ff88; color:#000; border:none; padding:14px; border-radius:10px; font-weight:800; font-size:14px; margin-bottom:8px; cursor:pointer;">
      📸 Upload Screenshot
    </button>

    <button onclick="openReferModal()" style="width:100%; background:#2b7fff; color:#fff; border:none; padding:14px; border-radius:10px; font-weight:800; font-size:14px; cursor:pointer;">
      🔗 Send Refer ID / Link
    </button>
  `;
  modal.classList.add('active');
}

function closeTaskModal() {
  const modal = document.getElementById('taskModal');
  if (modal) modal.classList.remove('active');
}

function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('active');
}

function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.remove('active');
}

function openReferModal() {
  const modal = document.getElementById('referModal');
  if (modal) modal.classList.add('active');
}

function closeReferModal() {
  const modal = document.getElementById('referModal');
  if (modal) modal.classList.remove('active');
}

async function handleScreenshot(event) {
  const file = event.target.files[0];
  if (!file || !currentTask) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("❌ File too large! Max 5MB");
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;

    closeUploadModal();
    closeTaskModal();

    alert("⏳ Uploading screenshot...");

    try {
      const res = await fetch('/miniapp/api/submit-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          taskId: currentTask.taskId,
          photoBase64: base64
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Screenshot submitted! Wait for admin approval.");
      } else {
        alert("❌ " + data.error);
      }
    } catch (e) {
      alert("❌ Error: " + e.message);
    }
  };
  reader.readAsDataURL(file);
}

async function submitRefer() {
  const referValue = document.getElementById('referInput')?.value.trim();
  if (!referValue) return alert("❌ Enter refer ID or link");
  if (!currentTask) return alert("❌ No task selected");

  closeReferModal();
  closeTaskModal();

  alert("⏳ Submitting...");

  try {
    const res = await fetch('/miniapp/api/submit-refer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        taskId: currentTask.taskId,
        referValue: referValue
      })
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ Refer ID submitted! Wait for admin approval.");
    } else {
      alert("❌ " + data.error);
    }
  } catch (e) {
    alert("❌ Error: " + e.message);
  }
}

// ============================================================
// 💸 QUICK PAY PAGE
// ============================================================
async function checkUser() {
  const input = document.getElementById('payUserId');
  const msg = document.getElementById('userCheckMsg');
  const box = document.getElementById('userInfoBox');
  const amountCard = document.getElementById('amountCard');
  const balanceInfo = document.getElementById('payBalanceInfo');
  const payBtn = document.getElementById('payNowBtn');

  if (!input || !msg) return;
  const userId = input.value.trim();
  if (!userId) { msg.textContent = "Please enter a User ID"; msg.className = 'check-msg error'; return; }

  msg.textContent = "⏳ Checking...";
  msg.className = 'check-msg';

  try {
    const res = await fetch(`/miniapp/api/check-user/${userId}`);
    const data = await res.json();

    if (data.success) {
      receiverUser = data.user;
      msg.textContent = "✅ User found!";
      msg.className = 'check-msg success';

      if (box) {
        box.style.display = 'flex';
        document.getElementById('userInfoName').textContent = receiverUser.firstName || "User";
        document.getElementById('userInfoId').textContent = 'ID: ' + receiverUser.userId;
        const avatarBox = document.getElementById('userInfoAvatar');
        if (receiverUser.photoUrl) {
          avatarBox.innerHTML = `<img src="${receiverUser.photoUrl}" alt="">`;
        } else {
          avatarBox.innerHTML = '👤';
        }
      }

      if (amountCard) amountCard.style.display = 'block';
      if (balanceInfo) balanceInfo.style.display = 'flex';
      if (payBtn) payBtn.style.display = 'block';
    } else {
      receiverUser = null;
      msg.textContent = "❌ " + (data.error || "User not found");
      msg.className = 'check-msg error';
      if (box) box.style.display = 'none';
      if (amountCard) amountCard.style.display = 'none';
      if (balanceInfo) balanceInfo.style.display = 'none';
      if (payBtn) payBtn.style.display = 'none';
    }
  } catch (e) {
    msg.textContent = "❌ Error: " + e.message;
    msg.className = 'check-msg error';
  }
}

function setAmount(amt) {
  const input = document.getElementById('payAmount');
  if (input) input.value = amt;
}

function initiatePay() {
  if (!receiverUser) return alert("Please check user first!");
  const amountInput = document.getElementById('payAmount');
  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) return alert("Enter valid amount!");

  const balance = currentUser?.balance || 0;
  if (amount > balance) return alert("❌ Insufficient balance!");

  document.getElementById('confirmName').textContent = receiverUser.firstName || "User";
  document.getElementById('confirmUserId').textContent = receiverUser.userId;
  document.getElementById('confirmAmount').textContent = '₹' + amount.toFixed(2);

  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.add('active');
}

function cancelPay() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.remove('active');
}

async function confirmPay() {
  if (!receiverUser) return;
  const amount = parseFloat(document.getElementById('payAmount').value);
  if (isNaN(amount) || amount <= 0) return;

  const confirmBtn = document.querySelector('.confirm-ok-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "⏳ Sending..."; }

  try {
    const res = await fetch('/miniapp/api/quick-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: currentUserId,
        receiverId: receiverUser.userId,
        amount: amount
      })
    });
    const data = await res.json();

    cancelPay();

    if (data.success) {
      document.getElementById('successMsg').textContent =
        `₹${amount.toFixed(2)} sent to ${receiverUser.firstName || "User"} successfully!`;
      const successModal = document.getElementById('successModal');
      if (successModal) successModal.classList.add('active');

      document.getElementById('payUserId').value = '';
      document.getElementById('payAmount').value = '';
      document.getElementById('userInfoBox').style.display = 'none';
      document.getElementById('amountCard').style.display = 'none';
      document.getElementById('payBalanceInfo').style.display = 'none';
      document.getElementById('payNowBtn').style.display = 'none';
      document.getElementById('userCheckMsg').textContent = '';
      receiverUser = null;

      await loadUser();
    } else {
      alert("❌ " + (data.error || "Payment failed"));
    }
  } catch (e) {
    alert("❌ Error: " + e.message);
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "✅ CONFIRM"; }
  }
}

function closeSuccess() {
  const modal = document.getElementById('successModal');
  if (modal) modal.classList.remove('active');
}

// ============================================================
// 👤 PROFILE PAGE
// ============================================================
async function loadProfile() {
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

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();
    if (!data.success) return;

    const u = data.user;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

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

  // ✅ Admin Check
  try {
    const adminRes = await fetch(`/miniapp/api/is-admin/${currentUserId}`);
    const adminData = await adminRes.json();
    if (adminData.success && adminData.isAdmin) {
      const adminCard = document.getElementById('adminPanelCard');
      if (adminCard) adminCard.style.display = 'block';
    }
  } catch (e) { console.error(e); }
}

function openAdminPanel() {
  window.location.href = '/miniapp/admin';
}

// ============================================================
// 🚀 INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await initMiniApp();

  if (document.getElementById('taskList')) await loadTasks();
  if (document.getElementById('totalBalance')) await loadProfile();
});
