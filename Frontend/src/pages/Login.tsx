import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const user = await login({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      if (!user.emailVerified) {
        navigate("/verify-email");
        return;
      }
      navigate(user.role === "seller" ? "/dashboard" : "/profile");
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
    <AuthLayout
      eyebrow="Welcome back"
      title="Login to continue shopping, selling, and chatting."
      description="Your Gleank account now uses real server authentication and persistent sessions."
    >
      <div className="auth-form-card">
        <div className="auth-form-header">
          <span>Secure login</span>
          <h2>Welcome back</h2>
          <p>Enter the account details registered with Gleank.</p>
        </div>

        {error && (
          <div className="auth-inline-message error" role="alert">
            <FiAlertCircle />
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
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

          <label>
            <span>Password</span>
            <div className="auth-input-box">
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

          <div className="auth-form-options">
            <label className="remember-row">
              <input type="checkbox" defaultChecked />
              <span>Keep me signed in</span>
            </label>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="auth-switch-text">
          New to Gleank? <Link to="/signup">Create account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default Login;
