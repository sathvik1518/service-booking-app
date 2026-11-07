import { useState } from "react";
import * as api from "../api";
import { useDebounced, useLoad, useTitle } from "../hooks";
import { useToast } from "../context/ToastContext";
import { ConfirmDialog } from "../components/Modal";
import Icon from "../components/Icon";
import { Avatar, Button, EmptyState, ErrorState, PageHeader, SkeletonList, StatusChip } from "../components/ui";
import { downloadCSV, fmtDateLong, fmtRange } from "../utils";

export default function AdminBookings() {
  useTitle("All bookings");
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [service, setService] = useState("all");
  const debouncedSearch = useDebounced(search, 300);

  const { data, loading, error, reload } = useLoad(
    () => api.getAdminBookings({ search: debouncedSearch, status, date, service }),
    [debouncedSearch, status, date, service]
  );
  const { data: serviceList } = useLoad(() => api.getServices(), []);
  const [toCancel, setToCancel] = useState(null);
  const [busy, setBusy] = useState(false);

  const filtered = Boolean(search || status !== "all" || date || service !== "all");

  async function confirmCancel() {
    setBusy(true);
    try {
      await api.cancelBooking(toCancel.id);
      toast.success(`Cancelled ${toCancel.user_name}'s appointment`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setToCancel(null);
      reload({ quiet: true });
    }
  }

  function exportCSV() {
    downloadCSV("careslot-bookings.csv", [
      ["Customer", "Email", "Service", "Date", "Time", "Status", "Note"],
      ...(data || []).map((b) => [b.user_name, b.user_email, b.service, b.slot_date, fmtRange(b.start_time, b.end_time), b.status, b.note || ""]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="All bookings"
        subtitle="Every appointment across the clinic."
        actions={<Button variant="secondary" icon="download" onClick={exportCSV} disabled={!data?.length}>Export CSV</Button>}
      />

      <section className="toolbar filters" aria-label="Filters">
        <label className="filter filter-search">Search customer
          <span className="search-box">
            <Icon name="search" size={16} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
          </span>
        </label>
        <label className="filter">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="booked">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="filter">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="filter">Service
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="all">All services</option>
            {(serviceList || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus("all"); setDate(""); setService("all"); }}>Clear</Button>}
        {data && <p className="muted small push-right">{data.length} {data.length === 1 ? "booking" : "bookings"}</p>}
      </section>

      {loading && !data ? (
        <SkeletonList count={6} variant="row" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState icon="inbox" title={filtered ? "No bookings match your filters" : "No bookings yet"} text={filtered ? "Try changing or clearing the filters." : "Bookings made by customers will appear here."} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Service</th><th>When</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className={b.status === "cancelled" ? "row-cancelled" : ""}>
                  <td data-label="Customer">
                    <div className="person">
                      <Avatar name={b.user_name} size={34} />
                      <div><strong>{b.user_name}</strong><small>{b.user_email}</small></div>
                    </div>
                  </td>
                  <td data-label="Service">{b.service}{b.note && <small className="note-line">“{b.note}”</small>}</td>
                  <td data-label="When">{fmtDateLong(b.slot_date)}<small className="note-line">{fmtRange(b.start_time, b.end_time)}</small></td>
                  <td data-label="Status"><StatusChip status={b.status} isPast={b.is_past} /></td>
                  <td className="actions">
                    {b.can_cancel && (
                      <Button size="sm" variant="danger-ghost" icon="x" onClick={() => setToCancel(b)} aria-label={`Cancel booking for ${b.user_name}`}>Cancel</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toCancel && (
        <ConfirmDialog title="Cancel this booking?" danger confirmLabel="Cancel booking" cancelLabel="Keep booking" busy={busy} onConfirm={confirmCancel} onClose={() => setToCancel(null)}>
          <p><strong>{toCancel.user_name}</strong> · {toCancel.service}<br />{fmtDateLong(toCancel.slot_date)}, {fmtRange(toCancel.start_time, toCancel.end_time)}</p>
          <p className="muted">The slot is released straight away.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
