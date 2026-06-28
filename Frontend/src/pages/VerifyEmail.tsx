import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiCheckCircle, FiMail, FiRefreshCw } from "react-icons/fi";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { resendVerification, verifyEmail } from "../services/auth.service";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { refreshSession, user } = useAuth();
  const [message, setMessage] = useState("");
  const [devToken, setDevToken] = useState(() => localStorage.getItem("gleank_last_verification_token") || "");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;

    let active = true;

    void verifyEmail(token)
      .then(async (result) => {
        if (!active) return;
        setMessage(result.message || "Email verified successfully.");
        localStorage.removeItem("gleank_last_verification_token");
        await refreshSession();
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Email verification could not be completed.",
          );
        }
      })
      .finally(() => {
        if (active) setIsWorking(false);
      });

    return () => {
      active = false;
    };
  }, [refreshSession, token]);

  async function handleResend() {
    setError("");
    setMessage("");
    setDevToken("");
    setIsWorking(true);

    try {
      const result = await resendVerification();
      setMessage(result.message);
      setDevToken(result.developmentEmailVerificationToken || "");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Verification email could not be prepared.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Email verification"
      title="Protect your Gleank account before you trade."
      description="Verified emails help secure orders, seller dashboards, used-market chats, payout records, and account recovery."
    >
      <div className="auth-form-card verification-card">
        <div className="verification-icon-ring">
          {message || user?.emailVerified ? <FiCheckCircle /> : <FiMail />}
        </div>

        <div className="auth-form-header centered">
          <span>Account verification</span>
          <h2>{user?.emailVerified || message ? "Email verified" : "Verify your email"}</h2>
          <p>
            {user?.emailVerified || message
              ? "Your account can now access protected Gleank actions."
              : "Open the verification link sent after signup, or request a fresh one."}
          </p>
        </div>

        {isWorking && <div className="auth-inline-message">Checking verification link...</div>}

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

        {devToken && (
          <div className="auth-dev-token-box">
            <span>Development verification token</span>
            <code>{devToken}</code>
            <Link to={`/verify-email?token=${encodeURIComponent(devToken)}`}>
              Open verification link
            </Link>
          </div>
        )}

        {!user?.emailVerified && (
          <button className="auth-submit-btn" type="button" onClick={handleResend} disabled={isWorking}>
            <FiRefreshCw />
            {isWorking ? "Preparing..." : "Resend verification"}
          </button>
        )}

        <p className="auth-switch-text">
          Continue to <Link to="/profile">Profile</Link> or <Link to="/login">Login</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default VerifyEmail;
