/**
 * Shared date/time display formatter.
 *
 * Converts ISO timestamps to user's local date + time:
 *   9/15/2026, 5:42 PM
 *
 * Does NOT mutate stored values. Pure display formatting.
 */

/**
 * Format an ISO timestamp to local date + time.
 * @param {string|null|undefined} isoString - ISO 8601 timestamp
 * @returns {string} formatted "M/D/YYYY, H:MM AM/PM" or fallback
 */
export function formatDateTime(isoString) {
  if (!isoString || typeof isoString !== 'string') return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '-';
  }
}
