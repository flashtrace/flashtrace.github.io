// node:child_process replacement. Never reached in practice: the bundle only
// spawns git after findGit() finds a binary via existsSync probes, which the
// in-memory fs answers false. Throwing (instead of silently returning nothing)
// still lands in the CLI's try/catch around the git call, which falls back to
// the plain directory walk - and makes any future unexpected use visible.
export function execFileSync() {
  throw new Error('child_process is not available in the browser sandbox');
}

export default { execFileSync };
