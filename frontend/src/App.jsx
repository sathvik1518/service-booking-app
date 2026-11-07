import { useCallback } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import Layout from "./components/Layout";
import ProtectedRoute, { homePathFor } from "./components/ProtectedRoute";
import { Spinner } from "./components/ui";
import AuthPage from "./pages/AuthPage";
import BookPage from "./pages/BookPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminSlots from "./pages/AdminSlots";
import AdminBookings from "./pages/AdminBookings";
import NotFound from "./pages/NotFound";

/** Sends the person to the right home page for their role. */
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homePathFor(user) : "/login"} replace />;
}

/** Login and register pages: if you are already logged in, skip them. */
function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return children;
}

function Routing() {
  const navigate = useNavigate();
  const toast = useToast();
  const onSessionExpired = useCallback(() => {
    toast.info("Your session expired. Please log in again.");
    navigate("/login", { replace: true });
  }, [toast, navigate]);

  return (
    <AuthProvider onSessionExpired={onSessionExpired}>
      <Routes>
        <Route path="/login" element={<GuestRoute><AuthPage mode="login" /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><AuthPage mode="register" /></GuestRoute>} />

        <Route element={<Layout />}>
          <Route path="/book" element={<ProtectedRoute role="customer"><BookPage /></ProtectedRoute>} />
          <Route path="/bookings" element={<ProtectedRoute role="customer"><MyBookingsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/slots" element={<ProtectedRoute role="admin"><AdminSlots /></ProtectedRoute>} />
          <Route path="/admin/bookings" element={<ProtectedRoute role="admin"><AdminBookings /></ProtectedRoute>} />
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Routing />
      </ToastProvider>
    </HashRouter>
  );
}
