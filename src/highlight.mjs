// Wrap flashtrace's own syntax (IDs, [tags], >>, -->) in spans; input must be
// HTML-escaped already. Generic code stays uncolored.
//
// Standalone and dependency-free because it is shared between the build
// (layout.mjs re-exports it) and the browser (/learn/ editor highlight overlay).
//
// Deliberately language-agnostic: it runs on every fenced block and codespan
// regardless of its info string, because flashtrace tokens appear inside
// blocks of any language (md, ts, sql, plain trace output, ...). The cost is
// that an unrelated string shaped like an ID (foo:bar#1) in, say, a bash or
// json block also gets colored - acceptable for these docs, where anything
// ID-shaped in a code block is in practice a flashtrace reference.
export function highlightTokens(escaped) {
  return escaped.replace(
    /(--&gt;)|(&gt;&gt;)|([A-Za-z]+:[A-Za-z0-9_/.-]*#[0-9xyz]+(?:\.[0-9xyz]+){0,2})|(^ *(?:Needs|Covers|Tags):)/gm,
    (m, fwd, need, id, kw) => {
      if (fwd || need) return `<span class="tk-arrow">${m}</span>`;
      if (id) return `<span class="tk-id">${m}</span>`;
      return `<span class="tk-kw">${kw}</span>`;
    },
  );
}
