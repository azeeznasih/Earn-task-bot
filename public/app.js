// ============================================================
// 📱 TASK EARN BOT — MINI APP
// Complete app.js — All working functions (FIXED)
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
let appConfig = {};

// ============================================================
// 🎨 UTILITIES
// ============================================================
function showToast(msg, duration = 2500) {
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
  }, duration);
}

function formatCurrency(amt) {
  return '₹' + (parseFloat(amt) || 0).toFixed(2);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function haptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.impactOccurred(type);
  }
}

// ============================================================
// 📱 TELEGRAM MAIN BUTTON
// ============================================================
function setMainButton(text, callback, visible = true) {
  if (!tg?.MainButton) return;
  if (visible) {
    tg.MainButton.setText(text);
    tg.MainButton.onClick(callback);
    tg.MainButton.show();
  } else {
    tg.MainButton.hide();
  }
}

function hideMainButton() {
  if (tg?.MainButton) tg.MainButton.hide();
}

// ============================================================
// 🌐 API HELPER
// ============================================================
async function apiCall(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e);
    return { success: false, error: 'Network error' };
  }
}

// ============================================================
// 🎨 LOAD CONFIG (button names, logo, etc.)
// ============================================================
async function loadConfig() {
  try {
    const res = await apiCall('/miniapp/api/config');
    if (res.success) {
      appConfig = res.config || {};

      // Update logo
      const logoText = document.getElementById('appLogo');
      if (logoText && appConfig.appLogo) {
        logoText.textContent = appConfig.appLogo;
      }

      // Update nav labels
      updateNavLabels();
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
}

// ============================================================
// 🏷️ UPDATE NAV LABELS (dynamic)
// ============================================================
function updateNavLabels() {
  const labels = {
    home: appConfig.btn_home || 'HOME',
    task: appConfig.btn_task || 'TASK',
    pay: appConfig.btn_pay || 'PAY',
    profile: appConfig.btn_profile || 'PROFILE'
  };

  const homeEl = document.getElementById('nav-home');
  const taskEl = document.getElementById('nav-task');
  const payEl = document.getElementById('nav-pay');
  const profileEl = document.getElementById('nav-profile');

  if (homeEl) homeEl.textContent = labels.home;
  if (taskEl) taskEl.textContent = labels.task;
  if (payEl) payEl.textContent = labels.pay;
  if (profileEl) profileEl.textContent = labels.profile;
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

  const res = await apiCall(`/miniapp/api/user/${currentUserId}`);

  if (!res.success) {
    showToast('❌ User not found');
    return;
  }

  currentUser = res.user;

  // Update UI
  const usernameEl = document.getElementById('username');
  const useridEl = document.getElementById('userid');
  const balanceEl = document.getElementById('balance');
  const linkedEl = document.getElementById('linkedStatus');

  if (usernameEl) usernameEl.textContent = res.user.firstName || 'User';
  if (useridEl) useridEl.textContent = 'ID: ' + res.user.userId;
  if (balanceEl) balanceEl.textContent = formatCurrency(res.user.balance);
  if (linkedEl) linkedEl.textContent = res.user.linkedInfo || 'Not Linked';

  // Load profile photo
  await loadProfilePhoto();
}

// ============================================================
// 📸 LOAD PROFILE PHOTO
// ============================================================
async function loadProfilePhoto() {
  if (!currentUserId) return;

  const res = await apiCall(`/miniapp/api/profile-photo/${currentUserId}`);

  if (res.success && res.photoUrl) {
    const img = document.getElementById('avatarImg');
    const fallback = document.getElementById('avatarFallback');
    if (img && fallback) {
      img.src = res.photoUrl;
      img.style.display = 'block';
      fallback.style.display = 'none';
    }
  }
}

// ============================================================
// 💰 LOAD BALANCE
// ============================================================
async function loadBalance() {
  if (!currentUserId) return;

  const res = await apiCall(`/miniapp/api/user/${currentUserId}`);
  if (res.success) {
    const balanceEl = document.getElementById('balance');
    if (balanceEl) balanceEl.textContent = formatCurrency(res.user.balance);
    if (currentUser) currentUser.balance = res.user.balance;
  }
}

// ============================================================
// 🔄 REFRESH BALANCE
// ============================================================
async function refreshBalance() {
  const btn = document.getElementById('refreshBtn');
  const balanceEl = document.getElementById('balance');

  if (btn) btn.classList.add('spinning');
  if (balanceEl) balanceEl.style.opacity = '0.5';
  haptic('light');

  try {
    const res = await apiCall(`/miniapp/api/user/${currentUserId}`);

    if (res.success) {
      if (balanceEl) balanceEl.textContent = formatCurrency(res.user.balance);
      if (currentUser) currentUser.balance = res.user.balance;
      showToast('✅ Balance Updated');
      haptic('success');
      await loadPaymentMethods();
    } else {
      showToast('❌ Refresh failed');
      haptic('error');
    }
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

  const res = await apiCall(`/miniapp/api/payment-methods/${currentUserId}`);

  if (!res.success) {
    listEl.innerHTML = '<div class="loading">Failed to load</div>';
    return;
  }

  let html = '';
  res.methods.forEach(m => {
    let display = (m.value && m.value !== 'Not Set') ? m.value : 'Not Set';
    html += `<div class="payment-item">
      <span>${m.icon} ${m.name}</span>
      <span>${escapeHtml(display)}</span>
    </div>`;
  });

  listEl.innerHTML = html || '<div class="loading">No methods</div>';
}

// ============================================================
// 🏠 HOME BLOCKS (Dynamic Content)
// ============================================================
async function loadHomeBlocks() {
  const container = document.getElementById('homeBlocks');
  if (!container) return;

  const res = await apiCall('/miniapp/api/home-blocks');
  if (!res.success || !res.blocks || res.blocks.length === 0) {
    // Keep default blocks
    return;
  }

  // Hide default blocks
  const defaultBlocks = ['defaultUserCard', 'defaultBalanceCard', 'defaultLinkedCard', 'defaultPaymentCard'];
  defaultBlocks.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Clear container and render dynamic blocks
  container.innerHTML = '';

  for (const block of res.blocks) {
    const el = await renderBlock(block);
    if (el) container.appendChild(el);
  }
}

async function renderBlock(block) {
  const div = document.createElement('div');

  switch (block.type) {
    case 'text':
      div.className = 'glass block-text';
      div.innerHTML = `
        ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ''}
        <div>${block.content || ''}</div>
      `;
      break;

    case 'image':
      div.className = 'glass block-image';
      div.innerHTML = block.link
        ? `<a href="${escapeHtml(block.link)}" target="_blank"><img src="${escapeHtml(block.imageUrl)}" alt=""></a>`
        : `<img src="${escapeHtml(block.imageUrl)}" alt="">`;
      break;

    case 'banner':
      div.className = 'glass block-banner';
      div.innerHTML = `
        ${block.imageUrl ? `<img src="${escapeHtml(block.imageUrl)}" alt="">` : ''}
        ${(block.title || block.content) ? `
          <div class="banner-overlay">
            ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ''}
            ${block.content ? `<p>${escapeHtml(block.content)}</p>` : ''}
          </div>
        ` : ''}
      `;
      break;

    case 'button':
      div.innerHTML = `
        <a href="${escapeHtml(block.link)}" target="_blank" class="block-button">
          ${escapeHtml(block.linkText || block.title || 'Click Here')}
        </a>
      `;
      break;

    case 'announcement':
      div.className = 'glass block-announcement';
      div.innerHTML = `
        <span style="font-size: 20px;">📢</span>
        <div>
          ${block.title ? `<strong>${escapeHtml(block.title)}</strong><br>` : ''}
          ${escapeHtml(block.content || '')}
        </div>
      `;
      break;

    case 'profile':
      div.innerHTML = `
        <div class="user-card glass">
          <div class="user-info">
            <div class="avatar">
              <span id="avatarFallback2">👤</span>
              <img id="avatarImg2" src="" style="display:none;">
            </div>
            <div>
              <div class="username" id="username2">Loading...</div>
              <div class="userid" id="userid2">ID: -</div>
            </div>
          </div>
        </div>
      `;
      break;

    case 'balance':
      div.innerHTML = `
        <div class="balance-card glass">
          <div class="balance-header">
            <div class="label">AVAILABLE BALANCE</div>
            <button class="refresh-icon-btn" onclick="refreshBalance()">
              <span class="refresh-icon">🔄</span>
            </button>
          </div>
          <div class="balance" id="balance">₹0.00</div>
          <button class="addfund-btn" onclick="openAddFund()">➕ ADD FUND</button>
          <button class="withdraw-btn" onclick="openWithdraw()">WITHDRAW NOW ↗</button>
        </div>
      `;
      break;

    case 'linked':
      div.innerHTML = `
        <div class="linked-card glass">
          <div class="linked-left">
            <div class="linked-icon">🔗</div>
            <div>
              <div class="linked-label">LINKED ACCOUNT</div>
              <div class="linked-status" id="linkedStatus">Not Linked</div>
            </div>
          </div>
          <button class="change-btn" onclick="openPaymentMethods()">CHANGE</button>
        </div>
      `;
      break;

    case 'payment_methods':
      div.innerHTML = `
        <div class="payment-card glass">
          <div class="section-title">💳 PAYMENT METHODS</div>
          <div id="paymentList" class="payment-list">Loading...</div>
        </div>
      `;
      break;

    default:
      return null;
  }

  return div;
}

// ============================================================
// 🚀 WITHDRAW MODAL (FIXED + Bank Full Width + Amazon + Redeem)
// ============================================================
async function openWithdraw() {
  if (!currentUser) return showToast('❌ User not loaded');

  const modal = document.getElementById('withdrawModal');
  const methodsEl = document.getElementById('withdrawMethods');

  if (!modal || !methodsEl) return;

  haptic('light');

  // Check each method availability
  const hasWallet = currentUser.walletAccount && currentUser.walletAccount !== 'Not Set';
  const hasUpi = currentUser.upiId && currentUser.upiId !== 'Not Set';
  const hasBank = currentUser.bankAccNo && currentUser.bankAccNo !== 'Not Set';
  const hasAmazon = currentUser.amazonEmail && currentUser.amazonEmail !== 'Not Set';
  const hasRedeem = currentUser.redeemCodeAddr && currentUser.redeemCodeAddr !== 'Not Set';

  // Build buttons — Row structure:
  // Row 1: Wallet + UPI
  // Row 2: Bank (FULL WIDTH)
  // Row 3: Amazon + Redeem
  let html = `
    <div class="withdraw-grid">
      <div class="withdraw-row">
        <button class="withdraw-method-btn" onclick="submitWithdraw('wallet')" ${!hasWallet ? 'disabled' : ''}>
          <span class="wm-icon">🌐</span>
          <span class="wm-label">Wallet</span>
          <span class="wm-status">${hasWallet ? '✓' : 'Set'}</span>
        </button>
        <button class="withdraw-method-btn" onclick="submitWithdraw('upi')" ${!hasUpi ? 'disabled' : ''}>
          <span class="wm-icon">⚡</span>
          <span class="wm-label">UPI</span>
          <span class="wm-status">${hasUpi ? '✓' : 'Set'}</span>
        </button>
      </div>

      <div class="withdraw-row">
        <button class="withdraw-method-btn bank-full" onclick="submitWithdraw('bank')" ${!hasBank ? 'disabled' : ''}>
          <span class="wm-icon">🏦</span>
          <span class="wm-label">Bank Account</span>
          <span class="wm-status">${hasBank ? '✓' : 'Set'}</span>
        </button>
      </div>

      <div class="withdraw-row">
        <button class="withdraw-method-btn" onclick="submitWithdraw('amazon')" ${!hasAmazon ? 'disabled' : ''}>
          <span class="wm-icon">📧</span>
          <span class="wm-label">Amazon</span>
          <span class="wm-status">${hasAmazon ? '✓' : 'Set'}</span>
        </button>
        <button class="withdraw-method-btn" onclick="submitWithdraw('redeem')" ${!hasRedeem ? 'disabled' : ''}>
          <span class="wm-icon">🎁</span>
          <span class="wm-label">Redeem</span>
          <span class="wm-status">${hasRedeem ? '✓' : 'Set'}</span>
        </button>
      </div>
    </div>
  `;

  methodsEl.innerHTML = html;
  modal.classList.add('active');
}

function closeWithdraw() {
  document.getElementById('withdrawModal').classList.remove('active');
}

// ============================================================
// 💸 SUBMIT WITHDRAW (with custom amount modal)
// ============================================================
async function submitWithdraw(method) {
  if (!currentUser) return;

  const methodName = method.charAt(0).toUpperCase() + method.slice(1);
  const minW = 10;
  const maxW = 10000;

  // Create amount input modal
  const modal = document.getElementById('withdrawModal');
  const methodsEl = document.getElementById('withdrawMethods');

  methodsEl.innerHTML = `
    <div class="amount-input-wrap">
      <span class="rupee-symbol">₹</span>
      <input type="number" id="withdrawAmount" placeholder="Enter amount" min="${minW}" max="${maxW}">
    </div>

    <div class="quick-amounts">
      <button onclick="setWAmount(50)">₹50</button>
      <button onclick="setWAmount(100)">₹100</button>
      <button onclick="setWAmount(500)">₹500</button>
      <button onclick="setWAmount(${currentUser.balance.toFixed(0)})">MAX</button>
    </div>

    <div class="pay-balance-info">
      <span>Available Balance</span>
      <span>${formatCurrency(currentUser.balance)}</span>
    </div>

    <div class="confirm-buttons">
      <button class="confirm-cancel-btn" onclick="openWithdraw()">Back</button>
      <button class="confirm-ok-btn" onclick="doWithdraw('${method}')">Withdraw</button>
    </div>
  `;
}

function setWAmount(amt) {
  const input = document.getElementById('withdrawAmount');
  if (input) input.value = amt;
}

async function doWithdraw(method) {
  const input = document.getElementById('withdrawAmount');
  if (!input) return;

  const amount = parseFloat(input.value);
  if (isNaN(amount) || amount <= 0) {
    showToast('❌ Enter valid amount');
    haptic('error');
    return;
  }

  if (amount < 10) {
    showToast('❌ Minimum ₹10');
    haptic('error');
    return;
  }

  if (amount > currentUser.balance) {
    showToast('❌ Insufficient balance');
    haptic('error');
    return;
  }

  const methodName = method.charAt(0).toUpperCase() + method.slice(1);

  showToast('⏳ Processing...');

  const res = await apiCall('/miniapp/api/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      userId: currentUserId,
      amount: amount,
      method: methodName
    })
  });

  if (res.success) {
    showToast(`✅ Withdrawal submitted! #${res.withdrawalId}`);
    haptic('success');
    closeWithdraw();
    await refreshBalance();
  } else {
    showToast(`❌ ${res.error || 'Failed'}`);
    haptic('error');
  }
}

// ============================================================
// 💳 PAYMENT METHODS MODAL
// ============================================================
function openPaymentMethods() {
  const modal = document.getElementById('paymentModal');
  const listEl = document.getElementById('paymentUpdateList');

  if (!modal || !listEl) return;

  haptic('light');

  const fields = [
    { key: 'walletAccount', name: '🌐 Wallet ID', value: currentUser?.walletAccount || '' },
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

  const res = await apiCall('/miniapp/api/update-payment', {
    method: 'POST',
    body: JSON.stringify({
      userId: currentUserId,
      field: field,
      value: value.trim()
    })
  });

  if (res.success) {
    showToast('✅ Updated!');
    haptic('success');
    await loadUserInfo();
    await loadPaymentMethods();
    closePaymentModal();
  } else {
    showToast(`❌ ${res.error || 'Failed'}`);
    haptic('error');
  }
}

// ============================================================
// 🎁 ADD FUND
// ============================================================
function openAddFund() {
  haptic('light');
  window.location.href = '/miniapp/addfund';
}

// ============================================================
// 📱 MODAL CLOSE ON OUTSIDE CLICK
// ============================================================
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});

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

  // Load config first
  await loadConfig();

  // Load user + balance + payment methods
  await loadUserInfo();
  await loadBalance();
  await loadPaymentMethods();

  // Load home blocks (dynamic content)
  await loadHomeBlocks();

  console.log('✅ Mini App loaded');
});

// ============================================================
// 🔒 PREVENT ZOOM
// ============================================================
document.addEventListener('gesturestart', e => e.preventDefault());

// ============================================================
// 🌐 EXPORT FOR GLOBAL USE
// ============================================================
window.refreshBalance = refreshBalance;
window.openWithdraw = openWithdraw;
window.closeWithdraw = closeWithdraw;
window.submitWithdraw = submitWithdraw;
window.doWithdraw = doWithdraw;
window.setWAmount = setWAmount;
window.openPaymentMethods = openPaymentMethods;
window.closePaymentModal = closePaymentModal;
window.updatePaymentMethod = updatePaymentMethod;
window.openAddFund = openAddFund;
