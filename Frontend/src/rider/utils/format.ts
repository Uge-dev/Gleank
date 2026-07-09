export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatShortTime(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
