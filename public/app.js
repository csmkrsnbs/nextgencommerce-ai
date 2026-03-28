const authStatus = document.getElementById("authStatus");
const generateStatus = document.getElementById("generateStatus");
const paymentBanner = document.getElementById("paymentBanner");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const tabs = document.querySelectorAll(".tab");

const authArea = document.getElementById("authArea");
const userArea = document.getElementById("userArea");

const userEmail = document.getElementById("userEmail");
const userPlan = document.getElementById("userPlan");
const userCredits = document.getElementById("userCredits");

const logoutBtn = document.getElementById("logoutBtn");

const messageForm = document.getElementById("messageForm");
const generateBtn = document.getElementById("generateBtn");
const output = document.getElementById("output");
const copyBtn = document.getElementById("copyBtn");

const historyList = document.getElementById("historyList");
const packsList = document.getElementById("packsList");
const paymentsList = document.getElementById("paymentsList");

const topicInput = document.getElementById("topicInput");
const headlineBtn = document.getElementById("headlineBtn");
const headlineStatus = document.getElementById("headlineStatus");
const headlineResult = document.getElementById("headlineResult");

const tokenKey = "mini_ai_tool_token";
const STRIPE_PUBLIC_KEY ="pk_test_51TG22nAnrJBu0YiDYa9fH5Jrtu7CizLiBGBX9t7WactR8R0oedpIHpNQiTQ6CLpsSgBMZTSOm56xuvfgybADPjCL00o3iAQH1c";

async function buyPack(pack) {
  const res = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pack }),
  });

  const data = await res.json();
  window.location.href = data.url;
}

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://nextgencommerce-ai-production.up.railway.app";

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function api(url, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function switchTab(tabName) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  if (loginForm) {
    loginForm.classList.toggle("hidden", tabName !== "login");
  }

  if (registerForm) {
    registerForm.classList.toggle("hidden", tabName !== "register");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function updateUserUI(user) {
  if (!user) {
    if (authArea) authArea.classList.remove("hidden");
    if (userArea) userArea.classList.add("hidden");

    if (userEmail) userEmail.textContent = "-";
    if (userPlan) userPlan.textContent = "-";
    if (userCredits) userCredits.textContent = "-";
    return;
  }

  if (authArea) authArea.classList.add("hidden");
  if (userArea) userArea.classList.remove("hidden");

  if (userEmail) userEmail.textContent = user.email || "-";
  if (userPlan) userPlan.textContent = user.plan || "-";
  if (userCredits) userCredits.textContent = user.credits ?? "-";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderHistory(items) {
  if (!historyList) return;

  if (!items || !items.length) {
    historyList.innerHTML = `<p class="muted">Henüz kayıt yok.</p>`;
    return;
  }

  historyList.innerHTML = items
    .map(
      (item) => `
      <div class="history-item">
        <div class="meta">${escapeHtml(item.created_at || "")} • ${escapeHtml(item.target || "")} • ${escapeHtml(item.goal || "")} • ${escapeHtml(item.tone || "")}</div>
        <div class="result">${escapeHtml(item.result || "")}</div>
      </div>
    `
    )
    .join("");
}

function renderPayments(items) {
  if (!paymentsList) return;

  if (!items || !items.length) {
    paymentsList.innerHTML = `<p class="muted">Henüz ödeme yok.</p>`;
    return;
  }

  paymentsList.innerHTML = items
    .map(
      (item) => `
      <div class="history-item">
        <div class="meta">${escapeHtml(item.created_at || "")} • ${escapeHtml(item.pack || "")} • ${escapeHtml(item.status || "")}</div>
        <div class="result">$${((item.amount || 0) / 100).toFixed(2)} ${escapeHtml((item.currency || "").toUpperCase())}</div>
      </div>
    `
    )
    .join("");
}

function renderPacks(items) {
  if (!packsList) return;

  if (!items || !items.length) {
    packsList.innerHTML = `<p class="muted">Paket bulunamadı.</p>`;
    return;
  }

  packsList.innerHTML = items
    .map(
      (item) => `
      <div class="pack-card">
        <h3>${escapeHtml(item.name || "")}</h3>
        <p>${item.credits ? `${item.credits} kredi` : ""}</p>
        <p class="price">$${((item.amount || 0) / 100).toFixed(2)}</p>
        <button class="buy-btn" data-pack="${escapeHtml(item.key || "")}" type="button">Satın Al</button>
      </div>
    `
    )
    .join("");

  packsList.querySelectorAll(".buy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await startCheckout(btn.dataset.pack);
    });
  });
}

async function loadMe() {
  const token = getToken();

  if (!token) {
    updateUserUI(null);
    renderHistory([]);
    renderPayments([]);
    if (packsList) {
      packsList.innerHTML = `<p class="muted">Giriş yaptıktan sonra paketler görünecek.</p>`;
    }
    return;
  }

  const { res, data } = await api("/api/me", { method: "GET" });

  if (!res.ok || !data.ok) {
    clearToken();
    updateUserUI(null);
    renderHistory([]);
    renderPayments([]);
    if (packsList) {
      packsList.innerHTML = `<p class="muted">Giriş yaptıktan sonra paketler görünecek.</p>`;
    }
    return;
  }

  updateUserUI(data.user);
  await Promise.all([loadHistory(), loadPacks(), loadPayments()]);
}

async function loadHistory() {
  const { res, data } = await api("/api/history", { method: "GET" });

  if (res.ok && data.ok) {
    renderHistory(data.items);
  }
}

async function loadPayments() {
  const { res, data } = await api("/api/payments", { method: "GET" });

  if (res.ok && data.ok) {
    renderPayments(data.items);
  }
}

async function loadPacks() {
  const { res, data } = await api("/api/packs", { method: "GET" });

  if (res.ok && data.ok) {
    renderPacks(data.packs);
  }
}

async function startCheckout(pack) {
  if (!authStatus) return;

  authStatus.textContent = "Ödeme sayfası hazırlanıyor...";

  const { res, data } = await api("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ pack })
  });

  if (!res.ok || !data.ok) {
    authStatus.textContent = data.error || "Checkout başlatılamadı.";
    return;
  }

  window.location.href = data.url;
}

async function checkPaymentResult() {
  if (!paymentBanner) return;

  const url = new URL(window.location.href);
  const payment = url.searchParams.get("payment");
  const sessionId = url.searchParams.get("session_id");

  if (!payment) return;

  paymentBanner.classList.remove("hidden");

  if (payment === "cancel") {
    paymentBanner.textContent = "Ödeme iptal edildi.";
    return;
  }

  if (payment === "success" && sessionId && getToken()) {
    paymentBanner.textContent = "Ödeme kontrol ediliyor...";

    const { res, data } = await api(
      `/api/payment/session-status?session_id=${encodeURIComponent(sessionId)}`,
      { method: "GET" }
    );

    if (res.ok && data.ok && data.paid) {
      paymentBanner.textContent = `Ödeme başarılı. ${data.payment.pack} paketi hesabına tanımlandı.`;
      updateUserUI(data.user);
      await loadPayments();
    } else {
      paymentBanner.textContent =
        "Ödeme başarılı görünüyor ama webhook henüz işlemedi. Sayfayı biraz sonra yenile.";
    }
  }

  window.history.replaceState({}, document.title, "/");
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (authStatus) authStatus.textContent = "Giriş yapılıyor...";

    const formData = new FormData(loginForm);
    const payload = {
      email: formData.get("email")?.toString().trim(),
      password: formData.get("password")?.toString().trim()
    };

    const { res, data } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!res.ok || !data.ok) {
      if (authStatus) authStatus.textContent = data.error || "Giriş başarısız.";
      return;
    }

    setToken(data.token);
    if (authStatus) authStatus.textContent = "Giriş başarılı.";
    loginForm.reset();
    updateUserUI(data.user);
    await Promise.all([loadHistory(), loadPacks(), loadPayments(), checkPaymentResult()]);
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (authStatus) authStatus.textContent = "Kayıt oluşturuluyor...";

    const formData = new FormData(registerForm);
    const payload = {
      email: formData.get("email")?.toString().trim(),
      password: formData.get("password")?.toString().trim()
    };

    const { res, data } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!res.ok || !data.ok) {
      if (authStatus) authStatus.textContent = data.error || "Kayıt başarısız.";
      return;
    }

    setToken(data.token);
    if (authStatus) authStatus.textContent = "Kayıt başarılı.";
    registerForm.reset();
    updateUserUI(data.user);
    await Promise.all([loadHistory(), loadPacks(), loadPayments(), checkPaymentResult()]);
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearToken();

    if (authStatus) authStatus.textContent = "Çıkış yapıldı.";
    if (generateStatus) generateStatus.textContent = "";
    if (output) output.textContent = "Burada sonuç görünecek.";

    if (paymentBanner) {
      paymentBanner.classList.add("hidden");
      paymentBanner.textContent = "";
    }

    if (headlineStatus) headlineStatus.textContent = "";
    if (headlineResult) headlineResult.textContent = "Burada alt başlıklar görünecek.";

    updateUserUI(null);
    renderHistory([]);
    renderPayments([]);

    if (packsList) {
      packsList.innerHTML = `<p class="muted">Giriş yaptıktan sonra paketler görünecek.</p>`;
    }
  });
}

if (messageForm) {
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (generateStatus) generateStatus.textContent = "Mesaj hazırlanıyor...";
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = "Oluşturuluyor...";
    }

    const formData = new FormData(messageForm);
    const payload = {
      target: formData.get("target")?.toString().trim(),
      gender: formData.get("gender")?.toString().trim(),
      goal: formData.get("goal")?.toString().trim(),
      tone: formData.get("tone")?.toString().trim(),
      context: formData.get("context")?.toString().trim()
    };

    const { res, data } = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!res.ok || !data.ok) {
      if (generateStatus) {
        generateStatus.textContent = data.error || "Mesaj üretilemedi.";
      }

      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = "Mesaj Oluştur";
      }
      return;
    }

    if (output) output.textContent = data.message;
    if (generateStatus) generateStatus.textContent = "Hazır.";
    updateUserUI(data.user);
    await loadHistory();

    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = "Mesaj Oluştur";
    }
  });
}

if (headlineBtn) {
  headlineBtn.addEventListener("click", async () => {
    const topic = topicInput?.value?.trim();

    if (!topic) {
      if (headlineStatus) headlineStatus.textContent = "Önce bir konu yaz.";
      return;
    }

    if (headlineStatus) headlineStatus.textContent = "Alt başlıklar hazırlanıyor...";
    headlineBtn.disabled = true;
    headlineBtn.textContent = "Üretiliyor...";

    try {
      const { res, data } = await api("/api/generate-headlines", {
        method: "POST",
        body: JSON.stringify({ topic })
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "İşlem başarısız.");
      }

      if (headlineResult) headlineResult.textContent = data.headlines;
      if (headlineStatus) headlineStatus.textContent = "Hazır.";
      updateUserUI(data.user);
    } catch (error) {
      if (headlineStatus) {
        headlineStatus.textContent = error.message || "Hata oluştu.";
      }
    } finally {
      headlineBtn.disabled = false;
      headlineBtn.textContent = "Alt başlık üret";
    }
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const text = output?.textContent?.trim();

    if (!text || text === "Burada sonuç görünecek.") return;

    try {
      await navigator.clipboard.writeText(text);
      if (generateStatus) generateStatus.textContent = "Mesaj kopyalandı.";
    } catch {
      if (generateStatus) generateStatus.textContent = "Kopyalama başarısız.";
    }
  });
}

loadMe().then(checkPaymentResult);