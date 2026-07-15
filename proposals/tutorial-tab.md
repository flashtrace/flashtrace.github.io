# Proposal: an interactive tutorial tab ("Try it")

Status: **proposal, revision 2** — decisions from maintainer review are folded in
and marked *Decided*; the v1 chapter selection is still open.
Author: prepared with Claude Code, July 2026.

## Summary

Add a third top-level destination — reached via a **mini CTA button** in the top
bar's right-hand action group (next to the GitHub and theme buttons), label along
the lines of **"Try it"** — that teaches flashtrace hands-on. The page is
dominated by a large, *editable* IDE mock in the spirit of the hero mock on the
landing page: a Markdown spec editor on the left, an exemplary JavaScript file on
the right, and a terminal at the bottom. The terminal is not a capture: it
**executes the real, released `dist/flashtrace.mjs`** in the browser against the
two editor buffers, treated as temporary in-memory files.

Content is organized into short chapters, each teaching one feature (or a small
set of connected features) of flashtrace. Two assist buttons — **"Help me"** and
**"Do the next step for me"** — explain respectively perform the next step *inside*
the IDE, via anchored popups and (for the second button) a typewriter edit.
Progress is tracked in an explicit per-chapter map in `localStorage`, keyed by
stable chapter ids so that newly inserted chapters are never auto-checked; each
entry carries detailed metadata (title, a content-hash identity of the chapter
definition, language, assist usage).

A proof of concept for the critical piece — running the unmodified bundle against
an in-memory filesystem — was built and works; see [Appendix A](#appendix-a-proof-of-concept).

## Naming & internal naming (Decided)

The public label ("Try it", "Try Editor", "Try It Out", …) may be swapped at any
time, so nothing internal derives from it:

- **URL**: `/try/` (short, label-agnostic enough; if ever renamed, the old path
  keeps a redirect stub).
- **Code & storage names**: `tutorial` throughout — `src/tutorial.mjs`,
  `src/scripts/tutorial.js`, `localStorage` keys `ft-tutorial-*`. Renaming the
  button never touches code or invalidates stored progress.

## Goals

- Teach the core feature set (items, needs, code tags, revisions, coverage,
  forwarding, tags/filtering) through doing, not reading.
- Run the *real* CLI, at the *same version* the docs on the site are built from,
  so output, exit codes and edge cases are authentic and stay authentic across
  releases without manual re-capturing.
- Keep the site's constraints intact: static hosting, zero runtime dependencies,
  minimal dev dependencies, graceful degradation.
- Structure all chapter content for **multiple code languages** from day one
  (Decided): v1 ships Markdown specs + JavaScript code only, but chapter
  definitions keep every language-specific detail in per-language variant data so
  further languages slot in without touching the engine or the neutral parts.

## Non-goals (v1)

- A free-form multi-file playground (the two-pane layout is fixed per chapter;
  a "Playground" could later reuse the same runner).
- Additional code-pane languages (the data model is ready; content lands later).
- Syntax highlighting while typing (progressive enhancement, see milestone M4).
- Server-side anything.

## Entry point and layout

Instead of a third plain nav link, the top bar's action group gains a small
call-to-action button (Decided) — visually a compact `btn-primary`, sitting left
of the GitHub icon, rendered by `topBar()` in `src/layout.mjs`. On the `/try/`
page itself it renders in an active/current state.

The page is a two-column layout, mirroring the docs shell's proportions but with
the IDE where the article would be:

```
┌──────────────────────────────────────────────────────────────────────┐
│ topbar:  flashtrace  v0.7.1   Home  Docs          [ Try it ]  ⌂  ☾   │
├────────────┬─────────────────────────────────────────────────────────┤
│ CHAPTERS   │  ┌─ ide (large, fills the column) ─────────────────────┐│
│            │  │ ● ● ●   ch. 2: cover a requirement    [Reset files] ││
│ ✓ 1 Your   │  ├──────────────────────────┬──────────────────────────┤│
│     first  │  │ spec.md                  │ login.js                 ││
│     item   │  │ ┌──────────────────────┐ │ ┌──────────────────────┐ ││
│ ▶ 2 Cover  │  │ │## Login              │ │ │export function login│ ││
│     a req. │  │ │                      │ │ │  ...                 │ ││
│   3 Read   │  │ │`req:login#1`   ┌─────┴─┴─┴────────┐             │ ││
│     the    │  │ │                │ Add a Needs: line │  ← popup    │ ││
│     report │  │ │                │ demanding impl:…  │    inside   │ ││
│   4 Rev-   │  │ │                └─────┬─┬─┬────────┘    the IDE  │ ││
│     isions │  │ └──────────────────────┘ │ └──────────────────────┘ ││
│   5 …      │  ├──────────────────────────┴──────────────────────────┤│
│            │  │ terminal                                  [▶ Run]  ││
│  progress  │  │ $ npx flashtrace                                    ││
│  stored    │  │ ✔ req:login#1 … [deep-covered]                      ││
│  locally   │  │ ok                                                  ││
│            │  └─────────────────────────────────────────────────────┘│
│            │   Goal: make the trace pass ─ 2 of 3 steps done         │
│            │   [ Help me ]  [ Do the next step for me ]              │
└────────────┴─────────────────────────────────────────────────────────┘
```

Key points:

- **Chapter rail** (left): reuses the docs sidebar component and its mobile
  drawer behavior; each entry shows a completion check from the progress map,
  with a distinct mark for assisted completions.
- **IDE mock**: visually derived from the hero's `.ide-mock` (chrome bar with
  dots, pane tabs, terminal bar) but sized to fill the main column — roughly
  the space `.doc-main` + `.toc` occupy on docs pages, with a min-height that
  keeps editors and terminal comfortably usable. The hero mock stays untouched;
  shared styles get extracted into common classes where that falls out naturally.
- **Editors**: two `<textarea>` elements styled like the hero panes (same font,
  padding, colors). Left pane is always the Markdown spec; the right pane's file
  name, contents and comment syntax come from the chapter's language variant —
  `js` in v1 (Decided). Plain textareas are the v1 baseline; a
  transparent-textarea-over-highlighted-`<pre>` overlay (reusing
  `highlightTokens`) is a later, zero-dependency enhancement.
- **Terminal**: read-only output area with a **Run** button (and
  <kbd>Ctrl</kbd>+<kbd>Enter</kbd> in either editor). Output is the CLI's plain
  text, colorized with the already-existing `colorizeReport()` from
  `src/examples.mjs`, plus the run's real exit code displayed as `exit 0/1/2`.
  The shown command line (e.g. `$ npx flashtrace -v`) reflects the argv the
  chapter runs with.
- **Assist bar** (below the IDE): chapter goal, step progress, and the two
  assist buttons.

## Executing the real `flashtrace.mjs` in the browser

This is the load-bearing design decision, so it was validated first
([Appendix A](#appendix-a-proof-of-concept)). The facts that make it cheap:

1. `dist/flashtrace.mjs` is a single self-contained ESM file that imports exactly
   five Node built-ins: `node:fs`, `node:path`, `node:process`, `node:url`,
   `node:child_process`.
2. `node:child_process` is used only to invoke git for gitignore-aware file
   collection, and git is probed via `existsSync()` on fixed paths with a
   documented fallback: *"plain directory walk outside a git repository"*. An
   in-memory fs that answers `false` for those paths sends the CLI down the
   fallback — no git emulation needed.
3. The CLI's entire I/O surface is tiny: `fs.promises.{readdir,readFile,stat}`,
   `existsSync`, `realpathSync`, `readFileSync` (the latter only for
   `--version`), pure-string `path` functions, and
   `process.{argv,cwd,exit,env,stdout.isTTY,platform}`.
4. Report coloring is disabled when `stdout.isTTY` is false — so the browser gets
   the plain-text report and reuses the site's existing `colorizeReport()`.
5. The bundle self-detects CLI mode by comparing `argv[1]` against its own
   `import.meta.url` — both sides of that comparison go through shimmable
   functions, so the real `runCli()` path triggers naturally.

### Mechanism

At **build time**, `build.mjs` (which already requires the tool repo clone — CI
checks out the full repo, so `dist/flashtrace.mjs` is guaranteed present next to
the docs it already consumes):

- copies `flashtrace/dist/flashtrace.mjs` into `dist/try/`, rewriting only the
  five `from "node:<name>"` specifiers to `from "./shims/<name>.mjs"` — a fixed,
  anchored regex; every other byte ships verbatim;
- copies five small shim modules (~150 lines total, see Appendix A) providing an
  in-memory fs over a `Map<path, content>`, a posix-only `path`, a fake
  `process`, URL helpers, and a throwing `child_process`;
- **fails the build loudly** if the rewrite doesn't match exactly five specifiers,
  so an upstream bundling change surfaces in CI/deploy, never silently on the site.

At **run time**, clicking Run:

1. spawns a fresh module `Worker` (fresh module graph per run — no state leaks,
   and the HTTP cache makes the re-import free);
2. the worker seeds `globalThis.__ftVfs` with `/project/spec.md` and
   `/project/<code file>` from the two editor buffers ("these two as tmp files"),
   sets the chapter's argv (e.g. `['node', <bundle path>, '/project']`), captures
   `console.log/error`, then dynamically imports the rewritten bundle;
3. `process.exit(code)` in the shim throws an `ExitSignal`; the worker records the
   first signal as the exit code and filters it from output;
4. the worker posts `{ output, exitCode }` back and is terminated. Runs on
   two small files complete in milliseconds; a 5 s watchdog terminates and
   reports a runaway worker just in case.

For **step validation** the worker additionally calls the bundle's *exported*
library surface (`parseMarkdown`, `parseCode`, `analyze` — already public exports)
on the same buffers and posts the structured items/problems. Chapter checks then
assert on real analysis results ("`req:login#1` is deep-covered", "no `unwanted`
problems") instead of regex-matching terminal text.

### Properties this buys

- **Version truth**: `deploy.yml` already rebuilds the site on every flashtrace
  release; the tutorial automatically runs the exact released version whose docs
  are shown, forever, with zero maintenance.
- **Build-time chapter verification**: because the build has Node and the real
  bundle, it runs every chapter's fixture files (start state and after each
  scripted step) through the actual CLI and asserts each expected outcome
  (clean/defective, specific problems). If an upstream release changes behavior
  a chapter relies on, the deploy fails visibly instead of shipping a broken lesson.
  The captured outputs double as the no-JS fallback content.
- **Graceful degradation** (site philosophy): no module-worker support or JS off
  → the tab still renders each chapter read-only with its build-time-captured
  input/output, i.e. exactly the fidelity of today's landing examples.
- **Safety**: the only code ever executed is the first-party, release-pinned
  bundle. User keystrokes are *data* parsed by flashtrace, never evaluated. The
  worker has no DOM and no network use.

## Chapter data model (language-ready, Decided)

Each chapter in `src/tutorial/chapters.mjs` separates language-neutral content
from per-language variants. v1 ships only the `js` variant; adding a language
later means adding one entry per chapter, nothing else:

```js
{
  id: 'cover-a-need',              // stable forever; the progress-map key
  title: 'Cover a requirement',
  intro: '…',
  docs: ['/docs/code-tags/'],
  argv: [],                        // extra CLI args after the directory
  spec: { file: 'spec.md', body: '…' },          // language-neutral (Markdown)
  variants: {
    js: {
      file: 'login.js',
      body: 'export function login(email, password) { … }',
      // language-specific step fragments referenced by key from `steps`
      anchors: { loginFn: /export function login/ },
      snippets: { implTag: '// [impl:auth/login#1]\n' },
    },
    // later: ts, py, sql, … — same keys, different syntax
  },
  steps: [
    {
      explain: 'Tag the login function with a comment holding the ID in brackets.',
      pane: 'code',
      anchor: 'loginFn',                            // resolved via the variant
      patch: { insertBefore: 'loginFn', snippet: 'implTag' },
      check: (r) => r.items.some((i) => i.id === 'impl:auth/login#1'),
    },
    // …
  ],
  done: (r) => r.clean,
}
```

The chapter's **identity hash** is computed at build time: `sha256` over the
canonical JSON of the full chapter definition (including the active variant),
truncated to 12 hex chars and embedded in the page data. Content-derived beats a
hand-maintained semver here: any fix or change — even a typo in a step text —
automatically yields a new identity, with nothing to remember to bump.

The *current* step is always computed, never stored: it is the first step whose
`check` fails against the latest buffers/analysis. That makes assists idempotent
and lets users type ahead, paste solutions, or break earlier steps — the engine
just re-converges.

## "Help me" and "Do the next step for me"

Both buttons operate on the current step:

- **Help me** scrolls the target pane to the anchor, dims the rest of the IDE
  with a spotlight overlay, and shows a popup callout *inside the IDE* — a small
  speech-bubble positioned next to the anchored line (or pane tab / Run button
  when the step targets those) containing `explain` and a "read more" docs link.
  Dismiss via ✕, <kbd>Esc</kbd>, or clicking the backdrop; focus is moved to the
  popup and restored on close (standard dialog semantics).
- **Do the next step for me** shows the same highlight and popup, then applies
  the step's `patch` as a typewriter animation into the real textarea (so undo
  history and the input event pipeline behave normally), then triggers a Run so
  the user immediately sees the effect. With `prefers-reduced-motion`, the patch
  is applied instantly instead of typed.

Popups are plain absolutely-positioned elements within the IDE container — no
library. Anchoring uses a hidden mirror `<pre>` of the textarea content to
resolve a line's y-offset (a well-known, dependency-free technique).

## localStorage: progress and buffers (Decided)

### Progress map — `ft-tutorial-progress`

One explicit map, versioned, keyed **only by chapter id** — never by index.
Entries are detailed records:

```json
{
  "v": 1,
  "chapters": {
    "first-item": {
      "title": "Your first item",
      "rev": "9c41d0aa73b2",
      "lang": "js",
      "completedAt": "2026-07-13T14:02:11Z",
      "assists": { "help": 0, "auto": 0 }
    },
    "cover-a-need": {
      "title": "Cover a requirement",
      "rev": "3f9ab2c4e1d0",
      "lang": "js",
      "completedAt": "2026-07-13T14:09:40Z",
      "assists": { "help": 2, "auto": 1 }
    }
  }
}
```

- `title` — the chapter title at completion time (self-describing data even if
  the chapter is later renamed or removed).
- `rev` — the chapter identity hash the user actually completed (see above), so
  a later content fix or rework is distinguishable from the completed state; the
  UI can e.g. show "chapter updated since you completed it" without unchecking.
- `lang` — the code-pane language the chapter was completed in; when more
  languages exist, per-language completion can extend this record without a
  schema break.
- `assists` — per-chapter counters for "Help me" (`help`) and "Do the next step
  for me" (`auto`). Any non-zero count flags the completion as assisted (Decided)
  and renders a distinct check mark in the rail; the counters keep the full detail.

Rules (unchanged from revision 1):

- An entry is written exactly once per chapter: when its done-condition first
  passes after a real Run initiated in this browser. No other code path marks
  completion.
- A chapter id absent from the map is *unstarted* — inserting, reordering,
  renaming or editing chapters can never auto-check anything. Orphaned entries
  (removed ids) are kept and ignored.
- Unparseable/foreign-versioned JSON degrades to "no progress" without crashing;
  private-browsing failures mean progress simply doesn't persist.
- A small "reset progress" control lives at the bottom of the chapter rail.

### Editor buffers — `ft-tutorial-buffers` (Decided)

In-flight work persists too, saved (debounced) on edit:

```json
{
  "v": 1,
  "chapters": {
    "cover-a-need": {
      "rev": "3f9ab2c4e1d0",
      "lang": "js",
      "savedAt": "2026-07-13T14:05:02Z",
      "spec": "## Login…",
      "code": "export function login…"
    }
  }
}
```

Opening a chapter whose stored buffers differ from the chapter's start state
shows a **modal**: *"You have work in progress from &lt;relative time&gt; — resume it,
or start fresh?"* with [Resume] / [Start fresh] (start-fresh discards the stored
buffers). If the stored `rev` differs from the current chapter identity, the
modal says so ("this chapter has been updated since") — resuming is still
offered, since buffers are just text. Completing a chapter clears its buffer
entry; buffers of completed chapters are not retained.

## Chapters — candidate curriculum (selection pending)

All chapters use the continuous login/auth story the hero and landing examples
already tell. Candidates, grouped; the v1 set is being selected by the
maintainer:

**Foundations**

| # | id | Title | Teaches (docs) |
|---|----|-------|----------------|
| 1 | `first-item` | Your first item | Item anatomy: heading, backtick ID line, description ([Markdown items](/docs/markdown-items/), [Item IDs](/docs/item-ids/)) |
| 2 | `cover-a-need` | Cover a requirement | `Needs:` lists + tagging code comments ([Code tags](/docs/code-tags/)) |
| 3 | `read-the-report` | Read the report | Starts defective on purpose: uncovered + unwanted; fix both; exit codes ([Command line](/docs/command-line/)) |
| 4 | `covers-and-orphans` | Covers: & orphans | Coverage declared from the covering side; the orphaned defect; Covers is only valid if the target Needs it back ([Markdown items](/docs/markdown-items/), [Coverage rules](/docs/coverage-rules/)) |

**Features**

| # | id | Title | Teaches (docs) |
|---|----|-------|----------------|
| 5 | `revisions` | Revisions & wildcards | Bump `#1` → `#2`, see the mismatch hint, accept `#2.x` ([Revisions](/docs/revisions/)) |
| 6 | `deep-coverage` | Demands & deep coverage | `[>>utest:…]` demand tags, transitive chains, shallow vs deep, `-v` ([Coverage rules](/docs/coverage-rules/)) |
| 7 | `forwarding` | Forwarding | `[req:… --> dsn:…]` delegation ([Forwarding](/docs/forwarding/)) |
| 8 | `tags-and-filtering` | Tags & scoped runs | `Tags:` lines and `-t` runs; first chapter where the user changes the command, not the files ([Command line](/docs/command-line/)) |

**Extras**

| # | id | Title | Teaches |
|---|----|-------|---------|
| 9 | `capstone` | Fix a messy trace | No new syntax; one of each defect class (uncovered, unwanted, orphaned, duplicate, parse-level problem) to fix with everything learned |
| 10 | `keyword-tables` | Needs/Covers from tables | Bullet-list keywords and table columns headed `Needs`/`Covers`/`Tags` |
| 11 | `anchored-demands` | Anchored demand tags | Explicit `[<source-id> >> <target-id>]` vs the implicit nearest-preceding form |

Every chapter ends with a "read more" link into the corresponding docs page.

## Implementation plan

New/changed files (all vanilla, no new dependencies):

| File | Purpose |
|---|---|
| `src/tutorial.mjs` | Page renderer (shell, chapter rail, IDE skeleton, no-JS fallback content) |
| `src/tutorial/chapters.mjs` | Chapter/step data with language variants + done-conditions (build-time verified, embedded into the page as JSON together with the computed identity hashes) |
| `src/tutorial/shims/{fs,path,process,url,child_process}.mjs` | Browser shims, copied into `dist/try/shims/` |
| `src/scripts/tutorial.js` | Tab UI: editors, run orchestration, assists, progress map, buffer persistence + resume modal |
| `src/scripts/tutorial-worker.js` | Worker bootstrap: seed vfs, import bundle, capture output, post results |
| `build.mjs` | Emit `/try/`, rewrite+copy the bundle, compute chapter hashes, run chapter verification, extend sitemap |
| `src/layout.mjs` | CTA button in the top bar's action group |
| `src/styles/site.css` | Large-IDE layout, editor/terminal, spotlight/popup, modal, chapter rail states |

Milestones — one branch/PR each, in line with the repo's one-change-per-branch rule:

- **M1 — runner**: build-time bundle rewrite + shims + worker + a bare page with
  two editors and a Run button. Proves the pipeline on the live site.
- **M2 — chapters + persistence**: chapter data model with variants and identity
  hashes, rail, done-conditions, progress map with assist flags, buffer
  persistence with the resume/start-fresh modal, build-time chapter
  verification, no-JS fallback.
- **M3 — assists**: spotlight, popups, "Help me", "Do the next step for me",
  typewriter, reduced-motion handling, assist counters feeding the progress map.
- **M4 — polish**: editor highlight overlay, mobile layout (stacked panes,
  collapsible rail), a11y pass (aria-live terminal output, keyboard flow,
  modal focus trap).

## Risks & mitigations

- **Upstream bundle drift** (new built-in import, changed entry detection): the
  five-specifier rewrite asserts its match count and the chapter fixtures run at
  build time — both fail CI/deploy loudly. Worst case the tab ships its no-JS
  fallback while a fix lands.
- **Browser support**: module workers + dynamic import are baseline in all
  evergreen browsers; anything older gets the read-only fallback via feature
  detection.
- **Textarea UX limits** (no per-line decorations while typing): acceptable for
  v1; the overlay technique in M4 upgrades it without dependencies.
- **Popup positioning across zoom/mobile**: anchors degrade to pane-level
  (attach to the pane tab) below a width threshold.
- **Chapter identity churn**: because `rev` is content-derived, *any* edit marks
  completed chapters as "updated since". That is intended (honest data); the UI
  treats it as an annotation, never as un-completion.

## Decision log

1. ~~Tab name/placement~~ → **mini CTA button** top-right in the navbar next to
   theme/GitHub; label ("Try it" / "Try Editor" / …) swappable later; internal
   names decoupled (`/try/` URL, `tutorial` code/storage names).
2. ~~Assisted completions~~ → **flagged**, with per-chapter `help`/`auto`
   counters; progress entries carry detailed data including title and a
   content-hash chapter identity (`rev`).
3. **v1 chapter scope** → open, selection from the candidate curriculum above.
4. ~~Languages~~ → Markdown spec + **JavaScript** code in v1; all
   language-specific content lives in per-chapter `variants` so more languages
   are additive.
5. ~~Buffer persistence~~ → **yes**, per chapter in `ft-tutorial-buffers`, with a
   resume-or-start-fresh **modal** when returning to a chapter in progress.

---

## Appendix A: proof of concept

Executed against the pinned clone at flashtrace **v0.7.1**, simulating the
browser constraint in Node: the bundle's five `node:*` specifiers were rewritten
to shim modules, and the rewritten file was imported with a seeded in-memory vfs
(`/project/spec.md`, `/project/login.ts` — the landing page's "uncovered defect"
example) and argv `['node', <bundle>, '/project']`. Result — byte-identical to
the CLI on disk, with the correct exit code:

```
✘ test:auth/login#1  login.ts:6
    • unwanted: no item needs test:auth/login#1

✘ req:auth/login#1 "Login requirement"  spec.md:3
    • uncovered: needs test:auth/login#2, which does not exist (revision mismatch: existing revision(s) of test:auth/login: 1)

Summary
  items       3  (1 from markdown, 2 from code)
  ok          1
  defective   2

not ok

--- real flashtrace.mjs ran in-memory, exit code 1 ---
```

The complete fs shim that made this work (the other four are smaller):

```js
// shims/fs.mjs — node:fs over Map<absolutePath, content> in globalThis.__ftVfs
const vfs = () => globalThis.__ftVfs ?? new Map();
const norm = (p) => (p === '/' ? '/' : String(p).replace(/\/+$/, ''));
const isDir = (p) => p === '/' || [...vfs().keys()].some((f) => f.startsWith(norm(p) + '/'));

export const realpathSync = norm;
export const existsSync = (p) => vfs().has(norm(p)) || isDir(p);
export function readFileSync(p) {
  if (!vfs().has(norm(p))) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  return vfs().get(norm(p));
}
export const promises = {
  async readFile(p) { return readFileSync(p); },
  async readdir(p, opts) {
    const prefix = norm(p) === '/' ? '/' : norm(p) + '/';
    const names = new Map();
    for (const f of vfs().keys()) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      names.set(rest.split('/')[0], !rest.includes('/'));
    }
    const entries = [...names].map(([name, file]) => ({ name, isFile: () => file, isDirectory: () => !file }));
    return opts?.withFileTypes ? entries : entries.map((e) => e.name);
  },
  async stat(p) {
    if (vfs().has(norm(p))) return { isFile: () => true, isDirectory: () => false };
    if (isDir(p)) return { isFile: () => false, isDirectory: () => true };
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  },
};
export default { realpathSync, existsSync, readFileSync, promises };
```

`process.exit()` is shimmed to throw an `ExitSignal(code)`; the runner records
the first signal as the exit code and filters signals out of the captured
`console.error` stream. `child_process.execFileSync` throws unconditionally and
is never reached, because `findGit()`'s `existsSync` probes answer `false` and
flashtrace takes its documented no-git directory walk.
