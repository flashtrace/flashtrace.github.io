// Shared page shells: plain template-literal functions, no template engine.

export const SITE_URL = 'https://flashtrace.github.io';
export const GITHUB_URL = 'https://github.com/flashtrace/flashtrace';
export const DISCUSSIONS_URL = 'https://github.com/flashtrace/flashtrace/discussions';

// Attributes for links leaving the site: open a new tab. Links that should
// also show the "↗" marker add class="ext-mark" (styled in site.css).
export const EXT_ATTRS = ' target="_blank" rel="external noopener"';

export function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Wrap flashtrace's own syntax (IDs, [tags], >>, -->) in spans; input must be
// HTML-escaped already. Generic code stays uncolored.
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

const themeInit = `(function(){try{var t=localStorage.getItem('ft-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

const sunIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const moonIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>`;
const githubIcon = `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;
const menuIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;

function topBar({ version, active, withSidebar }) {
  const link = (href, label, key) =>
    `<a href="${href}" class="topbar-link${active === key ? ' is-active' : ''}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="topbar">
  <div class="topbar-inner">
    ${withSidebar ? `<button class="icon-btn sidebar-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${menuIcon}</button>` : ''}
    <a class="brand" href="/">
      <img src="/logo.svg" alt="" width="22" height="22">
      <span class="brand-name">flashtrace</span>
    </a>
    <a class="version-badge" href="${GITHUB_URL}/releases"${EXT_ATTRS} title="flashtrace release">${esc(version)}</a>
    <nav class="topbar-nav" aria-label="Site">
      ${link('/', 'Home', 'home')}
      ${link('/docs/', 'Docs', 'docs')}
    </nav>
    <div class="topbar-actions">
      <a class="icon-btn" href="${GITHUB_URL}"${EXT_ATTRS} aria-label="flashtrace on GitHub">${githubIcon}</a>
      <button class="icon-btn theme-toggle" aria-label="Toggle color theme">
        <span class="only-light">${moonIcon}</span><span class="only-dark">${sunIcon}</span>
      </button>
    </div>
  </div>
</header>`;
}

function footer({ version }) {
  return `<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <img src="/logo.svg" alt="" width="18" height="18">
      <span>flashtrace</span>
    </div>
    <nav class="footer-links" aria-label="Footer">
      <a href="/docs/">Docs</a>
      <a href="${GITHUB_URL}"${EXT_ATTRS} class="ext-mark">GitHub</a>
      <a href="${DISCUSSIONS_URL}"${EXT_ATTRS} class="ext-mark">Discussions</a>
      <a href="/license/">License</a>
      <a href="/impressum/">Legal Notice</a>
    </nav>
    <p class="footer-note">Docs built from flashtrace ${esc(version)}.</p>
  </div>
</footer>`;
}

// Full HTML document. `body` is everything between top bar and footer.
export function pageShell({ title, description, path, version, active, body, bodyClass = '', withSidebar = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE_URL}${esc(path)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
<script>${themeInit}</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
${topBar({ version, active, withSidebar })}
${body}
${footer({ version })}
<script src="/site.js" defer></script>
</body>
</html>
`;
}

// Sidebar nav: `groups` is [{ label, items: [{ title, href, current }] }].
function sidebar(groups) {
  const groupHtml = groups
    .map(
      (g) => `<div class="nav-group">
  <p class="nav-group-label">${esc(g.label)}</p>
  <ul>
    ${g.items
      .map(
        (it) =>
          `<li><a href="${it.href}"${it.current ? ' class="is-current" aria-current="page"' : ''}>${esc(it.title)}</a></li>`,
      )
      .join('\n    ')}
  </ul>
</div>`,
    )
    .join('\n');
  return `<nav class="sidebar" id="sidebar" aria-label="Documentation">
${groupHtml}
</nav>
<div class="sidebar-backdrop" hidden></div>`;
}

// Right-rail "On this page" TOC from [{ id, text, level }] (h2/h3).
function tocRail(toc) {
  if (!toc.length) return '<aside class="toc" aria-hidden="true"></aside>';
  return `<aside class="toc">
  <nav aria-label="On this page">
    <p class="toc-label">On this page</p>
    <ul>
      ${toc
        .map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
        .join('\n      ')}
    </ul>
  </nav>
</aside>`;
}

// Docs shell: top bar, left sidebar, centered article, right TOC rail.
export function docShell({ title, description, path, version, navGroups, toc, content }) {
  const body = `<div class="doc-layout">
${sidebar(navGroups)}
<main class="doc-main" id="main">
<article class="doc-content">
${content}
</article>
</main>
${tocRail(toc)}
</div>`;
  return pageShell({
    title,
    description,
    path,
    version,
    active: 'docs',
    body,
    bodyClass: 'page-docs',
    withSidebar: true,
  });
}
