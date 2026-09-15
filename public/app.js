// ============================================================
// 📱 TASK EARN BOT — MINI APP
// Complete app.js — All working functions
// ============================================================

// ============================================================
// 🔧 TELEGRAM WEBAPP INIT
// ============================================================
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#000000');
  tg.setBackgroundColor('#000000');
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// User ID from Telegram
const currentUserId = tg?.initDataUnsafe?.user?.id;
let currentUser = null;

// ============================================================
// 🎨 UTILITIES
// ============================================================
function showToast(msg) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function formatCurrency(amt) {
  return '₹' + (parseFloat(amt) || 0).toFixed(2);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// 👤 LOAD USER INFO
// ============================================================
async function loadUserInfo() {
  if (!currentUserId) {
    document.getElementById('username').textContent = 'Not logged in';
    document.getElementById('userid').textContent = 'Open from Telegram';
    return;
  }

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();

    if (!data.success) {
      showToast('❌ User not found');
      return;
    }

    currentUser = data.user;

    // Update UI
    document.getElementById('username').textContent = data.user.firstName || 'User';
    document.getElementById('userid').textContent = 'ID: ' + data.user.userId;
    document.getElementById('balance').textContent = formatCurrency(data.user.balance);
    document.getElementById('linkedStatus').textContent = data.user.linkedInfo || 'Not Linked';

    // Load profile photo
    await loadProfilePhoto();
  } catch (e) {
    console.error('Load user error:', e);
    showToast('❌ Failed to load user');
  }
}

// ============================================================
// 📸 LOAD PROFILE PHOTO
// ============================================================
async function loadProfilePhoto() {
  if (!currentUserId) return;

  try {
    const res = await fetch(`/miniapp/api/profile-photo/${currentUserId}`);
    const data = await res.json();

    if (data.success && data.photoUrl) {
      const img = document.getElementById('avatarImg');
      const fallback = document.getElementById('avatarFallback');
      img.src = data.photoUrl;
      img.style.display = 'block';
      fallback.style.display = 'none';
    }
  } catch (e) {
    console.error('Photo load error:', e);
  }
}

// ============================================================
// 💰 LOAD BALANCE
// ============================================================
async function loadBalance() {
  if (!currentUserId) return;

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();

    if (data.success) {
      document.getElementById('balance').textContent = formatCurrency(data.user.balance);
      if (currentUser) currentUser.balance = data.user.balance;
    }
  } catch (e) {
    console.error('Balance load error:', e);
  }
}

// ============================================================
// 🔄 REFRESH BALANCE (button click)
// ============================================================
async function refreshBalance() {
  const btn = document.getElementById('refreshBtn');
  const balanceEl = document.getElementById('balance');

  if (btn) btn.classList.add('spinning');
  if (balanceEl) balanceEl.style.opacity = '0.5';

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();

    if (data.success) {
      if (balanceEl) balanceEl.textContent = formatCurrency(data.user.balance);
      if (currentUser) currentUser.balance = data.user.balance;
      showToast('✅ Balance Updated');
      await loadPaymentMethods();
    } else {
      showToast('❌ Refresh failed');
    }
  } catch (e) {
    showToast('❌ Refresh failed');
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove('spinning');
      if (balanceEl) balanceEl.style.opacity = '1';
    }, 500);
  }
}

// ============================================================
// 💳 LOAD PAYMENT METHODS
// ============================================================
async function loadPaymentMethods() {
  if (!currentUserId) return;

  const listEl = document.getElementById('paymentList');
  if (!listEl) return;

  try {
    const res = await fetch(`/miniapp/api/payment-methods/${currentUserId}`);
    const data = await res.json();

    if (!data.success) {
      listEl.innerHTML = '<div class="loading">Failed to load</div>';
      return;
    }

    let html = '';
    data.methods.forEach(m => {
      let display = (m.value && m.value !== 'Not Set') ? m.value : 'Not Set';
      html += `<div class="payment-item">
        <span>${m.icon} ${m.name}</span>
        <span>${escapeHtml(display)}</span>
      </div>`;
    });

    listEl.innerHTML = html || '<div class="loading">No methods</div>';
  } catch (e) {
    listEl.innerHTML = '<div class="loading">Error loading</div>';
  }
}

// ============================================================
// 🚀 WITHDRAW MODAL
// ============================================================
async function openWithdraw() {
  if (!currentUser) return showToast('❌ User not loaded');

  const modal = document.getElementById('withdrawModal');
  const methodsEl = document.getElementById('withdrawMethods');

  if (!modal || !methodsEl) return;

  // Methods
  const methods = [
    { key: 'wallet', name: '🌐 Wallet', value: currentUser.linkedInfo?.includes('Wallet') ? currentUser.linkedInfo : 'Not Set' },
    { key: 'upi', name: '⚡ UPI', value: currentUser.upiId || 'Not Set' },
    { key: 'bank', name: '🏦 Bank', value: currentUser.bankAccNo || 'Not Set' }
  ];

  let html = '';
  methods.forEach(m => {
    let disabled = (m.value === 'Not Set');
    html += `<button class="admin-menu-btn" ${disabled ? 'disabled' : ''} 
      onclick="submitWithdraw('${m.key}')" style="opacity:${disabled ? 0.5 : 1}">
      <span class="menu-icon">${m.name.split(' ')[0]}</span>
      <span class="menu-text">${m.name.split(' ').slice(1).join(' ')}</span>
      <span class="menu-arrow">›</span>
    </button>`;
  });

  methodsEl.innerHTML = html;
  modal.classList.add('active');
}

function closeWithdraw() {
  document.getElementById('withdrawModal').classList.remove('active');
}

async function submitWithdraw(method) {
  const amountStr = prompt('Enter amount to withdraw:');
  if (!amountStr) return;

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    showToast('❌ Invalid amount');
    return;
  }

  if (currentUser.balance < amount) {
    showToast('❌ Insufficient balance');
    return;
  }

  const methodName = method.charAt(0).toUpperCase() + method.slice(1);

  try {
    const res = await fetch('/miniapp/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        amount: amount,
        method: methodName
      })
    });

    const data = await res.json();

    if (data.success) {
      showToast(`✅ Withdrawal submitted! #${data.withdrawalId}`);
      closeWithdraw();
      await refreshBalance();
    } else {
      showToast(`❌ ${data.error || 'Failed'}`);
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

// ============================================================
// 💳 PAYMENT METHODS MODAL
// ============================================================
function openPaymentMethods() {
  const modal = document.getElementById('paymentModal');
  const listEl = document.getElementById('paymentUpdateList');

  if (!modal || !listEl) return;

  const fields = [
    { key: 'walletAccount', name: '🌐 Wallet ID', value: currentUser?.linkedInfo || '' },
    { key: 'upiId', name: '⚡ UPI ID', value: currentUser?.upiId || '' },
    { key: 'bankAccNo', name: '🏦 Bank Account', value: currentUser?.bankAccNo || '' },
    { key: 'bankIfsc', name: '🏦 IFSC Code', value: currentUser?.bankIfsc || '' },
    { key: 'amazonEmail', name: '📧 Amazon Email', value: currentUser?.amazonEmail || '' },
    { key: 'redeemCodeAddr', name: '🎁 Redeem Code', value: currentUser?.redeemCodeAddr || '' }
  ];

  let html = '';
  fields.forEach(f => {
    let display = (f.value && f.value !== 'Not Set') ? f.value : 'Not Set';
    html += `<button class="admin-menu-btn" onclick="updatePaymentMethod('${f.key}')">
      <span class="menu-icon">${f.name.split(' ')[0]}</span>
      <span class="menu-text">${f.name.split(' ').slice(1).join(' ')} — ${escapeHtml(display)}</span>
      <span class="menu-arrow">›</span>
    </button>`;
  });

  listEl.innerHTML = html;
  modal.classList.add('active');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('active');
}

async function updatePaymentMethod(field) {
  const value = prompt(`Enter new value for ${field}:`);
  if (!value || !value.trim()) return;

  try {
    const res = await fetch('/miniapp/api/update-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        field: field,
        value: value.trim()
      })
    });

    const data = await res.json();

    if (data.success) {
      showToast('✅ Updated!');
      await loadUserInfo();
      await loadPaymentMethods();
      closePaymentModal();
    } else {
      showToast(`❌ ${data.error || 'Failed'}`);
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

// ============================================================
// 🎁 ADD FUND (NEW)
// ============================================================
function openAddFund() {
  // Redirect to add fund page
  window.location.href = '/miniapp/addfund';
}

// ============================================================
// 🚀 INIT ON LOAD
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📱 Mini App loading...');
  console.log('User ID:', currentUserId);

  if (!currentUserId) {
    document.body.innerHTML = `
      <div style="padding:50px;text-align:center;color:#fff;">
        <h2>⚠️ Please open from Telegram</h2>
        <p style="color:#7a9a7a;margin-top:20px;">This Mini App works only inside Telegram.</p>
      </div>
    `;
    return;
  }

  // Load everything
  await loadUserInfo();
  await loadBalance();
  await loadPaymentMethods();

  console.log('✅ Mini App loaded');
});

// ============================================================
// 🔒 PREVENT ZOOM (optional)
// ============================================================
document.addEventListener('gesturestart', e => e.preventDefault());
