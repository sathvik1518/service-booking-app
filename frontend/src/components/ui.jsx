// Small building blocks used on every page.
import { useId } from "react";
import Icon from "./Icon";
import { dateParts, fmtRange, initials } from "../utils";

export function Button({ variant = "primary", size = "md", loading = false, icon, children, className = "", disabled, ...rest }) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner spinner-sm" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

/** Label + input + error text, wired together for screen readers. Pass a function as children to get the ids. */
export function Field({ label, error, hint, children, className = "" }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p className="field-error" id={`${id}-err`} role="alert">{error}</p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="center-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Grey shimmering placeholder cards while data loads. */
export function SkeletonList({ count = 4, variant = "card" }) {
  return (
    <div className={`skeleton-list skeleton-${variant}`} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty empty-error" role="alert">
      <div className="empty-icon"><Icon name="alert" size={28} /></div>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry} icon="repeat">Try again</Button>}
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </div>
  );
}

export function StatusChip({ status, isPast }) {
  if (status === "cancelled") return <span className="chip chip-cancelled">Cancelled</span>;
  if (isPast) return <span className="chip chip-done">Completed</span>;
  return <span className="chip chip-booked">Confirmed</span>;
}

export function Avatar({ name, size = 36 }) {
  // The colour comes from the name, so the same person always gets the same colour.
  let hash = 0;
  for (const ch of name || "") hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${hash} 45% 38%)`, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** The little calendar block (month, day, weekday). */
export function DateBlock({ iso }) {
  const { weekday, day, month } = dateParts(iso);
  return (
    <div className="date-block" aria-hidden="true">
      <span>{month}</span>
      <strong>{day}</strong>
      <span>{weekday}</span>
    </div>
  );
}

export function TimeRange({ start, end }) {
  return (
    <span className="time-range">
      <Icon name="clock" size={15} /> {fmtRange(start, end)}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
