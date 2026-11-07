"""API tests: run with   python -m pytest -q   (from the backend folder)."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import db


# ---------------------------------------------------------------- helpers
def register(client, name="Test User", email="user@test.com", password="Pass1234"):
    r = client.post("/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def admin_headers(client):
    r = client.post("/auth/login", json={"email": "admin@test.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def make_slot(client, admin, days=3, start="10:00", end="10:30", capacity=1, service="General Consultation"):
    day = db.today_local() + timedelta(days=days)
    r = client.post("/slots", headers=admin, json={
        "service": service, "slot_date": str(day), "start_time": start, "end_time": end, "capacity": capacity})
    assert r.status_code == 201, r.text
    return r.json()


def insert_past_slot():
    """The API refuses past slots, so put one straight into the database."""
    row = db.run(
        f"INSERT INTO slots (service, slot_date, start_time, end_time, capacity) "
        f"VALUES ('Old', {db.TODAY_LOCAL} - 2, '09:00', '09:30', 1) RETURNING id", fetch="one")
    return row["id"]


# ---------------------------------------------------------------- auth
def test_register_returns_token_and_customer_role(client):
    r = client.post("/auth/register", json={"name": "Asha", "email": "ASHA@Test.com", "password": "Pass1234"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["role"] == "customer"
    assert body["user"]["email"] == "asha@test.com"  # saved in lower case
    assert "password" not in str(body).lower().replace("password_hash", "")


def test_register_duplicate_email_is_409(client):
    register(client)
    r = client.post("/auth/register", json={"name": "Other", "email": "USER@test.com", "password": "Pass1234"})
    assert r.status_code == 409


def test_register_validation(client):
    bad_email = client.post("/auth/register", json={"name": "Asha", "email": "nope", "password": "Pass1234"})
    short_pw = client.post("/auth/register", json={"name": "Asha", "email": "a@b.com", "password": "abc1"})
    no_digit = client.post("/auth/register", json={"name": "Asha", "email": "a@b.com", "password": "abcdefgh"})
    short_name = client.post("/auth/register", json={"name": "A", "email": "a@b.com", "password": "Pass1234"})
    for r in (bad_email, short_pw, no_digit, short_name):
        assert r.status_code == 422
        assert r.json()["errors"]
    assert "email" in bad_email.json()["errors"]
    assert "password" in short_pw.json()["errors"]


def test_login_success_and_failures(client):
    register(client)
    ok = client.post("/auth/login", json={"email": "user@test.com", "password": "Pass1234"})
    assert ok.status_code == 200 and ok.json()["token"]
    wrong_pw = client.post("/auth/login", json={"email": "user@test.com", "password": "WrongPass1"})
    unknown = client.post("/auth/login", json={"email": "ghost@test.com", "password": "Pass1234"})
    assert wrong_pw.status_code == 401 and unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]  # does not reveal which part was wrong


def test_password_is_stored_hashed(client):
    register(client)
    row = db.run("SELECT password_hash FROM users WHERE email = 'user@test.com'", fetch="one")
    assert row["password_hash"].startswith("$2") and "Pass1234" not in row["password_hash"]


def test_me_needs_a_valid_token(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401
    headers = register(client)
    r = client.get("/auth/me", headers=headers)
    assert r.status_code == 200 and r.json()["email"] == "user@test.com"


# ---------------------------------------------------------------- roles (RBAC)
def test_slots_need_login(client):
    assert client.get("/slots").status_code == 401


def test_customer_cannot_use_admin_routes(client):
    user = register(client)
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    body = {"service": "X Service", "slot_date": slot["slot_date"], "start_time": "11:00", "end_time": "11:30", "capacity": 1}
    assert client.post("/slots", headers=user, json=body).status_code == 403
    assert client.put(f"/slots/{slot['id']}", headers=user, json=body).status_code == 403
    assert client.delete(f"/slots/{slot['id']}", headers=user).status_code == 403
    assert client.get("/admin/bookings", headers=user).status_code == 403
    assert client.get("/admin/stats", headers=user).status_code == 403


def test_admin_cannot_book(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    assert client.post("/bookings", headers=admin, json={"slot_id": slot["id"]}).status_code == 403


# ---------------------------------------------------------------- slots
def test_admin_creates_and_lists_slot(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=2)
    assert slot["spots_left"] == 2 and slot["booked_count"] == 0
    user = register(client)
    listing = client.get("/slots", headers=user).json()
    assert [s["id"] for s in listing] == [slot["id"]]


def test_slot_validation(client):
    admin = admin_headers(client)
    day = str(db.today_local() + timedelta(days=2))
    past = str(db.today_local() - timedelta(days=1))
    base = {"service": "Checkup", "slot_date": day, "start_time": "10:00", "end_time": "10:30", "capacity": 1}
    assert client.post("/slots", headers=admin, json={**base, "end_time": "09:00"}).status_code == 422
    assert client.post("/slots", headers=admin, json={**base, "capacity": 0}).status_code == 422
    assert client.post("/slots", headers=admin, json={**base, "slot_date": past}).status_code == 422
    assert client.post("/slots", headers=admin, json={**base, "service": " "}).status_code == 422


def test_duplicate_slot_is_409(client):
    admin = admin_headers(client)
    make_slot(client, admin)
    day = str(db.today_local() + timedelta(days=3))
    r = client.post("/slots", headers=admin, json={
        "service": "General Consultation", "slot_date": day, "start_time": "10:00", "end_time": "10:20", "capacity": 1})
    assert r.status_code == 409


def test_list_hides_past_and_filters(client):
    admin = admin_headers(client)
    insert_past_slot()
    a = make_slot(client, admin, days=3, service="Dental Checkup")
    b = make_slot(client, admin, days=4, service="Physiotherapy")
    user = register(client)
    ids = [s["id"] for s in client.get("/slots", headers=user).json()]
    assert ids == [a["id"], b["id"]]  # past slot hidden, sorted by date
    by_service = client.get("/slots", headers=user, params={"service": "Physiotherapy"}).json()
    assert [s["id"] for s in by_service] == [b["id"]]
    by_date = client.get("/slots", headers=user, params={"date": a["slot_date"]}).json()
    assert [s["id"] for s in by_date] == [a["id"]]


def test_available_only_hides_full_slots(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    user = register(client)
    client.post("/bookings", headers=user, json={"slot_id": slot["id"]})
    other = register(client, email="two@test.com")
    assert client.get("/slots", headers=other, params={"available_only": True}).json() == []
    assert len(client.get("/slots", headers=other).json()) == 1  # still visible, marked full
    assert client.get("/slots", headers=other).json()[0]["spots_left"] == 0


def test_bulk_slots_skip_weekends_and_duplicates(client):
    admin = admin_headers(client)
    start = db.today_local() + timedelta(days=1)
    body = {"service": "Dental Checkup", "date_from": str(start), "date_to": str(start + timedelta(days=13)),
            "start_time": "09:00", "end_time": "11:00", "duration_minutes": 30, "capacity": 1, "weekdays_only": True}
    r = client.post("/slots/bulk", headers=admin, json=body)
    assert r.status_code == 201
    weekdays = sum(1 for i in range(14) if (start + timedelta(days=i)).weekday() < 5)
    assert r.json()["created"] == weekdays * 4          # 09:00-11:00 in 30 minute pieces = 4 per day
    again = client.post("/slots/bulk", headers=admin, json=body).json()
    assert again["created"] == 0 and again["skipped"] == weekdays * 4


def test_bulk_validation(client):
    admin = admin_headers(client)
    d = str(db.today_local() + timedelta(days=1))
    base = {"service": "Dental", "date_from": d, "date_to": d, "start_time": "09:00", "end_time": "10:00",
            "duration_minutes": 30, "capacity": 1}
    assert client.post("/slots/bulk", headers=admin, json={**base, "date_to": str(db.today_local() + timedelta(days=60))}).status_code == 422
    assert client.post("/slots/bulk", headers=admin, json={**base, "duration_minutes": 120}).status_code == 422


def test_update_slot_rules(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=3)
    user = register(client)
    client.post("/bookings", headers=user, json={"slot_id": slot["id"]})
    body = {"service": slot["service"], "slot_date": slot["slot_date"], "start_time": "10:00", "end_time": "10:30", "capacity": 5}
    assert client.put(f"/slots/{slot['id']}", headers=admin, json=body).json()["capacity"] == 5
    assert client.put(f"/slots/{slot['id']}", headers=admin, json={**body, "capacity": 1}).status_code == 200  # 1 booking, ok
    client.post("/bookings", headers=register(client, email="b@test.com"), json={"slot_id": slot["id"]}) # now full -> 409
    two = make_slot(client, admin, start="12:00", end="12:30", capacity=2)
    client.post("/bookings", headers=user, json={"slot_id": two["id"]})
    client.post("/bookings", headers=register(client, email="c@test.com"), json={"slot_id": two["id"]})
    low = {"service": two["service"], "slot_date": two["slot_date"], "start_time": "12:00", "end_time": "12:30", "capacity": 1}
    assert client.put(f"/slots/{two['id']}", headers=admin, json=low).status_code == 409   # 2 booked, cannot go to 1
    moved = {**low, "capacity": 2, "start_time": "13:00", "end_time": "13:30"}
    assert client.put(f"/slots/{two['id']}", headers=admin, json=moved).status_code == 409  # time locked while booked


def test_delete_slot_blocked_while_booked(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    user = register(client)
    booking = client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).json()
    assert client.delete(f"/slots/{slot['id']}", headers=admin).status_code == 409
    client.patch(f"/bookings/{booking['id']}/cancel", headers=user)
    assert client.delete(f"/slots/{slot['id']}", headers=admin).status_code == 200
    assert client.delete(f"/slots/{slot['id']}", headers=admin).status_code == 404


# ---------------------------------------------------------------- bookings
def test_book_a_slot(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=2)
    user = register(client)
    r = client.post("/bookings", headers=user, json={"slot_id": slot["id"], "note": "  First visit  "})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "booked" and body["note"] == "First visit" and body["service"] == slot["service"]
    assert body["can_cancel"] and body["can_reschedule"]
    listing = client.get("/slots", headers=user).json()[0]
    assert listing["spots_left"] == 1 and listing["my_booking_id"] == body["id"]


def test_cannot_book_same_slot_twice(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=5)
    user = register(client)
    assert client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).status_code == 201
    assert client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).status_code == 409


def test_full_slot_is_409(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=1)
    first, second = register(client), register(client, email="two@test.com")
    assert client.post("/bookings", headers=first, json={"slot_id": slot["id"]}).status_code == 201
    r = client.post("/bookings", headers=second, json={"slot_id": slot["id"]})
    assert r.status_code == 409 and "fully booked" in r.json()["detail"]


def test_overlapping_appointments_are_blocked(client):
    admin = admin_headers(client)
    a = make_slot(client, admin, start="10:00", end="10:30", service="General Consultation")
    b = make_slot(client, admin, start="10:15", end="10:45", service="Dental Checkup")
    c = make_slot(client, admin, start="10:30", end="11:00", service="Physiotherapy")   # touches, does not overlap
    user = register(client)
    assert client.post("/bookings", headers=user, json={"slot_id": a["id"]}).status_code == 201
    assert client.post("/bookings", headers=user, json={"slot_id": b["id"]}).status_code == 409
    assert client.post("/bookings", headers=user, json={"slot_id": c["id"]}).status_code == 201


def test_cannot_book_past_or_missing_slot(client):
    user = register(client)
    assert client.post("/bookings", headers=user, json={"slot_id": insert_past_slot()}).status_code == 400
    assert client.post("/bookings", headers=user, json={"slot_id": 99999}).status_code == 404
    assert client.post("/bookings", headers=user, json={}).status_code == 422


def test_note_too_long_is_422(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    user = register(client)
    assert client.post("/bookings", headers=user, json={"slot_id": slot["id"], "note": "x" * 201}).status_code == 422


def test_my_bookings_shows_only_my_own(client):
    admin = admin_headers(client)
    s1, s2 = make_slot(client, admin, start="09:00", end="09:30"), make_slot(client, admin, start="11:00", end="11:30")
    me, other = register(client), register(client, email="other@test.com")
    mine = client.post("/bookings", headers=me, json={"slot_id": s1["id"]}).json()
    client.post("/bookings", headers=other, json={"slot_id": s2["id"]})
    listing = client.get("/bookings/mine", headers=me).json()
    assert [b["id"] for b in listing] == [mine["id"]]
    client.patch(f"/bookings/{mine['id']}/cancel", headers=me)
    assert client.get("/bookings/mine", headers=me, params={"status": "cancelled"}).json()[0]["status"] == "cancelled"
    assert client.get("/bookings/mine", headers=me, params={"status": "booked"}).json() == []


def test_cannot_touch_someone_elses_booking(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    other_slot = make_slot(client, admin, start="14:00", end="14:30")
    owner, intruder = register(client), register(client, email="intruder@test.com")
    booking = client.post("/bookings", headers=owner, json={"slot_id": slot["id"]}).json()
    assert client.patch(f"/bookings/{booking['id']}/cancel", headers=intruder).status_code == 404
    assert client.put(f"/bookings/{booking['id']}/reschedule", headers=intruder, json={"slot_id": other_slot["id"]}).status_code == 404
    assert client.get(f"/bookings/mine", headers=intruder).json() == []
    assert fetch_status(booking["id"]) == "booked"  # nothing changed


def fetch_status(booking_id):
    return db.run("SELECT status FROM bookings WHERE id = %s", (booking_id,), fetch="one")["status"]


def test_cancel_frees_the_slot(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=1)
    first, second = register(client), register(client, email="two@test.com")
    booking = client.post("/bookings", headers=first, json={"slot_id": slot["id"]}).json()
    r = client.patch(f"/bookings/{booking['id']}/cancel", headers=first)
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and not r.json()["can_cancel"]
    assert client.patch(f"/bookings/{booking['id']}/cancel", headers=first).status_code == 400  # already cancelled
    assert client.post("/bookings", headers=second, json={"slot_id": slot["id"]}).status_code == 201
    assert client.post("/bookings", headers=first, json={"slot_id": slot["id"]}).status_code == 409  # full again


def test_cancelled_booking_row_is_kept_for_history(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    user = register(client)
    booking = client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).json()
    client.patch(f"/bookings/{booking['id']}/cancel", headers=user)
    assert db.run("SELECT COUNT(*) AS n FROM bookings", fetch="one")["n"] == 1
    # and the same customer may book that slot again later
    assert client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).status_code == 201


def test_reschedule(client):
    admin = admin_headers(client)
    old, new = make_slot(client, admin, start="09:00", end="09:30"), make_slot(client, admin, start="15:00", end="15:30")
    user, other = register(client), register(client, email="two@test.com")
    booking = client.post("/bookings", headers=user, json={"slot_id": old["id"]}).json()
    r = client.put(f"/bookings/{booking['id']}/reschedule", headers=user, json={"slot_id": new["id"]})
    assert r.status_code == 200 and r.json()["slot_id"] == new["id"] and r.json()["status"] == "booked"
    assert client.post("/bookings", headers=other, json={"slot_id": old["id"]}).status_code == 201  # old slot is free again
    assert client.put(f"/bookings/{booking['id']}/reschedule", headers=user, json={"slot_id": new["id"]}).status_code == 400  # same slot


def test_reschedule_into_full_or_past_or_overlap_fails(client):
    admin = admin_headers(client)
    mine, full = make_slot(client, admin, start="09:00", end="09:30"), make_slot(client, admin, start="11:00", end="11:30")
    busy = make_slot(client, admin, start="13:00", end="13:30", service="Dental Checkup")
    user, other = register(client), register(client, email="two@test.com")
    booking = client.post("/bookings", headers=user, json={"slot_id": mine["id"]}).json()
    client.post("/bookings", headers=other, json={"slot_id": full["id"]})
    client.post("/bookings", headers=user, json={"slot_id": busy["id"]})
    path = f"/bookings/{booking['id']}/reschedule"
    assert client.put(path, headers=user, json={"slot_id": full["id"]}).status_code == 409      # full
    assert client.put(path, headers=user, json={"slot_id": insert_past_slot()}).status_code == 400  # past
    overlapping = make_slot(client, admin, start="13:15", end="13:45", service="Physiotherapy")
    assert client.put(path, headers=user, json={"slot_id": overlapping["id"]}).status_code == 409   # clashes with `busy`
    assert client.put(path, headers=user, json={"slot_id": 99999}).status_code == 404
    still = client.get("/bookings/mine", headers=user, params={"status": "booked"}).json()
    assert booking["id"] in [b["id"] for b in still]
    assert [b for b in still if b["id"] == booking["id"]][0]["slot_id"] == mine["id"]  # nothing moved


def test_cannot_reschedule_cancelled_booking(client):
    admin = admin_headers(client)
    a, b = make_slot(client, admin, start="09:00", end="09:30"), make_slot(client, admin, start="11:00", end="11:30")
    user = register(client)
    booking = client.post("/bookings", headers=user, json={"slot_id": a["id"]}).json()
    client.patch(f"/bookings/{booking['id']}/cancel", headers=user)
    assert client.put(f"/bookings/{booking['id']}/reschedule", headers=user, json={"slot_id": b["id"]}).status_code == 400


def test_past_appointment_cannot_be_cancelled_by_customer(client):
    user = register(client)
    uid = db.run("SELECT id FROM users WHERE email = 'user@test.com'", fetch="one")["id"]
    past = insert_past_slot()
    bid = db.run("INSERT INTO bookings (user_id, slot_id) VALUES (%s, %s) RETURNING id", (uid, past), fetch="one")["id"]
    assert client.patch(f"/bookings/{bid}/cancel", headers=user).status_code == 400
    r = client.get("/bookings/mine", headers=user).json()[0]
    assert r["is_past"] and not r["can_cancel"] and not r["can_reschedule"]


def test_two_people_racing_for_the_last_spot(client):
    """Five customers press Book at the same moment on a 1-spot slot: exactly one wins."""
    admin = admin_headers(client)
    slot = make_slot(client, admin, capacity=1)
    users = [register(client, name=f"Racer {i}", email=f"racer{i}@test.com") for i in range(5)]

    def attempt(headers):
        return client.post("/bookings", headers=headers, json={"slot_id": slot["id"]}).status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        codes = list(pool.map(attempt, users))
    assert sorted(codes) == [201, 409, 409, 409, 409]
    n = db.run("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = %s AND status='booked'", (slot["id"],), fetch="one")["n"]
    assert n == 1


# ---------------------------------------------------------------- admin
def test_admin_sees_and_cancels_any_booking(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin)
    user = register(client, name="Meena Rao", email="meena@test.com")
    booking = client.post("/bookings", headers=user, json={"slot_id": slot["id"]}).json()
    rows = client.get("/admin/bookings", headers=admin).json()
    assert rows[0]["user_name"] == "Meena Rao" and rows[0]["user_email"] == "meena@test.com"
    r = client.patch(f"/bookings/{booking['id']}/cancel", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"


def test_admin_bookings_filters(client):
    admin = admin_headers(client)
    a = make_slot(client, admin, days=3, service="Dental Checkup")
    b = make_slot(client, admin, days=4, service="Physiotherapy")
    meena, raj = register(client, name="Meena Rao", email="meena@test.com"), register(client, name="Raj Kumar", email="raj@test.com")
    client.post("/bookings", headers=meena, json={"slot_id": a["id"]})
    cancelled = client.post("/bookings", headers=raj, json={"slot_id": b["id"]}).json()
    client.patch(f"/bookings/{cancelled['id']}/cancel", headers=raj)
    get = lambda **p: client.get("/admin/bookings", headers=admin, params=p).json()
    assert len(get()) == 2
    assert [r["user_name"] for r in get(search="meena")] == ["Meena Rao"]
    assert [r["user_name"] for r in get(status="cancelled")] == ["Raj Kumar"]
    assert [r["user_name"] for r in get(service="Physiotherapy")] == ["Raj Kumar"]
    assert [r["user_name"] for r in get(date=a["slot_date"])] == ["Meena Rao"]
    assert get(search="%") == []   # wildcard characters are treated as plain text
    assert client.get("/admin/bookings", headers=admin, params={"status": "nonsense"}).status_code == 422


def test_admin_stats(client):
    admin = admin_headers(client)
    slot = make_slot(client, admin, days=2, capacity=3)
    user = register(client)
    client.post("/bookings", headers=user, json={"slot_id": slot["id"]})
    s = client.get("/admin/stats", headers=admin).json()
    assert s["upcoming_bookings"] == 1 and s["open_spots"] == 2 and s["customers"] == 1
    assert len(s["next_7_days"]) == 7
    day = [d for d in s["next_7_days"] if d["day"] == slot["slot_date"]][0]
    assert day["capacity"] == 3 and day["booked"] == 1


def test_sql_injection_text_is_harmless(client):
    r = client.post("/auth/login", json={"email": "' OR 1=1 --", "password": "x"})
    assert r.status_code == 401
    assert db.run("SELECT COUNT(*) AS n FROM users", fetch="one")["n"] == 1


def test_login_is_blocked_after_five_failures(client):
    import main
    main.FAILED_LOGINS.clear()
    register(client)
    for _ in range(5):
        r = client.post("/auth/login", json={"email": "user@test.com", "password": "Wrong1234"})
        assert r.status_code == 401
    blocked = client.post("/auth/login", json={"email": "user@test.com", "password": "Pass1234"})
    assert blocked.status_code == 429
    main.FAILED_LOGINS.clear()