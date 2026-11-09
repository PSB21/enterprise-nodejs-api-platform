const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

export function formatDateTime(value: string | null | undefined) {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function formatDate(value: string | null | undefined) {
  return value ? dateOnly.format(new Date(value)) : '—';
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}
