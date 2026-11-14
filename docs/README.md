# Aztec documentation

The source of https://docs.aztec.network: a Docusaurus 3 site, hosted on Netlify. Read [CLAUDE.md](CLAUDE.md) before a change: it holds the rules every change follows. Style: [HOW_WE_WRITE_DOCS.md](HOW_WE_WRITE_DOCS.md). First contribution: [CONTRIBUTING.md](CONTRIBUTING.md). Paths below are relative to `docs/` unless they start at the repository root.

## Layout

| Path | What it holds | Production serves it |
| --- | --- | --- |
| `docs/` | Landing and other root pages | yes |
| `docs-developers/`, `docs-operate/`, `examples/`, `sidebars-developer.js`, `sidebars-operate.js` | The main dev line: pages (Docusaurus's "current" version), the code they quote, sidebars. Pinned by `aztec-node.json` | no |
| `lines/v6/` | The v6 dev line: the same set, its pin, and `lines/v6/allowed-differences.txt` | no; previews serve it at `/developers-v6/` and `/operate-v6/`, marked noindex and left out of search, `llms.txt` and the sitemap |
| `docs-participate/` | Unversioned participation pages | yes |
| `developer_versioned_docs/`, `network_versioned_docs/` and their `*_versioned_sidebars/` | Release snapshots, served as written | yes |
| `static/aztec-nr-api/<network>/`, `static/typescript-api/<network>/` | Committed API references, one folder per released version a network reads, shared by networks on that version (`src/network_docs.js`) | yes |
| `src/` | Preprocessing (`src/preprocess/`), components, theme, plugins | |
| `scripts/` | Build steps, generators, checks; their tests are in `scripts/__tests__/` | |
| `snapshots/` | URL baselines the URL checks read | |
| `docusaurus.config.js`, `netlify.toml` | Site config (docs instances, versions, link policy); Netlify build, redirects and headers | |

## Commands

Run them in `docs/`, with the Node of `.nvmrc` and the Yarn of `package.json`'s `packageManager`.

| Command | What it does |
| --- | --- |
| `yarn install` | Install. CI installs with `--immutable`. Yarn refuses a package younger than 7 days, except the first-party scopes `.yarnrc.yml` lists. |
| `yarn start` | Fetch the pinned aztec-node checkout, preprocess once, generate the dev Aztec.nr reference, serve on port 3000 (`HOST` sets the host, `--port` the port). Run `node scripts/aztec_node.mts provision nargo` once first. There is no hot reload: restart to see an edit. |
| `yarn build` | The full build and its checks, into `build/` (see below). Run `source scripts/node_options.sh` first, as CI and Netlify do, or Node prints a localStorage warning per render worker. `CONTEXT=production` builds the production layout. |
| `yarn serve` | Serve `build/`, without the `netlify.toml` redirects: `/developers` answers 404, `/developers/overview` is the page. |
| `yarn preprocess` | Expand the macros into `processed-docs/`, which is what Docusaurus reads. It loads `.env`, if present, into the build variables. |
| `yarn spellcheck` | cspell, with the words in `docs-words.txt` (add a real word there). A line's pages are checked only through `processed-docs/`, so run `yarn preprocess` first. |
| `yarn lint` | Biome (lint only, a warning fails), the `biome-baseline.json` count test, strict `tsc` over `scripts/**/*.mts` (`tsconfig.scripts.json`), shellcheck over `bootstrap.sh` and `scripts/*.sh`. |
| `yarn test` | The `node:test` unit tests of `src/` and `scripts/`. |
| `./bootstrap.sh check` | The checks that need no install, as fast CI runs them (about 1.5 minutes). |

`yarn build` runs, in order: the aztec-node fetch, `scripts/clean.sh`, preprocessing (snippets, macros, conditional blocks), spellcheck, `scripts/validate_redirect_targets.sh`, `scripts/validate_api_ref_links.sh`, the Docusaurus build (a broken link, a broken anchor or a duplicate route fails it), the markdown and `llms.txt` steps, then three checks of the output: `scripts/check_agent_readiness.mts`, `scripts/check_search_index.mts` and `scripts/check_built_site.mts`. Each check runs alone after a build: `node scripts/check_built_site.mts build`, with the build's `CONTEXT`.

## What runs when

| When | What runs | Defined in |
| --- | --- | --- |
| Every pull request (fast CI) | `./bootstrap.sh check`: all of `scripts/__tests__/*.test.mts` (line copies, page census, operate sidebar, snapshot hygiene, Netlify redirects, these guides' paths and more), `scripts/check_netlify_toml.py`, `scripts/check_source_urls.sh`, `scripts/check_static_redirects.sh`, `scripts/check_skills.sh`, `scripts/check_cli_defaults.sh` and `scripts/check_doc_references.sh` per line | `bootstrap.sh` (`check`); `docs-checks` in the root `Makefile` |
| A pull request that changes `docs/` (Netlify deploy preview) | `scripts/netlify-build.sh`: `yarn lint`, `yarn test`, a production-layout `yarn build` whose output is dropped, the dev Aztec.nr reference, the preview `yarn build`, `/commit.txt`, then `scripts/browser_smoke.mts` opens a few built pages in headless Chromium (operator config, search, the version menu, math with KaTeX's stylesheet and fonts from the site) | `netlify.toml`, `scripts/netlify-ignore-build.sh` |
| After the merge, full CI on `next` | `make docs docs-tests`: each line's examples compiled, the build, the aztec.js reference drift check, orphaned URLs against the base branch's snapshot, `check`; then spellcheck, `yarn test`, `yarn lint` and `examples/bootstrap.sh test_cmds` (below) | `bootstrap.sh`, `examples/bootstrap.sh` |
| After the merge, Netlify production | Builds `next` with `CONTEXT=production` when `docs/` changed | `scripts/netlify-ignore-build.sh` |

So the examples, the page runs, the aztec.js drift check and the orphaned-URL check run only after a merge. [CLAUDE.md](CLAUDE.md) says which to run yourself before you open a pull request.

## aztec-node code: the pin

The docs quote aztec-node (Labs) code at the commit `aztec-node.json` pins, with its toolchain versions (aztec, bb, noir, `@aztec-foundation/l1-artifacts`). Everything that reads aztec-node code (`#include_code`, `references:`, the generators, `scripts/check_doc_references.sh`) reads a checkout of that commit, never this repository's `labs/` submodule, which moves on the Foundation's schedule. Each line has its own pin (`lines/v6/aztec-node.json`) and checkout.

```bash
node scripts/aztec_node.mts fetch                    # check out each pinned commit (.aztec-node/tree, lines/v6/.aztec-node/tree)
node scripts/aztec_node.mts check                    # fail on drift between the pin, the checkout and package.json
node scripts/aztec_node.mts provision nargo bb cli   # install the pinned published toolchain into .aztec-node/
eval "$(node scripts/aztec_node.mts env)"            # export AZTEC_NODE_DIR, the versions, NARGO, BB and AZTEC
node scripts/aztec_node.mts --line v6 env            # the same for a line
node scripts/aztec_node.mts lines                    # list the lines (none when CONTEXT=production)
```

- `yarn build`, `yarn start` and `./bootstrap.sh` fetch first. `AZTEC_NODE_DIR` moves the checkout elsewhere.
- A snippet or `references:` path keeps its `labs/` prefix, which names the checkout: `labs/yarn-project/stdlib/src/interfaces/aztec-node.ts` reads `.aztec-node/tree/yarn-project/stdlib/src/interfaces/aztec-node.ts`, and its source link names aztec-node at the pinned commit.
- The examples' `Nargo.toml` path dependencies name the default checkout, so `AZTEC_NODE_DIR` does not apply to them.
- `node scripts/aztec_node.mts pin <tag>` moves a pin; [CLAUDE.md](CLAUDE.md) has the steps. `pin` needs `gh` logged in: it records the sha256 of each noir release archive in `noirArchives` once `gh attestation verify` proves noir's publish workflow built it, and `provision nargo` refuses an archive whose sha256 differs.
- `scripts/pin_doc_references.sh [--line <line>] [<old-commit>]` prints `<reference> -> <pages>` for each `labs/` reference whose files differ between the old pin (default: the line's pin at `git merge-base origin/next HEAD`) and the new one.
- `node scripts/labs_release_notes.mts <from> <to> <outdir>` (needs `gh`) writes aztec-node's GitHub release notes for the tags in `(<from>, <to>]` as `<tag>.md`, with an `index.tsv` of each tag's status.

## Macros and conditional content

Preprocessing (`src/preprocess/`) expands these in the source trees only. Snapshots are served as written, and `scripts/__tests__/snapshot_hygiene.test.mts` fails on a macro left in one.

| Macro | Renders |
| --- | --- |
| `#include_code <name> <path> <language> [noTitle,noLineNumbers,noSourceLink]` | The code between `docs:start:<name>` and `docs:end:<name>` in the file at `<path>` (from the repository root), with a source link. A `labs/` path links aztec-node at the pin; a path into `docs/node_modules/@aztec-foundation/l1-artifacts/` links that package's own release tag |
| `#release_version` | The version of the build's `RELEASE_TYPE`, without `v`: `NIGHTLY_TAG` (else `COMMIT_TAG`), `DEVNET_TAG`, `TESTNET_TAG` or `MAINNET_TAG`, else that type's version in `developer_version_config.json`, else `0.0.0` |
| `#release_network` | The `--network` value: `local-network` (nightly), `devnet`, `testnet`, `mainnet` |
| `#release_name`, `#release_label` | The release line name from `release_names.json` (`Tierra`, else `v<version>`); the full label (`Tierra (v6.0.0)`) |
| `#include_aztec_version` | The pin's `ref` (a line page: its line's pin; a release cut: `COMMIT_TAG`). A Labs version, never a ref into this repository |
| `#include_version_without_prefix` | The same without `v` |
| `#include_foundation_version`, `#include_foundation_version_without_prefix` | `v<installed @aztec-foundation/l1-artifacts version>` (a line page: its pin's), with and without `v`: for links and Nargo dependencies into this repository's `l1-contracts/` and `barretenberg/` |
| `#docs_commit` | The commit snippet links into this repository name (`DOCS_COMMIT`, else `HEAD`): for hand-written links into, and clones of, `examples/` (a line page: its own line's path) |
| `#api_ref_version` | The `static/aztec-nr-api/` folder the build's version is served from |
| `#include_devnet_version`, `#include_testnet_version`, `#include_mainnet_version` | Older per-network macros: the `*_TAG` variable, else the config's version |

In a snippet, `// highlight-next-line`, `// highlight-start` and `// highlight-end` highlight lines and `// this-will-error` marks one red; `// docs:start:a:b` puts one region in two snippets, and `// highlight-next-line:a` highlights in one of them only. Example: `#include_code connect_to_network docs/examples/ts/aztecjs_connection/index.ts typescript`.

`#if(<type>)`, `#elif(<type>)`, `#else` and `#endif` keep a block for one `RELEASE_TYPE` (`nightly`, `devnet`, `testnet`, `mainnet`). They are expanded before the version macros, so a block may hold one, and they do not nest.

Build variables: `RELEASE_TYPE` (default `mainnet`); `DOCS_COMMIT`, required whenever `RELEASE_TYPE` is set to anything but `nightly`, and on `origin/next`; the `*_TAG` variables above; `COMMIT_TAG`; `KEEP_DEVELOPER_VERSIONS=1` for a network-only cut. `CONTEXT=production` drops the dev docs and the lines.

## Versions and release cuts

- `developer_version_config.json` and `network_version_config.json` map each network to the version it reads. `src/network_docs.js` turns them into served versions and paths, and `docusaurus.config.js` writes `developer_versions.json` and `network_versions.json` from them at every load.
- `release_names.json` maps a major version to its release line name; `src/release_names.js` makes the labels.
- `scripts/update_docs_versions.sh <developer|network> [<type> <version>]` sets a mapping and reconciles it with the snapshot folders.
- A release cut is a skill run: `.claude/skills/release-docs/SKILL.md` and `.claude/skills/release-network-docs/SKILL.md`. A v6.x cut first promotes `lines/v6/` into the main paths with `scripts/promote_line.sh`.
- A fix to a released page goes into its snapshot as rendered text, and into the dev lines when the code it describes is the same there.

## Generated references

| Reference | Command | Source | Output | Needs |
| --- | --- | --- | --- | --- |
| Aztec.nr API | `yarn generate:aztec-nr-api [<version>]` | `labs/noir-projects/aztec-nr/` | `static/aztec-nr-api/<folder>/` (dev: `next`, gitignored, previews only) | `node scripts/aztec_node.mts provision nargo` |
| TypeScript API | `yarn generate:typescript-api [<version>]` | the packages in `scripts/typescript_api_generation/config.json` | `static/typescript-api/<folder>/` | the checkout's `yarn-project` built, outside `docs/` |
| Aztec.js reference page | `yarn generate:aztecjs-reference` | `labs/yarn-project/aztec.js/src/` | `docs-developers/docs/aztec-js/aztec_js_reference.md` | `node`, `python3` |
| Node JSON-RPC API | `yarn generate:node-api-reference [--target-dir <dir>]` | `labs/yarn-project/stdlib/src/interfaces/` | `docs-operate/operators/reference/node-api-reference.md` | `yarn install` |
| Operator CLI | `yarn generate:operator-cli-reference` | the installed aztec CLI's `aztec start --help` | `docs-operate/operators/reference/cli-reference.md` | the aztec CLI |

`RELEASE_TYPE` or the version string picks `<folder>` (see each generator's header). More detail: `scripts/aztec_nr_docs_generation/README.md`, `scripts/aztecjs_reference_generation/README.md`, `scripts/cli_reference_generation/CLI_DOCS_README.md`.

## Examples and page tests

`examples/` holds the code the pages quote. `examples/bootstrap.sh` compiles the Noir circuits and contracts and the Solidity, type-checks the TypeScript examples and builds the webapp tutorial, with the pinned published toolchain. `examples/bootstrap.sh --line v6` does the same for a line, in a copy staged outside the repository, because nargo takes the topmost `Nargo.toml` as its workspace. The stage is new on every run, so run a line's build whole: a single step such as `validate-ts` finds no compiled contracts, unless `DOCS_LINE_STAGE=<dir>` keeps one stage across runs. Its subcommands, which `examples/bootstrap.sh test_cmds` lists for full CI:

- `execute [1|2]`: runs one half of main's examples, `HALF_1` or `HALF_2` in `examples/ts/aztecjs_runner/run.sh`, against a local network, in a compose project of its own (`examples/ts/docker-compose.yml`), as the checkout's owner. Full CI runs both halves at once; with no half named, `execute` runs every example. A line's TypeScript examples run against a network only at its release cut.
- `test-contracts` (Noir tests under TXE), `test-webapp`, `test-first-project` (the "Your first full project" page built in an empty folder).
- `test-fresh-clone <page>` (`scripts/fresh_clone_test.sh`): a page's "Clone the example" block, as rendered, in an empty folder, then the build. The block fetches this repository at `#docs_commit`, takes the page's line's `examples/` and `Nargo.toml` only, then aztec-node's `noir-projects` at `#include_aztec_version` into that line's `.aztec-node/tree`; its versions come from the page's macros, never from a pin file.
- `test-page-transcript <page>` (`scripts/page_transcript_test.sh`): every shell block of a page, as rendered, in an empty folder.

`scripts/page_tests.mts` names, for every tutorial and getting-started page with a shell block, the test that runs its commands (`TRANSCRIPTS`) or why none does (`UNTESTED`). `scripts/__tests__/page_tests.test.mts` fails on a page in neither list, and `scripts/__tests__/page_versions.test.mts` on a version a page types that differs from the one its example installs.

To run the examples by hand, start a local network, run `eval "$(node scripts/aztec_node.mts env)"`, then `examples/ts/aztecjs_runner/run.sh`. `AZTEC_NODE_URL` defaults to `http://localhost:8080`.

A new TypeScript example is a folder under `examples/ts/` with `examples/ts/<example>/index.ts` and `examples/ts/<example>/config.yaml`, and no `yarn.lock` (its install creates an empty, gitignored one). It reads `process.env.AZTEC_NODE_URL ?? "http://localhost:8080"`, and it runs only once it is in one of `HALF_1` and `HALF_2`: `scripts/__tests__/page_tests.test.mts` fails until it is in exactly one. The TypeScript examples install `@aztec-labs/*` at the pin's `AZTEC_VERSION` and `@aztec-foundation/*` at its `BB_VERSION`. The Solidity examples compile against the l1-contracts sources in the `@aztec-foundation/l1-artifacts` devDependency (`examples/solidity/foundry.toml`); the bridge tutorials' contracts are Hardhat projects (`examples/ts/README.md`).

## Search

Search is [Pagefind](https://pagefind.app), built by every `yarn build` into `build/pagefind/`, with no server or key. `src/plugins/pagefind/` indexes the Aztec.nr API pages of each network's version and every docs page but the dev line previews; `src/theme/SearchBar/` searches the version being read. `scripts/check_search_index.mts` fails the build when a sitemap page is missing from the index, when fewer than 1,000 API pages are indexed, or when a probe query in `PROBES` misses its page in the top 10.

## Publishing

Netlify runs `scripts/netlify-ignore-build.sh`, then `scripts/netlify-build.sh` when it says to build; the first lines of a deploy log give the decision and the reason.

- Production builds `next` when `docs/` changed since the last production build that passed, or when that build cannot be found. It leaves out the dev docs and the lines.
- A deploy preview builds when its pull request changes `docs/`.
- `node scripts/smoke_deployed_site.mts <base-url> [--commit <sha>]` checks a deployed site for what only Netlify answers: redirects, markdown twins, the migration-notes range, the 404 page and `/commit.txt`. It needs no install.
- `netlify/` holds the subscribe function and the markdown and migration-notes edge functions. `yarn dev:netlify` runs them locally; the subscribe function reads `BREVO_API_KEY` from a `.env` made from `.env.template`.
- Failed production deploys post to the `#docs-alert` Slack channel. These are site owners' actions, in the Netlify UI:
  - Roll back: publish an earlier production deploy, after checking that no production build is running (it would publish over the rollback). A rollback lasts until the next production build; to hold it, stop builds, which stops previews too. Never lock deploys.
  - Force a build: Trigger deploy, then "Clear cache and deploy" (a retry can be skipped). Needed after a failed production deploy and after a change to a Netlify environment variable.
  - A tip commit whose message has `[skip ci]` or `[skip netlify]` gets no deploy, and a manual `netlify deploy --prod` upload lasts until the next production build.

## `references:` front matter

A page lists the source files it documents, from the repository root (`references: ["labs/yarn-project/stdlib/src/interfaces/aztec-node.ts"]`, or a folder with `/*`). `scripts/check_doc_references.sh` fails when one is gone. It reads the source trees, not the snapshots. After a pin move, `scripts/pin_doc_references.sh` lists the pages to review, and the `update-doc-references` skill (`.claude/skills/update-doc-references/SKILL.md`) works through them.

## Migration notes and the operator changelog

Developer migration notes are `docs-developers/docs/resources/migration_notes.md`. New entries go under `## TBD`, each a `###` heading that starts with its component in brackets ([Aztec.nr], [Aztec.js], [PXE]), with what changed and a before-and-after `diff` block; a release cut moves them under its version. The operator changelog is `docs-operate/operators/reference/changelog/`, one page per release.
