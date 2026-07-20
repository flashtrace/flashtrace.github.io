// Interactive landing examples. The inputs and the terminal output are NOT
// written here: they are pulled from the tool repo at build time - input files
// from examples/<dir>/, and output from the byte-verified e2e snapshot
// test/e2e-expect/<dir>.<variant>.txt (build.mjs::loadFeaturedExamples). This
// keeps the site in lock-step with the released tool instead of drifting from
// hand-captured snippets. This module owns only the curation (which examples to
// feature, their titles and blurbs) and the CLI's output coloring.
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
  s = s.replace(/^(  ok +)(\d+)$/m, '$1<span class="t-green">$2</span>');
  s = s.replace(/^(  defective +)([1-9]\d*)$/m, '$1<span class="t-red">$2</span>');
  s = s.replace(/^(  )(of the ok items.*)$/m, '$1<span class="t-dim">$2</span>');
  s = s.replace(/^ok$/m, '<span class="t-green t-bold">ok</span>');
  s = s.replace(/^not ok$/m, '<span class="t-red t-bold">not ok</span>');
  return s;
}

// The hero terminal mirrors the smallest clean example so the number shown on
// the landing page always matches what the released CLI prints.
export const HERO_SOURCE = { dir: 'basic', variant: 'default', args: [] };

// Featured scenarios, in display order. `dir` is the example project under the
// tool repo's examples/; `variant`/`args` select the matching e2e snapshot
// (test/e2e-expect/<dir>.<variant>.txt) and the CLI arguments to fall back to
// if the snapshot is absent; `files` lists which of the project's files to show
// (in order). Titles and blurbs are the site's own editorial layer.
export const FEATURED = [
  {
    id: 'clean',
    dir: 'basic',
    variant: 'verbose',
    args: ['-v'],
    title: 'A clean, deep-covered trace',
    blurb:
      'The smallest complete setup: one Markdown requirement demands an implementation, the tag in login.ts fulfils it, and the whole chain is deep-covered.',
    files: ['spec.md', 'login.ts'],
  },
  {
    id: 'revisions',
    dir: 'revisions-and-forwarding',
    variant: 'verbose',
    args: ['-v'],
    title: 'Revisions, wildcards & forwarding',
    blurb:
      'Exact multi-layer revisions, a wildcard need that resolves to impl:session/store#2.4.1, and a two-link forwarding chain that hands a requirement’s obligation down to the implementation.',
    files: ['spec.md', 'store.ts', 'api.ts'],
  },
  {
    id: 'polyglot',
    dir: 'polyglot-web',
    variant: 'verbose',
    args: ['-v'],
    title: 'One trace, many languages',
    blurb:
      'Tags live in ordinary comments - TypeScript, SQL, plain HTML and a Vue single-file component with template, script and style regions all trace in a single run.',
    files: ['spec.md', 'metrics.ts', 'aggregation.sql', 'dashboard.vue'],
  },
  {
    id: 'diagnostics',
    dir: 'diagnostics',
    variant: 'default',
    args: [],
    title: 'Every defect, caught',
    blurb:
      'An intentionally broken project: uncovered needs, orphaned and unwanted coverage, a revision mismatch, duplicate IDs and cyclic forwarding - each reported with its exact location, exit code 1.',
    files: ['spec.md', 'unwanted.ts', 'orphan-need.ts'],
  },
];
