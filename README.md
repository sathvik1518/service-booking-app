# CareSlot: Service Booking App

**Live demo:** https://service-booking-app-rose.vercel.app/#/login

A full-stack appointment booking app for a clinic or service centre.
Customers register, see open slots, book, reschedule, cancel and view their history.
Admins create slots, see every booking and cancel any of them.

**React** (Vite) + **FastAPI** + **PostgreSQL**, with **JWT login** and **role checks** (customer / admin).

## Features

**Customer**
- Register and log in (password is stored as a bcrypt hash)
- See open slots for the next 14 days, filter by service, pick a day from a date strip
- Book a slot with an optional note (confirmation dialog first)
- Reschedule to another open slot of the same service, or cancel
- "My bookings" with tabs: Upcoming, Past, Cancelled (cancelled records are kept as history)

**Admin**
- Dashboard: upcoming appointments, open spots, customers, cancellations, next-7-days chart, today's appointments, and a "Coming up" list of the next appointments
- Slots: add, edit, delete one slot, or **generate** many slots at once (for example 9:00 to 12:00 in 30 minute pieces for a week)
- Bookings: search by name or email, filter by status, date (with a "Today" shortcut) and service, cancel any booking, export CSV

**Quality**
- Booking rules enforced in the database transaction: capacity, no double booking, no overlapping appointments, no past slots
- Validation on the form and again on the API (the server never trusts the browser)
- 401 when not logged in, 403 when the role is wrong, 404 for someone else's booking
- Loading placeholders, empty states, error messages with a Try again button, toast messages
- Responsive layout (bottom navigation on phones), dark mode, keyboard and screen reader support (labels, focus handling, skip link)

## Demo logins

| Role | Email | Password |
|---|---|---|
| Customer | aarav.sharma@gmail.com | Demo@1234 |
| Admin | saisathvik@gmail.com | Admin@123 |

Eleven more customers (Indian names) have the same password, `Demo@1234`. Demo data is created automatically the first time the server starts on an empty database.

## Run it locally (Windows, PowerShell)

You need Python 3.11+, Node.js 18+ and PostgreSQL (a local one, or a free Neon database).

**Terminal 1: backend**
```
cd backend
python -m venv ..\venv                # first time only
..\venv\Scripts\activate
pip install -r requirements.txt       # first time only
$env:DATABASE_URL="your-neon-connection-string"    # skip this line to use local PostgreSQL
python -m uvicorn main:app --reload --port 8000
```
Wait for `Applied migration ...` (first run). Open http://localhost:8000/docs to try the API.

Local PostgreSQL defaults: user `postgres`, password `postgres`, port 5432, database `service_booking` (created automatically).
Different password? Set it first: `$env:DB_PASSWORD="yourpassword"`.

**Terminal 2: frontend**
```
cd frontend
npm install                           # first time only
npm run dev
```
Open http://localhost:5173

**Fresh demo data** (demo slots are created relative to today, so run this on demo day):
```
cd backend
python seed.py --reset
```
This deletes everything and adds new demo data. Do not run it on a database with real data.

## Tests

```
# API tests (use a local test database, never your cloud database; the tests empty the tables)
cd backend
pip install -r requirements-dev.txt
$env:DATABASE_URL=""
python -m pytest -q

# UI tests
cd frontend
npm test
```
- 39 API tests: auth, 401/403, validation, slot rules, booking, reschedule, cancel, ownership, two people racing for the last spot, admin filters and stats, SQL injection text, login lockout
- 34 UI tests: date and time helpers, login form checks, slot cards, route guard, booking flow (filter, confirm, server error, empty and error states)

## Database

Three tables. Migrations are plain SQL files in `backend/migrations/`; the server applies new ones on start and remembers them in `schema_migrations`.

- `users`: id, name, email (unique), password_hash, role (`customer` or `admin`), created_at
- `slots`: id, service, slot_date, start_time, end_time, capacity, created_at. Rules: end after start, capacity 1 to 50, unique (service, date, start)
- `bookings`: id, user_id, slot_id, status (`booked` or `cancelled`), note, created_at, updated_at, cancelled_at.
  A unique index allows only one active booking per customer per slot.

One customer has many bookings; one slot has many bookings (up to its capacity).

## API

Docs at `/docs` on the backend. On the live site every path starts with `/api`. Send `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Create a customer account, returns a token |
| POST | `/auth/login` | public | Log in, returns a token (429 after 5 wrong passwords in 5 minutes) |
| GET | `/auth/me` | logged in | Who am I |
| GET | `/slots?date=&service=&available_only=` | logged in | Upcoming slots with spots left |
| GET | `/services` | logged in | Service names |
| POST | `/slots` | admin | Add one slot |
| POST | `/slots/bulk` | admin | Generate many slots |
| PUT / DELETE | `/slots/{id}` | admin | Edit or delete (blocked while it has active bookings) |
| POST | `/bookings` | customer | Book a slot (409 if full, overlapping, or already booked) |
| GET | `/bookings/mine` | customer | My history |
| GET | `/bookings/{id}` | owner or admin | One booking (404 for anyone else) |
| PUT | `/bookings/{id}/reschedule` | owner | Move to another slot |
| PATCH | `/bookings/{id}/cancel` | owner or admin | Cancel (the row is kept) |
| GET | `/admin/bookings` | admin | All bookings with filters |
| GET | `/admin/stats` | admin | Dashboard numbers |

Status codes: 401 not logged in, 403 wrong role, 404 not found (also for someone else's booking), 409 conflict (full, duplicate, overlap), 422 invalid input.

## Deploy (Vercel + Neon)

1. Create a Neon project and copy its connection string.
2. Push this folder to GitHub, import the repo in Vercel. Leave the settings as they are (`vercel.json` does the work). If Vercel offers a "Services" preset, set **Framework Preset** to **Other**.
3. In Vercel, Settings, Environment Variables, add:
   - `DATABASE_URL` = your Neon connection string (it must start with `postgresql://`, with no quotes or spaces)
   - `JWT_SECRET` = a long random text (40 or more letters and numbers)
4. Redeploy. The first request creates the tables, the admin and the demo data (a few seconds, once).

Set `SEED_DEMO=0` to skip demo customers and slots. Change the admin with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
"Today" and "past" use the `APP_TIMEZONE` setting (default `Asia/Kolkata`).

The app uses hash links (`/#/login`) so refreshing any page works on static hosting.

## Security notes

- Passwords: bcrypt hash, never stored or returned in plain text
- SQL: every value goes in through `%s` placeholders (no string joining), so SQL injection text is stored harmlessly
- JWT: signed with `JWT_SECRET`, expires after 8 hours; the role is read from the database on every call
- Login errors say "Invalid email or password" for both cases, so attackers learn nothing
- Login lockout: 5 wrong passwords for one email in 5 minutes returns 429. The counter lives in memory, so it resets when the server restarts; a production app would keep it in the database or Redis
- The token is kept in `localStorage`. This is simple but readable by injected scripts; React escapes all text, and a production app could use an httpOnly cookie instead

## Project structure

```
api/index.py              Vercel entry point (serves the backend under /api)
backend/main.py           All endpoints, validation, login checks, booking rules
backend/db.py             Connections, transactions, migration runner
backend/security.py       Password hashing and JWT
backend/seed.py           Admin account and demo data (python seed.py --reset)
backend/migrations/       SQL files that build the tables
backend/test_api.py       39 API tests
frontend/src/pages/       Login, Book, My bookings, Admin dashboard, slots, bookings
frontend/src/components/  Layout, route guard, modal, slot card, date strip, UI pieces
frontend/src/context/     Login state and toast messages
frontend/src/api.js       Every call to the backend
frontend/src/__tests__/   34 UI tests
vercel.json               Vercel settings
```