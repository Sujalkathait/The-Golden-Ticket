# ArchVerse 2026 — API Cheat Sheet
## Problem Statement 04: The Golden Ticket (GRAFEST Coupon Drop)

**Base URL:** `http://localhost:3000`  
**CORS Status:** Mandatory Enabled (`Access-Control-Allow-Origin: *`, `GET, POST, PATCH, PUT, DELETE, OPTIONS`)  
**Data Format:** JSON (`application/json`)  
**Database:** SQLite WAL mode (Starts fresh on every server boot — resets stock to 50)  

---

### Universal API Conventions
1. **Student Identifier:** Send student roll number/ID in request body (e.g., `studentId`, `student_id`, or `userId`).
2. **Quota:** Strictly 50 coupons max. Not 51.
3. **HTTP Status Code Discipline:** 
   - `200 OK` / `201 Created`: Success
   - `400 Bad Request`: Invalid transition, missing student ID, malformed body
   - `404 Not Found`: Non-existent coupon ID
   - `409 Conflict`: Sold out (all 50 taken), or race conflict
   - *Never 5xx for sold out, duplicate, invalid item, or invalid status.*
4. **Lifecycle Order:** `Unclaimed` → `Claimed` → `Redeemed` → `Expired` (No steps skipped).

---

### Endpoint Matrix

| Action | HTTP Method | Endpoint | Request Body | Success Code | Response Highlights |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **View Stock / Stats** | `GET` | `/api/coupons/stats` | None | `200 OK` | `{ total: 50, available: 50, claimed: 0, redeemed: 0, expired: 0 }` |
| **View All Coupons** | `GET` | `/api/coupons` | Query: `?status=...` | `200 OK` | `{ available: 50, availableCount: 50, coupons: [...] }` |
| **View Single Coupon** | `GET` | `/api/coupons/:id` | None | `200 OK` | Coupon object (by ID `1` or Code `GT-001`) |
| **Claim Golden Ticket** | `POST` | `/api/coupons/claim` | `{ "studentId": "STU101" }` | `201` (fresh) / `200` (repeat) | `{ id: 1, couponId: "GT-001", status: "Claimed", available: 49 }` |
| **Redeem at Stall** | `PATCH` | `/api/coupons/:id` | `{ "status": "Redeemed" }` | `200 OK` | `{ id: 1, status: "Redeemed", redeemed_at: "..." }` |
| **Expire Coupon** | `PATCH` | `/api/coupons/:id` | `{ "status": "Expired" }` | `200 OK` | `{ id: 1, status: "Expired", expired_at: "..." }` |
| **Full Replace** | `PUT` | `/api/coupons/:id` | `{ "status": "Claimed", "studentId": "..." }` | `200 OK` | Updated coupon record |
| **Reset Coupon** | `DELETE` | `/api/coupons/:id` | None | `200 OK` | Resets single coupon to `Unclaimed` |
| **Fresh Reset All** | `POST` | `/api/admin/reset` | None | `200 OK` | Resets all 50 coupons fresh |
| **Health Check** | `GET` | `/api/health` | None | `200 OK` | Uptime and status |

---

### Sample cURL Commands for Testing Dashboard

#### 1. View Available Coupons (ArchVerse Rule #3)
```bash
curl -X GET http://localhost:3000/api/coupons \
  -H "Accept: application/json"
```

#### 2. Claim a Coupon (ArchVerse Rule #2 & #3)
```bash
curl -X POST http://localhost:3000/api/coupons/claim \
  -H "Content-Type: application/json" \
  -d '{"studentId": "STU-2026-001"}'
```

#### 3. Repeated Tap by Same Student (House Rule #2 — Idempotent 200 OK)
```bash
curl -X POST http://localhost:3000/api/coupons/claim \
  -H "Content-Type: application/json" \
  -d '{"studentId": "STU-2026-001"}'
```
*Response: Returns the exact same coupon ID, `alreadyClaimed: true`, no new coupon consumed.*

#### 4. Redeem Coupon at Stall (ArchVerse Rule #4 — PATCH)
```bash
curl -X PATCH http://localhost:3000/api/coupons/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "Redeemed"}'
```

#### 5. Expire Coupon (ArchVerse Rule #4 — PATCH)
```bash
curl -X PATCH http://localhost:3000/api/coupons/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "Expired"}'
```

#### 6. CORS Preflight Verification (ArchVerse Rule #6)
```bash
curl -X OPTIONS http://localhost:3000/api/coupons \
  -i -H "Origin: http://dashboard.archverse.local" \
  -H "Access-Control-Request-Method: POST"
```
*Expected: `Access-Control-Allow-Origin: *`*

---

### Edge Cases Handled

| Edge Case | Expected System Behavior | HTTP Status |
| :--- | :--- | :---: |
| **Panic Repeated Taps (10 clicks / 1s)** | Idempotent duplicate check inside SQLite transaction returns existing coupon. Zero duplicates, stock consumed once. | `200 OK` |
| **100 Simultaneous Requests** | Synchronous atomic transaction locks row. First 50 succeed, remaining 50 rejected cleanly with Sold Out. | `201` then `409` |
| **Skipping Lifecycle Steps** | Trying `Unclaimed → Redeemed` or `Redeemed → Claimed` is rejected with invalid transition explanation. | `400 Bad Request` |
| **Non-Existent Coupon ID** | Querying or updating ID `9999` returns clear 404. | `404 Not Found` |
| **10-Minute Timeout (Stretch Bonus)** | Background cron + lazy evaluator automatically returns unredeemed claimed coupons back to `Unclaimed` pool. | Automatic |

