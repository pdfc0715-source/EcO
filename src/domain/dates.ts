/**
 * Date and timezone utilities for EcO (Asia/Dhaka UTC+6)
 */

export function getTodayDateString(): string {
  // Asia/Dhaka is UTC+6
  const now = new Date();
  const dhakaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  const year = dhakaTime.getFullYear();
  const month = String(dhakaTime.getMonth() + 1).padStart(2, '0');
  const day = String(dhakaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (YYYY-MM-DD) into an exact readable date (e.g. "05 Nov 2026").
 * Never returns relative terms like "Today" or "Yesterday".
 */
export function formatExactDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const paddedDay = String(d).padStart(2, '0');
  return `${paddedDay} ${months[m - 1] || ''} ${y}`;
}

/**
 * Formats a date string and optional timestamp/time into an exact date and time
 * (e.g. "05 Nov 2026, 02:45 PM" or "05 Nov 2026 · 14:30").
 */
export function formatExactDateTime(dateStr: string, timeOrTimestamp?: string | number): string {
  const exactDate = formatExactDate(dateStr);
  if (!timeOrTimestamp) return exactDate;

  if (typeof timeOrTimestamp === 'number') {
    const d = new Date(timeOrTimestamp);
    if (!isNaN(d.getTime())) {
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${exactDate}, ${timeStr}`;
    }
  } else if (typeof timeOrTimestamp === 'string' && timeOrTimestamp.trim()) {
    return `${exactDate}, ${timeOrTimestamp.trim()}`;
  }

  return exactDate;
}

/**
 * Formats a date string for display.
 * Default behavior returns exact date (e.g. "05 Nov 2026") to avoid confusing
 * relative labels in vouchers and financial audits.
 */
export function formatDisplayDate(dateStr: string, allowRelative: boolean = false): string {
  if (!dateStr) return '';
  
  if (allowRelative) {
    const today = getTodayDateString();
    if (dateStr === today) {
      return 'Today';
    }

    // Check for yesterday
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const diffTime = todayDate.getTime() - targetDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays === 1) {
      return 'Yesterday';
    }
  }

  return formatExactDate(dateStr);
}

/**
 * Calculates end date for recurring expense: S + (D - 1) days inclusive
 */
export function calculateRecurringEndDate(startDateStr: string, durationDays: number): string {
  if (!startDateStr || durationDays <= 0) return startDateStr;
  const [y, m, d] = startDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + (durationDays - 1));
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Seven-day retention cutoff: 7 * 24 * 60 * 60 * 1000 ms
 */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isWithinSevenDays(timestamp: number): boolean {
  return Date.now() - timestamp <= SEVEN_DAYS_MS;
}
