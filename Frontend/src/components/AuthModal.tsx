import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiShield,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setError("");
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      await login({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Login could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-modal-overlay" role="presentation">
      <div
        className="auth-modal tiktok-style-auth auth-modal-secure"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gleank-login-title"
      >
        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label="Close login popup"
        >
          <FiX />
        </button>

        <div className="auth-secure-badge">
          <FiShield />
          Real account authentication
        </div>

        <h2 id="gleank-login-title">Log in to Gleank</h2>
        <p className="auth-modal-intro">
          Continue to protected shopping, messaging, checkout, and seller tools.
        </p>

        {error && (
          <div className="auth-inline-message error" role="alert">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-modal-email-form" onSubmit={handleEmailLogin}>
          <label>
            <span>Email address</span>
            <div className="auth-modal-input">
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

          <label>
            <span>Password</span>
            <div className="auth-modal-input">
              <FiLock />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                autoComplete="current-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="auth-modal-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              "Signing in..."
            ) : (
              <>
                <FiCheckCircle />
                Secure login
              </>
            )}
          </button>
        </form>

        <p className="auth-policy-text">
          Authentication is handled by the local Gleank API using a secure
          HTTP-only session cookie. Passwords are never stored in the browser.
        </p>

        <div className="auth-bottom">
          <span>Don&apos;t have an account?</span>
          <Link to="/signup" onClick={onClose}>
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
