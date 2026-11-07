import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";

const ToastContext = createContext(null);

/** Small pop-up messages ("Appointment booked"). Screen readers hear them through aria-live. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (type, message, action) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message, action }]);
      setTimeout(() => dismiss(id), action ? 7000 : 4500);
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message, action) => show("success", message, action),
      error: (message) => show("error", message),
      info: (message) => show("info", message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === "error" ? "alert" : "status"}>
            <Icon name={t.type === "error" ? "alert" : "check"} size={18} />
            <span className="toast-text">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
