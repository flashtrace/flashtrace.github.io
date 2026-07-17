// node:fs over an in-memory file map - the flashtrace bundle's specifiers are
// rewritten to this module at build time. The tutorial worker seeds
// globalThis.__ftVfs (Map<absolute posix path, content>) before importing the
// bundle. Only the surface the bundle actually touches is provided; the
// build asserts the set of node builtins so upstream drift fails loudly.
const vfs = () => globalThis.__ftVfs ?? new Map();
const norm = (p) => (String(p) === '/' ? '/' : String(p).replace(/\/+$/, ''));
const isDir = (p) => p === '/' || [...vfs().keys()].some((f) => f.startsWith(norm(p) + '/'));

export const realpathSync = norm;

// findGit() probes fixed absolute git paths through this - answering false
// sends the CLI down its documented no-git directory walk.
export const existsSync = (p) => vfs().has(norm(p)) || isDir(p);

export function readFileSync(p) {
  if (!vfs().has(norm(p))) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  return vfs().get(norm(p));
}

export const promises = {
  async readFile(p) {
    return readFileSync(p);
  },
  async readdir(p, opts) {
    const prefix = norm(p) === '/' ? '/' : norm(p) + '/';
    const names = new Map();
    for (const f of vfs().keys()) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      names.set(rest.split('/')[0], !rest.includes('/'));
    }
    const entries = [...names].map(([name, file]) => ({
      name,
      isFile: () => file,
      isDirectory: () => !file,
    }));
    return opts?.withFileTypes ? entries : entries.map((e) => e.name);
  },
  async stat(p) {
    if (vfs().has(norm(p))) return { isFile: () => true, isDirectory: () => false };
    if (isDir(p)) return { isFile: () => false, isDirectory: () => true };
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  },
};

export default { realpathSync, existsSync, readFileSync, promises };
