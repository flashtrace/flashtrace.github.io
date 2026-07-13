# Proposal: an interactive tutorial tab ("Learn")

Status: **proposal** — nothing here is implemented yet.
Author: prepared with Claude Code, July 2026.

## Summary

Add a third top-level tab next to *Home* and *Docs* — working title **Learn**, served
at `/learn/` — that teaches flashtrace hands-on. The tab is dominated by a large,
*editable* IDE mock in the spirit of the hero mock on the landing page: a Markdown
spec editor on the left, an exemplary source file on the right, and a terminal at
the bottom. The terminal is not a capture: it **executes the real, released
`dist/flashtrace.mjs`** in the browser against the two editor buffers, treated as
temporary in-memory files.

Content is organized into short chapters, each teaching one feature (or a small
set of connected features) of flashtrace. Two assist buttons — **"Help me"** and
**"Do the next step for me"** — explain respectively perform the next step *inside*
the IDE, via anchored popups and (for the second button) a typewriter edit.
Progress is tracked in an explicit per-chapter map in `localStorage`, keyed by
stable chapter ids so that newly inserted chapters are never auto-checked.

A proof of concept for the critical piece — running the unmodified bundle against
an in-memory filesystem — was built and works; see [Appendix A](#appendix-a-proof-of-concept).

## Goals

- Teach the core feature set (items, needs, code tags, revisions, coverage,
  forwarding, tags/filtering) through doing, not reading.
- Run the *real* CLI, at the *same version* the docs on the site are built from,
  so output, exit codes and edge cases are authentic and stay authentic across
  releases without manual re-capturing.
- Keep the site's constraints intact: static hosting, zero runtime dependencies,
  minimal dev dependencies, graceful degradation.

## Non-goals (v1)

- A free-form multi-file playground (the two-pane layout is fixed per chapter;
  a "Playground" could later reuse the same runner).
- Persisting editor buffers across visits (only chapter *completion* persists; a
  buffer-restore feature can come later).
- Syntax highlighting while typing (progressive enhancement, see milestone M4).
- Server-side anything.

## The tab and its layout

`/learn/` becomes a third entry in the top bar (`topBar()` in `src/layout.mjs`
gains one link; `active: 'learn'`). Proposed name **Learn** — short, honest about
the guided nature, and leaves "Playground" free for a future sandbox. Alternatives:
*Tutorial*, *Try it* (see open questions).

The page is a two-column layout, mirroring the docs shell's proportions but with
the IDE where the article would be:

```
┌──────────────────────────────────────────────────────────────────────┐
│ topbar:  flashtrace  v0.7.1   Home  Docs  Learn                 ⌂ ☾  │
├────────────┬─────────────────────────────────────────────────────────┤
│ CHAPTERS   │  ┌─ ide (large, fills the column) ─────────────────────┐│
│            │  │ ● ● ●   ch. 2: cover a requirement    [Reset files] ││
│ ✓ 1 Your   │  ├──────────────────────────┬──────────────────────────┤│
│     first  │  │ spec.md                  │ login.ts                 ││
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
  drawer behavior; each entry shows a completion check from the progress map.
- **IDE mock**: visually derived from the hero's `.ide-mock` (chrome bar with
  dots, pane tabs, terminal bar) but sized to fill the main column — roughly
  the space `.doc-main` + `.toc` occupy on docs pages, with a min-height that
  keeps editors and terminal comfortably usable. The hero mock stays untouched;
  shared styles get extracted into common classes where that falls out naturally.
- **Editors**: two `<textarea>` elements styled like the hero panes (same font,
  padding, colors). Plain textareas are the v1 baseline; a transparent-textarea-
  over-highlighted-`<pre>` overlay (reusing `highlightTokens`) is a later,
  zero-dependency enhancement.
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

- copies `flashtrace/dist/flashtrace.mjs` into `dist/learn/`, rewriting only the
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

## Chapters

Each chapter is defined in `src/learn/chapters.mjs` as data: stable `id`, title,
short intro, the two starting files, the argv, an ordered list of steps, and a
done-condition. Draft curriculum, each mapped to the doc page it teaches:

| # | id | Title | Teaches (docs) |
|---|----|-------|----------------|
| 1 | `first-item` | Your first item | Item anatomy: heading, backtick ID line, description ([Markdown items](/docs/markdown-items/), [Item IDs](/docs/item-ids/)) |
| 2 | `cover-a-need` | Cover a requirement | `Needs:` lists + tagging code comments ([Code tags](/docs/code-tags/)) |
| 3 | `read-the-report` | Read the report | Starts defective on purpose: uncovered + unwanted; fix both ([Command line](/docs/command-line/), exit codes) |
| 4 | `revisions` | Revisions & wildcards | Bump `#1` → `#2`, see the mismatch, accept `#2.x` ([Revisions](/docs/revisions/)) |
| 5 | `deep-coverage` | Demands & deep coverage | `[>>utest:…]` demand tags, transitive chains, shallow vs deep, `-v` ([Coverage rules](/docs/coverage-rules/)) |
| 6 | `forwarding` | Forwarding | `[req:… --> dsn:…]` delegation ([Forwarding](/docs/forwarding/)) |
| 7 | `tags-and-filtering` | Tags & scoped runs | `Tags:` lines and `-t` runs ([Command line](/docs/command-line/)) |

Chapters 2–4 deliberately walk the same login example the hero and landing
examples use, so the site tells one continuous story. Every chapter ends with a
"read more" link into the corresponding docs page.

A **step** is data too:

```js
{
  explain: 'The spec demands an implementation. Tag the login function with a comment holding the ID in brackets.',
  pane: 'code',                       // which editor the step concerns
  anchor: /export function login/,    // where to point the popup (line located at runtime)
  patch: { insertBefore: /export function login/, text: '// [impl:auth/login#1]\n' },
  check: (result) => result.items.some((i) => i.id === 'impl:auth/login#1'),
}
```

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

## Progress tracking in localStorage

One explicit map, versioned, keyed **only by chapter id** — never by index:

```json
// localStorage["ft-learn-progress"]
{
  "v": 1,
  "chapters": {
    "first-item":   { "completedAt": "2026-07-13T14:02:11Z" },
    "cover-a-need": { "completedAt": "2026-07-13T14:09:40Z" }
  }
}
```

Rules:

- An entry is written exactly once per chapter: when its done-condition first
  passes after a real Run **initiated in this browser**. There is no other code
  path that marks completion.
- Rendering asks `progress.chapters[id] !== undefined` per chapter. A chapter id
  absent from the map is *unstarted* — so inserting new chapters between shipped
  ones (or reordering, renaming titles, editing content) can never auto-check
  them. Only deleting/renaming an *id* orphans an entry, and orphans are simply
  ignored (kept, in case the id returns).
- Unparseable/foreign-versioned JSON degrades to "no progress" without crashing,
  matching the theme-toggle's defensive `try/catch` pattern; same for private
  browsing (progress just doesn't persist).
- Using a chapter's assist buttons does not exclude completion — the goal is
  learning, not gatekeeping. (Open question below.)
- A small "reset progress" control lives at the bottom of the chapter rail.

## Implementation plan

New/changed files (all vanilla, no new dependencies):

| File | Purpose |
|---|---|
| `src/learn.mjs` | Page renderer (shell, chapter rail, IDE skeleton, no-JS fallback content) |
| `src/learn/chapters.mjs` | Chapter/step data + done-conditions (build-time verified, embedded into the page as JSON) |
| `src/learn/shims/{fs,path,process,url,child_process}.mjs` | Browser shims, copied into `dist/learn/shims/` |
| `src/scripts/learn.js` | Tab UI: editors, run orchestration, assists, progress map |
| `src/scripts/learn-worker.js` | Worker bootstrap: seed vfs, import bundle, capture output, post results |
| `build.mjs` | Emit `/learn/`, rewrite+copy the bundle, run chapter verification, extend sitemap |
| `src/layout.mjs` | Third top-bar link |
| `src/styles/site.css` | Large-IDE layout, editor/terminal, spotlight/popup, chapter rail states |

Milestones — one branch/PR each, in line with the repo's one-change-per-branch rule:

- **M1 — runner**: build-time bundle rewrite + shims + worker + a bare page with
  two editors and a Run button. Proves the pipeline on the live site.
- **M2 — chapters + progress**: chapter data model, rail, done-conditions,
  localStorage map, build-time chapter verification, no-JS fallback.
- **M3 — assists**: spotlight, popups, "Help me", "Do the next step for me",
  typewriter, reduced-motion handling.
- **M4 — polish**: editor highlight overlay, mobile layout (stacked panes,
  collapsible rail), a11y pass (aria-live terminal output, keyboard flow).

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

## Open questions

1. **Tab name**: *Learn* (recommended) vs *Tutorial* vs *Try it*?
2. Should assisted steps mark a chapter as completed identically, or flag it
   (e.g. "completed with help") in the progress map (schema supports adding a
   field later)?
3. v1 scope: all seven chapters, or ship M1–M3 with chapters 1–3 and grow?
4. Should the right pane's language vary per chapter (e.g. one SQL chapter to
   showcase multi-language tags), or stay TypeScript throughout for continuity?
5. Persist editor buffers per chapter (`ft-learn-buffers`) so a reload keeps
   in-flight work, or is Reset-to-start-state semantics per visit fine?

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
