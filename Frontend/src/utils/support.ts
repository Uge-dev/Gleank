const fallbackSupportNumber = "2340000000000";

export function getSupportWhatsAppUrl(message = "Hello Gleenc Support") {
  const configuredNumber =
    import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER ||
    import.meta.env.VITE_SUPPORT_WHATSAPP ||
    fallbackSupportNumber;
  const cleanNumber = String(configuredNumber).replace(/[^\d]/g, "");

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
