import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiKey,
  FiLock,
  FiLogOut,
  FiMail,
  FiMonitor,
  FiShield,
  FiX,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  completeSecurityPasswordReset,
  getAccountSecurity,
  logoutAllDevices,
  requestSecurityPasswordReset,
  verifySecurityPasswordResetCode,
} from "../services/security.service";
import type {
  AccountSecurityEvent,
  AccountSecuritySession,
} from "../types/domain";
import "./AccountSecurity.css";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeEventName(value: string) {
  return value.replaceAll("_", " ");
}

type ResetStep = "idle" | "code_sent" | "code_verified";

function AccountSecurity() {
  const { user, refreshSession } = useAuth();
  const [sessions, setSessions] = useState<AccountSecuritySession[]>([]);
  const [events, setEvents] = useState<AccountSecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [resetStep, setResetStep] = useState<ResetStep>("idle");
  const [resetCode, setResetCode] = useState("");
  const [newPasswordOpen, setNewPasswordOpen] = useState(false);

  const maskedEmail = useMemo(() => {
    const email = user?.email || "";
    const [name, domain] = email.split("@");

    if (!name || !domain) return email;

    return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
  }, [user?.email]);

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

  async function handleRequestPasswordReset() {
    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      const result = await requestSecurityPasswordReset();
      setMessage(result.message);
      setResetStep("code_sent");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password reset code could not be sent.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") || "").trim();

    try {
      const result = await verifySecurityPasswordResetCode(code);
      setResetCode(code);
      setResetStep("code_verified");
      setNewPasswordOpen(true);
      setMessage(result.message);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The verification code could not be confirmed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompletePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await completeSecurityPasswordReset({
        code: resetCode,
        newPassword,
      });

      setMessage(result.message);
      setNewPasswordOpen(false);
      setResetCode("");
      setResetStep("idle");
      await loadSecurity();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password could not be updated.",
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
    return <LoadingState message="Loading account security..." />;
  }

  return (
    <main className="account-security-page">
      <section className="security-hero-card">
        <Link to="/profile" className="security-back-link">
          <FiArrowLeft />
          Back to profile
        </Link>

        <span className="eyebrow">Account Security</span>
        <h1>Secure your Gleank identity.</h1>
        <p>
          Manage email verification, password safety, active sessions, and
          security activity from one protected workspace.
        </p>
      </section>

      {error && (
        <div className="security-alert security-alert-error">
          <FiAlertCircle />
          {error}
        </div>
      )}

      {message && (
        <div className="security-alert security-alert-success">
          <FiCheckCircle />
          {message}
        </div>
      )}

      <section className="security-grid">
        <article className="security-card">
          <div className="security-card-icon">
            <FiMail />
          </div>

          <span>Verification</span>
          <h2>Email status</h2>
          <strong className={user?.emailVerified ? "is-good" : "is-warning"}>
            {user?.emailVerified ? "Verified" : "Not verified"}
          </strong>
          <p>
            {user?.emailVerified
              ? `Verified ${formatDate(user.emailVerifiedAt)}`
              : "Verify your email to unlock protected buying, selling, and messaging actions."}
          </p>

          <div className="security-card-actions">
            {!user?.emailVerified && (
              <Link to="/verify-email" className="primary-button">
                Verify email
              </Link>
            )}

            <button type="button" onClick={handleResync} className="ghost-button">
              Refresh status
            </button>
          </div>
        </article>

        <article className="security-card security-password-card">
          <div className="security-card-icon">
            <FiKey />
          </div>

          <span>Password</span>
          <h2>Reset password securely</h2>
          <p>
            For your safety, password changes from this page require a fresh
            code sent to your verified email: <strong>{maskedEmail}</strong>.
          </p>

          {resetStep === "idle" && (
            <button
              type="button"
              className="primary-button"
              onClick={handleRequestPasswordReset}
              disabled={isSubmitting || !user?.emailVerified}
            >
              <FiMail />
              {isSubmitting ? "Sending code..." : "Send verification code"}
            </button>
          )}

          {!user?.emailVerified && (
            <p className="security-help-text">
              Verify your email first before resetting your password from this
              page.
            </p>
          )}

          {resetStep === "code_sent" && (
            <form className="security-code-form" onSubmit={handleVerifyCode}>
              <label>
                Enter verification code
                <input
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  minLength={6}
                  maxLength={6}
                  required
                />
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting}
              >
                <FiLock />
                {isSubmitting ? "Checking code..." : "Verify code"}
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={handleRequestPasswordReset}
                disabled={isSubmitting}
              >
                Resend code
              </button>
            </form>
          )}

          {resetStep === "code_verified" && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setNewPasswordOpen(true)}
            >
              Open new password form
            </button>
          )}
        </article>

        <article className="security-card">
          <div className="security-card-icon">
            <FiMonitor />
          </div>

          <span>Sessions</span>
          <h2>Active devices</h2>
          <button
            type="button"
            onClick={handleLogoutAll}
            className="ghost-button"
            disabled={isSubmitting}
          >
            <FiLogOut />
            Logout other devices
          </button>

          <div className="security-list">
            {sessions.map((session) => (
              <div className="security-list-item" key={session.id}>
                <strong>{session.userAgent || "Unknown device"}</strong>
                <p>
                  {session.ipAddress || "Local session"} · Last used{" "}
                  {formatDate(session.lastUsedAt)}
                </p>
                <small>Expires {formatDate(session.expiresAt)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="security-card security-activity-card">
          <div className="security-card-icon">
            <FiShield />
          </div>

          <span>Activity</span>
          <h2>Recent security events</h2>

          <div className="security-list">
            {events.length ? (
              events.map((event) => (
                <div
                  className="security-list-item"
                  key={`${event.eventType}-${event.createdAt}`}
                >
                  <strong>{normalizeEventName(event.eventType)}</strong>
                  <p>
                    {formatDate(event.createdAt)} · {event.ipAddress || "local"}
                  </p>
                </div>
              ))
            ) : (
              <div className="security-list-item">
                <strong>No security events yet.</strong>
                <p>Your recent account protection activity will appear here.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      {newPasswordOpen && (
        <div className="security-modal-backdrop" role="presentation">
          <section
            className="security-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-password-title"
          >
            <button
              type="button"
              className="security-modal-close"
              onClick={() => setNewPasswordOpen(false)}
              aria-label="Close password form"
              disabled={isSubmitting}
            >
              <FiX />
            </button>

            <div className="security-card-icon">
              <FiLock />
            </div>

            <span className="eyebrow">Final step</span>
            <h2 id="new-password-title">Create a new password</h2>
            <p>
              Your email code is confirmed. Choose a strong password to protect
              your Gleank account.
            </p>

            <form onSubmit={handleCompletePasswordReset} className="security-modal-form">
              <label>
                New password
                <input
                  type="password"
                  name="newPassword"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              <label>
                Confirm new password
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              <button
                type="submit"
                className="primary-button full-width"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating password..." : "Update password"}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default AccountSecurity;
