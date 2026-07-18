// Module worker for /learn/: executes the real, release-pinned flashtrace
// bundle (node:* imports rewritten to ./shims/ at build time) against the
// editor buffers as in-memory files, then derives structured results from the
// bundle's exported library surface for the chapter checks.
//
// Protocol: one { files: { name: text }, argv: [extra args] } message in, one
// result message out. The page spawns a fresh worker per run (fresh module
// graph, no state leaks) and terminates it afterwards.

import { analyzeBuffers } from './chapter-utils.mjs';
import processShim from './shims/process.mjs';

// The bundle references the `process` global directly in one place (esbuild
// keeps globals as-is); Node provides it, a worker does not - seed it with
// the same shim the rewritten `node:process` imports resolve to.
globalThis.process = processShim;

const BUNDLE_URL = new URL('./flashtrace.mjs', import.meta.url);

const output = [];
let exitCode = null;
let exitSeen;
const exited = new Promise((resolve) => {
  exitSeen = resolve;
});

const isExitSignal = (value) =>
  globalThis.__FtExitSignal !== undefined && value instanceof globalThis.__FtExitSignal;

// The CLI ends every path in process.exit(): the shim throws an ExitSignal,
// runCli()'s catch handler logs it via console.error and rethrows a second
// one (code 2) as an unhandled rejection. Both are filtered from the output;
// the first signal observed carries the run's real exit code.
function recordExit(signal) {
  if (exitCode === null) exitCode = signal.code;
  exitSeen();
}

function capture(args) {
  const signal = args.find(isExitSignal);
  if (signal) {
    recordExit(signal);
    return;
  }
  output.push(args.map(String).join(' '));
}

console.log = (...args) => capture(args);
console.error = (...args) => capture(args);

self.addEventListener('unhandledrejection', (event) => {
  if (isExitSignal(event.reason)) {
    event.preventDefault();
    recordExit(event.reason);
  }
});

self.onmessage = async (event) => {
  const { files, argv = [] } = event.data;

  const vfs = new Map();
  for (const [name, text] of Object.entries(files)) vfs.set('/project/' + name, text);
  globalThis.__ftVfs = vfs;
  globalThis.__ftArgv = ['node', decodeURIComponent(BUNDLE_URL.pathname), '/project', ...argv];

  let mod;
  try {
    mod = await import(BUNDLE_URL.href);
  } catch (err) {
    postMessage({ ok: false, error: String(err) });
    return;
  }
  await exited; // resolved by the first ExitSignal - runCli() always exits

  let analysis = null;
  try {
    analysis = analyzeBuffers(mod, files, argv);
  } catch {
    // structured results are best-effort; the terminal output stands alone
  }
  postMessage({ ok: true, output: output.join('\n'), exitCode, analysis });
};
