#!/usr/bin/env bash
# Bump AVM_V2_PROOF_LENGTH_IN_FIELDS to match the current AVM circuit shape and
# propagate the change through every downstream artifact (Noir, TS, Prover.toml
# fixtures, VKs).
#
# Run this whenever the AVM proof length goes out of sync with the C++ flavor —
# typically after adding/removing AVM columns. The build emits a static_assert
# from barretenberg/cpp/src/barretenberg/vm2/constraining/flavor.hpp pointing
# here.
#
# Two phases:
#   1. Discover the new computed length from the C++ flavor and (if it differs
#      from constants.nr) print instructions for the user to update constants.nr,
#      then exit. The user updates constants.nr by hand and re-runs the script.
#   2. Once constants.nr is in sync: regenerate each consumer's constants,
#      renew the pinned public-base-rollup VKs (see renew-pins below), rebuild Noir
#      (which also regenerates the remaining circuit VKs as a byproduct of bb write_vk
#      during the bootstrap), and regenerate Prover.toml fixtures via the e2e full.test
#      harness with FAKE_PROOFS=1.
#
# Subcommands:
#   (no args)   Run the full two-phase flow described above.
#   renew-pins  Only rebuild bb-avm and refresh the pinned public-base-rollup VKs in
#               noir-protocol-circuits and mock-protocol-circuits, without touching
#               constants or Prover.toml. The public-base-rollup recursively verifies
#               an AVM proof, so its pinned bytecode+VK go stale on any AVM proof-length
#               change (and its `./bootstrap.sh` pin check then fails). Run this after
#               such a change, or after any bb change that rotates just the base-public
#               VK, then commit the refreshed pinned-build.tar.gz files.
#
# Discovery uses a template-instantiation trick to expose
# COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS in a clang diagnostic — clang resolves
# constexpr values inside template arguments but not inside static_assert
# messages, so we momentarily replace the static_assert with a template probe,
# build, parse, then restore the file.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
FLAVOR_HPP="${ROOT}/barretenberg/cpp/src/barretenberg/vm2/constraining/flavor.hpp"
CONSTANTS_NR="${ROOT}/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr"
CPP_BUILD="${ROOT}/barretenberg/cpp/build"

step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Top-level safety net: snapshot flavor.hpp at script start; on ANY exit (success,
# error, signal), restore it from the snapshot if it differs. This makes phase 1
# safe to interrupt at any point and keeps phase 2 (which never touches flavor.hpp)
# from being able to leave the file in a modified state either.
FLAVOR_BACKUP="$(mktemp)"
cp "$FLAVOR_HPP" "$FLAVOR_BACKUP"
# shellcheck disable=SC2064
trap "
    if [[ -f '$FLAVOR_BACKUP' ]]; then
        if ! cmp -s '$FLAVOR_BACKUP' '$FLAVOR_HPP'; then
            cp '$FLAVOR_BACKUP' '$FLAVOR_HPP' && \
                echo 'NOTE: bump_avm_proof_length.sh restored flavor.hpp from backup' >&2
        fi
        rm -f '$FLAVOR_BACKUP'
    fi
" EXIT INT TERM

# Replace the canonical static_assert in flavor.hpp with a template probe whose
# instantiation forces clang to print the value of COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
# build vm2_objects, parse the value out of the diagnostic, then restore the file.
# The top-level trap above is the safety net; this function does an explicit nominal-
# path restore so the in-flow output stays clean.
discover_computed_length() {
    [[ -f "$FLAVOR_HPP" ]] || die "flavor.hpp not found at $FLAVOR_HPP"
    [[ -d "$CPP_BUILD"  ]] || die "C++ build dir missing: $CPP_BUILD (run cmake configure first)"

    local err_log computed
    err_log="$(mktemp)"

    python3 - "$FLAVOR_HPP" <<'PY'
import sys
path = sys.argv[1]
content = open(path).read()
old = '''    static_assert(AVM_V2_PROOF_LENGTH_IN_FIELDS == COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
                  "AVM_V2_PROOF_LENGTH_IN_FIELDS (constants.nr) != COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS. "
                  "Update AVM_V2_PROOF_LENGTH_IN_FIELDS in constants.nr to the computed value and "
                  "run barretenberg/cpp/scripts/bump_avm_proof_length.sh.");'''
new = '''    template <size_t N> struct DiscoverProofLength;
    static inline DiscoverProofLength<COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS> _bump_avm_proof_length_probe{};'''
if old not in content:
    sys.stderr.write(
        "Could not find the canonical AVM_V2_PROOF_LENGTH_IN_FIELDS static_assert "
        "in flavor.hpp. Has the assert been edited? Update bump_avm_proof_length.sh.\n")
    sys.exit(1)
open(path, 'w').write(content.replace(old, new))
PY

    # Build vm2_objects (incremental, just one header changed). The compile is
    # expected to fail with `implicit instantiation of undefined template
    # 'DiscoverProofLength<NNNN>'` — that NNNN is what we want.
    cmake --build "$CPP_BUILD" --target vm2_objects > "$err_log" 2>&1 || true

    computed="$(grep -oE 'DiscoverProofLength<[0-9]+>' "$err_log" | head -1 | grep -oE '[0-9]+' || true)"

    # Nominal-path restore. The top-level trap is still armed and will catch any
    # failure between here and the end of the script.
    rm -f "$err_log"
    cp "$FLAVOR_BACKUP" "$FLAVOR_HPP"

    [[ -n "$computed" ]] || die "could not parse COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS from build output"
    printf '%s' "$computed"
}

read_constants_nr_value() {
    # Match the literal RHS only; "u32" earlier on the line otherwise confuses [0-9]+ scans.
    python3 -c "
import re, sys
m = re.search(r'AVM_V2_PROOF_LENGTH_IN_FIELDS:\s*u32\s*=\s*(\d+)', open(sys.argv[1]).read())
print(m.group(1) if m else '', end='')
" "$CONSTANTS_NR"
}

phase1_check_or_instruct() {
    step "Phase 1: discovering current AVM proof length…"
    local computed current
    computed="$(discover_computed_length)"
    current="$(read_constants_nr_value)" \
        || die "cannot read AVM_V2_PROOF_LENGTH_IN_FIELDS from $CONSTANTS_NR"

    if [[ "$current" == "$computed" ]]; then
        step "constants.nr is in sync (AVM_V2_PROOF_LENGTH_IN_FIELDS = $current)."
        return 0
    fi

    cat <<EOF

AVM circuit shape changed; constants.nr is stale.

  Current AVM_V2_PROOF_LENGTH_IN_FIELDS: $current
  New computed length:                    $computed

Update $(realpath --relative-to="$ROOT" "$CONSTANTS_NR"):
  pub global AVM_V2_PROOF_LENGTH_IN_FIELDS: u32 = $computed;

Then re-run barretenberg/cpp/scripts/bump_avm_proof_length.sh to finish the cascade
(constant regeneration → noir rebuild → Prover.toml regen).
EOF
    exit 0
}

# Refresh a single protocol-circuits project's pinned-build.tar.gz for ONLY the
# public-base-rollup circuit(s). The public-base-rollup recursively verifies an AVM
# proof, so its committed bytecode hard-codes AVM_V2_PROOF_LENGTH_IN_FIELDS; when that
# constant changes the pinned bytecode+VK frozen in the tarball go stale and the pin
# check in the project's ./bootstrap.sh fails while recomputing the VK. We extract the
# tarball, recompile+re-key just the named circuit(s) against the current constants +
# bb-avm, and repack — every other pinned artifact is preserved byte-for-byte.
#
#   $1     absolute project dir (noir-protocol-circuits or mock-protocol-circuits)
#   $2...  circuit dir name(s) to recompile (e.g. rollup-tx-base-public [ ...-simulated ])
renew_project_pin() {
    local project_dir="$1"; shift
    local tarball="$project_dir/pinned-build.tar.gz"
    # mock-protocol-circuits has no standalone per-circuit build; it drives the
    # noir-protocol-circuits bootstrap with NOIR_PROTOCOL_CIRCUITS_WORKING_DIR set to it.
    local npc_bootstrap="$ROOT/noir-projects/noir-protocol-circuits/bootstrap.sh"

    if [[ ! -f "$tarball" ]]; then
        echo "  $(realpath --relative-to="$ROOT" "$tarball") not found; skipping." >&2
        return 0
    fi

    local workdir_env=()
    [[ "$(basename "$project_dir")" == "noir-protocol-circuits" ]] || \
        workdir_env=(NOIR_PROTOCOL_CIRCUITS_WORKING_DIR="$project_dir")

    (
        set -euo pipefail
        cd "$project_dir"
        # Regenerate the workspace manifest before compiling. Nargo.toml is a gitignored,
        # generated file (from Nargo.template.toml via generate_variants); a stale copy left
        # over across a rebase/branch switch can list workspace members that no longer exist,
        # and nargo loads every member when compiling ANY package, so a single missing member
        # aborts the compile. The full ./bootstrap.sh does this step; the `compile` subcommand
        # we invoke below does not.
        if [[ -f package.json ]] && grep -q '"generate_variants"' package.json; then
            yarn generate_variants
        fi
        rm -rf target && mkdir -p target target/keys
        tar xzf pinned-build.tar.gz -C target
        local c
        for c in "$@"; do
            step "  recompiling + re-keying $c ($(basename "$project_dir"))"
            if [[ ${#workdir_env[@]} -gt 0 ]]; then
                env "${workdir_env[@]}" "$npc_bootstrap" compile "$c"
            else
                "$npc_bootstrap" compile "$c"
            fi
        done
        tar czf pinned-build.tar.gz -C target .
    )
    echo "  refreshed $(realpath --relative-to="$ROOT" "$tarball")"
}

# Rebuild bb-avm (so find-bb serves the current AVM shape) and renew the pinned
# public-base-rollup VKs in both the real and mock protocol-circuit projects.
renew_base_public_pins() {
    [[ -d "$CPP_BUILD" ]] || die "C++ build dir missing: $CPP_BUILD (run cmake configure first)"
    step "Rebuilding bb-avm (find-bb serves it to the pin recompile)"
    cmake --build "$CPP_BUILD" --target bb-avm

    step "Renewing pinned public-base-rollup VKs (bytecode embeds the AVM proof)"
    renew_project_pin "$ROOT/noir-projects/noir-protocol-circuits" \
        rollup-tx-base-public rollup-tx-base-public-simulated
    renew_project_pin "$ROOT/noir-projects/mock-protocol-circuits" \
        mock-rollup-tx-base-public
}

phase2_cascade() {
    step "Phase 2: propagating to mirrors and rebuilding…"

    step "Regenerating constants for TypeScript and Barretenberg"
    if ! (
        cd "$ROOT/yarn-project"
        yarn workspace @aztec/constants generate
        "$ROOT/barretenberg/cpp/scripts/remake-constants.sh"
    ); then
        cat >&2 <<EOF

ERROR: constants regeneration failed. Make sure the repository is bootstrapped:

  ./bootstrap.sh build constants-codegen

Then re-run barretenberg/cpp/scripts/bump_avm_proof_length.sh.
EOF
        exit 1
    fi

    # Must precede the noir rebuild: ./bootstrap.sh below runs the pinned-VK check, which
    # dies on the now-stale public-base-rollup pin before it can proceed.
    renew_base_public_pins

    step "Rebuilding noir-projects (recompiles every circuit using AVM_V2_PROOF_LENGTH_IN_FIELDS)"
    (cd "$ROOT/noir-projects" && ./bootstrap.sh)

    step "Regenerating Prover.toml fixtures via end-to-end full.test (FAKE_PROOFS=1)"
    # full.test.ts:250-270 enumerates every circuit whose Prover.toml is
    # rewritten when AZTEC_GENERATE_TEST_DATA=1 is set; this includes
    # rollup-tx-base-public, the public-base rollup whose witness embeds the AVM
    # proof. The remaining rollup circuits (rollup-tx-merge, rollup-block-root,
    # etc.) take no AVM proof and are invariant under proof-length changes, so
    # they don't need regenerating.
    # Path-specific pattern: bare "full.test" also matches src/composed/ha/e2e_ha_full.test.ts.
    (cd "$ROOT/yarn-project" && AZTEC_GENERATE_TEST_DATA=1 FAKE_PROOFS=1 \
        yarn workspace @aztec/end-to-end test e2e_prover/full.test)

    step "Final verification build to re-engage the == static_assert"
    cmake --build "$CPP_BUILD" --target vm2_objects

    cat <<EOF

Done. Review the diff before committing:
  git status
  git diff --stat
EOF
}

main() {
    case "${1:-}" in
        renew-pins)
            renew_base_public_pins
            cat <<EOF

Done. Refreshed the pinned public-base-rollup VKs. Review and commit:
  git status
  git diff --stat -- '*pinned-build.tar.gz'
EOF
            ;;
        "")
            phase1_check_or_instruct
            phase2_cascade
            ;;
        *)
            die "unknown subcommand: '${1}' (use no args for the full flow, or 'renew-pins')"
            ;;
    esac
}

main "$@"
