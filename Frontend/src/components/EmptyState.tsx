import type { ReactNode } from "react";
import { FiInbox, FiPlus } from "react-icons/fi";

type EmptyStateProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "page" | "card" | "inline";
};

function EmptyState({
  icon,
  eyebrow = "Nothing here yet",
  title = "No content available",
  message = "When something is added, it will appear here.",
  actionLabel,
  onAction,
  variant = "page",
}: EmptyStateProps) {
  return (
    <section className={`app-state app-empty-state ${variant}`}>
      <div className="app-state-icon">{icon || <FiInbox />}</div>

      <span>{eyebrow}</span>

      <h2>{title}</h2>

      <p>{message}</p>

      {actionLabel && (
        <button onClick={onAction}>
          <FiPlus />
          {actionLabel}
        </button>
      )}
    </section>
  );
}

export default EmptyState;