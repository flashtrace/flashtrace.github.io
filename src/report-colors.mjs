// Re-create the CLI's report coloring (src/report.mjs in the tool repo) as
// HTML spans over plain-text output. Shared between the build (landing page
// captures) and the browser (/learn/ terminal), so it must stay dependency-free
// and standalone - `esc` lives here instead of importing layout.mjs, which
// would drag the whole page-shell module into the client bundle.

export function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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
