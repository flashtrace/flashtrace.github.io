// localStorage-backed stores (ft-tutorial-*) and the server-embedded chapter
// data. Every store degrades to "empty" on unparseable or foreign-versioned
// data so a bad entry never crashes the page.
import { PROGRESS_KEY, BUFFERS_KEY, STEPS_KEY } from './tutorial-dom.mjs';

export function loadStore(key) {
  // unparseable or foreign-versioned data degrades to "empty" without crashing
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed && parsed.v === 1 && parsed.chapters && typeof parsed.chapters === 'object') {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return { v: 1, chapters: {} };
}

export function saveStore(key, store) {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* private mode etc. - persistence is best-effort */
  }
}

export function removeStores() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(BUFFERS_KEY);
    localStorage.removeItem(STEPS_KEY);
  } catch {
    /* ignore */
  }
}

export function progressEntry(id) {
  return loadStore(PROGRESS_KEY).chapters[id];
}

// normalize a STEPS_KEY entry to { done, assisted }; legacy entries stored a
// bare solved-step count, which maps onto an all-self (no-assist) chapter
export function loadStepEntry(store, id) {
  const raw = store.chapters[id];
  if (typeof raw === 'number') return { done: Math.max(0, Math.trunc(raw) || 0), assisted: [] };
  if (raw && typeof raw === 'object') {
    const done = Math.max(0, Math.trunc(Number(raw.done)) || 0);
    const assisted = Array.isArray(raw.assisted)
      ? [...new Set(raw.assisted.map((n) => Math.trunc(Number(n))).filter((n) => Number.isFinite(n) && n >= 0))]
      : [];
    return { done, assisted };
  }
  return { done: 0, assisted: [] };
}

export function loadChapterData() {
  try {
    const el = document.getElementById('tutorial-data');
    const data = JSON.parse(el.textContent);
    if (data.v !== 1 || !Array.isArray(data.chapters) || data.chapters.length === 0) return null;
    // checks/done/solve ship as source text of pure, closure-free arrows
    const compile = (src) => new Function('return (' + src + ')')();
    for (const chapter of data.chapters) {
      chapter.done = compile(chapter.done);
      for (const step of chapter.steps) {
        step.check = compile(step.check);
        if (step.solve) step.solve = compile(step.solve);
      }
      chapter.variants = { [data.lang]: chapter.variant }; // applyStep's shape
    }
    return data;
  } catch (err) {
    console.warn('tutorial: chapter data unavailable, running as a plain editor -', err);
    return null;
  }
}

// The free editor: a chapter-shaped sandbox living outside data.chapters. It
// has no steps, goal or completion - just two empty files and the real CLI.
// Its buffers persist under the same store as any chapter, keyed 'editor'.
export const FREE_EDITOR = {
  id: 'editor',
  free: true,
  rev: 0,
  title: 'Free editor',
  intro:
    'A blank project, all yours: write any spec and code and trace them with the real flashtrace release. No goals, no checks - the chapters in the rail are there whenever you want guidance.',
  docs: [
    { label: 'Usage Guide', href: '/docs/usage/' },
    { label: 'Overview', href: '/docs/' },
  ],
  argv: [],
  spec: { file: 'spec.md', body: '' },
  variant: { file: 'script.js', body: '' },
  steps: [],
  done: () => false,
};
