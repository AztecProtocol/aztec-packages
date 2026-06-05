# aztec-packages

All paths below are relative to the git root. When working inside a component, also read that component's `CLAUDE.md` — each is self-contained and covers its own build, style, and test conventions.

<components>
`yarn-project/` is the TypeScript monorepo containing the node, client SDK (`aztec.js`), PXE/wallet, sequencer, prover, p2p stack, and tooling — the main entrypoint for most day-to-day work; see `yarn-project/CLAUDE.md`.

`barretenberg/` is the C++ ZK proving system (Honk, Chonk, ECCVM); see `barretenberg/CLAUDE.md` and `barretenberg/cpp/CLAUDE.md`. `barretenberg/cpp/src/barretenberg/vm2/` is the AVM (Aztec Virtual Machine) for public execution; see its `CLAUDE.md`. `barretenberg/sol/` is the Solidity on-chain verifier; see `barretenberg/sol/CLAUDE.md`. `barretenberg/ts/` contains the TypeScript bindings for barretenberg (bb.js).

`avm-transpiler/` transpiles Noir bytecode to AVM bytecode (Rust). `noir/` is the Noir compiler, a git submodule pointing to noir-lang/noir. `noir-projects/` holds the protocol circuits and contract libraries written in Noir; see `noir-projects/aztec-nr/CLAUDE.md`.

`l1-contracts/` holds the Solidity L1 rollup contracts (a Foundry project). `docs/` is the developer documentation site (Docusaurus); see `docs/CLAUDE.md`. `spartan/` holds Kubernetes deployment infrastructure (Helm charts + Terraform); see `spartan/CLAUDE.md`. `bb-pilcom/` is the PIL compiler for AVM relation codegen. `ci3/` contains CI infrastructure scripts.
</components>

<build_system>
Dependencies flow barretenberg → noir → l1-contracts → yarn-project. From the git root, use `make <target>`: `make fast` builds everything needed for development, `make yarn-project` runs the full TS build chain (which builds bb, noir, and l1-contracts first), `make bb-cpp-native` builds barretenberg C++ native only, `make noir` builds the Noir compiler, and `make l1-contracts` builds the Solidity contracts via Foundry. For individual components, run `./bootstrap.sh` inside each directory.

When a change spans multiple components, rebuild in dependency order: first `barretenberg/cpp/` with `cmake --preset default && cd build && ninja`, then `barretenberg/ts/` with `./bootstrap.sh` (which generates TS bindings from C++), then `noir/` with `./bootstrap.sh` if noir changes are needed, then `noir-projects/` to compile contracts, then `l1-contracts/` with `forge build`, and finally `yarn-project/` with `yarn build` from inside `yarn-project/` (not the git root).

The noir-projects build scripts default `$NARGO` to `noir/noir-repo/target/release/nargo`. Do not override this with a globally installed nargo — version mismatches produce opaque bytecode failures in downstream components.
</build_system>

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

Use the discovered base in `git diff origin/<base>...HEAD` and `git log origin/<base>..HEAD`. Always `git fetch` before creating branches so the base is not stale.
</critical_never_assume_master>

<commits_and_prs>
Follow Conventional Commits: `fix:`, `feat:`, `chore:`, `refactor:`, `docs:`, `test:`. PRs are squashed to a single commit on merge, so during development just create normal commits — do not amend unless explicitly asked. If `noir/noir-repo` shows as modified unexpectedly, run `git submodule update noir/noir-repo` to reset it.
</commits_and_prs>

<git_staging>
When staging files, prefer `git add -u` or name specific files rather than `git add -A` or `git add .`. The aggregate flags will pick up unrelated untracked working directories (e.g. personal scratch projects at the repo root) and quietly stage them. Subagents must always name specific files in `git add` — never `-u`, `-A`, or `.` — because they lack the main conversation's context for judging which changes belong to the current task.
</git_staging>

<lockfile_discipline>
Never bulk-update lockfiles (`Cargo.lock`, `yarn.lock`). Use targeted updates only: `cargo update --precise <version> --package <name>` for Rust, and `yarn up <package>@<version>` in the relevant workspace for TypeScript. Bulk updates drag in unrelated transitive changes that make review impossible and frequently break reproducibility.
</lockfile_discipline>

</git_workflow>

<code_formatting>
Each language's formatter is documented in the relevant subdir `CLAUDE.md` — C++ conventions live in `barretenberg/cpp/CLAUDE.md`, TypeScript in `yarn-project/CLAUDE.md`, and Noir in `noir-projects/aztec-nr/CLAUDE.md`. A post-edit hook runs the appropriate formatter automatically, so there is normally no need to invoke one by hand.
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

<preserve_todos>
Preserve existing `// TODO`, `// TODO(name)`, and `// NOTE:` comments unless the current task is to resolve them. A "tidy up" refactor that deletes another author's deferred-work markers destroys context that is not recoverable from git history.

During cleanup or review passes, do not delete useful explanatory comments merely to reduce diff size. Remove or rewrite a comment only when it is incorrect, obsolete, noise, or directly resolved by the current task.
</preserve_todos>

<bash_hygiene>
Never append `; echo "EXIT: $?"` or similar exit-code suffixes to any command. The Bash tool already reports exit codes directly; adding these suffixes is redundant and causes unnecessary permission prompts.
</bash_hygiene>

<do_not_edit>
Never edit vendored submodules (all paths listed in `.gitmodules`) or files that contain a `DO NOT EDIT` / `generated` header. Edit the upstream source or the generator input and regenerate. CI enforces this — hand edits to generated files will be overwritten or rejected.
</do_not_edit>

<editorial_test>
Before adding a line to any `CLAUDE.md` file: answer in one sentence what specific wrong action the line would have prevented in a past session. If no such action exists, do not add the line. General knowledge, motivation, and historical rationale do not qualify — those belong in commit messages or subdirectory READMEs. This rule applies equally to every `CLAUDE.md` in the tree.
</editorial_test>

<writing_comments>
Default to writing no inline comments. Add one only when the *why* is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, or behavior that would surprise a reader. If removing the comment would not confuse a future reader, do not write it. 

Do write jsdoc, rustdoc, or natspec comments for documenting public methods.

Do not explain *what* the code does — well-named identifiers cover that. Comments of the form `// increment counter` / `// loop over peers` / `// return early on error` are noise and should be deleted rather than added.

Do not reference the current task, PR, caller, or author (`// used by X`, `// fix for issue #123`, `// AI-generated`), and do not add banner-style section comments (`// ===== HELPERS =====`). Both rot the moment the surrounding code is moved.
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
