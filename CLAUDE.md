# aztec-packages

All paths below are relative to the git root. When working inside a component, also read that component's `CLAUDE.md` — each is self-contained and covers its own build, style, and test conventions.

<components>
`yarn-project/` is the TypeScript monorepo containing the node, client SDK (`aztec.js`), PXE/wallet, sequencer, prover, p2p stack, and tooling — the main entrypoint for most day-to-day work; see `yarn-project/CLAUDE.md`.

`barretenberg/` is the C++ ZK proving system (Honk, Chonk, ECCVM); see `barretenberg/CLAUDE.md` and `barretenberg/cpp/CLAUDE.md`. `barretenberg/cpp/src/barretenberg/vm2/` is the AVM (Aztec Virtual Machine) for public execution; see its `CLAUDE.md`. `barretenberg/sol/` is the Solidity on-chain verifier; see `barretenberg/sol/CLAUDE.md`. `barretenberg/ts/` contains the TypeScript bindings for barretenberg (bb.js).

`avm-transpiler/` transpiles Noir bytecode to AVM bytecode (Rust). `noir/` is the Noir compiler, a git submodule pointing to noir-lang/noir. `noir-projects/` holds the protocol circuits and contract libraries written in Noir; see `noir-projects/labs/aztec-nr/CLAUDE.md`.

`l1-contracts/` holds the Solidity L1 rollup contracts (a Foundry project). `docs/` is the developer documentation site (Docusaurus); see `docs/CLAUDE.md`. `spartan/` holds Kubernetes deployment infrastructure (Helm charts + Terraform); see `spartan/CLAUDE.md`. `bb-pilcom/` is the PIL compiler for AVM relation codegen. `ci3/` contains CI infrastructure scripts.
</components>

<build_system>
Dependencies flow barretenberg → noir → l1-contracts → yarn-project. From the git root, use `make <target>`: `make fast` builds everything needed for development, `make yarn-project` runs the full TS build chain (which builds bb, noir, and l1-contracts first), `make bb-cpp-native` builds barretenberg C++ native only, `make noir` builds the Noir compiler, and `make l1-contracts` builds the Solidity contracts via Foundry. For individual components, run `./bootstrap.sh` inside each directory.

When a change spans multiple components, rebuild in dependency order: first `barretenberg/cpp/` with `cmake --preset default && cd build && ninja`, then `barretenberg/ts/` with `./bootstrap.sh` (which generates TS bindings from C++), then `noir/` with `./bootstrap.sh` if noir changes are needed, then `noir-projects/` to compile contracts, then `l1-contracts/` with `forge build`, and finally `yarn-project/` with `yarn build` from inside `yarn-project/` (not the git root).

The noir-projects build scripts default `$NARGO` to `noir/noir-repo/target/release/nargo`. Do not override this with a globally installed nargo — version mismatches produce opaque bytecode failures in downstream components.
</build_system>

<bumping_noir>
To bump the Noir compiler version (e.g. a request like "bump the noir compiler version to X"), run `noir/scripts/bump_noir_compiler.sh <ref>` — the single source of truth, also surfaced via the `noir-sync-update` skill. It bumps the `noir/noir-repo` submodule to `<ref>` (a noir-lang/noir ref: release tag `v1.0.0-beta.23`, nightly `nightly-2026-06-02`, branch, or commit), refreshes `avm-transpiler/Cargo.lock` and `yarn-project/yarn.lock`, reformats `noir-projects`, and stages everything. Do not bump the submodule by hand; skipping any of these leaves the tree inconsistent and fails CI. The script does not commit — verify with `git status` from the repo root, then commit as `chore: update Noir to <ref>`.
</bumping_noir>

<git_workflow>

<critical_never_assume_master>
Never assume the base branch is `master` or `main`. Most branches target `next` or a `merge-train/*` branch, and defaulting to `master` produces incorrect diffs and broken PR comparisons. Determine the actual base before diffing or opening a PR.

If a PR is already open, that is authoritative:

```bash
gh pr view --json baseRefName -q '.baseRefName'
```

Otherwise infer from the component being worked in:

| Component | Base branch |
|---|---|
| `barretenberg/**` | `merge-train/barretenberg` |
| `yarn-project/**` | `merge-train/spartan` |
| `barretenberg/cpp/src/barretenberg/vm2/**` | `merge-train/avm` |
| everything else | `next` |

The bases above target the `next` line. For work scoped to the v5 release line, use `merge-train/spartan-v5` (which targets `v5-next`) in place of `merge-train/spartan`.

`spartan` in these branch names refers to the deployment infrastructure in `spartan/`; it is not a release channel, network, or SDK version. Never present it, `merge-train/*`, `next`, or `v5-next` to a user as something to install or migrate to — releases are version tags (e.g. v5) and networks are named (e.g. testnet).

Use the discovered base in `git diff origin/<base>...HEAD` and `git log origin/<base>..HEAD`. Always `git fetch` before creating branches so the base is not stale.
</critical_never_assume_master>

<commits_and_prs>
Follow Conventional Commits: `fix:`, `feat:`, `chore:`, `refactor:`, `docs:`, `test:`. PRs are squashed to a single commit on merge, so during development just create normal commits — do not amend unless explicitly asked. If `noir/noir-repo` shows as modified unexpectedly, run `git submodule update noir/noir-repo` to reset it.
</commits_and_prs>

<git_staging>
When staging files, prefer `git add -u` or name specific files rather than `git add -A` or `git add .`. The aggregate flags will pick up unrelated untracked working directories (e.g. personal scratch projects at the repo root) and quietly stage them. `git add -u` and `git commit -a` also stage the `labs` gitlink whenever the patch series is applied (`git status` shows ` M labs`); unstage it with `git restore --staged labs` (see `<labs_submodule_patches>
`labs/` (the aztec-node submodule) carries the foundation's patch series from `labs-patches/*.patch`, applied with `git am` by `labs-patches/bootstrap.sh apply` (run by the root bootstrap, the git hooks and `make labs-patched`), so `labs/` HEAD normally sits ahead of the recorded gitlink. Never `git add labs` by hand — that records a patch commit that does not exist upstream; move the pin with `labs-patches/bootstrap.sh bump <ref>`. To change a patch, commit inside `labs/` on top of the applied series and run `labs-patches/bootstrap.sh export`, then commit the regenerated `.patch` files. To send a patch to aztec-node, `labs-patches/bootstrap.sh upstream <n>` prepares the branch and prints the push/PR commands. See `labs-patches/README.md`.

The tooling, all in `labs-patches/bootstrap.sh` (foundation-owned; only the `.patch` contents ever go upstream):

| Command | What it does |
|---|---|
| `apply` | Checks out the gitlink (`update = none` submodule) and `git am`s the series with a fixed committer identity, so the applied SHAs are identical everywhere. Idempotent; refuses to drop `labs/` commits that are not in the series (`LABS_PATCHES_FORCE=1` overrides); stashes uncommitted edits. |
| `export` | Regenerates `*.patch` from the commits above the gitlink, skipping marker commits. Run it after committing inside `labs/`. |
| `check` | Applies the committed series to the gitlink in a temporary worktree; CI runs it. |
| `bump <ref>` | Fetches an aztec-node ref, stages the new gitlink and re-applies; refuses on unexported work. |
| `upstream <n> [branch]` | Creates `fnd/<patch-slug>` in `labs/`'s repository with only patch `n` applied under your own identity, and prints the push and `gh pr create` commands. |
| `status` | Base, checkout, series, whether it is applied, and unexported commits. |
| `commit-use-local` | Commits the build's manifest rewrite as the marker commit (`labs-patches: use-local rewrite (never exported)`), staging only `package.json`/`yarn.lock`/`Nargo.toml`/`fnd-hashes`. Called by the build, not by hand. |
| `check_staged` | The `pre-commit` hook: rejects a staged gitlink that is a series or marker commit. |
| `test`, `test_cmds` | Run / list the tooling's tests: `tests/lifecycle_test` (a sandbox fixture exercising every command) and `check`; `make labs-patches-tests` runs them in CI. |

State lives in `.git/modules/labs/labs-patches.state` (stamp of base + series, applied commits); the series is recognised by `git patch-id`, so a lost state file is re-derived from content. `post-merge`/`post-checkout` hooks re-run `apply` only when the gitlink or the series changed.
</labs_submodule_patches>

<labs_build_tooling>
How the labs submodule is built and tested against this tree (all foundation-owned):

- `make labs-deps` builds what labs consumes from here (`bb-ts`, `bb-avm-sim`, `bb-cdb`, `wsdb`, `ipc-runtime`, `l1-contracts`, `constants-codegen`, `noir-projects-fnd`, `fnd-artifacts-stage`). `make labs-use-local` then runs `labs/labs-aztec-toolchain/bootstrap.sh use-local` (manifests → `portal:` to this tree), `scripts/labs_fnd_hashes.sh`, a lockfile refresh in `yarn-project` and `docs`, and `labs-patches/bootstrap.sh commit-use-local` (the marker commit). Never run that sequence by hand or commit its output; it is redone by every build.
- `make labs-fast` (= `fast-labs`): labs compiled against the portals with its unit/e2e tests, plus `aztec-nr`, `noir-contracts` and the contract snapshots against this tree's `nargo`/`bb` — what a foundation change can break. `make labs-full` adds `docs`, `spartan`, `playground`, the claude tooling tests and the benches; `make labs-yarn-project` builds only yarn-project; `make bench-labs` runs the labs benches on demand (they are not in the default `bench_cmds`).
- Every labs `make` from here goes through `LABS_MAKE` = `scripts/labs_env.sh $(MAKE)`; run `scripts/labs_env.sh <cmd>` for any ad-hoc command inside `labs/`. It clears the inherited ci3 `root`/`ci3` (labs' ci3 must derive its own) and exports `TEST_CMD_PREFIX` (`cd labs && export root= ci3= && `, inserted by labs patch 0002's `ci3/prefix_test_cmds` so the foundation test engine, which runs from this root, can execute labs test lines) and `TEST_CMD_SKIP` from `labs-patches/test_cmd_skip` — the regex of labs tests that cannot run here because they mount or package only the labs checkout, where the portals do not resolve (the compose/web3signer/ha e2e flavours, the playground browser tests, the docs examples run). `scripts/labs_test_cmds.sh` collects labs test/bench commands for the engine with that environment.
- Cache identity: `scripts/labs_fnd_hashes.sh` writes `labs/labs-aztec-toolchain/fnd-hashes` (`<component>=<content hash>` per provider, plus `optional=` naming the optional binaries this tree built). Labs patch 0003 makes the toolchain hash in foundation mode the content hash of that directory, so every labs build and test cache key follows the foundation tree, and a dirty provider disables labs caching. Patch 0001 portals the protocol artifacts packages; all three are queued for aztec-node.
</labs_build_tooling>

<standard_contract_repin>
Never run `noir-projects/labs/noir-contracts/bootstrap.sh pin-standard-build` on your own initiative. The pin exists so ordinary source or bytecode changes do NOT move the standard contracts' canonical addresses, and CI does not fail when the bytecode drifts. A re-pin is a deliberate redeploy decision for a human to make: if a change seems to need one, leave the pin, rebuild against it, and ask. See the comment on `pin-standard-build` for why re-pinning is breaking.
</standard_contract_repin>

</git_workflow>

<code_formatting>
Each language's formatter is documented in the relevant subdir `CLAUDE.md` — C++ conventions live in `barretenberg/cpp/CLAUDE.md`, TypeScript in `yarn-project/CLAUDE.md`, and Noir in `noir-projects/labs/aztec-nr/CLAUDE.md`. A post-edit hook runs the appropriate formatter automatically, so there is normally no need to invoke one by hand.
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
Do the work in this session by default. Do not spawn parallel subagents (the Agent/Task tool) or launch dynamic workflows (the Workflow tool) unless the user explicitly asks for it. Each extra agent multiplies token spend — roughly 2x for one helper and far more when a request fans out to many — and the user cannot see the fan-out coming or stop it; a single prompt that quietly started ~30 agents has exhausted an operator's budget. Searching the codebase, summarizing, researching, and ordinary multi-file edits are inline work: run the tool calls yourself. Reach for a subagent only when the user requested orchestration, or when one clearly-scoped read-heavy helper genuinely needs isolation from the main context — prefer a single agent over many, and never start a dynamic workflow by default. If a task would benefit from parallel agents but the user has not asked, either do it directly or describe the multi-agent option and ask before spending the budget.
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

- **"load bearing"** → *important*, *critical*, *required*, or describe the actual dependency (e.g. "the scheduler relies on this invariant").
- **"seam"** (for an interaction point or boundary) → *interface*, *boundary*, *call site*, *integration point*.
- **"north star"** → *goal*, *main goal*, *objective*.
- **"sharpening"** (for adding detail or refining wording) → *clarifying*, *adding detail*, *tightening*, *refining*.
- **"You're absolutely right"** and effusive agreement openers (*"Great catch!"*, *"Excellent point!"*) → never lead a reply with these. A short acknowledgement (*"Right — …"*, *"Agreed."*) is fine, and a closing *"you're right"* at the end of a long reply is acceptable when warranted. Lead with substance, not validation.
</jargon>

<attribution>
Attribute work to the git author, not to Claude. Do not add `Co-Authored-By: Claude` trailers or `Generated with Claude Code` in PR descriptions. The git author (from `git config user.name`) is the author of record.
</attribution>
