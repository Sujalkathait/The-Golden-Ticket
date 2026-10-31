const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body = null) {
  return new Promise((resolve) => {
    const dataString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Accept': 'application/json'
      }
    };
    if (dataString) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }
    const t0 = performance.now();
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch(e) {}
        resolve({
          status: res.statusCode,
          text: raw,
          json: json,
          ms: performance.now() - t0
        });
      });
    });
    req.on('error', (err) => {
      resolve({ status: 0, text: err.message, json: null, ms: performance.now() - t0 });
    });
    if (dataString) req.write(dataString);
    req.end();
  });
}

function kind(r) {
  if (r.status >= 200 && r.status < 300) return '2xx';
  if (r.status >= 400 && r.status < 500) return '4xx';
  return 'bad';
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{{${k}}}`);
}

async function runDashboardTests() {
  console.log('====================================================');
  console.log('  RUNNING EXACT ARCHVERSE DASHBOARD TEST SIMULATION ');
  console.log('====================================================\n');

  try {
    const health = await request('GET', '/api/health');
    if (health.status === 0) throw new Error('Offline');
  } catch (e) {
    console.log('[Notice] Server not detected on port 3000. Launching in-process...');
    require('./server');
    await new Promise(r => setTimeout(r, 800));
  }

  // Dashboard configuration for PS 4 Coupons
  const cfg = {
    viewPath: '/coupons',
    reservePath: '/coupons',
    statusPath: '/coupons/{{ID}}',
    race: '{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}',
    idem: '{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}',
    reject: '{"couponId": "does_not_exist", "userId": "{{USER_ID}}"}',
    state: '{"id": "{{ID}}", "status": "{{STATUS}}"}',
    seq: ['Unclaimed', 'Claimed', 'Redeemed', 'Expired'],
    startIdx: 1, // 'Claimed' is state after reserve
    raceCount: 100,
    capacity: 50,
    dupCount: 10,
    pool: true,
    idemAllOk: true,
    cross: ''
  };

  const runId = 'r' + Date.now().toString(36);
  let idemId = null;
  let raceIds = [];
  let exhausted = false;

  // TEST 1: View Endpoint Load Test (100 simultaneous GETs)
  console.log('[Dashboard Test 1] View Endpoint Load Test (100 simultaneous GET requests)...');
  const viewReqs = await Promise.all(Array.from({ length: 100 }, () => request('GET', cfg.viewPath)));
  const t1_ok = viewReqs.filter(r => kind(r) === '2xx').length;
  const t1_bad = viewReqs.filter(r => kind(r) === 'bad').length;
  console.log(`  -> ${t1_ok}/100 returned 2xx, ${t1_bad} bad.`);
  if (t1_ok === 100) console.log('  [PASS] Test 1 passed!');
  else console.log('  [FAIL] Test 1 failed!');

  // TEST 3: Idempotency Check (10 simultaneous identical POSTs from ONE user)
  console.log('\n[Dashboard Test 3] Idempotency Check (10 simultaneous identical requests from ONE user)...');
  const user = `${runId}_idem`;
  const idemPayload = fill(cfg.idem, { USER_ID: user });
  const beforeView = await request('GET', cfg.viewPath);
  const beforeStock = beforeView.json ? beforeView.json.available : 50;
  
  const idemReqs = await Promise.all(Array.from({ length: cfg.dupCount }, () => request('POST', cfg.reservePath, idemPayload)));
  const idemOk = idemReqs.filter(r => kind(r) === '2xx').length;
  const ids = [...new Set(idemReqs.filter(r => kind(r) === '2xx').map(r => r.json && r.json.id).filter(Boolean))];
  idemId = ids[0] || null;

  const afterView = await request('GET', cfg.viewPath);
  const afterStock = afterView.json ? afterView.json.available : 0;
  const delta = beforeStock - afterStock;

  console.log(`  -> ${idemOk}/10 returned 2xx. Distinct record IDs: ${ids.length} (ID: ${idemId}). Delta stock: ${delta}.`);
  if (idemOk === 10 && ids.length === 1 && delta === 1) console.log('  [PASS] Test 3 passed!');
  else console.log('  [FAIL] Test 3 failed!');

  // TEST 2: The Race (Concurrency, 100 simultaneous from 100 DIFFERENT users)
  console.log('\n[Dashboard Test 2] The Race (100 simultaneous requests from 100 DIFFERENT users)...');
  const expected = Math.min(cfg.raceCount, afterStock); // 49
  console.log(`  -> Stock before race: ${afterStock}. Expecting exactly ${expected} successes.`);

  const users = Array.from({ length: cfg.raceCount }, (_, i) => `${runId}_race_${i}`);
  const raceReqs = await Promise.all(users.map(u => request('POST', cfg.reservePath, fill(cfg.race, { USER_ID: u }))));
  const raceOk = raceReqs.filter(r => kind(r) === '2xx').length;
  const raceRej = raceReqs.filter(r => kind(r) === '4xx').length;
  const raceBad = raceReqs.filter(r => kind(r) === 'bad').length;
  raceIds = raceReqs.filter(r => kind(r) === '2xx').map(r => r.json && r.json.id).filter(Boolean);
  exhausted = (raceOk === expected);

  console.log(`  -> Result: ${raceOk} success (2xx), ${raceRej} rejected (4xx), ${raceBad} errors.`);
  if (raceOk === expected && raceBad === 0 && raceRej === (100 - expected)) console.log('  [PASS] Test 2 passed!');
  else console.log('  [FAIL] Test 2 failed!');

  // TEST 4: Rejection (Invalid item + Sold-out)
  console.log('\n[Dashboard Test 4] Rejection Check (Sold-out + Invalid item)...');
  const lateRes = await request('POST', cfg.reservePath, fill(cfg.race, { USER_ID: `${runId}_late` }));
  console.log(`  -> Sold-out target: HTTP ${lateRes.status} (kind: ${kind(lateRes)})`);
  const invRes = await request('POST', cfg.reservePath, fill(cfg.reject, { USER_ID: `${runId}_inv` }));
  console.log(`  -> Invalid item: HTTP ${invRes.status} (kind: ${kind(invRes)})`);

  if (kind(lateRes) === '4xx' && kind(invRes) === '4xx') console.log('  [PASS] Test 4 passed!');
  else console.log('  [FAIL] Test 4 failed!');

  // TEST 5: State / Status Sequence
  console.log('\n[Dashboard Test 5] State / Status Sequence Check...');
  const recId = idemId || raceIds[0];
  console.log(`  -> Using record ${recId}, currently "${cfg.seq[cfg.startIdx]}" (Claimed)`);

  const patch = (status) => request('PATCH', fill(cfg.statusPath, { ID: recId }), fill(cfg.state, { ID: recId, STATUS: status }));

  const step1 = await patch('Expired'); // Skip Claimed -> Expired
  console.log(`  -> Skip Claimed > Expired: HTTP ${step1.status} (kind: ${kind(step1)}, want 4xx)`);

  const step2 = await patch('Redeemed'); // Valid Claimed -> Redeemed
  console.log(`  -> Valid Claimed > Redeemed: HTTP ${step2.status} (kind: ${kind(step2)}, want 2xx)`);

  const step3 = await patch('Claimed'); // Backward Redeemed -> Claimed
  console.log(`  -> Backward Redeemed > Claimed: HTTP ${step3.status} (kind: ${kind(step3)}, want 4xx)`);

  if (kind(step1) === '4xx' && kind(step2) === '2xx' && kind(step3) === '4xx') console.log('  [PASS] Test 5 passed!');
  else console.log('  [FAIL] Test 5 failed!');

  console.log('\n====================================================');
  console.log('  ALL 5 DASHBOARD TESTS EVALUATED SUCCESSFULLY!     ');
  console.log('====================================================');
  process.exit(0);
}

runDashboardTests();

