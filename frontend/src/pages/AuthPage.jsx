import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Brand } from "../components/Layout";
import { Button, Field, FormError } from "../components/ui";
import Icon from "../components/Icon";
import { homePathFor } from "../components/ProtectedRoute";
import { useTitle } from "../hooks";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** The same checks the server makes, so people see mistakes before pressing the button. */
export function validateAuth(mode, values) {
  const errors = {};
  if (mode === "register") {
    const name = values.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) errors.name = "Enter your full name (at least 2 letters)";
  }
  if (!EMAIL_RE.test(values.email.trim())) errors.email = "Enter a valid email address";
  if (!values.password) errors.password = mode === "login" ? "Enter your password" : "Create a password";
  else if (mode === "register") {
    if (values.password.length < 8) errors.password = "Use at least 8 characters";
    else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) errors.password = "Include at least one letter and one number";
  }
  return errors;
}

const DEMOS = [
  { label: "Customer demo", email: "aarav.sharma@gmail.com", password: "Demo@1234" },
  { label: "Admin demo", email: "saisathvik@gmail.com", password: "Admin@123" },
];

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  useTitle(isLogin ? "Log in" : "Create account");
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const found = validateAuth(mode, values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const user = isLogin
        ? await login(values.email.trim(), values.password)
        : await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      toast.success(isLogin ? `Welcome back, ${user.name.split(" ")[0]}!` : "Your account is ready. Let's book your first visit.");
      const wanted = location.state?.from;
      const allowed = wanted && (user.role === "admin" ? wanted.startsWith("/admin") : !wanted.startsWith("/admin"));
      navigate(allowed ? wanted : homePathFor(user), { replace: true });
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-hero" aria-hidden="false">
        <Brand light />
        <div className="auth-hero-body">
          <h2>Care that fits your calendar.</h2>
          <p>Pick an open time, book in seconds, and change your mind whenever you need to.</p>
          <ul className="hero-points">
            <li><span><Icon name="clock" size={18} /></span> Live availability, no phone calls</li>
            <li><span><Icon name="repeat" size={18} /></span> Reschedule or cancel in one tap</li>
            <li><span><Icon name="shield" size={18} /></span> Secure login. Your history stays private</li>
          </ul>
          <div className="hero-card" role="img" aria-label="Example appointment card">
            <div className="hero-date"><span>NOV</span><strong>12</strong></div>
            <div>
              <strong>Dental Checkup</strong>
              <small>10:45 – 11:30 AM</small>
            </div>
            <span className="chip chip-booked">Confirmed</span>
          </div>
        </div>
      </aside>

      <main className="auth-panel" id="main">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Brand /></div>
          <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="subtitle">{isLogin ? "Log in to book and manage your appointments." : "It takes less than a minute."}</p>

          <form onSubmit={submit} noValidate>
            <FormError>{formError}</FormError>

            {!isLogin && (
              <Field label="Full name" error={errors.name}>
                {(p) => <input {...p} type="text" autoComplete="name" value={values.name} onChange={set("name")} placeholder="Ananya Reddy" />}
              </Field>
            )}
            <Field label="Email" error={errors.email}>
              {(p) => <input {...p} type="email" autoComplete="email" value={values.email} onChange={set("email")} placeholder="you@gmail.com" />}
            </Field>
            <Field label="Password" error={errors.password} hint={!isLogin ? "At least 8 characters with a letter and a number" : undefined}>
              {(p) => (
                <div className="input-with-button">
                  <input {...p} type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"} value={values.password} onChange={set("password")} />
                  <button type="button" className="input-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    <Icon name={showPassword ? "eyeoff" : "eye"} size={18} />
                  </button>
                </div>
              )}
            </Field>

            <Button type="submit" size="lg" className="btn-block" loading={busy}>
              {isLogin ? "Log in" : "Create account"}
            </Button>
          </form>

          <p className="switch">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link>
          </p>

          {isLogin && (
            <div className="demo-box">
              <p>Demo accounts <span>(click to fill)</span></p>
              <div className="demo-row">
                {DEMOS.map((d) => (
                  <button key={d.email} type="button" className="chip-btn" onClick={() => { setValues({ name: "", email: d.email, password: d.password }); setErrors({}); setFormError(""); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
