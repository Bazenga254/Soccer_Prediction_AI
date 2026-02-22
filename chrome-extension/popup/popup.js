/**
 * Spark AI Chrome Extension - Popup Script
 * Handles login (email + Google), session, subscription, and payment.
 */

const views = {
  loading: document.getElementById("loading-view"),
  login: document.getElementById("login-view"),
  upgrade: document.getElementById("upgrade-view"),
  dashboard: document.getElementById("dashboard-view"),
  expired: document.getElementById("expired-view"),
};

let selectedPlan = null;
let paymentPollTimer = null;

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name]?.classList.add("active");
}

// === INIT ===
async function init() {
  showView("loading");

  let auth;
  try {
    auth = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });
  } catch (e) {
    console.warn("[Spark AI] Auth check failed:", e);
    showView("login");
    return;
  }

  if (!auth || !auth.authenticated) {
    showView("login");
    return;
  }

  const user = auth.user || {};
  const tier = auth.tier || user.tier || "free";

  if (tier === "pro") {
    // Check if subscription is actually still active
    try {
      const sub = await chrome.runtime.sendMessage({ type: "GET_SUBSCRIPTION" });
      if (sub && sub.subscription && sub.subscription.status === "expired") {
        showExpiredView(user);
        return;
      }
      if (sub && sub.subscription) {
        showSubscriptionInfo(sub.subscription);
      }
    } catch {}

    document.getElementById("dash-username").textContent = user.display_name || user.username || "Pro User";
    document.getElementById("dash-avatar").textContent = (user.display_name || user.username || "U")[0].toUpperCase();
    showView("dashboard");
    initToggle();
    return;
  }

  // Check if was previously pro (subscription expired)
  if (user._was_pro || tier === "free") {
    // Try to get subscription history to see if expired
    try {
      const sub = await chrome.runtime.sendMessage({ type: "GET_SUBSCRIPTION" });
      if (sub && sub.subscription && sub.subscription.status === "expired") {
        showExpiredView(user);
        return;
      }
    } catch {}
  }

  // Not pro — show upgrade view
  document.getElementById("upgrade-username").textContent = user.display_name || user.username || "User";
  document.getElementById("upgrade-tier").textContent = tier;
  showView("upgrade");
  loadPlans("plans-list");
}

function showExpiredView(user) {
  document.getElementById("expired-username").textContent = user.display_name || user.username || "User";
  showView("expired");
  loadPlans("expired-plans-list");
}

function showSubscriptionInfo(sub) {
  const infoEl = document.getElementById("sub-info");
  if (!infoEl || !sub) return;

  const planName = document.getElementById("sub-plan-name");
  const expiresEl = document.getElementById("sub-expires");

  planName.textContent = sub.plan_name || sub.plan || "Pro";
  if (sub.expires_at) {
    const expDate = new Date(sub.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
    expiresEl.textContent = `Expires: ${expDate.toLocaleDateString()} (${daysLeft} days left)`;
    if (daysLeft <= 3) {
      expiresEl.classList.add("expiring-soon");
    }
  }
  infoEl.style.display = "block";
}

// === PLANS ===
async function loadPlans(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="plan-loading">Loading plans...</div>';

  let data;
  try {
    data = await chrome.runtime.sendMessage({ type: "GET_PLANS" });
  } catch {
    container.innerHTML = '<div class="plan-loading">Failed to load plans. <a href="https://spark-ai-prediction.com/upgrade" target="_blank" style="color:#3b82f6">View plans on website</a></div>';
    return;
  }

  if (data.error || !data.plans) {
    container.innerHTML = '<div class="plan-loading">Failed to load plans. <a href="https://spark-ai-prediction.com/upgrade" target="_blank" style="color:#3b82f6">View plans on website</a></div>';
    return;
  }

  const plans = data.plans.filter((p) => p.id !== "trial_usd" && p.id !== "trial_kes");

  container.innerHTML = plans
    .map(
      (p) => `
    <div class="plan-card" data-plan-id="${p.id}">
      <div class="plan-top">
        <div class="plan-name">${p.name}</div>
        <div class="plan-price">${p.currency === "KES" ? "KES " : "$"}${p.price}</div>
        <div class="plan-duration">${p.duration_days || 7} days</div>
      </div>
      <div class="plan-actions">
        ${p.currency === "KES" ? `<button class="btn-mpesa" data-plan='${JSON.stringify(p)}'>M-Pesa</button>` : ""}
        <button class="btn-card" data-plan='${JSON.stringify(p)}'>Card</button>
      </div>
    </div>`
    )
    .join("");

  // Bind plan action buttons
  container.querySelectorAll(".btn-mpesa").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const plan = JSON.parse(btn.dataset.plan);
      showMpesaModal(plan, containerId);
    });
  });

  container.querySelectorAll(".btn-card").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const plan = JSON.parse(btn.dataset.plan);
      btn.disabled = true;
      btn.textContent = "Opening...";

      try {
        const result = await chrome.runtime.sendMessage({
          type: "CREATE_CARD_CHECKOUT",
          plan_id: plan.id,
        });

        if (result.checkout_url) {
          chrome.tabs.create({ url: result.checkout_url });
          // Show polling status
          const statusContainer = containerId.includes("expired")
            ? "expired-payment-status"
            : "payment-status";
          showPaymentPolling(result.transaction_id || result.checkout_id, statusContainer);
        } else {
          btn.textContent = result.error || "Failed";
          setTimeout(() => { btn.textContent = "Card"; btn.disabled = false; }, 2000);
        }
      } catch {
        btn.textContent = "Card";
        btn.disabled = false;
      }
    });
  });
}

// === M-PESA ===
function showMpesaModal(plan, containerId) {
  selectedPlan = plan;
  const isExpired = containerId.includes("expired");
  const prefix = isExpired ? "expired-" : "";

  document.getElementById(`${prefix}mpesa-modal`).style.display = "block";
  document.getElementById(containerId.replace("-list", "-section") || "plans-section").style.display = "none";
}

function hideMpesaModal(isExpired) {
  const prefix = isExpired ? "expired-" : "";
  document.getElementById(`${prefix}mpesa-modal`).style.display = "none";

  const sectionId = isExpired ? "expired-plans-section" : "plans-section";
  document.getElementById(sectionId).style.display = "block";
  selectedPlan = null;
}

async function handleMpesaPay(isExpired) {
  const prefix = isExpired ? "expired-" : "";
  const phone = document.getElementById(`${prefix}mpesa-phone`).value.trim();
  const errorEl = document.getElementById(`${prefix}mpesa-error`);
  const btn = document.getElementById(`${prefix}mpesa-pay-btn`);

  if (!phone || phone.length < 10) {
    errorEl.textContent = "Enter a valid phone number (e.g. 254712345678)";
    return;
  }

  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Sending STK push...";

  try {
    const result = await chrome.runtime.sendMessage({
      type: "INITIATE_MPESA",
      plan_id: selectedPlan.id,
      phone: phone,
    });

    if (result.error) {
      errorEl.textContent = result.error;
      btn.disabled = false;
      btn.textContent = "Pay with M-Pesa";
      return;
    }

    // Show payment polling
    const statusId = isExpired ? "expired-payment-status" : "payment-status";
    document.getElementById(`${prefix}mpesa-modal`).style.display = "none";
    showPaymentPolling(result.transaction_id, statusId);
  } catch {
    errorEl.textContent = "Connection error. Try again.";
    btn.disabled = false;
    btn.textContent = "Pay with M-Pesa";
  }
}

function showPaymentPolling(txId, statusContainerId) {
  const container = document.getElementById(statusContainerId);
  container.style.display = "block";

  const textEl = container.querySelector("p");
  textEl.textContent = "Waiting for payment confirmation...";

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes (every 5 seconds)

  if (paymentPollTimer) clearInterval(paymentPollTimer);

  paymentPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(paymentPollTimer);
      textEl.textContent = "Payment timed out. Check your M-Pesa.";
      return;
    }

    try {
      const status = await chrome.runtime.sendMessage({
        type: "CHECK_PAYMENT",
        tx_id: txId,
      });

      if (status.payment_status === "completed") {
        clearInterval(paymentPollTimer);
        textEl.textContent = "Payment successful! Activating Pro...";

        // Force revalidate auth
        await chrome.storage.local.set({ spark_last_validate: 0 });
        setTimeout(() => init(), 1500);
      } else if (status.payment_status === "failed") {
        clearInterval(paymentPollTimer);
        textEl.textContent = "Payment failed: " + (status.failure_reason || "Unknown error");
      }
    } catch {}
  }, 5000);
}

// === GOOGLE LOGIN ===
document.getElementById("google-btn").addEventListener("click", async () => {
  const btn = document.getElementById("google-btn");
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  try {
    const result = await chrome.runtime.sendMessage({ type: "GOOGLE_LOGIN" });

    if (result && result.success) {
      init();
    } else {
      errorEl.textContent = (result && result.error) || "Google sign-in failed";
      btn.disabled = false;
      btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google`;
    }
  } catch (err) {
    errorEl.textContent = "Google sign-in failed. Try again.";
    btn.disabled = false;
    btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google`;
  }
});

// === EMAIL LOGIN ===
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Logging in...";

  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const result = await chrome.runtime.sendMessage({
      type: "LOGIN",
      email,
      password,
    });

    if (result && result.success) {
      init();
    } else {
      errorEl.textContent = (result && result.error) || "Login failed";
      btn.disabled = false;
      btn.textContent = "Log In";
    }
  } catch {
    errorEl.textContent = "Connection error. Please try again.";
    btn.disabled = false;
    btn.textContent = "Log In";
  }
});

// === LOGOUT (all views) ===
document.getElementById("dash-logout").addEventListener("click", async () => {
  try { await chrome.runtime.sendMessage({ type: "LOGOUT" }); } catch {}
  showView("login");
});

document.getElementById("upgrade-logout").addEventListener("click", async () => {
  try { await chrome.runtime.sendMessage({ type: "LOGOUT" }); } catch {}
  showView("login");
});

document.getElementById("expired-logout").addEventListener("click", async () => {
  try { await chrome.runtime.sendMessage({ type: "LOGOUT" }); } catch {}
  showView("login");
});

// === M-PESA MODAL HANDLERS ===
document.getElementById("mpesa-pay-btn").addEventListener("click", () => handleMpesaPay(false));
document.getElementById("mpesa-cancel").addEventListener("click", () => hideMpesaModal(false));
document.getElementById("expired-mpesa-pay-btn").addEventListener("click", () => handleMpesaPay(true));
document.getElementById("expired-mpesa-cancel").addEventListener("click", () => hideMpesaModal(true));

// === EXTENSION TOGGLE ===
async function initToggle() {
  const toggle = document.getElementById("extension-toggle");
  const row = document.getElementById("toggle-row");
  const statusText = document.getElementById("toggle-status-text");

  // Load saved state (default: enabled)
  const stored = await chrome.storage.local.get(["spark_extension_enabled"]);
  const enabled = stored.spark_extension_enabled !== false; // default true

  toggle.checked = enabled;
  statusText.textContent = enabled ? "Active" : "Paused";
  row.classList.toggle("off", !enabled);

  toggle.addEventListener("change", async () => {
    const isOn = toggle.checked;
    statusText.textContent = isOn ? "Active" : "Paused";
    row.classList.toggle("off", !isOn);

    await chrome.storage.local.set({ spark_extension_enabled: isOn });

    // Notify all tabs to show/hide buttons
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "SPARK_TOGGLE",
            enabled: isOn,
          }).catch(() => {});
        }
      }
    });
  });
}

// === START ===
init();
