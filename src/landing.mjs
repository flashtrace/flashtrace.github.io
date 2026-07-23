// The landing page: hero with a CSS-built IDE mock, how-it-works, features,
// curated interactive examples, install snippets. All static HTML.
import { colorizeReport, examples, heroTerminal } from './examples.mjs';
import { esc, EXT_ATTRS, GITHUB_URL, highlightTokens, pageShell } from './layout.mjs';

// --- hero IDE mock -----------------------------------------------------------

const heroSpecPane = `<pre class="code"><code><span class="md-h">## Login requirement</span>

<span class="tk-id" data-trace="from">\`req:auth/login#1\`</span>

Users must be able to log in
with email and password.

<span class="tk-kw">Needs:</span> <span class="tk-id" data-trace="needs">impl:auth/login#1</span></code></pre>`;

const heroCodePane = `<pre class="code"><code><span class="cmt">// <span class="tk-id" data-trace="to">[impl:auth/login#1]</span></span>
<span class="kw">export function</span> login(
  email: <span class="ty">string</span>,
  password: <span class="ty">string</span>,
) {
  <span class="kw">return</span> session.open(
    email, password);
}</code></pre>`;

function windowDots() {
  return `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

function ideMock() {
  return `<div class="ide-mock" role="img" aria-label="Two editor panes - a Markdown spec defining req:auth/login#1 and a TypeScript file tagged [impl:auth/login#1]; a terminal below shows a clean flashtrace run ending in ok.">
  <div class="ide-chrome">
    ${windowDots()}
    <span class="ide-title">requirement tracing</span>
  </div>
  <div class="ide-panes">
    <div class="ide-pane">
      <div class="pane-tab">spec.md</div>
      ${heroSpecPane}
    </div>
    <div class="ide-pane">
      <div class="pane-tab">login.ts</div>
      ${heroCodePane}
    </div>
  </div>
  <div class="ide-term">
    <div class="term-bar"><span class="ide-title">terminal</span></div>
    <pre class="term-body"><code><span class="t-dim">$</span> ${esc(heroTerminal.command)}
${colorizeReport(heroTerminal.output)}</code></pre>
  </div>
</div>`;
}

// --- how it works -------------------------------------------------------------

const steps = [
  {
    title: 'Write specs in Markdown',
    text: 'An item is a line holding only its ID in backticks. The heading above becomes its title, the paragraph below its description and Needs lists the IDs that must cover it.',
    snippet: `## Login requirement

\`req:auth/login#1\`

Users must be able to log in.

Needs: impl:auth/login#1`,
    file: 'spec.md',
  },
  {
    title: 'Tag your code',
    text: 'Drop the ID into a comment - flashtrace understands the comment syntax of dozens of languages, from C-Like (incl. JS/TS) to SQL to Powershell.',
    snippet: `// [impl:auth/login#1]
// [>>utest:auth/login#1]
export function login(token) {
  …
}`,
    file: 'login.ts',
  },
  {
    title: 'Run flashtrace',
    text: 'One command traces every requirement to its coverage - transitively - and reports what is missing, orphaned, unwanted, outdated or duplicated.',
    // captured from a real run over the two files above plus the demanded test
    snippet: `$ npx flashtrace

Summary
  items       3  (1 from specs, 2 from code)
  ok          3
  defective   0

ok`,
    file: 'terminal',
    terminal: true,
  },
];

function stepSnippet(s) {
  if (!s.terminal) return highlightSnippet(s.snippet);
  const report = s.snippet.replace(/^\$ .*\n\n/, '');
  return `<span class="t-dim">$</span> npx flashtrace\n\n${colorizeReport(report)}`;
}

function howItWorks() {
  return `<section class="section" id="how-it-works" aria-labelledby="how-title">
  <h2 id="how-title">How it works</h2>
  <ol class="steps">
    ${steps
      .map(
        (s, i) => `<li class="step">
      <div class="step-head"><span class="step-no">${i + 1}</span><h3>${esc(s.title)}</h3></div>
      <p>${esc(s.text)}</p>
      <div class="mini-window"><div class="mini-bar">${windowDots()}<span>${esc(s.file)}</span></div><pre class="code${s.terminal ? ' term-body' : ''}"><code>${stepSnippet(s)}</code></pre></div>
    </li>`,
      )
      .join('\n    ')}
  </ol>
</section>`;
}

// Token coloring for landing snippets - same rules as the docs build.
const highlightSnippet = (text) => highlightTokens(esc(text));

// --- features -----------------------------------------------------------------

const features = [
  ['Zero runtime dependencies', 'One self-contained script. Vendor it or install it - nothing else comes along.', null],
  ['Runs anywhere', 'Everything Node.js ≥ 18 runs on: your laptop, your CI, your air-gapped build box.', null],
  ['Many languages', 'A tag is just a comment, so one syntax spans them all: C-style (JS/TS, Java, C#, Go, Rust), hash (Python, Ruby, shell), SQL, Lua, HTML/Vue - and dozens more.', '/docs/code-tags/'],
  ['Deep, transitive coverage', 'An item is only deep-covered when its whole tracing chain is. Broken links show up wherever they hide.', '/docs/coverage-rules/'],
  ['SemVer revisions &amp; wildcards', 'Revisions match as SemVer versions - 2.4 equals 2.4.0 - and a 2.x wildcard accepts anything within revision 2.', '/docs/revisions/'],
  ['Forwarding', 'Delegate a requirement’s obligation to another item with a forwarding tag - coverage follows the chain.', '/docs/forwarding/'],
  ['Git-aware scanning', 'Files ignored by git are excluded automatically - no config to keep in sync.', '/docs/usage/'],
  ['Rich, CI-friendly reports', 'A readable text report or deterministic, schema-backed JSON on stdout - and meaningful exit codes: 0 clean, 1 defects found, 2 usage error.', '/docs/json-report/'],
];

function featureGrid() {
  return `<section class="section" id="features" aria-labelledby="features-title">
  <h2 id="features-title">Built to stay out of your way</h2>
  <div class="feature-grid">
    ${features
      .map(
        ([title, text, href]) => `<div class="feature">
      <h3>${title}</h3>
      <p>${text}${href ? ` <a href="${href}">Learn more</a>` : ''}</p>
    </div>`,
      )
      .join('\n    ')}
  </div>
</section>`;
}

// --- interactive examples -------------------------------------------------------

function exampleFiles(ex) {
  return `<div class="ex-files">
    ${ex.files
      .map(
        (f) => `<div class="mini-window"><div class="mini-bar">${windowDots()}<span>${esc(f.name)}</span></div><pre class="code"><code>${highlightSnippet(f.body)}</code></pre></div>`,
      )
      .join('\n    ')}
  </div>`;
}

function exampleOutput(ex) {
  return `<div class="mini-window term"><div class="mini-bar">${windowDots()}<span>terminal</span></div><pre class="term-body"><code><span class="t-dim">$</span> ${esc(ex.command)}
${colorizeReport(ex.output)}</code></pre></div>`;
}

function examplesSection() {
  const scenarioTabs = examples
    .map(
      (ex, i) =>
        `<button role="tab" id="ex-tab-${ex.id}" aria-controls="ex-panel-${ex.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(ex.title)}</button>`,
    )
    .join('\n      ');
  const scenarioPanels = examples
    .map(
      (ex, i) => `<div role="tabpanel" id="ex-panel-${ex.id}" aria-labelledby="ex-tab-${ex.id}"${i === 0 ? '' : ' hidden'}>
      <p class="ex-blurb">${esc(ex.blurb)}</p>
      <div class="io-tabs" data-tabs>
        <div role="tablist" aria-label="Input or output">
          <button role="tab" id="io-tab-${ex.id}-in" aria-controls="io-panel-${ex.id}-in" aria-selected="true" tabindex="0">Input</button>
          <button role="tab" id="io-tab-${ex.id}-out" aria-controls="io-panel-${ex.id}-out" aria-selected="false" tabindex="-1">Output</button>
        </div>
        <div role="tabpanel" id="io-panel-${ex.id}-in" aria-labelledby="io-tab-${ex.id}-in">${exampleFiles(ex)}</div>
        <div role="tabpanel" id="io-panel-${ex.id}-out" aria-labelledby="io-tab-${ex.id}-out" hidden>${exampleOutput(ex)}</div>
      </div>
    </div>`,
    )
    .join('\n    ');
  return `<section class="section" id="examples" aria-labelledby="examples-title">
  <h2 id="examples-title">See it trace</h2>
  <p class="section-sub">Three scenarios, captured from real <code>flashtrace</code> runs. Flip each between its input files and the report it produces.</p>
  <div class="example-tabs" data-tabs>
    <div role="tablist" aria-label="Example scenarios">
      ${scenarioTabs}
    </div>
    ${scenarioPanels}
  </div>
</section>`;
}

// --- install -----------------------------------------------------------------

function installSection(version, gitRef) {
  // raw file at the release ref, so a vendored download matches the docs shown
  const rawScriptUrl = `${GITHUB_URL}/raw/${esc(gitRef)}/dist/flashtrace.mjs`;
  return `<section class="section" id="install" aria-labelledby="install-title">
  <h2 id="install-title">Install in seconds</h2>
  <p class="section-sub">Two ways in, both ending at the same single file. Current release: <strong>${esc(version)}</strong>.</p>
  <div class="install-grid">
    <div class="install-card">
      <h3>As a dev dependency</h3>
      <div class="cmd-block"><pre><code>npm install flashtrace -D
npx flashtrace</code></pre><button class="copy-btn" data-copy="npm install flashtrace -D
npx flashtrace" aria-label="Copy install commands">Copy</button></div>
    </div>
    <div class="install-card">
      <h3>Vendored, zero install</h3>
      <p class="install-note">Download <a href="${rawScriptUrl}"${EXT_ATTRS} class="ext-mark">dist/flashtrace.mjs</a> into your repository and run it directly.</p>
      <div class="cmd-block"><pre><code>node flashtrace.mjs</code></pre><button class="copy-btn" data-copy="node flashtrace.mjs" aria-label="Copy run command">Copy</button></div>
    </div>
  </div>
  <p class="install-note">Node.js ≥ 18 required. Read the <a href="/docs/usage/">Usage Guide</a> for options and details.</p>
</section>`;
}

// --- page ---------------------------------------------------------------------

export function renderLanding({ version, gitRef }) {
  const body = `<main id="main">
<section class="hero">
  <div class="hero-copy">
    <h1>Lightning-fast, reference-based requirement tracing</h1>
    <p class="hero-sub">flashtrace verifies that every requirement in your Markdown specs is covered by the code and tests it demands - with zero runtime dependencies, anywhere Node.js runs.</p>
    <div class="hero-ctas">
      <a class="btn btn-primary" href="/docs/">Get started</a>
      <a class="btn btn-secondary" href="${GITHUB_URL}"${EXT_ATTRS}>View on GitHub</a>
    </div>
  </div>
  ${ideMock()}
</section>
${howItWorks()}
${featureGrid()}
${examplesSection()}
${installSection(version, gitRef)}
</main>`;
  return pageShell({
    title: 'flashtrace - lightning-fast, reference-based requirement tracing',
    description:
      'flashtrace traces requirement coverage between Markdown specs and code comments. Zero runtime dependencies, runs anywhere Node.js ≥ 18 does.',
    path: '/',
    version,
    active: 'home',
    body,
    bodyClass: 'page-landing',
  });
}
