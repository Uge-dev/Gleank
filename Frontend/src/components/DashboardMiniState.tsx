import type { ReactNode } from "react";
import { FiAlertTriangle, FiInbox, FiLoader } from "react-icons/fi";

type DashboardMiniStateProps = {
  type?: "empty" | "loading" | "error";
  icon?: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function DashboardMiniState({
  type = "empty",
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: DashboardMiniStateProps) {
  const defaultIcon =
    type === "loading" ? (
      <FiLoader />
    ) : type === "error" ? (
      <FiAlertTriangle />
    ) : (
      <FiInbox />
    );

  return (
    <div className={`dashboard-mini-state ${type}`}>
      <div className="dashboard-mini-state-icon">{icon || defaultIcon}</div>

      <h3>{title}</h3>

      <p>{message}</p>

      {actionLabel && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default DashboardMiniState;