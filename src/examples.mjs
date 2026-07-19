// Curated interactive examples: real inputs and terminal output captured from
// actual `flashtrace` runs (v0.7.0). The landing page ships these pre-computed
// captures; the /learn/ page runs the same CLI live in the browser.

export const heroTerminal = {
  command: 'npx flashtrace',
  output: `Summary
  items       2  (1 from markdown, 1 from code)
  ok          2
  defective   0

ok`,
};

export const examples = [
  {
    id: 'clean',
    title: 'A clean, deep-covered trace',
    blurb:
      'A requirement needs an implementation at any 2.x revision; the wildcard resolves to impl:login#2.4 and the whole chain is deep-covered.',
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
  items       2  (1 from markdown, 1 from code)
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
  items       3  (1 from markdown, 2 from code)
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
  items       3  (2 from markdown, 1 from code)
  ok          3
  defective   0

ok`,
  },
];
