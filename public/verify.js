// ============================================================
// 🎯 Verification Page Logic
// ============================================================
const tg = window.Telegram?.WebApp;
let currentUserId = null;
let verifyData = null;

function getUserId() {
  if (tg && tg.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }
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

    if (!data.success) {
      showFailed("User not found");
      return;
    }

    verifyData = data;
    renderUserInfo(data);
    renderCard(data);

    if (data.verified) {
      showSuccess(data);
    } else {
      showFailed(data.reason || "Verification failed");
    }

    // Load bot photo
    if (data.botPhotoUrl) {
      document.getElementById('botPhotoImg').src = data.botPhotoUrl;
      document.getElementById('botPhotoSmall').src = data.botPhotoUrl;
    }
    if (data.botName) {
      document.getElementById('botName').textContent = data.botName;
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
  // Status badge
  document.getElementById('statusText').textContent = 'Verified';
  document.getElementById('statusBadge').classList.remove('failed');

  // Card
  document.getElementById('mainCard').classList.remove('failed');
  document.getElementById('cardStatusIcon').textContent = '✅';

  // Status section
  let title = document.getElementById('statusTitle');
  title.textContent = '✅ Device verified';
  title.className = 'status-title success';

  document.getElementById('statusSubtitle').textContent = "You're all set. Your bot is ready.";

  // Bot status
  document.getElementById('botStatus').textContent = 'Account verified';
  document.getElementById('botStatus').className = 'bot-status';
  document.getElementById('botCheck').textContent = '✅';

  // Show continue button
  document.getElementById('continueBtn').style.display = 'flex';
}

function showFailed(reason) {
  // Status badge
  document.getElementById('statusText').textContent = 'Failed';
  document.getElementById('statusBadge').classList.add('failed');

  // Card
  document.getElementById('mainCard').classList.add('failed');
  document.getElementById('cardStatusIcon').textContent = '❌';

  // Status section
  let title = document.getElementById('statusTitle');
  title.textContent = '❌ Verification Failed';
  title.className = 'status-title failed';

  document.getElementById('statusSubtitle').textContent = reason || "This device has already been used.";

  // Bot status
  document.getElementById('botStatus').textContent = 'Verification failed';
  document.getElementById('botStatus').className = 'bot-status failed';
  document.getElementById('botCheck').textContent = '❌';

  // Show continue button (to retry)
  document.getElementById('continueBtn').style.display = 'flex';
  document.getElementById('continueBtn').innerHTML = '🔄 Try Again';
}

function continueToBot() {
  if (verifyData && verifyData.verified) {
    if (tg) tg.close();
    else alert("Please return to Telegram bot.");
  } else {
    // Retry
    location.reload();
  }
}

function goBack() {
  if (tg) tg.close();
  else window.history.back();
}

window.addEventListener('DOMContentLoaded', initVerify);
