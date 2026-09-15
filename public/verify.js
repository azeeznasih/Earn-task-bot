// ============================================================
// 🎯 Verification Page Logic
// ============================================================
const tg = window.Telegram?.WebApp;
let currentUserId = null;
let verifyData = null;

function getUserId() {
  if (tg && tg.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
  let testId = localStorage.getItem('miniapp_test_id');
  if (!testId) {
    testId = prompt("Enter Test User ID:", "8061612320") || "8061612320";
    localStorage.setItem('miniapp_test_id', testId);
  }
  return testId;
}

async function initVerify() {
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0a0f14");
      tg.setBackgroundColor("#0a0f14");
    } catch (e) {}
  }
  currentUserId = getUserId();
  await checkVerification();
}

async function checkVerification() {
  try {
    const res = await fetch(`/miniapp/api/verify/${currentUserId}`);
    const data = await res.json();

    if (!data.success) { showFailed("User not found"); return; }

    verifyData = data;
    renderUserInfo(data);
    renderCard(data);

    if (data.botPhotoUrl) {
      document.getElementById('botPhotoImg').src = data.botPhotoUrl;
      document.getElementById('botPhotoSmall').src = data.botPhotoUrl;
    }
    if (data.botName) {
      document.getElementById('botName').textContent = data.botName;
    }

    if (data.verified) {
      showSuccess(data);
    } else {
      await submitDeviceVerification();
    }
  } catch (e) {
    console.error("Verify error:", e);
    showFailed("Network error");
  }
}

function renderUserInfo(data) {
  document.getElementById('userName').textContent = data.firstName || "User";
  document.getElementById('userId').textContent = 'ID: ' + data.userId;
  document.getElementById('userHandle').textContent = data.username ? '@' + data.username : '@-';

  if (data.userPhotoUrl) {
    let img = document.getElementById('userImg');
    img.src = data.userPhotoUrl;
    img.style.display = 'block';
    document.getElementById('userFallback').style.display = 'none';
  }
}

function renderCard(data) {
  document.getElementById('cardTelegramId').textContent = data.userId;
  document.getElementById('cardName').textContent = (data.firstName || "USER").toUpperCase();
  document.getElementById('cardHandle').textContent = data.username ? '@' + data.username : '@-';
}

function showSuccess(data) {
  document.getElementById('statusText').textContent = 'Verified';
  document.getElementById('statusBadge').classList.remove('failed');
  document.getElementById('mainCard').classList.remove('failed');
  document.getElementById('cardStatusIcon').textContent = '✅';

  let title = document.getElementById('statusTitle');
  title.textContent = '✅ Device verified';
  title.className = 'status-title success';

  document.getElementById('statusSubtitle').textContent = "You're all set. Your bot is ready.";

  document.getElementById('botStatus').textContent = 'Account verified';
  document.getElementById('botStatus').className = 'bot-status';
  document.getElementById('botCheck').textContent = '✅';

  document.getElementById('continueBtn').style.display = 'flex';
}

function showFailed(reason) {
  document.getElementById('statusText').textContent = 'Failed';
  document.getElementById('statusBadge').classList.add('failed');
  document.getElementById('mainCard').classList.add('failed');
  document.getElementById('cardStatusIcon').textContent = '❌';

  let title = document.getElementById('statusTitle');
  title.textContent = '❌ Verification Failed';
  title.className = 'status-title failed';

  document.getElementById('statusSubtitle').textContent = reason || "This device has already been used.";

  document.getElementById('botStatus').textContent = 'Verification failed';
  document.getElementById('botStatus').className = 'bot-status failed';
  document.getElementById('botCheck').textContent = '❌';

  document.getElementById('continueBtn').style.display = 'flex';
  document.getElementById('continueBtn').innerHTML = '🔄 Try Again';
}

function generateDeviceHash() {
  let saved = localStorage.getItem('device_hash');
  if (saved) return saved;

  let data = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.platform || ''
  ].join('|');

  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h) + data.charCodeAt(i);
    h |= 0;
  }
  let hash = 'dev_' + Math.abs(h).toString(36) + '_' + Date.now().toString(36);
  localStorage.setItem('device_hash', hash);
  return hash;
}

async function submitDeviceVerification() {
  try {
    let deviceHash = generateDeviceHash();
    const res = await fetch('/miniapp/api/verify/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, deviceHash })
    });
    const result = await res.json();

    if (result.verified) {
      showSuccess(verifyData);
    } else {
      showFailed(result.reason || "Verification failed");
    }
  } catch (e) {
    showFailed("Network error");
  }
}

function continueToBot() {
  if (verifyData && verifyData.verified) {
    if (tg) tg.close();
    else alert("Please return to Telegram bot.");
  } else {
    location.reload();
  }
}

function goBack() {
  if (tg) tg.close();
  else window.history.back();
}

window.addEventListener('DOMContentLoaded', initVerify);
