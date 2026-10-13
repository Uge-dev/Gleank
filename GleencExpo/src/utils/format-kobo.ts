export function formatKobo(amountKobo: number): string {
  if (!Number.isFinite(amountKobo)) {
    return '₦0.00';
  }

  const amountNaira = amountKobo / 100;

  return `₦${amountNaira.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}