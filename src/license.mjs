// License page - renders the tool repo's LICENSE (plain text, pre-formatted
// with spaces for centering) verbatim inside the site shell. When the text is
// recognized as Apache 2.0, a GitHub-style summary panel is shown above it;
// an unrecognized license falls back to the raw text alone rather than
// risking a wrong summary.
import { esc, pageShell } from './layout.mjs';

// Octicons (MIT): law, check, x, info.
const lawIcon = `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M12.75 2.75V4.5h1.975c.351 0 .694.106.984.303l1.697 1.154c.041.028.09.043.14.043h4.102a.75.75 0 0 1 0 1.5H20.07l3.366 7.68a.749.749 0 0 1-.23.896c-.1.074-.203.143-.31.206a6.296 6.296 0 0 1-.79.399 7.349 7.349 0 0 1-2.856.569 7.343 7.343 0 0 1-2.855-.568 6.205 6.205 0 0 1-.79-.4 3.205 3.205 0 0 1-.307-.202l-.005-.004a.749.749 0 0 1-.23-.896l3.368-7.68h-.886c-.351 0-.694-.106-.984-.303l-1.697-1.154a.246.246 0 0 0-.14-.043H12.75v14.5h4.487a.75.75 0 0 1 0 1.5H6.763a.75.75 0 0 1 0-1.5h4.487V6H9.275a.249.249 0 0 0-.14.043L7.439 7.197c-.29.197-.633.303-.984.303h-.886l3.368 7.68a.75.75 0 0 1-.209.878c-.08.065-.16.126-.31.223a6.077 6.077 0 0 1-.792.433 6.924 6.924 0 0 1-2.876.62 6.913 6.913 0 0 1-2.876-.62 6.077 6.077 0 0 1-.792-.433 3.483 3.483 0 0 1-.309-.221.762.762 0 0 1-.21-.88L3.93 7.5H2.353a.75.75 0 0 1 0-1.5h4.102c.05 0 .099-.015.141-.043l1.695-1.154c.29-.198.634-.303.985-.303h1.974V2.75a.75.75 0 0 1 1.5 0ZM2.193 15.198a5.414 5.414 0 0 0 2.557.635 5.414 5.414 0 0 0 2.557-.635L4.75 9.368Zm14.51-.024c.082.04.174.083.275.126.53.223 1.305.45 2.272.45a5.847 5.847 0 0 0 2.547-.576L19.25 9.367Z"/></svg>`;
const checkIcon = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`;
const xIcon = `<svg viewBox="0 0 12 12" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M2.22 2.22a.749.749 0 0 1 1.06 0L6 4.939 8.72 2.22a.749.749 0 1 1 1.06 1.06L7.061 6 9.78 8.72a.749.749 0 1 1-1.06 1.06L6 7.061 3.28 9.78a.749.749 0 1 1-1.06-1.06L4.939 6 2.22 3.28a.749.749 0 0 1 0-1.06Z"/></svg>`;
const infoIcon = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`;

// Summary as shown by GitHub's license banner (sourced from choosealicense.com).
function apacheSummaryPanel() {
  const col = (label, cls, icon, items) => `<div class="license-col">
<p class="license-col-label">${label}</p>
<ul>${items.map((it) => `<li class="${cls}">${icon}<span>${esc(it)}</span></li>`).join('\n')}</ul>
</div>`;
  return `<section class="license-summary" aria-label="License summary">
<div class="license-summary-head">
${lawIcon}
<div>
<p class="license-summary-kicker">flashtrace is licensed under the</p>
<p class="license-summary-name">Apache License 2.0</p>
</div>
</div>
<p class="license-summary-desc">A permissive license whose main conditions require preservation of copyright and license notices. Contributors provide an express grant of patent rights. Licensed works, modifications, and larger works may be distributed under different terms and without source code.</p>
<div class="license-summary-cols">
${col('Permissions', 'lic-ok', checkIcon, ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'])}
${col('Limitations', 'lic-no', xIcon, ['Trademark use', 'Liability', 'Warranty'])}
${col('Conditions', 'lic-info', infoIcon, ['License and copyright notice', 'State changes'])}
</div>
<p class="license-summary-note">This is not legal advice. <a href="https://choosealicense.com/licenses/apache-2.0/" rel="external">Learn more about the Apache License 2.0</a>.</p>
</section>`;
}

export function renderLicense({ version, text }) {
  const isApache2 = text.includes('Apache License') && text.includes('Version 2.0');
  const body = `<main class="section" id="main">
<div class="doc-content legal license-doc">
<h1>License</h1>
${isApache2 ? apacheSummaryPanel() : ''}
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
