import { useEffect, useState } from "react";
import { FiMapPin, FiX } from "react-icons/fi";

type LocationNotice = {
  status: "prompt" | "granted" | "denied" | "unavailable";
  message: string;
};

export default function LocationPermissionNotice() {
  const [notice, setNotice] = useState<LocationNotice | null>(null);

  useEffect(() => {
    let timeoutId = 0;

    function handleLocationStatus(event: Event) {
      const detail = (event as CustomEvent<LocationNotice>).detail;
      if (!detail?.status || !detail.message) return;

      window.clearTimeout(timeoutId);
      setNotice(detail);
      timeoutId = window.setTimeout(
        () => setNotice(null),
        detail.status === "granted" ? 6_000 : 14_000,
      );
    }

    window.addEventListener("gleenc-location-status", handleLocationStatus);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("gleenc-location-status", handleLocationStatus);
    };
  }, []);

  if (!notice) return null;

  return (
    <div
      className={`location-permission-notice ${notice.status}`}
      role={notice.status === "granted" ? "status" : "alert"}
    >
      <FiMapPin aria-hidden="true" />
      <p>{notice.message}</p>
      <button
        type="button"
        aria-label="Dismiss location notice"
        onClick={() => setNotice(null)}
      >
        <FiX />
      </button>
    </div>
  );
}
