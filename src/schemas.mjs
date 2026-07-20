// Discovery of the machine-readable JSON Schemas the tool repo publishes under
// schemas/. The files are served verbatim - consumers fetch them by $id, so
// the bytes on the site must match the release exactly. Nothing here parses
// for rewriting; the JSON is read only to render the docs page from it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// schemas/<name>/v<N>.<format> - the tool repo mirrors the URL layout it is
// served at, so the on-disk path is also the site path. The format is read off
// the extension rather than assumed, so a future schemas/report/v1.xml needs no
// change here.
const VERSION_FILE = /^v(\d+)\.([A-Za-z0-9]+)$/;

// "report" + json -> "Report JSON". The directory names the schema, the
// extension names the format, and the page is titled from both.
function displayTitle(name, format) {
  const words = name
    .split(/[/_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return `${words} ${format.toUpperCase()}`;
}

// Sits next to docs/ in the tool repo, like LICENSE does. Absent until the
// release that introduces it, so the caller decides whether that is fatal.
export function locateSchemas(docsDir) {
  const dir = path.join(docsDir, '..', 'schemas');
  return existsSync(dir) ? dir : null;
}

// One schema per (directory, format) pair, so a directory that ever holds both
// v1.json and v1.xml yields "Report JSON" and "Report XML" rather than one
// muddled page. Returns
// [{ name, format, slug, title, versions: [{ version, file, bytes, json }], latest }].
export function collectSchemas(schemasDir) {
  const out = [];
  walk(schemasDir, schemasDir, out);
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

function walk(dir, rootDir, out) {
  const byFormat = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      walk(full, rootDir, out);
      continue;
    }
    // latest.<format> is ours to generate; upstream shipping one would mean
    // two sources disagree about which version is current.
    if (/^latest\.[A-Za-z0-9]+$/.test(entry.name)) {
      throw new Error(
        `${rel} exists upstream, but the site generates ${entry.name} itself. ` +
          'Remove it upstream or drop the generation here - do not ship both.',
      );
    }
    const m = VERSION_FILE.exec(entry.name);
    if (!m) continue; // non-version files are still copied verbatim, just not rendered
    const [, num, ext] = m;
    const format = ext.toLowerCase();
    const bytes = readFileSync(full);
    // Only the JSON documents are parsed - another format is served verbatim
    // and the build decides separately whether it can render a page for it.
    let json;
    if (format === 'json') {
      try {
        json = JSON.parse(bytes.toString('utf8'));
      } catch (err) {
        throw new Error(`${rel} is not valid JSON: ${err.message}`);
      }
    }
    if (!byFormat.has(format)) byFormat.set(format, []);
    byFormat.get(format).push({ version: Number(num), file: entry.name, bytes, json });
  }

  const name = path.relative(rootDir, dir).split(path.sep).join('/');
  for (const [format, versions] of byFormat) {
    // Numeric, not lexical: v10 must sort above v9.
    versions.sort((a, b) => a.version - b.version);
    out.push({
      name,
      format,
      // Page slug: /docs/schemas/report-json/. Two formats of one schema get
      // their own page instead of fighting over /docs/schemas/report/. The
      // pairing is unambiguous because a format is [A-Za-z0-9]+ and so cannot
      // contain the separating dash.
      slug: `${name}-${format}`,
      title: displayTitle(name, format),
      versions,
      latest: versions.at(-1),
    });
  }
}
