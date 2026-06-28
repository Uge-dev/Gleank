export function parseNairaPrice(price: string) {
  const cleanedPrice = price.replace(/[^\d]/g, "");
  const numericPrice = Number(cleanedPrice);

  if (Number.isNaN(numericPrice)) return 0;

  return numericPrice;
}

export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}