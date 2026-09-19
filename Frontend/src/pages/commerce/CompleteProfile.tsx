import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { commerce } from "../../services/commerce.service";
import "./Commerce.css";
const paths = [
  {
    key: "selling",
    title: "Sell your products",
    text: "List products you own, manage stock, and arrange delivery.",
  },
  {
    key: "dropshipping",
    title: "Start dropshipping",
    text: "Sell eligible supplier products without holding inventory.",
  },
  {
    key: "marketing",
    title: "Promote and earn",
    text: "Recommend products through content and collections.",
  },
];
export default function CompleteProfile() {
  const { user, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: user?.name || "",
    username: user?.profile?.username || "",
    displayName: user?.profile?.displayName || "",
    country: user?.country || "Nigeria",
    state: user?.state || "",
    city: user?.city || "",
    bio: user?.profile?.bio || "",
  });
  const [activities, setActivities] = useState<string[]>(
    user?.profile?.activities || [],
  );
  const [interests, setInterests] = useState<string[]>(
    user?.profile?.interests || [],
  );
  const toggle = (value: string, items: string[], set: (v: string[]) => void) =>
    set(
      items.includes(value)
        ? items.filter((x) => x !== value)
        : [...items, value],
    );
  async function save() {
    setBusy(true);
    setError("");
    try {
      await commerce.saveProfile({ ...form, activities, interests });
      await refreshSession();
      const next = params.get("next");
      navigate(next?.startsWith("/") && !next.startsWith("//") ? next : "/", {
        replace: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="commerce-page">
      <span className="commerce-eyebrow">Your Gleenc · Step {step} of 3</span>
      <h1>Complete your profile</h1>
      <p>One profile for shopping, selling, and sharing what you love.</p>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
          className="commerce-card"
        >
          <div className="commerce-grid">
            {(
              [
                "name",
                "username",
                "displayName",
                "country",
                "state",
                "city",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    name: "Full name",
                    username: "Username",
                    displayName: "Display name (optional)",
                    country: "Country",
                    state: "State / region",
                    city: "City / area",
                  }[key]
                }
                <input
                  required={key !== "displayName"}
                  minLength={key === "username" ? 3 : 2}
                  maxLength={key === "username" ? 30 : 80}
                  pattern={
                    key === "username" ? "[a-zA-Z0-9_]{3,30}" : undefined
                  }
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label>
            Bio (optional)
            <textarea
              maxLength={240}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>
          <button className="primary">Continue</button>
        </form>
      )}
      {step === 2 && (
        <>
          <h2>Three ways to grow on Gleenc</h2>
          <p>
            Select anything you want to explore. You can use all three with this
            account, and change your interests later.
          </p>
          <div className="commerce-grid">
            {paths.map((path) => (
              <button
                type="button"
                aria-pressed={activities.includes(path.key)}
                key={path.key}
                className={
                  "commerce-card choice-card " +
                  (activities.includes(path.key) ? "selected" : "")
                }
                onClick={() => toggle(path.key, activities, setActivities)}
              >
                <strong>{path.title}</strong>
                <span>{path.text}</span>
              </button>
            ))}
          </div>
          <div className="commerce-actions">
            <button onClick={() => setStep(1)}>Back</button>
            <button className="primary" onClick={() => setStep(3)}>
              {activities.length ? "Continue" : "Just exploring"}
            </button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <h2>What catches your eye?</h2>
          <p>Choose a few interests, or skip and explore.</p>
          <div className="commerce-actions">
            {[
              "Fashion",
              "Electronics",
              "Beauty",
              "Food",
              "Home",
              "Books",
              "Art",
              "Sports",
            ].map((value) => (
              <button
                key={value}
                aria-pressed={interests.includes(value)}
                className={interests.includes(value) ? "primary" : ""}
                onClick={() => toggle(value, interests, setInterests)}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="commerce-note">
            Your location helps with discovery. Exact delivery addresses and
            payout details are collected only when needed.
          </p>
          <div className="commerce-actions">
            <button onClick={() => setStep(2)}>Back</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Enter Gleenc"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
