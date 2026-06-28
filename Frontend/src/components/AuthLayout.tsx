import { Link } from "react-router-dom";
import {
  FiCheckCircle,
  FiShoppingBag,
  FiShield,
  FiZap,
} from "react-icons/fi";

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

function AuthLayout({
  eyebrow,
  title,
  description,
  children,
}: AuthLayoutProps) {
  return (
    <section className="auth-page">
      <div className="auth-brand-panel">
        <Link to="/" className="auth-logo">
          <span>G</span>
          Gleank
        </Link>

        <div className="auth-brand-content">
          <span>{eyebrow}</span>

          <h1>{title}</h1>

          <p>{description}</p>

          <div className="auth-benefits">
            <div>
              <FiShoppingBag />
              <span>Buy and sell around campus</span>
            </div>

            <div>
              <FiShield />
              <span>Safer student marketplace</span>
            </div>

            <div>
              <FiZap />
              <span>Fast product discovery</span>
            </div>
          </div>
        </div>

        <div className="auth-floating-card">
          <div>
            <FiCheckCircle />
          </div>

          <section>
            <strong>Campus commerce made social</strong>
            <p>Products, sellers, reels, services, and used items in one app.</p>
          </section>
        </div>
      </div>

      <div className="auth-form-panel">
        {children}
      </div>
    </section>
  );
}

export default AuthLayout;