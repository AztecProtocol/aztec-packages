# Agents

This file is the entry point for coding agents that look for `AGENTS.md` (Codex, Cursor, Aider, Gemini CLI, Jules, Devin). General project guidance — build commands, branch strategy, code style, commit/PR conventions, formatting rules, testing discipline — lives in `CLAUDE.md` at the same path. Read `CLAUDE.md` first; everything below is a catalog of project-specific subagents and skills that are not covered there.

Claude Code auto-discovers the files referenced below via its `Agent` and `Skill` tools, so it does not need this catalog. Other coding agents should read the matching file by path when the user's task lines up with one of the listed entries.

## Specialist subagents

Domain-expert references under `.claude/agents/`:

- `analyze-logs` — `.claude/agents/analyze-logs.md` — Deep-read test logs and extract relevant info; runs in a separate context to avoid polluting the main conversation.
- `aztec-wallet` — `.claude/agents/aztec-wallet.md` — Execute cli-wallet commands against live Aztec networks (account setup, contract deployment, function calls, fee juice bridging).
- `identify-ci-failures` — `.claude/agents/identify-ci-failures.md` — Identify CI failures from a PR number, CI URL, or log hash; returns a structured list of failures with downloaded log paths.
- `network-logs` — `.claude/agents/network-logs.md` — Query GCP Cloud Logging for live Aztec network deployments (block production, proving status, errors).

## Skills

Task-specific workflows. When the user asks for one of these, read the matching `SKILL.md` (or `*.md` under `commands/`) and follow its instructions.

Repo-wide (`.claude/skills/<name>/SKILL.md`):

- `acir-formal-proofs` — Build/run ACIR formal proof tests with SMT verification; updates the README results table.
- `adding-benchmarks` — Add new benchmarks to the CI pipeline (JSON files, `bootstrap.sh` wiring, `ci3.yml` upload).
- `aztec-wallet` — Run `cli-wallet` against a live Aztec network: deploy contracts, send transactions, query state, bridge funds, manage accounts.
- `backport` — Backport a merged PR to a release branch (e.g. `v4`, `v4-devnet-2`), resolving conflicts if needed.
- `ci-logs` — Analyze CI logs from `ci.aztec-labs.com`. Use instead of `WebFetch` for CI URLs.
- `cycle` — Show Linear issues for the current cycle, grouped by status.
- `fix` — Analyze Linear issues, validate them against the codebase, and open draft fix PRs.
- `merge-train-infra` — Reference for merge-train automation internals (workflows, scripts, CI integration).
- `merge-trains` — Guide for working with merge-train branches: PR creation, base branch choice, labels, failure handling.
- `network-logs` — Query and analyze logs from live Aztec network deployments on GCP Cloud Logging.
- `noir-sync-update` — Follow-on updates after bumping the `noir/noir-repo` submodule (`Cargo.lock`, `yarn.lock`, etc.).
- `release-docs` — Build and update the developer documentation site for a new release.
- `release-network-docs` — Update network/operator documentation for a mainnet/testnet release without touching developer docs.
- `update-doc-references` — Update documentation when source files it references change in a PR.
- `updating-changelog` — Update changelog/migration notes for contract developers and node operators based on branch changes.

Barretenberg-scoped (`barretenberg/.claude/skills/<name>/SKILL.md`):

- `benchmark-chonk` — Run realistic Chonk (client IVC) benchmarks; native + WASM, per-circuit breakdowns, `BB_BENCH` instrumentation.
- `profile-chonk` — Run Chonk prover on the remote EC2 and collect Perfetto-compatible traces with a one-click UI link.
- `remote-bench` — Run benchmarks on the dedicated remote EC2 benchmarking machine (noise-free, single-run).
- `stdlib-point-at-infinity` — Guidelines for handling point-at-infinity in stdlib circuit types (serialization, public inputs, `cycle_group`/`biggroup`).
- `sumcheck` — Comprehensive reference for the Sumcheck protocol implementation in barretenberg (prover/verifier, relations, ZK sumcheck, ECCVM committed sumcheck).

Yarn-project-scoped (`yarn-project/.claude/skills/<name>/SKILL.md`):

- `debug-e2e` — Interactive ping-pong debugging for failed e2e tests; delegates log reading to subagents.
- `fix-pr` — Autonomous workflow that fixes a failing PR by analyzing CI logs, rebasing, fixing, and pushing.
- `read-gist` — Fetch and display a GitHub gist.
- `readme-writer` — Guidelines for writing module READMEs that explain how a module works.
- `rebase-pr` — Rebase a PR on its base branch, fix conflicts, and verify the build.
- `unit-test-implementation` — Best practices for unit tests in the TS monorepo (mocking, organization, helpers, assertions).
- `worktree-spawn` — Spawn an independent Claude instance in a git worktree to work on a task in parallel.

Docs slash-commands (`docs/.claude/commands/<name>.md`):

- `review-docs` — Review documentation for correctness, accuracy, and adherence to conventions.
