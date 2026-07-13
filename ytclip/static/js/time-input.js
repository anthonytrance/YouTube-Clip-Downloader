/**
 * Smart time parser: converts typed strings to milliseconds.
 * Accepts: 83  83s  83ms  1:23  1:23.456  1:02:03.4
 * Also formats ms back to display strings.
 */
window.TimeInput = (() => {
  function parse(str) {
    if (str == null) return null;
    str = String(str).trim().toLowerCase();
    if (!str) return null;

    // Plain ms: "1234ms"
    if (/^\d+ms$/.test(str)) return parseInt(str, 10);

    // Plain seconds: "83" or "83s" or "83.5s"
    const secOnly = str.match(/^(\d+(?:\.\d+)?)s?$/);
    if (secOnly) return Math.round(parseFloat(secOnly[1]) * 1000);

    // MM:SS or MM:SS.mmm
    const mmss = str.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
    if (mmss) {
      const m = parseInt(mmss[1], 10);
      const s = parseInt(mmss[2], 10);
      const ms = mmss[3] ? parseMs(mmss[3]) : 0;
      return (m * 60 + s) * 1000 + ms;
    }

    // HH:MM:SS or HH:MM:SS.mmm
    const hhmmss = str.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
    if (hhmmss) {
      const h = parseInt(hhmmss[1], 10);
      const m = parseInt(hhmmss[2], 10);
      const s = parseInt(hhmmss[3], 10);
      const ms = hhmmss[4] ? parseMs(hhmmss[4]) : 0;
      return (h * 3600 + m * 60 + s) * 1000 + ms;
    }

    return null;
  }

  // Normalise fractional-second digits to ms (e.g. "4" → 400, "45" → 450, "456" → 456)
  function parseMs(str) {
    const padded = str.padEnd(3, '0').slice(0, 3);
    return parseInt(padded, 10);
  }

  function format(ms) {
    if (ms == null || isNaN(ms)) return '0:00.000';
    ms = Math.max(0, Math.round(ms));
    const totalSec = Math.floor(ms / 1000);
    const msRem = ms % 1000;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const msStr = String(msRem).padStart(3, '0');
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${msStr}`;
    return `${m}:${String(s).padStart(2,'0')}.${msStr}`;
  }

  function ariaLabel(ms) {
    if (ms == null) return 'unknown';
    ms = Math.max(0, Math.round(ms));
    const totalSec = Math.floor(ms / 1000);
    const msRem = ms % 1000;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts = [];
    if (h) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
    if (m) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
    if (s || (!h && !m)) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
    if (msRem) parts.push(`${msRem} milliseconds`);
    return parts.join(', ');
  }

  return { parse, format, ariaLabel };
})();
