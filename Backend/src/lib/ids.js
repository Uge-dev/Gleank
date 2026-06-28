import { nanoid } from "nanoid";

export function createId(prefix) {
  return `${prefix}_${nanoid(18)}`;
}

export function slugify(value) {
  const slug = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || nanoid(8).toLowerCase();
}
