/**
 * Per browser display preferences. Storage can be unavailable (private windows, blocked
 * site data), so every access is guarded and the dashboard works the same without it.
 */
const PREFIX = 'adi.';

export function readPreference(key: string): string | undefined {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // A preference that cannot be stored simply does not persist.
  }
}
