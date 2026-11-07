import { useMemo, useState } from "react";
import * as api from "../api";
import { useLoad, useTitle } from "../hooks";
import { useToast } from "../context/ToastContext";
import Modal, { ConfirmDialog } from "../components/Modal";
import { Button, EmptyState, ErrorState, Field, FormError, PageHeader, SkeletonList } from "../components/ui";
import Icon from "../components/Icon";
import { addDaysISO, countBulkSlots, fmtDateLong, fmtRange, minutesBetween, todayISO } from "../utils";

const hhmm = (t) => String(t).slice(0, 5);

/** Add or edit ONE slot. */
function SlotDialog({ slot, services, onClose, onSaved }) {
  const editing = Boolean(slot);
  const locked = editing && slot.booked_count > 0;
  const [v, setV] = useState({
    service: slot?.service || "",
    slot_date: slot?.slot_date || addDaysISO(todayISO(), 1),
    start_time: slot ? hhmm(slot.start_time) : "09:00",
    end_time: slot ? hhmm(slot.end_time) : "09:30",
    capacity: slot?.capacity || 1,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((er) => ({ ...er, [k]: undefined })); };

  function check() {
    const er = {};
    if (v.service.trim().length < 2) er.service = "Enter the service name";
    if (!v.slot_date) er.slot_date = "Choose a date";
    else if (!editing && v.slot_date < todayISO()) er.slot_date = "The date cannot be in the past";
    if (!v.start_time) er.start_time = "Choose a start time";
    if (!v.end_time) er.end_time = "Choose an end time";
    else if (v.start_time && minutesBetween(v.start_time, v.end_time) <= 0) er.end_time = "End time must be after the start time";
    const cap = Number(v.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) er.capacity = "Enter a number from 1 to 50";
    return er;
  }

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const er = check();
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const body = { ...v, service: v.service.trim(), capacity: Number(v.capacity) };
    try {
      const saved = editing ? await api.updateSlot(slot.id, body) : await api.createSlot(body);
      onSaved(saved, editing);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit slot" : "Add a slot"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="slot-form" loading={busy}>{editing ? "Save changes" : "Add slot"}</Button>
        </>
      }
    >
      <form id="slot-form" onSubmit={submit} noValidate>
        <FormError>{formError}</FormError>
        {locked && <p className="notice"><Icon name="lock" size={16} /> {slot.booked_count} booking(s) use this slot, so the date and time are locked.</p>}
        <Field label="Service" error={errors.service}>
          {(p) => (
            <>
              <input {...p} list="service-options" value={v.service} onChange={set("service")} placeholder="General Consultation" data-autofocus />
              <datalist id="service-options">{services.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Date" error={errors.slot_date}>
          {(p) => <input {...p} type="date" min={editing ? undefined : todayISO()} value={v.slot_date} onChange={set("slot_date")} disabled={locked} />}
        </Field>
        <div className="grid-2">
          <Field label="Starts" error={errors.start_time}>
            {(p) => <input {...p} type="time" value={v.start_time} onChange={set("start_time")} disabled={locked} />}
          </Field>
          <Field label="Ends" error={errors.end_time}>
            {(p) => <input {...p} type="time" value={v.end_time} onChange={set("end_time")} disabled={locked} />}
          </Field>
        </div>
        <Field label="Capacity" error={errors.capacity} hint="How many people can book this same slot">
          {(p) => <input {...p} type="number" min="1" max="50" value={v.capacity} onChange={set("capacity")} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Make many slots at once. */
function BulkDialog({ services, onClose, onSaved }) {
  const tomorrow = addDaysISO(todayISO(), 1);
  const [v, setV] = useState({
    service: "", date_from: tomorrow, date_to: addDaysISO(tomorrow, 4), start_time: "09:00", end_time: "12:00",
    duration_minutes: 30, capacity: 1, weekdays_only: true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })); setErrors((er) => ({ ...er, [k]: undefined })); };
  const preview = countBulkSlots(v);

  function check() {
    const er = {};
    if (v.service.trim().length < 2) er.service = "Enter the service name";
    if (!v.date_from || v.date_from < todayISO()) er.date_from = "Start from today or later";
    if (!v.date_to || v.date_to < v.date_from) er.date_to = "The last day must not be before the first day";
    else if ((new Date(v.date_to) - new Date(v.date_from)) / 86400000 > 30) er.date_to = "Choose at most 31 days at a time";
    if (!v.start_time || !v.end_time || minutesBetween(v.start_time, v.end_time) <= 0) er.end_time = "End time must be after the start time";
    else if (preview === 0) er.end_time = "The time window is shorter than one slot";
    if (preview > 300) er.date_to = `That makes ${preview} slots. The limit is 300.`;
    return er;
  }

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const er = check();
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const result = await api.createSlotsBulk({ ...v, service: v.service.trim(), duration_minutes: Number(v.duration_minutes), capacity: Number(v.capacity) });
      onSaved(result);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Generate slots"
      wide
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="bulk-form" loading={busy} icon="zap">Create about {preview} slots</Button>
        </>
      }
    >
      <form id="bulk-form" onSubmit={submit} noValidate>
        <FormError>{formError}</FormError>
        <p className="muted">Cut a time window into equal slots for every day in a range. Slots that already exist are skipped.</p>
        <Field label="Service" error={errors.service}>
          {(p) => (
            <>
              <input {...p} list="service-options-bulk" value={v.service} onChange={set("service")} placeholder="Dental Checkup" data-autofocus />
              <datalist id="service-options-bulk">{services.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </Field>
        <div className="grid-2">
          <Field label="From date" error={errors.date_from}>{(p) => <input {...p} type="date" min={todayISO()} value={v.date_from} onChange={set("date_from")} />}</Field>
          <Field label="To date" error={errors.date_to}>{(p) => <input {...p} type="date" min={v.date_from} value={v.date_to} onChange={set("date_to")} />}</Field>
        </div>
        <div className="grid-3">
          <Field label="Day starts">{(p) => <input {...p} type="time" value={v.start_time} onChange={set("start_time")} />}</Field>
          <Field label="Day ends" error={errors.end_time}>{(p) => <input {...p} type="time" value={v.end_time} onChange={set("end_time")} />}</Field>
          <Field label="Minutes per slot">
            {(p) => (
              <select {...p} value={v.duration_minutes} onChange={set("duration_minutes")}>
                {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            )}
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Capacity per slot" error={errors.capacity}>{(p) => <input {...p} type="number" min="1" max="50" value={v.capacity} onChange={set("capacity")} />}</Field>
          <label className="check"><input type="checkbox" checked={v.weekdays_only} onChange={set("weekdays_only")} /> Skip Saturdays and Sundays</label>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminSlots() {
  useTitle("Manage slots");
  const toast = useToast();
  const [date, setDate] = useState("");
  const [service, setService] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const { data: slots, loading, error, reload } = useLoad(() => api.getSlots({ include_past: showPast, date, service }), [showPast, date, service]);
  const { data: serviceList } = useLoad(() => api.getServices(), []);
  const [dialog, setDialog] = useState(null); // {type:'edit'|'add'|'bulk', slot}
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const services = serviceList || [];
  const totals = useMemo(() => {
    const list = slots || [];
    return { count: list.length, booked: list.reduce((a, s) => a + s.booked_count, 0), capacity: list.reduce((a, s) => a + s.capacity, 0) };
  }, [slots]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.deleteSlot(toDelete.id);
      toast.success("Slot deleted");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
      setToDelete(null);
      reload({ quiet: true });
    }
  }

  return (
    <>
      <PageHeader
        title="Manage slots"
        subtitle="Create the times that customers can book."
        actions={
          <>
            <Button variant="secondary" icon="zap" onClick={() => setDialog({ type: "bulk" })}>Generate slots</Button>
            <Button icon="plus" onClick={() => setDialog({ type: "add" })}>Add slot</Button>
          </>
        }
      />

      <section className="toolbar filters" aria-label="Filters">
        <label className="filter">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="filter">Service
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="all">All services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past slots</label>
        {(date || service !== "all") && <Button variant="ghost" size="sm" onClick={() => { setDate(""); setService("all"); }}>Clear filters</Button>}
        <p className="muted small push-right">{totals.count} slots · {totals.booked}/{totals.capacity} booked</p>
      </section>

      {loading && !slots ? (
        <SkeletonList count={6} variant="row" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : slots.length === 0 ? (
        <EmptyState icon="calendar" title="No slots found" text="Add a slot, or generate a week of slots in one go." action={<Button icon="zap" onClick={() => setDialog({ type: "bulk" })}>Generate slots</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Time</th><th>Service</th><th>Booked</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {slots.map((s) => {
                const pct = Math.round((s.booked_count / s.capacity) * 100);
                return (
                  <tr key={s.id} className={s.is_past ? "row-past" : ""}>
                    <td data-label="Date">{fmtDateLong(s.slot_date)}</td>
                    <td data-label="Time">{fmtRange(s.start_time, s.end_time)}</td>
                    <td data-label="Service"><strong>{s.service}</strong></td>
                    <td data-label="Booked">
                      <div className="meter" title={`${s.booked_count} of ${s.capacity} booked`}>
                        <div className="meter-bar"><div className={`meter-fill ${pct >= 100 ? "full" : ""}`} style={{ width: `${pct}%` }} /></div>
                        <span>{s.booked_count}/{s.capacity}</span>
                      </div>
                    </td>
                    <td className="actions">
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => setDialog({ type: "edit", slot: s })} aria-label={`Edit ${s.service} on ${fmtDateLong(s.slot_date)}`}>Edit</Button>
                      <Button size="sm" variant="danger-ghost" icon="trash" onClick={() => setToDelete(s)} aria-label={`Delete ${s.service} on ${fmtDateLong(s.slot_date)}`}>Delete</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (dialog.type === "add" || dialog.type === "edit") && (
        <SlotDialog
          slot={dialog.slot}
          services={services}
          onClose={() => setDialog(null)}
          onSaved={(saved, wasEdit) => { setDialog(null); toast.success(wasEdit ? "Slot updated" : "Slot added"); reload({ quiet: true }); }}
        />
      )}
      {dialog?.type === "bulk" && (
        <BulkDialog
          services={services}
          onClose={() => setDialog(null)}
          onSaved={(r) => { setDialog(null); toast.success(`Created ${r.created} slots${r.skipped ? ` (${r.skipped} already existed)` : ""}`); reload({ quiet: true }); }}
        />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete this slot?" danger confirmLabel="Delete slot" cancelLabel="Keep slot" busy={deleting} onConfirm={confirmDelete} onClose={() => setToDelete(null)}>
          <p><strong>{toDelete.service}</strong><br />{fmtDateLong(toDelete.slot_date)}, {fmtRange(toDelete.start_time, toDelete.end_time)}</p>
          {toDelete.booked_count > 0 && <p className="notice"><Icon name="alert" size={16} /> {toDelete.booked_count} active booking(s) use this slot. It cannot be deleted until they are cancelled.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
