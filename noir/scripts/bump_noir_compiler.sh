#!/usr/bin/env bash
# Bump the Noir compiler to a given version and update every lockfile that
# depends on it, in one shot.
#
# Bumping Noir touches three tracked artifacts that must move together, or the
# resulting tree is inconsistent and downstream builds break:
#   1. the noir/noir-repo submodule pointer
#   2. avm-transpiler/Cargo.lock  (the transpiler depends on noir crates by path)
#   3. yarn-project/yarn.lock     (picks up noir JS package version / file: hash changes)
#
# Usage:
#   noir/scripts/bump_noir_compiler.sh <ref>
#   noir/scripts/bump_noir_compiler.sh                # defaults to latest nightly tag
#
# <ref> is any git reference in noir-lang/noir: a tag (e.g. a release tag
# v1.0.0-beta.23, or a nightly tag nightly-2026-06-02), a branch, or a commit sha.
#
# The script only edits and `git add`s files; it does not commit, branch, or push.
# Lockfile update steps are best-effort (mirrors the old pull-noir.yml workflow):
# a partial update still produces a useful diff, so a failing cargo/yarn step
# warns but does not abort.
set -euo pipefail

# Resolve the aztec-packages git root regardless of where the script is invoked from.
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT"

SUBMODULE="noir/noir-repo"

CURRENT_COMMIT="$(git -C "$SUBMODULE" rev-parse HEAD)"
CURRENT_TAG="$(git -C "$SUBMODULE" describe --tags --exact-match 2>/dev/null || echo "unknown")"

REF="${1:-}"
if [[ -z "$REF" ]]; then
  echo "No ref supplied; resolving latest nightly tag..."
  git -C "$SUBMODULE" fetch --tags --quiet
  # Upstream noir nightly tags look like nightly-YYYY-MM-DD; version-sort, newest last.
  REF="$(git -C "$SUBMODULE" tag -l 'nightly-*' | sort -V | tail -1)"
  if [[ -z "$REF" ]]; then
    echo "error: could not determine a latest nightly tag; pass an explicit ref." >&2
    exit 1
  fi
fi

echo "Current: $CURRENT_TAG ($CURRENT_COMMIT)"
echo "Target:  $REF"

echo "==> Updating $SUBMODULE to $REF"
# noir-repo is a shallow submodule, so the ref may not be present locally yet.
# Fetch the specific ref (and its tag, if it is one) before checking out.
git -C "$SUBMODULE" fetch --tags --depth 1 origin "$REF" \
  || git -C "$SUBMODULE" fetch --tags origin "$REF" \
  || git -C "$SUBMODULE" fetch --tags
git -C "$SUBMODULE" checkout --detach "$REF" 2>/dev/null \
  || git -C "$SUBMODULE" checkout --detach FETCH_HEAD

NEW_COMMIT="$(git -C "$SUBMODULE" rev-parse HEAD)"

echo "==> Refreshing avm-transpiler/Cargo.lock"
# Update ONLY the noir-repo path packages, per the repo's lockfile-discipline
# rule (never bulk-update Cargo.lock). Keep this list in sync with the
# noir-sync-update skill. A new/removed transitive dep may still require a
# manual follow-up; a failure here warns rather than aborting.
NOIR_CARGO_PACKAGES=(
  acir acir_field acvm acvm_blackbox_solver bn254_blackbox_solver
  brillig brillig_vm fm iter-extended noirc_abi noirc_arena
  noirc_artifacts noirc_errors noirc_evaluator noirc_frontend
  noirc_printable_type noirc_span
)
CARGO_PKG_ARGS=()
for pkg in "${NOIR_CARGO_PACKAGES[@]}"; do CARGO_PKG_ARGS+=(-p "$pkg"); done
cargo update --manifest-path avm-transpiler/Cargo.toml "${CARGO_PKG_ARGS[@]}" \
  || echo "warning: 'cargo update' on avm-transpiler failed; Cargo.lock may be partially updated" >&2

echo "==> Refreshing yarn-project/yarn.lock"
# --mode=update-lockfile skips linking and build scripts; it just reconciles the
# lockfile with the new noir JS package versions / file: hashes.
corepack enable 2>/dev/null || true
(cd yarn-project && yarn install --mode=update-lockfile) \
  || echo "warning: yarn lockfile update failed; yarn.lock may be unchanged" >&2

echo "==> Staging changes"
git add "$SUBMODULE" avm-transpiler/Cargo.lock yarn-project/yarn.lock

cat <<EOF

Done. Staged: $SUBMODULE, avm-transpiler/Cargo.lock, yarn-project/yarn.lock

  Old: $CURRENT_TAG ($CURRENT_COMMIT)
  New: $REF ($NEW_COMMIT)

Review the staged diff, then commit, e.g.:
  git commit -m "chore: update Noir to $REF"

Follow-on: a compiler bump can change formatter output, so run
'./bootstrap.sh format' in noir-projects (needs a built nargo) and commit any
changes, or CI will fail. See the noir-sync-update skill for the full checklist.

Compare upstream:
  https://github.com/noir-lang/noir/compare/$CURRENT_COMMIT...$NEW_COMMIT
EOF
