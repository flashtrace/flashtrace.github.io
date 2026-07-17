// Module worker for /try/: executes the real, release-pinned flashtrace
// bundle (node:* imports rewritten to ./shims/ at build time) against the
// editor buffers as in-memory files, then derives structured results from the
// bundle's exported library surface for the chapter checks.
//
// Protocol: one { files: { name: text }, argv: [extra args] } message in, one
// result message out. The page spawns a fresh worker per run (fresh module
// graph, no state leaks) and terminates it afterwards.

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

// Mirrors the CLI's -t/--tags parsing closely enough for the structured
// analysis to match what the run just reported.
function parseTags(argv) {
  let tags = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let value = null;
    if (arg === '-t' || arg === '--tags') value = argv[i + 1];
    else if (arg.startsWith('--tags=')) value = arg.slice('--tags='.length);
    if (value != null) {
      tags = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return tags;
}

// Re-run the parse/analyze pipeline through the bundle's public exports to get
// items and problems as data. Chapter checks assert on these instead of
// regex-matching terminal text.
function analyzeBuffers(mod, files, argv) {
  const problems = [];
  const forwards = [];
  let items = [];
  for (const name of Object.keys(files).sort()) {
    const file = '/project/' + name;
    const isMarkdown = /\.(md|markdown)$/i.test(name);
    const parse = isMarkdown ? mod.parseMarkdown : mod.parseCode;
    items.push(...parse(file, files[name], problems, forwards));
  }
  const tags = parseTags(argv);
  if (tags) {
    const wantUntagged = tags.includes('_');
    items = items.filter(
      (item) =>
        item.origin === 'code' ||
        item.tags.some((tag) => tags.includes(tag)) ||
        (wantUntagged && item.tags.length === 0),
    );
  }
  mod.analyze(items, forwards, problems);
  const errorCount = problems.filter((p) => p.severity === 'error').length;
  const clean = errorCount === 0 && items.every((item) => item.defects.length === 0);
  const stripRoot = (file) => String(file).replace('/project/', '');
  return {
    clean,
    items: items.map((item) => ({
      id: item.id,
      origin: item.origin,
      file: stripRoot(item.file),
      line: item.line,
      title: item.title ?? null,
      tags: item.tags,
      needs: item.needs,
      covers: item.covers,
      defects: item.defects,
      deepCovered: Boolean(item.deepCovered),
      forwardsTo: item.forwardsTo ?? null,
    })),
    problems: problems.map((p) => ({
      severity: p.severity,
      file: stripRoot(p.file),
      line: p.line,
      message: p.message,
    })),
  };
}

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
