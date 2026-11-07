import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import { useLoad, useTitle } from "../hooks";
import { useToast } from "../context/ToastContext";
import Modal, { ConfirmDialog } from "../components/Modal";
import DateStrip, { buildDays } from "../components/DateStrip";
import Icon from "../components/Icon";
import { Button, DateBlock, EmptyState, ErrorState, FormError, PageHeader, SkeletonList, StatusChip } from "../components/ui";
import { fmtDateLong, fmtRange, fmtTime } from "../utils";

function RescheduleDialog({ booking, onClose, onDone }) {
  const { data: slots, loading, error } = useLoad(() => api.getSlots({ available_only: true, service: booking.service }), []);
  const [date, setDate] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  // Only other slots of the same service, never the one already booked.
  const options = useMemo(() => (slots || []).filter((s) => s.id !== booking.slot_id && !s.my_booking_id), [slots, booking.slot_id]);
  const days = useMemo(() => buildDays(options), [options]);
  const activeDate = days.find((d) => d.date === date)?.date || days[0]?.date;
  const times = options.filter((s) => s.slot_date === activeDate);
  const chosen = options.find((s) => s.id === slotId);

  async function move() {
    setBusy(true);
    setProblem("");
    try {
      const updated = await api.rescheduleBooking(booking.id, slotId);
      onDone(updated);
    } catch (err) {
      setProblem(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reschedule appointment"
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep current time</Button>
          <Button onClick={move} loading={busy} disabled={!chosen} icon="repeat">Move appointment</Button>
        </>
      }
    >
      <p className="muted">
        Now: <strong>{booking.service}</strong>, {fmtDateLong(booking.slot_date)}, {fmtRange(booking.start_time, booking.end_time)}
      </p>
      <FormError>{problem}</FormError>
      {loading ? (
        <SkeletonList count={3} variant="row" />
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : options.length === 0 ? (
        <EmptyState icon="calendar" title="No other times are open" text="Every other slot for this service is full. Please check again later." />
      ) : (
        <>
          <DateStrip days={days} value={activeDate} onChange={(d) => { setDate(d); setSlotId(null); }} label="Choose a new day" />
          <div className="time-grid" role="group" aria-label="Choose a new time">
            {times.map((s) => (
              <button key={s.id} type="button" className={`time-chip ${slotId === s.id ? "selected" : ""}`} aria-pressed={slotId === s.id} onClick={() => setSlotId(s.id)}>
                {fmtRange(s.start_time, s.end_time)}
              </button>
            ))}
          </div>
          {chosen && (
            <p className="move-preview" aria-live="polite">
              <Icon name="chevron" size={16} /> New time: <strong>{fmtDateLong(chosen.slot_date)}, {fmtTime(chosen.start_time)}</strong>
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function BookingCard({ b, onReschedule, onCancel }) {
  return (
    <article className={`booking-card ${b.status === "cancelled" ? "is-cancelled" : ""}`}>
      <DateBlock iso={b.slot_date} />
      <div className="booking-main">
        <h3>{b.service}</h3>
        <p className="booking-meta"><Icon name="clock" size={15} /> {fmtRange(b.start_time, b.end_time)} <span aria-hidden="true">·</span> {fmtDateLong(b.slot_date)}</p>
        {b.note && <p className="booking-note">“{b.note}”</p>}
      </div>
      <div className="booking-side">
        <StatusChip status={b.status} isPast={b.is_past} />
        {(b.can_reschedule || b.can_cancel) && (
          <div className="booking-actions">
            {b.can_reschedule && <Button size="sm" variant="secondary" icon="repeat" onClick={() => onReschedule(b)}>Reschedule</Button>}
            {b.can_cancel && <Button size="sm" variant="danger-ghost" icon="x" onClick={() => onCancel(b)}>Cancel</Button>}
          </div>
        )}
      </div>
    </article>
  );
}

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY = {
  upcoming: { icon: "calendar", title: "No upcoming appointments", text: "Book a time that suits you in a few taps." },
  past: { icon: "clock", title: "No past appointments yet", text: "Completed visits will show up here." },
  cancelled: { icon: "inbox", title: "No cancelled appointments", text: "Anything you cancel will be listed here for your records." },
};

export default function MyBookingsPage() {
  useTitle("My bookings");
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.getMyBookings(), []);
  const [tab, setTab] = useState("upcoming");
  const [toReschedule, setToReschedule] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const groups = useMemo(() => {
    const all = data || [];
    return {
      upcoming: all.filter((b) => b.status === "booked" && !b.is_past).reverse(), // soonest first
      past: all.filter((b) => b.status === "booked" && b.is_past),
      cancelled: all.filter((b) => b.status === "cancelled"),
    };
  }, [data]);

  async function confirmCancel() {
    setCancelling(true);
    try {
      await api.cancelBooking(toCancel.id);
      toast.success(`Cancelled ${toCancel.service} on ${fmtDateLong(toCancel.slot_date)}`);
      setToCancel(null);
      reload({ quiet: true });
    } catch (err) {
      toast.error(err.message);
      setToCancel(null);
      reload({ quiet: true });
    } finally {
      setCancelling(false);
    }
  }

  function handleMoved(updated) {
    setToReschedule(null);
    toast.success(`Moved to ${fmtDateLong(updated.slot_date)}, ${fmtTime(updated.start_time)}`);
    reload({ quiet: true });
  }

  const list = groups[tab];
  return (
    <>
      <PageHeader
        title="My bookings"
        subtitle="See your history, change a time or cancel."
        actions={<Button icon="plus" onClick={() => navigate("/book")}>New booking</Button>}
      />

      <div className="tabs" role="tablist" aria-label="Booking status">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "selected" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="tab-count">{groups[t.key].length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab).label}>
        {loading && !data ? (
          <SkeletonList count={3} variant="row" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState {...EMPTY[tab]} action={tab === "upcoming" ? <Button icon="calendar" onClick={() => navigate("/book")}>Book an appointment</Button> : null} />
        ) : (
          <div className="booking-list">
            {list.map((b) => <BookingCard key={b.id} b={b} onReschedule={setToReschedule} onCancel={setToCancel} />)}
          </div>
        )}
      </div>

      {toReschedule && <RescheduleDialog booking={toReschedule} onClose={() => setToReschedule(null)} onDone={handleMoved} />}
      {toCancel && (
        <ConfirmDialog title="Cancel this appointment?" danger confirmLabel="Yes, cancel it" cancelLabel="Keep appointment" busy={cancelling} onConfirm={confirmCancel} onClose={() => setToCancel(null)}>
          <p><strong>{toCancel.service}</strong><br />{fmtDateLong(toCancel.slot_date)}, {fmtRange(toCancel.start_time, toCancel.end_time)}</p>
          <p className="muted">The time will be released for other people. You can book again any time.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
