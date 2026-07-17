// /try/ page script: chapter engine + runner. Each Run spawns a fresh module
// worker that executes the real flashtrace release build against the editor
// buffers; chapter checks evaluate the worker's structured results. Progress
// and in-flight buffers persist in localStorage (ft-tutorial-*), keyed by
// stable chapter ids - never by index. Loaded as a module; browsers without
// module support keep the server-rendered read-only fallback.
import { colorizeReport, esc } from './report-colors.mjs';

const ide = document.getElementById('ide');
const specEditor = document.getElementById('ed-spec');
const codeEditor = document.getElementById('ed-code');
const terminal = document.getElementById('term-out');
const runButton = document.getElementById('run-btn');
const argvInput = document.getElementById('argv-input');

const PROGRESS_KEY = 'ft-tutorial-progress';
const BUFFERS_KEY = 'ft-tutorial-buffers';
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
    }
    return data;
  } catch (err) {
    console.warn('tutorial: chapter data unavailable, running as a plain editor -', err);
    return null;
  }
}

// --- engine state ------------------------------------------------------------

let data = null;
let current = null; // active chapter object
let currentIndex = 0;
let assists = { help: 0, auto: 0 }; // in-memory per chapter visit
let lastResult = null; // r-context of the latest (also silent) run
let active = null; // { worker, watchdog, silent } of the run in flight
let saveTimer = null;
let checkTimer = null;

function init() {
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

  window.addEventListener('hashchange', () => {
    const id = window.location.hash.slice(1);
    if (current && id && id !== current.id) openChapter(id);
  });

  renderRailMarks();
  const fromHash = window.location.hash.slice(1);
  const initial =
    data.chapters.find((c) => c.id === fromHash) ??
    data.chapters.find((c) => !progressEntry(c.id)) ??
    data.chapters[0];
  openChapter(initial.id);
}

function progressEntry(id) {
  return loadStore(PROGRESS_KEY).chapters[id];
}

// --- chapter switching -------------------------------------------------------

function chapterById(id) {
  return data.chapters.find((c) => c.id === id) ?? null;
}

function seedBuffers() {
  specEditor.value = current.spec.body;
  codeEditor.value = current.variant.body;
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

  // head + ide chrome
  const no = currentIndex + 1;
  setText('ch-kicker', 'Chapter ' + no + ' · ' + chapter.group);
  setText('ch-title', chapter.title);
  setText('ch-intro', chapter.intro);
  const docsEl = document.getElementById('ch-docs');
  if (docsEl) {
    docsEl.innerHTML = chapter.docs
      .map((d) => '<a href="' + esc(d.href) + '">' + esc(d.label) + '</a>')
      .join(' · ');
  }
  setText('ide-title', 'chapter ' + no + ' · ' + chapter.title);
  setText('spec-tab', chapter.spec.file);
  setText('code-tab', chapter.variant.file);
  setText('goal-text', chapter.goal);
  setText('step-progress', 'Run to check your progress.');
  terminal.innerHTML = '<span class="t-dim">press Run to trace the project</span>';

  // buffers: stored work-in-progress -> resume/start-fresh modal
  const stored = loadStore(BUFFERS_KEY).chapters[id];
  if (stored && (stored.spec !== chapter.spec.body || stored.code !== chapter.variant.body)) {
    offerResume(chapter, stored);
  } else {
    seedBuffers();
    scheduleSilentRun();
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function offerResume(chapter, stored) {
  const modal = document.getElementById('resume-modal');
  const resume = () => {
    specEditor.value = String(stored.spec);
    codeEditor.value = String(stored.code);
    if (argvInput) argvInput.value = chapter.argv.join(' ');
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

function saveBuffers() {
  if (!current) return;
  const store = loadStore(BUFFERS_KEY);
  const pristine =
    specEditor.value === current.spec.body && codeEditor.value === current.variant.body;
  if (pristine) {
    delete store.chapters[current.id];
  } else {
    store.chapters[current.id] = {
      rev: current.rev,
      lang: data.lang,
      savedAt: new Date().toISOString(),
      spec: specEditor.value,
      code: codeEditor.value,
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
  store.chapters[chapter.id] = {
    title: chapter.title,
    rev: chapter.rev,
    lang: data.lang,
    completedAt: new Date().toISOString(),
    assists: { help: assists.help, auto: assists.auto },
  };
  saveStore(PROGRESS_KEY, store);
  deleteBufferEntry(chapter.id);
  renderRailMarks();
}

function renderRailMarks() {
  const progress = loadStore(PROGRESS_KEY);
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

// --- step evaluation ---------------------------------------------------------

function safeCheck(fn, r) {
  try {
    return fn(r) === true;
  } catch {
    return false;
  }
}

function updateStepUi(fromRealRun) {
  if (!current || !lastResult || !lastResult.items) return;
  const steps = current.steps;
  let firstFailing = steps.length;
  for (let i = 0; i < steps.length; i++) {
    if (!safeCheck(steps[i].check, lastResult)) {
      firstFailing = i;
      break;
    }
  }
  const solved = safeCheck(current.done, lastResult);
  const completed = Boolean(progressEntry(current.id));
  if (solved && (completed || fromRealRun)) {
    const next = data.chapters[currentIndex + 1];
    setText(
      'step-progress',
      'Chapter complete ✓' + (next ? ' - up next: ' + (currentIndex + 2) + ' · ' + next.title : ' - that was the last one!'),
    );
  } else if (firstFailing >= steps.length) {
    setText('step-progress', solved ? 'All steps done - Run to finish the chapter.' : 'All steps done.');
  } else {
    setText('step-progress', 'Step ' + (firstFailing + 1) + ' of ' + steps.length);
  }
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
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => run(true), 800);
}

function run(silent) {
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
  const specName = current ? current.spec.file : ide.dataset.specFile || 'spec.md';
  const codeName = current ? current.variant.file : ide.dataset.codeFile || 'code.js';
  const files = { [specName]: specEditor.value, [codeName]: codeEditor.value };
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
    lastResult = Object.assign({}, result.analysis, {
      exitCode: result.exitCode,
      argv,
      spec: specEditor.value,
      code: codeEditor.value,
    });
    if (current && result.analysis && !wasSilent && safeCheck(current.done, lastResult)) {
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

if (ide && specEditor && codeEditor && terminal && runButton) init();
