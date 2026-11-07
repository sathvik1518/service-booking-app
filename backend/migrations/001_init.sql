-- Migration 001: core tables
-- users  -> people who log in (customer or admin)
-- slots  -> bookable time windows created by admins
-- bookings -> one customer reserving one slot

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,          -- stored in lower case
    password_hash TEXT         NOT NULL,                  -- bcrypt hash, never the password
    role          VARCHAR(10)  NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'admin')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slots (
    id         SERIAL PRIMARY KEY,
    service    VARCHAR(80) NOT NULL,
    slot_date  DATE        NOT NULL,
    start_time TIME        NOT NULL,
    end_time   TIME        NOT NULL,
    capacity   INTEGER     NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time > start_time),
    UNIQUE (service, slot_date, start_time)               -- no duplicate slots
);

CREATE TABLE IF NOT EXISTS bookings (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id      INTEGER     NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    status       VARCHAR(10) NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked', 'cancelled')),
    note         VARCHAR(200),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ
);
