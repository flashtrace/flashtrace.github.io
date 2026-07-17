// node:process replacement. argv is seeded by the tutorial worker via
// globalThis.__ftArgv; exit() throws an ExitSignal - the bundle's CLI path
// always terminates through process.exit(), so the worker treats the first
// signal it observes as the run's exit code.
export class ExitSignal extends Error {
  constructor(code) {
    super(`flashtrace exited with code ${code}`);
    this.name = 'ExitSignal';
    this.code = code;
  }
}

// The worker identifies signals through this global rather than importing the
// (build-time copied) shim module a second time.
globalThis.__FtExitSignal = ExitSignal;

const processShim = {
  get argv() {
    return globalThis.__ftArgv ?? ['node', '/flashtrace.mjs', '/project'];
  },
  cwd: () => '/project',
  env: {},
  // 'linux' keeps findGit() probing /usr/bin/git & /bin/git, which the vfs
  // answers false - the CLI then takes its documented no-git directory walk.
  platform: 'linux',
  stdout: { isTTY: false }, // disables ANSI coloring; the page colorizes as HTML
  exit(code = 0) {
    throw new ExitSignal(code);
  },
};

export default processShim;
