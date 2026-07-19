// Chapter switching: seed or restore a chapter's buffers, paint the head and
// IDE chrome, and drive the completed-chapter overlay and resume modal.
// Progress and in-flight buffers persist per stable chapter id.
import { ide, terminal, argvInput, setText, STEPS_KEY, BUFFERS_KEY } from './tutorial-dom.mjs';
import { esc } from './report-colors.mjs';
import { relativeTime } from './tutorial-util.mjs';
import { loadStore, loadStepEntry, progressEntry, FREE_EDITOR } from './tutorial-store.mjs';
import {
  saveBuffers,
  deleteBufferEntry,
  setCompletedOverlay,
  renderRailMarks,
  storedPristine,
  chapterCompleteText,
} from './tutorial-persistence.mjs';
import { renderStepList, syncStepList } from './tutorial-steps.mjs';
import { scheduleSilentRun } from './tutorial-runner.mjs';
import { seedBuffers, syncEditors } from './tutorial-files.mjs';
import { closeAssist } from './tutorial-assists.mjs';
import {
  data,
  current,
  currentIndex,
  setCurrent,
  setCurrentIndex,
  setPanes,
  setAssists,
  setAssistedSteps,
  setRealRunCleared,
  setLastResult,
} from './tutorial-state.mjs';

export function chapterById(id) {
  if (id === FREE_EDITOR.id) return FREE_EDITOR;
  return data.chapters.find((c) => c.id === id) ?? null;
}

export function openChapter(id) {
  const chapter = chapterById(id);
  if (!chapter) return;
  if (current) saveBuffers();
  setCurrent(chapter);
  setCurrentIndex(data.chapters.indexOf(chapter));
  setAssists({ help: 0, auto: 0 });
  const stepEntry = loadStepEntry(loadStore(STEPS_KEY), id);
  setAssistedSteps(new Set(stepEntry.assisted));
  setRealRunCleared(new Set(
    chapter.steps.map((step, i) => (step.run && i < stepEntry.done ? i : -1)).filter((i) => i >= 0),
  ));
  setLastResult(null);
  ide.classList.toggle('no-code', Boolean(chapter.noCode));

  // rail + url
  document.querySelectorAll('[data-chapter]').forEach((link) => {
    const on = link.getAttribute('data-chapter') === id;
    link.classList.toggle('is-current', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  history.replaceState(null, '', '#' + id);

  // head + ide chrome; the free editor has no chapter number, goal or steps
  const assistBar = document.getElementById('assist-bar');
  if (assistBar) assistBar.hidden = Boolean(chapter.free);
  renderStepList(chapter);
  if (chapter.free) {
    setText('ch-kicker', 'Sandbox');
    setText('ide-title', 'free editor');
  } else {
    const no = currentIndex + 1;
    setText('ch-kicker', 'Chapter ' + no + ' · ' + chapter.group);
    setText('ide-title', 'chapter ' + no + ' · ' + chapter.title);
    setText('goal-text', chapter.goal);
    setText('step-progress', 'Run to check your progress.');
  }
  setText('ch-title', chapter.title);
  setText('ch-intro', chapter.intro);
  const docsEl = document.getElementById('ch-docs');
  if (docsEl) {
    docsEl.innerHTML = chapter.docs
      .map((d) => '<a href="' + esc(d.href) + '">' + esc(d.label) + '</a>')
      .join(' · ');
  }
  terminal.innerHTML = '<span class="t-dim">press Run to trace the project</span>';
  closeAssist();
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.hidden = Boolean(chapter.free); // the sandbox has no steps to help with
    helpBtn.disabled = true; // re-enabled once the first analysis lands
  }

  // buffers: a finished chapter silently restores its solved files behind the
  // completed overlay (no resume modal); stored work-in-progress elsewhere ->
  // resume/start-fresh modal; the free editor is a scratchpad with no
  // meaningful start state, so it restores silently ("Reset files" clears it)
  const entry = chapter.free ? null : progressEntry(id);
  const stored = loadStore(BUFFERS_KEY).chapters[id];
  setCompletedOverlay(entry);
  if (entry) {
    if (stored) restoreStored(chapter, stored);
    else seedBuffers(); // completions before buffers were kept: show the start files
    setText('step-progress', chapterCompleteText());
    syncStepList(chapter.steps.length, true); // every step folded away behind its check
  } else if (!stored || storedPristine(chapter, stored)) {
    seedBuffers();
    scheduleSilentRun();
  } else if (chapter.free) {
    restoreStored(chapter, stored);
  } else {
    offerResume(chapter, stored);
  }
}

// Rebuild the pane model from a stored entry. Entries written before the
// multi-file model carry plain `spec`/`code` strings; they map onto the
// chapter's seeded file names.
function restoreStored(chapter, stored) {
  const sane = (p, fallback) => {
    const files = Array.isArray(p && p.files)
      ? p.files
          .filter((f) => f && typeof f.name === 'string' && typeof f.body === 'string')
          .map((f) => ({ name: f.name, body: f.body }))
      : [];
    if (files.length === 0) files.push({ name: fallback.file, body: fallback.body });
    const active = Math.min(Math.max(0, Math.trunc(Number(p && p.active)) || 0), files.length - 1);
    return { files, active };
  };
  if (stored.panes) {
    setPanes({
      spec: sane(stored.panes.spec, chapter.spec),
      code: sane(stored.panes.code, chapter.variant),
    });
  } else {
    setPanes({
      spec: { files: [{ name: chapter.spec.file, body: String(stored.spec) }], active: 0 },
      code: { files: [{ name: chapter.variant.file, body: String(stored.code) }], active: 0 },
    });
  }
  syncEditors();
  if (argvInput) argvInput.value = chapter.argv.join(' ');
}

function offerResume(chapter, stored) {
  const modal = document.getElementById('resume-modal');
  const resume = () => {
    restoreStored(chapter, stored);
    scheduleSilentRun();
  };
  if (!modal || typeof modal.showModal !== 'function') {
    resume();
    return;
  }
  setText('resume-text', 'You have work in progress from ' + relativeTime(stored.savedAt) + ' - resume it, or start fresh?');
  const note = document.getElementById('resume-note');
  if (note) note.hidden = stored.rev === chapter.rev;
  const yes = document.getElementById('resume-yes');
  const fresh = document.getElementById('resume-fresh');
  const close = (starter) => () => {
    modal.close();
    yes.onclick = null;
    fresh.onclick = null;
    starter();
  };
  yes.onclick = close(resume);
  fresh.onclick = close(() => {
    deleteBufferEntry(chapter.id);
    seedBuffers();
    scheduleSilentRun();
  });
  modal.oncancel = () => close(resume)(); // Esc counts as resume - never discards
  modal.showModal();
}
