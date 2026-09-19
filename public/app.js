// ============================================================
// 📱 TASK EARN BOT — HOME PAGE JS
// ============================================================

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#000000');
  tg.setBackgroundColor('#000000');
}

const currentUserId = tg?.initDataUnsafe?.user?.id;
let currentUser = null;

// ============================================================
// 🔔 TOAST
// ============================================================
function showToast(msg) {
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
  if (!currentUserId) return;

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();

    if (!data.success) {
      document.getElementById('username').textContent = 'User not found';
      return;
    }

    currentUser = data.user;

    const usernameEl = document.getElementById('username');
    const useridEl = document.getElementById('userid');
    const balanceEl = document.getElementById('balance');
    const linkedStatusEl = document.getElementById('linkedStatus');

    if (usernameEl) usernameEl.textContent = data.user.firstName || 'User';
    if (useridEl) useridEl.textContent = 'ID: ' + data.user.userId;
    if (balanceEl) balanceEl.textContent = formatCurrency(data.user.balance);
    if (linkedStatusEl) linkedStatusEl.textContent = data.user.linkedInfo || 'Not Linked';

    await loadProfilePhoto();
  } catch (e) {
    console.error('Load user error:', e);
  }
}

// ============================================================
// 📸 PROFILE PHOTO
// ============================================================
async function loadProfilePhoto() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`/miniapp/api/profile-photo/${currentUserId}`);
    const data = await res.json();

    if (data.success && data.photoUrl) {
      const img = document.getElementById('avatarImg');
      const fallback = document.getElementById('avatarFallback');
      if (img) {
        img.src = data.photoUrl;
        img.style.display = 'block';
      }
      if (fallback) fallback.style.display = 'none';
    }
  } catch (e) {
    console.error('Photo error:', e);
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
      const balanceEl = document.getElementById('balance');
      if (balanceEl) balanceEl.textContent = formatCurrency(data.user.balance);
      if (currentUser) currentUser.balance = data.user.balance;
    }
  } catch (e) {
    console.error('Balance error:', e);
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

  try {
    const res = await fetch(`/miniapp/api/user/${currentUserId}`);
    const data = await res.json();

    if (data.success) {
      if (balanceEl) balanceEl.textContent = formatCurrency(data.user.balance);
      if (currentUser) currentUser.balance = data.user.balance;
      showToast('✅ Balance Updated');
      await loadPaymentMethods();
      await loadRecentActivity();
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
// 💳 PAYMENT METHODS
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
// 📜 RECENT ACTIVITY
// ============================================================
async function loadRecentActivity() {
  if (!currentUserId) return;
  const el = document.getElementById('recentActivity');
  if (!el) return;

  try {
    const res = await fetch(`/miniapp/api/user-history/${currentUserId}?limit=5`);
    const data = await res.json();

    if (!data.success || !data.history || data.history.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding:30px 20px;">
          <div class="icon" style="font-size:40px;">📭</div>
          <div>No activity yet</div>
        </div>
      `;
      return;
    }

    let html = '';
    data.history.forEach(h => {
      let amountClass = h.amount >= 0 ? 'positive' : 'negative';
      let amountSign = h.amount >= 0 ? '+' : '-';
      let amountStr = `${amountSign}₹${Math.abs(h.amount).toFixed(2)}`;
      let dateStr = new Date(h.date).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short'
      });

      let icon = '💰';
      if (h.type === 'withdrawal') icon = '💳';
      else if (h.type === 'sent') icon = '📤';
      else if (h.type === 'received') icon = '📥';
      else if (h.type === 'deposit') icon = '💰';
      else if (h.title.match(/Referral/i)) icon = '👤';
      else if (h.title.match(/Task/i)) icon = '🎁';

      html += `
        <div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-details">
            <div class="activity-title">${escapeHtml(h.title)}</div>
            <div class="activity-meta">${dateStr}</div>
          </div>
          <div class="activity-amount ${amountClass}">${amountStr}</div>
        </div>
      `;
    });

    el.innerHTML = html;
  } catch (e) {
    console.error('Activity error:', e);
  }
}

function viewAllHistory() {
  window.location.href = '/miniapp/history';
}

// ============================================================
// 💸 WITHDRAW MODAL
// ============================================================
function openWithdraw() {
  window.location.href = '/miniapp/withdraw';
}

// ============================================================
// ✏️ PAYMENT METHODS EDIT
// ============================================================
function openPaymentMethods() {
  window.location.href = '/miniapp/profile';
}

// ============================================================
// 🎁 ADD FUND
// ============================================================
function openAddFund() {
  window.location.href = '/miniapp/addfund';
}

// ============================================================
// 🚀 INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!currentUserId) {
    document.body.innerHTML = `
      <div style="padding:50px;text-align:center;color:#00ff88;">
        <h2>⚠️ Open from Telegram</h2>
        <p style="opacity:0.6;margin-top:20px;">This Mini App works only inside Telegram.</p>
      </div>
    `;
    return;
  }

  await loadUserInfo();
  await loadBalance();
  await loadPaymentMethods();
  await loadRecentActivity();
});

document.addEventListener('gesturestart', e => e.preventDefault());
