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
#   2. Once constants.nr is in sync: run yarn remake-constants (propagates to
#      aztec_constants.hpp / constants.gen.ts / ConstantsGen.sol / constants_gen.pil),
#      rebuild Noir (which also regenerates the affected circuit VKs as a byproduct
#      of bb write_vk during the bootstrap), and regenerate Prover.toml fixtures
#      via the e2e full.test harness with FAKE_PROOFS=1.
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
(yarn remake-constants → noir rebuild → Prover.toml regen).
EOF
    exit 0
}

phase2_cascade() {
    step "Phase 2: propagating to mirrors and rebuilding…"

    step "yarn remake-constants (constants.nr → aztec_constants.hpp, constants.gen.ts, ConstantsGen.sol, constants_gen.pil)"
    if ! (cd "$ROOT/yarn-project" && yarn workspace @aztec/constants remake-constants); then
        cat >&2 <<EOF

ERROR: yarn remake-constants failed. Make sure yarn-project is bootstrapped:

  ./bootstrap.sh build yarn-project

Then re-run barretenberg/cpp/scripts/bump_avm_proof_length.sh.
EOF
        exit 1
    fi

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
    phase1_check_or_instruct
    phase2_cascade
}

main "$@"
