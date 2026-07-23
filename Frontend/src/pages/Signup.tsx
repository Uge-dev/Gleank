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
  FiShield,
  FiShoppingBag,
  FiTruck,
  FiUser,
} from "react-icons/fi";
import AuthLayout from "../components/AuthLayout";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { useAuth } from "../context/AuthContext";

type AccountType = "buyer" | "seller" | "rider";

function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const identityDocument = formData.get("identityDocument");
    const selfie = formData.get("selfie");

    if (
      accountType === "rider" &&
      (!(identityDocument instanceof File) || !identityDocument.size || !(selfie instanceof File) || !selfie.size)
    ) {
      setError("Upload rider government ID and profile/selfie image before creating a rider account.");
      setIsSubmitting(false);
      return;
    }

    try {
      const responseUser = await register({
        name: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        campus: String(formData.get("campus") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        storeName: String(formData.get("storeName") || "").trim(),
        vehicleType: String(formData.get("vehicleType") || "").trim(),
        vehiclePlate: String(formData.get("vehiclePlate") || "").trim(),
        coverageArea: String(formData.get("coverageArea") || "").trim(),
        homeAddress: String(formData.get("homeAddress") || "").trim(),
        transportType: String(formData.get("transportType") || formData.get("vehicleType") || "").trim(),
        maxPackageSize: String(formData.get("maxPackageSize") || "small_medium").trim(),
        maxWeightClass: String(formData.get("maxWeightClass") || "up_to_medium").trim(),
        fragileHandlingAbility: String(formData.get("fragileHandlingAbility") || "can_handle_fragile").trim(),
        deliveryBagType: String(formData.get("deliveryBagType") || "medium_delivery_bag").trim(),
        gpsPermissionStatus: String(formData.get("gpsPermissionStatus") || "gps_disabled"),
        canReceiveAutoDispatch: formData.get("canReceiveAutoDispatch") === "on",
        identityDocument: identityDocument instanceof File ? identityDocument : null,
        selfie: selfie instanceof File ? selfie : null,
        password: String(formData.get("password") || ""),
        role: accountType,
      });
      if (!responseUser.emailVerified) {
        navigate("/verify-email");
        return;
      }
      if (responseUser.role === "rider") {
        navigate("/rider");
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
      eyebrow="Join Gleenc"
      title="Create your Gleenc account."
      description="Choose buyer, seller, or rider so Gleenc opens the correct workspace after verification."
    >
      <div className="auth-form-card">
        <div className="auth-form-header">
          <span>Create account</span>
          <h2>Get started</h2>
          <p>Your account and store data will be saved in the Gleenc database.</p>
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
          <button
            type="button"
            className={accountType === "rider" ? "active" : ""}
            onClick={() => setAccountType("rider")}
          >
            <FiTruck />
            Rider
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
                required={accountType === "rider"}
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

          {accountType === "rider" && (
            <>
              <label>
                <span>Vehicle type</span>
                <div className="auth-input-box">
                  <FiTruck />
                  <select name="vehicleType" required defaultValue="motorcycle">
                    <option value="walking">Walking</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="tricycle_keke">Tricycle/Keke</option>
                    <option value="car">Car</option>
                    <option value="van">Van</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Vehicle / bike number</span>
                <div className="auth-input-box">
                  <FiTruck />
                  <input
                    name="vehiclePlate"
                    type="text"
                    placeholder="Plate or bike number"
                    required
                  />
                </div>
              </label>

              <label>
                <span>Coverage area</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <input
                    name="coverageArea"
                    type="text"
                    placeholder="FUPRE, Ugbomro, Effurun..."
                    required
                  />
                </div>
              </label>

              <label>
                <span>Maximum package size</span>
                <div className="auth-input-box">
                  <FiTruck />
                  <select name="maxPackageSize" required defaultValue="small_medium">
                    <option value="small_only">Small only</option>
                    <option value="small_medium">Small + medium</option>
                    <option value="small_medium_large">Small, medium + large</option>
                    <option value="large_and_bulky">Large and bulky</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Maximum weight</span>
                <div className="auth-input-box">
                  <FiTruck />
                  <select name="maxWeightClass" required defaultValue="up_to_medium">
                    <option value="very_light_only">Very light only</option>
                    <option value="up_to_light">Up to light</option>
                    <option value="up_to_medium">Up to medium</option>
                    <option value="up_to_heavy">Up to heavy</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Fragile handling</span>
                <div className="auth-input-box">
                  <FiShield />
                  <select name="fragileHandlingAbility" required defaultValue="can_handle_fragile">
                    <option value="cannot_handle_fragile">Cannot handle fragile</option>
                    <option value="can_handle_fragile">Can handle fragile</option>
                    <option value="can_handle_very_fragile">Can handle very fragile</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Delivery bag / box</span>
                <div className="auth-input-box">
                  <FiShoppingBag />
                  <select name="deliveryBagType" required defaultValue="medium_delivery_bag">
                    <option value="none">None</option>
                    <option value="small_delivery_bag">Small delivery bag</option>
                    <option value="medium_delivery_bag">Medium delivery bag</option>
                    <option value="large_delivery_box">Large delivery box</option>
                    <option value="insulated_bag">Insulated bag</option>
                    <option value="fragile_item_box">Fragile item box</option>
                  </select>
                </div>
              </label>

              <label className="terms-row">
                <input name="canReceiveAutoDispatch" type="checkbox" defaultChecked />
                <span>Allow compatible automated dispatch offers after admin verification.</span>
              </label>

              <label>
                <span>Government ID image</span>
                <div className="auth-input-box">
                  <FiShield />
                  <input
                    name="identityDocument"
                    type="file"
                    accept="image/*"
                    required
                  />
                </div>
              </label>

              <label>
                <span>Profile/selfie image</span>
                <div className="auth-input-box">
                  <FiUser />
                  <input
                    name="selfie"
                    type="file"
                    accept="image/*"
                    required
                  />
                </div>
              </label>
            </>
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


          <label className="terms-row">
            <input type="checkbox" required />
            <span>
              I agree to Gleenc&apos;s <Link to="/help">Terms</Link> and{" "}
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
