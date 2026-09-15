// ============================================================
// 👑 ADMIN PANEL — Mini App Logic
// ============================================================

let adminUserId = null;
let isAdminUser = false;

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js init
  setTimeout(initAdminPanel, 500);
});

async function initAdminPanel() {
  try {
    // Get user ID
    adminUserId = currentUserId || (tg?.initDataUnsafe?.user?.id) || localStorage.getItem('miniapp_test_id');

    if (!adminUserId) {
      document.getElementById('adminLoading').innerHTML = '❌ User ID not found';
      return;
    }

    console.log("👑 Admin check for:", adminUserId);

    // Admin check
    const adminRes = await fetch(`/miniapp/api/is-admin/${adminUserId}`);
    const adminData = await adminRes.json();

    console.log("Admin response:", adminData);

    if (!adminData.success || !adminData.isAdmin) {
      document.getElementById('adminLoading').style.display = 'none';
      document.getElementById('notAdminMsg').style.display = 'block';
      return;
    }

    isAdminUser = true;

    // Show content
    document.getElementById('adminLoading').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';

    // Admin info
    const userRes = await fetch(`/miniapp/api/user/${adminUserId}`);
    const userData = await userRes.json();
    if (userData.success) {
      document.getElementById('adminName').textContent = userData.user.firstName || "Admin";
      document.getElementById('adminId').textContent = 'ID: ' + userData.user.userId;
    }

    // Load stats
    await loadStats();
    await loadWithdrawals();
    await loadAddFunds();
    await loadSubmissions();
    await loadUsers();

  } catch (e) {
    console.error("Admin init error:", e);
    document.getElementById('adminLoading').innerHTML = '❌ Error: ' + e.message;
  }
}

// ---------- LOAD STATS ----------
async function loadStats() {
  try {
    const totalRes = await fetch('/miniapp/api/total-balance');
    const totalData = await totalRes.json();
    if (totalData.success) {
      document.getElementById('statUsers').textContent = totalData.totalUsers;
      document.getElementById('statBalance').textContent = '₹' + totalData.totalBalance.toFixed(0);
    }

    const tasksRes = await fetch('/miniapp/api/tasks');
    const tasksData = await tasksRes.json();
    if (tasksData.success) {
      document.getElementById('statTasks').textContent = tasksData.tasks.length;
    }

    const wdRes = await fetch('/miniapp/api/admin/pending-withdrawals');
    const wdData = await wdRes.json();
    if (wdData.success) {
      document.getElementById('statWd').textContent = wdData.withdrawals.length;
    }

    const afRes = await fetch('/miniapp/api/admin/pending-addfunds');
    const afData = await afRes.json();
    if (afData.success) {
      document.getElementById('statAf').textContent = afData.addFunds.length;
    }

    const subRes = await fetch('/miniapp/api/admin/pending-submissions');
    const subData = await subRes.json();
    if (subData.success) {
      document.getElementById('statSub').textContent = subData.submissions.length;
    }
  } catch (e) { console.error("Stats error:", e); }
}

// ---------- LOAD WITHDRAWALS ----------
async function loadWithdrawals() {
  try {
    const res = await fetch('/miniapp/api/admin/pending-withdrawals');
    const data = await res.json();
    const list = document.getElementById('withdrawalList');

    if (!data.success || data.withdrawals.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending withdrawals</div></div>`;
      return;
    }

    list.innerHTML = '';
    data.withdrawals.forEach(w => {
      const item = document.createElement('div');
      item.className = 'admin-item glass';
      item.innerHTML = `
        <div class="admin-item-header">
          <span class="admin-item-id">#${w.userWithdrawalCount || w.withdrawalId}</span>
          <span class="admin-item-amount">₹${w.amount.toFixed(2)}</span>
        </div>
        <div class="admin-item-row"><b>User:</b> ${w.userId}</div>
        <div class="admin-item-row"><b>Method:</b> ${w.method}</div>
        <div class="admin-item-row"><b>Details:</b> <code>${w.details}</code></div>
        <div class="admin-item-row"><b>Date:</b> ${new Date(w.createdAt).toLocaleString('en-IN')}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveWd('${w.withdrawalId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectWd('${w.withdrawalId}')">❌ Reject</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) { console.error("Withdrawals load error:", e); }
}

// ---------- LOAD ADD FUNDS ----------
async function loadAddFunds() {
  try {
    const res = await fetch('/miniapp/api/admin/pending-addfunds');
    const data = await res.json();
    const list = document.getElementById('addFundList');

    if (!data.success || data.addFunds.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending add funds</div></div>`;
      return;
    }

    list.innerHTML = '';
    data.addFunds.forEach(a => {
      const item = document.createElement('div');
      item.className = 'admin-item glass';
      item.innerHTML = `
        <div class="admin-item-header">
          <span class="admin-item-id">#${a.requestId}</span>
          <span class="admin-item-amount">₹${a.amount.toFixed(2)}</span>
        </div>
        <div class="admin-item-row"><b>User:</b> ${a.userId} (${a.userName || 'User'})</div>
        <div class="admin-item-row"><b>Method:</b> ${a.method}</div>
        <div class="admin-item-row"><b>Date:</b> ${new Date(a.createdAt).toLocaleString('en-IN')}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveAf('${a.requestId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectAf('${a.requestId}')">❌ Reject</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) { console.error("AddFunds load error:", e); }
}

// ---------- LOAD SUBMISSIONS ----------
async function loadSubmissions() {
  try {
    const res = await fetch('/miniapp/api/admin/pending-submissions');
    const data = await res.json();
    const list = document.getElementById('submissionList');

    if (!data.success || data.submissions.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No pending submissions</div></div>`;
      return;
    }

    list.innerHTML = '';
    data.submissions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'admin-item glass';
      item.innerHTML = `
        <div class="admin-item-header">
          <span class="admin-item-id">#${s.submissionId}</span>
          <span class="admin-item-amount">₹${s.reward.toFixed(2)}</span>
        </div>
        <div class="admin-item-row"><b>User:</b> ${s.userId} (${s.userName})</div>
        <div class="admin-item-row"><b>Task:</b> ${s.taskTitle}</div>
        <div class="admin-item-row"><b>Date:</b> ${new Date(s.createdAt).toLocaleString('en-IN')}</div>
        <div class="admin-item-actions">
          <button class="btn-approve" onclick="approveSub('${s.submissionId}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectSub('${s.submissionId}')">❌ Reject</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) { console.error("Submissions load error:", e); }
}

// ---------- LOAD USERS ----------
async function loadUsers() {
  try {
    const res = await fetch('/miniapp/api/admin/all-users');
    const data = await res.json();
    const list = document.getElementById('userList');

    if (!data.success || data.users.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div>No users</div></div>`;
      return;
    }

    list.innerHTML = '';
    data.users.slice(0, 50).forEach(u => {
      const item = document.createElement('div');
      item.className = 'admin-item glass';
      item.innerHTML = `
        <div class="admin-item-header">
          <span class="admin-item-id">${u.firstName || 'User'}</span>
          <span class="admin-item-amount">₹${u.balance.toFixed(2)}</span>
        </div>
        <div class="admin-item-row"><b>ID:</b> <code>${u.userId}</code></div>
        <div class="admin-item-row"><b>Username:</b> ${u.username ? '@' + u.username : 'Not Set'}</div>
        <div class="admin-item-row"><b>Withdrawn:</b> ₹${(u.withdrawnTotal || 0).toFixed(2)}</div>
      `;
      list.appendChild(item);
    });
  } catch (e) { console.error("Users load error:", e); }
}

// ---------- TAB SWITCH ----------
function switchTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));

  document.getElementById('tab-' + tab).style.display = 'block';
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
}

// ---------- APPROVE / REJECT ACTIONS ----------
async function approveWd(id) {
  if (!confirm('✅ Approve this withdrawal?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-wd/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ Approved!');
      loadWithdrawals();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

async function rejectWd(id) {
  if (!confirm('❌ Reject this withdrawal?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-wd/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('❌ Rejected!');
      loadWithdrawals();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

async function approveAf(id) {
  if (!confirm('✅ Approve this add fund?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-af/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ Approved!');
      loadAddFunds();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

async function rejectAf(id) {
  if (!confirm('❌ Reject this add fund?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-af/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('❌ Rejected!');
      loadAddFunds();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

async function approveSub(id) {
  if (!confirm('✅ Approve this submission?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/approve-sub/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ Approved!');
      loadSubmissions();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

async function rejectSub(id) {
  if (!confirm('❌ Reject this submission?')) return;
  try {
    const res = await fetch(`/miniapp/api/admin/reject-sub/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('❌ Rejected!');
      loadSubmissions();
      loadStats();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Error: ' + e.message); }
}

// ---------- ADMIN ACTIONS ----------
function adminAction(name) {
  alert(`⚙️ ${name}\n\nFull control in Bot /admin`);
}
