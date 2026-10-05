-- Gewertz Square room booking: schema + rates from the 2569 announcement (effective 28 Aug 2026).
-- Rates are per room per hour. Half-day (4h) x4 and full-day (8h) x8 reproduce the published
-- half-day/full-day prices exactly, so hourly booking never contradicts the published tariff.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL
);

CREATE TABLE rooms (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  capacity_min  INTEGER NOT NULL,
  capacity_max  INTEGER NOT NULL,
  sort_order    INTEGER NOT NULL
);

CREATE TABLE rate_cards (
  room_id         TEXT NOT NULL REFERENCES rooms(id),
  user_type       TEXT NOT NULL,
  rate_kind       TEXT NOT NULL,
  price_per_hour  INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_type, rate_kind)
);

CREATE TABLE bookings (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  user_id             TEXT NOT NULL REFERENCES users(id),
  activity_date       TEXT NOT NULL,
  start_hour          INTEGER NOT NULL,
  end_hour            INTEGER NOT NULL,
  user_type           TEXT NOT NULL,
  attendees           INTEGER NOT NULL,
  purpose             TEXT NOT NULL,
  status              TEXT NOT NULL,
  amount              INTEGER NOT NULL,
  price_snapshot      TEXT NOT NULL,
  payment_note        TEXT,
  payment_verified_at INTEGER,
  payment_verified_by TEXT,
  review_note         TEXT,
  reviewed_by         TEXT,
  reviewed_at         INTEGER,
  expires_at          INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_bookings_date ON bookings (activity_date);
CREATE INDEX idx_bookings_user ON bookings (user_id, status);

CREATE TABLE booking_rooms (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  PRIMARY KEY (booking_id, room_id)
);

-- One row per occupied room-hour. The primary key is the double-booking guard: approving a
-- booking that overlaps an approved one fails on insert instead of silently double-booking.
CREATE TABLE booking_slots (
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  activity_date  TEXT NOT NULL,
  hour           INTEGER NOT NULL,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, activity_date, hour)
);

-- Payment slips live in D1 rather than R2 so the whole deployment stays on Cloudflare's
-- no-card free tier. Images are compressed in the browser before upload and capped here.
CREATE TABLE payment_slips (
  booking_id   TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  data         BLOB NOT NULL,
  uploaded_at  INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO rooms (id, name, capacity_min, capacity_max, sort_order) VALUES
  ('spark1', 'Spark 1', 30, 35, 1),
  ('spark2', 'Spark 2', 30, 35, 2),
  ('spark3', 'Spark 3', 30, 35, 3),
  ('eiii', 'E-III', 25, 30, 4),
  ('demo_floor', 'Demo Floor', 25, 30, 5);

-- internal = free, joint = published "ร่วมกับหน่วยงานภายใน", external = published "ของหน่วยงานภายนอก".
-- evening applies from 16:00 onwards, where the announcement prices per hour directly.
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'internal', 'day', 0 FROM rooms;
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'internal', 'evening', 0 FROM rooms;
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'joint', 'day', 375 FROM rooms;
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'joint', 'evening', 500 FROM rooms;
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'external', 'day', 750 FROM rooms;
INSERT INTO rate_cards (room_id, user_type, rate_kind, price_per_hour) SELECT id, 'external', 'evening', 550 FROM rooms;

INSERT INTO settings (key, value) VALUES
  ('payment_instructions', 'โอนเงินจำนวนที่ระบบคำนวณไปยังบัญชีของหน่วยงาน แล้วแนบหลักฐานการโอน (สลิป) ที่หน้าเว็บ'),
  ('contact', 'ติดต่อสอบถามเพิ่มเติมได้ที่ภาควิศวกรรมไฟฟ้า คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย');