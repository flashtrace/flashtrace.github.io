// The step guidance panel between the intro and the IDE: one <details> per
// step, rebuilt on every chapter switch and re-synced after every analysis
// (same structure as the server-rendered chapter 1 in tutorial.mjs). Steps
// behind the current one grey out behind a check, the current one unfolds; at
// most one step is ever unfolded (a proper accordion).
import { setText } from './tutorial-dom.mjs';
import { esc } from './report-colors.mjs';
import { safeCheck } from './tutorial-util.mjs';
import { progressEntry } from './tutorial-store.mjs';
import { saveStepProgress, chapterCompleteText } from './tutorial-persistence.mjs';
import {
  current,
  lastResult,
  assistedSteps,
  realRunCleared,
  lastSyncedStep,
  setLastSyncedStep,
} from './tutorial-state.mjs';

// Modern browsers make same-`name` details mutually exclusive natively; this
// mirrors that where the attribute is unsupported. toggle does not bubble,
// so it is captured at the list.
export function initStepAccordion() {
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

export function renderStepList(chapter) {
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
export function syncStepList(currentIndex, force) {
  const list = document.getElementById('step-items');
  if (!list) return;
  const refold = force || currentIndex !== lastSyncedStep;
  Array.from(list.children).forEach((item, i) => {
    item.classList.toggle('is-done', i < currentIndex);
    item.classList.toggle('is-assisted', i < currentIndex && assistedSteps.has(i));
    item.classList.toggle('is-current', i === currentIndex);
    const details = item.querySelector('details');
    if (details && refold) details.open = i === currentIndex;
  });
  setLastSyncedStep(currentIndex);
}

// current step = index of the first failing check; users may type ahead,
// paste solutions or re-break earlier steps - this always re-converges.
// A `run: true` step additionally needs its real run on record.
export function firstFailingIndex() {
  if (!current || !lastResult || !lastResult.items) return null;
  for (let i = 0; i < current.steps.length; i++) {
    const step = current.steps[i];
    if (!safeCheck(step.check, lastResult) || (step.run && !realRunCleared.has(i))) return i;
  }
  return current.steps.length;
}

// After a real Run: walk the steps in order and put every `run: true` step
// reached with all its predecessors passing on record - this run was it.
export function recordRealRun() {
  if (!current || current.free || !lastResult || !lastResult.items) return;
  for (let i = 0; i < current.steps.length; i++) {
    const step = current.steps[i];
    if (step.run) realRunCleared.add(i);
    if (!safeCheck(step.check, lastResult) || (step.run && !realRunCleared.has(i))) return;
  }
}

export function updateStepUi(fromRealRun) {
  if (!current || current.free || !lastResult || !lastResult.items) return;
  const steps = current.steps;
  const firstFailing = firstFailingIndex();
  const solved = safeCheck(current.done, lastResult);
  saveStepProgress(current.id, firstFailing);
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.disabled = false;
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
