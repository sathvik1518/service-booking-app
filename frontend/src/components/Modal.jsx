import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";
import { Button } from "./ui";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Pop-up dialog. Accessible: Esc closes, Tab stays inside, focus goes back to the button that opened it.
 */
export default function Modal({ title, onClose, children, footer, wide = false, busy = false }) {
  const titleId = useId();
  const box = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first field, or the dialog box itself.
    const first = box.current?.querySelector("[data-autofocus]") || box.current?.querySelector(FOCUSABLE);
    (first || box.current)?.focus();

    function onKey(e) {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={box}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close dialog">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** "Are you sure?" dialog used before cancelling or deleting. */
export function ConfirmDialog({ title, children, confirmLabel = "Confirm", cancelLabel = "Keep it", danger = false, busy, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} data-autofocus>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
