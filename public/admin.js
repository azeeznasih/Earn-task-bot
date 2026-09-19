// ============================================================
// 👑 TASK EARN BOT — ADMIN PAGE JS
// ============================================================

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#000000');
  tg.setBackgroundColor('#000000');
}

const adminUserId = tg?.initDataUnsafe?.user?.id;
let isAdminUser = false;

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
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

// ============================================================
// 🚀 INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!adminUserId) {
    document.body.innerHTML = `
      <div style="padding:50px;text-align:center;color:#00ff88;">
        <h2>⚠️ Open from Telegram</h2>
      </div>
    `;
    return;
  }

  const loadingEl = document.getElementById('adminLoading');
  const notAdminEl = document.getElementById('notAdminMsg');
  const contentEl = document.getElementById('adminContent');

  try {
    const res = await fetch(`/miniapp/api/is-admin/${adminUserId}`);
    const data = await res.json();

    if (!data.success || !data.isAdmin) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (notAdminEl) notAdminEl.style.display = 'block';
      return;
    }

    isAdminUser = true;
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    await loadAdminInfo();
    await loadStats();
    await loadSettings();
    await loadWithdrawals();
    await loadAddFunds();
    await loadSubmissions();
    await loadUsers();

  } catch (e) {
    console.error('Admin check:', e);
    if (loadingEl) loadingEl.style.display = 'none';
    if (notAdminEl) notAdminEl.style.display = 'block';
  }
});

// ============================================================
// 👤 ADMIN INFO
// ============================================================
async function loadAdminInfo() {
  try {
    const res = await fetch(`/miniapp/api/user/${adminUserId}`);
    const data = await res.json();
    if (data.success) {
      const nameEl = document.getElementById('adminName');
      const idEl = document.getElementById('adminId');
      if (nameEl) nameEl.textContent = data.user.firstName || 'Admin';
      if (idEl) idEl.textContent = 'ID: ' + data.user.userId;
    }
  } catch (e) {}
}

// ============================================================
// 📊 STATS
// ============================================================
async function loadStats() {
  try {
    const [totRes, taskRes, wdRes, afRes, subRes] = await Promise.all([
      fetch('/miniapp/api/total-balance'),
      fetch('/miniapp/api/tasks'),
      fetch('/miniapp/api/admin/pending-withdrawals'),
      fetch('/miniapp/api/admin/pending-addfunds'),
      fetch('/miniapp/api/admin/pending-submissions')
    ]);

    const [tot, task, wd, af, sub] = await Promise.all([
      totRes.json(), taskRes.json(), wdRes.json(), afRes.json(), subRes.json()
    ]);

    if (tot.success) {
      const u = document.getElementById('statUsers');
      const b = document.getElementById('statBalance');
      if (u) u.textContent = tot.totalUsers || 0;
      if (b) b.textContent = '₹' + (tot.totalBalance || 0).toFixed(0);
    }
    if (task.success) {
      const t = document.getElementById('statTasks');
      if (t) t.textContent = task.tasks?.length || 0;
    }
    if (wd.success) {
      const w = document.getElementById('statWd');
      if (w) w.textContent = wd.withdrawals?.length || 0;
    }
    if (af.success) {
      const a = document.getElementById('statAf');
      if (a) a.textContent = af.addFunds?.length || 0;
    }
    if (sub.success) {
      const s = document.getElementById('statSub');
      if (s) s.textContent = sub.submissions?.length || 0;
    }
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// ============================================================
// ⚙️ SETTINGS
// ============================================================
async function loadSettings() {
  try {
    const res = await fetch('/miniapp/api/admin/settings');
    const data = await res.json();
    if (!data.success) return;

    const s = data.settings;

    const minEl = document.getElementById('setMinWithdraw');
    const maxEl = document.getElementById('setMaxWithdraw');
    const taxEl = document.getElementById('setTaxPercent');
    const chanEl = document.getElementById('setPayoutChannel');
    const supEl = document.getElementById('setSupport');
    const botToggle = document.getElementById('setBotToggle');

    if (minEl) minEl.textContent = '₹' + s.min_withdraw;
    if (maxEl) maxEl.textContent = '₹' + s.max_withdraw;
    if (taxEl) taxEl.textContent = s.tax_percent + '%';
    if (chanEl) chanEl.textContent = s.payout_channel || 'Not Set';
    if (supEl) supEl.textContent = s.support_username || 'Not Set';

    if (botToggle) {
      if (s.bot_active) {
        botToggle.textContent = '🟢 ON';
        botToggle.className = 'toggle-btn on';
      } else {
        botToggle.textContent = '🔴 OFF';
        botToggle.className = 'toggle-btn off';
      }
    }
  } catch (e) {
    console.error('Settings error:', e);
  }
}

async function editSetting(key) {
  let current = document.getElementById(key === 'min_withdraw' ? 'setMinWithdraw' : key === 'max_withdraw' ? 'setMaxWithdraw' : 'setTaxPercent');
  let curVal = current ? current.textContent : '';

  let newVal = prompt(`Enter new value for ${key}:\nCurrent: ${curVal}`);
  if (!newVal) return;

  let value = parseFloat(newVal);
  if (isNaN(value) || value < 0) {
    showToast('❌ Invalid value');
    return;
  }

  try {
    const res = await fetch('/miniapp/api/admin/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ Updated!');
      await loadSettings();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

async function editTextSetting(key) {
  let current = document.getElementById(key === 'payout_channel' ? 'setPayoutChannel' : 'setSupport');
  let curVal = current ? current.textContent : '';

  let newVal = prompt(`Enter new value for ${key}:\nCurrent: ${curVal}`);
  if (newVal === null) return;

  try {
    const res = await fetch('/miniapp/api/admin/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: newVal.trim() })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ Updated!');
      await loadSettings();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

async function toggleBotStatus() {
  try {
    const res = await fetch('/miniapp/api/admin/settings');
    const data = await res.json();
    if (!data.success) return;

    const newVal = !data.settings.bot_active;

    const upd = await fetch('/miniapp/api/admin/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'bot_active', value: newVal })
    });

    const result = await upd.json();
    if (result.success) {
      showToast(newVal ? '✅ Bot ON' : '❌ Bot OFF');
      await loadSettings();
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

// ============================================================
// 💸 WITHDRAWALS
// ============================================================
async function loadWithdrawals() {
  const listEl = document.getElementById('withdrawalList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">⏳ Loading...</div>';

  try {
    const res = await fetch('/miniapp/api/admin/pending-withdrawals');
    const data = await res.json();

    if (!data.success || !data.withdrawals || data.withdrawals.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending withdrawals</div></div>`;
      return;
    }

    let html = '';
    data.withdrawals.forEach(wd => {
      html += `
        <div class="admin-item" id="wd-${wd.withdrawalId}">
          <div class="admin-item-header">
            <div class="admin-item-id">#${wd.withdrawalId}</div>
            <div class="admin-item-amount">₹${wd.amount.toFixed(2)}</div>
          </div>
          <div class="admin-item-row"><b>User:</b> <code>${wd.userId}</code></div>
          <div class="admin-item-row"><b>Method:</b> ${escapeHtml(wd.method)}</div>
          <div class="admin-item-row"><b>To:</b> <code>${escapeHtml(wd.details)}</code></div>
          <div class="admin-item-row"><b>Date:</b> ${formatDate(wd.createdAt)}</div>
          <div class="admin-item-actions">
            <button class="btn-approve" onclick="approveWd('${wd.withdrawalId}')">✅ Approve</button>
            <button class="btn-reject" onclick="rejectWd('${wd.withdrawalId}')">❌ Reject</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

async function approveWd(id) {
  if (!confirm(`Approve withdrawal #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-wd/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Approved!');
      document.getElementById('wd-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

async function rejectWd(id) {
  if (!confirm(`Reject withdrawal #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-wd/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('❌ Rejected & Refunded');
      document.getElementById('wd-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) {
    showToast('❌ Network error');
  }
}

// ============================================================
// 💰 ADD FUNDS
// ============================================================
async function loadAddFunds() {
  const listEl = document.getElementById('addFundList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">⏳ Loading...</div>';

  try {
    const res = await fetch('/miniapp/api/admin/pending-addfunds');
    const data = await res.json();

    if (!data.success || !data.addFunds || data.addFunds.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending add funds</div></div>`;
      return;
    }

    let html = '';
    data.addFunds.forEach(af => {
      html += `
        <div class="admin-item" id="af-${af.requestId}">
          <div class="admin-item-header">
            <div class="admin-item-id">#${af.requestId}</div>
            <div class="admin-item-amount">₹${af.amount.toFixed(2)}</div>
          </div>
          <div class="admin-item-row"><b>User:</b> ${escapeHtml(af.userName)}</div>
          <div class="admin-item-row"><b>ID:</b> <code>${af.userId}</code></div>
          <div class="admin-item-row"><b>Method:</b> ${escapeHtml(af.method)}</div>
          <div class="admin-item-row"><b>Date:</b> ${formatDate(af.createdAt)}</div>
          <div class="admin-item-actions">
            <button class="btn-approve" onclick="approveAf('${af.requestId}')">✅ Approve</button>
            <button class="btn-reject" onclick="rejectAf('${af.requestId}')">❌ Reject</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

async function approveAf(id) {
  if (!confirm(`Approve add fund #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-af/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Approved!');
      document.getElementById('af-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

async function rejectAf(id) {
  if (!confirm(`Reject add fund #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-af/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('❌ Rejected');
      document.getElementById('af-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

// ============================================================
// 📸 SUBMISSIONS
// ============================================================
async function loadSubmissions() {
  const listEl = document.getElementById('submissionList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">⏳ Loading...</div>';

  try {
    const res = await fetch('/miniapp/api/admin/pending-submissions');
    const data = await res.json();

    if (!data.success || !data.submissions || data.submissions.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending submissions</div></div>`;
      return;
    }

    let html = '';
    data.submissions.forEach(sub => {
      html += `
        <div class="admin-item" id="sub-${sub.submissionId}">
          <div class="admin-item-header">
            <div class="admin-item-id">#${sub.submissionId}</div>
            <div class="admin-item-amount">₹${sub.reward.toFixed(2)}</div>
          </div>
          <div class="admin-item-row"><b>User:</b> ${escapeHtml(sub.userName)}</div>
          <div class="admin-item-row"><b>ID:</b> <code>${sub.userId}</code></div>
          <div class="admin-item-row"><b>Task:</b> ${escapeHtml(sub.taskTitle)}</div>
          <div class="admin-item-row"><b>Date:</b> ${formatDate(sub.createdAt)}</div>
          <div class="admin-item-actions">
            <button class="btn-approve" onclick="approveSub('${sub.submissionId}')">✅ Approve</button>
            <button class="btn-reject" onclick="rejectSub('${sub.submissionId}')">❌ Reject</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

async function approveSub(id) {
  if (!confirm(`Approve submission #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-sub/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Approved!');
      document.getElementById('sub-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

async function rejectSub(id) {
  if (!confirm(`Reject submission #${id}?`)) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-sub/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('❌ Rejected');
      document.getElementById('sub-' + id)?.remove();
      loadStats();
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

// ============================================================
// 👥 USERS
// ============================================================
async function loadUsers() {
  const listEl = document.getElementById('userList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">⏳ Loading...</div>';

  try {
    const res = await fetch('/miniapp/api/admin/all-users');
    const data = await res.json();

    if (!data.success || !data.users || data.users.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No users</div>';
      return;
    }

    let html = '';
    data.users.forEach((u, i) => {
      html += `
        <div class="admin-item">
          <div class="admin-item-header">
            <div class="admin-item-id">#${i + 1}</div>
            <div class="admin-item-amount">₹${(u.balance || 0).toFixed(2)}</div>
          </div>
          <div class="admin-item-row"><b>Name:</b> ${escapeHtml(u.firstName || 'User')}</div>
          <div class="admin-item-row"><b>ID:</b> <code>${u.userId}</code></div>
          <div class="admin-item-row"><b>Username:</b> ${u.username ? '@' + escapeHtml(u.username) : '-'}</div>
          <div class="admin-item-row"><b>Withdrawn:</b> ₹${(u.withdrawnTotal || 0).toFixed(2)}</div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

// ============================================================
// 🔀 TABS
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  document.querySelectorAll('.admin-tab-content').forEach(el => {
    el.style.display = 'none';
  });

  const activeTab = document.getElementById('tab-' + tab);
  if (activeTab) activeTab.style.display = 'block';

  if (tab === 'withdrawals') loadWithdrawals();
  else if (tab === 'addfunds') loadAddFunds();
  else if (tab === 'submissions') loadSubmissions();
  else if (tab === 'users') loadUsers();
  else if (tab === 'settings') loadSettings();
}

// ============================================================
// 📋 TASK MANAGEMENT
// ============================================================
async function addNewTask() {
  const taskId = prompt('Task ID (unique):');
  if (!taskId) return;
  const title = prompt('Task Title:');
  if (!title) return;
  const reward = prompt('Reward (₹):');
  if (!reward) return;
  const link = prompt('Task Link:');
  if (!link) return;
  const taskType = prompt('Task Type (photo / refer / affiliate):', 'photo') || 'photo';

  try {
    const res = await fetch('/miniapp/api/admin/task/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, title, reward, link, taskType })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Task created!');
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

// ============================================================
// 📢 BROADCAST
// ============================================================
async function sendBroadcast() {
  const msg = prompt('Broadcast message:');
  if (!msg) return;
  if (!confirm(`Send to ALL users?`)) return;

  showToast('⏳ Broadcasting...');

  try {
    const res = await fetch('/miniapp/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Sent: ${data.sent} | Failed: ${data.failed}`);
    } else {
      showToast('❌ ' + (data.error || 'Failed'));
    }
  } catch (e) { showToast('❌ Network error'); }
}

document.addEventListener('gesturestart', e => e.preventDefault());
