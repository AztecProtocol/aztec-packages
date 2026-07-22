---
name: noir-sync-update
description: Bump the Noir compiler version in aztec-packages and perform every follow-on update. Use whenever the noir/noir-repo submodule changes or on a request to "bump/update the noir compiler version to X" or "bump the noir submodule". Covers the submodule pointer, avm-transpiler Cargo.lock, yarn-project yarn.lock, and noir-projects formatting.
---

# Noir Sync Update

To bump the Noir compiler (a request like "bump the noir compiler version to X",
"update noir to <ref>") or to reconcile the tree after any manual `noir/noir-repo`
submodule change, run the single source-of-truth script:

```bash
noir/scripts/bump_noir_compiler.sh <ref>
```

`<ref>` is any noir-lang/noir git reference — a release tag (`v1.0.0-beta.23`), a
nightly tag (`nightly-2026-06-02`), a branch, or a commit. With no `<ref>` it uses
the latest `nightly-*` tag. The script bumps the submodule, refreshes
`avm-transpiler/Cargo.lock` and `yarn-project/yarn.lock`, reformats `noir-projects`,
and stages everything. It does not commit.

Read the script's header and inline comments for what each step does, why, and how
to recover when a step fails (e.g. a changed transitive Cargo dependency, or the
format step needing a built nargo). After it runs:

1. Verify each artifact actually changed with `git status` from the **repository root**
   (running `git status` from inside a subdirectory can silently report nothing).
2. Review the staged diff and commit, e.g. `git commit -m "chore: update Noir to <ref>"`.

Requires a real toolchain (cargo, corepack/yarn, a built nargo); the steps are
best-effort in a bare checkout. If a step warns, follow the guidance it prints and
re-run before committing.
