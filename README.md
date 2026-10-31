# The-Golden-Ticket
## The Golden Ticket (GRAFEST Coupon Drop)

**Graphic Era Deemed to be University, Dehradun**  
**Utopia Tech Fest '26 — ArchVerse System Design Challenge**  
**Problem Statement #04:** The Golden Ticket  

🌐 **Live Vercel Deployment:** [https://goldenticket-five.vercel.app/](https://goldenticket-five.vercel.app/)  
💻 **Local Host URL:** `http://localhost:3000`  
📦 **GitHub Repository:** [https://github.com/Sujalkathait/The-Golden-Ticket](https://github.com/Sujalkathait/The-Golden-Ticket)  
🛠️ **Tech Stack:** HTML5, CSS3, JavaScript, Node.js, Express, SQLite (`better-sqlite3` in WAL mode)

---

## 🏆 Project Overview

At midnight during GRAFEST at **Graphic Era Deemed to be University**, the committee drops exactly **50 exclusive discount coupons**. Hundreds of students tap simultaneously. 

### Core System Objectives & Constraints
1. **Strict 50 Quota:** Exactly 50 coupons are distributed. Never 51.
2. **Panic-Tap Idempotency:** If a student's phone freezes on the Claim button and fires 10 requests in 1 second, the student receives **exactly one coupon**, only 1 unit is deducted from the pool, and the student sees a successful claim confirmation without errors.
3. **High-Concurrency Race Condition Protection:** Atomic SQLite transactions guarantee zero race conditions when 100+ requests hit the server in parallel.
4. **Strict Lifecycle Journey:** `Unclaimed` → `Claimed` → `Redeemed` → `Expired`. No skipping steps or duplicate redemptions allowed.
5. **Stretch Bonus (+10 Points):** If a student claims a coupon but does not redeem it at a food stall within **10 minutes**, the system automatically reverts it to `Unclaimed` and returns it to the available pool for other students.
6. **Dual-Layer CORS:** Full support for all origins (`*`), methods (`GET, POST, PATCH, PUT, DELETE, OPTIONS`), and headers (`Content-Type, Accept, Authorization, X-Requested-With`) to ensure zero network errors on the judge testing dashboard.

---

## 📋 ArchVerse Dashboard Testing Matrix

Use these exact values in the **ArchVerse Testing Dashboard** (`https://divyeshpant1103-bit.github.io/Archverse/`):

| Dashboard Field | Production Value |
| :--- | :--- |
| **Problem Statement** | `PS 4 Coupon Drop` (or `coupons`) |
| **Base URL (Local)** | `http://localhost:3000` |
| **Base URL (Vercel Live)** | `https://goldenticket-five.vercel.app` |
| **View Endpoint Path (GET)** | `/coupons` |
| **Stock Field in View Response** | `available` |
| **Reserve / Claim Path (POST)** | `/coupons` |
| **Race Payload** | `{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}` |
| **Idempotency Payload** | `{"couponId": "GRAFEST", "userId": "{{USER_ID}}"}` |
| **Invalid-Item Payload** | `{"couponId": "does_not_exist", "userId": "{{USER_ID}}"}` |
| **Cross-Booking Payload** | `not needed` |
| **Record ID Field** | `id` |
| **Status Update Path (PATCH)** | `/coupons/{{ID}}` |
| **Status Payload** | `{"id": "{{ID}}", "status": "{{STATUS}}"}` |
| **Status Sequence** | `Unclaimed, Claimed, Redeemed, Expired` |
| **State After Reserve** | `1` *(Corresponds to `Claimed`)* |
| **CORS Enabled** | `YES` |
| **Seeded Item IDs (Two)** | `GT-001, GT-002` |
| **Stock at Server Start** | `50` |

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server Locally
```bash
npm start
```
The server will boot up at: **`http://localhost:3000`**  
*(Starts fresh with 50 Unclaimed coupons on every restart, fulfilling ArchVerse Rules #5 & #7).*

### 3. Open the Interactive Web App
Visit **`http://localhost:3000`** (or the live deployment at [https://goldenticket-five.vercel.app/](https://goldenticket-five.vercel.app/)).

**Interactive UI Features:**
- 🎟️ **Live Stock Progress:** Real-time quota counter (`available: 50`, `claimed`, `redeemed`, `expired`).
- 🎲 **Student Claim Portal:** Input or generate a random Student Roll Number and claim a ticket.
- ⚡ **Panic 10-Taps Simulator:** Fires 10 simultaneous requests in 1 second to demonstrate idempotency live.
- 🟡 **Golden Ticket Visual Card:** Displays ticket code, student ID, and live 10-minute expiry countdown.
- 🟢 **Stall Redemption Station:** Mark coupons as `Redeemed` or `Expired` via `PATCH`.
- 🚀 **Judges Concurrency Lab:** Fire 100 simultaneous requests with 1 click to prove 0 overselling.
- ⏩ **10-Min Expiry Fast-Forward:** Test the +10 points stretch bonus.
- ⚡ **Load Realistic Demo Data:** One-click pre-population with 20 Claimed, 15 Redeemed, 5 Expired, and 10 Unclaimed coupons.
- ▶️ **Start Real-Time Traffic:** Live simulation that autonomously generates student claims and stall redemptions.

---

## 🧪 Automated Test Suites

```bash
# 1. Run full concurrency, race-condition & constraint test suite (33 assertions)
npm test

# 2. Run official ArchVerse testing dashboard simulation (all 5 test suites)
npm run test:dashboard
```

**Test Coverage Summary:**
- ✅ **Test 1:** View endpoint load test (100 simultaneous GET requests &rarr; 100% 2xx).
- ✅ **Test 2:** The Race (100 concurrent requests from different students &rarr; exactly 50 distributed, 51 rejected with 409).
- ✅ **Test 3:** Panic tap idempotency (10 rapid clicks from 1 student &rarr; exactly 1 unique ID, 1 stock deducted).
- ✅ **Test 4:** Rejection tests (Invalid item &rarr; 404, Sold out &rarr; 409).
- ✅ **Test 5:** Strict sequential status state machine (Skips rejected with 400, backwards transitions rejected with 400).

---

## 📁 Repository Structure

```
The-Golden-Ticket/
│
├── server.js                      # Express backend with dual-layer CORS & REST routes
├── database.js                    # SQLite WAL database layer with atomic transactions
├── vercel.json                    # Vercel deployment configuration
├── package.json                   # Project scripts and dependencies
├── package-lock.json              # Locked dependencies
├── README.md                      # Complete project documentation & setup
│
├── public/                        # Responsive frontend UI
│   ├── index.html                 # Golden Ticket web interface
│   ├── style.css                  # Dark gold glassmorphic styling
│   └── app.js                     # Real-time state synchronization & simulation controller
│
├── md/                            # Documentation
│   ├── ArchVerse_API_Cheat_Sheet.md # Official formatted & filled cheat sheet (Utopia '26)
│   ├── API_CHEAT_SHEET.md         # Printable API cheat sheet with curl examples
│   ├── PRESENTATION_NOTES.md      # ArchVerse PPT content & viva Q&A guide
│   └── prompt.md                  # Problem statement & prompt archive
│
├── pdf/                           # Organizer reference documents
│   ├── Problem_Statement_04.pdf   # Official problem statement #04 specifications
│   ├── ArchVerse_Rulebook .pdf    # Event rules and viva guidelines
│   ├── Sample_Problem_Statement.pdf
│   ├── ArchVerse_API_Cheat_Sheet.pdf
│   └── ArchVerse_Dashboard_Info_Prompt.txt
│
├── test-concurrency.js            # Automated stress test runner (33 tests pass)
└── test-dashboard.js              # Automated judge testing dashboard simulation (5/5 pass)
```

---

## 🏛️ Event & Institutional Attribution
- **Institution:** Graphic Era Deemed to be University, Dehradun
- **Festival:** Utopia Tech Fest '26
- **Challenge:** ArchVerse System Design Challenge (PBL 01)
- **Problem Statement:** 04 — The Golden Ticket (GRAFEST Coupon Drop)
