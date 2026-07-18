// The tutorial curriculum: 11 chapters continuing the login/auth story of the
// landing page. Ids are stable forever (they key the progress map); order is
// the curriculum order. Content semantics must match the tool repo's docs -
// the build runs every chapter state through the real CLI and fails on drift.
//
// Serialization rules (the definitions travel to the browser as JSON and feed
// the build-time identity hash):
// - `anchors` hold regex *sources* (compiled with the 'm' flag at use time)
// - `check`/`done` are pure self-contained arrows over the run result
//   `r = { items, problems, clean, exitCode, argv, files, spec, code }`; they
//   are shipped as their source text, so they must not close over anything.
//   In the browser `spec`/`code` join all files of the respective pane, so
//   text-based checks keep passing when users spread work over added files
// - `patch` ops: insertBefore | insertAfter | replaceLine | replaceMatch
//   (anchor + snippet key), append (snippet key), setArgv (argv array);
//   insertAfter/append prefix the snippet with '\n', so a snippet with its
//   own leading '\n' produces a blank separator line
// - language-specifics live in `variants` (v1: js); `spec` is neutral
// - `locked: true` disables file management (add/delete tabs) for the chapter;
//   its steps then always run against exactly the seeded file pair
// - `noCode: true` hides the code pane; the variant then only seeds a hidden
//   empty file so the pane model and the run inputs keep their usual shape
// - a step with `run: true` (patch: null, pane: 'argv') asks the user to press
//   Run: it only counts once a real, user-triggered run happened while every
//   step before it passed - background silent runs never clear it
// - a step's optional `solve` (serialized like `check`) maps the latest run
//   result to the snippet text "Do this step for me" should type, adapting
//   the static example to names the user chose; null falls back to the snippet

export const chapters = [
  // ------------------------------------------------------------ foundations
  {
    id: 'first-item',
    title: 'Your first item',
    group: 'Foundations',
    locked: true,
    noCode: true,
    intro:
      'flashtrace reads ordinary Markdown. An item is born on a line holding nothing but its ID in backticks - the heading above becomes its title, any paragraph below its description. The file is empty and there is no code yet: invent your own first item and watch the tracer pick it up.',
    goal: 'Create one traceable item of your own: any heading, any ID.',
    docs: [
      { label: 'Markdown items', href: '/docs/markdown-items/' },
      { label: 'Item IDs', href: '/docs/item-ids/' },
    ],
    argv: [],
    startsClean: true,
    spec: {
      file: 'spec.md',
      body: '',
      anchors: {},
      snippets: {
        heading: '## Login requirement',
        idLine: '\n\`req:auth/login#1\`',
      },
    },
    variants: {
      js: {
        file: 'login.js',
        body: '',
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Write a heading',
        explain:
          'Give your item a title: any Markdown heading you like, say "## Login requirement". On its own it is not an item yet - but the heading directly above an ID line becomes that item\'s title.',
        pane: 'spec',
        anchor: null,
        patch: { op: 'append', snippet: 'heading' },
        check: (r) => /^#{1,6} \S/m.test(r.spec),
      },
      {
        title: 'Lay down an ID line',
        explain:
          'Now the item itself: below the heading, a line containing nothing but an ID of your choice in backticks. The format is type:name#revision - `req:auth/login#1`, for example. Run it - the summary jumps from 0 items to 1, titled by your heading.',
        pane: 'spec',
        anchor: null,
        patch: { op: 'append', snippet: 'idLine' },
        check: (r) => r.items.some((i) => Boolean(i.title)),
      },
    ],
    done: (r) => r.clean && r.items.some((i) => Boolean(i.title)),
  },

  {
    id: 'cover-a-need',
    title: 'Cover a requirement',
    group: 'Foundations',
    locked: true,
    intro:
      'An item without Needs asks for nothing - the trace stays green but toothless. Demand an implementation with a Needs: list - the name of the needed item is yours to pick - watch the run go red, then satisfy it with a tag in an ordinary code comment.',
    goal: 'Make req:auth/login#1 demand an implementation, then provide it.',
    docs: [
      { label: 'Markdown items', href: '/docs/markdown-items/' },
      { label: 'Code tags', href: '/docs/code-tags/' },
    ],
    argv: [],
    startsClean: true,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.`,
      anchors: {
        description: '^Users must be able to log in with email and password\\.$',
      },
      snippets: {
        needsLine: '\nNeeds: impl:auth/login#1',
      },
    },
    variants: {
      js: {
        file: 'login.js',
        body: `export function login(email, password) {
  return session.open(email, password);
}`,
        anchors: {
          loginFn: '^export function login',
        },
        snippets: {
          implTag: '// [impl:auth/login#1]',
        },
      },
    },
    steps: [
      {
        title: 'Demand an implementation',
        explain:
          'Add a Needs: line below the description naming an implementation item - call it what you like, "Needs: impl:auth/login#1" for instance. Run it: the requirement turns defective - uncovered - because nothing defines that ID yet. That red is the whole point of tracing.',
        pane: 'spec',
        anchor: 'description',
        patch: { op: 'insertAfter', snippet: 'needsLine' },
        check: (r) => r.items.some((i) => i.id === 'req:auth/login#1' && i.needs.length > 0),
      },
      {
        title: 'Cover it from the code',
        explain:
          'Cover it from the code: put a comment holding the needed ID in square brackets - like "// [impl:auth/login#1]" - directly above the login function. A tag in a comment defines the item that satisfies the need.',
        pane: 'code',
        anchor: 'loginFn',
        patch: { op: 'insertBefore', snippet: 'implTag' },
        solve: (r) => {
          const q = r.items.find((i) => i.id === 'req:auth/login#1');
          return q && q.needs.length > 0 ? '// [' + q.needs[0] + ']' : null;
        },
        check: (r) => {
          const q = r.items.find((i) => i.id === 'req:auth/login#1');
          return (
            q !== undefined &&
            q.needs.length > 0 &&
            q.needs.every((n) => r.items.some((i) => i.id === n && i.origin === 'code'))
          );
        },
      },
    ],
    done: (r) => {
      const q = r.items.find((i) => i.id === 'req:auth/login#1');
      return (
        r.clean &&
        q !== undefined &&
        q.needs.length > 0 &&
        q.needs.every((n) => r.items.some((i) => i.id === n && i.origin === 'code'))
      );
    },
  },

  {
    id: 'read-the-report',
    title: 'Read the report',
    group: 'Foundations',
    locked: true,
    intro:
      'This trace is broken on purpose. Each defective item gets one ✘ block: its ID, location and defect bullets. Two of the three blocks here share a single root cause - a typo - and the run exits 1 until everything is fixed. Read first, then fix.',
    goal: 'Clear all three defect blocks and bring the exit code to 0.',
    docs: [{ label: 'Command line', href: '/docs/command-line/' }],
    argv: [],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Logout requirement

\`req:auth/logout#1\`

A signed-in user can end their session on every device.

Needs: impl:auth/logout#1`,
      anchors: {
        needsLine: '^Needs: impl:auth/logout#1$',
      },
      snippets: {
        needsBoth: 'Needs: impl:auth/logout#1, impl:auth/session#1',
      },
    },
    variants: {
      js: {
        file: 'logout.js',
        body: `// [impl:auth/logut#1]
export function logout(session) {
  return session.close();
}

// [impl:auth/session#1]
export function endAllSessions(user) {
  return sessions.of(user).closeAll();
}`,
        anchors: {
          typoTag: 'impl:auth/logut#1',
        },
        snippets: {
          fixedId: 'impl:auth/logout#1',
        },
      },
    },
    steps: [
      {
        title: 'Run the trace',
        explain:
          'Press ▶ Run and read the report before touching anything. Each defective item gets one ✘ block: its ID, its location and one bullet per defect. Three blocks come back - and two of them mirror each other.',
        pane: 'argv',
        run: true,
        anchor: null,
        patch: null,
        check: (r) => r.exitCode !== null,
      },
      {
        title: 'Fix the typo in the code tag',
        explain:
          'The report pairs an "uncovered: needs impl:auth/logout#1" with an "unwanted: no item needs impl:auth/logut#1" - spot the missing letter. Fix the typo in the code tag and both blocks disappear together.',
        pane: 'code',
        anchor: 'typoTag',
        patch: { op: 'replaceMatch', anchor: 'typoTag', snippet: 'fixedId' },
        check: (r) =>
          r.items.some((i) => i.id === 'impl:auth/logout#1') && !r.items.some((i) => i.id === 'impl:auth/logut#1'),
      },
      {
        title: 'Extend the Needs list',
        explain:
          'impl:auth/session#1 is still unwanted: it exists, but no item needs it. Coverage nobody asked for is a defect too. Extend the Needs list so the requirement demands it.',
        pane: 'spec',
        anchor: 'needsLine',
        patch: { op: 'replaceLine', anchor: 'needsLine', snippet: 'needsBoth' },
        check: (r) => {
          const s = r.items.find((i) => i.id === 'impl:auth/session#1');
          return s !== undefined && s.defects.length === 0;
        },
      },
    ],
    done: (r) => r.clean && r.exitCode === 0,
  },

  {
    id: 'covers-and-orphans',
    title: 'Covers: & unwanted',
    group: 'Foundations',
    locked: true,
    intro:
      'Coverage can also be declared from the covering side: a Covers: entry names the item this one covers. Declaring it is only half the deal, though - the entry counts once the target asks for the coverer in its own Needs. Wire the login requirement to the auth feature and close that loop.',
    goal: 'Make req:auth/login#1 validly cover the auth feature.',
    docs: [
      { label: 'Markdown items', href: '/docs/markdown-items/' },
      { label: 'Coverage rules', href: '/docs/coverage-rules/' },
    ],
    argv: [],
    startsClean: true,
    spec: {
      file: 'spec.md',
      body: `## Auth feature

\`feat:auth#1\`

Everything a user needs to prove who they are.

## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.`,
      anchors: {
        loginDescription: '^Users must be able to log in with email and password\\.$',
        featDescription: '^Everything a user needs to prove who they are\\.$',
      },
      snippets: {
        coversLine: '\nCovers: feat:auth#1',
        featNeeds: '\nNeeds: req:auth/login#1',
      },
    },
    variants: {
      js: {
        file: 'login.js',
        body: `export function login(email, password) {
  return session.open(email, password);
}`,
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Write a Covers: entry',
        explain:
          'Below the login description, add "Covers: feat:auth#1" - the requirement now claims to cover the feature above it.',
        pane: 'spec',
        anchor: 'loginDescription',
        patch: { op: 'insertAfter', snippet: 'coversLine' },
        check: (r) => {
          const q = r.items.find((i) => i.id === 'req:auth/login#1');
          return q !== undefined && q.covers.includes('feat:auth#1');
        },
      },
      {
        title: 'Run the trace',
        explain:
          'Run it: the Covers entry comes back unwanted - feat:auth#1 exists, but it never asked for this coverage. (Pointing at an ID that does not exist at all would be an orphaned entry instead.) One side declaring is not enough.',
        pane: 'argv',
        run: true,
        anchor: null,
        patch: null,
        check: (r) => r.exitCode !== null,
      },
      {
        title: 'Close the loop',
        explain:
          'A Covers entry is only valid when the target lists the coverer in its own Needs. Add "Needs: req:auth/login#1" below the feature\'s description - run again and the loop closes.',
        pane: 'spec',
        anchor: 'featDescription',
        patch: { op: 'insertAfter', snippet: 'featNeeds' },
        check: (r) => {
          const f = r.items.find((i) => i.id === 'feat:auth#1');
          return f !== undefined && f.needs.includes('req:auth/login#1');
        },
      },
    ],
    done: (r) =>
      r.clean &&
      r.items.some((i) => i.id === 'feat:auth#1' && i.needs.includes('req:auth/login#1')) &&
      r.items.some((i) => i.id === 'req:auth/login#1' && i.covers.includes('feat:auth#1')),
  },

  // --------------------------------------------------------------- features
  {
    id: 'revisions',
    title: 'Revisions & wildcards',
    group: 'Features',
    intro:
      'The #revision is part of an item\'s identity, and matching is exact - 2 never resolves to 2.1. The login implementation was reworked for one-time codes and bumped to #2.1, so the spec\'s reference went stale. Chase it, then learn when to stop chasing.',
    goal: 'Re-cover the requirement against the reworked implementation.',
    docs: [{ label: 'Revisions', href: '/docs/revisions/' }],
    argv: [],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password,
now with an optional one-time code.

Needs: impl:auth/login#1`,
      anchors: {
        needRef: 'impl:auth/login#1',
        needRefRev2: 'impl:auth/login#2$',
      },
      snippets: {
        needRev2: 'impl:auth/login#2',
        needWildcard: 'impl:auth/login#2.x',
      },
    },
    variants: {
      js: {
        file: 'login.js',
        body: `// [impl:auth/login#2.1]
export function login(email, password, oneTimeCode) {
  return session.open(email, password, { oneTimeCode });
}`,
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Chase the revision',
        explain:
          'The report hints: "revision mismatch: existing revision(s) of impl:auth/login: 2.1". Bump the need to #2 and run again - still uncovered! 2 and 2.1 are different identities; matching never loosens by itself.',
        pane: 'spec',
        anchor: 'needRef',
        patch: { op: 'replaceMatch', anchor: 'needRef', snippet: 'needRev2' },
        check: (r) =>
          r.items.some(
            (i) =>
              i.id === 'req:auth/login#1' &&
              !i.needs.includes('impl:auth/login#1') &&
              i.needs.some((n) => n.startsWith('impl:auth/login#2')),
          ),
      },
      {
        title: 'Opt into a wildcard',
        explain:
          'When you genuinely mean "any 2.x rework", opt in explicitly with a wildcard: impl:auth/login#2.x accepts 2.0, 2.1, 2.99 - but never 2 or 2.1.3, since a wildcard keeps the layer count.',
        pane: 'spec',
        anchor: 'needRefRev2',
        patch: { op: 'replaceMatch', anchor: 'needRefRev2', snippet: 'needWildcard' },
        check: (r) =>
          r.clean && r.items.some((i) => i.id === 'req:auth/login#1' && i.needs.includes('impl:auth/login#2.x')),
      },
    ],
    done: (r) =>
      r.clean &&
      r.exitCode === 0 &&
      r.items.some((i) => i.id === 'req:auth/login#1' && i.needs.includes('impl:auth/login#2.x')),
  },

  {
    id: 'deep-coverage',
    title: 'Demands & deep coverage',
    group: 'Features',
    intro:
      'Code can demand coverage too: a [>>utest:...] tag attaches a need to the nearest preceding item tag. The chain req → impl → test is traced transitively - this run uses -v, so every item shows its status: ✔ deep-covered, ~ shallow (a dependency further down is broken), ✘ defective.',
    goal: 'Complete the chain so every item shows ✔ deep-covered.',
    docs: [{ label: 'Coverage rules', href: '/docs/coverage-rules/' }],
    argv: ['-v'],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.

Needs: impl:auth/login#1`,
      anchors: {},
      snippets: {},
    },
    variants: {
      js: {
        file: 'login.js',
        body: `// [impl:auth/login#1]
// [>>utest:auth/login#1]
export function login(email, password) {
  return session.open(email, password);
}`,
        anchors: {
          testFn: '^test\\(',
        },
        snippets: {
          testCode: `\ntest('login opens a session', () => {
  expect(login('ada@example.com', 'pw')).toBeTruthy();
});`,
          utestTag: '// [utest:auth/login#1]',
        },
      },
    },
    steps: [
      {
        title: 'Write the test',
        explain:
          'The demand tag makes the implementation uncovered, which leaves the requirement at ~ shallow-covered: its own need is met, but the chain below is broken. Write the test - then run it. Still not ok: code alone means nothing to the tracer.',
        pane: 'code',
        anchor: null,
        patch: { op: 'append', snippet: 'testCode' },
        check: (r) => /test\(/.test(r.code),
      },
      {
        title: 'Tag the test',
        explain:
          'Only the tag counts: put "// [utest:auth/login#1]" above the test. It defines the demanded item, the chain closes, and every mark flips to ✔ deep-covered.',
        pane: 'code',
        anchor: 'testFn',
        patch: { op: 'insertBefore', snippet: 'utestTag' },
        check: (r) => r.items.some((i) => i.id === 'utest:auth/login#1'),
      },
    ],
    done: (r) =>
      r.clean && r.items.some((i) => i.id === 'utest:auth/login#1') && r.items.every((i) => i.deepCovered),
  },

  {
    id: 'forwarding',
    title: 'Forwarding',
    group: 'Features',
    intro:
      'Sometimes a requirement should not name an implementation itself - the details belong to a design. A forwarding tag [source --> target] delegates the coverage obligation: the source is covered exactly as deeply as its target. The -v report draws the delegation as a → edge.',
    goal: 'Delegate req:login#1 to the auth design instead of a dead-end need.',
    docs: [{ label: 'Forwarding', href: '/docs/forwarding/' }],
    argv: ['-v'],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Login

\`req:login#1\`

Login is specified in detail by the auth design.

Needs: impl:login#1

## Auth design

\`dsn:auth#2\`

Sessions are opened through the central auth service.

Needs: impl:auth#1`,
      anchors: {
        deadEndNeeds: '^Needs: impl:login#1$',
      },
      snippets: {
        forwardTag: '\`[req:login#1 --> dsn:auth#2]\`',
      },
    },
    variants: {
      js: {
        file: 'auth.js',
        body: `// [impl:auth#1]
export function openSession(token) {
  return sessions.issue(token);
}`,
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Delegate to the design',
        explain:
          'There is no impl:login#1 and there never will be - the auth design owns the details. Replace the Needs line with the forwarding tag [req:login#1 --> dsn:auth#2]: the requirement now follows the design\'s coverage, shown as a → edge in the report.',
        pane: 'spec',
        anchor: 'deadEndNeeds',
        patch: { op: 'replaceLine', anchor: 'deadEndNeeds', snippet: 'forwardTag' },
        check: (r) => {
          const q = r.items.find((i) => i.id === 'req:login#1');
          return q !== undefined && Boolean(q.forwardsTo);
        },
      },
    ],
    done: (r) => r.clean && r.items.some((i) => i.id === 'req:login#1' && Boolean(i.forwardsTo) && i.deepCovered),
  },

  {
    id: 'tags-and-filtering',
    title: 'Tags & scoped runs',
    group: 'Features',
    intro:
      'Tags: lines group items, and -t scopes a run to matching Markdown items - code items always come along. The reporting requirement fails here only because its code lives in another repository slice. This time you fix the command, not the files.',
    goal: 'Scope the run to the auth work so the trace of this slice is clean.',
    docs: [{ label: 'Command line', href: '/docs/command-line/' }],
    argv: [],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.

Needs: impl:auth/login#1

Tags: auth

## Weekly report

\`req:report/weekly#1\`

Ops can inspect weekly usage numbers.

Needs: impl:report/weekly#1

Tags: reporting`,
      anchors: {},
      snippets: {},
    },
    variants: {
      js: {
        file: 'login.js',
        body: `// [impl:auth/login#1]
export function login(email, password) {
  return session.open(email, password);
}`,
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Scope the run with -t',
        explain:
          'Add "-t auth" to the command line in the terminal bar: only Markdown items tagged auth are imported, the reporting item stays out, and this slice traces clean. (Add "_" to a -t list to also include untagged items.)',
        pane: 'argv',
        anchor: null,
        patch: { op: 'setArgv', argv: ['-t', 'auth'] },
        check: (r) =>
          r.items.some((i) => i.id === 'req:auth/login#1') && !r.items.some((i) => i.id === 'req:report/weekly#1'),
      },
    ],
    done: (r) =>
      r.clean &&
      r.items.some((i) => i.id === 'req:auth/login#1') &&
      !r.items.some((i) => i.id === 'req:report/weekly#1'),
  },

  // ----------------------------------------------------------------- extras
  {
    id: 'capstone',
    title: 'Fix a messy trace',
    group: 'Extras',
    intro:
      'No new syntax - one messy trace. This project shows every defect class at once: a parse-level problem, a revision mismatch, an orphaned Covers, a duplicated ID and a missing test. Work top to bottom through the report with everything you have learned.',
    goal: 'Take the trace from five findings to a clean exit 0.',
    docs: [{ label: 'Coverage rules', href: '/docs/coverage-rules/' }],
    argv: [],
    startsClean: false,
    spec: {
      file: 'spec.md',
      body: `## Auth feature

\`feat:auth#1\`

Everything a user needs to prove who they are.

Needs: req:auth/login#1

## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.

Needs: impl:auth/login#1, utest:auth/login#1

Covers: feat:auth#2

## Session limit

\`req:auth/session-limit#1\`

A user may hold at most five concurrent sessions.

Needs: impl:auth/sessions#1

## Session limit (copy)

\`req:auth/session-limit#1\`

Left behind by a merge - the tracer sees the ID twice.`,
      anchors: {
        coversLine: '^Covers: feat:auth#2$',
        duplicateBlock:
          '\\n\\n## Session limit \\(copy\\)\\n\\n\`req:auth/session-limit#1\`\\n\\nLeft behind by a merge - the tracer sees the ID twice\\.$',
      },
      snippets: {
        coversFixed: 'Covers: feat:auth#1',
        nothing: '',
      },
    },
    variants: {
      js: {
        file: 'auth.js',
        body: `// [>>utest:auth/sessions#1]
// TODO: session tests still need an owner

// [impl:auth/login#1]
export function login(email, password) {
  return session.open(email, password);
}

// [impl:auth/sessions#2]
export function limitSessions(user) {
  return sessions.of(user).cap(5);
}`,
        anchors: {
          strayDemand: '^// \\[>>utest:auth/sessions#1\\]\\n// TODO: session tests still need an owner\\n\\n',
          wrongSessionsRev: 'impl:auth/sessions#2',
        },
        snippets: {
          nothing: '',
          sessionsFixed: 'impl:auth/sessions#1',
          loginTest: `\n// [utest:auth/login#1]
test('login opens a session', () => {
  expect(login('ada@example.com', 'pw')).toBeTruthy();
});`,
        },
      },
    },
    steps: [
      {
        title: 'Drop the stray demand',
        explain:
          'Start with the problem: a [>>...] demand tag with no item tag anywhere above it is an error - it has nothing to attach to. This stray TODO block has to go.',
        pane: 'code',
        anchor: 'strayDemand',
        patch: { op: 'replaceMatch', anchor: 'strayDemand', snippet: 'nothing' },
        check: (r) => r.problems.length === 0,
      },
      {
        title: 'Fix the sessions revision',
        explain:
          'The session-limit requirement needs impl:auth/sessions#1, but the code tag says #2 - and #2 is unwanted on top. The spec is right here; fix the code tag\'s revision.',
        pane: 'code',
        anchor: 'wrongSessionsRev',
        patch: { op: 'replaceMatch', anchor: 'wrongSessionsRev', snippet: 'sessionsFixed' },
        check: (r) => r.items.some((i) => i.id === 'impl:auth/sessions#1'),
      },
      {
        title: 'Repair the Covers entry',
        explain: 'An old friend: the Covers entry names feat:auth#2, but the feature lives at revision 1.',
        pane: 'spec',
        anchor: 'coversLine',
        patch: { op: 'replaceLine', anchor: 'coversLine', snippet: 'coversFixed' },
        check: (r) => r.items.every((i) => i.defects.every((d) => !d.startsWith('orphaned'))),
      },
      {
        title: 'Delete the duplicate item',
        explain:
          'req:auth/session-limit#1 is defined twice - every full ID must be unique. Delete the leftover copy at the bottom of the spec.',
        pane: 'spec',
        anchor: 'duplicateBlock',
        patch: { op: 'replaceMatch', anchor: 'duplicateBlock', snippet: 'nothing' },
        check: (r) => r.items.every((i) => i.defects.every((d) => !d.startsWith('duplicate'))),
      },
      {
        title: 'Write the login test',
        explain: 'One uncovered need left: the login test. You wrote this one in the deep-coverage chapter.',
        pane: 'code',
        anchor: null,
        patch: { op: 'append', snippet: 'loginTest' },
        check: (r) => r.items.some((i) => i.id === 'utest:auth/login#1'),
      },
    ],
    done: (r) => r.clean && r.exitCode === 0,
  },

  {
    id: 'keyword-tables',
    title: 'Needs & Covers from tables',
    group: 'Extras',
    intro:
      'Keyword lists do not have to be one-liners: a Needs:/Covers:/Tags: keyword also accepts a bullet list on the following lines, and a table column headed by the bare keyword contributes each row\'s cell. The trace stays identical - only the Markdown gets friendlier.',
    goal: 'Restructure the spec with a bullet list and a keyword table - staying green.',
    docs: [{ label: 'Markdown items', href: '/docs/markdown-items/' }],
    argv: [],
    startsClean: true,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.

Needs: impl:auth/login#1, utest:auth/login#1`,
      anchors: {
        needsInline: '^Needs: impl:auth/login#1, utest:auth/login#1$',
      },
      snippets: {
        needsBullets: `Needs:
- impl:auth/login#1
- utest:auth/login#1`,
        tableItem: `\n## Auth deliverables

\`feat:auth#1\`

| Deliverable | Needs            | Tags |
|-------------|------------------|------|
| Login       | req:auth/login#1 | auth |`,
      },
    },
    variants: {
      js: {
        file: 'login.js',
        body: `// [impl:auth/login#1]
export function login(email, password) {
  return session.open(email, password);
}

// [utest:auth/login#1]
test('login opens a session', () => {
  expect(login('ada@example.com', 'pw')).toBeTruthy();
});`,
        anchors: {},
        snippets: {},
      },
    },
    steps: [
      {
        title: 'Bullet the Needs list',
        explain:
          'Rewrite the inline Needs list as a bullet list: "Needs:" on its own line, one "- id" per line below it. Run it - the trace is unchanged; both styles mean the same (just never mix them within one keyword).',
        pane: 'spec',
        anchor: 'needsInline',
        patch: { op: 'replaceLine', anchor: 'needsInline', snippet: 'needsBullets' },
        check: (r) =>
          /^- impl:auth\/login#1$/m.test(r.spec) &&
          r.items.some((i) => i.id === 'req:auth/login#1' && i.needs.length === 2),
      },
      {
        title: 'Add a keyword table',
        explain:
          'Add the feature as a table-driven item: a column headed "Needs" (no colon) contributes each row\'s cell as one entry, and the "Tags" column tags the item - here with auth, ready for a -t run.',
        pane: 'spec',
        anchor: null,
        patch: { op: 'append', snippet: 'tableItem' },
        check: (r) => {
          const f = r.items.find((i) => i.id === 'feat:auth#1');
          return f !== undefined && f.needs.includes('req:auth/login#1') && f.tags.includes('auth');
        },
      },
    ],
    done: (r) =>
      r.clean &&
      /^- utest:auth\/login#1$/m.test(r.spec) &&
      r.items.some((i) => i.id === 'feat:auth#1' && i.needs.includes('req:auth/login#1') && i.tags.includes('auth')),
  },

  {
    id: 'anchored-demands',
    title: 'Anchored demand tags',
    group: 'Extras',
    intro:
      'A subtle one to finish: the run is green, and still wrong. An implicit [>>...] demand attaches to the nearest preceding item tag - and the audit tag slipped in between. The -v report holds the evidence: read who *wants* the login test. The explicit [source >> target] form pins the attachment.',
    goal: 'Attach the test demand to the login implementation - explicitly.',
    docs: [{ label: 'Code tags', href: '/docs/code-tags/' }],
    argv: ['-v'],
    startsClean: true,
    spec: {
      file: 'spec.md',
      body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password,
and every login attempt is written to the audit log.

Needs: impl:auth/login#1, impl:auth/audit#1`,
      anchors: {},
      snippets: {},
    },
    variants: {
      js: {
        file: 'login.js',
        body: `// [impl:auth/login#1]
export function login(email, password) {
  // [impl:auth/audit#1]
  audit(email);
  // [>>utest:auth/login#1]
  return session.open(email, password);
}

// [utest:auth/login#1]
test('login opens a session', () => {
  expect(login('ada@example.com', 'pw')).toBeTruthy();
});`,
        anchors: {
          implicitDemand: '^  // \\[>>utest:auth/login#1\\]$',
        },
        snippets: {
          explicitDemand: '  // [impl:auth/login#1 >> utest:auth/login#1]',
        },
      },
    },
    steps: [
      {
        title: 'Pin the demand explicitly',
        explain:
          'Under utest:auth/login#1 the -v report says "wanted by impl:auth/audit#1" - the audit tag stole the demand, so the *audit* code claims the login test. Replace the implicit tag with the explicit form [impl:auth/login#1 >> utest:auth/login#1]; it stays attached no matter what is inserted above.',
        pane: 'code',
        anchor: 'implicitDemand',
        patch: { op: 'replaceLine', anchor: 'implicitDemand', snippet: 'explicitDemand' },
        check: (r) => {
          const login = r.items.find((i) => i.id === 'impl:auth/login#1');
          const audit = r.items.find((i) => i.id === 'impl:auth/audit#1');
          return (
            login !== undefined &&
            audit !== undefined &&
            login.needs.includes('utest:auth/login#1') &&
            !audit.needs.includes('utest:auth/login#1')
          );
        },
      },
    ],
    done: (r) =>
      r.clean &&
      r.items.some((i) => i.id === 'impl:auth/login#1' && i.needs.includes('utest:auth/login#1')) &&
      !r.items.some((i) => i.id === 'impl:auth/audit#1' && i.needs.includes('utest:auth/login#1')),
  },
];
