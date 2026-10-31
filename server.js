// ============================================================
// server.js — Golden Ticket Express Server (Express 4)
// ============================================================
// Endpoints the testing dashboard expects:
//   GET   /coupons      → View stock + all coupons
//   POST  /coupons      → Claim/Reserve a coupon
//   PATCH /coupons/:id  → Update status (Redeemed / Expired)
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// 1. FRESH DATABASE ON EVERY SERVER START (Rule #5 & #7)
// ==========================================================
db.initDatabase();

// Background cron: auto-revert 10-min expired claims (Stretch Bonus +10)
setInterval(() => {
  try { db.revertExpiredClaims(); } catch (e) {}
}, 5000);

// ==========================================================
// 2. CORS — MANDATORY (allow ALL origins, methods, headers)
// ==========================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With']
}));

// Bulletproof manual CORS fallback for all endpoints & OPTIONS preflights
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// ==========================================================
// 3. PARSE JSON BODIES (Rule #1: all requests use JSON)
// ==========================================================
app.use(express.json());

// ==========================================================
// 4. SERVE FRONTEND STATIC FILES
// ==========================================================
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// HELPER: Extract student_id from request body (Rule #2)
// Accepts any common field name the dashboard might send
// ==========================================================
function getStudentId(body) {
  if (!body) return '';
  return body.student_id || body.studentId || body.studentID
      || body.sid || body.userId || body.user_id || body.user || body.student || '';
}

function getRequestedCoupon(body) {
  if (!body) return '';
  return body.couponId || body.coupon_id || body.itemId || body.item_id || body.item || body.code || '';
}

// ==========================================================
// ROUTE 1: GET /coupons — View all coupons + available count
// Dashboard check: "view response has stock number"
// ==========================================================
function handleGetCoupons(req, res) {
  try {
    const stats = db.getStats();
    const coupons = db.getAllCoupons(req.query.status);
    return res.status(200).json({
      success: true,
      total: stats.total,
      available: stats.available,           // <-- stock number
      availableCount: stats.available,      // alias
      remaining: stats.available,           // alias
      claimed: stats.claimed,
      redeemed: stats.redeemed,
      expired: stats.expired,
      coupons: coupons
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Route handlers for View
app.get('/coupons', handleGetCoupons);
app.get('/api/coupons', handleGetCoupons);
app.get('/api/view', handleGetCoupons);
app.get('/view', handleGetCoupons);

// Stats-only endpoint
app.get('/api/coupons/stats', (req, res) => {
  try {
    return res.status(200).json(db.getStats());
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Single coupon lookup
app.get(['/coupons/:id', '/api/coupons/:id', '/api/view/:id'], (req, res) => {
  try {
    const coupon = db.getCoupon(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found: ' + req.params.id });
    return res.status(200).json(coupon);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ==========================================================
// ROUTE 2: POST /coupons — Claim/Reserve a coupon
// ==========================================================
function handleClaim(req, res) {
  try {
    const studentId = getStudentId(req.body);
    if (!studentId) {
      return res.status(400).json({
        error: 'Missing student ID. Send student_id or userId in JSON body.'
      });
    }

    const requestedCoupon = getRequestedCoupon(req.body);
    const expiryMins = req.body.expiryMinutes;
    const result = db.claimCoupon(studentId, requestedCoupon, expiryMins);
    const stats = db.getStats();

    // Return record ID (Rule #3)
    return res.status(result.alreadyClaimed ? 200 : 201).json({
      success: true,
      message: result.alreadyClaimed
        ? 'Already claimed — returning your existing coupon.'
        : 'Golden Ticket claimed successfully!',
      id: result.coupon.id,                 // <-- record ID (mandatory)
      code: result.coupon.code,
      status: result.coupon.status,
      student_id: result.coupon.student_id,
      userId: result.coupon.student_id,
      claimed_at: result.coupon.claimed_at,
      expires_at: result.coupon.expires_at,
      alreadyClaimed: result.alreadyClaimed,
      available: stats.available,
      availableCount: stats.available,
      remaining: stats.available,
      coupon: result.coupon
    });
  } catch (e) {
    // Failures MUST return 4xx, never 200 (Rule #3 reminder)
    const status = e.statusCode || 400;
    return res.status(status).json({ error: e.message });
  }
}

app.post('/coupons', handleClaim);
app.post('/api/coupons', handleClaim);
app.post('/api/reserve', handleClaim);
app.post('/reserve', handleClaim);
app.post('/api/coupons/claim', handleClaim);
app.post('/coupons/claim', handleClaim);
app.post('/claim', handleClaim);

// ==========================================================
// ROUTE 3: PATCH /coupons/:id — Update status
// ==========================================================
function handlePatch(req, res) {
  try {
    const newStatus = req.body.status;
    const identifier = req.params.id || req.body.id || req.body.couponId;

    if (!identifier) {
      return res.status(400).json({ error: "Missing coupon ID in URL or body." });
    }

    if (!newStatus) {
      return res.status(400).json({
        error: "Missing 'status' in body. Use: Claimed, Redeemed, or Expired."
      });
    }

    const updated = db.updateStatus(identifier, newStatus);
    const stats = db.getStats();

    return res.status(200).json({
      success: true,
      message: 'Status updated to ' + updated.status,
      id: updated.id,
      code: updated.code,
      status: updated.status,
      student_id: updated.student_id,
      available: stats.available,
      coupon: updated
    });
  } catch (e) {
    const status = e.statusCode || 400;
    return res.status(status).json({ error: e.message });
  }
}

app.patch('/coupons/:id', handlePatch);
app.patch('/api/coupons/:id', handlePatch);
app.patch('/api/status/:id', handlePatch);
app.patch('/status/:id', handlePatch);
app.patch('/api/status', handlePatch);
app.patch('/status', handlePatch);
app.patch('/coupons', handlePatch);

// Shorthand redeem
app.patch('/api/coupons/:id/redeem', (req, res) => {
  req.body.status = 'Redeemed';
  handlePatch(req, res);
});

// ==========================================================
// EXTRA ROUTES (PUT, DELETE, admin reset, health)
// ==========================================================
app.put('/api/coupons/:id', (req, res) => {
  try {
    const coupon = db.getCoupon(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
    return res.status(200).json({ success: true, coupon });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }
});

app.delete('/coupons/:id', (req, res) => {
  try {
    const result = db.resetCoupon(req.params.id);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }
});

app.delete('/api/coupons/:id', (req, res) => {
  try {
    const result = db.resetCoupon(req.params.id);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }
});

// Reset entire database fresh
app.post('/api/admin/reset', (req, res) => {
  try {
    db.initDatabase();
    return res.status(200).json({
      success: true,
      message: 'Database reset. 50 fresh Unclaimed coupons.',
      stats: db.getStats()
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Seed realistic demo data for presentations & live testing
app.post(['/api/demo/seed', '/demo/seed', '/api/seed'], (req, res) => {
  try {
    const stats = db.seedDemoData();
    return res.status(200).json({
      success: true,
      message: 'Demo data loaded (20 Claimed, 15 Redeemed, 5 Expired, 10 Unclaimed).',
      stats: stats
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  const stats = db.getStats();
  return res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    available: stats.available,
    total: stats.total
  });
});

// ==========================================================
// START SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log('');
  console.log('=====================================================');
  console.log('  THE GOLDEN TICKET — GRAFEST COUPON DROP SERVER');
  console.log('=====================================================');
  console.log('  URL:       http://localhost:' + PORT);
  console.log('  CORS:      Enabled (* all origins)');
  console.log('  Database:  Fresh 50 coupons (SQLite WAL)');
  console.log('  Expiry:    10-min auto-revert enabled');
  console.log('=====================================================');
  console.log('');
  console.log('  ENDPOINTS FOR JUDGES DASHBOARD:');
  console.log('  GET   /coupons          → View stock');
  console.log('  POST  /coupons          → Claim coupon');
  console.log('  PATCH /coupons/:id      → Update status');
  console.log('=====================================================');
  console.log('');
});

module.exports = app;
