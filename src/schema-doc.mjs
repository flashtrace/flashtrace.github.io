// Renders a JSON Schema into a human-readable docs page, one section per
// version. Everything on the page comes from the schema file, so it cannot
// drift from what is actually served at /schemas/.
//
// Deliberately strict: a keyword the renderer does not understand fails the
// build, naming its JSON pointer. A page that silently omits a constraint is
// worse than a missing page.
import { docShell, esc, SITE_URL } from './layout.mjs';

// Every keyword this renderer knows how to display. Extending the set means
// deciding how the new constraint appears on the page - never widen it just to
// get a build green.
const KNOWN_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'items',
  'enum',
  'const',
  'minimum',
  'oneOf',
  'allOf',
  'if',
  'then',
]);

// Keywords whose values are subschemas, by shape.
const SUBSCHEMA_MAPS = ['properties', '$defs']; // name -> subschema
const SUBSCHEMA_SINGLES = ['items', 'if', 'then']; // subschema
const SUBSCHEMA_LISTS = ['oneOf', 'allOf']; // [subschema]

const ptr = (base, token) => `${base}/${String(token).replaceAll('~', '~0').replaceAll('/', '~1')}`;

// --- validation --------------------------------------------------------------

function findUnknown(node, pointer, bad) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
  for (const key of Object.keys(node)) {
    if (!KNOWN_KEYWORDS.has(key)) bad.push(ptr(pointer, key));
  }
  for (const key of SUBSCHEMA_MAPS) {
    for (const [name, sub] of Object.entries(node[key] ?? {})) {
      findUnknown(sub, ptr(ptr(pointer, key), name), bad);
    }
  }
  for (const key of SUBSCHEMA_SINGLES) {
    if (node[key] !== undefined) findUnknown(node[key], ptr(pointer, key), bad);
  }
  for (const key of SUBSCHEMA_LISTS) {
    (node[key] ?? []).forEach((sub, i) => findUnknown(sub, ptr(ptr(pointer, key), i), bad));
  }
}

function assertRenderable(schema, label) {
  const bad = [];
  findUnknown(schema, '#', bad);
  if (bad.length > 0) {
    throw new Error(
      `${label}: unsupported JSON Schema keyword(s) at:\n` +
        bad.map((p) => `  ${p}`).join('\n') +
        '\nTeach src/schema-doc.mjs how to render them, then rebuild.',
    );
  }
}

// --- $ref resolution ---------------------------------------------------------

// Only local pointers into $defs; the schemas in this family have no others,
// and a remote ref would need fetching at build time.
function refName(ref, pointer) {
  const m = /^#\/\$defs\/([^/]+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref "${ref}" at ${pointer} - only #/$defs/<name> is resolvable`);
  return m[1];
}

function resolveRef(schema, ref, pointer) {
  const name = refName(ref, pointer);
  const target = schema.$defs?.[name];
  if (!target) throw new Error(`$ref "${ref}" at ${pointer} does not resolve - no such entry in $defs`);
  return { name, node: target };
}

// --- type + description rendering -------------------------------------------

const lit = (v) => `<code>${esc(JSON.stringify(v))}</code>`;

function typeHtml(schema, node, pointer, anchorPrefix) {
  if (node.$ref) {
    const name = refName(node.$ref, pointer);
    return `<a href="#${anchorPrefix}-${esc(name)}"><code>${esc(name)}</code></a>`;
  }
  if (node.oneOf) {
    return node.oneOf
      .map((sub, i) => typeHtml(schema, sub, ptr(ptr(pointer, 'oneOf'), i), anchorPrefix))
      .join(' | ');
  }
  if (node.const !== undefined) return `${lit(node.const)} (constant)`;
  if (node.enum) return node.enum.map(lit).join(' | ');

  const { type } = node;
  let base;
  if (Array.isArray(type)) base = type.map((t) => `<code>${esc(t)}</code>`).join(' | ');
  else if (type === 'array' && node.items) {
    base = `array of ${typeHtml(schema, node.items, ptr(pointer, 'items'), anchorPrefix)}`;
  } else if (type) base = `<code>${esc(type)}</code>`;
  else base = '<code>any</code>';

  if (node.minimum !== undefined) base += ` (min ${esc(node.minimum)})`;
  return base;
}

// A property that is just a $ref carries no description of its own; the prose
// lives on the $defs entry it points at.
function descriptionFor(schema, node, pointer) {
  if (node.description) return node.description;
  if (node.$ref) return resolveRef(schema, node.$ref, pointer).node.description ?? '';
  return '';
}

// --- conditional requirements (allOf / if-then) ------------------------------

// `mode` is `"rich"` - the human form of an if-branch.
function conditionLabel(ifNode, pointer) {
  const parts = Object.entries(ifNode.properties ?? {}).map(([name, sub]) => {
    if (sub.const !== undefined) return `<code>${esc(name)}</code> is ${lit(sub.const)}`;
    if (sub.enum) return `<code>${esc(name)}</code> is one of ${sub.enum.map(lit).join(' | ')}`;
    throw new Error(`unsupported if-condition on "${name}" at ${pointer} - expected const or enum`);
  });
  if (parts.length === 0) throw new Error(`empty if-condition at ${pointer}`);
  return parts.join(' and ');
}

// Walks the `then` branch alongside the base schema by instance location, so a
// nested requirement lands on the table that actually renders that instance.
// `properties.items.items.required: ["wantedBy"]` resolves through the $ref on
// the array's element schema and annotates the `item` definition.
function walkThen(schema, baseNode, thenNode, target, condition, out, pointer) {
  let base = baseNode;
  let scope = target;
  if (base?.$ref) {
    const resolved = resolveRef(schema, base.$ref, pointer);
    base = resolved.node;
    scope = resolved.name;
  }
  for (const key of Object.keys(thenNode)) {
    if (!['required', 'properties', 'items'].includes(key)) {
      throw new Error(`unsupported keyword "${key}" in a then-branch at ${ptr(pointer, key)}`);
    }
  }
  for (const field of thenNode.required ?? []) out.push({ target: scope, field, condition });
  for (const [name, sub] of Object.entries(thenNode.properties ?? {})) {
    const p = ptr(ptr(pointer, 'properties'), name);
    walkThen(schema, base?.properties?.[name] ?? {}, sub, scope, condition, out, p);
  }
  if (thenNode.items) {
    walkThen(schema, base?.items ?? {}, thenNode.items, scope, condition, out, ptr(pointer, 'items'));
  }
}

// Map<target, Map<field, condition>>; target is a $defs name or 'root'.
function collectConditionals(schema) {
  const flat = [];
  (schema.allOf ?? []).forEach((entry, i) => {
    const p = ptr(ptr('#', 'allOf'), i);
    if (!entry.if || !entry.then) {
      throw new Error(`unsupported allOf entry at ${p} - only if/then conditionals are rendered`);
    }
    walkThen(schema, schema, entry.then, 'root', conditionLabel(entry.if, ptr(p, 'if')), flat, ptr(p, 'then'));
  });
  const byTarget = new Map();
  for (const { target, field, condition } of flat) {
    if (!byTarget.has(target)) byTarget.set(target, new Map());
    byTarget.get(target).set(field, condition);
  }
  return byTarget;
}

// --- tables ------------------------------------------------------------------

function propertyTable(schema, node, pointer, anchorPrefix, conditionals) {
  const required = new Set(node.required ?? []);
  const rows = Object.entries(node.properties ?? {}).map(([name, sub]) => {
    const p = ptr(ptr(pointer, 'properties'), name);
    const condition = conditionals?.get(name);
    let req;
    if (required.has(name)) req = 'Required';
    else if (condition) req = `Required when ${condition}`;
    else req = 'Optional';
    return `<tr>
<td><code>${esc(name)}</code></td>
<td>${typeHtml(schema, sub, p, anchorPrefix)}</td>
<td>${req}</td>
<td>${esc(descriptionFor(schema, sub, p))}</td>
</tr>`;
  });
  if (rows.length === 0) return '';
  return `<table>
<thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>`;
}

// --- page --------------------------------------------------------------------

function versionSection(schemaEntry, entry, toc) {
  const { json: schema, version, file } = entry;
  const label = `v${version}`;
  assertRenderable(schema, `${schemaEntry.name}/${file}`);
  const conditionals = collectConditionals(schema);
  const canonical = `${SITE_URL}/schemas/${schemaEntry.name}/${file}`;
  const isLatest = entry === schemaEntry.latest;
  // Every version ships in the page; the picker only chooses which one shows.
  // The latest is marked current in the markup, so it is what paints first and
  // what a reader without JS lands on above the older ones.
  const heading = (id, text, level) => {
    toc.push({ id, text, level, version: label, current: isLatest });
    return `<h${level} id="${id}">${text}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  };

  const parts = [];
  parts.push(heading(label, `Version ${version}`, 2));

  const urls = [`<li><a href="/schemas/${schemaEntry.name}/${file}"><code class="schema-url">${esc(canonical)}</code></a></li>`];
  if (isLatest) {
    urls.push(
      `<li><a href="/schemas/${schemaEntry.name}/latest.json"><code class="schema-url">${esc(`${SITE_URL}/schemas/${schemaEntry.name}/latest.json`)}</code></a> - byte-identical alias, moves with the highest version</li>`,
    );
  }
  parts.push(`<ul>${urls.join('')}</ul>`);

  if (schema.title) parts.push(`<p><strong>${esc(schema.title)}</strong></p>`);
  if (schema.description) parts.push(`<p>${esc(schema.description)}</p>`);

  parts.push(
    `<blockquote><p><code>additionalProperties</code> is deliberately left unconstrained. Additive changes do not bump the version, so validating a newer document against this schema must not fail on fields it does not list.</p></blockquote>`,
  );

  parts.push(heading(`${label}-properties`, 'Top-level properties', 3));
  parts.push(propertyTable(schema, schema, '#', label, conditionals.get('root')));

  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    const p = ptr(ptr('#', '$defs'), name);
    parts.push(heading(`${label}-${name}`, `<code>${esc(name)}</code>`, 3));
    if (def.description) parts.push(`<p>${esc(def.description)}</p>`);
    const table = propertyTable(schema, def, p, label, conditionals.get(name));
    // Scalar definitions (a constrained string, say) have no properties table;
    // their type is the whole statement.
    parts.push(table || `<p>Type: ${typeHtml(schema, def, p, label)}</p>`);
  }

  return `<section class="schema-version${isLatest ? ' is-current' : ''}" data-version="${label}" aria-label="Version ${version}">
${parts.join('\n')}
</section>`;
}

// A <select>, not tabs: version counts grow without bound and a picker stays
// one line at ten versions. Rendered only when there is something to pick.
//
// It sits on the title line rather than in the right rail: the rail is
// display:none under 1100px, which would strand the only way to change version
// on every tablet and phone. Option labels are short (v10) so the control fits
// beside the heading, and they match the anchors (#v10) while the section
// heading below still spells out "Version 10".
function versionPicker(schema) {
  if (schema.versions.length < 2) return '';
  const options = [...schema.versions]
    .reverse()
    .map((entry) => {
      const label = `v${entry.version}`;
      const suffix = entry === schema.latest ? ' (latest)' : '';
      const selected = entry === schema.latest ? ' selected' : '';
      return `<option value="${label}"${selected}>${label}${suffix}</option>`;
    })
    .join('\n    ');
  return `<div class="version-picker">
  <label for="schema-version">Schema version</label>
  <select id="schema-version" data-version-picker>
    ${options}
  </select>
</div>`;
}

export function renderSchemaDoc({ schema, version, navGroups }) {
  const toc = [];
  // Newest version first: the current one is what a reader almost always wants.
  const sections = [...schema.versions].reverse().map((entry) => versionSection(schema, entry, toc));
  const content = `<div class="schema-header">
<h1>${esc(schema.name)} schema</h1>
${versionPicker(schema)}
</div>
<p>Machine-readable JSON Schema for the flashtrace <code>${esc(schema.name)}</code> document, served from
<code class="schema-url">${esc(SITE_URL)}/schemas/${esc(schema.name)}/</code>. This page is generated from those files.</p>
<p>The version is bumped only by breaking changes - a field removed, renamed, re-typed, or a documented
meaning changed. A new optional field does not bump it.</p>
${sections.join('\n')}`;

  return docShell({
    title: `${schema.name} schema · flashtrace`,
    description: `JSON Schema reference for the flashtrace ${schema.name} document.`,
    path: `/docs/schemas/${schema.name}/`,
    version,
    navGroups,
    toc,
    content,
  });
}
