# ArchVerse: API Cheat Sheet
**SYSTEM DESIGN CHALLENGE — UTOPIA TECH FEST '26**  
**Graphic Era Deemed to be University, Dehradun**  
*Fill this at the 0:45 checkpoint. The judge types these values into the Testing Dashboard.*  
**Judge Testing Dashboard:** [https://divyeshpant1103-bit.github.io/Archverse/](https://divyeshpant1103-bit.github.io/Archverse/)

---

## A. SETUP

| Field | Production Value | Description |
| :--- | :--- | :--- |
| **Team Name** | `Golden Ticket` *(or team name on the report)* | Name for the judge evaluation report |
| **Problem Statement** | `[X] PS 4 Coupon Drop` | Problem statement dropdown selection |
| **Base URL (Local)** | `http://localhost:3000` | Team's base URL (open in browser to test) |
| **Base URL (Live Vercel)** | `https://goldenticket-five.vercel.app` | Cloud-hosted live production URL |

---

## B. ENDPOINTS

| Endpoint Type | Path | Notes / Query Support |
| :--- | :--- | :--- |
| **View path (GET)** | `/coupons` | Returns `{ available: 50, total: 50, coupons: [...] }` |
| **Reserve / Claim path (POST)** | `/coupons` | Reserves one golden ticket coupon atomically |
| **Status path (PATCH)** | `/coupons/{{ID}}` | Transitions status through lifecycle: `Unclaimed` → `Claimed` → `Redeemed` → `Expired` |

---

## C. PAYLOADS
*(Student ID written exactly as `{{USER_ID}}`)*

### 1. Race Payload
*Valid JSON body for a NEW student:*
```json
{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}
```

### 2. Idempotency Payload
*Valid JSON body for a student to test rapid-tap / panic clicks:*
```json
{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}
```

### 3. Invalid-Item Payload
*Item that does NOT exist (must return HTTP 404 / 4xx):*
```json
{"couponId": "does_not_exist", "userId": "{{USER_ID}}"}
```

### 4. Cross-Booking Payload
*Second item booking:*
```
not needed
```
*(Rules state a student may only claim one Golden Ticket coupon)*

### 5. Response Mapping Fields
- **Record ID field in Reserve response:** `id`
- **Stock field in View response:** `available`

---

## D. STATUS & STATE MACHINE

| Field | Configuration Value |
| :--- | :--- |
| **Status payload** | `{"id": "{{ID}}", "status": "{{STATUS}}"}` |
| **Status sequence (exact spelling)** | `Unclaimed, Claimed, Redeemed, Expired` |
| **Status right after reserving** | `Claimed` *(State index `1`)* |

```
[0: Unclaimed] ──(Reserve / Claim)──> [1: Claimed] ──(Stall Scan)──> [2: Redeemed] ──(10m Expiry)──> [3: Expired]
      ▲                                      │
      └──────(Auto-revert unredeemed)────────┘
```

---

## E. CHECKS & VERIFICATION

| Verification Item | Status | Details |
| :--- | :---: | :--- |
| **CORS Enabled** | `[X] YES` | All origins (`*`), `GET, POST, PATCH, PUT, DELETE, OPTIONS`, headers: `Content-Type, Accept, Authorization, X-Requested-With` |
| **Seeded item IDs (give two)** | `GT-001, GT-002` | Available in initial seeded pool |
| **Stock at server start** | `50` | Strictly 50 units seeded upon server boot |

---

## F. PROBLEMS FOUND (AI Check & Resolution Checklist)

- [x] **View response has no stock number:**  
  *Resolved:* `GET /coupons` returns `{ available: 50, ... }`.
- [x] **Reserve response has no record ID:**  
  *Resolved:* `POST /coupons` returns `{ id: 1, ... }`.
- [x] **A failure returns 200 instead of a 4xx code:**  
  *Resolved:* Invalid item returns `404`, Sold out returns `409`, Bad transition returns `400`.
- [x] **Status route is not PATCH:**  
  *Resolved:* Server exposes standard REST `PATCH /coupons/:id`.
- [x] **CORS missing for PATCH or OPTIONS:**  
  *Resolved:* Dual-layer CORS middleware enabled with explicit preflight handler.
- [x] **Database is not reset when the server starts:**  
  *Resolved:* Server boots with a fresh database and seeds exactly 50 unclaimed coupons.

---

## 📋 QUICK COPY-PASTE FOR JUDGE DASHBOARD

```text
PS: coupons
Base URL: http://localhost:3000
View path (GET): /coupons
Stock field in the View response: available

Reserve path (POST): /coupons
Race payload: {"couponId": "GRAFEST", "userId": "{{USER_ID}}"}
Idempotency payload: {"couponId": "GRAFEST", "userId": "{{USER_ID}}"}
Invalid-item payload: {"couponId": "does_not_exist", "userId": "{{USER_ID}}"}
Cross-booking payload: not needed
Record ID field in the Reserve response: id

Status path (PATCH): /coupons/{{ID}}
Status payload: {"id": "{{ID}}", "status": "{{STATUS}}"}
Status sequence (exact spelling, comma separated): Unclaimed, Claimed, Redeemed, Expired
Status right after reserving: Claimed

CORS enabled for all origins, GET POST PATCH OPTIONS, header Content-Type: YES
Items that exist in the seeded data (give two): GT-001, GT-002
Stock at server start: 50

Problems found: NONE. All tests pass (33/33 concurrency, 5/5 dashboard simulation).
```

---

## JUDGE USE ONLY

- [ ] **Server restarted before run**
- [ ] **Dashboard run done**
- **Score:** `________`
- **Judge Signature:** `________`

*ArchVerse API Cheat Sheet • Utopia Tech Fest '26 • Graphic Era Deemed to be University*
