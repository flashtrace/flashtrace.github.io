// Persistence for the /learn/ engine: in-flight buffers (BUFFERS_KEY),
// completions (PROGRESS_KEY) and per-step ring progress (STEPS_KEY), plus the
// rail marks and the completed-chapter overlay those feed. All three stores
// are keyed by stable chapter id, never by index.
import { ide, setText, BUFFERS_KEY, PROGRESS_KEY, STEPS_KEY } from './tutorial-dom.mjs';
import { loadStore, saveStore, loadStepEntry, progressEntry } from './tutorial-store.mjs';
import { ringSvg, completionStatement } from './tutorial-util.mjs';
import {
  current,
  currentIndex,
  data,
  panes,
  assists,
  assistedSteps,
  checkTimer,
} from './tutorial-state.mjs';

// Pristine entries are deleted on save, so under the multi-file shape a
// stored entry always means real work; only legacy string entries can still
// equal the seeds.
export function storedPristine(chapter, stored) {
  if (stored.panes) return false;
  return stored.spec === chapter.spec.body && stored.code === chapter.variant.body;
}

export function saveBuffers() {
  if (!current || !panes) return;
  const store = loadStore(BUFFERS_KEY);
  const only = (pane) => (panes[pane].files.length === 1 ? panes[pane].files[0] : null);
  const spec = only('spec');
  const code = only('code');
  const pristine =
    spec && code &&
    spec.name === current.spec.file && spec.body === current.spec.body &&
    code.name === current.variant.file && code.body === current.variant.body;
  if (pristine) {
    delete store.chapters[current.id];
  } else {
    const snapshot = (pane) => ({
      files: panes[pane].files.map((f) => ({ name: f.name, body: f.body })),
      active: panes[pane].active,
    });
    store.chapters[current.id] = {
      rev: current.rev,
      lang: data.lang,
      savedAt: new Date().toISOString(),
      panes: { spec: snapshot('spec'), code: snapshot('code') },
    };
  }
  saveStore(BUFFERS_KEY, store);
}

export function deleteBufferEntry(id) {
  const store = loadStore(BUFFERS_KEY);
  delete store.chapters[id];
  saveStore(BUFFERS_KEY, store);
}

// Written exactly once per chapter: when its done-condition first passes
// after a real (non-silent) Run in this browser.
export function completeChapter(chapter) {
  const store = loadStore(PROGRESS_KEY);
  if (store.chapters[chapter.id]) return;
  const entry = {
    title: chapter.title,
    rev: chapter.rev,
    lang: data.lang,
    completedAt: new Date().toISOString(),
    assists: { help: assists.help, auto: assists.auto },
  };
  store.chapters[chapter.id] = entry;
  saveStore(PROGRESS_KEY, store);
  saveBuffers(); // keep the solved files - revisits restore them under the overlay
  clearTimeout(checkTimer);
  renderRailMarks();
  setCompletedOverlay(entry);
}

export function deleteProgressEntry(id) {
  const store = loadStore(PROGRESS_KEY);
  delete store.chapters[id];
  saveStore(PROGRESS_KEY, store);
}

export function saveStepProgress(id, done) {
  const store = loadStore(STEPS_KEY);
  const prev = loadStepEntry(store, id);
  // only leading solved steps keep an assist mark; a regressed step starts over
  const assisted = [...assistedSteps].filter((n) => n < done).sort((a, b) => a - b);
  const unchanged =
    prev.done === done &&
    prev.assisted.length === assisted.length &&
    prev.assisted.every((n, i) => n === assisted[i]);
  if (unchanged) return;
  if (done === 0) delete store.chapters[id];
  else store.chapters[id] = { done, assisted };
  saveStore(STEPS_KEY, store);
  renderRailMarks();
}

export function deleteStepsEntry(id) {
  const store = loadStore(STEPS_KEY);
  delete store.chapters[id];
  saveStore(STEPS_KEY, store);
}

// Each chapter link carries a small SVG donut split into one arc per step,
// running clockwise from 12 o'clock: steps solved so far draw bold, the rest
// stay thin and muted. A step the user cleared themselves draws green; one
// finished with an assist draws amber. Once a chapter is completed its ring
// gives way to the ✓ check, so exactly one symbol shows per chapter.
export function renderRailMarks() {
  const progress = loadStore(PROGRESS_KEY);
  const steps = loadStore(STEPS_KEY);
  document.querySelectorAll('.ch-ring[data-ring]').forEach((ring) => {
    const id = ring.getAttribute('data-ring');
    const total = Math.trunc(Number(ring.getAttribute('data-steps'))) || 0;
    if (total < 1) return;
    // a completed chapter hands its slot to the check; only in-progress
    // chapters draw a ring. stale counts clamp to the ring's step total.
    ring.hidden = Boolean(progress.chapters[id]);
    if (ring.hidden) return;
    const entry = loadStepEntry(steps, id);
    const done = Math.min(total, entry.done);
    const assisted = new Set(entry.assisted.filter((n) => n < done));
    ring.innerHTML = ringSvg(total, done, assisted);
  });
  const legend = document.querySelector('.legend-steps');
  if (legend) {
    legend.hidden = false;
    const demo = legend.querySelector('[data-ring-demo]');
    if (demo) demo.innerHTML = ringSvg(3, 1);
  }
  let any = false;
  document.querySelectorAll('.ch-mark[data-mark]').forEach((mark) => {
    const entry = progress.chapters[mark.getAttribute('data-mark')];
    const assisted = entry && entry.assists && entry.assists.help + entry.assists.auto > 0;
    mark.classList.toggle('is-done', Boolean(entry) && !assisted);
    mark.classList.toggle('is-assisted', Boolean(assisted));
    if (entry) {
      any = true;
      mark.closest('a').title = assisted ? 'completed with assists' : 'completed';
    }
  });
  const reset = document.getElementById('reset-progress');
  if (reset) reset.hidden = !any;
}

// A finished chapter shows its solved files blurred behind a check card saying
// when and how it was completed; everything else inside the IDE goes inert
// until "Reset chapter". Pass null to hide the overlay again.
export function setCompletedOverlay(entry) {
  const overlay = document.getElementById('done-overlay');
  if (!overlay) return;
  overlay.hidden = !entry;
  for (const child of ide.children) {
    if (child !== overlay) child.inert = Boolean(entry);
  }
  if (entry) setText('done-text', completionStatement(entry));
}

export function chapterCompleteText() {
  const next = data.chapters[currentIndex + 1];
  return 'Chapter complete ✓' + (next ? ' - up next: ' + (currentIndex + 2) + ' · ' + next.title : ' - that was the last one!');
}
