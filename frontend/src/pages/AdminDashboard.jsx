import { Link } from "react-router-dom";
import * as api from "../api";
import { useLoad, useTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import { Avatar, Button, EmptyState, ErrorState, PageHeader, SkeletonList, StatusChip } from "../components/ui";
import { dateParts, fmtDateLong, fmtRange, relativeDay } from "../utils";

function Tile({ icon, label, value, tone }) {
  return (
    <div className={`tile tile-${tone}`}>
      <span className="tile-icon"><Icon name={icon} size={20} /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Booked vs total capacity for the next 7 days, drawn with plain HTML bars (easy to read, works with screen readers). */
function WeekChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.capacity));
  return (
    <div className="week-chart" role="img" aria-label={`Bookings for the next 7 days: ${days.map((d) => `${dateParts(d.day).weekday} ${d.booked} of ${d.capacity}`).join(", ")}`}>
      {days.map((d) => {
        const p = dateParts(d.day);
        const pct = d.capacity ? Math.round((d.booked / d.capacity) * 100) : 0;
        return (
          <div className="week-col" key={d.day} title={`${p.weekday} ${p.day} ${p.month}: ${d.booked} of ${d.capacity} spots booked`}>
            <span className="week-value">{d.capacity ? `${d.booked}/${d.capacity}` : "–"}</span>
            <div className="week-bar" style={{ height: `${Math.max(6, (d.capacity / max) * 100)}%` }}>
              <div className="week-fill" style={{ height: `${pct}%` }} />
            </div>
            <span className="week-label">{relativeDay(d.day) === "Today" ? "Today" : p.weekday}</span>
            <span className="week-date">{p.day} {p.month}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  useTitle("Dashboard");
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const stats = await api.getAdminStats();
    const today = await api.getAdminBookings({ date: stats.today, status: "booked" });
    const booked = await api.getAdminBookings({ status: "booked" });
    // the next few appointments after today, soonest first
    const next = booked
      .filter((b) => b.can_cancel && b.slot_date > stats.today)
      .sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time))
      .slice(0, 6);
    return { stats, next, today: today.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)) };
  }, []);

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle="Here is how the clinic looks right now."
        actions={
          <>
            <Link className="btn btn-secondary btn-md" to="/admin/bookings"><Icon name="users" size={18} /> All bookings</Link>
            <Link className="btn btn-primary btn-md" to="/admin/slots"><Icon name="plus" size={18} /> Manage slots</Link>
          </>
        }
      />

      {loading && !data ? (
        <SkeletonList count={4} variant="tile" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="tiles">
            <Tile icon="calendar" tone="teal" label="Upcoming appointments" value={data.stats.upcoming_bookings} />
            <Tile icon="clock" tone="amber" label="Open spots" value={data.stats.open_spots} />
            <Tile icon="users" tone="blue" label="Customers" value={data.stats.customers} />
            <Tile icon="x" tone="rose" label="Cancelled (30 days)" value={data.stats.cancelled_30d} />
          </div>

          <div className="dash-grid">
            <section className="card">
              <div className="card-head">
                <h2>Next 7 days</h2>
                <span className="legend"><i className="dot dot-fill" /> Booked <i className="dot dot-cap" /> Capacity</span>
              </div>
              <WeekChart days={data.stats.next_7_days} />
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Today's appointments</h2>
                <span className="chip chip-neutral">{data.today.length}</span>
              </div>
              {data.today.length === 0 ? (
                <EmptyState icon="calendar" title="Nothing booked for today" text="Appointments for today will show up here." />
              ) : (
                <ul className="today-list">
                  {data.today.map((b) => (
                    <li key={b.id}>
                      <Avatar name={b.user_name} size={36} />
                      <div>
                        <strong>{b.user_name}</strong>
                        <small>{b.service}</small>
                      </div>
                      <span className="today-time">{fmtRange(b.start_time, b.end_time)}</span>
                    </li>
                  ))}
                </ul>
              )}
                        </section>
          </div>

          <section className="card coming-card">
            <div className="card-head">
              <h2>Coming up</h2>
              <Link className="link-more" to="/admin/bookings">View all</Link>
            </div>
            {data.next.length === 0 ? (
              <EmptyState icon="calendar" title="No upcoming appointments" text="Bookings after today will show up here." />
            ) : (
              <ul className="today-list">
                {data.next.map((b) => (
                  <li key={b.id}>
                    <Avatar name={b.user_name} size={36} />
                    <div>
                      <strong>{b.user_name}</strong>
                      <small>{b.service}</small>
                    </div>
                    <span className="today-time coming-when">
                      {fmtDateLong(b.slot_date)}
                      <small>{fmtRange(b.start_time, b.end_time)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
