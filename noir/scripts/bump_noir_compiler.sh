#!/usr/bin/env bash
# Bump the Noir compiler to a given version and perform every follow-on update,
# in one shot. This script is the single source of truth for a Noir bump.
#
# Bumping Noir touches several tracked artifacts that must move together, or the
# resulting tree is inconsistent and downstream builds / CI break:
#   1. the noir/noir-repo submodule pointer
#   2. avm-transpiler/Cargo.lock  (the transpiler depends on noir crates by path)
#   3. yarn-project/yarn.lock     (picks up noir JS package version / file: hash changes)
#   4. noir-projects formatting   (a compiler bump can change formatter output)
#
# Usage:
#   noir/scripts/bump_noir_compiler.sh <ref>
#   noir/scripts/bump_noir_compiler.sh                # defaults to latest nightly tag
#
# <ref> is any git reference in noir-lang/noir: a tag (e.g. a release tag
# v1.0.0-beta.23, or a nightly tag nightly-2026-06-02), a branch, or a commit sha.
# NOTE: noir-lang/noir nightlies are tagged nightly-YYYY-MM-DD. Do not confuse
# these with aztec-packages' own vX.Y.Z-nightly.* tags, which are a different scheme.
#
# The script edits and `git add`s files; it does not commit, branch, or push.
# Each update step is best-effort: it needs a real toolchain (cargo, corepack/yarn,
# a built nargo), so in a bare checkout the steps warn rather than abort, and a
# partial update still produces a useful diff to finish by hand.
set -euo pipefail

# Resolve the aztec-packages git root regardless of where the script is invoked
# from. All git-status checks below assume this root (running e.g. `git status`
# from inside a subdirectory can silently report nothing).
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

# --- 1. Submodule pointer -----------------------------------------------------
echo "==> Updating $SUBMODULE to $REF"
# noir-repo is a shallow submodule, so the ref may not be present locally yet.
# Fetch the specific ref (and its tag, if it is one) before checking out.
git -C "$SUBMODULE" fetch --tags --depth 1 origin "$REF" \
  || git -C "$SUBMODULE" fetch --tags origin "$REF" \
  || git -C "$SUBMODULE" fetch --tags
git -C "$SUBMODULE" checkout --detach "$REF" 2>/dev/null \
  || git -C "$SUBMODULE" checkout --detach FETCH_HEAD

NEW_COMMIT="$(git -C "$SUBMODULE" rev-parse HEAD)"
# The expected noir crate version for the sanity check below lives in the submodule.
EXPECTED_VERSION="$(sed -n 's/.*"\.": *"\([^"]*\)".*/\1/p' "$SUBMODULE/.release-please-manifest.json" 2>/dev/null || true)"

# --- 2. avm-transpiler/Cargo.lock ---------------------------------------------
echo "==> Refreshing avm-transpiler/Cargo.lock"
# Update ONLY the noir-repo path packages, per the repo's lockfile-discipline
# rule (never bulk-update Cargo.lock -- `cargo update` without -p would drag in
# unrelated transitive bumps). Keep this list current with the noir crates the
# transpiler pulls in by path.
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
# If the transpiler no longer builds after this, the fix belongs in
# avm-transpiler (its Cargo.lock, or import statements for changed noir exports).
# DO NOT edit noir/noir-repo to make the transpiler build.
if [[ -n "$EXPECTED_VERSION" ]]; then
  grep -q "$EXPECTED_VERSION" avm-transpiler/Cargo.lock \
    || echo "warning: avm-transpiler/Cargo.lock does not mention expected noir version $EXPECTED_VERSION; check the update." >&2
fi

# --- 3. yarn-project/yarn.lock ------------------------------------------------
echo "==> Refreshing yarn-project/yarn.lock"
# --mode=update-lockfile skips linking and build scripts; it just reconciles the
# lockfile with the new noir JS package versions / file: hashes. Resolution still
# reads every portal target's manifest, so noir/packages must already be built
# (`(cd noir && ./bootstrap.sh)`) or yarn aborts with "Manifest not found".
corepack enable 2>/dev/null || true
(cd yarn-project && yarn install --mode=update-lockfile) \
  || echo "warning: yarn lockfile update failed; yarn.lock may be unchanged" >&2

# --- 4. noir-projects formatting ----------------------------------------------
echo "==> Formatting noir-projects"
# A compiler bump can change how the formatter handles identical code; skipping
# this reformat is a CI failure. Needs a built nargo (noir/noir-repo/target/release/nargo);
# run `(cd noir && ./bootstrap.sh)` first if the format step reports nargo is missing.
for workspace in fnd labs; do
  (cd "noir-projects/$workspace" && ./bootstrap.sh format) \
    || echo "warning: noir-projects/$workspace format failed (is nargo built?); run '(cd noir-projects/$workspace && ./bootstrap.sh format)' before committing, or CI will fail." >&2
done

echo "==> Staging changes"
git add "$SUBMODULE" avm-transpiler/Cargo.lock yarn-project/yarn.lock noir-projects

cat <<EOF

Done. Staged: $SUBMODULE, avm-transpiler/Cargo.lock, yarn-project/yarn.lock, noir-projects

  Old: $CURRENT_TAG ($CURRENT_COMMIT)
  New: $REF ($NEW_COMMIT)

Review the staged diff (verify each artifact actually changed with 'git status'
from the repo root), then commit, e.g.:
  git commit -m "chore: update Noir to $REF"

Compare upstream:
  https://github.com/noir-lang/noir/compare/$CURRENT_COMMIT...$NEW_COMMIT
EOF
