// Static site generator: renders the flashtrace tool repo's docs/ plus the
// hand-written landing page into dist/. Pure Node + marked, no framework.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Marked } from 'marked';

import { FEATURED, HERO_SOURCE } from './src/examples.mjs';
import { docShell, esc, EXT_ATTRS, GITHUB_URL, highlightTokens, SITE_URL } from './src/layout.mjs';
import { renderLanding } from './src/landing.mjs';
import { renderImpressum } from './src/impressum.mjs';
import { renderLicense } from './src/license.mjs';

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

// --- featured examples: inputs from examples/, output from the e2e snapshot --
//
// The landing page examples are not hand-captured; they are pulled from the
// tool repo (sibling of docs/) so they track the released version. Output comes
// from the byte-verified snapshot the tool's own e2e suite asserts against; if
// that snapshot is missing (older tool checkout), fall back to running the
// shipped CLI over a throwaway copy of the example, isolated from git metadata.

const examplesDir = path.join(docsDir, '..', 'examples');
const snapshotsDir = path.join(docsDir, '..', 'test', 'e2e-expect');
const cliPath = path.join(docsDir, '..', 'dist', 'flashtrace.mjs');

function exampleOutput(dir, variant, args) {
  const snapshot = path.join(snapshotsDir, `${dir}.${variant}.txt`);
  if (existsSync(snapshot)) return readFileSync(snapshot, 'utf8');
  if (existsSync(cliPath)) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ft-example-'));
    try {
      cpSync(path.join(examplesDir, dir), tmp, { recursive: true });
      const run = spawnSync(process.execPath, [cliPath, ...args], { cwd: tmp, encoding: 'utf8' });
      if (typeof run.stdout === 'string' && run.stdout.length > 0) return run.stdout;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  console.error(
    `error: no output for example '${dir}': snapshot ${dir}.${variant}.txt not found and the CLI at ${cliPath} could not produce one.`,
  );
  process.exit(1);
}

function loadExample(ex) {
  const files = ex.files.map((name) => {
    const file = path.join(examplesDir, ex.dir, name);
    if (!existsSync(file)) {
      console.error(`error: featured example '${ex.dir}' is missing file '${name}' at ${file}`);
      process.exit(1);
    }
    return { name, body: readFileSync(file, 'utf8').replace(/\n+$/, '') };
  });
  return {
    id: ex.id,
    title: ex.title,
    blurb: ex.blurb,
    command: `flashtrace ${ex.args.join(' ')}`.trim(),
    files,
    output: exampleOutput(ex.dir, ex.variant, ex.args).replace(/\n+$/, ''),
  };
}

const featuredExamples = FEATURED.map(loadExample);
const heroTerminal = {
  command: 'npx flashtrace',
  output: exampleOutput(HERO_SOURCE.dir, HERO_SOURCE.variant, HERO_SOURCE.args).replace(/\n+$/, ''),
};

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

// --- emit --------------------------------------------------------------------

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

writeFileSync(
  path.join(dist, 'index.html'),
  renderLanding({ version, gitRef, examples: featuredExamples, heroTerminal }),
);

mkdirSync(path.join(dist, 'impressum'), { recursive: true });
writeFileSync(path.join(dist, 'impressum', 'index.html'), renderImpressum({ version }));

mkdirSync(path.join(dist, 'license'), { recursive: true });
writeFileSync(path.join(dist, 'license', 'index.html'), renderLicense({ version, text: licenseText }));

for (const page of pages) {
  const dir = page.slug ? path.join(dist, 'docs', page.slug) : path.join(dist, 'docs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), renderDoc(page));
}

const sitePaths = [
  '/',
  ...pages.map((p) => (p.slug ? `/docs/${p.slug}/` : '/docs/')),
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
