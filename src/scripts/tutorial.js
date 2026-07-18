// /learn/ page script: chapter engine + runner. Each Run spawns a fresh module
// worker that executes the real flashtrace release build against the editor
// buffers; chapter checks evaluate the worker's structured results. Progress
// and in-flight buffers persist in localStorage (ft-tutorial-*), keyed by
// stable chapter ids - never by index. Loaded as a module; browsers without
// module support keep the server-rendered read-only fallback.
import { applyStep } from './chapter-utils.mjs';
import { highlightTokens } from './highlight.mjs';
import { colorizeReport, esc } from './report-colors.mjs';

const ide = document.getElementById('ide');
const specEditor = document.getElementById('ed-spec');
const codeEditor = document.getElementById('ed-code');
const terminal = document.getElementById('term-out');
const runButton = document.getElementById('run-btn');
const argvInput = document.getElementById('argv-input');
const specTabs = document.getElementById('spec-tabs');
const codeTabs = document.getElementById('code-tabs');

const PROGRESS_KEY = 'ft-tutorial-progress';
const BUFFERS_KEY = 'ft-tutorial-buffers';
const STEPS_KEY = 'ft-tutorial-steps';
const RUN_TIMEOUT_MS = 5000;

// --- defensive localStorage stores ------------------------------------------

function loadStore(key) {
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

function saveStore(key, store) {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* private mode etc. - persistence is best-effort */
  }
}

function removeStores() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(BUFFERS_KEY);
    localStorage.removeItem(STEPS_KEY);
  } catch {
    /* ignore */
  }
}

// --- chapter data ------------------------------------------------------------

function loadChapterData() {
  try {
    const el = document.getElementById('tutorial-data');
    const data = JSON.parse(el.textContent);
    if (data.v !== 1 || !Array.isArray(data.chapters) || data.chapters.length === 0) return null;
    // checks/done ship as source text of pure, closure-free arrows
    const compile = (src) => new Function('return (' + src + ')')();
    for (const chapter of data.chapters) {
      chapter.done = compile(chapter.done);
      for (const step of chapter.steps) step.check = compile(step.check);
      chapter.variants = { [data.lang]: chapter.variant }; // applyStep's shape
    }
    return data;
  } catch (err) {
    console.warn('tutorial: chapter data unavailable, running as a plain editor -', err);
    return null;
  }
}

// --- engine state ------------------------------------------------------------

// The free editor: a chapter-shaped sandbox living outside data.chapters. It
// has no steps, goal or completion - just two empty files and the real CLI.
// Its buffers persist under the same store as any chapter, keyed 'editor'.
const FREE_EDITOR = {
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

let data = null;
let current = null; // active chapter object
let currentIndex = 0;
// Editable files, one list per pane: the left pane holds the Markdown spec
// side, the right the code side. Each pane shows its active file in the
// textarea; the editors' input listeners keep the active body in sync, so the
// model is always current. Chapters marked `locked` render padlocks instead
// of close buttons and a disabled "+".
let panes = null; // { spec: { files: [{ name, body }], active }, code: { ... } }
let assists = { help: 0, auto: 0 }; // in-memory per chapter visit
let lastResult = null; // r-context of the latest (also silent) run
let active = null; // { worker, watchdog, silent } of the run in flight
let saveTimer = null;
let checkTimer = null;
let lastSyncedStep = null; // step the accordion was last folded to; guards manual folds

// --- editor highlight overlay ------------------------------------------------
// A transparent textarea over a highlightTokens-rendered <pre> with identical
// metrics, scroll-synced. Built at runtime so the no-JS page keeps plain
// server-rendered textareas.

const highlightRenderers = [];

function setupHighlight(editor) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-wrap';
  const pre = document.createElement('pre');
  pre.className = 'editor-highlight';
  pre.setAttribute('aria-hidden', 'true');
  const code = document.createElement('code');
  pre.appendChild(code);
  editor.parentNode.insertBefore(wrap, editor);
  wrap.appendChild(pre);
  wrap.appendChild(editor);
  editor.classList.add('editor-overlaid');
  const sync = () => {
    pre.scrollTop = editor.scrollTop;
    pre.scrollLeft = editor.scrollLeft;
  };
  const render = () => {
    // trailing newline keeps the pre's last line height in step with the textarea
    code.innerHTML = highlightTokens(esc(editor.value)) + '\n';
    sync();
  };
  editor.addEventListener('input', render);
  editor.addEventListener('scroll', sync);
  highlightRenderers.push(render);
  render();
}

// call after every programmatic .value assignment (seeding, resume, reset)
function refreshHighlights() {
  for (const render of highlightRenderers) render();
}

// Both editors carry a native vertical resize grip, and a drag writes an inline
// height onto that one textarea only. The grid stretches the panes to the
// taller side, but a shorter inline height overrides the CSS fill, so dragging
// each grip in turn would drift the two windows apart. Mirror whichever grip is
// dragged onto the other editor so the left and right windows stay one height.
function syncEditorHeights() {
  if (typeof ResizeObserver === 'undefined') return;
  const editors = [specEditor, codeEditor];
  let shared = ''; // the height last propagated to both, as an inline string
  const observer = new ResizeObserver(() => {
    for (const editor of editors) {
      const height = editor.style.height; // set by a resize drag, else ''
      if (height && height !== shared) {
        shared = height;
        for (const other of editors) {
          if (other !== editor) other.style.height = height;
        }
        return; // the mirrored write settles to `shared`, so no feedback loop
      }
    }
  });
  for (const editor of editors) observer.observe(editor);
}

function init() {
  // seed the pane model from the server-rendered buffers; openChapter replaces
  // it, and the bare runner (no chapter data) keeps working on exactly this
  panes = {
    spec: { files: [{ name: ide.dataset.specFile || 'spec.md', body: specEditor.value }], active: 0 },
    code: { files: [{ name: ide.dataset.codeFile || 'code.js', body: codeEditor.value }], active: 0 },
  };
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
  data = loadChapterData();
  if (!data) return; // bare runner: Run still works on the visible buffers

  for (const editor of [specEditor, codeEditor]) {
    editor.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveBuffers, 400);
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

  const doneReset = document.getElementById('done-reset');
  if (doneReset) {
    doneReset.addEventListener('click', () => {
      if (!current || current.free) return;
      if (!window.confirm("Reset this chapter? Its completion and solved files are forgotten and the start files restored.")) return;
      deleteProgressEntry(current.id);
      deleteBufferEntry(current.id);
      deleteStepsEntry(current.id);
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

function progressEntry(id) {
  return loadStore(PROGRESS_KEY).chapters[id];
}

// --- chapter switching -------------------------------------------------------

function chapterById(id) {
  if (id === FREE_EDITOR.id) return FREE_EDITOR;
  return data.chapters.find((c) => c.id === id) ?? null;
}

// --- file management ---------------------------------------------------------
// Each pane owns a tab strip over its files: click to switch, ✕ to delete
// (confirmed), + to create (name + type dialog validated against the
// extensions the datalists ship). Locked chapters show padlocks instead.

const LOCK_TIP = 'This chapter does not allow file management';

function isLocked() {
  return Boolean(current && current.locked);
}

function tabStrip(pane) {
  return pane === 'spec' ? specTabs : codeTabs;
}

function activeFile(pane) {
  const state = panes[pane];
  return state.files[state.active];
}

// push both active files into their textareas after any model change
function syncEditors() {
  specEditor.value = activeFile('spec').body;
  codeEditor.value = activeFile('code').body;
  refreshHighlights();
  renderAllTabs();
}

function renderTabs(pane) {
  const strip = tabStrip(pane);
  if (!strip) return;
  const state = panes[pane];
  const locked = isLocked();
  const tab = (file, i) => {
    const on = i === state.active;
    const trailer = locked
      ? '<span class="tab-lock" title="' + LOCK_TIP + '"></span>'
      : state.files.length > 1
        ? '<button type="button" class="tab-close" data-index="' + i + '" title="Delete ' + esc(file.name) + '" aria-label="Delete ' + esc(file.name) + '">✕</button>'
        : '';
    return (
      '<div class="pane-tab' + (on ? ' is-active' : '') + '">' +
      '<button type="button" class="tab-name" data-index="' + i + '"' + (on ? ' aria-current="true"' : '') + '>' + esc(file.name) + '</button>' +
      trailer +
      '</div>'
    );
  };
  const addAttrs = locked ? ' disabled title="' + LOCK_TIP + '"' : ' title="New file"';
  strip.innerHTML =
    state.files.map(tab).join('') +
    '<button type="button" class="tab-add"' + addAttrs + ' aria-label="New file">+</button>';
}

function renderAllTabs() {
  renderTabs('spec');
  renderTabs('code');
}

function selectTab(pane, index) {
  const state = panes[pane];
  if (!state.files[index] || index === state.active) return;
  state.active = index;
  syncEditors();
}

function initTabs() {
  for (const pane of ['spec', 'code']) {
    const strip = tabStrip(pane);
    if (!strip) continue;
    strip.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.classList.contains('tab-name')) selectTab(pane, Number(button.dataset.index));
      else if (button.classList.contains('tab-close')) confirmDeleteFile(pane, Number(button.dataset.index));
      else if (button.classList.contains('tab-add')) openNewFileDialog(pane);
    });
  }
  initNewFileDialog();
  initDeleteFileDialog();
}

// --- deleting ----------------------------------------------------------------

let deleteFileContext = null; // { pane, index } while the confirm dialog is up

function initDeleteFileDialog() {
  const modal = document.getElementById('delfile-modal');
  const yes = document.getElementById('delfile-yes');
  const cancel = document.getElementById('delfile-cancel');
  if (!modal || !yes || !cancel) return;
  yes.addEventListener('click', () => {
    modal.close();
    if (deleteFileContext) deleteFile(deleteFileContext.pane, deleteFileContext.index);
    deleteFileContext = null;
  });
  cancel.addEventListener('click', () => {
    modal.close();
    deleteFileContext = null;
  });
  modal.addEventListener('cancel', () => {
    deleteFileContext = null;
  });
}

function confirmDeleteFile(pane, index) {
  const state = panes[pane];
  const file = state.files[index];
  if (isLocked() || !file || state.files.length < 2) return;
  const modal = document.getElementById('delfile-modal');
  if (!modal || typeof modal.showModal !== 'function') {
    if (window.confirm('Delete ' + file.name + '? Its content is lost.')) deleteFile(pane, index);
    return;
  }
  deleteFileContext = { pane, index };
  setText('delfile-text', 'Delete ' + file.name + '? Its content is lost - this cannot be undone.');
  modal.showModal();
}

function deleteFile(pane, index) {
  const state = panes[pane];
  if (!state.files[index] || state.files.length < 2) return;
  state.files.splice(index, 1);
  if (state.active > index) state.active -= 1;
  else if (state.active >= state.files.length) state.active = state.files.length - 1;
  syncEditors();
  saveBuffers();
  scheduleSilentRun();
}

// --- creating ----------------------------------------------------------------

let newFilePane = null; // pane the new-file dialog was opened for

function supportedExtensions(pane) {
  const list = document.getElementById(pane === 'spec' ? 'ext-spec' : 'ext-code');
  return list ? Array.from(list.querySelectorAll('option'), (o) => o.value) : [];
}

// Resolve the dialog's two fields into a final file name or a user-facing
// error; an extension typed into the name itself wins over the type field.
// `issue: true` marks "unsupported anywhere" - the dialog then offers the
// tool's issue tracker for a new-language request.
function resolveNewFile(pane) {
  const name = (document.getElementById('newfile-name').value || '').trim();
  const typed = (document.getElementById('newfile-ext').value || '').trim().toLowerCase();
  if (!name) return { error: '' }; // nothing typed yet - just keep Create disabled
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return { error: 'Use letters, digits, dots, dashes and underscores only.' };
  const own = /\.[a-z0-9]+$/i.exec(name);
  const ext = own ? own[0].toLowerCase() : typed ? (typed.startsWith('.') ? typed : '.' + typed) : '';
  if (!ext) return { error: '' }; // waiting for a type
  const full = own ? name : name + ext;
  if (full.toLowerCase() === ext) return { error: 'Give the file a name before its extension.' };
  const here = supportedExtensions(pane);
  if (!here.includes(ext)) {
    const other = supportedExtensions(pane === 'spec' ? 'code' : 'spec');
    if (other.includes(ext)) {
      return {
        error:
          pane === 'spec'
            ? 'The left pane holds the Markdown spec - create ' + ext + ' files with the + on the right.'
            : 'Markdown belongs in the spec pane - use the + on the left.',
      };
    }
    return { error: 'flashtrace sadly does not support ' + ext + ' files yet.', issue: true };
  }
  const taken = [...panes.spec.files, ...panes.code.files].some((f) => f.name.toLowerCase() === full.toLowerCase());
  if (taken) return { error: 'A file named ' + full + ' already exists.' };
  return { name: full };
}

function initNewFileDialog() {
  const modal = document.getElementById('newfile-modal');
  const name = document.getElementById('newfile-name');
  const ext = document.getElementById('newfile-ext');
  const create = document.getElementById('newfile-create');
  const cancel = document.getElementById('newfile-cancel');
  const error = document.getElementById('newfile-error');
  const errorText = document.getElementById('newfile-error-text');
  const issue = document.getElementById('newfile-issue');
  if (!modal || !name || !ext || !create || !cancel) return;
  const validate = () => {
    const resolved = resolveNewFile(newFilePane);
    create.disabled = !resolved.name;
    if (error) error.hidden = !resolved.error;
    if (errorText) errorText.textContent = resolved.error || '';
    if (issue) issue.hidden = !resolved.issue;
    return resolved;
  };
  const submit = () => {
    const resolved = validate();
    if (!resolved.name) return;
    modal.close();
    createFile(newFilePane, resolved.name);
  };
  name.addEventListener('input', validate);
  ext.addEventListener('input', validate);
  create.addEventListener('click', submit);
  cancel.addEventListener('click', () => modal.close());
  for (const field of [name, ext]) {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  }
}

function openNewFileDialog(pane) {
  const modal = document.getElementById('newfile-modal');
  const name = document.getElementById('newfile-name');
  const ext = document.getElementById('newfile-ext');
  if (isLocked() || !modal || !name || !ext || typeof modal.showModal !== 'function') return;
  newFilePane = pane;
  name.value = '';
  ext.value = pane === 'spec' ? '.md' : '.js';
  ext.setAttribute('list', pane === 'spec' ? 'ext-spec' : 'ext-code');
  const error = document.getElementById('newfile-error');
  if (error) error.hidden = true;
  document.getElementById('newfile-create').disabled = true;
  modal.showModal();
  name.focus();
}

function createFile(pane, fileName) {
  const state = panes[pane];
  state.files.push({ name: fileName, body: '' });
  state.active = state.files.length - 1;
  syncEditors();
  saveBuffers();
  scheduleSilentRun();
  paneEditor(pane).focus();
}

function seedBuffers() {
  panes = {
    spec: { files: [{ name: current.spec.file, body: current.spec.body }], active: 0 },
    code: { files: [{ name: current.variant.file, body: current.variant.body }], active: 0 },
  };
  syncEditors();
  if (argvInput) argvInput.value = current.argv.join(' ');
}

function openChapter(id) {
  const chapter = chapterById(id);
  if (!chapter) return;
  if (current) saveBuffers();
  current = chapter;
  currentIndex = data.chapters.indexOf(chapter);
  assists = { help: 0, auto: 0 };
  lastResult = null;

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
  for (const btn of [document.getElementById('help-btn'), document.getElementById('auto-btn')]) {
    if (btn) btn.disabled = true; // re-enabled once the first analysis lands
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
    panes = {
      spec: sane(stored.panes.spec, chapter.spec),
      code: sane(stored.panes.code, chapter.variant),
    };
  } else {
    panes = {
      spec: { files: [{ name: chapter.spec.file, body: String(stored.spec) }], active: 0 },
      code: { files: [{ name: chapter.variant.file, body: String(stored.code) }], active: 0 },
    };
  }
  syncEditors();
  if (argvInput) argvInput.value = chapter.argv.join(' ');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
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

function relativeTime(iso) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'earlier';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 2) return 'moments ago';
  if (minutes < 90) return minutes + ' minutes ago';
  const hours = Math.round(minutes / 60);
  if (hours < 36) return hours + ' hours ago';
  return Math.round(hours / 24) + ' days ago';
}

// --- persistence -------------------------------------------------------------

// Pristine entries are deleted on save, so under the multi-file shape a
// stored entry always means real work; only legacy string entries can still
// equal the seeds.
function storedPristine(chapter, stored) {
  if (stored.panes) return false;
  return stored.spec === chapter.spec.body && stored.code === chapter.variant.body;
}

function saveBuffers() {
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

function deleteBufferEntry(id) {
  const store = loadStore(BUFFERS_KEY);
  delete store.chapters[id];
  saveStore(BUFFERS_KEY, store);
}

// Written exactly once per chapter: when its done-condition first passes
// after a real (non-silent) Run in this browser.
function completeChapter(chapter) {
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

function deleteProgressEntry(id) {
  const store = loadStore(PROGRESS_KEY);
  delete store.chapters[id];
  saveStore(PROGRESS_KEY, store);
}

// --- completed-chapter overlay -----------------------------------------------
// A finished chapter shows its solved files blurred behind a check card saying
// when and how it was completed; everything else inside the IDE goes inert
// until "Reset chapter". Pass null to hide the overlay again.

function setCompletedOverlay(entry) {
  const overlay = document.getElementById('done-overlay');
  if (!overlay) return;
  overlay.hidden = !entry;
  for (const child of ide.children) {
    if (child !== overlay) child.inert = Boolean(entry);
  }
  if (entry) setText('done-text', completionStatement(entry));
}

function completionStatement(entry) {
  const help = entry.assists ? entry.assists.help : 0;
  const auto = entry.assists ? entry.assists.auto : 0;
  const how = [];
  if (help) how.push(help + (help === 1 ? ' hint' : ' hints'));
  if (auto) how.push(auto + (auto === 1 ? ' auto-solved step' : ' auto-solved steps'));
  return (
    'Completed ' + relativeTime(entry.completedAt) + (how.length ? ' with ' + how.join(' and ') : ' without assists') + '.'
  );
}

// --- rail progress rings -----------------------------------------------------
// Each chapter link carries a small SVG donut split into one arc per step,
// running clockwise from 12 o'clock: steps solved so far draw bold in the text
// color, the rest stay thin and muted. Solved-step counts persist per chapter
// under STEPS_KEY (written after every analysis) so the rings survive reloads
// and chapter switches. Once a chapter is completed its ring gives way to
// the ✓ check, so exactly one symbol shows per chapter.

function ringPoint(radius, deg) {
  const rad = (deg * Math.PI) / 180;
  return (8 + radius * Math.sin(rad)).toFixed(2) + ' ' + (8 - radius * Math.cos(rad)).toFixed(2);
}

function ringSvg(total, done) {
  const radius = 6.25;
  const cls = (i) => 'seg' + (i < done ? ' is-done' : '');
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

function saveStepProgress(id, done) {
  const store = loadStore(STEPS_KEY);
  if ((store.chapters[id] || 0) === done) return;
  if (done === 0) delete store.chapters[id];
  else store.chapters[id] = done;
  saveStore(STEPS_KEY, store);
  renderRailMarks();
}

function deleteStepsEntry(id) {
  const store = loadStore(STEPS_KEY);
  delete store.chapters[id];
  saveStore(STEPS_KEY, store);
}

function renderRailMarks() {
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
    const done = Math.min(total, Math.max(0, Math.trunc(Number(steps.chapters[id])) || 0));
    ring.innerHTML = ringSvg(total, done);
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

function chapterCompleteText() {
  const next = data.chapters[currentIndex + 1];
  return 'Chapter complete ✓' + (next ? ' - up next: ' + (currentIndex + 2) + ' · ' + next.title : ' - that was the last one!');
}

// --- step evaluation ---------------------------------------------------------

function safeCheck(fn, r) {
  try {
    return fn(r) === true;
  } catch {
    return false;
  }
}

// --- step accordion ----------------------------------------------------------
// The guidance panel between the intro and the IDE: one <details> per step,
// rebuilt on every chapter switch and re-synced after every analysis (same
// structure as the server-rendered chapter 1 in tutorial.mjs). Steps behind
// the current one grey out behind a check, the current one unfolds; at most
// one step is ever unfolded (a proper accordion), and manual folding around
// is fine - the next sync restores the canonical state.

// Modern browsers make same-`name` details mutually exclusive natively; this
// mirrors that where the attribute is unsupported. toggle does not bubble,
// so it is captured at the list.
function initStepAccordion() {
  const list = document.getElementById('step-items');
  if (!list || 'name' in document.createElement('details')) return;
  list.addEventListener(
    'toggle',
    (event) => {
      if (!event.target.open) return;
      for (const other of list.querySelectorAll('details[open]')) {
        if (other !== event.target) other.open = false;
      }
    },
    true,
  );
}

function renderStepList(chapter) {
  const section = document.getElementById('step-list');
  const list = document.getElementById('step-items');
  if (!section || !list) return;
  section.hidden = Boolean(chapter.free);
  if (section.hidden) return;
  list.innerHTML = chapter.steps
    .map(
      (step, i) =>
        '<li><details name="chapter-steps"><summary><span class="step-mark" aria-hidden="true"></span>' +
        (i + 1) + ' · ' + esc(step.title) +
        '</summary><p class="step-explain">' + esc(step.explain) + '</p></details></li>',
    )
    .join('');
  syncStepList(0, true);
}

// classes always mirror progress; the fold only snaps to the current step when
// that step actually changes (chapter switch, real progress) or on an explicit
// reset (force) - so background silent runs never yank a step the user opened
// to explore back to the current one.
function syncStepList(currentIndex, force) {
  const list = document.getElementById('step-items');
  if (!list) return;
  const refold = force || currentIndex !== lastSyncedStep;
  Array.from(list.children).forEach((item, i) => {
    item.classList.toggle('is-done', i < currentIndex);
    item.classList.toggle('is-current', i === currentIndex);
    const details = item.querySelector('details');
    if (details && refold) details.open = i === currentIndex;
  });
  lastSyncedStep = currentIndex;
}

// current step = index of the first failing check; users may type ahead,
// paste solutions or re-break earlier steps - this always re-converges
function firstFailingIndex() {
  if (!current || !lastResult || !lastResult.items) return null;
  for (let i = 0; i < current.steps.length; i++) {
    if (!safeCheck(current.steps[i].check, lastResult)) return i;
  }
  return current.steps.length;
}

function updateStepUi(fromRealRun) {
  if (!current || current.free || !lastResult || !lastResult.items) return;
  const steps = current.steps;
  const firstFailing = firstFailingIndex();
  const solved = safeCheck(current.done, lastResult);
  saveStepProgress(current.id, firstFailing);
  for (const btn of [document.getElementById('help-btn'), document.getElementById('auto-btn')]) {
    if (btn) btn.disabled = false;
  }
  const completed = Boolean(progressEntry(current.id));
  if (solved && (completed || fromRealRun)) {
    setText('step-progress', chapterCompleteText());
  } else if (firstFailing >= steps.length) {
    setText('step-progress', solved ? 'All steps done - Run to finish the chapter.' : 'All steps done.');
  } else {
    setText('step-progress', 'Step ' + (firstFailing + 1) + ' of ' + steps.length);
  }
  syncStepList(firstFailing);
  document.dispatchEvent(
    new CustomEvent('flashtrace:steps', {
      detail: { chapter: current.id, firstFailing, solved, fromRealRun },
    }),
  );
}

// --- runner ------------------------------------------------------------------

function currentArgv() {
  const raw = argvInput ? argvInput.value : '';
  return raw.trim().split(/\s+/).filter(Boolean);
}

function showTerminal(html) {
  terminal.innerHTML = html;
}

function finishRun() {
  if (!active) return;
  clearTimeout(active.watchdog);
  active.worker.terminate();
  active = null;
  runButton.disabled = false;
}

function scheduleSilentRun() {
  if (current && current.free) return; // nothing evaluates sandbox runs in the background
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => run(true), 800);
}

function run(silent) {
  if (typing) return; // never run against a half-typed patch
  if (active) {
    if (silent) return; // a real Run preempts a background check, not vice versa
    if (active.silent) finishRun();
    else return;
  }
  if (typeof Worker === 'undefined') {
    if (!silent) showTerminal('<span class="t-red">This browser cannot run workers - the live terminal is unavailable.</span>');
    return;
  }

  const argv = currentArgv();
  const files = {};
  for (const pane of ['spec', 'code']) {
    for (const file of panes[pane].files) files[file.name] = file.body;
  }
  const prompt = '<span class="t-dim">$</span> ' + esc(['npx flashtrace'].concat(argv).join(' ')) + '\n';

  if (!silent) {
    runButton.disabled = true;
    showTerminal(prompt + '<span class="t-dim">running…</span>');
  }

  const worker = new Worker(new URL('./tutorial-worker.js', import.meta.url), { type: 'module' });
  const watchdog = setTimeout(() => {
    const wasSilent = active && active.silent;
    finishRun();
    if (!wasSilent) showTerminal(prompt + '<span class="t-red">the run did not finish within 5 seconds and was stopped</span>');
  }, RUN_TIMEOUT_MS);
  active = { worker, watchdog, silent };

  worker.onmessage = (event) => {
    const wasSilent = active && active.silent;
    finishRun();
    const result = event.data;
    if (!result.ok) {
      if (!wasSilent) showTerminal(prompt + '<span class="t-red">failed to load the flashtrace bundle: ' + esc(result.error) + '</span>');
      return;
    }
    if (!wasSilent) {
      const body = result.output ? colorizeReport(result.output) + '\n' : '';
      showTerminal(prompt + body + '<span class="t-dim">exit ' + result.exitCode + '</span>');
    }
    // checks read r.spec / r.code as raw text: with several files per pane
    // they see the pane's files joined, so work spread over added files still
    // satisfies text-based checks; r.files carries the run's input snapshot
    const paneText = (pane) => panes[pane].files.map((f) => f.body).join('\n');
    lastResult = Object.assign({}, result.analysis, {
      exitCode: result.exitCode,
      argv,
      files,
      spec: paneText('spec'),
      code: paneText('code'),
    });
    if (current && !current.free && result.analysis && !wasSilent && safeCheck(current.done, lastResult)) {
      completeChapter(current);
    }
    updateStepUi(!wasSilent);
    document.dispatchEvent(new CustomEvent('flashtrace:run', { detail: { result, silent: wasSilent } }));
  };
  worker.onerror = (event) => {
    const wasSilent = active && active.silent;
    finishRun();
    if (!wasSilent) showTerminal(prompt + '<span class="t-red">worker error: ' + esc(event.message || 'unknown') + '</span>');
  };

  worker.postMessage({ files, argv });
}

// --- assists: "Help me" / "Do the next step for me" --------------------------
//
// Both operate on the current step. Help spotlights the step's anchor inside
// the IDE and explains it in a popup; auto additionally typewrites the step's
// patch into the editor (setRangeText, so undo works) and runs.

let typing = false; // typewriter in flight - runs and assists wait
let assistRestoreFocus = null;

function initAssists() {
  const helpButton = document.getElementById('help-btn');
  const autoButton = document.getElementById('auto-btn');
  const closeButton = document.getElementById('assist-close');
  const spotlight = document.getElementById('spotlight');
  if (!helpButton || !autoButton || !closeButton || !spotlight) return;
  helpButton.addEventListener('click', helpAssist);
  autoButton.addEventListener('click', autoAssist);
  closeButton.addEventListener('click', closeAssist);
  spotlight.addEventListener('click', closeAssist);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAssist();
  });
}

function paneEditor(pane) {
  return pane === 'spec' ? specEditor : codeEditor;
}

// Steps patch the chapter's seeded files by name; tabs the user added are
// theirs alone. In an unlocked chapter the seed can have been deleted -
// callers handle the -1.
function seedFileIndex(pane) {
  const name = pane === 'spec' ? current.spec.file : current.variant.file;
  return panes[pane].files.findIndex((f) => f.name === name);
}

// Bring the seeded file of the step's pane into view; false if it is gone.
function focusSeedTab(step) {
  if (!step || step.pane === 'argv') return true;
  const index = seedFileIndex(step.pane);
  if (index === -1) return false;
  selectTab(step.pane, index);
  return true;
}

function rectInIde(el) {
  const a = el.getBoundingClientRect();
  const b = ide.getBoundingClientRect();
  return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
}

// The editors render pre-wrap-free monospace text, so a line's y-offset is
// plain arithmetic over the computed line height - no mirror element needed.
function lineRectInIde(editor, lineIndex) {
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight);
  const padTop = parseFloat(style.paddingTop);
  editor.scrollTop = Math.max(0, padTop + lineIndex * lineHeight - editor.clientHeight / 2);
  const base = rectInIde(editor);
  let top = base.top + padTop + lineIndex * lineHeight - editor.scrollTop;
  top = Math.min(Math.max(top, base.top + 4), base.top + base.height - lineHeight - 4);
  return { left: base.left + 6, top: top - 2, width: base.width - 12, height: lineHeight + 4 };
}

// Resolve the step's visual target inside the IDE. Narrow layouts (stacked
// panes) degrade to the pane tab instead of a single line.
function assistTarget(step) {
  if (!step) {
    const runRect = rectInIde(runButton);
    return { rect: runRect };
  }
  if (step.pane === 'argv') {
    return { rect: rectInIde(argvInput || runButton) };
  }
  const editor = paneEditor(step.pane);
  const strip = tabStrip(step.pane);
  const tab = strip ? strip.querySelector('.pane-tab.is-active') : null;
  if (window.innerWidth < 700) return { rect: rectInIde(tab || editor) };
  const pack = step.pane === 'spec' ? current.spec : current.variant;
  const anchorKey = (step.patch && step.patch.anchor) || step.anchor;
  const source = anchorKey ? pack.anchors[anchorKey] : null;
  const text = editor.value;
  if (source) {
    const match = new RegExp(source, 'm').exec(text);
    if (match) {
      const line = text.slice(0, match.index).split('\n').length - 1;
      return { rect: lineRectInIde(editor, line), editor };
    }
  }
  // append steps (or unmatched anchors): point at the last line of the pane
  return { rect: lineRectInIde(editor, text.split('\n').length - 1), editor };
}

function openAssist(step) {
  const spotlight = document.getElementById('spotlight');
  const hole = document.getElementById('spotlight-hole');
  const pop = document.getElementById('assist-pop');
  const text = document.getElementById('assist-text');
  const doc = document.getElementById('assist-doc');
  if (!spotlight || !hole || !pop || !text || !doc || !current) return;

  const solvedNotRun = firstFailingIndex() >= current.steps.length;
  text.textContent = step
    ? step.explain
    : solvedNotRun && !progressEntry(current.id)
      ? 'Everything checks out - press Run to finish the chapter.'
      : 'This chapter is complete. Pick the next one in the rail on the left.';
  const docRef = current.docs[0];
  doc.href = docRef.href;
  doc.textContent = 'Read more: ' + docRef.label;

  const { rect } = assistTarget(step);
  hole.style.left = rect.left + 'px';
  hole.style.top = rect.top + 'px';
  hole.style.width = rect.width + 'px';
  hole.style.height = rect.height + 'px';
  spotlight.hidden = false;

  // measure invisibly, then place below the target (above when out of space)
  pop.hidden = false;
  pop.style.visibility = 'hidden';
  const ideBox = ide.getBoundingClientRect();
  const popBox = pop.getBoundingClientRect();
  let top = rect.top + rect.height + 10;
  if (top + popBox.height > ideBox.height - 8) top = Math.max(8, rect.top - popBox.height - 10);
  const left = Math.min(Math.max(rect.left, 8), Math.max(8, ideBox.width - popBox.width - 8));
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
  pop.style.visibility = '';

  assistRestoreFocus = document.activeElement;
  pop.focus();
}

function closeAssist() {
  const spotlight = document.getElementById('spotlight');
  const pop = document.getElementById('assist-pop');
  if (!spotlight || !pop || pop.hidden) return;
  spotlight.hidden = true;
  pop.hidden = true;
  if (assistRestoreFocus && typeof assistRestoreFocus.focus === 'function') assistRestoreFocus.focus();
  assistRestoreFocus = null;
}

function currentStep() {
  const index = firstFailingIndex();
  if (index === null || index >= current.steps.length) return null;
  return current.steps[index];
}

function helpAssist() {
  if (!current || typing) return;
  const step = currentStep();
  if (step) assists.help += 1;
  focusSeedTab(step); // anchor resolution needs the seeded file visible
  openAssist(step);
}

// shortest edit between the buffer and the patched buffer - typed as one span
function diffRange(oldText, newText) {
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

function typewriter(editor, start, oldEnd, insert, onDone) {
  editor.focus();
  editor.setRangeText('', start, oldEnd, 'end'); // drop the replaced region
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || insert.length === 0) {
    editor.setRangeText(insert, start, start, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    onDone();
    return;
  }
  typing = true;
  const chunk = Math.max(1, Math.ceil(insert.length / 60));
  let done = 0;
  let pos = start;
  const timer = setInterval(() => {
    const piece = insert.slice(done, done + chunk);
    editor.setRangeText(piece, pos, pos, 'end');
    refreshHighlights(); // the overlay shows the text; the textarea is transparent
    pos += piece.length;
    done += chunk;
    if (done >= insert.length) {
      clearInterval(timer);
      typing = false;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      onDone();
    }
  }, 18);
}

function autoAssist() {
  if (!current || typing) return;
  const index = firstFailingIndex();
  if (index === null) return;
  if (index >= current.steps.length) {
    run(false); // nothing left to apply - finish with a real run
    return;
  }
  const step = current.steps[index];
  if (!focusSeedTab(step)) {
    // the seeded file this step patches was deleted (unlocked chapters allow it)
    openAssist(step);
    const text = document.getElementById('assist-text');
    if (text) {
      const seedFile = step.pane === 'spec' ? current.spec.file : current.variant.file;
      text.textContent =
        'This step edits ' + seedFile + ', which no longer exists. ' +
        'Use "Reset files" to restore the chapter\'s start files, or recreate it and follow the hint by hand: ' +
        step.explain;
    }
    return;
  }
  // applyStep patches the seeded files; extra tabs the user added stay untouched
  const seedBody = (pane) => {
    const seedIndex = seedFileIndex(pane);
    return seedIndex === -1 ? '' : panes[pane].files[seedIndex].body;
  };
  const before = { spec: seedBody('spec'), code: seedBody('code'), argv: currentArgv() };
  const after = applyStep(current, data.lang, step, before);
  if (after.failed) {
    openAssist(step);
    const text = document.getElementById('assist-text');
    if (text) {
      text.textContent =
        'The buffers have drifted too far from this step\'s anchor to apply it automatically. ' +
        'Use "Reset files" to return to the chapter\'s start state, or follow the hint by hand: ' +
        step.explain;
    }
    return;
  }
  assists.auto += 1;
  openAssist(step);
  const finish = () => {
    closeAssist();
    run(false);
  };
  window.setTimeout(() => {
    if (step.pane === 'argv') {
      if (argvInput) argvInput.value = after.argv.join(' ');
      finish();
      return;
    }
    const editor = paneEditor(step.pane);
    const edit = diffRange(before[step.pane], after[step.pane]);
    typewriter(editor, edit.start, edit.oldEnd, edit.insert, finish);
  }, 600);
}

if (ide && specEditor && codeEditor && terminal && runButton) {
  init();
  initAssists();
}
