// Discovery of the machine-readable JSON Schemas the tool repo publishes under
// schemas/. The files are served verbatim - consumers fetch them by $id, so
// the bytes on the site must match the release exactly. Nothing here parses
// for rewriting; the JSON is read only to render the docs page from it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// schemas/<name>/v<N>.json - the tool repo mirrors the URL layout it is served
// at, so the on-disk path is also the site path.
const VERSION_FILE = /^v(\d+)\.json$/;

// Sits next to docs/ in the tool repo, like LICENSE does. Absent until the
// release that introduces it, so the caller decides whether that is fatal.
export function locateSchemas(docsDir) {
  const dir = path.join(docsDir, '..', 'schemas');
  return existsSync(dir) ? dir : null;
}

// Every directory holding v<N>.json files becomes one schema with one or more
// versions. Returns [{ name, versions: [{ version, file, bytes, json }], latest }].
export function collectSchemas(schemasDir) {
  const out = [];
  walk(schemasDir, schemasDir, out);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function walk(dir, rootDir, out) {
  const versions = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, rootDir, out);
      continue;
    }
    // latest.json is ours to generate; upstream shipping one would mean two
    // sources disagree about which version is current.
    if (entry.name === 'latest.json') {
      throw new Error(
        `${path.relative(rootDir, full)} exists upstream, but the site generates latest.json itself. ` +
          'Remove it upstream or drop the generation here - do not ship both.',
      );
    }
    const m = VERSION_FILE.exec(entry.name);
    if (!m) continue; // non-version files are still copied verbatim, just not rendered
    const bytes = readFileSync(full);
    let json;
    try {
      json = JSON.parse(bytes.toString('utf8'));
    } catch (err) {
      throw new Error(`${path.relative(rootDir, full)} is not valid JSON: ${err.message}`);
    }
    versions.push({ version: Number(m[1]), file: entry.name, bytes, json });
  }
  if (versions.length === 0) return;
  // Numeric, not lexical: v10 must sort above v9.
  versions.sort((a, b) => a.version - b.version);
  out.push({
    name: path.relative(rootDir, dir).split(path.sep).join('/'),
    versions,
    latest: versions[versions.length - 1],
  });
}
