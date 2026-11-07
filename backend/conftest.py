"""Test setup. Runs before the tests and points everything at a separate TEST database.

The tests EMPTY the tables, so they refuse to run against a cloud database.
"""
import os
import sys

if os.getenv("DATABASE_URL"):
    sys.exit("Tests empty the tables. Clear DATABASE_URL first (PowerShell: $env:DATABASE_URL='') and run again.")

os.environ["DB_NAME"] = "service_booking_test"
os.environ["BCRYPT_ROUNDS"] = "4"      # fast hashing, tests only
os.environ["SEED_DEMO"] = "0"          # tests create their own data
os.environ["ADMIN_EMAIL"] = "admin@test.com"
os.environ["ADMIN_PASSWORD"] = "Admin@123"

import pytest
from fastapi.testclient import TestClient

import db
import main
import seed


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    seed.bootstrap()


@pytest.fixture(autouse=True)
def clean_tables():
    db.run("TRUNCATE bookings, slots, users RESTART IDENTITY CASCADE", fetch=None)
    seed.seed_admin()
    yield


@pytest.fixture()
def client():
    return TestClient(main.app)
