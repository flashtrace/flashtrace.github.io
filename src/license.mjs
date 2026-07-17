// License page - renders the tool repo's LICENSE (plain text, pre-formatted
// with spaces for centering) verbatim inside the site shell.
import { esc, pageShell } from './layout.mjs';

export function renderLicense({ version, text }) {
  const body = `<main class="section" id="main">
<div class="doc-content legal">
<h1>License</h1>
<pre>${esc(text)}</pre>
</div>
</main>`;
  return pageShell({
    title: 'License · flashtrace',
    description: 'The Apache License, Version 2.0 that flashtrace is distributed under.',
    path: '/license/',
    version,
    active: '',
    body,
    bodyClass: 'page-legal',
  });
}
