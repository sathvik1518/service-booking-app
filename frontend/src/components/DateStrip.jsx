import { dateParts, relativeDay } from "../utils";

/** A row of day buttons. `days` = [{ date: "2026-11-09", open: 5 }]. */
export default function DateStrip({ days, value, onChange, label = "Choose a day" }) {
  return (
    <div className="date-strip" role="group" aria-label={label}>
      {days.map((d) => {
        const p = dateParts(d.date);
        const selected = d.date === value;
        return (
          <button
            key={d.date}
            type="button"
            className={`date-chip ${selected ? "selected" : ""} ${d.open === 0 ? "none" : ""}`}
            aria-pressed={selected}
            onClick={() => onChange(d.date)}
          >
            <span className="dc-rel">{relativeDay(d.date)}</span>
            <strong className="dc-day">{p.day}</strong>
            <span className="dc-month">{p.month}</span>
            <span className="dc-open">{d.open === 0 ? "Full" : `${d.open} open`}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Turns a list of slots into the `days` array for DateStrip (first 14 dates, with open-slot counts). */
export function buildDays(slots, limit = 14) {
  const map = new Map();
  for (const s of slots) {
    const entry = map.get(s.slot_date) || { date: s.slot_date, open: 0 };
    if (s.spots_left > 0 && !s.my_booking_id) entry.open += 1;
    map.set(s.slot_date, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
