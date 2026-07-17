// /try/ page script: chapter engine + runner. Each Run spawns a fresh module
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
      chapter.variants = { [data.lang]: chapter.variant }; // applyStep's shape
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

function init() {
  setupHighlight(specEditor);
  setupHighlight(codeEditor);
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
  refreshHighlights();
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
  closeAssist();
  for (const btn of [document.getElementById('help-btn'), document.getElementById('auto-btn')]) {
    if (btn) btn.disabled = true; // re-enabled once the first analysis lands
  }

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
    refreshHighlights();
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
  if (!current || !lastResult || !lastResult.items) return;
  const steps = current.steps;
  const firstFailing = firstFailingIndex();
  const solved = safeCheck(current.done, lastResult);
  for (const btn of [document.getElementById('help-btn'), document.getElementById('auto-btn')]) {
    if (btn) btn.disabled = false;
  }
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
  const tab = document.getElementById(step.pane === 'spec' ? 'spec-tab' : 'code-tab');
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
  const before = { spec: specEditor.value, code: codeEditor.value, argv: currentArgv() };
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
