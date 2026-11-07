import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuthPage, { validateAuth } from "../pages/AuthPage";
import { ToastProvider } from "../context/ToastContext";

// `login` is a plain function that forwards to whatever each test sets in loginImpl
// (a vi.fn that rejects makes Vitest report the rejection as a test error).
const calls = [];
let loginImpl = async () => ({ name: "Aarav Sharma", role: "customer" });
const login = (...args) => {
  calls.push(args);
  return loginImpl(...args);
};
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login, register: async () => ({}), user: null, loading: false }),
}));

function show(mode = "login") {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthPage mode={mode} />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("validateAuth (same rules as the server)", () => {
  it("accepts a good registration", () => {
    expect(validateAuth("register", { name: "Priya Nair", email: "priya@gmail.com", password: "Secret123" })).toEqual({});
  });
  it("rejects bad name, email and password", () => {
    const e = validateAuth("register", { name: "P", email: "nope", password: "abc" });
    expect(e.name).toBeTruthy();
    expect(e.email).toBeTruthy();
    expect(e.password).toMatch(/8 characters/);
  });
  it("needs a letter and a number in the password", () => {
    expect(validateAuth("register", { name: "Priya", email: "a@b.co", password: "abcdefgh" }).password).toMatch(/number/);
  });
  it("login only asks for email and password", () => {
    expect(validateAuth("login", { name: "", email: "a@b.co", password: "x" })).toEqual({});
  });
});

describe("AuthPage", () => {
  beforeEach(() => {
    calls.length = 0;
    loginImpl = async () => ({ name: "Aarav Sharma", role: "customer" });
  });

  it("shows field errors and does not call the server when the form is empty", async () => {
    show("login");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("logs in with the typed email and password", async () => {
    show("login");
    await userEvent.type(screen.getByLabelText("Email"), "aarav.sharma@gmail.com");
    await userEvent.type(screen.getByLabelText("Password"), "Demo@1234");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(calls).toEqual([["aarav.sharma@gmail.com", "Demo@1234"]]);
  });

  it("shows the server message when the login is wrong", async () => {
    loginImpl = async () => {
      throw Object.assign(new Error("Invalid email or password"), { fields: {} });
    };
    show("login");
    await userEvent.type(screen.getByLabelText("Email"), "aarav.sharma@gmail.com");
    await userEvent.type(screen.getByLabelText("Password"), "Wrong1234");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("fills the demo account when its chip is clicked", async () => {
    show("login");
    await userEvent.click(screen.getByRole("button", { name: "Admin demo" }));
    expect(screen.getByLabelText("Email")).toHaveValue("admin@careslot.in");
  });

  it("the register page asks for a name", () => {
    show("register");
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });
});
