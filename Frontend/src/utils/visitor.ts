const VIEWER_KEY = "gleank_anon_viewer_id";

export function getAnonViewerId() {
  let id = localStorage.getItem(VIEWER_KEY);

  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(VIEWER_KEY, id);
  }

  return id;
}