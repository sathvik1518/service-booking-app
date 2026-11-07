import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import { useLoad, useTitle } from "../hooks";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";
import DateStrip, { buildDays } from "../components/DateStrip";
import SlotCard from "../components/SlotCard";
import { Button, EmptyState, ErrorState, FormError, PageHeader, SkeletonList } from "../components/ui";
import Icon from "../components/Icon";
import { fmtDateLong, fmtRange, groupBy } from "../utils";

function BookDialog({ slot, onClose, onBooked, onStale }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const booking = await api.createBooking(slot.id, note.trim());
      onBooked(booking);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (err.status === 409 || err.status === 400 || err.status === 404) onStale(); // slot changed: refresh the list behind the dialog
    }
  }

  return (
    <Modal
      title="Confirm your appointment"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Back</Button>
          <Button onClick={confirm} loading={busy} icon="check">Confirm booking</Button>
        </>
      }
    >
      <div className="summary">
        <div className="summary-row"><Icon name="layers" size={18} /><div><small>Service</small><strong>{slot.service}</strong></div></div>
        <div className="summary-row"><Icon name="calendar" size={18} /><div><small>Date</small><strong>{fmtDateLong(slot.slot_date)}</strong></div></div>
        <div className="summary-row"><Icon name="clock" size={18} /><div><small>Time</small><strong>{fmtRange(slot.start_time, slot.end_time)}</strong></div></div>
      </div>
      <FormError>{error}</FormError>
      <div className="field">
        <label htmlFor="note">Note for the clinic <span className="optional">(optional)</span></label>
        <textarea id="note" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: first visit, or I need a wheelchair-friendly room" data-autofocus />
        <p className="field-hint counter">{note.length}/200</p>
      </div>
    </Modal>
  );
}

export default function BookPage() {
  useTitle("Book an appointment");
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data: slots, loading, error, reload } = useLoad(() => api.getSlots(), []);
  const [pickedDate, setPickedDate] = useState(null);
  const [service, setService] = useState("all");
  const [selected, setSelected] = useState(null);

  const services = useMemo(() => [...new Set((slots || []).map((s) => s.service))].sort(), [slots]);
  const filtered = useMemo(() => (slots || []).filter((s) => service === "all" || s.service === service), [slots, service]);
  const days = useMemo(() => buildDays(filtered), [filtered]);

  // Pick the first day that still has an open slot, unless the person chose one.
  const activeDate = days.find((d) => d.date === pickedDate)?.date || days.find((d) => d.open > 0)?.date || days[0]?.date;
  const visible = filtered.filter((s) => s.slot_date === activeDate);
  const parts = groupBy(visible, (s) => (Number(s.start_time.slice(0, 2)) < 12 ? "Morning" : Number(s.start_time.slice(0, 2)) < 17 ? "Afternoon" : "Evening"));
  const totalOpen = filtered.filter((s) => s.spots_left > 0 && !s.my_booking_id).length;

  function handleBooked(booking) {
    setSelected(null);
    reload({ quiet: true });
    toast.success(`Booked ${booking.service} on ${fmtDateLong(booking.slot_date)}`, { label: "View", onClick: () => navigate("/bookings") });
  }

  return (
    <>
      <PageHeader
        title="Book an appointment"
        subtitle={`Hi ${user.name.split(" ")[0]}, pick a day and a time that suits you.`}
        actions={<Button variant="secondary" icon="list" onClick={() => navigate("/bookings")}>My bookings</Button>}
      />

      {loading && !slots ? (
        <SkeletonList count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !slots.length ? (
        <EmptyState icon="calendar" title="No appointments are open right now" text="The clinic has not published new slots yet. Please check back soon." />
      ) : (
        <>
          <section className="toolbar" aria-label="Filters">
            <div className="pills" role="group" aria-label="Filter by service">
              <button className={`pill ${service === "all" ? "selected" : ""}`} aria-pressed={service === "all"} onClick={() => setService("all")}>All services</button>
              {services.map((s) => (
                <button key={s} className={`pill ${service === s ? "selected" : ""}`} aria-pressed={service === s} onClick={() => setService(s)}>{s}</button>
              ))}
            </div>
            <p className="muted small">{totalOpen} open {totalOpen === 1 ? "slot" : "slots"} in the coming days</p>
          </section>

          {days.length === 0 ? (
            <EmptyState icon="search" title="Nothing for this service yet" text="Try another service or check back later." action={<Button variant="secondary" onClick={() => setService("all")}>Show all services</Button>} />
          ) : (
            <>
              <DateStrip days={days} value={activeDate} onChange={setPickedDate} />
              <h2 className="section-title">{fmtDateLong(activeDate)}</h2>
              {visible.length === 0 ? (
                <EmptyState icon="calendar" title="No slots on this day" />
              ) : (
                [...parts.entries()].map(([name, list]) => (
                  <section key={name} aria-label={`${name} slots`}>
                    <h3 className="part-title">{name}</h3>
                    <div className="slot-grid">
                      {list.map((slot) => <SlotCard key={slot.id} slot={slot} onBook={setSelected} />)}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}

      {selected && <BookDialog slot={selected} onClose={() => setSelected(null)} onBooked={handleBooked} onStale={() => reload({ quiet: true })} />}
    </>
  );
}
