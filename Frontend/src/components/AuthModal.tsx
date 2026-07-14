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
  FiTruck,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../types/domain";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (user: AuthUser) => void;
};

function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
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
      const user = await login({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      onClose();
      onLoginSuccess?.(user);
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
          Secure login
        </div>

        <h2 id="gleank-login-title">Log in to Gleenc</h2>
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

          <Link
            className="auth-modal-forgot-link"
            to="/forgot-password"
            onClick={onClose}
          >
            Forgot password?
          </Link>

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

        <div className="auth-bottom">
          <span>Don&apos;t have an account?</span>
          <Link to="/signup" onClick={onClose}>
            Create one
          </Link>
        </div>
        <Link className="auth-rider-link" to="/rider/signup" onClick={onClose}>
          <FiTruck /> Become a rider
        </Link>
      </div>
    </div>
  );
}

export default AuthModal;
