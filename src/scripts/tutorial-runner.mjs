// The runner: each Run spawns a fresh module worker that executes the real
// flashtrace release build against the editor buffers; chapter checks then
// evaluate the worker's structured result. Silent background runs keep the
// step state live as the user types; a real Run additionally prints output,
// records `run: true` steps and can complete the chapter.
import { argvInput, terminal, runButton, RUN_TIMEOUT_MS } from './tutorial-dom.mjs';
import { colorizeReport, esc } from './report-colors.mjs';
import { safeCheck } from './tutorial-util.mjs';
import { recordRealRun, updateStepUi } from './tutorial-steps.mjs';
import { completeChapter } from './tutorial-persistence.mjs';
import {
  typing,
  active,
  current,
  panes,
  checkTimer,
  lastResult,
  setActive,
  setLastResult,
  setCheckTimer,
} from './tutorial-state.mjs';

export function currentArgv() {
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
  setActive(null);
  runButton.disabled = false;
}

export function scheduleSilentRun() {
  if (current && current.free) return; // nothing evaluates sandbox runs in the background
  clearTimeout(checkTimer);
  setCheckTimer(setTimeout(() => run(true), 800));
}

export function run(silent) {
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
  setActive({ worker, watchdog, silent });

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
    setLastResult(Object.assign({}, result.analysis, {
      exitCode: result.exitCode,
      argv,
      files,
      spec: paneText('spec'),
      code: paneText('code'),
    }));
    if (!wasSilent) recordRealRun();
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
