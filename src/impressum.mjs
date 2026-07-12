// Legal notice (Impressum) - a fully static, hand-written page. Required to be
// reachable from every page under German law (§5 DDG); linked from the footer.
import { esc, pageShell } from './layout.mjs';

export function renderImpressum({ version }) {
  const body = `<main class="section" id="main">
<div class="doc-content legal">
<h1>Legal Notice</h1>

<h2>Provider</h2>
<address>
Lennard Solterbeck<br>
c/o Block Services<br>
Stuttgarter Str. 106<br>
70736 Fellbach<br>
Germany
</address>

<h2>Contact</h2>
<p>Phone: available on request via email<br>
Email: <a href="mailto:mentorfilou@gmail.com">mentorfilou@gmail.com</a></p>

<h2>Editorial responsibility</h2>
<address>
Lennard Solterbeck and <a href="https://github.com/orgs/flashtrace/people">the flashtrace team</a>
</address>
</div>
</main>`;
  return pageShell({
    title: 'Legal Notice · flashtrace',
    description: 'Legal notice (Impressum) for the flashtrace website.',
    path: '/impressum/',
    version,
    active: '',
    body,
    bodyClass: 'page-legal',
  });
}
