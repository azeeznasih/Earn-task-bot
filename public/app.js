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
      if (balanceEl) balanceEl.textContent = '₹' + (data.user.balance || 0).toFixed(2);
      if (currentUser) currentUser.balance = data.user.balance;

      showToast("✅ Balance Updated");

      // Reload payment methods
      await loadPaymentMethods();
    }
  } catch (e) {
    showToast("❌ Refresh failed");
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove('spinning');
      if (balanceEl) balanceEl.style.opacity = '1';
    }, 500);
  }
}
