# ArchVerse 2026 — Presentation Notes & PPT Content
## Problem Statement 04: The Golden Ticket (GRAFEST Coupon Drop)

Use these slides/notes directly in your official ArchVerse PPT template.

---

### Slide 1: Title & Overview
- **Project Title:** The Golden Ticket (GRAFEST Midnight Coupon Drop)
- **Problem Statement:** #04
- **Tech Stack:** Node.js, Express.js, SQLite (`better-sqlite3` in WAL mode), HTML5, CSS3, Vanilla JavaScript
- **Core Challenge:** High-concurrency coupon distribution with strict anti-duplicate protection, hard quota of 50 coupons, panic-tap idempotency, and automated 10-minute expiry return.

---

### Slide 2: Problem & Key Assumptions
- **The Story:** At midnight, GRAFEST drops 50 discount coupons. Hundreds of students tap simultaneously. A student's phone freezes on the "Claim" button; she panics and taps 10 times in a single second.
- **Constraints & House Rules:**
  1. **Strict 50 Limit:** Exactly 50 coupons are distributed; never 51.
  2. **Panic Tap Idempotency:** The panicking student ends up with 1 coupon. She uses 1 coupon from the pool, receives no error, and sees her valid claim.
  3. **Clear Refusal:** Requests after 50 are gone must receive a clear 4xx status (HTTP 409 Sold Out), never 200 with an error, and never 5xx.
  4. **Strict Journey:** `Unclaimed` → `Claimed` → `Redeemed` → `Expired`. No skipping steps.
  5. **Stretch Bonus (+10 Points):** If claimed but unredeemed within 10 minutes, the ticket automatically returns to `Unclaimed` for others.
- **Assumptions:**
  - Student identity is represented by roll number/student ID in the JSON body (`studentId`).
  - Server restart resets the database to fresh stock (50 Unclaimed coupons) as required by judging rules.

---

### Slide 3: System Architecture Diagram

```
                 [ Hundreds of Student Clients / Browser UI / Judges Dashboard ]
                                              │
                                              ▼ (JSON over HTTP with CORS *)
                                    ┌──────────────────┐
                                    │  Express Server  │
                                    │ (Port 3000, CORS)│
                                    └─────────┬────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
          ┌───────────────────────┐                       ┌───────────────────────┐
          │   REST API Router     │                       │ 10-Min Expiry Cron    │
          │ • GET /coupons (View) │                       │ (Background Evaluator │
          │ • POST /claim         │                       │  every 5s)            │
          │ • PATCH /:id (Status) │                       └───────────┬───────────┘
          └───────────┬───────────┘                                   │
                      │                                               │
                      ▼                                               ▼
          ┌───────────────────────────────────────────────────────────────────────┐
          │                SQLite WAL Engine (better-sqlite3)                     │
          │   • Synchronous C++ atomic transactions: db.transaction(() => {})     │
          │   • Immediate table locking during claim avoids race conditions       │
          │   • Zero async thread interleaving during quota decrement             │
          └───────────────────────────────────┬───────────────────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │      coupons Table      │
                                 │   (50 Seeded Records)   │
                                 └─────────────────────────┘
```

---

### Slide 4: Data Model & Record Journey

#### Database Schema (`coupons`)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 1 to 50 |
| `code` | TEXT | UNIQUE NOT NULL | `GT-001` to `GT-050` |
| `status` | TEXT | CHECK IN ('Unclaimed','Claimed','Redeemed','Expired') | State machine tracking |
| `student_id`| TEXT | NULLABLE | Assigned student ID |
| `claimed_at`| TEXT | ISO8601 NULL | Timestamp when claimed |
| `redeemed_at`| TEXT | ISO8601 NULL | Timestamp when redeemed |
| `expired_at`| TEXT | ISO8601 NULL | Timestamp when expired |
| `expires_at`| TEXT | ISO8601 NULL | `claimed_at + 10 mins` |

#### The Journey of Every Record
```
[ Unclaimed ] ──(Student Claim)──► [ Claimed ] ──(Stall Visit)──► [ Redeemed ] ──► [ Expired ]
      ▲                                   │
      │                                   │
      └──────(10-Min Inactivity Timeout)──┘
```

---

### Slide 5: How Each Constraint is Handled

1. **Panic Repeated Taps (10 taps / 1s by same student):**
   - Inside an atomic transaction, the system first queries if `student_id` already owns a `Claimed` or `Redeemed` coupon.
   - If found, it returns the existing coupon with HTTP `200 OK` and a message confirming the claim.
   - **Result:** Exactly 1 coupon allocated; 0 duplicate consumption; user sees 100% success.

2. **Simultaneous Requests & Concurrency (100 students at midnight):**
   - Handled via `better-sqlite3` atomic synchronous transactions (`db.transaction`).
   - SQLite evaluates the claim in isolated C++ thread-safe execution: checks `COUNT(Unclaimed) > 0`, claims row with `LIMIT 1`, commits atomically.
   - 49 concurrent claims succeed; remaining 51 immediately receive `HTTP 409 Conflict: Sold Out`.
   - **Result:** Strictly 50 coupons claimed, never 51.

3. **Status Validation (PATCH):**
   - Strict transition table enforced.
   - Attempting `Unclaimed → Redeemed` returns `400 Bad Request`.
   - Attempting duplicate redemption returns clear feedback.

4. **10-Minute Inactivity Expiry (Stretch Bonus +10 Points):**
   - Both lazy evaluation (on every read/claim) and an automated 5-second background daemon scan for `status = 'Claimed' AND expires_at <= NOW()`.
   - Reverts status to `Unclaimed`, clears `student_id`, and restores pool stock.

---

### Slide 6: Scalability & Trade-offs

- **Why SQLite with WAL mode (`better-sqlite3`)?**
  - **Zero Network Latency:** In-process database means transaction locks execute in microseconds.
  - **Synchronous Atomicity:** Avoids JavaScript async event-loop interleaving bugs where multiple promises read `available = 1` before writing.
  - **Write-Ahead Logging (WAL):** Allows concurrent readers while writes execute.
- **Production Evolution (Beyond Single Node):**
  - In a distributed multi-node architecture (e.g. Kubernetes cluster), we would use **Redis Distributed Locks (Redlock)** or **PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`** to maintain identical atomic guarantees across nodes.

---

### Slide 7: Viva Q&A Cheat Sheet for Team Members

- **Q: How did you ensure exactly 50 coupons are distributed and not 51 under 100 concurrent requests?**  
  *A:* We used atomic SQLite transactions. Within the transaction, we select the next available Unclaimed coupon and update it atomically. If none exist, we throw a 409 Sold Out error before any write happens. Because `better-sqlite3` is synchronous, no two requests can read the same row.

- **Q: How do you handle the panic repeated tap without throwing an error?**  
  *A:* We use idempotency. When a claim request arrives, we check if that `studentId` already has an active coupon. If yes, we return HTTP 200 with the existing coupon data instead of allocating a second one or throwing an error.

- **Q: How does the 10-minute expiry work?**  
  *A:* When a student claims a ticket, `expires_at` is set to `now + 10 minutes`. A dual mechanism (background interval + lazy read query) checks for unredeemed expired claims and reverts them to `Unclaimed`, making them immediately available for other students.

