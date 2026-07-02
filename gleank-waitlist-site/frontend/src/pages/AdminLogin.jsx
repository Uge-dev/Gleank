import React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminLogin, setAdminToken } from "../services/api.js";

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await adminLogin({ email, password });
      setAdminToken(result.token);
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Unable to login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-auth-page">
      <form className="admin-auth-card" onSubmit={handleSubmit}>
        <Link to="/" className="brand auth-brand"><span>G</span><strong>Gleank</strong></Link>
        <h1>Waitlist Admin</h1>
        <p>Login to view Gleank waitlist submissions.</p>

        <label>
          Admin email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@gleank.com" required />
        </label>

        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter admin password" required />
        </label>

        <button disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        {error && <p className="form-message error">{error}</p>}
      </form>
    </main>
  );
}

export default AdminLogin;
