// ============================================================
// Global Error Handling
// ============================================================
window.addEventListener('error', function(e) {
  console.error('[Global Error]', e.error || e.message);
  return false;
});
window.addEventListener('unhandledrejection', function(e) {
  console.error('[Unhandled Rejection]', e.reason);
  e.preventDefault();
});

// ============================================================
// XSS Sanitizer
// ============================================================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// Loading State
// ============================================================
function showLoading(viewId) {
  const el = document.getElementById(viewId);
  if (!el) return;
  const skeleton = el.querySelector('.skeleton-loading');
  if (skeleton) skeleton.style.display = 'block';
}

function hideLoading(viewId) {
  const el = document.getElementById(viewId);
  if (!el) return;
  const skeleton = el.querySelector('.skeleton-loading');
  if (skeleton) skeleton.style.display = 'none';
}

// ============================================================
// Online/Offline Detection
// ============================================================
function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.style.display = 'none';
  } else {
    banner.style.display = 'block';
  }
}
window.addEventListener('online', function() {
  updateOnlineStatus();
  showToast('Connection restored.', 'success');
});
window.addEventListener('offline', function() {
  updateOnlineStatus();
  showToast('No internet connection. Changes are saved locally.', 'warning');
});

// ============================================================
// State Management
// ============================================================
const state = {
  loggedIn: localStorage.getItem('solar_logged_in') === 'true',
  username: localStorage.getItem('solar_username') || null,
  products: [],
  transactions: [],
  suppliers: [],
  customers: [],
  metrics: {},
  chartsData: {},
  prodPage: 1,
  prodLimit: 8,
  prodSearch: '',
  txPage: 1,
  txLimit: 999999,
  txSearch: '',
  txFilterType: '',
  txFilterCat: ''
};

let trendChartInstance = null;
let categoryChartInstance = null;

// ============================================================
// Local Data Store
// ============================================================
const SEED = {
  config: {
    admin_username: 'admin',
    admin_password: 'admin',
    email_smtp_server: 'smtp.gmail.com',
    email_smtp_port: 587,
    email_sender: '',
    email_password: '',
    email_recipient: '',
    whatsapp_recipient: '',
    whatsapp_phone_number_id: '',
    whatsapp_token: '',
    energy_peak_sun_hours: 5
  },
  products: [],
  suppliers: [],
  customers: [],
  transactions: []
};

// ============================================================
// Firebase Configuration
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBe3sxPrJoag0yW8wPCkT6svHDNNnTvgB8",
  authDomain: "new-high-energy-solar.firebaseapp.com",
  projectId: "new-high-energy-solar",
  storageBucket: "new-high-energy-solar.firebasestorage.app",
  messagingSenderId: "683671728194",
  appId: "1:683671728194:web:8d32b5786ece4e0a9efddb"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let dbReadyResolve;
const dbReadyPromise = new Promise(resolve => { dbReadyResolve = resolve; });
auth.signInAnonymously().catch(() => { dbReadyResolve(); });
auth.onAuthStateChanged(() => { dbReadyResolve(); });

async function loadDB() {
  try {
    const cfgDoc = await db.collection('config').doc('app_config').get();
    if (cfgDoc.exists) SEED.config = { ...SEED.config, ...cfgDoc.data() };
    const pSnap = await db.collection('products').doc('all').get();
    if (pSnap.exists) SEED.products = pSnap.data().items || SEED.products;
    const sSnap = await db.collection('suppliers').doc('all').get();
    if (sSnap.exists) SEED.suppliers = sSnap.data().items || SEED.suppliers;
    const cSnap = await db.collection('customers').doc('all').get();
    if (cSnap.exists) SEED.customers = cSnap.data().items || SEED.customers;
    const tSnap = await db.collection('transactions').doc('all').get();
    if (tSnap.exists) SEED.transactions = tSnap.data().items || SEED.transactions;
  } catch (e) {
    console.warn('Failed to load from Firestore, using seed data:', e);
  }
}

async function saveDB() {
  try {
    await db.collection('config').doc('app_config').set(SEED.config);
    await db.collection('products').doc('all').set({ items: SEED.products });
    await db.collection('suppliers').doc('all').set({ items: SEED.suppliers });
    await db.collection('customers').doc('all').set({ items: SEED.customers });
    await db.collection('transactions').doc('all').set({ items: SEED.transactions });
  } catch (e) {
    console.error('Failed to save to Firestore:', e);
    showToast('Failed to save data to cloud.', 'error');
  }
}

function genId(prefix) {
  const n = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  return prefix + n;
}

// ============================================================
// Toast System
// ============================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'x-circle';
  else if (type === 'warning') iconName = 'alert-triangle';
  const safeMsg = escHtml(message);
  toast.innerHTML = `<i data-lucide="${iconName}" style="width:18px;height:18px;"></i><span>${safeMsg}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// ============================================================
// Animated Counter
// ============================================================
function animateCounter(el, target, duration = 1500) {
  const start = performance.now();
  const initial = 0;
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(initial + (target - initial) * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target.toLocaleString();
  };
  requestAnimationFrame(update);
}

// ============================================================
// 3D Tilt Effect
// ============================================================
function initTiltEffect() {
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });
}

// ============================================================
// Particles
// ============================================================
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  const count = 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1
    });
  }
  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 193, 7, ${p.opacity})`;
      ctx.fill();
    });
    requestAnimationFrame(animateParticles);
  }
  animateParticles();
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// ============================================================
// Live Clock
// ============================================================
function startLiveClock() {
  function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options);
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const el = document.getElementById('header-date');
    if (el) el.innerHTML = `${dateStr} &middot; ${timeStr}`;
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// ============================================================
// Solar Energy Simulation
// ============================================================
let currentWeather = { icon: 'sun', temp: 32, desc: 'Clear Sky' };

let forecastPanelTypes = [];
let selectedPanelTypeIdx = 0;

function updateSolarEnergy(metrics, forecast) {
  const badge = document.getElementById('energy-weather-badge');
  if (badge) {
    const icons = { 'Clear Sky': 'sun', 'Partly Cloudy': 'cloud-sun', 'Overcast': 'cloud' };
    badge.innerHTML = `<i data-lucide="${icons[currentWeather.desc] || 'sun'}" style="width:12px;height:12px;"></i> ${currentWeather.desc}`;
    lucide.createIcons();
  }

  const types = (forecast && forecast.panel_types) || [];
  forecastPanelTypes = types;
  const selector = document.getElementById('panel-type-selector');
  if (!selector) return;

  if (types.length === 0) {
    selector.innerHTML = '<div style="padding:0.5rem;text-align:center;color:var(--text-muted);font-size:0.78rem;">No solar panels in inventory</div>';
    return;
  }

  let html = '';
  types.forEach((t, i) => {
    const active = i === selectedPanelTypeIdx ? ' pill-active' : '';
    html += `<button class="pill-btn${active}" data-idx="${i}">${t.name.replace(/Solar Panel/i, '').trim() || t.name}</button>`;
  });
  selector.innerHTML = html;

  selector.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selector.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('pill-active'));
      btn.classList.add('pill-active');
      selectedPanelTypeIdx = parseInt(btn.dataset.idx, 10);
      refreshEnergyMetrics();
    });
  });

  const kwSelect = document.getElementById('kw-select');
  if (kwSelect) {
    kwSelect.removeEventListener('change', refreshEnergyMetrics);
    kwSelect.addEventListener('change', refreshEnergyMetrics);
  }

  refreshEnergyMetrics();
}

function refreshEnergyMetrics() {
  const type = forecastPanelTypes[selectedPanelTypeIdx];
  if (!type) return;
  const kwSelect = document.getElementById('kw-select');
  const kw = Math.max(0.5, parseFloat((kwSelect && kwSelect.value) || '2') || 2);

  const production = document.getElementById('energy-production');
  const capacity = document.getElementById('energy-capacity');
  const co2 = document.getElementById('energy-co2');
  const efficiency = document.getElementById('energy-efficiency');

  const panelCount = Math.ceil((kw * 1000) / type.unit_watt);
  const daily = type.unit_daily_kwh * panelCount;
  if (production) animateCounter(production, Math.round(daily * 100) / 100);
  const totalAmps = (kw * 1000) / 230;
  if (capacity) capacity.textContent = Math.round(totalAmps) + ' A';
  if (co2) co2.textContent = Math.round(daily * 0.85) + ' kg';
  if (efficiency) efficiency.textContent = type.efficiency_pct + '%';
}

// ============================================================
// Weather Simulation
// ============================================================
function updateWeather() {
  const conditions = [
    { icon: 'sun', temp: 32, desc: 'Clear Sky', location: 'Solar Farm Alpha' },
    { icon: 'cloud-sun', temp: 28, desc: 'Partly Cloudy', location: 'Installation Site B' },
    { icon: 'cloud', temp: 24, desc: 'Overcast', location: 'Warehouse C' }
  ];
  const w = conditions[Math.floor(Math.random() * conditions.length)];
  currentWeather = w;
  const tempEl = document.getElementById('weather-temp');
  const descEl = document.getElementById('weather-desc');
  const locEl = document.getElementById('weather-location');
  if (tempEl) tempEl.textContent = w.temp + '°C';
  if (descEl) descEl.textContent = w.desc;
  if (locEl) locEl.textContent = w.location;
}

// ============================================================
// Init Helpers
// ============================================================

function populateCategoryOptions(extraCategory = '') {
  const fromProducts = [...new Set(state.products.map(p => p.category).filter(Boolean))];
  const categories = [...new Set([
    ...fromProducts,
    ...(extraCategory ? [extraCategory] : [])
  ])].sort();
  const categoryList = document.getElementById('prod-category-list');
  if (categoryList) {
    categoryList.innerHTML = categories.map(c => `<option value="${c}">`).join('');
  }
}

function populateTxCategoryFilter() {
  const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
  const select = document.getElementById('tx-category-filter');
  const currentVal = select.value;
  select.innerHTML =
    '<option value="">All Categories</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
  if (categories.includes(currentVal)) select.value = currentVal;
}

function showLogin() {
  document.getElementById('login-section').style.display = 'flex';
  document.getElementById('app-section').style.display = 'none';
}

function showApp() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('app-section').style.display = 'flex';
  updateUserProfile();
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('in-date').value = todayStr;
  document.getElementById('out-date').value = todayStr;
  loadContactsData().then(() => loadView('dashboard-view')).catch(() => loadView('dashboard-view'));
}

function logoutLocal() {
  state.loggedIn = false;
  state.username = null;
  localStorage.removeItem('solar_logged_in');
  localStorage.removeItem('solar_username');
  showLogin();
}

function updateUserProfile() {
  const username = state.username || 'Admin';
  const nameEl = document.getElementById('profile-name');
  const avatarEl = document.getElementById('profile-avatar');
  const roleEl = document.getElementById('profile-role');
  if (nameEl) nameEl.innerText = username;
  if (avatarEl) avatarEl.innerText = username.slice(0, 2).toUpperCase();
  if (roleEl) roleEl.innerText = 'Store Manager';
}

// ============================================================
// View Routing
// ============================================================
async function loadView(viewId) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const targetSec = document.getElementById(viewId);
  if (targetSec) targetSec.classList.add('active');
  document.querySelectorAll('.sidebar-nav li').forEach(item => {
    if (item.getAttribute('data-target') === viewId) item.classList.add('active');
    else item.classList.remove('active');
  });
  try {
    if (viewId === 'dashboard-view') await loadDashboardData();
    else if (viewId === 'products-view') await loadProductsData();
    else if (viewId === 'transactions-view') await loadTransactionsData();
    else if (viewId === 'reports-view') await loadReportsData();
    else if (viewId === 'settings-view') await loadSettingsData();
    else if (viewId === 'contacts-view') {
      await loadContactsData();
      renderContactsTables();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadContactsData() {
  state.suppliers = SEED.suppliers;
  state.customers = SEED.customers;
  populateContactDropdowns();
}

function populateContactDropdowns() {
  const suppSelect = document.getElementById('prod-supplier');
  const inSuppSelect = document.getElementById('in-supplier');
  const opts = (items) => '<option value="">Select Supplier...</option>' + items.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  if (suppSelect) suppSelect.innerHTML = opts(state.suppliers);
  if (inSuppSelect) inSuppSelect.innerHTML = opts(state.suppliers);
  const custList = document.getElementById('out-customer-list');
  if (custList) custList.innerHTML = state.customers.map(c => `<option value="${c.name}">`).join('');
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboardData() {
  updateWeather();
  const temp = currentWeather.temp;

  const products = SEED.products;
  const transactions = SEED.transactions;
  const today = new Date().toISOString().split('T')[0];

  const total_products = products.length;
  const available_stock = products.reduce((s, p) => s + p.quantity, 0);
  const low_stock_items = products.filter(p => p.quantity < p.minimum_stock && p.quantity > 0).length;
  const out_of_stock_items = products.filter(p => p.quantity === 0).length;
  const today_stock_in = transactions.filter(tx => tx.type === 'IN' && tx.date === today).reduce((s, tx) => s + tx.quantity, 0);
  const today_stock_out = transactions.filter(tx => tx.type === 'OUT' && tx.date === today).reduce((s, tx) => s + tx.quantity, 0);

  state.metrics = { total_products, available_stock, low_stock_items, out_of_stock_items, today_stock_in, today_stock_out };

  const metricIds = [
    { id: 'metric-total-products', val: total_products },
    { id: 'metric-available-stock', val: available_stock },
    { id: 'metric-low-stock', val: low_stock_items },
    { id: 'metric-out-stock', val: out_of_stock_items },
    { id: 'metric-today-in', val: today_stock_in },
    { id: 'metric-today-out', val: today_stock_out }
  ];

  metricIds.forEach(({ id, val }) => {
    const el = document.getElementById(id);
    if (el) animateCounter(el, val);
  });

  // Build forecast data from solar panel products
  const panelProducts = products.filter(p => p.category === 'Solar Panels' && p.unit_watt > 0);
  const forecast = { panel_types: panelProducts.map(p => ({
    id: p.id,
    name: p.name,
    unit_watt: p.unit_watt,
    unit_daily_kwh: p.unit_daily_kwh,
    efficiency_pct: p.efficiency_pct
  })) };

  updateSolarEnergy(state.metrics, forecast);

  // Build chart data from transactions
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().split('T')[0]);
  }

  const inData = last7.map(day => transactions.filter(tx => tx.type === 'IN' && tx.date === day).reduce((s, tx) => s + tx.quantity, 0));
  const outData = last7.map(day => transactions.filter(tx => tx.type === 'OUT' && tx.date === day).reduce((s, tx) => s + tx.quantity, 0));

  const dayLabels = last7.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });

  const catAcc = {};
  products.forEach(p => {
    catAcc[p.category] = (catAcc[p.category] || 0) + p.quantity;
  });

  state.chartsData = {
    in_out_trend: { labels: dayLabels, in: inData, out: outData },
    categories: catAcc
  };

  renderCharts();
}

function renderCharts() {
  const trendCtx = document.getElementById('trendChart');
  if (!trendCtx) return;
  const ctx = trendCtx.getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();
  const trendData = state.chartsData.in_out_trend;

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trendData.labels,
      datasets: [
        {
          label: 'Stock In',
          data: trendData.in,
          borderColor: '#22C55E',
          backgroundColor: 'rgba(34,197,94,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#22C55E',
          pointBorderColor: '#0F172A',
          pointBorderWidth: 2,
          pointRadius: 4,
          borderWidth: 2
        },
        {
          label: 'Stock Out',
          data: trendData.out,
          borderColor: '#FFC107',
          backgroundColor: 'rgba(255,193,7,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#FFC107',
          pointBorderColor: '#0F172A',
          pointBorderWidth: 2,
          pointRadius: 4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1200, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          labels: { color: '#94A3B8', font: { size: 11, family: 'Inter' }, usePointStyle: true, padding: 16 }
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#64748B', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#64748B', font: { size: 10 } },
          beginAtZero: true
        }
      }
    }
  });

  const catCtx = document.getElementById('categoryChart');
  if (!catCtx) return;
  const catC = catCtx.getContext('2d');
  if (categoryChartInstance) categoryChartInstance.destroy();
  const catData = state.chartsData.categories;
  const labels = Object.keys(catData);
  const values = Object.values(catData);

  categoryChartInstance = new Chart(catC, {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['No stock'],
      datasets: [{
        data: values.length > 0 ? values : [0],
        backgroundColor: ['#FFC107','#22C55E','#0EA5E9','#A855F7','#EC4899','#64748B'],
        borderWidth: 2,
        borderColor: '#0F172A'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      animation: { duration: 1200, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94A3B8', font: { size: 10, family: 'Inter' }, usePointStyle: true, padding: 12 }
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8
        }
      }
    }
  });
}

// ============================================================
// PRODUCTS
// ============================================================
async function loadProductsData() {
  state.products = SEED.products;
  populateCategoryOptions();
  populateTxCategoryFilter();
  renderProductStockSummary();
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '';
  let filtered = state.products.filter(p => {
    const q = state.prodSearch.toLowerCase();
    const matchSearch = (p.name || '').toLowerCase().includes(q) ||
                        (p.id || '').toLowerCase().includes(q) ||
                        (p.rack_location || '').toLowerCase().includes(q);
    return matchSearch;
  });
  const total = filtered.length;
  document.getElementById('prod-total-count').innerText = total;
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2.5rem;">No products found matching filters.</td></tr>`;
    document.getElementById('prod-page-start').innerText = '0';
    document.getElementById('prod-page-end').innerText = '0';
    document.getElementById('prod-prev-page').disabled = true;
    document.getElementById('prod-next-page').disabled = true;
    return;
  }
  const pages = Math.ceil(total / state.prodLimit);
  if (state.prodPage > pages) state.prodPage = pages || 1;
  const start = (state.prodPage - 1) * state.prodLimit;
  const end = Math.min(start + state.prodLimit, total);
  document.getElementById('prod-page-start').innerText = start + 1;
  document.getElementById('prod-page-end').innerText = end;
  document.getElementById('prod-prev-page').disabled = state.prodPage === 1;
  document.getElementById('prod-next-page').disabled = state.prodPage === pages;
  const paginated = filtered.slice(start, end);
  paginated.forEach(p => {
    const tr = document.createElement('tr');
    const isLowStock = p.quantity < p.minimum_stock;
    if (isLowStock) tr.className = 'low-stock-row';
    const warningBadge = isLowStock
      ? `<span class="warning-badge"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> LOW</span>`
      : '';
    tr.innerHTML = `
      <td data-label="ID" style="font-weight:600;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${p.image_path
            ? `<img src="${p.image_path}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;">`
            : `<div style="width:36px;height:36px;border-radius:8px;background:rgba(30,41,59,0.6);display:flex;align-items:center;justify-content:center;border:1px solid var(--border-color);"><i data-lucide="image" style="width:16px;height:16px;color:var(--text-muted);"></i></div>`}
          ${p.id}
        </div>
      </td>
      <td data-label="Name">${warningBadge}${p.name} ${p.model_capacity ? `<span style="font-size:0.8rem;color:var(--text-muted);">(${p.model_capacity})</span>` : ''}</td>
      <td data-label="Category">${p.category}</td>
      <td data-label="Brand">${p.brand}</td>
      <td data-label="Stock" style="font-weight:bold;">${p.quantity} <span style="font-size:0.75rem;font-weight:normal;color:var(--text-muted);">${p.unit}</span></td>
      <td data-label="Min">${p.minimum_stock}</td>
      <td data-label="Rack">${p.rack_location}</td>
      <td data-label="Supplier">${p.supplier}</td>
      <td style="text-align:center;">
        <div class="row-actions" style="justify-content:center;">
          <button class="icon-btn edit" onclick="openEditProductModal('${p.id}')"><i data-lucide="edit" style="width:14px;height:14px;"></i></button>
          <button class="icon-btn delete" onclick="deleteProductCall('${p.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function renderProductStockSummary() {
  const container = document.getElementById('product-stock-summary');
  if (!container) return;
  const panels = [
    { category: 'Solar Panels', icon: 'sun', color: '#FFC107', glow: 'rgba(255,193,7,0.12)' },
    { category: 'Inverters', icon: 'zap', color: '#22C55E', glow: 'rgba(34,197,94,0.12)' },
    { category: 'Batteries', icon: 'battery-charging', color: '#0EA5E9', glow: 'rgba(14,165,233,0.12)' },
    { category: 'Cables', icon: 'cable', color: '#A855F7', glow: 'rgba(168,85,247,0.12)' },
    { category: 'Accessories', icon: 'settings-2', color: '#64748B', glow: 'rgba(100,116,139,0.12)' },
  ];
  const priorityCategories = ['Solar Panels', 'Inverters'];
  const otherCategoriesPresent = [...new Set(state.products.map(p => p.category))].filter(c => !priorityCategories.includes(c));
  const categoriesToShow = [...priorityCategories, ...otherCategoriesPresent];
  let html = '';
  categoriesToShow.forEach(categoryName => {
    const panelCfg = panels.find(p => p.category === categoryName) ||
      { category: categoryName, icon: 'box', color: '#64748B', glow: 'rgba(100,116,139,0.12)' };
    const items = state.products.filter(p => p.category === categoryName);
    if (items.length === 0) return;
    const maxQty = Math.max(...items.map(p => p.quantity), 1);
    const totalQty = items.reduce((s, p) => s + p.quantity, 0);
    const itemRows = items.map(p => {
      const pct = Math.round((p.quantity / maxQty) * 100);
      const isLow = p.quantity < p.minimum_stock;
      const barColor = isLow ? '#EF4444' : panelCfg.color;
      const qtyLabel = isLow
        ? `<span style="color:#EF4444;font-weight:700;">${p.quantity}</span> <span style="font-size:0.7rem;color:#EF4444;">⚠ LOW</span>`
        : `<span style="color:${panelCfg.color};font-weight:700;">${p.quantity}</span>`;
      return `
        <div class="stock-summary-row">
          <div class="stock-summary-name" title="${p.name}">${p.name}</div>
          <div class="stock-summary-bar-wrap">
            <div class="stock-summary-bar" style="width:${pct}%;background:${barColor};"></div>
          </div>
          <div class="stock-summary-qty">${qtyLabel} <span style="font-size:0.7rem;color:var(--text-muted);">${p.unit}</span></div>
        </div>`;
    }).join('');
    html += `
      <div class="stock-summary-card" style="border-color:${panelCfg.color}22;box-shadow:0 0 12px ${panelCfg.glow};">
        <div class="stock-summary-header">
          <span style="color:${panelCfg.color};"><i data-lucide="${panelCfg.icon}" style="width:18px;height:18px;"></i></span>
          <span class="stock-summary-title" style="color:${panelCfg.color};">${categoryName}</span>
          <span class="stock-summary-total" style="background:${panelCfg.color}15;color:${panelCfg.color};">${totalQty} total</span>
        </div>
        <div class="stock-summary-items">${itemRows}</div>
      </div>`;
  });
  container.innerHTML = html || '<p style="color:var(--text-muted);font-size:0.9rem;">No products catalogued yet.</p>';
  lucide.createIcons();
}

function openEditProductModal(productId) {
  const p = state.products.find(prod => prod.id === productId);
  if (!p) return;
  document.getElementById('product-modal-title').innerText = 'Edit Product';
  document.getElementById('prod-mode').value = 'EDIT';
  populateCategoryOptions(p.category);
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-id').disabled = true;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-category').value = p.category || '';
  document.getElementById('prod-brand').value = p.brand;
  document.getElementById('prod-unit').value = p.unit;
  document.getElementById('prod-min').value = p.minimum_stock;
  document.getElementById('prod-supplier').value = p.supplier;
  document.getElementById('prod-location').value = p.rack_location;
  document.getElementById('prod-model').value = p.model_capacity || '';
  document.getElementById('prod-qty-group').style.display = 'none';
  document.getElementById('prod-qty').removeAttribute('required');
  document.getElementById('product-modal').style.display = 'flex';
}

async function deleteProductCall(productId) {
  if (!confirm(`Are you sure you want to delete product ID ${productId}?`)) return;
  const idx = SEED.products.findIndex(p => p.id === productId);
  if (idx !== -1) {
    SEED.products.splice(idx, 1);
    await saveDB();
    showToast('Product deleted successfully.');
    await loadProductsData();
  } else {
    showToast('Product not found.', 'error');
  }
}

// ============================================================
// TRANSACTIONS
// ============================================================
async function loadTransactionsData() {
  state.transactions = [...SEED.transactions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  state.products = SEED.products;
  populateTxCategoryFilter();
  populateTransactionsSelects();
  renderTransactionsTable();
}

function populateTransactionsSelects() {
  const inSelect = document.getElementById('in-product');
  const outSelect = document.getElementById('out-product');
  const optionsHtml = state.products.map(p => `<option value="${p.id}">${p.id} - ${p.name} (Stock: ${p.quantity})</option>`).join('');
  if (inSelect) inSelect.innerHTML = optionsHtml;
  if (outSelect) outSelect.innerHTML = optionsHtml;
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transactions-table-body');
  tbody.innerHTML = '';
  let filtered = state.transactions.filter(tx => {
    const q = state.txSearch.toLowerCase();
    const matchSearch = (tx.product_name || '').toLowerCase().includes(q) ||
                        (tx.product_id || '').toLowerCase().includes(q) ||
                        (tx.entity || '').toLowerCase().includes(q) ||
                        (tx.employee || '').toLowerCase().includes(q) ||
                        (tx.id || '').toLowerCase().includes(q);
    const matchType = state.txFilterType === '' || tx.type === state.txFilterType;
    const matchCat = state.txFilterCat === '' ||
      (state.products.find(p => p.id === tx.product_id)?.category === state.txFilterCat);
    return matchSearch && matchType && matchCat;
  });
  const total = filtered.length;
  document.getElementById('tx-total-count').innerText = total;
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2.5rem;">No transaction records found matching filters.</td></tr>`;
    document.getElementById('tx-page-start').innerText = '0';
    document.getElementById('tx-page-end').innerText = '0';
    document.getElementById('tx-prev-page').disabled = true;
    document.getElementById('tx-next-page').disabled = true;
    return;
  }
  const pages = Math.ceil(total / state.txLimit);
  if (state.txPage > pages) state.txPage = pages || 1;
  const start = (state.txPage - 1) * state.txLimit;
  const end = Math.min(start + state.txLimit, total);
  document.getElementById('tx-page-start').innerText = start + 1;
  document.getElementById('tx-page-end').innerText = end;
  document.getElementById('tx-prev-page').disabled = state.txPage === 1;
  document.getElementById('tx-next-page').disabled = state.txPage === pages;
  const paginated = filtered.slice(start, end);
  paginated.forEach(tx => {
    const tr = document.createElement('tr');
    const dateObj = new Date(tx.timestamp);
    const dateStr = tx.date + ' ' + dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const badgeClass = tx.type === 'IN' ? 'in' : 'out';
    const sign = tx.type === 'IN' ? '+' : '-';
    const label = tx.type === 'IN' ? 'STOCK IN' : 'STOCK OUT';
    const custSite = tx.type === 'IN' ? '-' : (tx.entity || '-');
    const empSupp = tx.type === 'IN' ? (tx.entity || '-') : (tx.employee || '-');
    tr.innerHTML = `
      <td data-label="TX ID" style="font-weight:600;">${tx.id}</td>
      <td data-label="Date">${dateStr}</td>
      <td data-label="Type"><span class="badge ${badgeClass}">${label}</span></td>
      <td data-label="Product"><span style="font-weight:500;">${tx.product_name}</span> <span style="font-size:0.75rem;color:var(--text-muted);">(${tx.product_id})</span></td>
      <td data-label="Qty" style="font-weight:bold;color:${tx.type === 'IN' ? 'var(--accent-green)' : 'var(--alert-red)'};">${sign}${tx.quantity}</td>
      <td data-label="Customer/Site">${custSite}</td>
      <td data-label="Employee/Supplier">${empSupp}</td>
      <td data-label="Remarks" style="font-style:italic;color:var(--text-secondary);font-size:0.85rem;">${tx.remarks || '-'}</td>`;
    tbody.appendChild(tr);
  });
}

// ============================================================
// REPORTS
// ============================================================
async function loadReportsData() {
  document.getElementById('email-stat-recipient').innerText = SEED.config.email_recipient || 'Demo Mode';
  document.getElementById('email-stat-server').innerText = SEED.config.email_smtp_server || 'Demo Mode';
  document.getElementById('wa-stat-recipient').innerText = SEED.config.whatsapp_recipient || 'Demo Mode';
  document.getElementById('wa-stat-phoneid').innerText = SEED.config.whatsapp_phone_number_id || 'Demo Mode';
}

function downloadReportFile(format) {
  const range = document.getElementById('report-range').value;
  // Client-side CSV export
  const txns = SEED.transactions;
  let filtered = txns;
  const now = new Date();
  if (range === 'daily') {
    const today = now.toISOString().split('T')[0];
    filtered = txns.filter(tx => tx.date === today);
  } else if (range === 'weekly') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const cutoff = weekAgo.toISOString().split('T')[0];
    filtered = txns.filter(tx => tx.date >= cutoff);
  } else if (range === 'monthly') {
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const cutoff = monthAgo.toISOString().split('T')[0];
    filtered = txns.filter(tx => tx.date >= cutoff);
  }

  if (format === 'csv') {
    const headers = ['ID', 'Type', 'Product ID', 'Product Name', 'Quantity', 'Entity', 'Date', 'Remarks'];
    const rows = filtered.map(tx => [tx.id, tx.type, tx.product_id, tx.product_name, tx.quantity, tx.entity || '', tx.date, tx.remarks || '']);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${range}_report_${now.toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Report downloaded as CSV!');
  } else {
    showToast('Serverless mode. PDF/Excel export is not available. Downloading CSV instead.', 'warning');
    downloadReportFile('csv');
  }
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettingsData() {
  document.getElementById('set-email-smtp').value = SEED.config.email_smtp_server || '';
  document.getElementById('set-email-port').value = SEED.config.email_smtp_port || 587;
  document.getElementById('set-email-sender').value = SEED.config.email_sender || '';
  document.getElementById('set-email-password').value = SEED.config.email_password || '';
  document.getElementById('set-email-recipient').value = SEED.config.email_recipient || '';
  document.getElementById('set-wa-recipient').value = SEED.config.whatsapp_recipient || '';
  document.getElementById('set-wa-phone-id').value = SEED.config.whatsapp_phone_number_id || '';
  document.getElementById('set-wa-token').value = SEED.config.whatsapp_token || '';
  document.getElementById('set-energy-sun').value = SEED.config.energy_peak_sun_hours || 5;
}

function updateStockOutAvailableHint() {
  const pId = document.getElementById('out-product').value;
  const p = state.products.find(prod => prod.id === pId);
  const hintEl = document.getElementById('out-available-hint');
  if (p) {
    hintEl.innerText = `Currently available stock: ${p.quantity} ${p.unit}`;
    document.getElementById('out-qty').setAttribute('max', p.quantity);
  } else {
    hintEl.innerText = '';
    document.getElementById('out-qty').removeAttribute('max');
  }
}

// ============================================================
// CONTACTS
// ============================================================
function renderContactsTables() {
  const sTbody = document.querySelector('#suppliers-table tbody');
  const cTbody = document.querySelector('#customers-table tbody');
  if (sTbody) {
    sTbody.innerHTML = state.suppliers.map(s => `
      <tr>
        <td data-label="Name" style="font-weight:500;">${s.name}</td>
        <td data-label="Contact">${s.contact_person || '-'}</td>
        <td data-label="Phone">${s.phone || '-'}</td>
        <td>
          <button class="icon-btn edit" onclick="openContactModal('supplier', '${s.id}')"><i data-lucide="edit" style="width:14px;height:14px;"></i></button>
          <button class="icon-btn delete" onclick="deleteContactCall('supplier', '${s.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </td>
      </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No suppliers found</td></tr>`;
  }
  if (cTbody) {
    cTbody.innerHTML = state.customers.map(c => `
      <tr>
        <td data-label="Name" style="font-weight:500;">${c.name}</td>
        <td data-label="Contact">${c.contact_person || '-'}</td>
        <td data-label="Phone">${c.phone || '-'}</td>
        <td>
          <button class="icon-btn edit" onclick="openContactModal('customer', '${c.id}')"><i data-lucide="edit" style="width:14px;height:14px;"></i></button>
          <button class="icon-btn delete" onclick="deleteContactCall('customer', '${c.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </td>
      </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No customers found</td></tr>`;
  }
  lucide.createIcons();
}

function openContactModal(type, id = null) {
  document.getElementById('contact-type').value = type;
  document.getElementById('contact-form').reset();
  if (id) {
    document.getElementById('contact-modal-title').innerText = `Edit ${type === 'supplier' ? 'Supplier' : 'Customer'}`;
    const list = type === 'supplier' ? state.suppliers : state.customers;
    const item = list.find(i => i.id === id);
    if (item) {
      document.getElementById('contact-id').value = item.id;
      document.getElementById('contact-name').value = item.name;
      document.getElementById('contact-person').value = item.contact_person || '';
      document.getElementById('contact-phone').value = item.phone || '';
      document.getElementById('contact-email').value = item.email || '';
      document.getElementById('contact-address').value = item.address || '';
    }
  } else {
    document.getElementById('contact-modal-title').innerText = `Add ${type === 'supplier' ? 'Supplier' : 'Customer'}`;
    document.getElementById('contact-id').value = '';
  }
  document.getElementById('contact-modal').style.display = 'flex';
}

async function deleteContactCall(type, id) {
  if (!confirm(`Are you sure you want to delete this ${type}?`)) return;
  const list = type === 'supplier' ? SEED.suppliers : SEED.customers;
  const idx = list.findIndex(i => i.id === id);
  if (idx !== -1) {
    list.splice(idx, 1);
    await saveDB();
    showToast(`${type === 'supplier' ? 'Supplier' : 'Customer'} deleted successfully.`);
    await loadContactsData();
    renderContactsTables();
  } else {
    showToast('Contact not found.', 'error');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Hamburger
  document.getElementById('hamburger-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
  });

  // Sidebar overlay click to close
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('active');
      document.getElementById('sidebar-overlay').classList.remove('active');
      const targetView = item.getAttribute('data-target');
      loadView(targetView);
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    try {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" style="width:18px;height:18px;animation:rotateSun 2s linear infinite;"></i> Signing In...';
      lucide.createIcons();
      const cfg = SEED.config;
      if (usernameInput.value === cfg.admin_username && passwordInput.value === cfg.admin_password) {
        state.loggedIn = true;
        state.username = cfg.admin_username;
        localStorage.setItem('solar_logged_in', 'true');
        localStorage.setItem('solar_username', cfg.admin_username);
        usernameInput.value = '';
        passwordInput.value = '';
        showToast('Login successful. Welcome back!');
        showApp();
      } else {
        throw new Error('Invalid username or password');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
      lucide.createIcons();
    }
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Logout
  document.getElementById('logout-button').addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out?')) {
      logoutLocal();
      showToast('Logged out successfully.');
    }
  });

  // Product search
  document.getElementById('product-search').addEventListener('input', (e) => {
    state.prodSearch = e.target.value;
    state.prodPage = 1;
    renderProductsTable();
  });

  // Product pagination
  document.getElementById('prod-prev-page').addEventListener('click', () => {
    if (state.prodPage > 1) { state.prodPage--; renderProductsTable(); }
  });
  document.getElementById('prod-next-page').addEventListener('click', () => {
    const total = state.products.filter(p => {
      const q = state.prodSearch.toLowerCase();
      const s = (p.name || '').toLowerCase().includes(q) ||
                (p.id || '').toLowerCase().includes(q) ||
                (p.rack_location || '').toLowerCase().includes(q);
      return s;
    }).length;
    const pages = Math.ceil(total / state.prodLimit);
    if (state.prodPage < pages) { state.prodPage++; renderProductsTable(); }
  });

  // Add product button
  document.getElementById('add-product-btn').addEventListener('click', () => {
    document.getElementById('product-modal-title').innerText = 'Add Product';
    document.getElementById('prod-mode').value = 'ADD';
    document.getElementById('product-form').reset();
    populateCategoryOptions();
    document.getElementById('prod-qty-group').style.display = 'block';
    document.getElementById('prod-qty').setAttribute('required', 'true');
    document.getElementById('prod-model').value = '';
    document.getElementById('prod-id').disabled = false;
    document.getElementById('product-modal').style.display = 'flex';
  });

  // Close modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(modal => { modal.style.display = 'none'; });
    });
  });

  // Product form submit
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('prod-mode').value;
    const id = document.getElementById('prod-id').value;
    const payload = {
      id: id.trim(),
      name: document.getElementById('prod-name').value.trim(),
      category: document.getElementById('prod-category').value.trim(),
      brand: document.getElementById('prod-brand').value.trim(),
      unit: document.getElementById('prod-unit').value.trim(),
      quantity: mode === 'ADD' ? parseInt(document.getElementById('prod-qty').value || 0) : 0,
      minimum_stock: parseInt(document.getElementById('prod-min').value),
      supplier: document.getElementById('prod-supplier').value.trim(),
      rack_location: document.getElementById('prod-location').value.trim(),
      model_capacity: document.getElementById('prod-model').value.trim(),
      image_path: '',
      unit_watt: 0,
      unit_daily_kwh: 0,
      efficiency_pct: 0
    };
    try {
      if (mode === 'ADD') {
        const exists = SEED.products.find(p => p.id === payload.id);
        if (exists) throw new Error('Product ID already exists');
        SEED.products.push(payload);
        await saveDB();
        showToast('Product added successfully.');
      } else {
        const idx = SEED.products.findIndex(p => p.id === id);
        if (idx === -1) throw new Error('Product not found');
        const current = SEED.products[idx];
        payload.quantity = current.quantity;
        payload.image_path = current.image_path || '';
        payload.unit_watt = current.unit_watt || 0;
        payload.unit_daily_kwh = current.unit_daily_kwh || 0;
        payload.efficiency_pct = current.efficiency_pct || 0;
        SEED.products[idx] = payload;
        await saveDB();
        showToast('Product updated successfully.');
      }
      document.getElementById('product-modal').style.display = 'none';
      await loadProductsData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Transaction search/filter
  document.getElementById('tx-search').addEventListener('input', (e) => {
    state.txSearch = e.target.value;
    state.txPage = 1;
    renderTransactionsTable();
  });
  document.getElementById('tx-type-filter').addEventListener('change', (e) => {
    state.txFilterType = e.target.value;
    state.txPage = 1;
    renderTransactionsTable();
  });
  document.getElementById('tx-category-filter').addEventListener('change', (e) => {
    state.txFilterCat = e.target.value;
    state.txPage = 1;
    renderTransactionsTable();
  });

  // Transaction pagination
  document.getElementById('tx-prev-page').addEventListener('click', () => {
    if (state.txPage > 1) { state.txPage--; renderTransactionsTable(); }
  });
  document.getElementById('tx-next-page').addEventListener('click', () => {
    const total = state.transactions.filter(tx => {
      const q = state.txSearch.toLowerCase();
      const s = (tx.product_name || '').toLowerCase().includes(q) ||
                (tx.product_id || '').toLowerCase().includes(q) ||
                (tx.entity || '').toLowerCase().includes(q) ||
                (tx.employee || '').toLowerCase().includes(q) ||
                (tx.id || '').toLowerCase().includes(q);
      const t = state.txFilterType === '' || tx.type === state.txFilterType;
      const c = state.txFilterCat === '' ||
        (state.products.find(p => p.id === tx.product_id)?.category === state.txFilterCat);
      return s && t && c;
    }).length;
    const pages = Math.ceil(total / state.txLimit);
    if (state.txPage < pages) { state.txPage++; renderTransactionsTable(); }
  });

  // Stock In/Out buttons
  document.getElementById('stock-in-btn').addEventListener('click', () => {
    if (state.products.length === 0) { showToast('Please add products first', 'warning'); return; }
    document.getElementById('stock-in-form').reset();
    document.getElementById('in-date').value = new Date().toISOString().split('T')[0];
    populateTransactionsSelects();
    document.getElementById('stock-in-modal').style.display = 'flex';
  });
  document.getElementById('stock-out-btn').addEventListener('click', () => {
    if (state.products.length === 0) { showToast('Please add products first', 'warning'); return; }
    document.getElementById('stock-out-form').reset();
    document.getElementById('out-date').value = new Date().toISOString().split('T')[0];
    populateTransactionsSelects();
    updateStockOutAvailableHint();
    document.getElementById('stock-out-modal').style.display = 'flex';
  });

  document.getElementById('out-product').addEventListener('change', updateStockOutAvailableHint);

  // Stock In form
  document.getElementById('stock-in-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('in-product').value;
    const qty = parseInt(document.getElementById('in-qty').value);
    const supplier = document.getElementById('in-supplier').value;
    const date = document.getElementById('in-date').value;
    const remarks = document.getElementById('in-remarks').value;
    try {
      const product = SEED.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');
      product.quantity += qty;
      const tx = {
        id: genId('T'),
        type: 'IN',
        product_id: productId,
        product_name: product.name,
        quantity: qty,
        entity: supplier,
        date: date,
        remarks: remarks,
        timestamp: new Date().toISOString()
      };
      SEED.transactions.push(tx);
      await saveDB();
      showToast('Stock in recorded successfully.');
      document.getElementById('stock-in-modal').style.display = 'none';
      await loadTransactionsData();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Stock Out form
  document.getElementById('stock-out-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('out-product').value;
    const qty = parseInt(document.getElementById('out-qty').value);
    const customerName = document.getElementById('out-customer').value.trim();
    const employee = document.getElementById('out-employee').value;
    const date = document.getElementById('out-date').value;
    const remarks = document.getElementById('out-remarks').value;
    try {
      if (!customerName) throw new Error('Customer / Project Site name is required');
      const product = SEED.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');
      if (product.quantity < qty) throw new Error('Insufficient stock');
      product.quantity -= qty;
      const existingCust = SEED.customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
      if (!existingCust) {
        SEED.customers.push({
          id: genId('C'),
          name: customerName,
          contact_person: '',
          phone: '',
          email: '',
          address: ''
        });
      }
      const tx = {
        id: genId('T'),
        type: 'OUT',
        product_id: productId,
        product_name: product.name,
        quantity: qty,
        entity: customerName,
        employee: employee,
        date: date,
        remarks: remarks,
        timestamp: new Date().toISOString()
      };
      SEED.transactions.push(tx);
      await saveDB();
      showToast('Stock out recorded successfully.');
      document.getElementById('stock-out-modal').style.display = 'none';
      await loadContactsData();
      await loadTransactionsData();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Report exports
  document.getElementById('export-pdf-btn').addEventListener('click', () => downloadReportFile('pdf'));
  document.getElementById('export-xlsx-btn').addEventListener('click', () => downloadReportFile('xlsx'));

  // Email test (stub - demo mode)
  document.getElementById('trigger-email-test').addEventListener('click', async () => {
    showToast('Serverless mode. Email sending is not available. Configure a backend to use this feature.', 'warning');
  });

  // Weekly email test (stub)
  document.getElementById('trigger-email-test-weekly').addEventListener('click', async () => {
    showToast('Serverless mode. Email sending is not available. Configure a backend to use this feature.', 'warning');
  });

  // WhatsApp test send (stub)
  document.getElementById('trigger-wa-test').addEventListener('click', async () => {
    showToast('Serverless mode. WhatsApp sending is not available. Configure a backend to use this feature.', 'warning');
  });

  // Settings email form
  document.getElementById('settings-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    SEED.config.email_smtp_server = document.getElementById('set-email-smtp').value;
    SEED.config.email_smtp_port = parseInt(document.getElementById('set-email-port').value) || 587;
    SEED.config.email_sender = document.getElementById('set-email-sender').value;
    SEED.config.email_password = document.getElementById('set-email-password').value;
    SEED.config.email_recipient = document.getElementById('set-email-recipient').value;
    await saveDB();
    showToast('Email configuration saved (local only).');
    await loadSettingsData();
  });

  // WhatsApp Settings form
  document.getElementById('settings-wa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    SEED.config.whatsapp_recipient = document.getElementById('set-wa-recipient').value;
    SEED.config.whatsapp_phone_number_id = document.getElementById('set-wa-phone-id').value;
    SEED.config.whatsapp_token = document.getElementById('set-wa-token').value;
    await saveDB();
    showToast('WhatsApp configuration saved (local only).');
    await loadSettingsData();
  });

  // Energy forecast form
  document.getElementById('settings-energy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    SEED.config.energy_peak_sun_hours = parseFloat(document.getElementById('set-energy-sun').value) || 5;
    await saveDB();
    showToast('Energy settings saved.');
    await loadSettingsData();
  });
}

// ============================================================
// Contact form listener (separate from setupEventListeners)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = document.getElementById('contact-type').value;
      const existingId = document.getElementById('contact-id').value;
      const payload = {
        id: existingId || genId(type === 'supplier' ? 'S' : 'C'),
        name: document.getElementById('contact-name').value,
        contact_person: document.getElementById('contact-person').value,
        phone: document.getElementById('contact-phone').value,
        email: document.getElementById('contact-email').value,
        address: document.getElementById('contact-address').value
      };
      try {
        const list = type === 'supplier' ? SEED.suppliers : SEED.customers;
        if (existingId) {
          const idx = list.findIndex(i => i.id === existingId);
          if (idx !== -1) list[idx] = payload;
          else throw new Error('Contact not found');
        } else {
          list.push(payload);
        }
        await saveDB();
        showToast(`${type === 'supplier' ? 'Supplier' : 'Customer'} saved successfully.`);
        document.getElementById('contact-modal').style.display = 'none';
        await loadContactsData();
        renderContactsTables();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
  const btnAddSup = document.getElementById('btn-add-supplier');
  if (btnAddSup) btnAddSup.addEventListener('click', () => openContactModal('supplier'));
  const btnAddCust = document.getElementById('btn-add-customer');
  if (btnAddCust) btnAddCust.addEventListener('click', () => openContactModal('customer'));
});

// ============================================================
// Theme Toggle
// ============================================================
function loadTheme() {
  const saved = localStorage.getItem('solar_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.setAttribute('data-lucide', saved === 'dark' ? 'moon' : 'sun');
    lucide.createIcons();
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('solar_theme', next);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.setAttribute('data-lucide', next === 'dark' ? 'moon' : 'sun');
    lucide.createIcons();
  }
  showToast(`Switched to ${next} mode`, 'success');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await dbReadyPromise;
  await loadDB();
  loadTheme();
  startLiveClock();
  initParticles();
  updateOnlineStatus();
  if (state.loggedIn) {
    showApp();
  } else {
    showLogin();
  }
  setupEventListeners();
  lucide.createIcons();
  setTimeout(initTiltEffect, 500);
}
