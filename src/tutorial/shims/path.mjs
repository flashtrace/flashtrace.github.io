// Minimal posix-only node:path replacement - exactly the functions the
// flashtrace bundle calls (join, resolve, extname, relative) plus dirname and
// sep for safety. Relative inputs resolve against the vfs project root.
export const sep = '/';

const PROJECT_ROOT = '/project';

function normalizeSegments(parts) {
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else {
      out.push(part);
    }
  }
  return out;
}

export function join(...parts) {
  const joined = parts.filter(Boolean).join('/');
  const abs = joined.startsWith('/');
  const segs = normalizeSegments(joined.split('/')).join('/');
  if (abs) return '/' + segs;
  return segs === '' ? '.' : segs;
}

export function resolve(...parts) {
  let joined = '';
  for (const part of parts) {
    joined = String(part).startsWith('/') ? String(part) : joined + '/' + String(part);
  }
  if (!joined.startsWith('/')) joined = PROJECT_ROOT + '/' + joined;
  return '/' + normalizeSegments(joined.split('/')).join('/');
}

export function extname(p) {
  const base = String(p).slice(String(p).lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

export function relative(from, to) {
  const f = normalizeSegments(resolve(from).split('/'));
  const t = normalizeSegments(resolve(to).split('/'));
  let common = 0;
  while (common < f.length && common < t.length && f[common] === t[common]) common++;
  return [...Array(f.length - common).fill('..'), ...t.slice(common)].join('/');
}

export function dirname(p) {
  const s = String(p).replace(/\/+$/, '');
  const idx = s.lastIndexOf('/');
  if (idx < 0) return '.';
  if (idx === 0) return '/';
  return s.slice(0, idx);
}

export default { sep, join, resolve, extname, relative, dirname };
