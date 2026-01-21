#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Get repo root for absolute paths
REPO_ROOT=$(git rev-parse --show-toplevel)

export BB=${BB:-"$REPO_ROOT/barretenberg/cpp/build/bin/bb"}
export NARGO=${NARGO:-"$REPO_ROOT/noir/noir-repo/target/release/nargo"}
export STRIP_AZTEC_NR_PREFIX=${STRIP_AZTEC_NR_PREFIX:-"$REPO_ROOT/noir-projects/noir-contracts/scripts/strip_aztec_nr_prefix.sh"}
export BB_HASH=${BB_HASH:-$("$REPO_ROOT/barretenberg/cpp/bootstrap.sh" hash)}

function compile {
  echo_header "Compiling example contracts"
  # Use noir-contracts bootstrap with WORKING_DIR pointing to examples.
  WORKING_DIR="docs/examples" $REPO_ROOT/noir-projects/noir-contracts/bootstrap.sh compile "$@"
}

function compile-solidity {
  echo_header "Compiling Solidity examples"
  local SOLIDITY_DIR="$REPO_ROOT/docs/examples/solidity"
  local OUTPUT_DIR="$REPO_ROOT/docs/target/solidity"

  # Find all .sol files recursively
  local sol_files
  sol_files=$(find "$SOLIDITY_DIR" -name "*.sol" 2>/dev/null)
  if [ -z "$sol_files" ]; then
    echo_stderr "No Solidity files found in $SOLIDITY_DIR"
    return 0
  fi

  mkdir -p "$OUTPUT_DIR"

  # Compile using the local foundry.toml with proper remappings
  (
    cd "$SOLIDITY_DIR"
    for subdir in */; do
      if [ -d "$subdir" ] && ls "$subdir"/*.sol >/dev/null 2>&1; then
        local subdir_name=$(basename "$subdir")
        echo_stderr "Compiling $subdir_name..."
        forge build \
          --contracts "$subdir" \
          --out "$OUTPUT_DIR/$subdir_name" \
          --no-cache
      fi
    done
  )

  echo_stderr "Solidity artifacts written to $OUTPUT_DIR"
}

function validate-ts {
  echo_header "Validating TypeScript examples"
  (cd ts && ./bootstrap.sh "$@")
}

case "$cmd" in
  "")
    compile
    compile-solidity
    validate-ts
    ;;
  compile-solidity)
    compile-solidity
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
