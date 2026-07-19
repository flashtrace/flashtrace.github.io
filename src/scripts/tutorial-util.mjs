// Pure helpers shared across the /learn/ modules: no DOM, no shared state.

export function relativeTime(iso) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'earlier';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 2) return 'moments ago';
  if (minutes < 90) return minutes + ' minutes ago';
  const hours = Math.round(minutes / 60);
  if (hours < 36) return hours + ' hours ago';
  return Math.round(hours / 24) + ' days ago';
}

export function safeCheck(fn, r) {
  try {
    return fn(r) === true;
  } catch {
    return false;
  }
}

// shortest edit between the buffer and the patched buffer - typed as one span
export function diffRange(oldText, newText) {
  let prefix = 0;
  while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix++;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > prefix && newEnd > prefix && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start: prefix, oldEnd, insert: newText.slice(prefix, newEnd) };
}

// --- rail progress rings -----------------------------------------------------

function ringPoint(radius, deg) {
  const rad = (deg * Math.PI) / 180;
  return (8 + radius * Math.sin(rad)).toFixed(2) + ' ' + (8 - radius * Math.cos(rad)).toFixed(2);
}

export function ringSvg(total, done, assisted) {
  const radius = 6.25;
  const cls = (i) =>
    'seg' + (i < done ? (assisted && assisted.has(i) ? ' is-done is-assisted' : ' is-done') : '');
  let body;
  if (total === 1) {
    body = '<circle class="' + cls(0) + '" cx="8" cy="8" r="' + radius + '"/>';
  } else {
    const span = 360 / total;
    const gap = Math.min(18, span / 4);
    body = Array.from({ length: total }, (_, i) => {
      const from = i * span + gap / 2;
      const to = (i + 1) * span - gap / 2;
      const arc = 'A' + radius + ' ' + radius + ' 0 ' + (to - from > 180 ? 1 : 0) + ' 1 ';
      return '<path class="' + cls(i) + '" d="M' + ringPoint(radius, from) + ' ' + arc + ringPoint(radius, to) + '"/>';
    }).join('');
  }
  return '<svg viewBox="0 0 16 16">' + body + '</svg>';
}

export function completionStatement(entry) {
  const help = entry.assists ? entry.assists.help : 0;
  const auto = entry.assists ? entry.assists.auto : 0;
  const how = [];
  if (help) how.push(help + (help === 1 ? ' hint' : ' hints'));
  if (auto) how.push(auto + (auto === 1 ? ' auto-solved step' : ' auto-solved steps'));
  return (
    'Completed ' + relativeTime(entry.completedAt) + (how.length ? ' with ' + how.join(' and ') : ' without assists') + '.'
  );
}
