"""Database helpers (PostgreSQL through psycopg2) and the migration runner.

Two modes:
  - DATABASE_URL set   -> use that database (for example Neon in the cloud)
  - DATABASE_URL empty -> use local PostgreSQL with the DB_* settings below
"""
import os
import re
from contextlib import contextmanager
from pathlib import Path

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "service_booking")

# "Now" and "today" are worked out in this time zone, so a 9:00 slot is 9:00 local time.
TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
if not re.fullmatch(r"[A-Za-z_]+(/[A-Za-z_+\-0-9]+)*", TIMEZONE):
    raise RuntimeError("APP_TIMEZONE is not a valid time zone name")

# SQL snippets used in many queries
NOW_LOCAL = f"(now() AT TIME ZONE '{TIMEZONE}')"
TODAY_LOCAL = f"(now() AT TIME ZONE '{TIMEZONE}')::date"

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def connect(dbname=DB_NAME):
    """Open a new connection. Rows come back as dictionaries."""
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        dbname=dbname, cursor_factory=RealDictCursor,
    )


def run(query, params=(), fetch="all"):
    """Run ONE SQL statement. %s placeholders keep user input out of the SQL text (no SQL injection)."""
    conn = connect()
    try:
        with conn:  # commit if it worked, roll back if it failed
            with conn.cursor() as cur:
                cur.execute(query, params)
                if fetch == "all":
                    return cur.fetchall()
                if fetch == "one":
                    return cur.fetchone()
                return None
    finally:
        conn.close()


def run_many(statements):
    """Run several read queries on ONE connection (cloud connections are slow to open).

    statements: list of (query, params, fetch). Returns the results in the same order.
    """
    conn = connect()
    try:
        with conn:
            with conn.cursor() as cur:
                results = []
                for query, params, fetch in statements:
                    cur.execute(query, params)
                    if fetch == "all":
                        results.append(cur.fetchall())
                    elif fetch == "one":
                        results.append(cur.fetchone())
                    else:
                        results.append(None)
                return results
    finally:
        conn.close()


@contextmanager
def transaction():
    """Several statements as ONE all-or-nothing unit.

    Used for booking: lock the slot, check capacity, insert, all together, so two people
    cannot take the last spot at the same moment. Any error rolls everything back.
    """
    conn = connect()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def create_database_if_missing():
    """Local only. A cloud database (Neon) already exists, so skip it there."""
    if DATABASE_URL:
        return
    conn = connect("postgres")
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DB_NAME)))
                print(f"Created database '{DB_NAME}'")
    finally:
        conn.close()


def migrate():
    """Apply every migrations/*.sql file that has not been applied yet, in name order.

    The table schema_migrations remembers which files already ran, so it is safe to run on every start.
    """
    conn = connect()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migrations ("
                    " filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
                )
                # Stops two servers starting at once (for example on Vercel) from migrating together.
                cur.execute("SELECT pg_advisory_xact_lock(727001)")
                cur.execute("SELECT filename FROM schema_migrations")
                done = {row["filename"] for row in cur.fetchall()}
                for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                    if path.name in done:
                        continue
                    cur.execute(path.read_text())
                    cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (path.name,))
                    print(f"Applied migration {path.name}")
    finally:
        conn.close()


def today_local():
    """Today's date in the app time zone (a Python date)."""
    return run(f"SELECT {TODAY_LOCAL} AS d", fetch="one")["d"]


def init_db():
    create_database_if_missing()
    migrate()
