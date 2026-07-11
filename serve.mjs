// Tiny dev server: builds once, rebuilds on changes to build inputs, serves
// dist/ with clean URLs. Node stdlib only — not used in CI or production.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, watch } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 8788;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function build() {
  const res = spawnSync(process.execPath, [path.join(root, 'build.mjs')], { stdio: 'inherit' });
  if (res.status !== 0) console.error('build failed — still serving the previous output');
}

build();

let pending = null;
for (const dir of ['src', 'public']) {
  watch(path.join(root, dir), { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(build, 100);
  });
}
watch(path.join(root, 'build.mjs'), () => {
  clearTimeout(pending);
  pending = setTimeout(build, 100);
});

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let file = path.join(dist, path.normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    else if (!path.extname(file) && existsSync(path.join(file, 'index.html')))
      file = path.join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404 not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  })
  .listen(port, () => console.log(`serving dist/ on http://localhost:${port}`));
