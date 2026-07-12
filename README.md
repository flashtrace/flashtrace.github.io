# flashtrace.github.io

The website of [flashtrace](https://github.com/flashtrace/flashtrace) - a landing page plus
documentation rendered from the tool repository's `docs/`, served by GitHub Pages at
[flashtrace.github.io](https://flashtrace.github.io/).

Built in the flashtrace spirit: plain static HTML/CSS/JS, no runtime framework, and a single
build-time dependency ([marked](https://github.com/markedjs/marked)).

## How it works

- `build.mjs` reads the tool repository's `docs/` (nav order derived from `docs/index.md`),
  renders every page through `marked`, rewrites inter-doc links to clean URLs and emits a
  fully static site into `dist/`.
- The landing page (`src/landing.mjs`) is hand-written HTML: a CSS-only IDE mock in the hero,
  feature grid, curated interactive examples (`src/examples.mjs`, captured from real
  `flashtrace` runs) and the install snippets.
- `.github/workflows/deploy.yml` builds and deploys on every push to `main`, on manual
  `workflow_dispatch`, and on a `repository_dispatch` of type `flashtrace-release` that the
  tool repository fires after each release. Docs are always checked out at the release tag
  (from the dispatch payload, or the latest release otherwise) - the site documents released
  behavior, not `main`.

## Local development

```sh
git clone https://github.com/flashtrace/flashtrace ../flashtrace   # docs source, once
pnpm install
pnpm build          # emits dist/
pnpm dev            # build + watch + serve on http://localhost:8788
```

The docs directory is resolved in this order: `$FLASHTRACE_DOCS` → `./flashtrace/docs`
(the CI checkout location) → `../flashtrace/docs` (local sibling checkout). Set
`FLASHTRACE_REF` to override the version label rendered in the header and footer.

`dist/` is never committed; CI builds it fresh on every deploy.

## License

[Apache 2.0](LICENSE), like flashtrace itself.
