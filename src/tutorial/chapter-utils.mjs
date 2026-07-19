// Pure helpers shared by the tutorial worker (browser), the /learn/ page script
// (browser) and the build-time chapter verification (Node). No imports, no
// side effects - this module is copied verbatim into dist/learn/.

// Mirrors the CLI's -t/--tags parsing closely enough for the structured
// analysis to match what a run with the same argv reports.
export function parseTags(argv) {
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
// items and problems as plain data. Chapter checks assert on these instead of
// regex-matching terminal text.
export function analyzeBuffers(mod, files, argv) {
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
      description: item.description ?? [],
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

// Apply one step's patch to the buffer state { spec, code, argv }.
// Returns the new state plus `changed` ({ pane, start, end } of the edited
// region, or { pane: 'argv' }); `failed: true` means the anchor did not match
// (the buffers were edited away from what the step expects).
//
// Conventions (see chapters.mjs): anchors are regex sources compiled with 'm';
// insertAfter/append prefix the snippet with '\n' (append onto an empty buffer
// skips the prefix), insertBefore suffixes it, so multi-line snippets and
// blank separator lines are encoded in the snippet. `snippetOverride` replaces
// the static snippet text - the adaptive "solve" path of the auto assist.
export function applyStep(chapter, lang, step, state, snippetOverride) {
  const patch = step.patch;
  if (!patch) return { ...state, changed: null };
  if (patch.op === 'setArgv') {
    return { ...state, argv: [...patch.argv], changed: { pane: 'argv' } };
  }
  const pane = step.pane;
  const pack = pane === 'spec' ? chapter.spec : chapter.variants[lang];
  const text = state[pane];
  const snippet = snippetOverride ?? (patch.snippet === undefined ? '' : pack.snippets[patch.snippet]);
  let start;
  let end;
  let insert;
  if (patch.op === 'append') {
    start = text.length;
    end = text.length;
    insert = text.length === 0 ? snippet : '\n' + snippet;
  } else {
    const anchorKey = patch.anchor ?? step.anchor;
    const anchorSource = pack.anchors[anchorKey];
    if (anchorSource === undefined) return { ...state, changed: null, failed: true };
    const match = new RegExp(anchorSource, 'm').exec(text);
    if (!match) return { ...state, changed: null, failed: true };
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    if (patch.op === 'insertBefore') {
      start = text.lastIndexOf('\n', matchStart - 1) + 1;
      end = start;
      insert = snippet + '\n';
    } else if (patch.op === 'insertAfter') {
      const lineEnd = text.indexOf('\n', matchEnd);
      start = lineEnd === -1 ? text.length : lineEnd;
      end = start;
      insert = '\n' + snippet;
    } else if (patch.op === 'replaceLine') {
      start = text.lastIndexOf('\n', matchStart - 1) + 1;
      const lineEnd = text.indexOf('\n', matchEnd);
      end = lineEnd === -1 ? text.length : lineEnd;
      insert = snippet;
    } else if (patch.op === 'replaceMatch') {
      start = matchStart;
      end = matchEnd;
      insert = snippet;
    } else {
      return { ...state, changed: null, failed: true };
    }
  }
  const next = text.slice(0, start) + insert + text.slice(end);
  return { ...state, [pane]: next, changed: { pane, start, end: start + insert.length } };
}
