export function getStorePath(usernameOrId: string) {
  return `/stores/${usernameOrId
    .toLowerCase()
    .trim()
    .replaceAll("@", "")
    .replaceAll(" ", "-")}`;
}