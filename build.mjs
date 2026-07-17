// Static site generator: renders the flashtrace tool repo's docs/ plus the
// hand-written landing page into dist/. Pure Node + marked, no framework.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Marked } from 'marked';

import { docShell, esc, EXT_ATTRS, GITHUB_URL, highlightTokens, SITE_URL } from './src/layout.mjs';
import { renderLanding } from './src/landing.mjs';
import { renderImpressum } from './src/impressum.mjs';
import { renderLicense } from './src/license.mjs';
import { renderTutorial } from './src/tutorial.mjs';
import { chapters } from './src/tutorial/chapters.mjs';
import { verifyChapters } from './src/tutorial/verify.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');

// --- locate the tool repo's docs (env → CI checkout → local sibling) -------

function locateDocs() {
  const candidates = [
    process.env.FLASHTRACE_DOCS,
    path.join(root, 'flashtrace', 'docs'),
    path.join(root, '..', 'flashtrace', 'docs'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(path.join(c, 'index.md'))) return c;
  console.error(
    'error: flashtrace docs not found. Set FLASHTRACE_DOCS, or clone the tool repo:\n' +
      '  git clone https://github.com/flashtrace/flashtrace ../flashtrace',
  );
  process.exit(1);
}

const docsDir = locateDocs();

// --- license: raw text from the tool repo root, next to docs/ ---------------

const licensePath = path.join(docsDir, '..', 'LICENSE');
if (!existsSync(licensePath)) {
  console.error(`error: LICENSE not found at ${licensePath}`);
  process.exit(1);
}
const licenseText = readFileSync(licensePath, 'utf8');

// --- version: release tag from env, else the tool repo's package.json ------

function readVersion() {
  const ref = process.env.FLASHTRACE_REF;
  if (ref) return ref.startsWith('v') ? ref : `v${ref}`;
  try {
    const pkg = JSON.parse(readFileSync(path.join(docsDir, '..', 'package.json'), 'utf8'));
    if (pkg.version) return `v${pkg.version}`;
  } catch {
    /* fall through */
  }
  return '';
}

const resolvedVersion = readVersion();
const gitRef = resolvedVersion || 'main'; // for links into the tool repo on github.com
const version = resolvedVersion || 'dev'; // display label (header badge, footer note)

// --- nav order: derived from docs/index.md, the single source of truth -----

const indexMd = readFileSync(path.join(docsDir, 'index.md'), 'utf8');
const specPages = [...indexMd.matchAll(/\[([^\]]+)\]\(docs\/([A-Za-z0-9_-]+)\.md\)/g)].map(
  (m) => ({ title: m[1], slug: m[2], file: `${m[2]}.md` }),
);
if (specPages.length === 0) {
  console.error('error: no doc links found in docs/index.md - nav derivation failed.');
  process.exit(1);
}

const pages = [
  { title: 'Usage Guide', slug: 'usage', file: 'USAGE.md' },
  { title: 'Overview', slug: '', file: 'index.md' },
  ...specPages,
];
const slugByName = new Map(pages.map((p) => [p.file.replace(/\.md$/, ''), p.slug]));

// --- markdown rendering ------------------------------------------------------

function slugify(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

// Rewrite the tool repo's relative links to the site's clean URLs. index.md
// links as docs/<name>.md; USAGE.md and the spec pages link bare <name>.md -
// both forms are handled. Other repo-relative paths go to github.com.
function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const clean = href.replace(/^\.\//, '');
  const m = clean.match(/^(?:docs\/)?([A-Za-z0-9_-]+)\.(?:md|markdown)(#.*)?$/);
  if (m) {
    const [, name, anchor = ''] = m;
    if (name === 'index') return `/docs/${anchor}`;
    const slug = slugByName.get(name);
    if (slug !== undefined) return slug === '' ? `/docs/${anchor}` : `/docs/${slug}/${anchor}`;
  }
  return `${GITHUB_URL}/blob/${gitRef}/${clean}`;
}

// Per-page render state (marked renderer hooks close over this).
const state = { toc: [], slugCounts: new Map() };

// Docs are trusted first-party input, so we don't sanitize marked's output
// (raw HTML passes through). Revisit before rendering any untrusted markdown here.

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      let id = slugify(text);
      const n = state.slugCounts.get(id) ?? 0;
      state.slugCounts.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      if (depth === 2 || depth === 3) state.toc.push({ id, text, level: depth });
      return `<h${depth} id="${id}">${text}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const t = title ? ` title="${esc(title)}"` : '';
      const url = rewriteHref(href);
      const ext = /^https?:/.test(url) ? EXT_ATTRS : '';
      return `<a href="${url}"${t}${ext}>${text}</a>`;
    },
    code({ text, lang }) {
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      return `<pre><code${cls}>${highlightTokens(esc(text))}</code></pre>\n`;
    },
    codespan({ text }) {
      return `<code>${highlightTokens(esc(text))}</code>`;
    },
  },
});

function renderDoc(page) {
  state.toc = [];
  state.slugCounts = new Map();
  const md = readFileSync(path.join(docsDir, page.file), 'utf8');
  const content = marked.parse(md);
  const navGroups = [
    {
      label: 'Getting started',
      items: [{ title: 'Usage Guide', href: '/docs/usage/', current: page.slug === 'usage' }],
    },
    {
      label: 'Specification',
      items: [
        { title: 'Overview', href: '/docs/', current: page.slug === '' },
        ...specPages.map((p) => ({
          title: p.title,
          href: `/docs/${p.slug}/`,
          current: p.slug === page.slug,
        })),
      ],
    },
  ];
  return docShell({
    title: `${page.title} · flashtrace`,
    description: `flashtrace documentation - ${page.title}.`,
    path: page.slug ? `/docs/${page.slug}/` : '/docs/',
    version,
    navGroups,
    toc: state.toc,
    content,
  });
}

// --- /try/ runner: the release bundle, node builtins rewritten to shims -----

// CI checks out the full tool repo, so dist/flashtrace.mjs sits next to the
// docs the build already consumes. Locally the clone provides it the same way.
const bundlePath = path.join(docsDir, '..', 'dist', 'flashtrace.mjs');
if (!existsSync(bundlePath)) {
  console.error(
    `error: flashtrace bundle not found at ${bundlePath} - the /try/ page runs the release build in the browser and needs it. ` +
      'Make sure the tool repo checkout includes dist/.',
  );
  process.exit(1);
}

// The exact builtin set the shims in src/tutorial/shims/ cover. A release
// that imports anything else (or drops one) must fail the build here, never
// silently ship a broken /try/ page.
const SHIMMED_BUILTINS = ['child_process', 'fs', 'path', 'process', 'url'];

function rewriteBundle(source) {
  const found = new Set();
  const rewritten = source.replace(/from "node:([a-z_]+)"/g, (m, name) => {
    found.add(name);
    return `from "./shims/${name}.mjs"`;
  });
  const actual = [...found].sort();
  if (actual.join(',') !== SHIMMED_BUILTINS.join(',')) {
    console.error(
      `error: flashtrace.mjs imports node builtins [${actual.join(', ')}] but the /try/ shims cover exactly [${SHIMMED_BUILTINS.join(', ')}].\n` +
        'Align src/tutorial/shims/ (and this assertion) with the release bundle.',
    );
    process.exit(1);
  }
  return rewritten;
}

// --- emit --------------------------------------------------------------------

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

writeFileSync(path.join(dist, 'index.html'), renderLanding({ version, gitRef }));

mkdirSync(path.join(dist, 'impressum'), { recursive: true });
writeFileSync(path.join(dist, 'impressum', 'index.html'), renderImpressum({ version }));

mkdirSync(path.join(dist, 'license'), { recursive: true });
writeFileSync(path.join(dist, 'license', 'index.html'), renderLicense({ version, text: licenseText }));

for (const page of pages) {
  const dir = page.slug ? path.join(dist, 'docs', page.slug) : path.join(dist, 'docs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), renderDoc(page));
}

const tryDir = path.join(dist, 'try');
mkdirSync(tryDir, { recursive: true });
writeFileSync(path.join(tryDir, 'flashtrace.mjs'), rewriteBundle(readFileSync(bundlePath, 'utf8')));
cpSync(path.join(root, 'src', 'tutorial', 'shims'), path.join(tryDir, 'shims'), { recursive: true });
cpSync(path.join(root, 'src', 'tutorial', 'chapter-utils.mjs'), path.join(tryDir, 'chapter-utils.mjs'));
cpSync(path.join(root, 'src', 'scripts', 'tutorial.js'), path.join(tryDir, 'tutorial.js'));
cpSync(path.join(root, 'src', 'scripts', 'tutorial-worker.js'), path.join(tryDir, 'tutorial-worker.js'));
cpSync(path.join(root, 'src', 'report-colors.mjs'), path.join(tryDir, 'report-colors.mjs'));

// Every chapter's start state and each step's cumulative patched state runs
// through the exact bundle the browser executes; behavioral drift in a
// flashtrace release fails the deploy here instead of shipping a broken lesson.
let verified;
try {
  verified = await verifyChapters(chapters, path.join(tryDir, 'flashtrace.mjs'), 'js');
} catch (err) {
  console.error(`error: tutorial chapter verification failed.\n${err.message}`);
  process.exit(1);
}
writeFileSync(path.join(tryDir, 'index.html'), renderTutorial({ version, verified }));

const sitePaths = [
  '/',
  ...pages.map((p) => (p.slug ? `/docs/${p.slug}/` : '/docs/')),
  '/try/',
  '/license/',
  '/impressum/',
];
writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitePaths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}
</urlset>
`,
);

cpSync(path.join(root, 'public'), dist, { recursive: true });
cpSync(path.join(root, 'src', 'styles', 'site.css'), path.join(dist, 'site.css'));
cpSync(path.join(root, 'src', 'scripts', 'site.js'), path.join(dist, 'site.js'));

console.log(`built ${pages.length + 3} pages into dist/ (flashtrace ${version || 'unknown version'})`);
