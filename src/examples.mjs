// Curated interactive examples: real inputs and terminal output captured from
// actual `flashtrace` runs (v0.12.0). No in-browser execution - the CLI needs
// node:fs and git, so v1 ships pre-computed, trustworthy captures.
import { esc } from './layout.mjs';

// Re-create the CLI's coloring (src/report.mjs in the tool repo) as HTML
// spans on the captured plain-text output.
export function colorizeReport(text) {
  let s = esc(text);
  // status line: colored mark + bold item ID
  s = s.replace(/^([✔✘~]) (\S+)/gm, (m, mark, id) => {
    const cls = mark === '✔' ? 't-green' : mark === '✘' ? 't-red' : 't-yellow';
    return `<span class="${cls}">${mark}</span> <span class="t-bold">${id}</span>`;
  });
  s = s.replace(/✘ missing/g, '<span class="t-red">✘ missing</span>');
  s = s.replace(/\((→ [^)]*)\)/g, '<span class="t-dim">($1)</span>');
  s = s.replace(/(?<!t-green">)✔/g, '<span class="t-green">✔</span>');
  s = s.replace(/(?<!t-red">)✘/g, '<span class="t-red">✘</span>');
  s = s.replace(/→/g, '<span class="t-cyan">→</span>');
  s = s.replace(/⚠/g, '<span class="t-yellow">⚠</span>');
  s = s.replace(/•/g, '<span class="t-red">•</span>');
  s = s.replace(/\[deep-covered\]/g, '<span class="t-green">[deep-covered]</span>');
  s = s.replace(/\[shallow-covered\]/g, '<span class="t-yellow">[shallow-covered]</span>');
  s = s.replace(/\[defective\]/g, '<span class="t-red">[defective]</span>');
  s = s.replace(/&quot;[^&]*&quot;/g, (m) => `<span class="t-dim">${m}</span>`);
  s = s.replace(/(^|\s)([\w./-]+\.(?:md|markdown|ts|js|mjs|cjs|tsx|py|rb|go|rs|java|cs|sql|lua|html|vue)(?::\d+)?)(?=\s|$)/gm, '$1<span class="t-dim">$2</span>');
  s = s.replace(/^(    )(needs|covers|wanted by)( )/gm, '$1<span class="t-dim">$2</span>$3');
  s = s.replace(/^Summary$/m, '<span class="t-bold">Summary</span>');
  s = s.replace(/^(  items +\d+  )(\(.*\))$/m, '$1<span class="t-dim">$2</span>');
  s = s.replace(
    /^(  ok +)(\d+)(  \(.*\))?$/m,
    (m, pre, n, breakdown) =>
      `${pre}<span class="t-green">${n}</span>${breakdown ? `<span class="t-dim">${breakdown}</span>` : ''}`,
  );
  s = s.replace(/^(  defective +)([1-9]\d*)$/m, '$1<span class="t-red">$2</span>');
  s = s.replace(/^ok$/m, '<span class="t-green t-bold">ok</span>');
  s = s.replace(/^not ok$/m, '<span class="t-red t-bold">not ok</span>');
  return s;
}

export const heroTerminal = {
  command: 'npx flashtrace',
  output: `Summary
  items       2  (1 from specs, 1 from code)
  ok          2
  defective   0

ok`,
};

export const examples = [
  {
    id: 'clean',
    title: 'A clean, deep-covered trace',
    blurb:
      'A requirement accepts anything within revision 2 - the 2.x wildcard resolves to impl:login#2.4 and the whole chain is deep-covered.',
    command: 'flashtrace -v',
    files: [
      {
        name: 'spec.md',
        body: `## Login

\`req:login#1\`

Users can sign in with a session token.

Needs: impl:login#2.x`,
      },
      {
        name: 'login.ts',
        body: `// [impl:login#2.4]
export function login(token: SessionToken) {
  return openSession(token);
}`,
      },
    ],
    output: `✔ impl:login#2.4  login.ts:1  [deep-covered]
    wanted by req:login#1  spec.md:3

✔ req:login#1 "Login"  spec.md:3  [deep-covered]
    needs impl:login#2.x (→ impl:login#2.4)  ✔ login.ts:1

Summary
  items       2  (1 from specs, 1 from code)
  ok          2
  defective   0

ok`,
  },
  {
    id: 'uncovered',
    title: 'An uncovered defect',
    blurb:
      'The spec needs test:auth/login#2, but only revision 1 exists - flashtrace flags the revision mismatch, and the outdated test as unwanted.',
    command: 'flashtrace',
    files: [
      {
        name: 'spec.md',
        body: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in with email and password.

Needs: impl:auth/login#1, test:auth/login#2`,
      },
      {
        name: 'login.ts',
        body: `// [impl:auth/login#1]
export function login(email: string, password: string) {
  return session.open(email, password);
}

// [test:auth/login#1]
test('login opens a session', () => { ... });`,
      },
    ],
    output: `✘ test:auth/login#1  login.ts:6
    • unwanted: no item needs test:auth/login#1

✘ req:auth/login#1 "Login requirement"  spec.md:3
    • uncovered: needs test:auth/login#2, which does not exist (revision mismatch: existing revision(s) of test:auth/login: 1)

Summary
  items       3  (1 from specs, 2 from code)
  ok          1
  defective   2

not ok`,
  },
  {
    id: 'forwarding',
    title: 'Forwarding a requirement',
    blurb:
      'req:login#1 delegates its coverage obligation to the auth design with a --> tag; it is deep-covered exactly when dsn:auth#2 is.',
    command: 'flashtrace -v',
    files: [
      {
        name: 'spec.md',
        body: `## Login

\`req:login#1\`

Login is specified in detail by the auth design.

\`[req:login#1 --> dsn:auth#2]\`

## Auth design

\`dsn:auth#2\`

Sessions are opened through the central auth service.

Needs: impl:auth#1`,
      },
      {
        name: 'auth.ts',
        body: `// [impl:auth#1]
export function openSession(token: SessionToken) { ... }`,
      },
    ],
    output: `✔ impl:auth#1  auth.ts:1  [deep-covered]
    wanted by dsn:auth#2  spec.md:11

✔ req:login#1 "Login"  spec.md:3  [deep-covered]
    → dsn:auth#2  ✔ spec.md:11
✔ dsn:auth#2 "Auth design"  spec.md:11  [deep-covered]
    needs impl:auth#1  ✔ auth.ts:1

Summary
  items       3  (2 from specs, 1 from code)
  ok          3
  defective   0

ok`,
  },
];
