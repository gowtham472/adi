const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const ABSOLUTE = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) {
    return RELATIVE.format(seconds, 'second');
  }
  if (abs < 3600) {
    return RELATIVE.format(Math.round(seconds / 60), 'minute');
  }
  if (abs < 86400) {
    return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  }
  return ABSOLUTE.format(new Date(iso));
}

export function absoluteTime(iso: string): string {
  return ABSOLUTE.format(new Date(iso));
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return 'no data';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
