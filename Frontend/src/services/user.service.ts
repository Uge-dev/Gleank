import { apiRequest } from "../lib/api";
import type { AuthUser } from "../types/domain";

export function uploadProfileAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  return apiRequest<{ user: AuthUser }>("/users/me/avatar", {
    method: "POST",
    body: formData,
  });
}
