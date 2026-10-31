// ============================================================
// database.js — SQLite Database Layer for Golden Ticket System
// Uses better-sqlite3 (synchronous, atomic transactions)
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'golden_ticket.db');
const TOTAL_COUPONS = 50;
const EXPIRY_MINUTES = 10;

let db;

// ----------------------------------------------------------
// Initialize fresh database (Rule #5: fresh on every restart)
// ----------------------------------------------------------
function initDatabase() {
  // Close old connection if open
  if (db) { try { db.close(); } catch (e) {} }

  // Delete old DB file for guaranteed fresh start
  if (fs.existsSync(DB_PATH)) {
    try { fs.unlinkSync(DB_PATH); } catch (e) {}
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    DROP INDEX IF EXISTS idx_status;
    DROP INDEX IF EXISTS idx_student;
    DROP TABLE IF EXISTS coupons;

    CREATE TABLE coupons (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT    UNIQUE NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'Unclaimed',
      student_id TEXT,
      claimed_at TEXT,
      redeemed_at TEXT,
      expired_at TEXT,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_status ON coupons(status);
    CREATE INDEX IF NOT EXISTS idx_student ON coupons(student_id);
  `);

  // Seed exactly 50 coupons
  const insert = db.prepare('INSERT INTO coupons (code, status) VALUES (?, ?)');
  const seed = db.transaction(() => {
    for (let i = 1; i <= TOTAL_COUPONS; i++) {
      insert.run('GT-' + String(i).padStart(3, '0'), 'Unclaimed');
    }
  });
  seed();

  console.log(`[DB] Fresh database: ${TOTAL_COUPONS} Unclaimed coupons seeded.`);
}

// ----------------------------------------------------------
// Auto-revert expired claims (Stretch Bonus: 10-min timeout)
// ----------------------------------------------------------
function revertExpiredClaims() {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE coupons
    SET status = 'Unclaimed', student_id = NULL, claimed_at = NULL, expires_at = NULL
    WHERE status = 'Claimed' AND expires_at IS NOT NULL AND expires_at <= ?
  `).run(now);
  if (result.changes > 0) {
    console.log(`[Expiry] Reverted ${result.changes} expired claim(s) back to pool.`);
  }
}

// ----------------------------------------------------------
// GET: View stats
// ----------------------------------------------------------
function getStats() {
  revertExpiredClaims();
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM coupons GROUP BY status').all();
  const s = { total: TOTAL_COUPONS, available: 0, claimed: 0, redeemed: 0, expired: 0 };
  rows.forEach(r => {
    if (r.status === 'Unclaimed') s.available = r.count;
    if (r.status === 'Claimed')   s.claimed = r.count;
    if (r.status === 'Redeemed')  s.redeemed = r.count;
    if (r.status === 'Expired')   s.expired = r.count;
  });
  return s;
}

// ----------------------------------------------------------
// GET: All coupons list (with optional filter)
// ----------------------------------------------------------
function getAllCoupons(statusFilter) {
  revertExpiredClaims();
  if (statusFilter) {
    return db.prepare('SELECT * FROM coupons WHERE status = ? ORDER BY id').all(statusFilter);
  }
  return db.prepare('SELECT * FROM coupons ORDER BY id').all();
}

// ----------------------------------------------------------
// GET: Single coupon by ID or code
// ----------------------------------------------------------
function getCoupon(identifier) {
  revertExpiredClaims();
  if (/^\d+$/.test(String(identifier))) {
    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(Number(identifier));
  }
  return db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(String(identifier));
}

// ----------------------------------------------------------
// POST: Claim a coupon (atomic, idempotent, concurrency-safe)
// ----------------------------------------------------------
function claimCoupon(studentId, requestedCouponId, customExpiryMinutes) {
  if (!studentId || !String(studentId).trim()) {
    const e = new Error('student_id is required in the request body.');
    e.statusCode = 400;
    throw e;
  }
  const sid = String(studentId).trim();
  revertExpiredClaims();

  // Validate requested coupon / item if explicitly specified
  const reqCoupon = requestedCouponId ? String(requestedCouponId).trim() : '';
  const genericPoolTargets = ['grafest', 'special_1', 'chai_special', 'all', 'any', 'default'];

  return db.transaction(() => {
    // 1. Check if student already has an active coupon (idempotent — no error on repeat)
    const existing = db.prepare(
      "SELECT * FROM coupons WHERE student_id = ? AND status IN ('Claimed','Redeemed') LIMIT 1"
    ).get(sid);

    if (existing) {
      return { coupon: existing, alreadyClaimed: true };
    }

    // 2. Determine target coupon
    let targetCoupon = null;

    if (reqCoupon && !genericPoolTargets.includes(reqCoupon.toLowerCase())) {
      // Specific coupon or non-existent coupon requested
      targetCoupon = getCoupon(reqCoupon);
      if (!targetCoupon) {
        const e = new Error(`Coupon '${reqCoupon}' does not exist.`);
        e.statusCode = 404;
        throw e;
      }
      if (targetCoupon.status !== 'Unclaimed') {
        const e = new Error(`Coupon '${reqCoupon}' is not available (Status: ${targetCoupon.status}).`);
        e.statusCode = 409;
        throw e;
      }
    } else {
      // Grab next available coupon from the pool
      targetCoupon = db.prepare(
        "SELECT * FROM coupons WHERE status = 'Unclaimed' ORDER BY id LIMIT 1"
      ).get();
    }

    if (!targetCoupon) {
      const e = new Error('Sold out. All 50 coupons have been claimed.');
      e.statusCode = 409;
      throw e;
    }

    const now = new Date();
    const mins = (customExpiryMinutes !== undefined) ? customExpiryMinutes : EXPIRY_MINUTES;
    const expiresAt = new Date(now.getTime() + mins * 60000);

    db.prepare(
      "UPDATE coupons SET status='Claimed', student_id=?, claimed_at=?, expires_at=? WHERE id=? AND status='Unclaimed'"
    ).run(sid, now.toISOString(), expiresAt.toISOString(), targetCoupon.id);

    const updated = db.prepare('SELECT * FROM coupons WHERE id = ?').get(targetCoupon.id);
    return { coupon: updated, alreadyClaimed: false };
  })();
}

// ----------------------------------------------------------
// PATCH: Update coupon status (strict lifecycle order)
// Lifecycle: Unclaimed → Claimed → Redeemed → Expired
// ----------------------------------------------------------
function updateStatus(identifier, newStatus) {
  const valid = ['Unclaimed', 'Claimed', 'Redeemed', 'Expired'];
  if (!newStatus || !valid.includes(newStatus)) {
    const e = new Error('Invalid status. Must be one of: ' + valid.join(', '));
    e.statusCode = 400;
    throw e;
  }

  revertExpiredClaims();

  return db.transaction(() => {
    const coupon = getCoupon(identifier);
    if (!coupon) {
      const e = new Error('Coupon not found: ' + identifier);
      e.statusCode = 404;
      throw e;
    }

    const cur = coupon.status;

    // Same status = idempotent, just return it
    if (cur === newStatus) return coupon;

    // Valid transitions
    const allowed =
      (cur === 'Claimed'   && newStatus === 'Redeemed') ||
      (cur === 'Redeemed'  && newStatus === 'Expired')  ||
      (cur === 'Claimed'   && newStatus === 'Unclaimed');

    if (!allowed) {
      const e = new Error(`Cannot change status from '${cur}' to '${newStatus}'. Order: Unclaimed → Claimed → Redeemed → Expired.`);
      e.statusCode = 400;
      throw e;
    }

    const now = new Date().toISOString();

    if (newStatus === 'Redeemed') {
      db.prepare("UPDATE coupons SET status='Redeemed', redeemed_at=? WHERE id=?").run(now, coupon.id);
    } else if (newStatus === 'Expired') {
      db.prepare("UPDATE coupons SET status='Expired', expired_at=? WHERE id=?").run(now, coupon.id);
    } else if (newStatus === 'Unclaimed') {
      db.prepare("UPDATE coupons SET status='Unclaimed', student_id=NULL, claimed_at=NULL, expires_at=NULL WHERE id=?").run(coupon.id);
    }

    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(coupon.id);
  })();
}

// ----------------------------------------------------------
// DELETE: Reset single coupon back to Unclaimed
// ----------------------------------------------------------
function resetCoupon(identifier) {
  const coupon = getCoupon(identifier);
  if (!coupon) {
    const e = new Error('Coupon not found: ' + identifier);
    e.statusCode = 404;
    throw e;
  }
  db.prepare("UPDATE coupons SET status='Unclaimed', student_id=NULL, claimed_at=NULL, expires_at=NULL, redeemed_at=NULL, expired_at=NULL WHERE id=?").run(coupon.id);
  return { success: true, message: 'Coupon ' + coupon.code + ' reset to Unclaimed.' };
}

// ----------------------------------------------------------
// Seed realistic demo data for presentations & live testing
// 20 Claimed, 15 Redeemed, 5 Expired, 10 Unclaimed
// ----------------------------------------------------------
function seedDemoData() {
  db.transaction(() => {
    db.prepare('DELETE FROM coupons').run();
    // Reset sqlite_sequence if exists
    try { db.prepare("DELETE FROM sqlite_sequence WHERE name='coupons'").run(); } catch(e) {}

    const insert = db.prepare(`
      INSERT INTO coupons (id, code, status, student_id, claimed_at, redeemed_at, expired_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();

    // 1-20: Claimed (with active 10-minute timers)
    for (let i = 1; i <= 20; i++) {
      const claimedAt = new Date(now - (i * 20000)).toISOString();
      const expiresAt = new Date(now + ((10 - (i * 0.35)) * 60000)).toISOString();
      insert.run(i, `GT-${String(i).padStart(3, '0')}`, 'Claimed', `STU-2026-${100 + i}`, claimedAt, null, null, expiresAt);
    }

    // 21-35: Redeemed
    for (let i = 21; i <= 35; i++) {
      const claimedAt = new Date(now - 300000).toISOString();
      const redeemedAt = new Date(now - ((i - 20) * 15000)).toISOString();
      insert.run(i, `GT-${String(i).padStart(3, '0')}`, 'Redeemed', `STU-2026-${100 + i}`, claimedAt, redeemedAt, null, null);
    }

    // 36-40: Expired
    for (let i = 36; i <= 40; i++) {
      const claimedAt = new Date(now - 700000).toISOString();
      const expiredAt = new Date(now - ((i - 35) * 10000)).toISOString();
      insert.run(i, `GT-${String(i).padStart(3, '0')}`, 'Expired', `STU-2026-${100 + i}`, claimedAt, null, expiredAt, null);
    }

    // 41-50: Unclaimed (available for immediate live testing!)
    for (let i = 41; i <= 50; i++) {
      insert.run(i, `GT-${String(i).padStart(3, '0')}`, 'Unclaimed', null, null, null, null, null);
    }
  })();

  console.log('[DB] Seeded realistic demo data (20 Claimed, 15 Redeemed, 5 Expired, 10 Unclaimed).');
  return getStats();
}

module.exports = {
  initDatabase, getStats, getAllCoupons, getCoupon,
  claimCoupon, updateStatus, resetCoupon, revertExpiredClaims, seedDemoData, TOTAL_COUPONS
};
