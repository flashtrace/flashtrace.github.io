// Build-time chapter verification (Node only). Runs every chapter's start
// state and each step's cumulative patched state through the real, rewritten
// release bundle - the exact artifact the browser executes - and asserts the
// expected outcomes. A flashtrace release that changes behavior a chapter
// relies on fails the build here instead of shipping a broken lesson.
//
// Also computes each chapter's content-hash identity (`rev`) and the
// JSON-safe payload embedded into the /learn/ page.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { analyzeBuffers, applyStep } from './chapter-utils.mjs';

// --- chapter identity + client payload --------------------------------------

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]))
        .join(',') +
      '}'
    );
  }
  if (typeof value === 'function') return JSON.stringify(value.toString());
  return JSON.stringify(value) ?? 'null';
}

// The chapter as it travels to the browser: functions as source text, only
// the active language variant. Doubles as the identity-hash input, so *any*
// content change - even a typo in a step text - yields a new `rev`.
export function chapterPayload(chapter, lang) {
  return {
    id: chapter.id,
    title: chapter.title,
    group: chapter.group,
    intro: chapter.intro,
    goal: chapter.goal,
    docs: chapter.docs,
    argv: chapter.argv,
    spec: chapter.spec,
    variant: { lang, ...chapter.variants[lang] },
    steps: chapter.steps.map((step) => ({
      title: step.title,
      explain: step.explain,
      pane: step.pane,
      anchor: step.anchor,
      patch: step.patch,
      check: step.check.toString(),
    })),
    done: chapter.done.toString(),
  };
}

export function chapterRev(chapter, lang) {
  return createHash('sha256').update(stableStringify(chapterPayload(chapter, lang))).digest('hex').slice(0, 12);
}

// --- running the rewritten bundle in-process ---------------------------------

class VerificationError extends Error {}

const isExitSignal = (value) =>
  globalThis.__FtExitSignal !== undefined && value instanceof globalThis.__FtExitSignal;

let rejectionHookInstalled = false;
let currentRun = null; // { recordExit } of the run in flight

function installRejectionHook() {
  if (rejectionHookInstalled) return;
  rejectionHookInstalled = true;
  process.on('unhandledRejection', (reason) => {
    // ExitSignals are always ours: runCli()'s catch handler rethrows a second
    // exit(2) that can surface after the run already resolved on the first
    // signal - swallow it in every case.
    if (isExitSignal(reason)) {
      if (currentRun) currentRun.recordExit(reason.code);
      return;
    }
    throw reason;
  });
}

let importCounter = 0;

// Same contract as the browser worker: seed the vfs + argv globals, import a
// fresh instance of the bundle (unique query string -> fresh module graph, so
// runCli() fires again), capture console output, resolve on the first
// ExitSignal. Returns { output, exitCode, mod }.
async function runBundle(bundleUrl, files, argv) {
  installRejectionHook();

  const vfs = new Map();
  for (const [name, text] of Object.entries(files)) vfs.set('/project/' + name, text);
  globalThis.__ftVfs = vfs;
  const pathname = decodeURIComponent(new URL(bundleUrl).pathname);
  globalThis.__ftArgv = ['node', pathname, '/project', ...argv];

  const output = [];
  let exitCode = null;
  let exitSeen;
  const exited = new Promise((resolve) => {
    exitSeen = resolve;
  });
  currentRun = {
    recordExit(code) {
      if (exitCode === null) exitCode = code;
      exitSeen();
    },
  };

  const realLog = console.log;
  const realError = console.error;
  const capture = (args) => {
    const signal = args.find(isExitSignal);
    if (signal) {
      currentRun.recordExit(signal.code);
      return;
    }
    output.push(args.map(String).join(' '));
  };
  console.log = (...args) => capture(args);
  console.error = (...args) => capture(args);

  try {
    const mod = await import(`${bundleUrl}?run=${++importCounter}`);
    await Promise.race([
      exited,
      new Promise((_, reject) =>
        setTimeout(() => reject(new VerificationError('bundle run timed out')), 10_000).unref(),
      ),
    ]);
    return { output: output.join('\n'), exitCode, mod };
  } finally {
    console.log = realLog;
    console.error = realError;
    currentRun = null;
  }
}

// --- verification ------------------------------------------------------------

function assertThat(condition, chapter, context, detail) {
  if (condition) return;
  throw new VerificationError(
    `chapter "${chapter.id}" failed verification at ${context}: ${detail}`,
  );
}

async function runState(bundleUrl, chapter, lang, state) {
  const files = {
    [chapter.spec.file]: state.spec,
    [chapter.variants[lang].file]: state.code,
  };
  const { output, exitCode, mod } = await runBundle(bundleUrl, files, state.argv);
  const analysis = analyzeBuffers(mod, files, state.argv);
  return {
    output,
    exitCode,
    r: { ...analysis, exitCode, argv: state.argv, spec: state.spec, code: state.code },
  };
}

// Verifies all chapters against the rewritten bundle at `bundlePath` and
// returns { id -> { rev, startOutput, startExit, solvedOutput, solvedExit } }.
export async function verifyChapters(chapters, bundlePath, lang) {
  const bundleUrl = pathToFileURL(bundlePath).href;
  const results = {};
  for (const chapter of chapters) {
    let state = {
      spec: chapter.spec.body,
      code: chapter.variants[lang].body,
      argv: [...chapter.argv],
    };
    const start = await runState(bundleUrl, chapter, lang, state);
    assertThat(
      (start.exitCode === 0) === Boolean(chapter.startsClean),
      chapter,
      'start state',
      `expected startsClean=${Boolean(chapter.startsClean)}, got exit ${start.exitCode}\n--- output ---\n${start.output}`,
    );
    assertThat(
      chapter.done(start.r) === false,
      chapter,
      'start state',
      'the done condition already passes on the seed buffers - the chapter would complete on the first run',
    );

    for (let i = 0; i < chapter.steps.length; i++) {
      state = applyStep(chapter, lang, chapter.steps[i], state);
      assertThat(!state.failed, chapter, `step ${i + 1} patch`, 'the anchor did not match the patched buffers');
      const after = await runState(bundleUrl, chapter, lang, state);
      for (let j = 0; j <= i; j++) {
        assertThat(
          chapter.steps[j].check(after.r) === true,
          chapter,
          `step ${i + 1}`,
          `check of step ${j + 1} does not pass after applying steps 1..${i + 1}\n--- output ---\n${after.output}`,
        );
      }
      if (i === chapter.steps.length - 1) {
        assertThat(
          chapter.done(after.r) === true,
          chapter,
          'solved state',
          `the done condition does not pass after all steps\n--- output ---\n${after.output}`,
        );
        assertThat(
          after.exitCode === 0,
          chapter,
          'solved state',
          `expected exit 0, got ${after.exitCode}\n--- output ---\n${after.output}`,
        );
        results[chapter.id] = {
          rev: chapterRev(chapter, lang),
          startOutput: start.output,
          startExit: start.exitCode,
          solvedOutput: after.output,
          solvedExit: after.exitCode,
        };
      }
    }
  }
  return results;
}
