import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiMapPin,
  FiPhone,
  FiShoppingBag,
  FiUser,
} from "react-icons/fi";
import AuthLayout from "../components/AuthLayout";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { useAuth } from "../context/AuthContext";

type AccountType = "buyer" | "seller";

function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [developmentToken, setDevelopmentToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const responseUser = await register({
        name: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        campus: String(formData.get("campus") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        storeName: String(formData.get("storeName") || "").trim(),
        password: String(formData.get("password") || ""),
        role: accountType,
      });
      const devToken = localStorage.getItem("gleank_last_verification_token") || "";
      if (!responseUser.emailVerified) {
        if (devToken) setDevelopmentToken(devToken);
        navigate("/verify-email");
        return;
      }
      navigate(responseUser.role === "seller" ? "/seller/onboarding" : "/profile");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Account creation could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Join Gleank"
      title="Create a real campus marketplace account."
      description="Choose a buyer account for shopping or a seller account with an automatically created store workspace."
    >
      <div className="auth-form-card">
        <div className="auth-form-header">
          <span>Create account</span>
          <h2>Get started</h2>
          <p>Your account and store data will be saved in the Gleank database.</p>
        </div>

        <div className="account-type-toggle">
          <button
            type="button"
            className={accountType === "buyer" ? "active" : ""}
            onClick={() => setAccountType("buyer")}
          >
            <FiUser />
            Buyer
          </button>
          <button
            type="button"
            className={accountType === "seller" ? "active" : ""}
            onClick={() => setAccountType("seller")}
          >
            <FiShoppingBag />
            Seller
          </button>
        </div>

        {error && (
          <div className="auth-inline-message error" role="alert">
            <FiAlertCircle />
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Full name</span>
            <div className="auth-input-box">
              <FiUser />
              <input
                name="fullName"
                type="text"
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </div>
          </label>

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
            <span>Phone number</span>
            <div className="auth-input-box">
              <FiPhone />
              <input
                name="phone"
                type="tel"
                placeholder="080..."
                autoComplete="tel"
              />
            </div>
          </label>

          <label>
            <span>Campus</span>
            <div className="auth-input-box">
              <FiMapPin />
              <select name="campus" required defaultValue="">
                <option value="" disabled>Select your campus</option>
                <option value="FUPRE">FUPRE</option>
                <option value="DELSU">DELSU</option>
                <option value="UNIBEN">UNIBEN</option>
                <option value="UNILAG">UNILAG</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </label>

          {accountType === "seller" && (
            <label>
              <span>Store name</span>
              <div className="auth-input-box">
                <FiShoppingBag />
                <input
                  name="storeName"
                  type="text"
                  placeholder="Example: Tasty Bowl"
                  required
                />
              </div>
            </label>
          )}

          <label>
            <span>Password</span>
            <div className="auth-input-box">
              <FiLock />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

          <PasswordStrengthMeter password={password} />

          {developmentToken && (
            <div className="auth-dev-token-box">
              <span>Development verification token</span>
              <code>{developmentToken}</code>
              <Link to={`/verify-email?token=${encodeURIComponent(developmentToken)}`}>Open verification link</Link>
            </div>
          )}

          <label className="terms-row">
            <input type="checkbox" required />
            <span>
              I agree to Gleank&apos;s <Link to="/help">Terms</Link> and{" "}
              <Link to="/help">Privacy Policy</Link>.
            </span>
          </label>

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="auth-switch-text">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default Signup;
