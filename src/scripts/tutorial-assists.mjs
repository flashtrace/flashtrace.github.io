// Assists: "Help me" and its "Do this step for me" follow-up. Both operate on
// the current step. Help spotlights the step's anchor inside the IDE and
// explains it in a popup; the popup offers "Do this step for me", which
// typewrites the step's patch into the editor (setRangeText, so undo works)
// and runs.
import { argvInput, runButton, ide } from './tutorial-dom.mjs';
import { diffRange } from './tutorial-util.mjs';
import { progressEntry } from './tutorial-store.mjs';
import { applyStep } from './chapter-utils.mjs';
import { refreshHighlights } from './tutorial-highlight.mjs';
import { paneEditor, tabStrip, selectTab } from './tutorial-files.mjs';
import { firstFailingIndex } from './tutorial-steps.mjs';
import { run, currentArgv } from './tutorial-runner.mjs';
import {
  current,
  data,
  panes,
  lastResult,
  assists,
  assistedSteps,
  typing,
  assistRestoreFocus,
  setTyping,
  setAssistRestoreFocus,
} from './tutorial-state.mjs';

export function initAssists() {
  const helpButton = document.getElementById('help-btn');
  const autoButton = document.getElementById('assist-auto');
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
  if (step.run) {
    return { rect: rectInIde(runButton) };
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
  const auto = document.getElementById('assist-auto');
  if (auto) auto.hidden = !step; // solved chapters leave nothing to apply

  const wasOpen = !pop.hidden;
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

  // on a follow-up (auto after help) keep the original restore target - the
  // active element is then a button inside the popup that is about to hide
  if (!wasOpen) setAssistRestoreFocus(document.activeElement);
  pop.focus();
}

export function closeAssist() {
  const spotlight = document.getElementById('spotlight');
  const pop = document.getElementById('assist-pop');
  if (!spotlight || !pop || pop.hidden) return;
  spotlight.hidden = true;
  pop.hidden = true;
  if (assistRestoreFocus && typeof assistRestoreFocus.focus === 'function') assistRestoreFocus.focus();
  setAssistRestoreFocus(null);
}

function helpAssist() {
  if (!current || typing) return;
  const index = firstFailingIndex();
  const step = index !== null && index < current.steps.length ? current.steps[index] : null;
  if (step) {
    assists.help += 1;
    assistedSteps.add(index); // a hint counts this step as assisted once it clears
  }
  focusSeedTab(step); // anchor resolution needs the seeded file visible
  openAssist(step);
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
  setTyping(true);
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
      setTyping(false);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      onDone();
    }
  }, 18);
}

// the popup stays open while the step is applied (or explains why it cannot
// be) - either way the follow-up action has been spent, so it hides
function hideAssistAuto() {
  const auto = document.getElementById('assist-auto');
  if (auto) auto.hidden = true;
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
    hideAssistAuto();
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
  // an adaptive step derives its snippet from the latest analysis, so the
  // typed-in solution picks up names the user chose over the static example
  let override = null;
  if (step.solve && lastResult && lastResult.items) {
    try {
      const suggestion = step.solve(lastResult);
      if (typeof suggestion === 'string') override = suggestion;
    } catch {
      /* fall back to the static snippet */
    }
  }
  const after = applyStep(current, data.lang, step, before, override);
  if (after.failed) {
    openAssist(step);
    hideAssistAuto();
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
  assistedSteps.add(index); // this step was typed in for the user
  openAssist(step);
  hideAssistAuto();
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
