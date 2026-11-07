import Icon from "./Icon";
import { Button } from "./ui";
import { fmtRange, spotsInfo } from "../utils";

/** One bookable time on the Book page. */
export default function SlotCard({ slot, onBook }) {
  const info = spotsInfo(slot);
  const mine = Boolean(slot.my_booking_id);
  const full = slot.spots_left <= 0;

  return (
    <article className={`slot-card ${full && !mine ? "is-full" : ""} ${mine ? "is-mine" : ""}`} aria-label={`${slot.service}, ${fmtRange(slot.start_time, slot.end_time)}`}>
      <div className="slot-time">{fmtRange(slot.start_time, slot.end_time)}</div>
      <div className="slot-service">{slot.service}</div>
      <div className="slot-foot">
        {mine ? (
          <span className="spots spots-mine"><Icon name="check" size={14} /> You are booked</span>
        ) : (
          <span className={`spots spots-${info.tone}`}>{info.text}</span>
        )}
        {mine ? (
          <Button size="sm" variant="secondary" disabled>Booked</Button>
        ) : full ? (
          <Button size="sm" variant="secondary" disabled>Full</Button>
        ) : (
          <Button size="sm" onClick={() => onBook(slot)} aria-label={`Book ${slot.service} at ${fmtRange(slot.start_time, slot.end_time)}`}>Book</Button>
        )}
      </div>
    </article>
  );
}
