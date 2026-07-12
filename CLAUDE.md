# Agent Guide

This repository contains the representative and documentation website for [flashtrace](https://github.com/flashtrace/flashtrace), a "lightning-fast, reference-based requirement tracing" suite.
In the following you will be introduced to some helpful structural guidance as well as hard constraints.

First of all:
Work professionally, remember to use modern day best practices and stay focused.
Feel free to tell a user when their tasks seems unscoped or ambiguous.
Ask refining questions before you start writing.

## The Repository Structure

| Folder | Purpose |
|---|---|
| src/ | Source code, used from 'build.mjs' to create 'dist/' |
| public/ | Assets that should be included exactly as they are in the final 'dist/' |
| dist/ | Uncommitted, generated build output |
| flashtrace/ | Uncommitted, gitignored clone of [flashtrace/flashtrace](https://github.com/flashtrace/flashtrace); its 'docs/' are a required build input |
| .github/ | Continuous integration/deployment workflows |

'build.mjs' renders the tool repo's 'docs/' into the site, so a build needs access to them.
It looks for the docs at `$FLASHTRACE_DOCS`, then './flashtrace/docs', then '../flashtrace/docs' - if none exist, clone the tool repo first: `git clone https://github.com/flashtrace/flashtrace`.

Keep dev dependencies to a minimum.
Keep (runtime) dependencies to zero.

## The Commands

| Cmd | Purpose |
|---|---|
| `pnpm build` | Build the website with 'build.mjs' (which is using 'src/' and 'marked' being the sole dependency) into 'dist/'. |
| `pnpm dev`   | Live-rebuilds on changes and serves the website from 'dist/' for local testing. |
| `pnpm clean` | Wipes 'dist/' gracefully. |

## Your workflow

Work in small chunks.
Commit regularly on proper (preliminary) results.
Follow conventional commits, that means use the format `<type>: <short description of work>` for every commit.
You can add a descriptive body too.
Adapt a similar pattern for branch naming.

We are using merging over Pull Requests from feature-branches.
Every PR is being merged in as a commit; we do not squash the commits nor do we rebase anything directly on top of main without a merge commit.
Remember to have one branch focused on one change.
Suggest to split into multiple if applicable.

`dist/` stays uncommitted, it should however always be buildable without issues before committing any source.
Note that the output can change without any local changes, as this also depends on `flashtrace/flashtrace`'s version.
On production of this website, this is automatically updated through the `deploy.yml` workflow being dispatched from the release workflow of `flashtrace/flashtrace`.

We do NOT maintain a `package.json` version here, as this repository is not published as a package anywhere; deployments happen on either a merge into main or automatically on a new `flashtrace/flashtrace` release (to update the docs and versioning).

## Parallel work with git worktrees

One task = one branch = one worktree = one session.
All rules apply unchanged inside every worktree.

- Create worktrees as siblings of the main checkout: `git worktree add ..\flashtrace.github.io-wt\<branch-dir> -b <type>/<description> origin/main`
- Run `pnpm install` in a fresh worktree before building or testing; node_modules is per-worktree (pnpm's store makes this fast).
- The flashtrace clone is not shared into worktrees ('../flashtrace' resolves to the worktree's parent, not the main checkout). Point `FLASHTRACE_DOCS` at the main checkout's clone (e.g. `$env:FLASHTRACE_DOCS = "C:\your\path\to\flashtrace.github.io\flashtrace\docs"`) or clone it next to the worktree before building.
- Branch only from up-to-date `origin/main`. Never commit to `main`, and never check out or modify a branch owned by another worktree.
- Before opening a PR: Verify `pnpm build` passes.
- After your PR merges: `git worktree remove <path>` and delete the branch.
