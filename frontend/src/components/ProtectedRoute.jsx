import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";
import Icon from "./Icon";

export function homePathFor(user) {
  return user.role === "admin" ? "/admin" : "/book";
}

/**
 * Guards a page:
 *  - not logged in        -> go to the login page
 *  - wrong role           -> "no access" page (the server also refuses, this just explains it nicely)
 */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your login" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (role && user.role !== role) {
    return (
      <div className="empty" role="alert">
        <div className="empty-icon"><Icon name="lock" size={28} /></div>
        <h3>You do not have access to this page</h3>
        <p>This area is only for {role === "admin" ? "clinic admins" : "customers"}.</p>
        <Link className="btn btn-primary btn-md" to={homePathFor(user)}>Go to my home page</Link>
      </div>
    );
  }
  return children;
}
