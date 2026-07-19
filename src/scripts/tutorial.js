// /learn/ page entry: wires the server-rendered IDE to the chapter engine and
// runner split across ./tutorial-*.mjs. Each Run spawns a fresh module worker
// that executes the real flashtrace release build against the editor buffers;
// chapter checks evaluate the worker's structured results. Progress and
// in-flight buffers persist in localStorage (ft-tutorial-*), keyed by stable
// chapter ids - never by index. Loaded as a module; browsers without module
// support keep the server-rendered read-only fallback.
import {
  ide,
  specEditor,
  codeEditor,
  terminal,
  runButton,
  argvInput,
  setText,
  PROGRESS_KEY,
} from './tutorial-dom.mjs';
import { loadStore, removeStores, progressEntry, loadChapterData, FREE_EDITOR } from './tutorial-store.mjs';
import { data, current, saveTimer, setData, setPanes, setSaveTimer, setRealRunCleared } from './tutorial-state.mjs';
import { setupHighlight, syncEditorHeights } from './tutorial-highlight.mjs';
import { activeFile, initTabs, renderAllTabs, seedBuffers } from './tutorial-files.mjs';
import {
  saveBuffers,
  deleteBufferEntry,
  deleteProgressEntry,
  deleteStepsEntry,
  setCompletedOverlay,
  renderRailMarks,
} from './tutorial-persistence.mjs';
import { initStepAccordion, syncStepList } from './tutorial-steps.mjs';
import { run, scheduleSilentRun } from './tutorial-runner.mjs';
import { initAssists } from './tutorial-assists.mjs';
import { chapterById, openChapter } from './tutorial-chapters.mjs';

function init() {
  // seed the pane model from the server-rendered buffers; openChapter replaces
  // it, and the bare runner (no chapter data) keeps working on exactly this
  setPanes({
    spec: { files: [{ name: ide.dataset.specFile || 'spec.md', body: specEditor.value }], active: 0 },
    code: { files: [{ name: ide.dataset.codeFile || 'code.js', body: codeEditor.value }], active: 0 },
  });
  setupHighlight(specEditor);
  setupHighlight(codeEditor);
  syncEditorHeights();
  specEditor.addEventListener('input', () => {
    activeFile('spec').body = specEditor.value;
  });
  codeEditor.addEventListener('input', () => {
    activeFile('code').body = codeEditor.value;
  });
  initTabs();
  renderAllTabs();
  runButton.addEventListener('click', () => run(false));
  for (const editor of [specEditor, codeEditor]) {
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run(false);
      }
    });
  }
  if (argvInput) {
    argvInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run(false);
      }
    });
  }

  initStepAccordion();
  setData(loadChapterData());
  if (!data) return; // bare runner: Run still works on the visible buffers

  for (const editor of [specEditor, codeEditor]) {
    editor.addEventListener('input', () => {
      clearTimeout(saveTimer);
      setSaveTimer(setTimeout(saveBuffers, 400));
      scheduleSilentRun();
    });
  }
  if (argvInput) argvInput.addEventListener('input', scheduleSilentRun);

  document.querySelectorAll('[data-chapter]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openChapter(link.getAttribute('data-chapter'));
    });
  });

  const resetProgress = document.getElementById('reset-progress');
  if (resetProgress) {
    resetProgress.addEventListener('click', () => {
      if (window.confirm('Reset all tutorial progress and saved buffers?')) {
        removeStores();
        window.location.reload();
      }
    });
  }
  const resetFiles = document.getElementById('reset-files');
  if (resetFiles) {
    resetFiles.addEventListener('click', () => {
      if (!current) return;
      seedBuffers();
      deleteBufferEntry(current.id);
      scheduleSilentRun();
    });
  }

  const doneView = document.getElementById('done-view');
  if (doneView) {
    // peek at the solved files without forgetting the completion: hide the
    // card and un-inert the IDE for this visit only. nothing is persisted, so
    // reopening the chapter shows the card again.
    doneView.addEventListener('click', () => setCompletedOverlay(null));
  }

  const doneReset = document.getElementById('done-reset');
  if (doneReset) {
    doneReset.addEventListener('click', () => {
      if (!current || current.free) return;
      if (!window.confirm("Reset this chapter? Its completion and solved files are forgotten and the start files restored.")) return;
      deleteProgressEntry(current.id);
      deleteBufferEntry(current.id);
      deleteStepsEntry(current.id);
      setRealRunCleared(new Set());
      setCompletedOverlay(null);
      seedBuffers();
      setText('step-progress', 'Run to check your progress.');
      syncStepList(0, true);
      renderRailMarks();
      scheduleSilentRun();
    });
  }

  window.addEventListener('hashchange', () => {
    const id = window.location.hash.slice(1);
    if (current && id && id !== current.id) openChapter(id);
  });

  renderRailMarks();
  const fromHash = window.location.hash.slice(1);
  const initial =
    chapterById(fromHash) ??
    data.chapters.find((c) => !progressEntry(c.id)) ??
    data.chapters[0];
  openChapter(initial.id);

  // "Try it out" lands on #editor; on a first visit (no chapter ever
  // completed) offer the guided route instead of two empty files
  if (initial === FREE_EDITOR && Object.keys(loadStore(PROGRESS_KEY).chapters).length === 0) {
    offerWelcome();
  }
}

function offerWelcome() {
  const modal = document.getElementById('welcome-modal');
  const learn = document.getElementById('welcome-learn');
  const editor = document.getElementById('welcome-editor');
  if (!modal || !learn || !editor || typeof modal.showModal !== 'function') return;
  const close = (starter) => () => {
    modal.close();
    learn.onclick = null;
    editor.onclick = null;
    starter();
  };
  learn.onclick = close(() => openChapter(data.chapters[0].id));
  editor.onclick = close(() => {});
  modal.oncancel = () => close(() => {})(); // Esc keeps the free editor
  modal.showModal();
}

if (ide && specEditor && codeEditor && terminal && runButton) {
  init();
  initAssists();
}
