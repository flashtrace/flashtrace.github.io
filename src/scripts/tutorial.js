// /try/ page script: wires the two editors and the Run button to a fresh
// module worker per run that executes the real flashtrace release build
// against the buffers. Loaded as a module; older browsers without module
// support simply keep the static page.
import { colorizeReport, esc } from './report-colors.mjs';

const ide = document.getElementById('ide');
const specEditor = document.getElementById('ed-spec');
const codeEditor = document.getElementById('ed-code');
const terminal = document.getElementById('term-out');
const runButton = document.getElementById('run-btn');

if (ide && specEditor && codeEditor && terminal && runButton) init();

function init() {
  runButton.addEventListener('click', run);
  for (const editor of [specEditor, codeEditor]) {
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run();
      }
    });
  }
}

const RUN_TIMEOUT_MS = 5000;
let active = null; // { worker, watchdog } of the run in flight

function currentArgv() {
  try {
    const argv = JSON.parse(ide.dataset.argv || '[]');
    return Array.isArray(argv) ? argv.map(String) : [];
  } catch {
    return [];
  }
}

function commandLine(argv) {
  return ['npx flashtrace', ...argv].join(' ');
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

function run() {
  if (active) return; // one run at a time; the watchdog frees a stuck one
  if (typeof Worker === 'undefined') {
    showTerminal('<span class="t-red">This browser cannot run workers - the live terminal is unavailable.</span>');
    return;
  }

  const argv = currentArgv();
  const files = {
    [ide.dataset.specFile]: specEditor.value,
    [ide.dataset.codeFile]: codeEditor.value,
  };
  const prompt = `<span class="t-dim">$</span> ${esc(commandLine(argv))}\n`;

  runButton.disabled = true;
  showTerminal(prompt + '<span class="t-dim">running…</span>');

  const worker = new Worker(new URL('./tutorial-worker.js', import.meta.url), { type: 'module' });
  const watchdog = setTimeout(() => {
    finishRun();
    showTerminal(prompt + '<span class="t-red">the run did not finish within 5 seconds and was stopped</span>');
  }, RUN_TIMEOUT_MS);
  active = { worker, watchdog };

  worker.onmessage = (event) => {
    finishRun();
    const result = event.data;
    if (!result.ok) {
      showTerminal(prompt + `<span class="t-red">failed to load the flashtrace bundle: ${esc(result.error)}</span>`);
      return;
    }
    const body = result.output ? colorizeReport(result.output) + '\n' : '';
    showTerminal(prompt + body + `<span class="t-dim">exit ${result.exitCode}</span>`);
    document.dispatchEvent(
      new CustomEvent('flashtrace:run', { detail: { result, files, argv } }),
    );
  };
  worker.onerror = (event) => {
    finishRun();
    showTerminal(prompt + `<span class="t-red">worker error: ${esc(event.message || 'unknown')}</span>`);
  };

  worker.postMessage({ files, argv });
}
