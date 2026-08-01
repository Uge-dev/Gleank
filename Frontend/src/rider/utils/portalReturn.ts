type StoredPortalUser = {
  role?: string;
};

function readStoredPortalUser(): StoredPortalUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("gleank_user");
    return raw ? (JSON.parse(raw) as StoredPortalUser) : null;
  } catch {
    return null;
  }
}

export function getMainPortalReturn() {
  const role = readStoredPortalUser()?.role || "buyer";
  const isSeller = role === "seller" || role === "admin";

  return {
    path: isSeller ? "/dashboard" : "/",
    label: isSeller ? "Back to seller dashboard" : "Back to buyer page",
  };
}

export function returnToMainPortal() {
  if (typeof window === "undefined") return;

  const destination = getMainPortalReturn();
  window.sessionStorage.setItem("gleenc-current-portal", "user");
  window.localStorage.setItem("gleenc-last-portal", "user");
  window.location.assign(destination.path);
}
