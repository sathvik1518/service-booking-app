"""CareSlot API: appointment booking for a clinic or service centre.

Run:  python -m uvicorn main:app --reload --port 8000   (from the backend folder)
Docs: http://localhost:8000/docs

Roles
  customer -> register, see slots, book / reschedule / cancel own bookings
  admin    -> manage slots, see and cancel every booking
"""
import os
import re
import time as clock
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from typing import Literal, Optional

import psycopg2
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator, model_validator
from psycopg2 import errors as pgerr

import db
import security
import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed.bootstrap()  # create database, run migrations, add the admin account and demo data
    yield


app = FastAPI(title="CareSlot API", version="1.0", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

bearer = HTTPBearer(auto_error=False)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


# --------------------------------------------------------------------------------------
# Error handling: always answer with {"detail": "...", "errors": {field: message}}
# --------------------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = {}
    for err in exc.errors():
        field = str(err["loc"][-1]) if err["loc"] else "body"
        message = str(err["msg"]).replace("Value error, ", "")
        errors.setdefault(field, message)
    first = next(iter(errors.values()), "Invalid input")
    return JSONResponse(status_code=422, content={"detail": first, "errors": errors})


@app.exception_handler(psycopg2.OperationalError)
async def database_down_handler(request: Request, exc: psycopg2.OperationalError):
    return JSONResponse(status_code=503, content={"detail": "Database is not reachable right now. Please try again."})


# --------------------------------------------------------------------------------------
# Input models (Pydantic checks every request before our code runs)
# --------------------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        v = " ".join(v.split())
        if len(v) < 2 or len(v) > 80:
            raise ValueError("Name must be 2 to 80 characters")
        return v

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        v = v.strip().lower()
        if len(v) > 160 or not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("password")
    @classmethod
    def check_password(cls, v):
        if len(v) < 8 or len(v) > 72:
            raise ValueError("Password must be 8 to 72 characters")
        if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
            raise ValueError("Password needs at least one letter and one number")
        return v


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def clean_email(cls, v):
        return v.strip().lower()


class SlotIn(BaseModel):
    service: str
    slot_date: date
    start_time: time
    end_time: time
    capacity: int = Field(default=1, ge=1, le=50)

    @field_validator("service")
    @classmethod
    def check_service(cls, v):
        v = " ".join(v.split())
        if len(v) < 2 or len(v) > 80:
            raise ValueError("Service name must be 2 to 80 characters")
        return v

    @field_validator("start_time", "end_time")
    @classmethod
    def drop_seconds(cls, v):
        return v.replace(second=0, microsecond=0, tzinfo=None)

    @model_validator(mode="after")
    def check_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after the start time")
        return self


class BulkSlotsIn(BaseModel):
    """Create many slots at once, for example 09:00-12:00 in 30 minute pieces for a week."""
    service: str
    date_from: date
    date_to: date
    start_time: time
    end_time: time
    duration_minutes: int = Field(ge=10, le=240)
    capacity: int = Field(default=1, ge=1, le=50)
    weekdays_only: bool = True

    @field_validator("service")
    @classmethod
    def check_service(cls, v):
        v = " ".join(v.split())
        if len(v) < 2 or len(v) > 80:
            raise ValueError("Service name must be 2 to 80 characters")
        return v

    @model_validator(mode="after")
    def check_ranges(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after the start time")
        if self.date_to < self.date_from:
            raise ValueError("The last date must not be before the first date")
        if (self.date_to - self.date_from).days > 30:
            raise ValueError("Choose at most 31 days at a time")
        return self


class BookingIn(BaseModel):
    slot_id: int
    note: Optional[str] = Field(default=None, max_length=200)

    @field_validator("note")
    @classmethod
    def clean_note(cls, v):
        v = (v or "").strip()
        return v or None


class RescheduleIn(BaseModel):
    slot_id: int


# --------------------------------------------------------------------------------------
# Login helpers: who is calling, and are they allowed?
# --------------------------------------------------------------------------------------
def public_user(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}


def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    """Read the JWT from the 'Authorization: Bearer ...' header. 401 if it is missing or bad."""
    unauthorized = HTTPException(401, "Please log in to continue", headers={"WWW-Authenticate": "Bearer"})
    if creds is None:
        raise unauthorized
    payload = security.decode_token(creds.credentials)
    if payload is None:
        raise HTTPException(401, "Your session has expired. Please log in again.", headers={"WWW-Authenticate": "Bearer"})
    row = db.run("SELECT id, name, email, role FROM users WHERE id = %s", (int(payload["sub"]),), fetch="one")
    if row is None:
        raise unauthorized
    return row  # the role comes from the database, so a role change takes effect at once


def require_admin(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Only admins can do this")
    return user


def require_customer(user=Depends(current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Only customers can book appointments")
    return user


# --------------------------------------------------------------------------------------
# Shared SQL
# --------------------------------------------------------------------------------------
SLOT_COLUMNS = f"""
    s.id, s.service, s.slot_date, s.start_time, s.end_time, s.capacity,
    COALESCE(b.cnt, 0)::int AS booked_count,
    (s.capacity - COALESCE(b.cnt, 0))::int AS spots_left,
    (s.slot_date + s.start_time) <= {db.NOW_LOCAL} AS is_past
"""
SLOT_JOIN = """
    FROM slots s
    LEFT JOIN (SELECT slot_id, COUNT(*) AS cnt FROM bookings WHERE status = 'booked' GROUP BY slot_id) b
           ON b.slot_id = s.id
"""

BOOKING_SELECT = f"""
    SELECT bk.id, bk.status, bk.note, bk.created_at, bk.cancelled_at,
           u.id AS user_id, u.name AS user_name, u.email AS user_email,
           s.id AS slot_id, s.service, s.slot_date, s.start_time, s.end_time,
           (s.slot_date + s.start_time) <= {db.NOW_LOCAL} AS is_past
    FROM bookings bk
    JOIN slots s ON s.id = bk.slot_id
    JOIN users u ON u.id = bk.user_id
"""


def shape_booking(row):
    """Add the two flags the screen needs to decide which buttons to show."""
    row = dict(row)
    active = row["status"] == "booked" and not row["is_past"]
    row["can_cancel"] = active
    row["can_reschedule"] = active
    return row


def fetch_booking(booking_id):
    row = db.run(BOOKING_SELECT + " WHERE bk.id = %s", (booking_id,), fetch="one")
    return shape_booking(row) if row else None


def overlap_exists(cur, user_id, slot_date, start, end, ignore_booking_id=None):
    """Does this customer already have an active booking that overlaps this time?"""
    cur.execute(
        """SELECT 1 FROM bookings bk JOIN slots s ON s.id = bk.slot_id
            WHERE bk.user_id = %s AND bk.status = 'booked' AND s.slot_date = %s
              AND s.start_time < %s AND s.end_time > %s
              AND (%s::int IS NULL OR bk.id <> %s::int)
            LIMIT 1""",
        (user_id, slot_date, end, start, ignore_booking_id, ignore_booking_id),
    )
    return cur.fetchone() is not None


def lock_open_slot(cur, slot_id):
    """Lock the slot row (so nobody else books at the same moment) and check it can be booked.

    Raises 404 / 400 / 409. Returns the slot row. Must run inside db.transaction().
    """
    cur.execute(
        f"""SELECT id, service, slot_date, start_time, end_time, capacity,
                   (slot_date + start_time) <= {db.NOW_LOCAL} AS is_past
              FROM slots WHERE id = %s FOR UPDATE""",
        (slot_id,),
    )
    slot = cur.fetchone()
    if slot is None:
        raise HTTPException(404, "That slot does not exist")
    if slot["is_past"]:
        raise HTTPException(400, "That slot has already started or passed")
    cur.execute("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = %s AND status = 'booked'", (slot_id,))
    if cur.fetchone()["n"] >= slot["capacity"]:
        raise HTTPException(409, "Sorry, that slot is fully booked")
    return slot


# --------------------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "CareSlot API is running", "docs": "/docs"}


FAILED_LOGINS = defaultdict(list)   # email -> times of recent wrong passwords
MAX_FAILS = 5
WINDOW_SECONDS = 300                # 5 minutes


def too_many_failures(email):
    now = clock.time()
    recent = [t for t in FAILED_LOGINS[email] if now - t < WINDOW_SECONDS]
    FAILED_LOGINS[email] = recent
    return len(recent) >= MAX_FAILS


# --------------------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------------------
@app.post("/auth/register", status_code=201)
def register(body: RegisterIn):
    try:
        row = db.run(
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, 'customer') "
            "RETURNING id, name, email, role",
            (body.name, body.email, security.hash_password(body.password)),
            fetch="one",
        )
    except pgerr.UniqueViolation:
        raise HTTPException(409, "An account with this email already exists")
    return {"token": security.create_token(row["id"], row["role"]), "user": public_user(row)}


@app.post("/auth/login")
def login(body: LoginIn):
    if too_many_failures(body.email):
        raise HTTPException(429, "Too many failed attempts. Please try again in a few minutes.")
    row = db.run("SELECT * FROM users WHERE email = %s", (body.email,), fetch="one")
    # Same message for "no such email" and "wrong password" so attackers learn nothing.
    if row is None or not security.verify_password(body.password, row["password_hash"]):
        FAILED_LOGINS[body.email].append(clock.time())
        raise HTTPException(401, "Invalid email or password")
    FAILED_LOGINS.pop(body.email, None)
    return {"token": security.create_token(row["id"], row["role"]), "user": public_user(row)}


@app.get("/auth/me")
def me(user=Depends(current_user)):
    return public_user(user)


# --------------------------------------------------------------------------------------
# Slots
# --------------------------------------------------------------------------------------
@app.get("/services")
def list_services(user=Depends(current_user)):
    rows = db.run(f"SELECT DISTINCT service FROM slots WHERE slot_date >= {db.TODAY_LOCAL} ORDER BY service")
    return [r["service"] for r in rows]


@app.get("/slots")
def list_slots(
    date_on: Optional[date] = Query(None, alias="date"),
    service: Optional[str] = None,
    available_only: bool = False,
    include_past: bool = False,
    user=Depends(current_user),
):
    """Upcoming slots with how many spots are left. Customers also get my_booking_id (their own booking here)."""
    where, params = [], []
    if not (include_past and user["role"] == "admin"):
        where.append(f"(s.slot_date + s.start_time) > {db.NOW_LOCAL}")
    if date_on:
        where.append("s.slot_date = %s")
        params.append(date_on)
    if service:
        where.append("s.service = %s")
        params.append(service)
    if available_only:
        where.append("s.capacity > COALESCE(b.cnt, 0)")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.run(
        f"""SELECT {SLOT_COLUMNS}, mb.id AS my_booking_id
            {SLOT_JOIN}
            LEFT JOIN bookings mb ON mb.slot_id = s.id AND mb.user_id = %s AND mb.status = 'booked'
            {clause}
            ORDER BY s.slot_date, s.start_time, s.service LIMIT 500""",
        [user["id"]] + params,
    )
    return rows


def fetch_slot(slot_id):
    return db.run(f"SELECT {SLOT_COLUMNS} {SLOT_JOIN} WHERE s.id = %s", (slot_id,), fetch="one")


@app.post("/slots", status_code=201)
def create_slot(body: SlotIn, admin=Depends(require_admin)):
    if body.slot_date < db.today_local():
        raise HTTPException(422, "The date cannot be in the past")
    try:
        row = db.run(
            "INSERT INTO slots (service, slot_date, start_time, end_time, capacity) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (body.service, body.slot_date, body.start_time, body.end_time, body.capacity),
            fetch="one",
        )
    except pgerr.UniqueViolation:
        raise HTTPException(409, "A slot for this service already starts at that time")
    return fetch_slot(row["id"])


@app.post("/slots/bulk", status_code=201)
def create_slots_bulk(body: BulkSlotsIn, admin=Depends(require_admin)):
    """Cut a time window into equal pieces for every day in a date range. Existing slots are skipped."""
    today = db.today_local()
    window = timedelta(minutes=body.duration_minutes)
    if datetime.combine(date.today(), body.start_time) + window > datetime.combine(date.today(), body.end_time):
        raise HTTPException(422, "The time window is shorter than one slot")

    planned = []
    day = body.date_from
    while day <= body.date_to:
        if day >= today and not (body.weekdays_only and day.weekday() >= 5):
            start = datetime.combine(day, body.start_time)
            end_of_day = datetime.combine(day, body.end_time)
            while start + window <= end_of_day:
                planned.append((day, start.time(), (start + window).time()))
                start += window
        day += timedelta(days=1)

    if not planned:
        raise HTTPException(422, "No slots to create. Check the dates (past days and weekends are skipped).")
    if len(planned) > 300:
        raise HTTPException(422, f"That would create {len(planned)} slots. The limit is 300 at a time.")

    created = 0
    with db.transaction() as cur:
        for day, start, end in planned:
            cur.execute(
                "INSERT INTO slots (service, slot_date, start_time, end_time, capacity) VALUES (%s,%s,%s,%s,%s) "
                "ON CONFLICT (service, slot_date, start_time) DO NOTHING",
                (body.service, day, start, end, body.capacity),
            )
            created += cur.rowcount
    return {"created": created, "skipped": len(planned) - created}


@app.put("/slots/{slot_id}")
def update_slot(slot_id: int, body: SlotIn, admin=Depends(require_admin)):
    with db.transaction() as cur:
        cur.execute("SELECT id FROM slots WHERE id = %s FOR UPDATE", (slot_id,))
        if cur.fetchone() is None:
            raise HTTPException(404, "Slot not found")
        cur.execute("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = %s AND status = 'booked'", (slot_id,))
        active = cur.fetchone()["n"]
        if body.capacity < active:
            raise HTTPException(409, f"{active} people already booked this slot, so capacity cannot be lower than {active}")
        if active and (body.slot_date, body.start_time, body.end_time) != _slot_times(cur, slot_id):
            raise HTTPException(409, "This slot has bookings, so its date and time cannot change. Cancel the bookings first.")
        try:
            cur.execute(
                "UPDATE slots SET service=%s, slot_date=%s, start_time=%s, end_time=%s, capacity=%s WHERE id=%s",
                (body.service, body.slot_date, body.start_time, body.end_time, body.capacity, slot_id),
            )
        except pgerr.UniqueViolation:
            raise HTTPException(409, "A slot for this service already starts at that time")
    return fetch_slot(slot_id)


def _slot_times(cur, slot_id):
    cur.execute("SELECT slot_date, start_time, end_time FROM slots WHERE id = %s", (slot_id,))
    r = cur.fetchone()
    return (r["slot_date"], r["start_time"], r["end_time"])


@app.delete("/slots/{slot_id}")
def delete_slot(slot_id: int, admin=Depends(require_admin)):
    with db.transaction() as cur:
        cur.execute("SELECT id FROM slots WHERE id = %s FOR UPDATE", (slot_id,))
        if cur.fetchone() is None:
            raise HTTPException(404, "Slot not found")
        cur.execute("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = %s AND status = 'booked'", (slot_id,))
        active = cur.fetchone()["n"]
        if active:
            raise HTTPException(409, f"{active} active booking(s) use this slot. Cancel them first.")
        cur.execute("DELETE FROM slots WHERE id = %s", (slot_id,))
    return {"deleted": slot_id}


# --------------------------------------------------------------------------------------
# Bookings
# --------------------------------------------------------------------------------------
@app.post("/bookings", status_code=201)
def create_booking(body: BookingIn, user=Depends(require_customer)):
    try:
        with db.transaction() as cur:
            slot = lock_open_slot(cur, body.slot_id)
            if overlap_exists(cur, user["id"], slot["slot_date"], slot["start_time"], slot["end_time"]):
                raise HTTPException(409, "You already have an appointment at this time")
            cur.execute(
                "INSERT INTO bookings (user_id, slot_id, note) VALUES (%s, %s, %s) RETURNING id",
                (user["id"], body.slot_id, body.note),
            )
            booking_id = cur.fetchone()["id"]
    except pgerr.UniqueViolation:
        raise HTTPException(409, "You have already booked this slot")
    return fetch_booking(booking_id)


@app.get("/bookings/mine")
def my_bookings(status: Optional[Literal["booked", "cancelled"]] = None, user=Depends(require_customer)):
    where, params = ["bk.user_id = %s"], [user["id"]]
    if status:
        where.append("bk.status = %s")
        params.append(status)
    rows = db.run(
        BOOKING_SELECT + " WHERE " + " AND ".join(where) + " ORDER BY s.slot_date DESC, s.start_time DESC, bk.id DESC",
        params,
    )
    return [shape_booking(r) for r in rows]


def get_owned_booking(booking_id, user):
    """A customer only ever gets their own booking. Someone else's looks like 'not found'."""
    booking = fetch_booking(booking_id)
    if booking is None or (user["role"] != "admin" and booking["user_id"] != user["id"]):
        raise HTTPException(404, "Booking not found")
    return booking


@app.put("/bookings/{booking_id}/reschedule")
def reschedule_booking(booking_id: int, body: RescheduleIn, user=Depends(require_customer)):
    booking = get_owned_booking(booking_id, user)
    if booking["status"] != "booked":
        raise HTTPException(400, "Only active bookings can be rescheduled")
    if booking["is_past"]:
        raise HTTPException(400, "This appointment has already started, so it cannot be changed")
    if body.slot_id == booking["slot_id"]:
        raise HTTPException(400, "Pick a different slot to reschedule")
    try:
        with db.transaction() as cur:
            # Re-read inside the transaction in case it was cancelled a moment ago.
            cur.execute("SELECT status FROM bookings WHERE id = %s FOR UPDATE", (booking_id,))
            if cur.fetchone()["status"] != "booked":
                raise HTTPException(400, "Only active bookings can be rescheduled")
            slot = lock_open_slot(cur, body.slot_id)
            if overlap_exists(cur, user["id"], slot["slot_date"], slot["start_time"], slot["end_time"], booking_id):
                raise HTTPException(409, "You already have an appointment at that time")
            cur.execute(
                "UPDATE bookings SET slot_id = %s, updated_at = now() WHERE id = %s",
                (body.slot_id, booking_id),
            )
    except pgerr.UniqueViolation:
        raise HTTPException(409, "You have already booked that slot")
    return fetch_booking(booking_id)


@app.patch("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, user=Depends(current_user)):
    booking = get_owned_booking(booking_id, user)
    if booking["status"] == "cancelled":
        raise HTTPException(400, "This booking is already cancelled")
    if booking["is_past"] and user["role"] != "admin":
        raise HTTPException(400, "This appointment has already started, so it cannot be cancelled")
    db.run(
        "UPDATE bookings SET status = 'cancelled', cancelled_at = now(), updated_at = now() "
        "WHERE id = %s AND status = 'booked'",
        (booking_id,), fetch=None,
    )
    return fetch_booking(booking_id)


# --------------------------------------------------------------------------------------
# Admin
# --------------------------------------------------------------------------------------
@app.get("/admin/bookings")
def admin_bookings(
    status: Optional[Literal["booked", "cancelled"]] = None,
    date_on: Optional[date] = Query(None, alias="date"),
    service: Optional[str] = None,
    search: Optional[str] = None,
    admin=Depends(require_admin),
):
    where, params = [], []
    if status:
        where.append("bk.status = %s")
        params.append(status)
    if date_on:
        where.append("s.slot_date = %s")
        params.append(date_on)
    if service:
        where.append("s.service = %s")
        params.append(service)
    if search and search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(u.name ILIKE %s OR u.email ILIKE %s)")
        params += [f"%{escaped}%", f"%{escaped}%"]
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.run(BOOKING_SELECT + f" {clause} ORDER BY s.slot_date DESC, s.start_time DESC, bk.id DESC LIMIT 500", params)
    return [shape_booking(r) for r in rows]


@app.get("/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    today = db.today_local()
    upcoming = f"(s.slot_date + s.start_time) > {db.NOW_LOCAL}"
    (counts, per_day) = db.run_many([
        (
            f"""SELECT
                (SELECT COUNT(*) FROM bookings bk JOIN slots s ON s.id = bk.slot_id
                  WHERE bk.status = 'booked' AND {upcoming})::int AS upcoming_bookings,
                (SELECT COALESCE(SUM(s.capacity - COALESCE(b.cnt, 0)), 0) {SLOT_JOIN} WHERE {upcoming})::int AS open_spots,
                (SELECT COUNT(*) FROM users WHERE role = 'customer')::int AS customers,
                (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled'
                    AND cancelled_at > now() - interval '30 days')::int AS cancelled_30d,
                (SELECT COUNT(*) FROM bookings bk JOIN slots s ON s.id = bk.slot_id
                  WHERE bk.status = 'booked' AND s.slot_date = {db.TODAY_LOCAL})::int AS today_bookings""",
            (), "one",
        ),
        (
            """SELECT d::date AS day,
                      COALESCE(SUM(sl.capacity), 0)::int AS capacity,
                      COALESCE(SUM(sl.booked), 0)::int AS booked
                 FROM generate_series(%s::date, %s::date, interval '1 day') d
                 LEFT JOIN (SELECT s.slot_date, s.capacity,
                                   (SELECT COUNT(*) FROM bookings bk WHERE bk.slot_id = s.id AND bk.status = 'booked') AS booked
                              FROM slots s) sl ON sl.slot_date = d::date
                GROUP BY d ORDER BY d""",
            (today, today + timedelta(days=6)), "all",
        ),
    ])
    counts = dict(counts)
    counts["next_7_days"] = per_day
    counts["today"] = today
    return counts