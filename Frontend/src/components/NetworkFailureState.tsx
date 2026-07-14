import { FiRefreshCw, FiWifiOff } from "react-icons/fi";

type NetworkFailureStateProps = {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  variant?: "page" | "card" | "inline";
};

function NetworkFailureState({
  title = "Connection interrupted",
  message = "We could not load this section right now. Please check your connection and try again.",
  retryLabel = "Try again",
  onRetry,
  variant = "page",
}: NetworkFailureStateProps) {
  return (
    <section className={`app-state app-network-state ${variant}`} role="status">
      <div className="app-state-icon network">
        <FiWifiOff />
      </div>

      <span>Network connection</span>
      <h2>{title}</h2>
      <p>{message}</p>

      {onRetry ? (
        <button type="button" onClick={onRetry}>
          <FiRefreshCw />
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}

export default NetworkFailureState;
