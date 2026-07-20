// Discovery of the machine-readable JSON Schemas the tool repo publishes under
// schemas/. The files are served verbatim - consumers fetch them by $id, so
// the bytes on the site must match the release exactly. Nothing here rewrites
// a schema; the JSON is parsed only to catch a release that ships a broken
// one, since the URL is a published contract.
//
// Discovery reports rather than throws: a file it cannot serve is recorded as
// a problem and left out of the result, so the caller can decide whether one
// bad file is worth more than the schemas that are fine.
//
// The parsed JSON is deliberately not kept - a consumer that needs the
// document should parse the bytes it is given, so there is no second
// representation to fall out of step with what is served.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// schemas/<name>/v<N>.<format>, exactly one directory deep. The tool repo
// mirrors the URL layout it is served at, so the on-disk path is also the site
// path - which stays true only while the site refuses to serve anything else.
const VERSION_FILE = /^v(\d+)\.([A-Za-z0-9]+)$/;

// latest.<format> is ours to generate from the highest version, so an upstream
// copy is ignored rather than served: two sources disagreeing about which
// version is current is the one thing the alias exists to prevent.
const LATEST_FILE = /^latest\.[a-z0-9]+$/i;

// Serving a format means having decided how it is validated here and how the
// docs generator renders it, so the list is explicit rather than "whatever
// turns up". Adding 'xml' is a one-word change once a release ships one.
const ALLOWED_FORMATS = new Set(['json']);

// What a schemas/ folder legitimately holds for the tool repo's own sake: a
// README explaining the folder to someone reading that repo, editor dotfiles,
// a licence note. Not served, and not worth mentioning either.
const LOCAL_FILE = /^(?:\.|LICENSE)|\.md$/i;

// A name that was reaching for the version layout and missed - v1.2.json,
// V0.json, report-v0.json, v0.json.bak. Worth reporting, because from here a
// typo that quietly unpublishes a schema looks exactly like a file that was
// never meant to be one.
const NEAR_MISS = /v\d/i;

// Sits next to docs/ in the tool repo, like LICENSE does. Absent until the
// release that introduces it, so the caller decides whether that is fatal.
export function locateSchemas(docsDir) {
  const dir = path.join(docsDir, '..', 'schemas');
  return existsSync(dir) ? dir : null;
}

// Returns { schemas, problems }. schemas is one entry per (folder, format)
// pair, so a folder that ever holds both v1.json and v1.xml keeps two
// independent version lines - and two latest.* aliases - rather than one
// muddled one. problems is [{ path, reason }] naming every file that was found
// and not served.
export function collectSchemas(schemasDir) {
  const schemas = [];
  const problems = [];

  for (const entry of readdirSync(schemasDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      collectSchemaDir(path.join(schemasDir, entry.name), entry.name, schemas, problems);
      continue;
    }
    // A loose file at the top level is never served: the layout puts every
    // schema under a folder that names it.
    if (!LOCAL_FILE.test(entry.name) && NEAR_MISS.test(entry.name)) {
      problems.push({
        path: entry.name,
        reason: 'sits outside a schemas/<name>/ folder, so it is not served',
      });
    }
  }

  schemas.sort((a, b) =>
    a.name === b.name ? a.format.localeCompare(b.format) : a.name.localeCompare(b.name),
  );
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { schemas, problems };
}

function collectSchemaDir(dir, name, schemas, problems) {
  const byFormat = new Map();

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const found = classifyEntry(dir, entry);
    if (!found) continue; // local to the tool repo; not ours to serve or judge
    if (found.problem) {
      problems.push({ path: `${name}/${entry.name}`, reason: found.problem });
      continue;
    }
    if (!byFormat.has(found.format)) byFormat.set(found.format, []);
    byFormat.get(found.format).push(found.version);
  }

  for (const [format, versions] of byFormat) {
    // Numeric, not lexical: v10 must sort above v9.
    versions.sort((a, b) => a.version - b.version);
    // latest follows the highest version that survived validation, so a broken
    // v1 leaves the alias on v0 rather than on nothing. Serving the last good
    // version is the lesser wrong, and the problem report says why it happened.
    schemas.push({ name, format, versions, latest: versions.at(-1) });
  }
}

// What a single entry inside schemas/<name>/ turns out to be. Exactly one of:
// a { format, version } to serve, a { problem } to report, or null for a file
// that is plainly the tool repo's own and no business of the site's.
function classifyEntry(dir, entry) {
  const problem = (reason) => ({ problem: reason });

  if (entry.isDirectory()) {
    return problem('is nested deeper than schemas/<name>/, so nothing inside it is served');
  }
  // withFileTypes reports a link as a link, so this never reaches the copy -
  // a symlink would survive the build but not the Pages artifact.
  if (entry.isSymbolicLink()) {
    return problem('is a symlink, and schemas are published as real files, so it is not served');
  }
  if (LATEST_FILE.test(entry.name)) {
    return problem('is generated by the site from the highest version, so this copy is ignored');
  }

  const m = VERSION_FILE.exec(entry.name);
  if (!m) {
    if (LOCAL_FILE.test(entry.name) || !NEAR_MISS.test(entry.name)) return null;
    return problem('does not match v<N>.<format>, so it is not served');
  }

  const [, num, ext] = m;
  const format = ext.toLowerCase();
  if (!ALLOWED_FORMATS.has(format)) {
    return problem(`is .${format}, and the site only serves ${[...ALLOWED_FORMATS].join(', ')}`);
  }

  // An unreadable file is one more thing to skip, not a crash: it reads the
  // same to a visitor as a broken one, and the report should say which file
  // rather than leaving a bare EACCES to be traced back by hand.
  let bytes;
  try {
    bytes = readFileSync(path.join(dir, entry.name));
  } catch (err) {
    return problem(`could not be read: ${err.message}`);
  }

  // Parsed to find out whether it parses, and for nothing else: the result is
  // discarded because the site serves bytes, not a re-serialisation. Only the
  // JSON documents - another format, once allowed, is served verbatim and this
  // build has no opinion on its contents.
  if (format === 'json') {
    try {
      JSON.parse(bytes.toString('utf8'));
    } catch (err) {
      return problem(`is not valid JSON: ${err.message}`);
    }
  }

  return { format, version: { version: Number(num), file: entry.name, bytes } };
}
