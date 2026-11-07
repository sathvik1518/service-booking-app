import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Avatar, Spinner } from "./ui";
import Icon from "./Icon";
import { recall, remember } from "../utils";

const CUSTOMER_LINKS = [
  { to: "/book", label: "Book", icon: "calendar" },
  { to: "/bookings", label: "My bookings", icon: "list" },
];
const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard", icon: "grid", end: true },
  { to: "/admin/slots", label: "Slots", icon: "layers" },
  { to: "/admin/bookings", label: "Bookings", icon: "users" },
];

export function Brand({ light = false }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark" aria-hidden="true"><Icon name="check" size={18} /></span>
      CareSlot
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "light");
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    remember("cs-theme", next);
    setTheme(next);
  }
  return (
    <button className="icon-btn" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title="Toggle dark mode">
      <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
    </button>
  );
}

/** The frame around every logged-in page: top bar, navigation, page area. */
export default function Layout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const links = user.role === "admin" ? ADMIN_LINKS : CUSTOMER_LINKS;

  function handleLogout() {
    logout();
    toast.info("You have been logged out.");
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to={user.role === "admin" ? "/admin" : "/book"} className="brand-link" aria-label="CareSlot home">
            <Brand />
          </NavLink>
          <nav className="nav" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Icon name={l.icon} size={18} /> {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-right">
            {user.role === "admin" && <span className="role-badge"><Icon name="shield" size={14} /> Admin</span>}
            <ThemeToggle />
            <div className="user-chip">
              <Avatar name={user.name} size={32} />
              <span className="user-name">{user.name}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout} aria-label="Log out">
              <Icon name="logout" size={16} /> <span className="hide-sm">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Main (mobile)">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}>
            <Icon name={l.icon} size={22} />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
