# The Golden Ticket (GRAFEST Coupon Drop)
### ArchVerse 2026 — Problem Statement 04
**Tech Stack:** Node.js • Express • SQLite (`better-sqlite3` WAL) • HTML5/CSS3/JS

---

## Quick Start Instructions

### 1. Start the Server
```bash
npm start
```
The server will start on: **`http://localhost:3000`**  
*Note: The database starts completely fresh with 50 Unclaimed coupons every time the server boots, conforming strictly to ArchVerse Rule #5 & #7.*

### 2. Open the Interactive Web Application
Open your browser and navigate to:
```
http://localhost:3000
```
Features available in the UI:
- **Live Stock Metric Cards & Progress Bar:** Real-time remaining coupons out of 50.
- **Student Claim Portal:** Input any student roll number and claim a Golden Ticket.
- **Simulate Panic 10-Taps Button:** Live demonstration of idempotency—10 rapid clicks in 1 second resulting in exactly 1 coupon and 0 errors!
- **Golden Ticket Visual Card:** Glowing ticket card with unique ID, student ID, and live 10-minute expiry countdown.
- **Stall Redemption Station:** Mark coupons as `Redeemed` or `Expired` via PATCH.
- **Judges' Concurrency Lab:** Fire 100 simultaneous requests with 1 click to prove 0 race conditions and instant 409 Sold Out handling.
- **Fast-Forward 10-Min Expiry:** Demonstrates the Stretch Bonus (+10 points) where unredeemed tickets automatically return to the pool.
- **50-Coupon Live Ledger:** Color-coded status pills, search by student or ID, and filter tabs.

### 3. Run the Automated Test Suites
In a separate terminal window:
```bash
# 1. Run full concurrency & edge-case test suite (33 assertions)
npm test

# 2. Run official ArchVerse testing dashboard simulation (all 5 judge tests)
npm run test:dashboard
```

---

## Clean Project Structure

```
pbl one/
├── server.js                      # Express 4 backend with bulletproof CORS & REST routes
├── database.js                    # SQLite WAL database layer with atomic transactions
├── package.json                   # Dependencies and npm test/start scripts
├── package-lock.json              # Locked dependencies
├── ArchVerse_API_Cheat_Sheet.docx # Official filled Word document for judges
├── API_CHEAT_SHEET.md             # Markdown reference of all API endpoints & payloads
├── PRESENTATION_NOTES.md          # PPT architecture, data models, and viva guide
├── README.md                      # Quick start and project documentation
├── test-concurrency.js            # Automated stress test (33 tests pass)
├── test-dashboard.js              # Simulated judge testing dashboard (5/5 tests pass)
├── public/                        # Responsive frontend UI
│   ├── index.html                 # Golden Ticket drop web app
│   ├── style.css                  # Dark gold glassmorphic styling
│   └── app.js                     # Real-time synchronization & simulation controller
└── pdf/                           # Organizer rules & problem statement documents
    ├── Problem_Statement_04.pdf   # Problem statement #04 specifications
    ├── ArchVerse_Rulebook .pdf    # Event rules and viva guidelines
    ├── Sample_Problem_Statement.pdf
    └── ArchVerse_API_Cheat_Sheet.pdf
```

---

## Deliverables Checklist for Submission

| Deliverable | Location | Status |
| :--- | :--- | :---: |
| **Working Server on Laptop** | `server.js` (`http://localhost:3000`) | Complete |
| **Testing Dashboard CORS** | Allowed all origins `*`, GET, POST, PATCH, PUT, DELETE, OPTIONS | Complete |
| **API Cheat Sheet** | `API_CHEAT_SHEET.md` | Complete |
| **PPT Content & Viva Notes** | `PRESENTATION_NOTES.md` | Complete |
| **Automated Concurrency Tests** | `test-concurrency.js` | Complete (33/33 Passed) |
| **Stretch Bonus (+10 Points)** | 10-minute auto-reversion to pool | Complete |

