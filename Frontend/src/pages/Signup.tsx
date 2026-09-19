import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import "./commerce/Commerce.css";
export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  return (
    <section className="commerce-page">
      <span className="commerce-eyebrow">Welcome to Gleenc</span>
      <h1>One account. Many possibilities.</h1>
      <p>Discover, sell, dropship, and promote products with one profile.</p>
      <form
        className="commerce-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            await register({
              name: String(data.get("name")),
              email: String(data.get("email")),
              password,
              role: "buyer",
              campus: "",
              country: "Nigeria",
            });
            navigate("/complete-profile", { replace: true });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not create account.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Full name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <label>
          Email
          <input name="email" required type="email" autoComplete="email" />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        <PasswordStrengthMeter password={password} />
        {error && (
          <p role="alert" className="commerce-error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p>
        Already a member? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
