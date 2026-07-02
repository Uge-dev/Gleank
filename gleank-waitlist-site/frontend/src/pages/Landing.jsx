import React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { joinWaitlist } from "../services/api.js";

const initialForm = {
  name: "",
  email: "",
  whatsapp: "",
  campus: "",
  userType: "buyer",
};

function Landing() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const result = await joinWaitlist({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: form.whatsapp.trim(),
        campus: form.campus.trim(),
        userType: form.userType,
      });

      setMessage(result.message || "You have joined the Gleank waitlist.");
      setForm(initialForm);
    } catch (err) {
      setError(err.message || "Unable to join waitlist. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-page">
      <section className="hero-shell">
        <nav className="nav-bar">
          <a className="brand" href="/">
            <span>G</span>
            <strong>Gleank</strong>
          </a>

          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#waitlist">Waitlist</a>
            <Link to="/admin-login">Admin</Link>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Campus commerce is coming differently</p>
            <h1>Buy, sell, discover, and connect inside your campus.</h1>
            <p className="hero-text">
              Gleank is a campus-only social marketplace for student buyers,
              sellers, service providers, used-item vendors, and dispatch riders.
              Join the waitlist to get launch access first.
            </p>

            <div className="hero-actions">
              <a href="#waitlist" className="btn primary">Join waitlist</a>
              <a href="#features" className="btn ghost">See features</a>
            </div>

            <div className="trust-row">
              <span>Student sellers</span>
              <span>Used market</span>
              <span>Campus riders</span>
            </div>
          </div>

          <div className="phone-wrap" aria-hidden="true">
            <div className="phone-card">
              <div className="phone-top">
                <span></span>
                <small>Gleank</small>
                <span></span>
              </div>
              <div className="search-pill">Search food, fashion, gadgets...</div>
              <div className="product-card large">
                <span>Trending nearby</span>
                <h3>Campus Jollof Bowl</h3>
                <p>Trusted seller • 4 mins away</p>
                <strong>₦2,500</strong>
              </div>
              <div className="mini-grid">
                <div>
                  <span>Used market</span>
                  <strong>iPhone deals</strong>
                </div>
                <div>
                  <span>Services</span>
                  <strong>Design & repair</strong>
                </div>
              </div>
              <div className="store-row">
                <b>S</b>
                <div>
                  <strong>Campus Store</strong>
                  <small>Verified seller • Fast response</small>
                </div>
              </div>
            </div>
            <div className="float-card one">New seller joined</div>
            <div className="float-card two">Rider assigned</div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="section-heading">
          <p>Why Gleank?</p>
          <h2>Made for the way students really buy and sell.</h2>
        </div>

        <div className="feature-grid">
          <article>
            <span>01</span>
            <h3>Social shopping</h3>
            <p>Follow stores, like products, discover trending items, and shop through a familiar social experience.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Campus sellers</h3>
            <p>Student entrepreneurs can list products, build store profiles, and grow trust inside their campus.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Used-item market</h3>
            <p>Students can buy and sell used phones, laptops, books, fashion items, appliances, and more.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Services & riders</h3>
            <p>Service providers and campus riders can become discoverable and support a smoother order flow.</p>
          </article>
        </div>
      </section>

      <section className="waitlist-section" id="waitlist">
        <div className="waitlist-copy">
          <p>Early access</p>
          <h2>Join the Gleank waitlist before launch.</h2>
          <p>
            Submit your details and we will contact you by email or WhatsApp when Gleank is ready for your campus.
          </p>
          <div className="points">
            <span>✓ Early launch updates</span>
            <span>✓ Buyers, sellers, service providers, and riders</span>
            <span>✓ Stored securely in MongoDB</span>
          </div>
        </div>

        <form className="waitlist-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Enter your full name" required />
          </label>
          <label>
            Email address
            <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="Enter your email" required />
          </label>
          <label>
            WhatsApp phone number
            <input type="tel" value={form.whatsapp} onChange={(e) => updateField("whatsapp", e.target.value)} placeholder="Example: 08012345678" required />
          </label>
          <label>
            Campus / school name
            <input value={form.campus} onChange={(e) => updateField("campus", e.target.value)} placeholder="Example: FUPRE, UNIBEN, DELSU" />
          </label>
          <label>
            I want to join as
            <select value={form.userType} onChange={(e) => updateField("userType", e.target.value)}>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="service_provider">Service provider</option>
              <option value="rider">Dispatch rider</option>
            </select>
          </label>

          <button disabled={loading}>{loading ? "Joining..." : "Join waitlist"}</button>
          {message && <p className="form-message success">{message}</p>}
          {error && <p className="form-message error">{error}</p>}
          <small>By joining, you agree that Gleank may contact you about launch updates.</small>
        </form>
      </section>
    </main>
  );
}

export default Landing;
