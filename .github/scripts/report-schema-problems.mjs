// Turns the build's schema-problems.json into something a person will notice.
//
// A file the site cannot serve is skipped rather than fatal (see build.mjs), so
// a broken schema otherwise leaves no trace in a green deploy. This closes that
// gap: run annotations always, plus - where the caller sets REPORT_ISSUE=1 and
// the workflow grants issues:write - a single tracking issue that opens itself
// on the first bad build, updates when the problem set changes, stays quiet
// when it has not, and closes itself once the build is clean again.
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

// Identifies the problem set, not the run: the same problems seen by ten
// consecutive deploys should produce one comment, not ten. Discovery emits
// problems sorted by path, so the serialisation is stable.
export function fingerprint(problems) {
  return createHash('sha256').update(JSON.stringify(problems)).digest('hex').slice(0, 12);
}

export function issueBody({ version, served, problems }) {
  return [
    `The site build skipped these files under \`schemas/\` while building \`${version}\`. They are **not being served**:`,
    '',
    '| File | Why it was skipped |',
    '|---|---|',
    ...problems.map((p) => `| \`schemas/${p.path}\` | ${p.reason} |`),
    '',
    `The deploy itself succeeded and ${served} schema(s) went out normally, so the site is current - this is only about the files above.`,
    '',
    `Fix it upstream in [flashtrace/flashtrace](${REPO_URL}) and cut a release, or adjust \`src/schemas.mjs\` here if the layout changed on purpose. This issue closes itself on the first clean build.`,
    '',
    `<!-- schema-problems: ${fingerprint(problems)} -->`,
  ].join('\n');
}

// Returns a short tag for what it did, so a caller can assert on the decision
// rather than on log text.
export function report({ data, gh, log = console.log, reportIssue = false }) {
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

  if (problems.length === 0) {
    if (!existing) {
      log('clean build - nothing to report');
      return 'clean';
    }
    gh('issue', 'close', String(existing), '--comment',
      `Every file under \`schemas/\` is being served again as of \`${version}\`. Closing automatically.`);
    log(`clean build - closed #${existing}`);
    return 'closed';
  }

  const body = issueBody({ version, served, problems });

  // --force so a missing label is created and an existing one left usable,
  // rather than the first report ever filed failing on a label nobody made yet.
  gh('label', 'create', LABEL, '--color', 'd93f0b', '--force',
    '--description', 'A schema under schemas/ is not being served');

  if (!existing) {
    gh('issue', 'create', '--title', TITLE, '--label', LABEL, '--body', body);
    log(`opened a tracking issue for ${problems.length} problem(s)`);
    return 'opened';
  }

  const issue = JSON.parse(gh('issue', 'view', String(existing), '--json', 'body,comments'));
  const said = [issue.body, ...issue.comments.map((c) => c.body)].join('\n');
  if (said.includes(fingerprint(problems))) {
    log(`#${existing} already reports exactly these ${problems.length} problem(s) - staying quiet`);
    return 'unchanged';
  }

  gh('issue', 'comment', String(existing), '--body', body);
  log(`problem set changed - commented on #${existing}`);
  return 'commented';
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
  report({
    data: JSON.parse(readFileSync(REPORT, 'utf8')),
    gh: (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim(),
    reportIssue: process.env.REPORT_ISSUE === '1',
  });
}
