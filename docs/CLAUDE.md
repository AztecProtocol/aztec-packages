# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Two dev lines: change both

The dev docs follow two aztec-node lines, and each developer and operator page has a copy per line. The root pages (`docs/docs/`), `docs-participate/`, the versioned snapshots and `static/` are shared.

| Line | Follows | Pages and examples | Pin |
| --- | --- | --- | --- |
| main | aztec-node `main` | `docs-developers/`, `docs-operate/`, `sidebars-*.js`, `examples/` | `aztec-node.json` |
| v6 | aztec-node `v6` | `lines/v6/docs-developers/`, `lines/v6/docs-operate/`, `lines/v6/sidebars-*.js`, `lines/v6/examples/` | `lines/v6/aztec-node.json` |

- **A change goes into both lines.** Change one line only when the change is specific to it.
- **Decide that from the code, not the PR.** Grep the symbol or behaviour you document in each line's checkout: `.aztec-node/tree` for main, `lines/v6/.aztec-node/tree` for v6. If it is the same in both, change both copies. If it differs or is missing in one, change only the line that has it, the way that line has it.
  - A Labs PR's base branch (`main` or `v6`) only says which checkout to start with. A `main` PR can fix behaviour v6 shares, and a backport to `v6` still needs this check.
  - A fix to wording, structure or a mistake that both copies share is never line-specific.
- **Port with the line's paths.** The counterpart of `docs-developers/<page>` is `lines/v6/docs-developers/<page>`. In a v6 page, `#include_code` and `references:` paths into `docs/examples/` start with `docs/lines/v6/examples/`, and paths into `docs/node_modules/@aztec-foundation/l1-artifacts/` start with `docs/lines/v6/.aztec-node/l1-artifacts/`. `labs/` paths are the same in both and read each line's own checkout.
- **Check both lines** with `yarn build` (a preview also serves v6 at `/developers-v6/` and `/operate-v6/`), `./bootstrap.sh check`, `examples/bootstrap.sh` and `examples/bootstrap.sh --line v6`.
- **Migration notes and the operator changelog exist in both lines.** A v6.x entry goes into both, since v7 readers upgrade from the latest v6. A v7 entry goes into main only. Released entries are history in either line: never edit them.

## Overview

You are working with the **Aztec Protocol Documentation** - a comprehensive documentation site built with Docusaurus 3 for Aztec, the decentralized Ethereum L2 for building unstoppable private apps. Your role includes both technical development tasks and ensuring all documentation meets quality standards for accuracy, clarity, and usability.

## Development Commands

### Package Manager

This project uses Yarn 4.13.0 as specified in the `packageManager` field of package.json. Make sure to use Yarn for all dependency management.

### Essential Commands

- `yarn` - Install dependencies
- `yarn start` - Start development server (runs preprocessing first, then starts Docusaurus)
- `yarn build` - Build production site with full validation (includes clean, preprocess, spellcheck, and move steps)
  - It ends with the search index check: renaming or moving a page a search probe expects (`PROBES` in `scripts/check_search_index.mts`) fails the build until the probe lists the new path
- `yarn serve` - Serve the built static site
- `yarn spellcheck` - Run spell checking with cspell on markdown files. A line's pages are checked only through their preprocessed copies, so run `yarn preprocess` first after editing one
- `yarn clean` - Clean build artifacts and processed docs

### API Documentation Generation

The generators read the pinned aztec-node checkout (see "aztec-node code: the pin" below):

- `yarn generate:aztec-nr-api` - Generate Aztec.nr API docs (requires the pinned nargo: `node scripts/aztec_node.mts provision nargo`)
- `yarn generate:aztec-nr-api v1.0.0` - Generate for a specific version
- `RELEASE_TYPE=mainnet yarn generate:aztec-nr-api v4.2.0` - Generate with explicit release type
- `yarn generate:typescript-api` - Generate TypeScript API docs (requires the checkout's `yarn-project` to be built)
- `yarn generate:typescript-api v3.0.0-devnet.6` - Generate for a specific version
- `RELEASE_TYPE=mainnet yarn generate:typescript-api v4.2.0` - Generate with explicit release type
- `yarn generate:node-api-reference` - Generate Node JSON-RPC API reference (reads the checkout's `yarn-project` source with `docs/node_modules/typescript`; no build needed)
- `yarn generate:node-api-reference --target-dir <dir>` - Generate into a specific versioned docs directory

The `RELEASE_TYPE` env var overrides version string pattern matching for output folder selection. This is useful when the version string doesn't self-identify its release type.

### Development Workflow

The documentation uses a **preprocessing system** that:

- Pulls code from source files using `#include_code` macros
- Generates auto-documentation from TypeScript/JavaScript sources
- Processes version macros (`#release_version`, `#release_network`, `#include_aztec_version`, etc.)
- Processes conditional content blocks (`#if`/`#elif`/`#else`/`#endif`)
- Outputs to `processed-docs/` folder (used only in production builds)

For development:

- `yarn preprocess` - Run preprocessing manually (uses dotenv for configuration)
- `yarn start` - Runs preprocessing once at startup and serves from source directories
- **Important**: Hot reloading is NOT available - you must restart the dev server to see changes

### aztec-node code: the pin

The aztec-node (Labs) code the docs quote is the commit `aztec-node.json` pins, with its toolchain versions (aztec, bb, noir, l1-artifacts). Everything in docs/ that reads aztec-node code (`#include_code`, `references:` frontmatter, the API generators, `check_doc_references.sh`) reads a checkout of that commit, never the `labs/` submodule, which is the Foundation's build input and can move independently.

- `node scripts/aztec_node.mts fetch` checks the commit out into `.aztec-node/tree` (gitignored; `AZTEC_NODE_DIR` overrides the path). `yarn build`, `yarn start` and `./bootstrap.sh` run it first.
- Snippet and `references:` paths keep their `labs/` prefix, which names the checkout: `labs/yarn-project/...` reads `.aztec-node/tree/yarn-project/...`, and source links name aztec-node at the pinned commit.
- `node scripts/aztec_node.mts check` fails on any drift: a checkout at another commit or with edited files, toolchain versions that differ from the tag's, or an l1-artifacts version in `package.json` that differs from the pin.
- Move the pin with `node scripts/aztec_node.mts pin <tag>` (a release or nightly tag), never by hand; then set `@aztec-foundation/l1-artifacts` to the version `check` names, run `yarn install`, and commit `aztec-node.json` with `package.json` and `yarn.lock`.
- `pin` needs `gh` logged in: it records the sha256 of each noir release archive in `noirArchives` once `gh attestation verify` proves noir's publish workflow built it, and `provision` refuses a nargo archive whose sha256 differs. Never edit `noirArchives` to get past a mismatch: it means the release archive changed after the pin.
- Tools that need nargo, bb or the aztec CLI use the pinned published ones: `node scripts/aztec_node.mts provision nargo bb cli`, then `eval "$(node scripts/aztec_node.mts env)"` exports `NARGO`, `BB`, `AZTEC` and the versions. Never run nargo inside `docs/` or the checkout: it takes `docs/Nargo.toml` as its workspace.
- Each line's pin follows its own aztec-node branch (see "Two dev lines: change both"): `aztec-node.json` follows `main` (v7 from 2026-11-04), and `lines/<line>/aztec-node.json` follows `<line>`. Move a line's pin with `node scripts/aztec_node.mts --line <line> pin <tag>`: it installs the line's l1-artifacts into `lines/<line>/.aztec-node/`, so `package.json` does not change. A line's `pin` and `check` refuse a tag of another major. After moving any pin, check that the recorded commit is on its branch: `gh api "repos/aztec-labs-eng/aztec-node/compare/<branch>...<commit>" --jq .status` prints `behind` or `identical`.
- A release cut moves the pins in its own worktree only (`/release-docs`, `/release-network-docs`); the dev docs keep theirs. A cut of a line's major (a v6.x release, from its tag on aztec-node's `v6` branch) first promotes the line into the main paths with `scripts/promote_line.sh`.
- Retire a line with `git rm -r docs/lines/<line>` after its last release, or once no network runs its major: from then on, preprocessing fails on the line's API reference links.

### Preprocessing Environment Variables

The preprocessing system uses these environment variables:

| Variable       | Description                                             | Default                              |
| -------------- | ------------------------------------------------------- | ------------------------------------ |
| `RELEASE_TYPE` | Release type: `nightly`, `devnet`, `testnet`, `mainnet` | `mainnet`                            |
| `DOCS_COMMIT`  | Commit named by source links into this repository (`docs/examples/` snippets); required when `RELEASE_TYPE` is set to anything but `nightly` | `HEAD` |
| `NIGHTLY_TAG`  | Version for nightly builds (falls back to `COMMIT_TAG`) | from `developer_version_config.json` |
| `DEVNET_TAG`   | Version for devnet builds                               | from `developer_version_config.json` |
| `TESTNET_TAG`  | Version for testnet builds                              | from `developer_version_config.json` |
| `MAINNET_TAG`  | Version for mainnet builds                              | from `developer_version_config.json` |
| `COMMIT_TAG`   | Legacy variable, used as fallback for `NIGHTLY_TAG`     | `ref` in `aztec-node.json`           |
| `KEEP_DEVELOPER_VERSIONS` | `1` when the release leaves the developer docs' versions alone (a network-only cut, `/release-network-docs`): `#api_ref_version` then names the folder `developer_version_config.json` serves now, not the one it serves once `RELEASE_TYPE` reads the version being built | unset |

### Preprocessing Macros

**Release-type-aware macros:**

- `#release_version` - Resolves to the version for the current `RELEASE_TYPE`:
  - `nightly` → `NIGHTLY_TAG`, `devnet` → `DEVNET_TAG`, `testnet` → `TESTNET_TAG`, `mainnet` → `MAINNET_TAG`
- `#release_network` - Resolves to the network name for CLI `--network` flag:
  - `nightly` → `local-network`, `devnet` → `devnet`, `testnet` → `testnet`, `mainnet` → `mainnet`
- `#release_name` - Resolves to the release line name for the current version (`Tierra` for any `6.x`, from `release_names.json`); falls back to the version for an unnamed line
- `#release_label` - Resolves to the full docs label, e.g. `Tierra (v6.0.0)`

**Foundation macro:**

- `#include_foundation_version` - `v<installed @aztec-foundation/l1-artifacts version>`; use it for links and Nargo dependencies into aztec-packages' own code (`l1-contracts/`, `barretenberg/`). `#include_foundation_version_without_prefix` drops the `v` (npm versions)

**Legacy macros:**

- `#include_aztec_version` - Uses `COMMIT_TAG`, else the pin's `ref` (a Labs version, never a ref into aztec-packages; `@aztec-foundation/*` versions use `#include_foundation_version_without_prefix`)
- `#include_devnet_version`, `#include_testnet_version`, `#include_mainnet_version` - Version-specific macros

**`#include_code` paths**: Snippet paths may point into `docs/node_modules` (e.g. `docs/node_modules/@aztec-foundation/l1-artifacts/...`). For those snippets the generated source link resolves to the installed package's own version tag, NOT `COMMIT_TAG` - only the package's tag is guaranteed to match the extracted snippet line-for-line (see `src/preprocess/include_code.js`).

### Conditional Content

Use conditional blocks to show content only for specific release types:

```markdown
#if(devnet)
Content for devnet docs
#elif(testnet)
Content for testnet docs
#else
Default content
#endif
```

**Supported conditions** (matching `RELEASE_TYPE` values): `nightly`, `devnet`, `testnet`, `mainnet`

**Notes:**

- Conditional blocks are processed before version macro substitution (so you can use version macros inside conditionals)
- Nested conditionals are not supported
- The `#else` block is optional

## Documentation Architecture

### Key Directories

- `docs/` - Root-level documentation (landing page, shared content)
- `docs-developers/` - Developer documentation source files
- `docs-network/` - Network/node operator documentation source files
- `developer_versioned_docs/` - Version-specific developer documentation
- `network_versioned_docs/` - Version-specific network documentation
- `developer_versioned_sidebars/` - Version-specific developer sidebar configurations
- `network_versioned_sidebars/` - Version-specific network sidebar configurations
- `processed-docs/` - Generated docs for production builds (gitignored)
- `src/preprocess/` - Preprocessing scripts and macro handlers
- `src/components/` - React components for documentation
- `static/img/` - Static images and assets
- `static/aztec-nr-api/` - Auto-generated Aztec.nr API documentation (HTML)
- `static/typescript-api/` - Auto-generated TypeScript API documentation (markdown)
- `examples/` - Code examples (Noir circuits, Noir contracts, Solidity, TypeScript)
- `examples/ts/` - TypeScript aztec.js examples with `docker-compose.yml` for CI execution
- `examples/ts/aztecjs_runner/` - Runner script that executes examples against a live network
- `scripts/` - Build and utility scripts
- `scripts/typescript_api_generation/` - TypeScript API doc generation scripts and config

### Content Structure

This site uses **Docusaurus multi-instance docs** with independent versioning:

- **Developer Guides** (`/developers/`) - Getting started, tutorials, references (mainnet + testnet + devnet + nightly versions)
- **Network Guides** (`/network/`) - Node operation and network participation (mainnet + testnet versions)

### Auto-Generated API Documentation

Two API reference systems generate documentation from source code:

- **Aztec.nr API** (`static/aztec-nr-api/`) - Generated from the checkout's `noir-projects/aztec-nr/` using `nargo doc`
- **TypeScript API** (`static/typescript-api/`) - Generated from the checkout's `yarn-project/` packages using TypeDoc

The TypeScript API generation is configured in `scripts/typescript_api_generation/config.json` and documents:

- Client SDKs: `aztec.js`, `accounts`, `pxe`, `wallet-sdk`, `wallets`, `entrypoints`
- Core Libraries: `stdlib`, `foundation`, `constants`

### Versioning System

Uses Docusaurus multi-instance versioning with separate version tracks:

- **Developer docs**: Version config in `developer_version_config.json`, stored in `developer_versioned_docs/`
- **Network docs**: Version config in `network_version_config.json`, stored in `network_versioned_docs/`
- Both config files map release types to version strings (e.g., `{"mainnet": "v4.2.0", "testnet": "v4.1.0", ...}`)
- `release_names.json` maps a major version to its release line name (`{"6": "Tierra"}`); `src/release_names.js` turns that into the dropdown and badge labels (`Tierra (v6.0.0)`) and the `#release_name` macro. Name a new line by adding one entry. Labels follow "Networks, release lines, and versions" under Terminology
- `docusaurus.config.js` auto-generates `*_versions.json` from these configs (filtered to versions with existing directories, plus any extra unmapped directories)
- Use `scripts/update_docs_versions.sh` to update configs and reconcile: `./scripts/update_docs_versions.sh network mainnet v4.2.0`
- Each docs instance has its own version dropdown in the navbar
- Preprocessing macros (`#include_code`, `#release_version`, conditionals, etc.) only work in source folders, not in versioned copies
- Create new versions with: `yarn docusaurus docs:version:<instance-id> <version>`

### Code Examples Pipeline

The `examples/` directory contains runnable code examples that are included in documentation via `#include_code` markers. The examples pipeline has two stages:

**Validation (type-checking)**: `examples/bootstrap.sh` compiles Noir circuits, Noir contracts, Solidity, and type-checks TypeScript examples. This runs on every PR.

`examples/bootstrap.sh --line <line>` builds a line's examples the same way, in a copy staged outside the repository (nargo would take `docs/Nargo.toml` as the workspace). Run it whole: the stage is new every run, so a single step such as `validate-ts` finds no compiled contracts, unless `DOCS_LINE_STAGE=<dir>` keeps one stage across runs (a release cut does). A line's examples run against a network only at its release cut, never in CI.

The Solidity examples compile against the l1-contracts sources shipped in the `@aztec-foundation/l1-artifacts` devDependency (see `examples/solidity/foundry.toml`). Its version in `package.json` must equal `toolchain.l1Artifacts` in `aztec-node.json` (the pinned aztec-node's `BB_VERSION`); `node scripts/aztec_node.mts check` fails until both move together.

The examples build with the pin's published toolchain, the same code the snippets quote: `examples/bootstrap.sh` provisions nargo, bb and the aztec CLI (`@aztec-labs/aztec`) at the pinned versions, the contracts' Nargo path dependencies point into the default checkout (`.aztec-node/tree`; an `AZTEC_NODE_DIR` override never applies to them), and the TS examples install `@aztec-labs/*` at `AZTEC_VERSION` and `@aztec-foundation/*` at `BB_VERSION` from npm.

**Execution (runtime testing)**: TypeScript examples in `examples/ts/` are executed against a live Aztec network via Docker Compose. The `examples/ts/docker-compose.yml` spins up Anvil (L1 fork), an Aztec local network, and a runner service that executes the examples.

- **CI**: `docs/bootstrap.sh ci` calls `examples/bootstrap.sh execute`, which uses `run_compose_test` from `ci3/`
- **Local**: Start a sandbox manually, provision the pinned CLI and export the pin (see "aztec-node code: the pin"), then run `examples/ts/aztecjs_runner/run.sh`
- **`AZTEC_NODE_URL`**: All example `index.ts` files and `run.sh` use this env var (defaults to `http://localhost:8080`). In Docker Compose, it points to `http://local-network:8080`.

When adding new TypeScript examples:

1. Create a directory under `examples/ts/` with `index.ts`, `config.yaml`, and empty `yarn.lock`
2. Use `process.env.AZTEC_NODE_URL ?? "http://localhost:8080"` for the node URL
3. Add the example to the list in `examples/ts/aztecjs_runner/run.sh` if it should be executed at runtime

## Documentation Review Standards

## Primary Review Objectives

### 1. Grammar & Language

- Fix grammatical errors, typos, and punctuation issues
- Ensure proper sentence structure and paragraph flow
- Correct verb tense consistency (prefer present tense for instructions)
- Fix subject-verb agreement and pronoun references

### 2. Tone & Voice

- Maintain a professional tone
- Use second person "you" perspective for user guides, how-to guides, and tutorials
- Use first person plural "we" perspective for conceptual pages, architectural overviews and explanations
- Keep language inclusive and accessible
- Favor concise, direct language
- Avoid passive voice where possible
- Avoid jargon unless necessary (and define it when used)
- Be encouraging rather than prescriptive ("you can" vs "you must" where appropriate)

### 3. Conciseness

- Remove redundant information
- Combine related short sentences
- Replace wordy phrases with concise alternatives
- Eliminate unnecessary qualifiers and filler words
- Keep paragraphs focused on single concepts

## Technical Review Criteria

### 4. Accuracy & Completeness

- Verify all technical information is correct
- Ensure no critical steps are missing in procedures
- Check that all prerequisites are stated upfront
- Validate command syntax and parameters
- Confirm version numbers and compatibility information

### 5. Code & Examples

- Verify code blocks are syntactically correct
- Ensure proper language tags for syntax highlighting
- Check that examples are practical and runnable
- Include expected output where relevant
- Follow coding best practices for the language

### 6. Structure & Organization

- Confirm logical information flow (simple → complex)
- Verify proper heading hierarchy (H1 → H2 → H3, etc.)
- Ensure consistent use of lists (ordered vs unordered)
- Check that related information is grouped together and that duplicate information is minimized
- Validate all internal links and cross-references

### 7. User Experience

- Include clear action items and expected outcomes
- Provide troubleshooting for common issues
- Add helpful notes, warnings, and tips using appropriate formatting
- Include "Next steps" or "Related topics" where appropriate

## Consistency Standards

### Terminology

Use these terms consistently throughout:

- **Positioning** - Aztec is the decentralized Ethereum L2 for building unstoppable private apps, with fully programmable privacy. Describe apps as private by design: private functions run and are proven on the user's device
- **Networks, release lines, and versions** - Three separate names. Networks are where code is deployed: **Alpha** (the mainnet) and **Testnet**. Release lines are what a network runs, one name per major version: the v6 line is **Tierra** ("the Tierra (v6) release line", "Aztec Tierra"). Versions are the semver strings code pins (`6.0.0`). A release line name never stands for a network ("deploy to Alpha", not "deploy to Tierra") and never appears in CLI, env, or Docker values, which stay `mainnet` and `testnet`
- **[Aztec Protocol]** - Always capitalize and use full name on first mention
- **[PXE]** - Always capitalize and use full name (Private eXecution Environment) on first mention
- **Wallet vs Account** - Never use `wallet.address`. A wallet is software that holds multiple accounts; accounts have addresses, not wallets. Use `account.address`, `sender.address`, `alice.address`, etc. instead

### Formatting Conventions

- **Code terms**: Use `backticks` for inline code, commands, file names, and technical terms
- **Emphasis**: Use _italics_ sparingly for emphasis
- **File paths**: Always use forward slashes (e.g., `/usr/local/bin`)
- **Placeholders**: Use `[PLACEHOLDER_NAME]` format in examples
- **Punctuation**: Do not use em-dashes (`—`) or en-dashes (`–`). Use commas, colons, parentheses, or separate sentences instead.

### Heading Capitalization

**Use sentence case for all headings (H1 through H6).** Only capitalize the first word and proper nouns. Do not capitalize common nouns, verbs, prepositions, articles, or conjunctions.
**Applying this to existing files:** When editing an existing page that uses Title Case, convert the headings you touch (and ideally the whole page) to sentence case. The goal is to converge on one style across the site, rather than preserving historical inconsistency.

### Standard Sections

Every guide should include:

1. **Front-matter** - YAML metadata block with required `description` field
2. **Title** - Clear, descriptive, and action-oriented
3. **Overview** - Brief description of what the guide covers
4. **Prerequisites** - Required knowledge, tools, or access
5. **Steps/Content** - Main body with clear headings
6. **Verification** - How to confirm successful completion
7. **Troubleshooting** - Common issues and solutions (where applicable)
8. **Next Steps** - Related guides or advanced topics

### Front-matter Requirements

Every markdown file MUST include front-matter with a `description` field:

```yaml
---
title: "Page Title"
description: "Brief, SEO-friendly description of the page content (50-160 characters recommended)"
---
```

The description should:

- Clearly summarize the page's purpose and content
- Be between 50-160 characters for optimal SEO
- Use active voice and be user-focused
- Avoid redundancy with the page title
- Help users understand what they'll learn or accomplish

## Special Instructions

### Do Review For:

- ✅ Missing front-matter or missing `description` field in front-matter
- ✅ Ambiguous instructions that could confuse users
- ✅ Missing context or assumptions about user knowledge
- ✅ Outdated screenshots or version references
- ✅ Broken markdown formatting
- ✅ Headings using Title Case instead of sentence case (see "Heading Capitalization")
- ✅ Em-dashes (`—`) in prose (see "Formatting Conventions")
- ✅ Full node or sequencer hardware figures written into a page: import `operators/_node_hardware.mdx` (one per docs version) instead, outside any `<IfChoice>`, whose content is missing from the server-rendered page and its markdown twin
- ✅ Missing alt text for images
- ✅ Security implications of commands or configurations

### Do NOT Change:

- ❌ Product-specific command names or parameters
- ❌ Intentionally simplified examples for beginners
- ❌ Legal disclaimers or license text
- ❌ Direct quotes from external sources
- ❌ API endpoint URLs or configuration values
- ❌ Existing migration notes in `resources/migration_notes.md`: never modify already-published migration entries. Instead, add new migration notes to the `## TBD` section at the top of the file.

## Review Output Format

When reviewing, provide feedback in this format:

1. **Summary**: Brief overview of the document's current state
2. **Critical Issues**: Must-fix problems affecting accuracy or usability
3. **Improvements**: Suggested enhancements for clarity and consistency
4. **Positive Aspects**: What's working well (to maintain in future edits)

For inline edits, use clear markers:

- `[GRAMMAR]` - Grammar or spelling fix
- `[CLARITY]` - Rewrite for better understanding
- `[TECHNICAL]` - Technical accuracy correction
- `[STYLE]` - Style guide compliance
- `[STRUCTURE]` - Organization improvement

## Project-Specific Guidelines

### Domain Context

- **Industry**: Blockchain, Smart Contracts, Privacy, zero-knowledge, rollups on Ethereum
- **Primary Users**: Smart contract developers, protocol engineers, protocol researchers
- **Documentation Type**: Explainer docs, how-to guides, reference docs, API docs, tutorials

### Version Management

- Current versions: see `./versions.json`
- Version notation format: **vX.X.X** (e.g., v0.86.0)

### External References

Approved external documentation sources:

- Noir: https://noir-lang.org/docs

### Spell Checking Configuration

- Uses cspell with custom dictionary at `docs-words.txt`
- Checks files in `docs/`, `versioned_docs/`, `internal_notes/`, and snippet components
- Ignores `node_modules`, `processed-docs`, `processed-docs-cache`
- Imports additional configuration from `../cspell.json`

---

## Notes for Claude

- Prioritize clarity and user success over strict style adherence
- When in doubt, favor explicit over implicit information
- Consider the user's journey through the entire documentation site
- Flag any content that might need subject matter expert review
- Suggest improvements even if they go beyond pure editing
- When making changes to documentation processes or tooling, remember to check and update READMEs, project documentation (like this file), and code comments

Last updated: 2026-11-05
Version: 1.12
