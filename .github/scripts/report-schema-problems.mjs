// Turns the build's schema-problems.json into something a person will notice.
//
// A file the site cannot serve is skipped rather than fatal (see build.mjs), so
// a broken schema otherwise leaves no trace in a green deploy. This closes that
// gap: run annotations always, plus - where the caller sets REPORT_ISSUE=1 and
// the workflow grants issues:write - a single tracking issue.
//
// The issue is a living record, not a log. Its body always shows the current
// state, so someone opening it sees what is wrong now rather than reconstructing
// it from a pile of comments; every change also appends a comment saying what
// moved, so the history is still there for anyone who wants it. The body
// carries the problem set it was written from, which is what lets the next run
// tell "nothing changed" from "different problems" and diff the two.
//
// Node rather than shell: no jq to depend on, and the workflows have already
// set up Node by the time this runs. gh brings its own JSON handling.
//
// report() takes its gh as an argument and reaches for nothing global, so it
// can be driven end to end against a fake. Anything that shells out to the
// real gh lives below the entry-point guard, where a test cannot reach it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const LABEL = 'schema-problem';
const TITLE = 'Schema files under schemas/ are not being served';
const REPO_URL = 'https://github.com/flashtrace/flashtrace';
const STATE_OPEN = '<!-- schema-problems-state:';

// Identifies the problem set, not the run: the same problems seen by ten
// consecutive deploys should produce one comment, not ten. Discovery emits
// problems sorted by path, so the serialisation is stable.
export function fingerprint(problems) {
  return createHash('sha256').update(JSON.stringify(problems)).digest('hex').slice(0, 12);
}

// The body doubles as the store: no external state to keep in step with the
// issue, and a body that was hand-edited into nonsense degrades to "unknown
// previous state" rather than to a wrong diff.
export function embedState(problems) {
  // Escaping > means the payload can never contain --> and close the comment
  // early. A reason quoting a parser error is not a controlled string.
  const json = JSON.stringify({ fingerprint: fingerprint(problems), problems }).replace(/>/g, '\\u003e');
  return `${STATE_OPEN}${json} -->`;
}

export function readState(body) {
  const at = (body ?? '').indexOf(STATE_OPEN);
  if (at === -1) return null;
  const start = at + STATE_OPEN.length;
  const end = body.indexOf('-->', start);
  if (end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end).trim());
  } catch {
    return null;
  }
}

// Keyed by path, so a file whose reason changed reads as one changed entry
// rather than as a simultaneous disappearance and arrival.
export function diffProblems(prev, next) {
  const was = new Map(prev.map((p) => [p.path, p.reason]));
  const now = new Map(next.map((p) => [p.path, p.reason]));
  return {
    added: next.filter((p) => !was.has(p.path)),
    removed: prev.filter((p) => !now.has(p.path)),
    changed: next.filter((p) => was.has(p.path) && was.get(p.path) !== p.reason),
  };
}

// A reason is often a parser's own words, so it can hold a pipe or a newline
// and quietly wreck the row it sits in.
const cell = (s) => String(s).replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|');

const table = (problems) => [
  '| File | Why it was skipped |',
  '|---|---|',
  ...problems.map((p) => `| \`schemas/${cell(p.path)}\` | ${cell(p.reason)} |`),
];

const runNote = (runUrl, verb) => (runUrl ? [`<sub>${verb} by [this run](${runUrl}).</sub>`] : []);

export function issueBody({ version, served, problems, runUrl }) {
  return [
    'Some files under `schemas/` are not being served by the site. The site itself deployed normally - this is only about the files below.',
    '',
    `**To fix:** correct it upstream in [flashtrace/flashtrace](${REPO_URL}) and cut a release, or adjust \`src/schemas.mjs\` here if the layout changed on purpose.`,
    '',
    `### Not being served, as of \`${version}\``,
    '',
    ...table(problems),
    '',
    `${served} schema(s) went out normally.`,
    '',
    '<sub>Maintained by the deploy workflow. This table always reflects the most recent build, each change is recorded as a comment below, and the issue closes itself once a build finds nothing wrong. Edits to this body are overwritten.</sub>',
    ...runNote(runUrl, 'Updated'),
    '',
    embedState(problems),
  ].join('\n');
}

export function resolvedBody({ version, runUrl }) {
  return [
    `**Resolved.** Every file under \`schemas/\` is being served again as of \`${version}\`.`,
    '',
    'What was wrong, and when it changed, is in the comments below.',
    '',
    ...runNote(runUrl, 'Closed'),
  ].join('\n');
}

export function changeComment({ version, diff, runUrl }) {
  const lines = [`Rebuilt at \`${version}\`, and the problems changed.`, ''];
  if (diff.added.length > 0) {
    lines.push(`**No longer served (${diff.added.length})**`, '', ...table(diff.added), '');
  }
  if (diff.changed.length > 0) {
    lines.push(`**Still not served, for a different reason (${diff.changed.length})**`, '', ...table(diff.changed), '');
  }
  if (diff.removed.length > 0) {
    lines.push(
      `**Served again (${diff.removed.length})**`,
      '',
      ...diff.removed.map((p) => `- \`schemas/${p.path}\``),
      '',
    );
  }
  lines.push('The issue body above now shows the full current state.', '', ...runNote(runUrl, 'Updated'));
  return lines.join('\n');
}

export function closeComment({ version, resolved, runUrl }) {
  const lines = [`Rebuilt at \`${version}\` with nothing skipped - closing.`, ''];
  if (resolved.length > 0) {
    lines.push(
      `**Served again (${resolved.length})**`,
      '',
      ...resolved.map((p) => `- \`schemas/${p.path}\``),
      '',
    );
  }
  lines.push(...runNote(runUrl, 'Closed'));
  return lines.join('\n');
}

// Returns a short tag for what it did, so a caller can assert on the decision
// rather than on log text.
export function report({ data, gh, log = console.log, reportIssue = false, runUrl }) {
  const { version = 'unknown', schemas: served = 0, problems = [] } = data;

  // Annotations cost no permissions and land on the run itself, so they happen
  // whether or not this workflow may touch issues.
  for (const p of problems) {
    log(`::warning title=Schema not served::schemas/${p.path} ${p.reason}`);
  }

  if (!reportIssue) {
    log(`${problems.length} problem(s) in ${version}; issue reporting is off for this workflow`);
    return 'annotated';
  }

  const open = JSON.parse(gh('issue', 'list', '--state', 'open', '--label', LABEL, '--limit', '1', '--json', 'number'));
  const existing = open[0]?.number;
  // null when there is no issue, or when its body no longer carries a state -
  // both mean "cannot diff", which is different from "diffed to nothing".
  const previous = existing
    ? readState(JSON.parse(gh('issue', 'view', String(existing), '--json', 'body')).body)?.problems ?? null
    : null;

  if (problems.length === 0) {
    if (!existing) {
      log('clean build - nothing to report');
      return 'clean';
    }
    // Body first: a reader arriving from the close notification should not
    // find a table of problems that no longer exist.
    gh('issue', 'edit', String(existing), '--body', resolvedBody({ version, runUrl }));
    gh('issue', 'close', String(existing), '--comment',
      closeComment({ version, resolved: previous ?? [], runUrl }));
    log(`clean build - closed #${existing}`);
    return 'closed';
  }

  if (!existing) {
    // --force so a missing label is created and an existing one left usable,
    // rather than the first report ever filed failing on a label nobody made.
    gh('label', 'create', LABEL, '--color', 'd93f0b', '--force',
      '--description', 'A schema under schemas/ is not being served');
    gh('issue', 'create', '--title', TITLE, '--label', LABEL,
      '--body', issueBody({ version, served, problems, runUrl }));
    log(`opened a tracking issue for ${problems.length} problem(s)`);
    return 'opened';
  }

  if (previous && fingerprint(previous) === fingerprint(problems)) {
    log(`#${existing} already reports exactly these ${problems.length} problem(s) - staying quiet`);
    return 'unchanged';
  }

  gh('issue', 'edit', String(existing), '--body', issueBody({ version, served, problems, runUrl }));
  gh('issue', 'comment', String(existing), '--body',
    changeComment({ version, diff: diffProblems(previous ?? [], problems), runUrl }));
  log(`problem set changed - updated #${existing}`);
  return 'updated';
}

// Only when run as a program: importing this module must never be able to
// reach the real gh.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const REPORT = 'schema-problems.json';
  if (!existsSync(REPORT)) {
    // The build failed before schema discovery. Whatever went wrong, it is not
    // this script's story to tell, and staying silent avoids closing a real
    // issue on the strength of a build that never looked.
    console.log(`no ${REPORT} - the build did not reach schema discovery, so there is nothing to report`);
    process.exit(0);
  }
  const { GITHUB_SERVER_URL = 'https://github.com', GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  report({
    data: JSON.parse(readFileSync(REPORT, 'utf8')),
    gh: (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim(),
    reportIssue: process.env.REPORT_ISSUE === '1',
    runUrl: GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : undefined,
  });
}
