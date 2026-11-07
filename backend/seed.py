"""Start-up work: create the database, run migrations, add the admin account and demo data.

Demo data is added only when the tables are empty, so deleting it later keeps it deleted.

Commands (run from the backend folder):
  python seed.py            add demo data if the tables are empty
  python seed.py --reset    DELETE everything and add fresh demo data starting from today
                            (use this on demo day, because demo slots are created relative to today)

Set SEED_DEMO=0 to skip demo customers and slots (the admin account is still created).
"""
import os
import random
import sys
from datetime import datetime, timedelta

import db
import security

ADMIN_NAME = "Sathvik"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "saisathvik@gmail.com").lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")
DEMO_PASSWORD = "Demo@1234"

# The first customer is the "Customer demo" login shown on the login page.
DEMO_CUSTOMERS = [
    ("Aarav Sharma", "aarav.sharma@gmail.com"),
    ("Ananya Reddy", "ananya.reddy@gmail.com"),
    ("Rohan Iyer", "rohan.iyer@outlook.com"),
    ("Priya Nair", "priya.nair@gmail.com"),
    ("Vikram Singh", "vikram.singh@yahoo.in"),
    ("Sneha Patil", "sneha.patil@gmail.com"),
    ("Karthik Raman", "karthik.raman@gmail.com"),
    ("Meera Joshi", "meera.joshi@outlook.com"),
    ("Arjun Menon", "arjun.menon@gmail.com"),
    ("Divya Krishnan", "divya.krishnan@gmail.com"),
    ("Imran Qureshi", "imran.qureshi@gmail.com"),
    ("Lakshmi Prasad", "lakshmi.prasad@gmail.com"),
]

# (service, first slot, end of window, minutes per slot, capacity, open on Saturdays?)
DEMO_SERVICES = [
    ("General Consultation", "09:00", "13:00", 30, 1, True),
    ("Dental Checkup", "10:00", "13:00", 45, 1, True),
    ("Eye Checkup", "09:30", "12:30", 30, 1, False),
    ("Physiotherapy", "14:00", "17:00", 60, 2, False),
    ("Dermatology", "15:00", "18:00", 30, 1, False),
]

NOTES = {
    "General Consultation": ["Fever and cold since two days", "Routine health check", "Follow-up after last visit", "Headache for a week", None, None],
    "Dental Checkup": ["Tooth sensitivity on the left side", "Scaling and cleaning", "First visit", None, None],
    "Eye Checkup": ["Blurry vision while reading", "Annual eye test", "Need new spectacles", None],
    "Physiotherapy": ["Knee pain after running", "Lower back pain", "Shoulder stiffness", None, None],
    "Dermatology": ["Skin allergy on arms", "Acne treatment follow-up", "Hair fall consultation", None],
}


def _create_user(cur, name, email, password, role):
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    existing = cur.fetchone()
    if existing:                      # already there: skip the slow password hashing
        return existing["id"]
    cur.execute(
        "INSERT INTO users (name, email, password_hash, role) VALUES (%s,%s,%s,%s) RETURNING id",
        (name, email, security.hash_password(password), role),
    )
    return cur.fetchone()["id"]


def seed_admin():
    with db.transaction() as cur:
        _create_user(cur, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, "admin")


def _day_slots(day):
    """The (service, start, end, capacity) pieces the clinic offers on one day. Sundays are closed."""
    if day.weekday() == 6:
        return []
    pieces = []
    for service, start, end, minutes, capacity, saturdays in DEMO_SERVICES:
        if day.weekday() == 5 and not saturdays:
            continue
        cursor = datetime.combine(day, datetime.strptime(start, "%H:%M").time())
        stop = datetime.combine(day, datetime.strptime(end, "%H:%M").time())
        while cursor + timedelta(minutes=minutes) <= stop:
            pieces.append((service, cursor.time(), (cursor + timedelta(minutes=minutes)).time(), capacity))
            cursor += timedelta(minutes=minutes)
    return pieces


def seed_demo(force=False):
    today = db.today_local()
    rng = random.Random(2026)  # same "random" choices every time, so the demo looks the same
    with db.transaction() as cur:
        cur.execute("SELECT (SELECT COUNT(*) FROM slots) AS slots, (SELECT COUNT(*) FROM users WHERE role='customer') AS customers")
        counts = cur.fetchone()
        if not force and (counts["slots"] or counts["customers"]):
            return

        user_ids = [_create_user(cur, n, e, DEMO_PASSWORD, "customer") for n, e in DEMO_CUSTOMERS]

        # 1. Slots: the last 10 days (history) and the next 14 days
        slots = []  # dicts: id, service, day, start, end, capacity, used
        for offset in range(-10, 15):
            day = today + timedelta(days=offset)
            for service, start, end, capacity in _day_slots(day):
                cur.execute(
                    "INSERT INTO slots (service, slot_date, start_time, end_time, capacity) VALUES (%s,%s,%s,%s,%s) "
                    "ON CONFLICT DO NOTHING RETURNING id",
                    (service, day, start, end, capacity),
                )
                row = cur.fetchone()
                if row:
                    slots.append({"id": row["id"], "service": service, "day": day, "start": start, "end": end, "capacity": capacity, "used": 0})

        busy = {uid: [] for uid in user_ids}  # (day, start, end) the person already has

        def can_take(uid, s):
            if s["used"] >= s["capacity"]:
                return False
            return not any(d == s["day"] and a < s["end"] and b > s["start"] for d, a, b in busy[uid])

        def book(uid, s, status="booked"):
            note = rng.choice(NOTES[s["service"]])
            cur.execute(
                "INSERT INTO bookings (user_id, slot_id, status, note, cancelled_at) VALUES (%s,%s,%s,%s,%s)",
                (uid, s["id"], status, note, datetime.now() - timedelta(days=1) if status == "cancelled" else None),
            )
            if status == "booked":
                s["used"] += 1
                busy[uid].append((s["day"], s["start"], s["end"]))

        past = [s for s in slots if s["day"] < today]
        todays = [s for s in slots if s["day"] == today]
        future = [s for s in slots if s["day"] > today]

        # 2. History: every customer has 1-3 earlier visits (the first customer, the demo login, has 3)
        for i, uid in enumerate(user_ids):
            for s in rng.sample(past, 3 if i == 0 else rng.randint(1, 3)):
                if can_take(uid, s):
                    book(uid, s)

        # 3. Today's appointments, so the admin dashboard has something to show
        for uid in rng.sample(user_ids[1:], min(5, len(user_ids) - 1)):
            for s in rng.sample(todays, min(len(todays), 3)):
                if can_take(uid, s):
                    book(uid, s)
                    break

        # 4. Upcoming appointments: the demo customer gets 2, everyone else 1-2
        for i, uid in enumerate(user_ids):
            wanted = 2 if i == 0 else rng.randint(1, 2)
            tries = 0
            while wanted and tries < 40:
                tries += 1
                s = rng.choice(future[:150])
                if can_take(uid, s):
                    book(uid, s)
                    wanted -= 1

        # 5. A few cancelled bookings so the "Cancelled" tab has records
        for uid in [user_ids[0], user_ids[2], user_ids[4], user_ids[7]]:
            s = rng.choice(future[:120])
            book(uid, s, status="cancelled")


def reset_demo():
    """Delete every user, slot and booking, then add fresh demo data. For local use and demo day."""
    db.run("TRUNCATE bookings, slots, users RESTART IDENTITY CASCADE", fetch=None)
    seed_admin()
    seed_demo(force=True)


def bootstrap():
    """Called once when the server starts."""
    db.init_db()
    seed_admin()
    if os.getenv("SEED_DEMO", "1") != "0":
        seed_demo()


if __name__ == "__main__":
    db.init_db()
    if "--reset" in sys.argv:
        reset_demo()
        print("Done. All data was replaced with fresh demo data.")
    else:
        seed_admin()
        seed_demo()
        print("Done. Demo data is in place.")
    print(f"Admin login:    {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print(f"Customer login: {DEMO_CUSTOMERS[0][1]} / {DEMO_PASSWORD}")
