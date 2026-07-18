// The /learn/ page: chapter rail + a large editable IDE mock whose terminal
// executes the real flashtrace release build in a module worker (see
// src/scripts/tutorial.js). Server-renders chapter 1 as the initial state and
// a full read-only fallback for browsers without JavaScript. Internal naming
// is `tutorial` throughout - the public button label is swappable without
// touching code or storage keys.
import { chapters } from './tutorial/chapters.mjs';
import { chapterPayload } from './tutorial/verify.mjs';
import { esc, GITHUB_URL, highlightTokens, pageShell } from './layout.mjs';
import { colorizeReport } from './report-colors.mjs';

const LANG = 'js';

const dots = `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>`;

function docsLinks(chapter) {
  return chapter.docs
    .map((d) => `<a href="${esc(d.href)}">${esc(d.label)}</a>`)
    .join(' · ');
}

function chapterRail() {
  const groups = [];
  for (const chapter of chapters) {
    let group = groups.find((g) => g.label === chapter.group);
    if (!group) {
      group = { label: chapter.group, items: [] };
      groups.push(group);
    }
    group.items.push(chapter);
  }
  let no = 0;
  const groupHtml = groups
    .map(
      (g) => `<div class="nav-group">
  <p class="nav-group-label">${esc(g.label)}</p>
  <ul>
    ${g.items
      .map((ch) => {
        no += 1;
        return `<li><a href="#${ch.id}" data-chapter="${ch.id}"${no === 1 ? ' class="is-current" aria-current="page"' : ''}><span class="ch-mark" data-mark="${ch.id}" aria-hidden="true"></span>${no} · ${esc(ch.title)}</a></li>`;
      })
      .join('\n    ')}
  </ul>
</div>`,
    )
    .join('\n');
  return `<nav class="sidebar" id="sidebar" aria-label="Chapters">
<div class="nav-group">
  <ul>
    <li><a href="#editor" data-chapter="editor"><span class="ch-mark" aria-hidden="true"></span>Free editor</a></li>
  </ul>
</div>
${groupHtml}
<div class="rail-foot">
  <p class="rail-legend"><span class="ch-mark is-done" aria-hidden="true"></span> completed · <span class="ch-mark is-assisted" aria-hidden="true"></span> with assists</p>
  <button type="button" class="rail-reset" id="reset-progress" hidden>Reset progress</button>
</div>
</nav>
<div class="sidebar-backdrop" hidden></div>`;
}

export const LOCK_TIP = 'This chapter does not allow file management';

// Server-rendered initial tab strip (chapter 1); tutorial.js re-renders it on
// every chapter switch and tab operation with the same structure.
function paneTabs(pane, fileName, locked, label) {
  const lock = locked ? `<span class="tab-lock" title="${LOCK_TIP}"></span>` : '';
  const addAttrs = locked ? ` disabled title="${LOCK_TIP}"` : ' title="New file"';
  return `<div class="pane-tabs" id="${pane}-tabs" aria-label="${label}">
        <div class="pane-tab is-active"><button type="button" class="tab-name" aria-current="true">${esc(fileName)}</button>${lock}</div>
        <button type="button" class="tab-add"${addAttrs} aria-label="New file">+</button>
      </div>`;
}

function ide(first) {
  const variant = first.variants[LANG];
  return `<div class="ide-mock ide-lg" id="ide" data-spec-file="${esc(first.spec.file)}" data-code-file="${esc(variant.file)}" data-lang="${LANG}">
  <div class="ide-chrome">
    ${dots}
    <span class="ide-title" id="ide-title">chapter 1 · ${esc(first.title)}</span>
    <button type="button" class="ide-reset" id="reset-files" title="Restore this chapter's start files">Reset files</button>
  </div>
  <div class="ide-panes">
    <div class="ide-pane">
      ${paneTabs('spec', first.spec.file, first.locked, 'Spec files')}
      <textarea id="ed-spec" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Markdown spec editor">${esc(first.spec.body)}</textarea>
    </div>
    <div class="ide-pane">
      ${paneTabs('code', variant.file, first.locked, 'Code files')}
      <textarea id="ed-code" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code editor">${esc(variant.body)}</textarea>
    </div>
  </div>
  <div class="ide-term">
    <div class="term-bar">
      <span class="ide-title">terminal</span>
      <span class="term-cmd"><span class="t-dim">$&nbsp;npx flashtrace</span><input id="argv-input" class="argv-input" value="${esc(first.argv.join(' '))}" aria-label="Additional command-line arguments" autocomplete="off" spellcheck="false"></span>
      <button type="button" id="run-btn" class="run-btn" title="Run flashtrace (Ctrl+Enter)">▶ Run</button>
    </div>
    <pre class="term-body term-lg" aria-live="polite"><code id="term-out"><span class="t-dim">press Run to trace the project</span></code></pre>
  </div>
  <div class="done-overlay" id="done-overlay" hidden>
    <div class="done-card" role="status">
      <span class="done-check" aria-hidden="true">✓</span>
      <p class="done-title">Chapter complete</p>
      <p class="done-text" id="done-text"></p>
      <button type="button" class="btn btn-secondary" id="done-reset" title="Forget this completion and restore the start files">Reset chapter</button>
    </div>
  </div>
  <div class="spotlight" id="spotlight" hidden><div class="spotlight-hole" id="spotlight-hole"></div></div>
  <div class="assist-pop" id="assist-pop" role="dialog" aria-label="Step help" tabindex="-1" hidden>
    <button type="button" class="assist-close" id="assist-close" aria-label="Dismiss help">✕</button>
    <p class="assist-text" id="assist-text"></p>
    <p class="assist-doc-link"><a id="assist-doc" href="/docs/">Read more in the docs</a></p>
  </div>
</div>`;
}

// Step accordion between the chapter intro and the IDE: one <details> per
// step, the current one unfolded, finished ones greyed out with a check.
// Server-renders chapter 1's start state (step 1 current); tutorial.js
// re-renders the items on every chapter switch and re-syncs the open/done
// state after every run with the same structure.
function stepListItems(steps, currentIndex) {
  return steps
    .map((step, i) => {
      let state = '';
      if (i < currentIndex) state = ' class="is-done"';
      else if (i === currentIndex) state = ' class="is-current"';
      return `<li${state}><details${i === currentIndex ? ' open' : ''}>
  <summary><span class="step-mark" aria-hidden="true"></span>${i + 1} · ${esc(step.title)}</summary>
  <p class="step-explain">${esc(step.explain)}</p>
</details></li>`;
    })
    .join('\n');
}

function stepList(first) {
  return `<section class="step-list" id="step-list" aria-label="Steps of this chapter">
<ol id="step-items">
${stepListItems(first.steps, 0)}
</ol>
</section>`;
}

function resumeDialog() {
  return `<dialog class="resume-modal" id="resume-modal" aria-labelledby="resume-title">
  <h2 id="resume-title">Work in progress</h2>
  <p id="resume-text">You have unsaved work in this chapter - resume it, or start fresh?</p>
  <p class="resume-note" id="resume-note" hidden>This chapter has been updated since you last worked on it.</p>
  <div class="resume-actions">
    <button type="button" class="btn btn-primary" id="resume-yes">Resume</button>
    <button type="button" class="btn btn-secondary" id="resume-fresh">Start fresh</button>
  </div>
</dialog>`;
}

// Datalists double as the single client-side source of the supported
// extensions: the pickers autocomplete from them and tutorial.js validates
// against them. The code list is parsed from docs/code-tags.md at build time;
// the spec list mirrors what analyzeBuffers routes to parseMarkdown.
function fileDialogs(codeExtensions) {
  const specExtensions = ['.md', '.markdown'];
  const options = (exts) => exts.map((e) => `<option value="${esc(e)}"></option>`).join('');
  return `<datalist id="ext-spec">${options(specExtensions)}</datalist>
<datalist id="ext-code">${options(codeExtensions)}</datalist>
<dialog class="resume-modal file-modal" id="newfile-modal" aria-labelledby="newfile-title">
  <h2 id="newfile-title">New file</h2>
  <div class="file-fields">
    <label for="newfile-name">Name</label>
    <input id="newfile-name" autocomplete="off" spellcheck="false" autocapitalize="off">
    <label for="newfile-ext">Type</label>
    <input id="newfile-ext" autocomplete="off" spellcheck="false" autocapitalize="off">
  </div>
  <p class="file-error" id="newfile-error" hidden><span id="newfile-error-text"></span> <a href="${GITHUB_URL}/issues" id="newfile-issue" hidden>Open an issue to ask for it?</a></p>
  <div class="resume-actions">
    <button type="button" class="btn btn-primary" id="newfile-create" disabled>Create</button>
    <button type="button" class="btn btn-secondary" id="newfile-cancel">Cancel</button>
  </div>
</dialog>
<dialog class="resume-modal" id="delfile-modal" aria-labelledby="delfile-title">
  <h2 id="delfile-title">Delete file</h2>
  <p id="delfile-text"></p>
  <div class="resume-actions">
    <button type="button" class="btn btn-primary" id="delfile-yes">Delete</button>
    <button type="button" class="btn btn-secondary" id="delfile-cancel">Cancel</button>
  </div>
</dialog>`;
}

// Shown when someone lands on #editor without any completed chapter: offer
// the guided route before leaving a newcomer alone with two empty files.
function welcomeDialog() {
  return `<dialog class="resume-modal" id="welcome-modal" aria-labelledby="welcome-title">
  <h2 id="welcome-title">First time with flashtrace?</h2>
  <p>This is the free editor - a blank project running the real tool. The chapters on the left teach flashtrace hands-on, a few minutes each.</p>
  <div class="resume-actions">
    <button type="button" class="btn btn-primary" id="welcome-learn">Start learning from the first chapter</button>
    <button type="button" class="btn btn-secondary" id="welcome-editor">Open the free editor</button>
  </div>
</dialog>`;
}

function miniWindow(name, inner, term = false) {
  return `<div class="mini-window${term ? ' term' : ''}"><div class="mini-bar">${dots}<span>${esc(name)}</span></div><pre class="${term ? 'term-body' : 'code'}"><code>${inner}</code></pre></div>`;
}

// Read-only chapter rendering for browsers without JavaScript: the inputs and
// the build-time captured real runs, at the fidelity of the landing examples.
function fallbackChapters(verified) {
  const sections = chapters
    .map((chapter, index) => {
      const variant = chapter.variants[LANG];
      const captured = verified[chapter.id];
      const cmd = ['npx flashtrace', ...chapter.argv].join(' ');
      const startTerm =
        `<span class="t-dim">$</span> ${esc(cmd)}\n` +
        colorizeReport(captured.startOutput) +
        `\n<span class="t-dim">exit ${captured.startExit}</span>`;
      const solvedTerm =
        `<span class="t-dim">$</span> ${esc(cmd)}\n` +
        colorizeReport(captured.solvedOutput) +
        `\n<span class="t-dim">exit ${captured.solvedExit}</span>`;
      return `<section class="tutorial-fallback" id="${esc(chapter.id)}">
  <h2>${index + 1} · ${esc(chapter.title)}</h2>
  <p>${esc(chapter.intro)}</p>
  <ol class="fallback-steps">
    ${chapter.steps.map((step) => `<li><strong>${esc(step.title)}.</strong> ${esc(step.explain)}</li>`).join('\n    ')}
  </ol>
  <div class="ex-files">
    ${miniWindow(chapter.spec.file, highlightTokens(esc(chapter.spec.body)))}
    ${miniWindow(variant.file, highlightTokens(esc(variant.body)))}
  </div>
  ${miniWindow('terminal', startTerm, true)}
  <details>
    <summary>The solved run</summary>
    ${miniWindow('terminal', solvedTerm, true)}
  </details>
  <p class="ch-docs">Read more: ${docsLinks(chapter)}</p>
</section>`;
    })
    .join('\n');
  return `<noscript>
<style>#ide, .assist-bar, .tutorial-head-live, #step-list { display: none; }</style>
<p class="tutorial-nojs">The interactive editor needs JavaScript. Below are all chapters read-only, with their inputs and real captured runs.</p>
${sections}
</noscript>`;
}

export function renderTutorial({ version, verified, codeExtensions }) {
  const first = chapters[0];
  const payloads = chapters.map((chapter) => ({
    ...chapterPayload(chapter, LANG),
    rev: verified[chapter.id].rev,
  }));
  const dataJson = JSON.stringify({ v: 1, lang: LANG, chapters: payloads }).replace(/</g, '\\u003c');

  const body = `<div class="tutorial-layout">
${chapterRail()}
<main class="tutorial-main" id="main">
<section class="tutorial-head tutorial-head-live">
  <p class="ch-kicker"><span id="ch-kicker">Chapter 1 · ${esc(first.group)}</span></p>
  <h1 id="ch-title">${esc(first.title)}</h1>
  <p class="ch-intro" id="ch-intro">${esc(first.intro)}</p>
  <p class="ch-docs">Read more: <span id="ch-docs">${docsLinks(first)}</span></p>
</section>
${stepList(first)}
${ide(first)}
<div class="assist-bar" id="assist-bar">
  <p class="assist-goal"><strong>Goal:</strong> <span id="goal-text">${esc(first.goal)}</span></p>
  <p class="assist-progress" id="step-progress" aria-live="polite">Run to check your progress.</p>
  <div class="assist-actions">
    <button type="button" id="help-btn" class="btn btn-secondary" disabled>Help me</button>
    <button type="button" id="auto-btn" class="btn btn-secondary" disabled>Do the next step for me</button>
  </div>
</div>
${resumeDialog()}
${welcomeDialog()}
${fileDialogs(codeExtensions)}
${fallbackChapters(verified)}
<script type="application/json" id="tutorial-data">${dataJson}</script>
<script type="module" src="/learn/tutorial.js"></script>
</main>
</div>`;

  return pageShell({
    title: 'Try flashtrace - interactive tutorial',
    description:
      'Learn flashtrace hands-on: guided chapters in an editable IDE that runs the real release build in your browser.',
    path: '/learn/',
    version,
    active: 'tutorial',
    body,
    bodyClass: 'page-tutorial',
    withSidebar: true,
  });
}
