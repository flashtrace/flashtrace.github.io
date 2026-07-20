# Keeping the site in lock-step with the tool

This website documents [flashtrace](https://github.com/flashtrace/flashtrace)
and must reflect the released tool without drifting from it. This note records
the coupling strategy: how the two repositories stay connected, and where the
seams are drawn.

## The guiding principle: a shared contract, not shared code

The two repos are deliberately **not** merged into a monorepo, and the site
does **not** vendor the tool's source. Instead they meet at a small, stable
**contract** that the tool repo already publishes as ordinary files:

| Tool-repo artifact | The site reads it as | Consumed by |
|---|---|---|
| `docs/index.md` | the doc set and its nav order | `build.mjs` (nav derivation) |
| `docs/*.md` | the documentation pages | `build.mjs` (`renderDoc`) |
| `examples/<name>/` | real, runnable example projects | landing "See it trace" inputs |
| `test/e2e-expect/<name>.<variant>.txt` | the exact report each example produces | landing "See it trace" output |
| `package.json` version / release tag | the version label and deep-links | header badge, footer, provenance |
| `LICENSE` | the license page | `build.mjs` (`renderLicense`) |

The tool repo owns **what** is shown (its docs, its examples, its version); the
site owns **how** it is shown (layout, theming, editorial framing). Neither
hardcodes the other's content. This is the middle ground between "fully
coupled" (a monorepo, which the projects avoid) and "fully decoupled" (copying
content across, which drifts): a thin published contract, consumed at build
time, versioned by the release tag the CI checks out.

Provenance closes the loop: production always builds against a **release tag**
(see `.github/workflows/deploy.yml`), never `main`, and the tool's release
workflow fires a `repository_dispatch` here so a new tool release redeploys the
site automatically.

## What changed (examples, done)

The landing "See it trace" examples used to be hand-captured strings pinned to
a flashtrace **v0.7.0** run. They drifted silently as the tool advanced to
v0.10.0. They now load from the contract above:

- inputs from `examples/<dir>/`,
- output from the byte-verified `test/e2e-expect/<dir>.<variant>.txt` snapshot
  (the very report the tool's own e2e suite asserts against), with the shipped
  CLI run over a throwaway copy as a fallback if a snapshot is absent.

`src/examples.mjs` keeps only the editorial layer: which projects to feature
and their titles/blurbs. Result: zero drift, and a provenance line that names
the version and links to the examples.

## Roadmap (proposed)

Ordered by value. Each notes whether it needs a change in the **tool** repo.

### 1. Derive the doc nav groups from `index.md` structure — site-only

Today the sidebar groups ("Getting started", "Specification") are hardcoded in
`build.mjs`, and only pages linked from `index.md` are rendered. If flashtrace
grows **implementation-near docs** (e.g. an "Internals" section), the site
should pick them up automatically. Make nav derivation read the heading
structure of `index.md` (each `##` becomes a group, its list items the pages),
so a new section in the tool's docs flows through with no site change. This
keeps `index.md` the single source of truth it already aspires to be.

### 2. A machine-readable site manifest in the tool repo — needs tool-repo change

Nav order is currently recovered by **regex-scraping** `index.md`, and the set
of featured examples lives in the site. Both work, but the coupling is
*incidental*. A tiny, explicit manifest in the tool repo — e.g.
`docs/site.json` or `examples/index.json` — would make it *intentional*:

```jsonc
{
  "nav": [
    { "group": "Getting started", "pages": ["USAGE"] },
    { "group": "Specification", "pages": ["item-ids", "revisions", "..."] }
  ],
  "featured": [
    { "example": "basic", "variant": "verbose", "title": "A clean trace" }
  ]
}
```

The site would consume the manifest when present and fall back to today's
derivation when absent (older tool checkouts). This lets the tool repo curate
its own presentation without the site guessing, and is the cleanest answer to
"couple them better without merging them". Best proposed as an issue/PR on
`flashtrace/flashtrace`; the site can ship the consumer side first.

### 3. Richer interactivity on the example set — site-only

The pre-baked input/output flip is the right model (the CLI needs `node:fs` +
git, so real in-browser execution is out for now). Incremental additions:

- link report lines (`login.ts:1`) to the exact line in the input pane;
- a "copy this project" affordance that scaffolds the example files locally;
- surface more of the shipped examples (e.g. `shortforms`) behind the tabs.

### 4. Diagnostics as living documentation — site-only

`examples/diagnostics/` enumerates every defect kind flashtrace reports and is
kept correct by the e2e suite. Beyond the landing teaser, a dedicated
"What flashtrace catches" page could render each defect with its cause and the
exact reported line — documentation that cannot go stale, because it is built
from the same verified snapshots.

## Non-goals

- **No monorepo.** The contract is the coupling; merging the repos is not.
- **No runtime dependencies** and minimal dev dependencies (`marked` only).
- **No hand-copied tool content.** Anything sourced from the tool is read at
  build time from the contract, so it tracks the released version by construction.
