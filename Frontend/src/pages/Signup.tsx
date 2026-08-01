import { useEffect, useState } from "react";
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
import {
  geocodeSellerLocation,
  getLocationCatalog,
  type GeocodedSellerLocation,
  type LocationCatalog,
} from "../services/structured-location.service";

type AccountType = "buyer" | "seller";

function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationCatalog, setLocationCatalog] = useState<LocationCatalog | null>(null);
  const [locationMatches, setLocationMatches] = useState<GeocodedSellerLocation[]>([]);
  const [isFindingLocation, setIsFindingLocation] = useState(false);
  const [sellerLocation, setSellerLocation] = useState({
    country: "Nigeria",
    state: "",
    city: "",
    nearestCampus: "",
    nearestMarketplace: "",
    street: "",
    pickupPlaceId: "",
    pickupLat: "",
    pickupLng: "",
    locationVerifiedAt: "",
  });

  useEffect(() => {
    if (accountType !== "seller" || locationCatalog) return;
    void getLocationCatalog()
      .then(setLocationCatalog)
      .catch(() => setError("Seller locations could not load. Check your connection and try again."));
  }, [accountType, locationCatalog]);

  function updateSellerLocation(
    field: keyof typeof sellerLocation,
    value: string,
  ) {
    setSellerLocation((current) => ({
      ...current,
      [field]: value,
      ...(field === "state" ? { city: "" } : {}),
      pickupPlaceId: "",
      pickupLat: "",
      pickupLng: "",
      locationVerifiedAt: "",
    }));
    setLocationMatches([]);
  }

  async function findSellerLocation() {
    const searchText = [
      sellerLocation.street,
      sellerLocation.nearestMarketplace,
      sellerLocation.nearestCampus,
      sellerLocation.city,
      sellerLocation.state,
      sellerLocation.country,
    ].filter(Boolean).join(", ");
    if (!sellerLocation.state || !sellerLocation.city || !sellerLocation.street) {
      setError("Choose your state and city, then enter your street before finding the map pin.");
      return;
    }
    setError("");
    setIsFindingLocation(true);
    try {
      const response = await geocodeSellerLocation(searchText);
      setLocationMatches(
        response.results.filter((result) => result.placeId && result.lat !== null && result.lng !== null),
      );
      if (!response.results.some((result) => result.placeId && result.lat !== null && result.lng !== null)) {
        setError("No verified Nigerian map pin matched that address. Add more street or landmark detail.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The location could not be mapped.");
    } finally {
      setIsFindingLocation(false);
    }
  }

  function confirmSellerLocation(result: GeocodedSellerLocation) {
    setSellerLocation((current) => ({
      ...current,
      state: result.state || current.state,
      city: result.city || current.city,
      pickupPlaceId: result.placeId,
      pickupLat: String(result.lat ?? ""),
      pickupLng: String(result.lng ?? ""),
      locationVerifiedAt: new Date().toISOString(),
    }));
    setLocationMatches([]);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    if (accountType === "seller" && !sellerLocation.pickupPlaceId) {
      setError("Find and confirm your real pickup map pin before creating a seller account.");
      setIsSubmitting(false);
      return;
    }

    try {
      const responseUser = await register({
        name: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        campus: accountType === "seller"
          ? sellerLocation.nearestCampus
          : String(formData.get("campus") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        storeName: String(formData.get("storeName") || "").trim(),
        password: String(formData.get("password") || ""),
        role: accountType,
        ...(accountType === "seller"
          ? {
              sellerType: String(formData.get("sellerType") || "campus") as
                | "campus"
                | "local_market"
                | "used_market",
              ...sellerLocation,
              pickupLat: Number(sellerLocation.pickupLat),
              pickupLng: Number(sellerLocation.pickupLng),
            }
          : {}),
      });
      if (!responseUser.emailVerified) {
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
      eyebrow="Join Gleenc"
      title="Create your Gleenc account."
      description="Create a buyer or seller account. Rider accounts are created only from the Gleenc Rider page."
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

          {accountType === "buyer" && (
            <label>
              <span>Nearest campus</span>
              <div className="auth-input-box">
                <FiMapPin />
                <select name="campus" required defaultValue="">
                  <option value="" disabled>Select your nearest campus</option>
                  <option value="FUPRE">FUPRE</option>
                  <option value="DELSU">DELSU</option>
                  <option value="UNIBEN">UNIBEN</option>
                  <option value="UNILAG">UNILAG</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </label>
          )}

          {accountType === "seller" && (
            <div className="auth-seller-location-fields">
              <label>
                <span>Store name</span>
                <div className="auth-input-box">
                  <FiShoppingBag />
                  <input name="storeName" type="text" placeholder="Example: Tasty Bowl" required />
                </div>
              </label>
              <label>
                <span>Seller setup</span>
                <div className="auth-input-box">
                  <FiShoppingBag />
                  <select name="sellerType" defaultValue="campus" required>
                    <option value="campus">Campus-based seller</option>
                    <option value="local_market">Local market seller</option>
                    <option value="used_market">Used product seller</option>
                  </select>
                </div>
              </label>
              <label>
                <span>Country</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <select value={sellerLocation.country} onChange={(event) => updateSellerLocation("country", event.target.value)} required>
                    <option value="Nigeria">Nigeria</option>
                  </select>
                </div>
              </label>
              <label>
                <span>State</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <select value={sellerLocation.state} onChange={(event) => updateSellerLocation("state", event.target.value)} required>
                    <option value="">Select state</option>
                    {(locationCatalog?.states || []).map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                  </select>
                </div>
              </label>
              <label>
                <span>City</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <select value={sellerLocation.city} onChange={(event) => updateSellerLocation("city", event.target.value)} required>
                    <option value="">Select city</option>
                    {(locationCatalog?.states.find((state) => state.name === sellerLocation.state)?.cities || []).map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </div>
              </label>
              <label>
                <span>Nearest campus</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <select value={sellerLocation.nearestCampus} onChange={(event) => updateSellerLocation("nearestCampus", event.target.value)} required>
                    <option value="">Select nearest campus</option>
                    {(locationCatalog?.campuses || []).map((campus) => <option key={campus} value={campus}>{campus}</option>)}
                  </select>
                </div>
              </label>
              <label>
                <span>Nearest marketplace</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <input list="signup-marketplaces" value={sellerLocation.nearestMarketplace} onChange={(event) => updateSellerLocation("nearestMarketplace", event.target.value)} placeholder="Example: Igbudu Market" required />
                  <datalist id="signup-marketplaces">
                    {(locationCatalog?.marketplaces || []).map((market) => <option key={market.id} value={market.name} />)}
                  </datalist>
                </div>
              </label>
              <label>
                <span>Street / shop address</span>
                <div className="auth-input-box">
                  <FiMapPin />
                  <input value={sellerLocation.street} onChange={(event) => updateSellerLocation("street", event.target.value)} placeholder="Enter the real street or shop address" required />
                </div>
              </label>
              <button className="auth-location-search-btn" type="button" disabled={isFindingLocation} onClick={() => void findSellerLocation()}>
                <FiMapPin /> {isFindingLocation ? "Finding address..." : "Find real map pin"}
              </button>
              {locationMatches.length > 0 && (
                <div className="auth-location-matches">
                  {locationMatches.map((result) => (
                    <button type="button" key={result.placeId} onClick={() => confirmSellerLocation(result)}>
                      <strong>{result.formattedAddress}</strong>
                      <small>{result.city || result.area}, {result.state}</small>
                    </button>
                  ))}
                </div>
              )}
              <p className={`auth-location-status ${sellerLocation.pickupPlaceId ? "confirmed" : ""}`}>
                {sellerLocation.pickupPlaceId ? "Mapped pickup address confirmed." : "A verified Nigerian map pin is required."}
              </p>
            </div>
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
        <Link className="auth-rider-link" to="/rider/login">
          Login/create rider account
        </Link>
      </div>
    </AuthLayout>
  );
}

export default Signup;
