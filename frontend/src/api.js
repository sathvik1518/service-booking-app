// All talking to the backend happens here, so pages never write fetch() themselves.
import { recall, remember } from "./utils";

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8000");
const TOKEN_KEY = "cs-token";

let token = recall(TOKEN_KEY);
let onUnauthorized = () => {};

export const getToken = () => token;

export function setToken(value) {
  token = value;
  if (value) remember(TOKEN_KEY, value);
  else {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** The app registers a function that runs when the server says "your login is no longer valid". */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/** An error that carries the HTTP status and per-field messages from the server. */
export class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "all") query.set(k, v);
  });
  const url = `${BASE}${path}${query.toString() ? `?${query}` : ""}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your internet connection and that the backend is running.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* some replies have no body */
  }

  if (!response.ok) {
    const message = (data && (typeof data.detail === "string" ? data.detail : null)) || `Something went wrong (${response.status})`;
    // A 401 on a call that used a token means the login expired. Wrong-password 401s have no token yet.
    if (response.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(message, response.status, (data && data.errors) || {});
  }
  return data;
}

// ---- auth
export const register = (body) => request("/auth/register", { method: "POST", body });
export const login = (body) => request("/auth/login", { method: "POST", body });
export const getMe = () => request("/auth/me");

// ---- slots
export const getSlots = (params) => request("/slots", { params });
export const getServices = () => request("/services");
export const createSlot = (body) => request("/slots", { method: "POST", body });
export const createSlotsBulk = (body) => request("/slots/bulk", { method: "POST", body });
export const updateSlot = (id, body) => request(`/slots/${id}`, { method: "PUT", body });
export const deleteSlot = (id) => request(`/slots/${id}`, { method: "DELETE" });

// ---- bookings
export const createBooking = (slot_id, note) => request("/bookings", { method: "POST", body: { slot_id, note: note || null } });
export const getMyBookings = (params) => request("/bookings/mine", { params });
export const rescheduleBooking = (id, slot_id) => request(`/bookings/${id}/reschedule`, { method: "PUT", body: { slot_id } });
export const cancelBooking = (id) => request(`/bookings/${id}/cancel`, { method: "PATCH" });

// ---- admin
export const getAdminBookings = (params) => request("/admin/bookings", { params });
export const getAdminStats = () => request("/admin/stats");
