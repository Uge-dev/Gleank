export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function cleanPhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function buildCsv(rows) {
  const headers = [
    "Name",
    "Email",
    "WhatsApp",
    "Campus",
    "User Type",
    "Status",
    "Source",
    "Created At",
  ];

  const escape = (value) => {
    const text = String(value ?? "");
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const body = rows.map((item) => [
    item.name,
    item.email,
    item.whatsapp,
    item.campus,
    item.userType,
    item.status,
    item.source,
    item.createdAt?.toISOString?.() || item.createdAt,
  ].map(escape).join(","));

  return [headers.map(escape).join(","), ...body].join("\n");
}
