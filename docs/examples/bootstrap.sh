#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
shift || true

# Get repo root for absolute paths
REPO_ROOT=$(git rev-parse --show-toplevel)

export BB=${BB:-"$REPO_ROOT/barretenberg/cpp/build/bin/bb"}
export NARGO=${NARGO:-"$REPO_ROOT/noir/noir-repo/target/release/nargo"}
export TRANSPILER=${TRANSPILER:-"$REPO_ROOT/avm-transpiler/target/release/avm-transpiler"}
export STRIP_AZTEC_NR_PREFIX=${STRIP_AZTEC_NR_PREFIX:-"$REPO_ROOT/noir-projects/noir-contracts/scripts/strip_aztec_nr_prefix.sh"}
export BB_HASH=${BB_HASH:-$("$REPO_ROOT/barretenberg/cpp/bootstrap.sh" hash)}
export NOIR_HASH=${NOIR_HASH:-$("$REPO_ROOT/noir/bootstrap.sh" hash)}

function compile_contracts {
    echo_header "Compiling example contracts"
    # Use noir-contracts bootstrap with DOCS_WORKING_DIR pointing to parent (docs/)
    DOCS_WORKING_DIR="$(cd .. && pwd)" \
        $REPO_ROOT/noir-projects/noir-contracts/bootstrap.sh compile "$@"
}

function validate_ts_projects {
    echo_header "Validating TypeScript examples"
    (cd ts && ./bootstrap.sh "$@")
}

case "$cmd" in
    "clean")
        git clean -fdx
        ;;
    "compile")
        compile_contracts "$@"
        ;;
    "validate-ts")
        validate_ts_projects "$@"
        ;;
    ""|"full"|"fast")
        compile_contracts
        validate_ts_projects
        ;;
    *)
        echo_stderr "ERROR: Unknown command '${cmd}'"
        echo_stderr "Usage: bootstrap.sh [clean|compile|validate-ts|full|fast]"
        exit 1
esac
