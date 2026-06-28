import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
  const roleAllowed = !roles?.length || Boolean(user && roles.includes(user.role));

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
          message="Gleank is securely loading your account."
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
          <span>Seller access</span>
          <h1>This workspace requires a seller account</h1>
          <p>
            Your buyer account is active, but product, service, store, and
            inventory tools are available only to registered Gleank sellers.
          </p>
          <a href="/profile">Return to your profile</a>
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
              seller tools are protected by your Gleank account.
            </p>
            <button type="button" onClick={() => setAuthModalOpen(true)}>
              Open secure login
            </button>
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
