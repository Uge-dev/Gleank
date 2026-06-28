import { FiLoader } from "react-icons/fi";

type LoadingStateProps = {
  title?: string;
  message?: string;
  variant?: "page" | "card" | "inline";
};

function LoadingState({
  title = "Loading content",
  message = "Please wait while Gleank prepares this section for you.",
  variant = "page",
}: LoadingStateProps) {
  return (
    <section className={`app-state app-loading-state ${variant}`}>
      <div className="app-state-orb">
        <FiLoader />
      </div>

      <h2>{title}</h2>

      <p>{message}</p>

      <div className="state-skeleton-stack">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </section>
  );
}

export default LoadingState;