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
    <AuthLayout
      eyebrow="Account recovery"
      title="Get back into Gleenc"
      description="Securely reset your buyer or seller password using the email attached to your account."
    >
      <div className="auth-form-card recovery-card">
        <Link to="/login" className="auth-back-link">
          <FiArrowLeft />
          Back to login
        </Link>

        <div className="recovery-icon-ring">
          {step === "complete" ? <FiCheckCircle /> : step === "reset" ? <FiLock /> : <FiMail />}
        </div>

        <div className="auth-form-header centered">
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
              ? "Enter the email connected to your Gleenc account. If the account exists, a secure reset link will be sent there."
              : step === "reset"
                ? "Create a strong new password for this buyer or seller account."
                : "Your account is ready for a fresh login."}
          </p>
        </div>

        {error && (
          <div className="auth-inline-message error" role="alert">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="auth-inline-message success" role="status">
            <FiCheckCircle />
            <span>{message}</span>
          </div>
        )}

        {step === "request" && (
          <form onSubmit={handleRequest} className="auth-form recovery-form">
            <label>
              <span>Email address</span>
              <div className="auth-input-box">
                <FiMail />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </label>

            <button className="auth-submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Preparing recovery..." : "Send reset link"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleReset} className="auth-form recovery-form">
            <label>
              <span>New password</span>
              <div className="auth-input-box">
                <FiLock />
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </label>

            <label>
              <span>Confirm new password</span>
              <div className="auth-input-box">
                <FiLock />
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </label>

            <button className="auth-submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating password..." : "Reset password"}
            </button>
          </form>
        )}

        {step === "complete" && (
          <Link to="/login" className="auth-submit-link recovery-submit-link">
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
