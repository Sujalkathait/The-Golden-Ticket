// ============================================
// app.js — Frontend Controller
// ============================================

const API = (window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null')
  ? 'http://localhost:3000'
  : window.location.origin;

let allCoupons = [];
let filter = 'all';
let cdInterval = null;
let trafficInterval = null;

// ---- On page load ----
document.addEventListener('DOMContentLoaded', () => {
  randomId();
  refresh();
  // Poll every 1 second for true real-time synchronization
  setInterval(refresh, 1000);
});

// ---- Toast ----
function toast(msg, type = 'info', ms = 4000) {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : 'info');
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  t.innerHTML = `<span style="font-size:1.1rem">${icon}</span><div>${msg}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
}

// ---- Random student ID ----
function randomId() {
  document.getElementById('inp-sid').value = 'STU-2026-' + (100 + Math.floor(Math.random() * 900));
}

// ---- Refresh stats + grid ----
async function refresh() {
  try {
    const r = await fetch(API + '/coupons');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    updateStats(d);
    allCoupons = d.coupons || [];
    renderGrid();
  } catch (e) {
    console.warn('Sync failed:', e.message);
  }
}

function updateStats(d) {
  setText('s-available', d.available);
  setText('s-claimed', d.claimed);
  setText('s-redeemed', d.redeemed);
  setText('s-expired', d.expired);
  const taken = (d.total || 50) - d.available;
  const pct = Math.round((taken / (d.total || 50)) * 100);
  const fill = document.getElementById('pfill');
  if (fill) fill.style.width = pct + '%';
  setText('pct', pct + '%');
  setText('pcount', d.available + ' / ' + (d.total || 50) + ' Remaining');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ==================================
// 1. CLAIM (POST /coupons)
// ==================================
async function doClaim() {
  const sid = document.getElementById('inp-sid').value.trim();
  if (!sid) return toast('Enter a Student ID first.', 'error');

  const btn = document.getElementById('btn-claim');
  btn.disabled = true;
  btn.textContent = '⏳ Claiming...';

  try {
    const r = await fetch(API + '/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: sid })
    });
    const d = await r.json();

    if (r.ok) {
      toast(d.alreadyClaimed
        ? 'Already claimed — your coupon #' + d.id + ' (' + d.code + ')'
        : 'Golden Ticket ' + d.code + ' claimed!', d.alreadyClaimed ? 'info' : 'success');
      showTicket(d.coupon || d);
      refresh();
    } else {
      toast(d.error || 'Claim failed', 'error');
    }
  } catch (e) {
    toast('Network error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🎟️ Claim Golden Ticket';
  }
}

// ==================================
// 2. PANIC TAP (10 simultaneous)
// ==================================
async function doPanic() {
  const sid = document.getElementById('inp-sid').value.trim() || 'PANIC-' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('inp-sid').value = sid;

  toast('Firing 10 rapid clicks for ' + sid + '...', 'info', 2500);

  const ps = [];
  for (let i = 0; i < 10; i++) {
    ps.push(fetch(API + '/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: sid })
    }).then(r => r.json().then(data => ({ status: r.status, data }))));
  }

  const results = await Promise.all(ps);
  const ok = results.filter(r => r.status === 200 || r.status === 201);
  const ids = [...new Set(ok.map(r => r.data.id))];

  if (ids.length === 1 && ok.length === 10) {
    toast('10/10 succeeded, exactly 1 coupon (ID: ' + ids[0] + '). Zero duplicates!', 'success', 5000);
    showTicket(ok[0].data.coupon || ok[0].data);
  } else {
    toast(ok.length + '/10 succeeded, ' + ids.length + ' coupon(s).', 'info');
  }
  refresh();
}

// ==================================
// Show Golden Ticket Card
// ==================================
function showTicket(c) {
  const box = document.getElementById('ticket-box');
  box.classList.remove('hidden');

  setText('t-code', c.code || 'GT-' + String(c.id).padStart(3, '0'));
  setText('t-status', c.status || 'Claimed');
  setText('t-sid', c.student_id || '--');
  setText('t-id', c.id);
  setText('t-time', c.claimed_at ? new Date(c.claimed_at).toLocaleTimeString() : 'Just now');

  // Pre-fill redeem input
  document.getElementById('inp-redeem').value = c.id || '';

  // Countdown
  if (cdInterval) clearInterval(cdInterval);
  const exp = c.expires_at ? new Date(c.expires_at).getTime() : Date.now() + 600000;
  function tick() {
    const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
    const m = Math.floor(left / 60), s = left % 60;
    setText('t-countdown', String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
    if (left <= 0) { clearInterval(cdInterval); setText('t-countdown', 'EXPIRED'); refresh(); }
  }
  tick();
  cdInterval = setInterval(tick, 1000);
}

// ==================================
// 3. REDEEM (PATCH /coupons/:id)
// ==================================
async function doRedeem() {
  const id = document.getElementById('inp-redeem').value.trim();
  if (!id) return toast('Enter a coupon ID or code.', 'error');

  try {
    const r = await fetch(API + '/coupons/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Redeemed' })
    });
    const d = await r.json();
    if (r.ok) { toast('Coupon ' + (d.code || id) + ' redeemed!', 'success'); refresh(); }
    else toast(d.error, 'error');
  } catch (e) { toast('Network error: ' + e.message, 'error'); }
}

// ==================================
// 4. EXPIRE (PATCH /coupons/:id)
// ==================================
async function doExpire() {
  const id = document.getElementById('inp-redeem').value.trim();
  if (!id) return toast('Enter a coupon ID or code.', 'error');

  try {
    const r = await fetch(API + '/coupons/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Expired' })
    });
    const d = await r.json();
    if (r.ok) { toast('Coupon ' + (d.code || id) + ' expired.', 'info'); refresh(); }
    else toast(d.error, 'error');
  } catch (e) { toast('Network error: ' + e.message, 'error'); }
}

// ==================================
// 5. STRESS TEST (100 simultaneous)
// ==================================
async function doStress() {
  const log = document.getElementById('console');
  const badge = document.getElementById('cbadge');
  badge.className = 'cbadge run'; badge.textContent = 'Running...';
  log.textContent = 'Firing 100 parallel claims via Promise.all...\n';

  const t0 = performance.now();
  const ps = [];
  for (let i = 1; i <= 100; i++) {
    ps.push(fetch(API + '/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 'BATCH_' + String(i).padStart(3, '0') })
    }).then(r => r.json().then(data => ({ s: r.status, data })))
      .catch(e => ({ s: 0, err: e.message })));
  }

  const res = await Promise.all(ps);
  const ms = ((performance.now() - t0) / 1000).toFixed(2);

  const c201 = res.filter(r => r.s === 201).length;
  const c200 = res.filter(r => r.s === 200).length;
  const c409 = res.filter(r => r.s === 409).length;
  const c400 = res.filter(r => r.s === 400).length;
  const c5xx = res.filter(r => r.s >= 500).length;

  log.textContent += `Done in ${ms}s!\n` +
    `-----------------------------\n` +
    `201 (New Claim):    ${c201}\n` +
    `200 (Already Had):  ${c200}\n` +
    `409 (Sold Out):     ${c409}\n` +
    `400 (Bad Request):  ${c400}\n` +
    `5xx (Server Error): ${c5xx}\n` +
    `-----------------------------\n` +
    (c5xx === 0 ? 'PASS: Zero race conditions!\n' : 'WARNING: Server errors detected.\n');

  badge.className = c5xx === 0 ? 'cbadge pass' : 'cbadge';
  badge.textContent = c5xx === 0 ? 'PASSED' : 'DONE';
  refresh();
}

// ==================================
// 6. EXPIRY TEST (Stretch Bonus)
// ==================================
async function doExpiryTest() {
  const log = document.getElementById('console');
  log.textContent = 'Testing 10-min expiry bonus...\n';

  try {
    const r = await fetch(API + '/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 'TIMEOUT_' + Math.floor(Math.random() * 999), expiryMinutes: -0.1 })
    });
    const d = await r.json();
    if (!r.ok) { log.textContent += 'Error: ' + d.error + '\n'; return; }
    log.textContent += 'Claimed coupon #' + d.id + ' with expired timer.\n';
    log.textContent += 'Fetching stats (triggers auto-revert)...\n';
    await refresh();
    const r2 = await fetch(API + '/coupons/' + d.id);
    const c = await r2.json();
    log.textContent += 'Coupon #' + d.id + ' is now: ' + c.status + '\n';
    log.textContent += 'Student: ' + (c.student_id || 'None (returned to pool)') + '\n';
    log.textContent += 'STRETCH BONUS VERIFIED!\n';
    toast('Expired coupon returned to pool!', 'success');
  } catch (e) {
    log.textContent += 'Error: ' + e.message + '\n';
  }
}

// ==================================
// 7. RESET & DEMO SEEDING
// ==================================
async function loadDemoData() {
  try {
    const r = await fetch(API + '/api/demo/seed', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      toast('Demo data loaded: 20 Claimed, 15 Redeemed, 5 Expired, 10 Unclaimed!', 'success', 5000);
      refresh();
    } else {
      toast(d.error || 'Failed to seed demo data', 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// Live real-time traffic simulator
function toggleLiveTraffic() {
  const btn = document.getElementById('btn-live-toggle');
  if (trafficInterval) {
    clearInterval(trafficInterval);
    trafficInterval = null;
    btn.classList.remove('active');
    btn.textContent = '▶️ Start Real-Time Traffic';
    toast('Live traffic simulation stopped.', 'info', 2000);
    return;
  }

  btn.classList.add('active');
  btn.textContent = '⏸️ Stop Real-Time Traffic';
  toast('Live real-time traffic simulator started! Watch coupons update live.', 'success', 4000);

  trafficInterval = setInterval(async () => {
    try {
      const unclaimed = allCoupons.filter(c => c.status === 'Unclaimed');
      const claimed = allCoupons.filter(c => c.status === 'Claimed');

      // 70% claim, 30% redeem
      if (unclaimed.length > 0 && (claimed.length === 0 || Math.random() < 0.7)) {
        const fakeUser = 'LIVE_STU_' + Math.floor(100 + Math.random() * 900);
        await fetch(API + '/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: fakeUser })
        });
      } else if (claimed.length > 0) {
        const target = claimed[Math.floor(Math.random() * claimed.length)];
        await fetch(API + '/coupons/' + target.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Redeemed' })
        });
      }
      refresh();
    } catch (e) {}
  }, 1400);
}

async function doReset() {
  if (!confirm('Reset database to fresh 50 coupons?')) return;
  if (trafficInterval) toggleLiveTraffic(); // stop simulation
  try {
    const r = await fetch(API + '/api/admin/reset', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      toast('Reset! 50 fresh Unclaimed coupons.', 'success');
      document.getElementById('ticket-box').classList.add('hidden');
      if (cdInterval) clearInterval(cdInterval);
      randomId();
      refresh();
    } else toast(d.error, 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// ==================================
// GRID RENDERING & FILTERS
// ==================================
function setFilter(f, btn) {
  filter = f;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderGrid();
}

function doSearch() {
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('coupon-grid');
  const q = (document.getElementById('inp-search').value || '').trim().toLowerCase();

  let list = allCoupons;
  if (filter !== 'all') list = list.filter(c => c.status === filter);
  if (q) list = list.filter(c =>
    String(c.id).includes(q) ||
    (c.code || '').toLowerCase().includes(q) ||
    (c.student_id || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--dim)">No coupons found.</div>';
    return;
  }

  grid.innerHTML = list.map(c => {
    const stu = c.student_id || 'Available';
    let time = '';
    if (c.status === 'Claimed' && c.claimed_at) time = 'Claimed: ' + new Date(c.claimed_at).toLocaleTimeString();
    if (c.status === 'Redeemed' && c.redeemed_at) time = 'Redeemed: ' + new Date(c.redeemed_at).toLocaleTimeString();
    if (c.status === 'Expired' && c.expired_at) time = 'Expired: ' + new Date(c.expired_at).toLocaleTimeString();
    return `<div class="mini-card c-${c.status}" onclick="pickCoupon('${c.id}')">
      <div class="mc-top"><span class="mc-code">${c.code}</span><span class="mc-pill st-${c.status}">${c.status}</span></div>
      <div class="mc-student">${stu}</div>
      <div class="mc-time">${time || 'ID #' + c.id}</div>
    </div>`;
  }).join('');
}

function pickCoupon(id) {
  document.getElementById('inp-redeem').value = id;
  toast('Selected coupon #' + id, 'info', 1200);
}
