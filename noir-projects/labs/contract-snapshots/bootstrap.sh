#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# nargo binary path relative to the crate root (this directory)
export NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}

# Build the snapshot test binaries (compiles build.rs codegen too) and run Rust lints.
function build {
    echo_header "contract-snapshots build"
    denoise "cargo build --tests"
    denoise "cargo fmt --check"
    denoise "cargo clippy --all-targets"
}

# Run the snapshot tests. CI rejects INSTA_UPDATE so any drift between
# committed snapshots and reality must be resolved intentionally by a developer.
function test {
    echo_header "contract-snapshots test"
    if [ "${CI:-0}" = "1" ] && [ -n "${INSTA_UPDATE:-}" ] && [ "${INSTA_UPDATE}" != "no" ]; then
        echo "INSTA_UPDATE is not permitted in CI. Run 'cargo insta accept' locally and commit." >&2
        exit 1
    fi

    # Warm nargo's git-dependency cache before the snapshot tests run. On a cold cache nargo prints a
    # one-time "Cloning into '.../noir-lang/{poseidon,sha256}/v0.3.0'..." line to stderr while resolving
    # the aztec library's git deps; with tests running in parallel that line lands in whichever
    # compile_failure snapshot triggers the clone first and breaks the byte-for-byte match. Cloning the
    # deps here keeps every captured stderr clean — the clone happens during dependency resolution
    # regardless of whether the check itself reports warnings or errors.
    local nargo_abs="$(cd "$(dirname "$NARGO")" && pwd)/$(basename "$NARGO")"
    (cd ../aztec-nr/aztec && "$nargo_abs" check) >/dev/null 2>&1 || true

    # TODO(#12933 on noir-lang/noir): `expand::test_avm_test_contract` is skipped because `nargo expand`
    # emits the generated contract-interface functions in hashmap-iteration order, which
    # is not stable across nargo builds/runs. The snapshot is correct but the test fails
    # intermittently in the merge queue on order-only diffs. Re-enable once noir makes the
    # expand output order deterministic (e.g. sort interface fns by name/selector).
    INSTA_UPDATE=no cargo test --quiet -- --skip expand::test_avm_test_contract
}

function test_cmds {
    if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
      hash=disabled-cache
    else
      hash=$(hash_str \
        $(../../../noir/bootstrap.sh hash) \
        $(cache_content_hash \
            ^noir-projects/labs/contract-snapshots \
            ^noir-projects/labs/noir-contracts/contracts/app \
            ^noir-projects/labs/noir-contracts/contracts/test \
            ^noir-projects/labs/aztec-nr))
    fi
    echo "$hash ./noir-projects/labs/contract-snapshots/bootstrap.sh test"
}

case "$cmd" in
  *)
    default_cmd_handler "$@"
    ;;
esac
