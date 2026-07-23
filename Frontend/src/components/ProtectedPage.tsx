import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FiLock, FiShield } from "react-icons/fi";
import AuthModal from "./AuthModal";
import LoadingState from "./LoadingState";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types/domain";

type ProtectedPageProps = {
  children: ReactNode;
  roles?: UserRole[];
};

function ProtectedPage({ children, roles }: ProtectedPageProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const effectiveRoles = roles?.length ? roles : (["buyer", "seller", "admin"] as UserRole[]);
  const roleAllowed = Boolean(user && effectiveRoles.includes(user.role));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setAuthModalOpen(true);
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <section className="protected-popup-page">
        <LoadingState
          title="Checking your session"
          message="Gleenc is securely loading your account."
        />
      </section>
    );
  }

  if (isAuthenticated && roleAllowed) {
    return <>{children}</>;
  }

  if (isAuthenticated && !roleAllowed) {
    if (user?.role === "rider") {
      return (
        <section className="protected-popup-page">
          <div className="protected-popup-card role-blocked-card">
            <FiShield />
            <span>Rider account</span>
            <h1>Open your rider dashboard</h1>
            <p>
              This account is registered for deliveries, so rider tools stay
              separate from buyer and seller pages.
            </p>
            <Link to="/rider">Go to rider dashboard</Link>
          </div>
        </section>
      );
    }

    return (
      <section className="protected-popup-page">
        <div className="protected-popup-card role-blocked-card">
          <FiShield />
          <span>Seller access</span>
          <h1>This workspace requires a seller account</h1>
          <p>
            Your buyer account is active, but product, service, store, and
            inventory tools need a completed seller profile first.
          </p>
          <Link to="/seller/onboarding">Set up seller profile</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="protected-popup-page">
        <div className="protected-popup-blur">
          <div className="protected-popup-card">
            <FiLock />
            <span>Login required</span>
            <h1>Login to continue</h1>
            <p>
              Your cart, checkout, messages, orders, saved items, profile, and
              seller tools are protected by your Gleenc account.
            </p>
            <button type="button" onClick={() => setAuthModalOpen(true)}>
              Open secure login
            </button>
            <Link className="protected-forgot-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default ProtectedPage;
