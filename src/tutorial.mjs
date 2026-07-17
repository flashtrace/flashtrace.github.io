// The /try/ page: a large editable IDE mock whose terminal executes the real
// flashtrace release build in a module worker (see src/scripts/tutorial.js).
// Internal naming is `tutorial` throughout - the public button label is
// swappable without touching code or storage keys.
import { examples } from './examples.mjs';
import { esc, pageShell } from './layout.mjs';

const dots = `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>`;

export function renderTutorial({ version }) {
  // Stage-1 seed: the landing page's "uncovered defect" example - replaced by
  // the chapter engine in stage 2.
  const seed = examples.find((e) => e.id === 'uncovered');
  const [spec, code] = seed.files;

  const body = `<main id="main" class="tutorial-layout">
<section class="tutorial-head">
  <h1>Try flashtrace</h1>
  <p class="section-sub">Edit the spec and the code, then hit Run - the terminal executes the real <code>flashtrace ${esc(version)}</code> release build right in your browser. Nothing leaves the page.</p>
</section>
<div class="ide-mock ide-lg" id="ide" data-spec-file="${esc(spec.name)}" data-code-file="${esc(code.name)}" data-argv="[]">
  <div class="ide-chrome">
    ${dots}
    <span class="ide-title">try flashtrace</span>
  </div>
  <div class="ide-panes">
    <div class="ide-pane">
      <div class="pane-tab">${esc(spec.name)}</div>
      <textarea id="ed-spec" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Markdown spec editor (${esc(spec.name)})">${esc(spec.body)}</textarea>
    </div>
    <div class="ide-pane">
      <div class="pane-tab">${esc(code.name)}</div>
      <textarea id="ed-code" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code editor (${esc(code.name)})">${esc(code.body)}</textarea>
    </div>
  </div>
  <div class="ide-term">
    <div class="term-bar">
      <span class="ide-title">terminal</span>
      <button type="button" id="run-btn" class="run-btn" title="Run flashtrace (Ctrl+Enter)">▶ Run</button>
    </div>
    <pre class="term-body term-lg" aria-live="polite"><code id="term-out"><span class="t-dim">$ npx flashtrace - press Run to trace the two files</span></code></pre>
  </div>
</div>
<noscript><p class="tutorial-nojs">The interactive editor needs JavaScript - without it, this page is read-only. The <a href="/">landing page examples</a> show captured runs of the same tool.</p></noscript>
<script type="module" src="/try/tutorial.js"></script>
</main>`;

  return pageShell({
    title: 'Try flashtrace - interactive tutorial',
    description:
      'Run the real flashtrace release build in your browser: edit a Markdown spec and a code file, trace them live.',
    path: '/try/',
    version,
    active: 'tutorial',
    body,
    bodyClass: 'page-tutorial',
  });
}
