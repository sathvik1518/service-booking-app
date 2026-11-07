-- Migration 002: indexes and the "one active booking per customer per slot" rule

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings (slot_id);
CREATE INDEX IF NOT EXISTS idx_slots_date    ON slots (slot_date, start_time);

-- A customer cannot hold the same slot twice, but a cancelled booking does not block a new one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_per_user_slot
    ON bookings (user_id, slot_id) WHERE status = 'booked';
