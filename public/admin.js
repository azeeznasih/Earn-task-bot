// ============================================================
// 👑 ADMIN PANEL — Mini App (Complete JS)
// All features — Withdrawals, Add Funds, Submissions, Users, Customize, Admins
// ============================================================

let adminUserId = null;
let isAdminUser = false;
let isOwnerUser = false;
let appConfig = {};

const DEFAULTS = {
  app_logo: "Task Earn Bot",
  btn_home: "HOME",
  btn_task: "TASK",
  btn_pay: "PAY",
  btn_profile: "PROFILE"
};

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

function haptic(type = 'light') {
  const tg = window.Telegram?.WebApp;
  if (tg?.HapticFeedback) {
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.impactOccurred(type);
  }
}

async function apiCall(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { success: false, error: 'Network error' };
  }
}

// ============================================================
// 🚀 INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js init
  setTimeout(initAdminPanel, 500);
});

async function initAdminPanel() {
  try {
    const tg = window.Telegram?.WebApp;
    adminUserId = (typeof currentUserId !== 'undefined' && currentUserId)
      || tg?.initDataUnsafe?.user?.id
      || localStorage.getItem('miniapp_test_id');

    if (!adminUserId) {
      document.getElementById('adminLoading').innerHTML = '❌ User ID not found';
      return;
    }

    console.log("👑 Admin check for:", adminUserId);

    // Admin check
    const adminData = await apiCall(`/miniapp/api/is-admin/${adminUserId}`);
    console.log("Admin response:", adminData);

    if (!adminData.success || !adminData.isAdmin) {
      document.getElementById('adminLoading').style.display = 'none';
      document.getElementById('notAdminMsg').style.display = 'block';
      return;
    }

    isAdminUser = true;
    isOwnerUser = adminData.isOwner || false;

    // Show content
    document.getElementById('adminLoading').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';

    // Load admin info
    const userData = await apiCall(`/miniapp/api/user/${adminUserId}`);
    if (userData.success) {
      document.getElementById('adminName').textContent = userData.user.firstName || "Admin";
      document.getElementById('adminId').textContent = 'ID: ' + userData.user.userId;
    }

    // Load config
    await loadConfig();

    // Load all data
    await loadStats();
    await loadWithdrawals();
    await loadAddFunds();
    await loadSubmissions();
    await loadUsers();
    await loadCustomize();

    // Load admins if owner
    if (isOwnerUser) {
      await loadAdmins();
    }

  } catch (e) {
    console.error("Admin init error:", e);
    document.getElementById('adminLoading').innerHTML = '❌ Error: ' + e.message;
  }
}

// ============================================================
// 🎨 LOAD CONFIG
// ============================================================
async function loadConfig() {
  const res = await apiCall('/miniapp/api/config');
  if (res.success && res.config) {
    appConfig = res.config;
    const logo = document.getElementById('appLogo');
    if (logo && appConfig.appLogo) logo.textContent = 'ADMIN — ' + appConfig.appLogo;
  }
}

// ============================================================
// 📊 LOAD STATS
// ============================================================
async function loadStats() {
  const totalData = await apiCall('/miniapp/api/total-balance');
  if (totalData.success) {
    document.getElementById('statUsers').textContent = totalData.totalUsers || 0;
    document.getElementById('statBalance').textContent = '₹' + (totalData.totalBalance || 0).toFixed(0);
  }

  const tasksData = await apiCall('/miniapp/api/tasks');
  if (tasksData.success) {
    document.getElementById('statTasks').textContent = tasksData.tasks?.length || 0;
  }

  const wdData = await apiCall('/miniapp/api/admin/pending-withdrawals');
  if (wdData.success) {
    document.getElementById('statWd').textContent = wdData.withdrawals?.length || 0;
  }

  const afData = await apiCall('/miniapp/api/admin/pending-addfunds');
  if (afData.success) {
    document.getElementById('statAf').textContent = afData.addFunds?.length || 0;
  }

  const subData = await apiCall('/miniapp/api/admin/pending-submissions');
  if (subData.success) {
    document.getElementById('statSub').textContent = subData.submissions?.length || 0;
  }
}

// ============================================================
// 🔀 SWITCH TAB
// ============================================================
function switchTab(tab) {
  haptic('light');

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  document.querySelectorAll('.admin-tab-content').forEach(el => {
    el.style.display = 'none';
  });
  document.getElementById('tab-' + tab).style.display = 'block';

  // Reload data
  if (tab === 'withdrawals') loadWithdrawals();
  else if (tab === 'addfunds') loadAddFunds();
  else if (tab === 'submissions') loadSubmissions();
  else if (tab === 'users') loadUsers();
  else if (tab === 'customize') loadCustomize();
  else if (tab === 'admins' && isOwnerUser) loadAdmins();
}

// ============================================================
// 💸 LOAD WITHDRAWALS
// ============================================================
async function loadWithdrawals() {
  const res = await apiCall('/miniapp/api/admin/pending-withdrawals');
  const list = document.getElementById('withdrawalList');

  if (!res.success || !res.withdrawals || res.withdrawals.length === 0) {
    list.innerHTML = `
      <div class="empty-admin">
        <div class="icon">📭</div>
        <div>No pending withdrawals</div>
      </div>
    `;
    return;
  }

  let html = '';
  res.withdrawals.forEach(w => {
    html += `
      <div class="admin-item" id="wd-${w.withdrawalId}">
        <div class="admin-item-header">
          <div class="admin-item-id">#${w.userWithdrawalCount || w.withdrawalId}</div>
          <div class="admin-item-amount">₹${w.amount.toFixed(2)}</div>
        </div>
        <div class="admin-item-row"><b>User:</b> ${w.userId}</div>
        <div class="admin-item-row"><b>Method:</b> ${escapeHtml(w.method)}</div>
        <div class="admin-item-row"><b>Details:</b> <code>${escapeHtml(w.details)}</code></div>
        <div class="admin-item-row"><b>Date:</b> ${formatDate(w.createdAt)}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveWd('${w.withdrawalId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectWd('${w.withdrawalId}')">❌ Reject</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;
}

// ============================================================
// 💰 LOAD ADD FUNDS
// ============================================================
async function loadAddFunds() {
  const res = await apiCall('/miniapp/api/admin/pending-addfunds');
  const list = document.getElementById('addFundList');

  if (!res.success || !res.addFunds || res.addFunds.length === 0) {
    list.innerHTML = `
      <div class="empty-admin">
        <div class="icon">📭</div>
        <div>No pending add funds</div>
      </div>
    `;
    return;
  }

  let html = '';
  res.addFunds.forEach(a => {
    html += `
      <div class="admin-item" id="af-${a.requestId}">
        <div class="admin-item-header">
          <div class="admin-item-id">#${a.requestId}</div>
          <div class="admin-item-amount">₹${a.amount.toFixed(2)}</div>
        </div>
        <div class="admin-item-row"><b>User:</b> ${escapeHtml(a.userName || 'User')} (${a.userId})</div>
        <div class="admin-item-row"><b>Method:</b> ${escapeHtml(a.method)}</div>
        <div class="admin-item-row"><b>UTR:</b> <code>${escapeHtml(a.utr || '-')}</code></div>
        <div class="admin-item-row"><b>Date:</b> ${formatDate(a.createdAt)}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveAf('${a.requestId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectAf('${a.requestId}')">❌ Reject</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;
}

// ============================================================
// 📸 LOAD SUBMISSIONS
// ============================================================
async function loadSubmissions() {
  const res = await apiCall('/miniapp/api/admin/pending-submissions');
  const list = document.getElementById('submissionList');

  if (!res.success || !res.submissions || res.submissions.length === 0) {
    list.innerHTML = `
      <div class="empty-admin">
        <div class="icon">📭</div>
        <div>No pending submissions</div>
      </div>
    `;
    return;
  }

  let html = '';
  res.submissions.forEach(s => {
    const isRefer = s.photoFileId && s.photoFileId.startsWith('REFER:');
    const referValue = isRefer ? s.photoFileId.replace('REFER:', '') : '';

    html += `
      <div class="admin-item" id="sub-${s.submissionId}">
        <div class="admin-item-header">
          <div class="admin-item-id">#${s.submissionId}</div>
          <div class="admin-item-amount">₹${s.reward.toFixed(2)}</div>
        </div>
        <div class="admin-item-row"><b>User:</b> ${escapeHtml(s.userName)} (${s.userId})</div>
        <div class="admin-item-row"><b>Task:</b> ${escapeHtml(s.taskTitle)}</div>
        ${isRefer ? `<div class="admin-item-row"><b>Refer:</b> <code>${escapeHtml(referValue)}</code></div>` : ''}
        <div class="admin-item-row"><b>Type:</b> ${isRefer ? '🔗 Refer' : '📸 Photo'}</div>
        <div class="admin-item-row"><b>Date:</b> ${formatDate(s.createdAt)}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveSub('${s.submissionId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectSub('${s.submissionId}')">❌ Reject</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;
}

// ============================================================
// 👥 LOAD USERS
// ============================================================
async function loadUsers() {
  const res = await apiCall('/miniapp/api/admin/all-users');
  const list = document.getElementById('userList');

  if (!res.success || !res.users || res.users.length === 0) {
    list.innerHTML = '<div class="empty-admin">No users</div>';
    return;
  }

  let html = '';
  res.users.slice(0, 50).forEach((u, i) => {
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
  list.innerHTML = html;
}

// ============================================================
// 🎨 CUSTOMIZE
// ============================================================
async function loadCustomize() {
  const res = await apiCall('/miniapp/api/config');
  if (res.success && res.config) {
    appConfig = res.config;

    const el_logo = document.getElementById('cust_logo');
    const el_home = document.getElementById('cust_home');
    const el_task = document.getElementById('cust_task');
    const el_pay = document.getElementById('cust_pay');
    const el_profile = document.getElementById('cust_profile');

    if (el_logo) el_logo.value = appConfig.appLogo || DEFAULTS.app_logo;
    if (el_home) el_home.value = appConfig.btn_home || DEFAULTS.btn_home;
    if (el_task) el_task.value = appConfig.btn_task || DEFAULTS.btn_task;
    if (el_pay) el_pay.value = appConfig.btn_pay || DEFAULTS.btn_pay;
    if (el_profile) el_profile.value = appConfig.btn_profile || DEFAULTS.btn_profile;
  }
}

async function saveCustomize(key, inputId) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();

  if (!value) {
    showToast('❌ Enter a value');
    haptic('error');
    return;
  }

  const data = await apiCall('/miniapp/api/admin/save-config', {
    method: 'POST',
    body: JSON.stringify({ userId: adminUserId, key, value })
  });

  if (data.success) {
    showToast('✅ Saved!');
    haptic('success');
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
    haptic('error');
  }
}

async function resetCustomize(key, inputId) {
  if (!confirm(`Reset ${key} to default?`)) return;

  const defaultValue = DEFAULTS[key] || '';
  const input = document.getElementById(inputId);
  if (input) input.value = defaultValue;

  const data = await apiCall('/miniapp/api/admin/save-config', {
    method: 'POST',
    body: JSON.stringify({ userId: adminUserId, key, value: defaultValue })
  });

  if (data.success) {
    showToast('🔄 Reset to default!');
    haptic('success');
  }
}

async function resetAllCustomize() {
  if (!confirm('Reset ALL customization to default?')) return;

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await apiCall('/miniapp/api/admin/save-config', {
      method: 'POST',
      body: JSON.stringify({ userId: adminUserId, key, value })
    });
  }

  showToast('🔄 All reset!');
  haptic('success');
  await loadCustomize();
  await loadConfig();
}

// ============================================================
// 👑 ADMINS
// ============================================================
async function loadAdmins() {
  const listEl = document.getElementById('adminsList');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading">⏳ Loading...</div>';

  const data = await apiCall('/miniapp/api/admin/list');
  if (!data.success || !data.admins) {
    listEl.innerHTML = '<div class="empty-admin">Failed to load</div>';
    return;
  }

  let html = '';
  data.admins.forEach(a => {
    const isOwnerRow = a.role === 'owner';
    html += `
      <div class="admin-user-row">
        <div class="admin-user-avatar">${isOwnerRow ? '👑' : '👤'}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHtml(a.name || 'Admin')}${isOwnerRow ? ' (Owner)' : ''}</div>
          <div class="admin-user-id">${a.userId}</div>
        </div>
        <div class="admin-user-actions">
          ${!isOwnerRow ? `<button class="btn-remove" onclick="removeAdmin(${a.userId})">🗑️</button>` : ''}
        </div>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

async function addAdmin() {
  const input = document.getElementById('newAdminId');
  const newId = input.value.trim();

  if (!newId || isNaN(newId)) {
    showToast('❌ Enter valid User ID');
    haptic('error');
    return;
  }

  const data = await apiCall('/miniapp/api/admin/add', {
    method: 'POST',
    body: JSON.stringify({ userId: newId, requesterId: adminUserId })
  });

  if (data.success) {
    showToast('✅ Admin added!');
    haptic('success');
    input.value = '';
    await loadAdmins();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
    haptic('error');
  }
}

async function removeAdmin(adminId) {
  if (!confirm(`Remove admin ${adminId}?`)) return;

  const data = await apiCall(`/miniapp/api/admin/remove/${adminId}`, {
    method: 'POST',
    body: JSON.stringify({ requesterId: adminUserId })
  });

  if (data.success) {
    showToast('🗑️ Removed');
    haptic('success');
    await loadAdmins();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

// ============================================================
// ✅ APPROVE / REJECT ACTIONS
// ============================================================
async function approveWd(id) {
  if (!confirm('✅ Approve this withdrawal?')) return;
  const data = await apiCall(`/miniapp/api/admin/approve-wd/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('✅ Approved!');
    haptic('success');
    document.getElementById('wd-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
    haptic('error');
  }
}

async function rejectWd(id) {
  if (!confirm('❌ Reject this withdrawal?')) return;
  const data = await apiCall(`/miniapp/api/admin/reject-wd/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('❌ Rejected!');
    haptic('success');
    document.getElementById('wd-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

async function approveAf(id) {
  if (!confirm('✅ Approve this add fund?')) return;
  const data = await apiCall(`/miniapp/api/admin/approve-af/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('✅ Approved!');
    haptic('success');
    document.getElementById('af-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

async function rejectAf(id) {
  if (!confirm('❌ Reject this add fund?')) return;
  const data = await apiCall(`/miniapp/api/admin/reject-af/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('❌ Rejected!');
    document.getElementById('af-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

async function approveSub(id) {
  if (!confirm('✅ Approve this submission?')) return;
  const data = await apiCall(`/miniapp/api/admin/approve-sub/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('✅ Approved!');
    haptic('success');
    document.getElementById('sub-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

async function rejectSub(id) {
  if (!confirm('❌ Reject this submission?')) return;
  const data = await apiCall(`/miniapp/api/admin/reject-sub/${id}`, { method: 'POST' });
  if (data.success) {
    showToast('❌ Rejected!');
    document.getElementById('sub-' + id)?.remove();
    loadStats();
  } else {
    showToast('❌ ' + (data.error || 'Failed'));
  }
}

// ============================================================
// 🎯 QUICK ACTIONS
// ============================================================
function adminAction(name) {
  showToast(`ℹ️ ${name} — Bot-ൽ /admin use ചെയ്യൂ`);
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================
window.switchTab = switchTab;
window.approveWd = approveWd;
window.rejectWd = rejectWd;
window.approveAf = approveAf;
window.rejectAf = rejectAf;
window.approveSub = approveSub;
window.rejectSub = rejectSub;
window.saveCustomize = saveCustomize;
window.resetCustomize = resetCustomize;
window.resetAllCustomize = resetAllCustomize;
window.addAdmin = addAdmin;
window.removeAdmin = removeAdmin;
window.adminAction = adminAction;
