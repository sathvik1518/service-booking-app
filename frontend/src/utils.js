// Small helpers for dates, times and text. No React in here.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-09" -> a Date at local midnight (avoids the time zone shift of new Date("2026-11-09")). */
export function parseDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A Date -> "2026-11-09" using the local calendar day. */
export function isoDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function addDaysISO(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** "09:00:00" -> "9:00 AM" */
export function fmtTime(t) {
  const [h, m] = String(t).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** ("09:00:00", "09:30:00") -> "9:00 – 9:30 AM" */
export function fmtRange(start, end) {
  const a = fmtTime(start);
  const b = fmtTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** "2026-11-09" -> "Mon, 9 Nov 2026" */
export function fmtDateLong(iso) {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Pieces for the small calendar block: {weekday:"Mon", day:"9", month:"Nov"} */
export function dateParts(iso) {
  const d = parseDate(iso);
  return { weekday: WEEKDAYS[d.getDay()], day: String(d.getDate()), month: MONTHS[d.getMonth()] };
}

/** "Today", "Tomorrow" or the short weekday. */
export function relativeDay(iso) {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  return dateParts(iso).weekday;
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function groupBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/** What to show on a slot card about free places. */
export function spotsInfo(slot) {
  const left = slot.spots_left;
  if (left <= 0) return { text: "Full", tone: "full" };
  if (left === 1) return { text: slot.capacity === 1 ? "Available" : "Last spot", tone: slot.capacity === 1 ? "ok" : "low" };
  return { text: `${left} spots left`, tone: "ok" };
}

/** Minutes between two "HH:MM" times. */
export function minutesBetween(a, b) {
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(b) - toMin(a);
}

/** How many slots a bulk request will make: window / length, for each weekday in the range. */
export function countBulkSlots({ date_from, date_to, start_time, end_time, duration_minutes, weekdays_only }) {
  if (!date_from || !date_to || !start_time || !end_time || !duration_minutes) return 0;
  const perDay = Math.floor(minutesBetween(start_time, end_time) / Number(duration_minutes));
  if (perDay <= 0) return 0;
  let days = 0;
  const end = parseDate(date_to);
  for (let d = parseDate(date_from); d <= end; d.setDate(d.getDate() + 1)) {
    if (!weekdays_only || (d.getDay() !== 0 && d.getDay() !== 6)) days += 1;
  }
  return perDay * days;
}

export function downloadCSV(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the app still works */
  }
}

export function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
