# aztec-packages

All paths below are relative to the git root. When working inside a component, also read that component's `CLAUDE.md` — each is self-contained and covers its own build, style, and test conventions.

<components>
`labs/` is the aztec-node repository (aztec-labs-eng/aztec-node) as a git submodule: the TypeScript monorepo (`labs/yarn-project`: node, client SDK, PXE/wallet, sequencer, prover, p2p stack, tooling), `labs/noir-projects` (aztec-nr and example contracts), docs, playground, spartan. It is built here against this tree's packages (see `<labs_submodule_patches>` and `labs-patches/README.md`); its own conventions live in `labs/CLAUDE.md`.

`barretenberg/` is the C++ ZK proving system (Honk, Chonk, ECCVM); see `barretenberg/CLAUDE.md` and `barretenberg/cpp/CLAUDE.md`. `barretenberg/cpp/src/barretenberg/vm2/` is the AVM (Aztec Virtual Machine) for public execution; see its `CLAUDE.md`. `barretenberg/sol/` is the Solidity on-chain verifier; see `barretenberg/sol/CLAUDE.md`. `barretenberg/ts/` contains the TypeScript bindings for barretenberg (bb.js).

`avm-transpiler/` transpiles Noir bytecode to AVM bytecode (Rust). `noir/` is the Noir compiler, a git submodule pointing to noir-lang/noir. `noir-projects/fnd/` holds the protocol circuits and protocol contracts written in Noir.

`l1-contracts/` holds the Solidity L1 rollup contracts (a Foundry project). `l1-contracts/script/deploy/` holds the env-driven `Deploy*.s.sol` scripts for tests and testnets. Their defaults are not mainnet configuration, and findings against them are not mainnet findings. Mainnet rollup upgrades use the pinned `DeployRollupForUpgradeV<N>.s.sol` scripts in the same directory (`DeployRollupForUpgradeV6.s.sol` here, `DeployRollupForUpgradeV5.s.sol` on the `v5-next` branch). `bb-pilcom/` is the PIL compiler for AVM relation codegen. `ci3/` contains CI infrastructure scripts.

Packages labs consumes from this tree: `wsdb/` (the `@aztec-foundation/wsdb` client for the world-state database binary built in `barretenberg/cpp`), `ipc-runtime/` (the IPC transport library), `ipc-codegen/` (generates IPC clients and servers from a schema), and `protocol/constants-codegen/` (generates protocol constants for TypeScript, C++, PIL, Solidity and Rust). `labs-patches/` holds the tooling that checks out `labs/` and applies the foundation patch series to it. `scripts/` holds root helper scripts. `iac/`, `metrics/` and `container-builds/` hold infrastructure: Terraform, OpenTelemetry and Prometheus images, and a static SMT-solver build image.
</components>

<build_system>
Build order: barretenberg and noir → noir-projects/fnd → l1-contracts → labs. From the git root, use `make <target>`: `make fast` builds everything needed for development (`fast-foundation` then `fast-labs`), `make fast-labs` builds the labs submodule against this tree, `make bb-cpp-native` builds barretenberg C++ native only, `make noir` builds the Noir compiler, and `make l1-contracts` builds the Solidity contracts via Foundry. For individual components, run `./bootstrap.sh` inside each directory.

When a change spans multiple components, rebuild in dependency order: first `barretenberg/cpp/` with `cmake --preset default && cd build && ninja`, then `barretenberg/ts/` with `./bootstrap.sh` (which generates TS bindings from C++), then `noir/` with `./bootstrap.sh` if noir changes are needed, then `noir-projects/fnd` to compile the protocol circuits and contracts, then `l1-contracts/` with `./bootstrap.sh` (it fetches `solc` and copies the rollup verifier from the protocol circuits build; a bare `forge build` fails without both), and finally `make fast-labs` for the labs submodule.

The noir-projects build scripts default `$NARGO` to `noir/noir-repo/target/release/nargo`. Do not override this with a globally installed nargo — version mismatches produce opaque bytecode failures in downstream components.
</build_system>

<bumping_noir>
To bump the Noir compiler version (e.g. a request like "bump the noir compiler version to X"), run `noir/scripts/bump_noir_compiler.sh <ref>` — the single source of truth, also surfaced via the `noir-sync-update` skill. It bumps the `noir/noir-repo` submodule to `<ref>` (a noir-lang/noir ref: release tag `v1.0.0-beta.23`, nightly `nightly-2026-06-02`, branch, or commit), refreshes `avm-transpiler/Cargo.lock`, reformats `noir-projects/fnd`, and stages everything (the labs lockfile is refreshed by `labs-use-local` at build time). Do not bump the submodule by hand; skipping any of these leaves the tree inconsistent and fails CI. The script does not commit — verify with `git status` from the repo root, then commit as `chore: update Noir to <ref>`.
</bumping_noir>

<genesis_constants>
The genesis nullifier tree is seeded with the protocol contracts' registration nullifiers, so anything that rotates a protocol class id (a protocol contract change, a Noir compiler bump, a transpiler change) moves `GENESIS_NULLIFIER_TREE_ROOT`, `GENESIS_BLOCK_HEADER_HASH`, `GENESIS_ARCHIVE_ROOT`, the C++ genesis seed vector and the six L1 checkpoint fixtures. Never hand-edit any of them: run `noir-projects/fnd/scripts/regenerate_genesis_constants.sh --fixtures`, the single source of truth, also surfaced via the `genesis-constants` skill. `--check` reports staleness without writing. Requires a built tree (`make labs-yarn-project`), and anvil for `--fixtures`.

A class id rotation also fails the deployed-network pins in `labs/yarn-project/aztec/src/{mainnet,testnet}_compatibility.test.ts`. Those record what a live network was deployed with and change only at a governance upgrade — do not update them to make the failure go away.
</genesis_constants>

<release_ports>
Do not add backport or port workflows, staging-branch scripts, or ClaudeBox dispatch steps here: CI holds no ClaudeBox credential. ClaudeBox handles `port-to-<branch>` labels; see `.github/NOTES.md`. Changes to port labels, targets or behavior go to [AztecProtocol/claudebox](https://github.com/AztecProtocol/claudebox) (internal): `claudebox-server/config.yml` (`merge_triggers`) and the `port-to-branch` skill.
</release_ports>

<git_workflow>

<base_branches>
Never assume the base branch is `master` or `main`. Most branches target `next` or a `merge-train/*` branch, and defaulting to `master` produces incorrect diffs and broken PR comparisons. Determine the actual base before diffing or opening a PR.

If a PR is already open, that is authoritative:

```bash
gh pr view --json baseRefName -q '.baseRefName'
```

Otherwise infer from the component being worked in:

| Component | Base branch |
|---|---|
| `barretenberg/**` | `merge-train/barretenberg` |
| `barretenberg/cpp/src/barretenberg/vm2/**` | `merge-train/avm` |
| everything else | `next` |

The bases above target the `next` line. Release lines: `v5-next`, `v6`, `v6-next` (see `.github/NOTES.md`). On a release-line checkout, confirm the base with `gh pr view` rather than assuming. Never present `merge-train/*`, `next`, or a release-line branch to a user as something to install or migrate to — releases are version tags (e.g. v5) and networks are named (e.g. testnet).

Use the discovered base in `git diff origin/<base>...HEAD` and `git log origin/<base>..HEAD`. Always `git fetch` before creating branches so the base is not stale.
</base_branches>

<commits_and_prs>
Follow Conventional Commits: `fix:`, `feat:`, `chore:`, `refactor:`, `docs:`, `test:`. PRs are squashed to a single commit on merge, so during development just create normal commits — do not amend unless explicitly asked. If `noir/noir-repo` shows as modified unexpectedly, run `git submodule update noir/noir-repo` to reset it.
</commits_and_prs>

<git_staging>
When staging files, prefer `git add -u` or name specific files rather than `git add -A` or `git add .`. The aggregate flags will pick up unrelated untracked working directories (e.g. personal scratch projects at the repo root) and quietly stage them. `git add -u` and `git commit -a` also stage the `labs` gitlink whenever `labs/` HEAD sits ahead of it (`git status` shows ` M labs`); unstage it with `git restore --staged labs` (see `<labs_submodule_patches>`).
</git_staging>

<labs_submodule_patches>
`labs/` (the aztec-node submodule) is checked out by `labs-patches/bootstrap.sh apply`, which can apply a foundation patch series (`labs-patches/*.patch`, currently empty) on top. Guardrails:

- Never `git add labs` by hand: it records a commit that does not exist upstream. Move the pin with `labs-patches/bootstrap.sh bump <ref>`.
- To change the series, commit inside `labs/` on top of the applied series, run `labs-patches/bootstrap.sh export`, then commit the regenerated `.patch` files.
- Never run the `labs-use-local` steps by hand or commit their output; every build redoes them.

Everything else (the command list, state file, hooks, building and testing labs against this tree, `scripts/labs_env.sh <cmd>` for ad-hoc commands in `labs/`) is in `labs-patches/README.md`.
</labs_submodule_patches>

<standard_contract_repin>
Never run `labs/noir-projects/noir-contracts/bootstrap.sh pin-standard-build` on your own initiative. The pin exists so ordinary source or bytecode changes do NOT move the standard contracts' canonical addresses, and CI does not fail when the bytecode drifts. A re-pin is a deliberate redeploy decision for a human to make: if a change seems to need one, leave the pin, rebuild against it, and ask. See the comment on `pin-standard-build` for why re-pinning is breaking.
</standard_contract_repin>

</git_workflow>

<code_formatting>
Each language's formatter is documented in the relevant subdir `CLAUDE.md` — C++ conventions live in `barretenberg/cpp/CLAUDE.md`, TypeScript in `labs/yarn-project/CLAUDE.md`, and Noir in `labs/noir-projects/aztec-nr/CLAUDE.md`. Solidity in `l1-contracts/` uses `forge fmt`; Noir in `noir-projects/fnd/` uses `nargo fmt` (run by `noir-projects/fnd/precommit.sh`). A post-edit hook runs the appropriate formatter automatically, so there is normally no need to invoke one by hand.
</code_formatting>

<red_green_testing>
When fixing a bug, CI failure, or regression, follow red/green. First, write or run a test that demonstrates the failure and show that it fails — this proves both the problem is understood and that there is a reliable way to detect it. Then make the fix and rerun the same test to show it passes. The same pattern applies to refactors: run existing tests to establish a baseline before changing code. If a failing test is not feasible (non-deterministic behavior, infra not available locally, etc.), say so explicitly rather than skipping the step silently.
</red_green_testing>

<test_failure_skepticism>
When a test fails, assume your changes caused it until proven otherwise. Pre-existing test failures are rare in this repo; the default hypothesis is that the current change introduced the regression, not that the test was already broken. Investigate the failure against your diff before concluding it is unrelated.
</test_failure_skepticism>

<unexpected_file_changes>
If a file contains changes you did not make (e.g. formatting diffs, new imports, reorganized code), assume a post-edit hook, the user, or another agent made them deliberately. Do not revert, "clean up," or overwrite those changes. If the changes conflict with your work, ask the user rather than silently discarding them.
</unexpected_file_changes>

<test_behavior_not_mocks>
Tests should validate behavior, not mock call-count. Prefer `expect(result).toEqual(...)` over `expect(spy).toHaveBeenCalledWith(...)` unless call-count is literally the behavior under test. Mock-counting tests pin the implementation and make every unrelated refactor look like a regression.
</test_behavior_not_mocks>

<reuse_before_writing>
Before writing a new helper, utility, or component, search for an existing one with Grep or Glob. Reuse or refactor to a shared module; do not introduce a parallel implementation.
</reuse_before_writing>

<agent_and_workflow_restraint>
Do not spawn subagents (the Agent/Task tool) or launch dynamic workflows (the Workflow tool) unless the user asks. One clearly-scoped, read-heavy helper that genuinely needs isolation from the main context is allowed; prefer a single agent over many. If parallel agents would help, say so and ask first.
</agent_and_workflow_restraint>

<preserve_todos>
Preserve existing `// TODO`, `// TODO(name)`, and `// NOTE:` comments unless the current task is to resolve them. A "tidy up" refactor that deletes another author's deferred-work markers destroys context that is not recoverable from git history.

During cleanup or review passes, do not delete useful explanatory comments merely to reduce diff size. Remove or rewrite a comment only when it is incorrect, obsolete, noise, or directly resolved by the current task.
</preserve_todos>

<bash_hygiene>
Never append `; echo "EXIT: $?"` or similar exit-code suffixes to any command. The Bash tool already reports exit codes directly; adding these suffixes is redundant and causes unnecessary permission prompts.
</bash_hygiene>

<do_not_edit>
Never edit vendored submodules (all paths listed in `.gitmodules`, except `labs/`, whose edits go through the patch series described in `<labs_submodule_patches>`) or files that contain a `DO NOT EDIT` / `generated` header. Edit the upstream source or the generator input and regenerate. CI enforces this — hand edits to generated files will be overwritten or rejected.
</do_not_edit>

<editorial_test>
Before adding a line to any `CLAUDE.md` file: answer in one sentence what specific wrong action the line would have prevented in a past session. If no such action exists, do not add the line. General knowledge, motivation, and historical rationale do not qualify — those belong in commit messages or subdirectory READMEs. This rule applies equally to every `CLAUDE.md` in the tree.
</editorial_test>

<writing_comments>
Default to writing no inline comments. Add one only when the *why* is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, or behavior that would surprise a reader. If removing the comment would not confuse a future reader, do not write it. 

Do write jsdoc, rustdoc, or natspec comments for documenting public methods.

Do not explain *what* the code does — well-named identifiers cover that. Comments of the form `// increment counter` / `// loop over peers` / `// return early on error` are noise and should be deleted rather than added.

Do not reference the current task, PR, caller, or author (`// used by X`, `// fix for issue #123`, `// AI-generated`), and do not add banner-style section comments (`// ===== HELPERS =====`). Both rot the moment the surrounding code is moved.

Keep comments self-contained: whatever a comment points to must be understandable from the repo alone. The repo is public but Linear issues are private, so never cite them (`// see A-1234`). Likewise do not reference an implementation plan that lives outside the repo (`// this fixes item 4`, `// tackles section C`) — describe the actual constraint or behavior instead.
</writing_comments>

<jargon>
Avoid recurring AI-isms in chat replies, PR descriptions, commit messages, code comments, and docs. Substitutes:

- "load bearing" → *important*, *critical*, *required*, or describe the actual dependency (e.g. "the scheduler relies on this invariant").
- "seam" (for an interaction point or boundary) → *interface*, *boundary*, *call site*, *integration point*.
- "north star" → *goal*, *main goal*, *objective*.
- "sharpening" (for adding detail or refining wording) → *clarifying*, *adding detail*, *tightening*, *refining*.
- "You're absolutely right" and effusive agreement openers (*"Great catch!"*, *"Excellent point!"*) → never lead a reply with these. A short acknowledgement (*"Right — …"*, *"Agreed."*) is fine, and a closing *"you're right"* at the end of a long reply is acceptable when warranted. Lead with substance, not validation.
</jargon>

<attribution>
Attribute work to the git author, not to Claude. Do not add `Co-Authored-By: Claude` trailers or `Generated with Claude Code` in PR descriptions. The git author (from `git config user.name`) is the author of record.
</attribution>
