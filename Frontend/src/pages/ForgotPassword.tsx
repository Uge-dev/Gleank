import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiLock,
  FiMail,
} from "react-icons/fi";
import AuthLayout from "../components/AuthLayout";
import {
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service";

type RecoveryStep = "request" | "reset" | "complete";

function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromLink = searchParams.get("token") || "";

  const [step, setStep] = useState<RecoveryStep>(
    tokenFromLink ? "reset" : "request",
  );
  const [token, setToken] = useState(tokenFromLink);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await requestPasswordReset(
        String(formData.get("email") || "").trim(),
      );

      setMessage(result.message);
      setStep("request");
      setToken("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password recovery could not be started.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await resetPassword({ token, password });
      setMessage(result.message);
      setStep("complete");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your password could not be reset.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <Link to="/login" className="auth-back-link">
        <FiArrowLeft />
        Back to login
      </Link>

      <span className="auth-eyebrow">Secure recovery</span>

      <h1>
        {step === "request"
          ? "Reset password"
          : step === "reset"
            ? "Choose a new password"
            : "Password updated"}
      </h1>

      <p className="auth-subtitle">
        {step === "request"
          ? "Enter the email connected to your Gleank account. If the account exists, a secure reset link will be sent to that email."
          : step === "reset"
            ? "Use at least eight characters for your new password."
            : "Your account is ready for a fresh login."}
      </p>

      {error && (
        <div className="auth-alert auth-alert-error">
          <FiAlertCircle />
          {error}
        </div>
      )}

      {message && (
        <div className="auth-alert auth-alert-success">
          <FiCheckCircle />
          {message}
        </div>
      )}

      {step === "request" && (
        <form onSubmit={handleRequest} className="auth-form">
          <label>
            Email address
            <span>
              <FiMail />
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </span>
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Preparing recovery..." : "Send reset link"}
          </button>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={handleReset} className="auth-form">
          <label>
            New password
            <span>
              <FiLock />
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </span>
          </label>

          <label>
            Confirm new password
            <span>
              <FiLock />
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </span>
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Reset password"}
          </button>
        </form>
      )}

      {step === "complete" && (
        <Link to="/login" className="auth-submit-link">
          Continue to login
        </Link>
      )}

      <p className="auth-footer-note">
        Need a different account? <Link to="/signup">Create account</Link>
      </p>
    </AuthLayout>
  );
}

export default ForgotPassword;
