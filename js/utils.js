/* ── Date & formatting utilities ──────────────────────── */

const Utils = (() => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Parse ISO string and return a Date in local (Europe/London) context */
  function parseDate(iso) {
    return new Date(iso);
  }

  /** Format time as HH:MM */
  function formatTime(date) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    });
  }

  /** Format date as "Mon 31 Mar" */
  function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/London',
    });
  }

  /** Get day name, date number, and month for a date string (YYYY-MM-DD) */
  function dateParts(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return {
      day: DAYS[d.getDay()],
      dateNum: d.getDate(),
      month: MONTHS[d.getMonth()],
    };
  }

  /** Check if a YYYY-MM-DD string is today */
  function isToday(dateStr) {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    return dateStr === today;
  }

  /**
   * Convert Admiralty GMT datetime to Europe/London local time.
   * Admiralty returns times in GMT — we need BST conversion when applicable.
   */
  function admiraltyToLocal(dateTimeStr) {
    // Admiralty returns "2026-03-30T03:15:00" in GMT.
    // Append Z to force UTC parsing, then format in Europe/London.
    const utcDate = new Date(dateTimeStr + 'Z');
    return utcDate;
  }

  /** Get YYYY-MM-DD in Europe/London timezone from a Date */
  function toDateKey(date) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  }

  /** Wind direction degrees to compass label */
  function windCompass(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  /** Round to 1 decimal place */
  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  return { parseDate, formatTime, formatDate, dateParts, isToday, admiraltyToLocal, toDateKey, windCompass, r1 };
})();
