export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .catch((error) => {
        console.warn("Gleenc service worker registration failed:", error);
      });
  });
}
