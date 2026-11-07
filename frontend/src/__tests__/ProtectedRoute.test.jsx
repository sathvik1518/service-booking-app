import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

let auth = { user: null, loading: false };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));

function renderAt(role) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/login" element={<p>LOGIN PAGE</p>} />
        <Route path="/admin" element={<ProtectedRoute role={role}><p>SECRET ADMIN PAGE</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("sends visitors who are not logged in to the login page", () => {
    auth = { user: null, loading: false };
    renderAt("admin");
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("shows a no-access message to a customer on an admin page", () => {
    auth = { user: { name: "Aarav", role: "customer" }, loading: false };
    renderAt("admin");
    expect(screen.queryByText("SECRET ADMIN PAGE")).not.toBeInTheDocument();
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
  });

  it("lets an admin in", () => {
    auth = { user: { name: "Kavitha", role: "admin" }, loading: false };
    renderAt("admin");
    expect(screen.getByText("SECRET ADMIN PAGE")).toBeInTheDocument();
  });
});
