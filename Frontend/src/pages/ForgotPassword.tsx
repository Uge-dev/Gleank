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

      if (result.developmentToken) {
        setToken(result.developmentToken);
        setStep("reset");
      }
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
    <AuthLayout
      eyebrow="Password recovery"
      title="Reset your password and get back into Gleank."
      description="Recovery tokens are generated securely, expire automatically, and invalidate existing sessions after use."
    >
      <div className="auth-form-card">
        <Link to="/login" className="auth-back-link">
          <FiArrowLeft />
          Back to login
        </Link>

        <div className="auth-form-header">
          <span>Secure recovery</span>
          <h2>
            {step === "request"
              ? "Reset password"
              : step === "reset"
                ? "Choose a new password"
                : "Password updated"}
          </h2>
          <p>
            {step === "request"
              ? "Enter the email connected to your Gleank account."
              : step === "reset"
                ? "Use at least eight characters for your new password."
                : "Your account is ready for a fresh login."}
          </p>
        </div>

        {error && (
          <div className="auth-inline-message error" role="alert">
            <FiAlertCircle />
            {error}
          </div>
        )}

        {message && (
          <div className="auth-inline-message success" role="status">
            <FiCheckCircle />
            {message}
          </div>
        )}

        {step === "request" && (
          <form className="auth-form" onSubmit={handleRequest}>
            <label>
              <span>Email address</span>
              <div className="auth-input-box">
                <FiMail />
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <button
              className="auth-submit-btn"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Preparing recovery..." : "Continue"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form className="auth-form" onSubmit={handleReset}>
            <label>
              <span>New password</span>
              <div className="auth-input-box">
                <FiLock />
                <input
                  name="password"
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
            </label>

            <label>
              <span>Confirm new password</span>
              <div className="auth-input-box">
                <FiLock />
                <input
                  name="confirmPassword"
                  type="password"
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
            </label>

            <button
              className="auth-submit-btn"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating password..." : "Reset password"}
            </button>
          </form>
        )}

        {step === "complete" && (
          <Link className="auth-submit-btn auth-primary-link" to="/login">
            Continue to login
          </Link>
        )}

        <p className="auth-switch-text">
          Need a different account? <Link to="/signup">Create account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default ForgotPassword;
