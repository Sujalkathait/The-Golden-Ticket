const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (dataString) {
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(rawData);
        } catch (e) {
          parsed = rawData;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (dataString) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runAllTests() {
  console.log('=================================================================');
  console.log('   ARCHVERSE SYSTEM DESIGN - GOLDEN TICKET TEST SUITE');
  console.log('=================================================================\n');

  try {
    await makeRequest('GET', '/api/health');
  } catch (e) {
    console.log('[Notice] Server not detected on port 3000. Launching in-process...');
    require('./server');
    await new Promise(r => setTimeout(r, 800));
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 0. Reset to fresh database
    console.log('[Test 0] Verifying Fresh Start / Reset (ArchVerse Rule #5 & #7)...');
    const resetRes = await makeRequest('POST', '/api/admin/reset');
    assert(resetRes.status === 200, 'Server responded with 200 on fresh reset.');
    assert(resetRes.body.stats.total === 50, 'Total coupon count is exactly 50.');
    assert(resetRes.body.stats.available === 50, 'All 50 coupons are initially Unclaimed.');

    // 1. Check View Endpoint (ArchVerse Rule #3)
    console.log('\n[Test 1] Testing View / See Endpoint (ArchVerse Rule #3)...');
    const viewRes = await makeRequest('GET', '/api/coupons');
    assert(viewRes.status === 200, 'GET /api/coupons returned 200.');
    assert(viewRes.body.available === 50, 'Response clearly specifies available units = 50.');
    assert(Array.isArray(viewRes.body.coupons), 'Response contains array of coupons.');

    // 2. Panic Repeat Click (House Rule #2)
    // "In a panic she taps it again and again, and the same claim reaches your server ten times in a single second."
    console.log('\n[Test 2] Simulating Panic Rapid-Tap (10 Simultaneous Clicks by Same Student)...');
    const panicStudentId = 'STUDENT_PANIC_SARAH';
    const panicPromises = [];
    for (let i = 0; i < 10; i++) {
      panicPromises.push(makeRequest('POST', '/api/coupons/claim', { studentId: panicStudentId }));
    }
    const panicResults = await Promise.all(panicPromises);

    const allSuccessful = panicResults.every(r => r.status === 200 || r.status === 201);
    assert(allSuccessful, 'All 10 rapid clicks received success HTTP status (200/201). No errors seen!');

    const couponIds = new Set(panicResults.map(r => r.body.id));
    assert(couponIds.size === 1, `Exactly ONE unique coupon ID allocated across all 10 clicks (ID: ${[...couponIds][0]}).`);

    const checkStatsAfterPanic = await makeRequest('GET', '/api/coupons/stats');
    assert(checkStatsAfterPanic.body.available === 49, 'Only 1 coupon was consumed from the pool (49 remaining).');

    // 3. Concurrency / Simultaneous Requests Race Condition Test (House Rule #1 & #3)
    // Send 100 simultaneous requests from 100 distinct students to compete for remaining 49 coupons
    console.log('\n[Test 3] Simulating 100 Simultaneous Distinct Student Claims (Race Condition Stress Test)...');
    const studentPromises = [];
    for (let i = 1; i <= 100; i++) {
      studentPromises.push(makeRequest('POST', '/api/coupons/claim', { studentId: `STUDENT_RACE_${String(i).padStart(3, '0')}` }));
    }
    const raceResults = await Promise.all(studentPromises);

    const successfulClaims = raceResults.filter(r => r.status === 201);
    const soldOutRefusals = raceResults.filter(r => r.status === 409 || r.status === 400);

    assert(successfulClaims.length === 49, `Exactly 49 additional requests succeeded (Total 50 coupons distributed).`);
    assert(soldOutRefusals.length === 51, `Remaining 51 requests were refused with 4xx client error (HTTP 409 Sold Out).`);
    assert(raceResults.every(r => r.status < 500), 'Zero 5xx internal server errors occurred under heavy concurrent load.');

    const checkStatsAfterRace = await makeRequest('GET', '/api/coupons/stats');
    assert(checkStatsAfterRace.body.total === 50, 'Total coupon count remains exactly 50.');
    assert(checkStatsAfterRace.body.available === 0, 'Available coupons is now strictly 0.');
    assert(checkStatsAfterRace.body.claimed === 50, 'Exactly 50 coupons are Claimed. Not 51!');

    // 4. Repeated claim by existing student when pool is completely sold out
    console.log('\n[Test 4] Repeated Claim by Existing Student When Sold Out...');
    const repeatSoldOutRes = await makeRequest('POST', '/api/coupons/claim', { studentId: panicStudentId });
    assert(repeatSoldOutRes.status === 200, 'Existing student still receives 200 OK when requesting their coupon.');
    assert(repeatSoldOutRes.body.alreadyClaimed === true, 'Response identifies existing claim idempotently.');
    assert(repeatSoldOutRes.body.id === [...couponIds][0], 'Returns the exact same coupon ID.');

    // 5. Invalid Coupon ID Edge Case
    console.log('\n[Test 5] Testing Invalid / Non-Existent Coupon ID...');
    const invalidIdRes = await makeRequest('GET', '/api/coupons/9999');
    assert(invalidIdRes.status === 404, 'GET invalid ID returned 404 Not Found.');
    const patchInvalidRes = await makeRequest('PATCH', '/api/coupons/9999', { status: 'Redeemed' });
    assert(patchInvalidRes.status === 404, 'PATCH invalid ID returned 404 Not Found.');

    // 6. Strict Lifecycle Transition Testing
    // Journey: Unclaimed -> Claimed -> Redeemed -> Expired
    console.log('\n[Test 6] Testing Strict Journey Order: Claimed -> Redeemed -> Expired...');
    const targetCouponId = [...couponIds][0]; // This coupon is currently 'Claimed'

    // Try invalid jump: Claimed -> Expired (skipping Redeemed)
    const invalidJumpRes = await makeRequest('PATCH', `/api/coupons/${targetCouponId}`, { status: 'Expired' });
    assert(invalidJumpRes.status === 400, 'Cannot skip Redeemed step: Claimed -> Expired refused with 400.');

    // Valid transition: Claimed -> Redeemed
    const redeemRes = await makeRequest('PATCH', `/api/coupons/${targetCouponId}`, { status: 'Redeemed' });
    assert(redeemRes.status === 200, 'Valid transition Claimed -> Redeemed succeeded with 200.');
    assert(redeemRes.body.coupon.status === 'Redeemed', 'Coupon status updated to Redeemed.');

    // Duplicate redemption: trying to redeem an already Redeemed coupon
    const dupRedeemRes = await makeRequest('PATCH', `/api/coupons/${targetCouponId}`, { status: 'Redeemed' });
    assert(dupRedeemRes.status === 200, 'Idempotent repeated redeem request handled cleanly.');

    // Valid transition: Redeemed -> Expired
    const expireRes = await makeRequest('PATCH', `/api/coupons/${targetCouponId}`, { status: 'Expired' });
    assert(expireRes.status === 200, 'Valid transition Redeemed -> Expired succeeded with 200.');
    assert(expireRes.body.coupon.status === 'Expired', 'Coupon status updated to Expired.');

    // Invalid transition: Expired -> Claimed
    const invalidExpiredTransition = await makeRequest('PATCH', `/api/coupons/${targetCouponId}`, { status: 'Claimed' });
    assert(invalidExpiredTransition.status === 400, 'Expired -> Claimed transition refused with 400.');

    // 7. Stretch Bonus: 10-Minute Expiry Auto-Reversion (+10 Points)
    console.log('\n[Test 7] Testing Stretch Bonus: 10-Minute Expiry Auto-Reversion to Pool...');
    // Reset DB for clean test
    await makeRequest('POST', '/api/admin/reset');
    // Claim a coupon with 0 minutes expiry window (simulating 10 minutes elapsed)
    const timeoutClaimRes = await makeRequest('POST', '/api/coupons/claim', {
      studentId: 'STUDENT_TIMEOUT_USER',
      expiryMinutes: -0.1 // immediately expired
    });
    assert(timeoutClaimRes.status === 201, 'Coupon claimed with elapsed timer.');
    const timeoutCouponId = timeoutClaimRes.body.id;

    // Check stats (triggers auto-reversion)
    const statsAfterRevert = await makeRequest('GET', '/api/coupons/stats');
    assert(statsAfterRevert.body.available === 50, 'Expired unredeemed coupon automatically returned to pool (Available = 50).');

    const revertedCouponCheck = await makeRequest('GET', `/api/coupons/${timeoutCouponId}`);
    assert(revertedCouponCheck.body.status === 'Unclaimed', 'Reverted coupon status is back to Unclaimed.');
    assert(revertedCouponCheck.body.student_id === null, 'Reverted coupon student_id is cleared.');

    // 8. CORS Verification (Mandatory)
    console.log('\n[Test 8] Testing Mandatory CORS Headers...');
    const corsOptionsRes = await makeRequest('OPTIONS', '/api/coupons');
    assert(corsOptionsRes.status === 200 || corsOptionsRes.status === 204, 'OPTIONS preflight returned 200/204.');
    const allowOrigin = corsOptionsRes.headers['access-control-allow-origin'];
    assert(allowOrigin === '*' || allowOrigin !== undefined, `CORS Access-Control-Allow-Origin present: ${allowOrigin}`);

    console.log('\n=================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=================================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('\nALL ARCHVERSE CONSTRAINTS & HOUSE RULES MET WITH 100% SUCCESS!\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

// Allow standalone execution or direct call
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };

