import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiLock,
  FiShield,
  FiZap,
} from "react-icons/fi";

import AuthModal from "./AuthModal";

type LockedFeature = {
  title: string;
  description: string;
  icon: ReactNode;
};

type LockedPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: string;
  previewTitle: string;
  previewDescription: string;
  features: LockedFeature[];
};

function LockedPage({
  eyebrow,
  title,
  description,
  primaryAction,
  previewTitle,
  previewDescription,
  features,
}: LockedPageProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  function openAuthModal() {
    setAuthModalOpen(true);
  }

  return (
    <>
      <section className="locked-page">
        <div className="locked-hero">
          <div className="locked-copy">
            <span>{eyebrow}</span>

            <h1>{title}</h1>

            <p>{description}</p>

            <div className="locked-actions">
              <button onClick={openAuthModal}>
                {primaryAction}
                <FiArrowRight />
              </button>

              <Link to="/search">Explore Gleank</Link>
            </div>
          </div>

          <div className="locked-preview-card">
            <div className="locked-preview-top">
              <div className="locked-preview-icon">
                <FiLock />
              </div>

              <div>
                <h2>{previewTitle}</h2>
                <p>{previewDescription}</p>
              </div>
            </div>

            <div className="locked-preview-glass">
              <div className="locked-preview-line big"></div>
              <div className="locked-preview-line medium"></div>
              <div className="locked-preview-line small"></div>

              <div className="locked-mini-grid">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>

            <div className="locked-security-row">
              <span>
                <FiShield />
                Protected access
              </span>

              <span>
                <FiZap />
                Fast setup
              </span>
            </div>
          </div>
        </div>

        <div className="locked-feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <div>{feature.icon}</div>

              <h3>{feature.title}</h3>

              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default LockedPage;