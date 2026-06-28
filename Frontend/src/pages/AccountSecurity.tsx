import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiLock,
  FiLogOut,
  FiMail,
  FiMonitor,
  FiShield,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  changePassword,
  getAccountSecurity,
  logoutAllDevices,
} from "../services/security.service";
import type { AccountSecurityEvent, AccountSecuritySession } from "../types/domain";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AccountSecurity() {
  const { user, refreshSession } = useAuth();
  const [sessions, setSessions] = useState<AccountSecuritySession[]>([]);
  const [events, setEvents] = useState<AccountSecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSecurity() {
    setIsLoading(true);
    try {
      const result = await getAccountSecurity();
      setSessions(result.sessions);
      setEvents(result.events);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSecurity();
  }, []);

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await changePassword({
        currentPassword: String(formData.get("currentPassword") || ""),
        newPassword,
      });
      setMessage(result.message);
      event.currentTarget.reset();
      await loadSecurity();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password could not be changed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogoutAll() {
    setMessage("");
    setError("");
    setIsSubmitting(true);
    try {
      const result = await logoutAllDevices();
      setMessage(result.message);
      await loadSecurity();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Other sessions could not be signed out.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResync() {
    await refreshSession();
    await loadSecurity();
  }

  if (isLoading) {
    return (
      <section className="account-security-page">
        <LoadingState title="Loading security" message="Checking sessions and verification state." />
      </section>
    );
  }

  return (
    <section className="account-security-page">
      <Link to="/profile" className="security-back-link">
        <FiArrowLeft />
        Back to profile
      </Link>

      <div className="security-hero-card">
        <span><FiShield /> Account Security</span>
        <h1>Secure your Gleank identity.</h1>
        <p>
          Manage email verification, password safety, active sessions, and security activity from one protected workspace.
        </p>
      </div>

      {error && <div className="security-message error"><FiAlertCircle />{error}</div>}
      {message && <div className="security-message success"><FiCheckCircle />{message}</div>}

      <div className="security-grid">
        <section className="security-card">
          <div className="security-card-title">
            <div><FiMail /></div>
            <div>
              <span>Verification</span>
              <h2>Email status</h2>
            </div>
          </div>

          <div className="security-status-box">
            <strong>{user?.emailVerified ? "Verified" : "Not verified"}</strong>
            <p>{user?.emailVerified ? `Verified ${formatDate(user.emailVerifiedAt)}` : "Verify your email to unlock protected buying, selling, and messaging actions."}</p>
            {!user?.emailVerified && <Link to="/verify-email">Verify email</Link>}
            <button type="button" onClick={handleResync}>Refresh status</button>
          </div>
        </section>

        <section className="security-card">
          <div className="security-card-title">
            <div><FiLock /></div>
            <div>
              <span>Password</span>
              <h2>Change password</h2>
            </div>
          </div>

          <form className="security-form" onSubmit={handlePassword}>
            <label>
              <span>Current password</span>
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label>
              <span>New password</span>
              <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <label>
              <span>Confirm new password</span>
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Updating..." : "Update password"}</button>
          </form>
        </section>
      </div>

      <div className="security-grid lower">
        <section className="security-card wide">
          <div className="security-card-title split">
            <div className="security-title-inline">
              <div><FiMonitor /></div>
              <div>
                <span>Sessions</span>
                <h2>Active devices</h2>
              </div>
            </div>
            <button type="button" onClick={handleLogoutAll} disabled={isSubmitting}>
              <FiLogOut /> Logout other devices
            </button>
          </div>

          <div className="session-list">
            {sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <FiMonitor />
                <div>
                  <strong>{session.userAgent || "Unknown device"}</strong>
                  <p>{session.ipAddress || "Local session"} · Last used {formatDate(session.lastUsedAt)}</p>
                </div>
                <span>Expires {formatDate(session.expiresAt)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="security-card wide">
          <div className="security-card-title">
            <div><FiClock /></div>
            <div>
              <span>Activity</span>
              <h2>Recent security events</h2>
            </div>
          </div>

          <div className="security-event-list">
            {events.length ? events.map((event) => (
              <div key={`${event.eventType}-${event.createdAt}`}>
                <strong>{event.eventType.replaceAll("_", " ")}</strong>
                <p>{formatDate(event.createdAt)} · {event.ipAddress || "local"}</p>
              </div>
            )) : <p>No security events yet.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

export default AccountSecurity;
