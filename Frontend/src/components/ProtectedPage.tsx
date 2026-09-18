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
    return (
      <section className="protected-popup-page">
        <div className="protected-popup-card role-blocked-card">
          <FiShield />
          <span>Account access</span>
          <h1>Complete your account setup</h1>
          <p>
            Use your shared profile to set up product and fulfillment details.
          </p>
          <Link to="/selling-settings">Selling settings</Link>
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
