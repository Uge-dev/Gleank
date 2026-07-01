import { FiAlertCircle, FiLogOut, FiX } from "react-icons/fi";
import "./LogoutConfirmModal.css";

type LogoutConfirmModalProps = {
  isOpen: boolean;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

function LogoutConfirmModal({
  isOpen,
  isLoading = false,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-backdrop" role="presentation">
      <section
        className="logout-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <button
          type="button"
          className="logout-modal-close"
          onClick={onCancel}
          aria-label="Cancel logout"
          disabled={isLoading}
        >
          <FiX />
        </button>

        <div className="logout-modal-icon">
          <FiAlertCircle />
        </div>

        <span className="logout-modal-eyebrow">Confirm logout</span>

        <h2 id="logout-modal-title">Are you sure you want to log out?</h2>

        <p>
          You will need to log in again before viewing your cart, orders,
          messages, saved items, and account settings.
        </p>

        <div className="logout-modal-actions">
          <button
            type="button"
            className="logout-modal-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Stay logged in
          </button>

          <button
            type="button"
            className="logout-modal-primary"
            onClick={onConfirm}
            disabled={isLoading}
          >
            <FiLogOut />
            {isLoading ? "Logging out..." : "Yes, log out"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default LogoutConfirmModal;