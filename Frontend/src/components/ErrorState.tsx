import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";

type ErrorStateProps = {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  variant?: "page" | "card" | "inline";
};

function ErrorState({
  title = "Something went wrong",
  message = "We could not load this section. Please try again.",
  retryLabel = "Try again",
  onRetry,
  variant = "page",
}: ErrorStateProps) {
  return (
    <section className={`app-state app-error-state ${variant}`}>
      <div className="app-state-icon error">
        <FiAlertTriangle />
      </div>

      <span>Request failed</span>

      <h2>{title}</h2>

      <p>{message}</p>

      {onRetry && (
        <button onClick={onRetry}>
          <FiRefreshCw />
          {retryLabel}
        </button>
      )}
    </section>
  );
}

export default ErrorState;