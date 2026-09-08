/**
 * Every timestamp on the Overview is formatted on the server and handed to the
 * client as a string, so server and client renders cannot disagree. Formatting
 * is pinned to UTC and en-GB for the same reason.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "4 Sept 2026" */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** "4 Sept 2026, 09:16" */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 hours ago". Falls back to an absolute date beyond a month. */
export function formatRelative(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return formatDate(iso);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return countAgo(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return countAgo(Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 30 * DAY) return countAgo(Math.floor(elapsed / DAY), 'day');
  return `on ${formatDate(iso)}`;
}

function countAgo(count: number, unit: string): string {
  return `${count} ${count === 1 ? unit : `${unit}s`} ago`;
}

/** True when both instants land on the same UTC calendar day. */
export function sameDay(left: string, right: string): boolean {
  return formatDate(left) === formatDate(right);
}

/**
 * Drawer footer. Captures are described relative to generation rather than
 * repeated as a second timestamp.
 */
export function captureRelationSentence(generatedAt: string, capturedAt: string | null): string {
  const generated = `Report generated ${formatDate(generatedAt)}`;
  if (!capturedAt) return generated;
  if (sameDay(generatedAt, capturedAt)) {
    return `${generated} · sources captured the same ${dayPart(capturedAt)}`;
  }
  return `${generated} · sources captured ${formatDate(capturedAt)}`;
}

function dayPart(iso: string): string {
  const hour = new Date(iso).getUTCHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
