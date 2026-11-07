import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { useTitle } from "../hooks";

export default function NotFound() {
  useTitle("Page not found");
  return (
    <div className="empty full-page" role="alert">
      <div className="empty-icon"><Icon name="search" size={28} /></div>
      <h1 className="empty-title">Page not found</h1>
      <p>The page you are looking for does not exist or was moved.</p>
      <Link className="btn btn-primary btn-md" to="/">Back to home</Link>
    </div>
  );
}
