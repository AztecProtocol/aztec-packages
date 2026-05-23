#!/usr/bin/env bash
#
# Some notes if you have to work on this script.
# - First of all, I'm sorry (edit: not sorry). It's a beautiful script but it's no fun to debug. I got carried away.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is quite verbose that it's not much use by default.
# - This flag however, isn't carried into exported functions. You need to do "set -x" in those functions manually.
# - You can call ./bootstrap.sh compile <contract names> to compile and process select contracts.
# - You can disable further parallelism by setting passing 1 as arg to 'parallelize' and with PARALLELISM=1.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -euo pipefail
# - The exported functions are using stdin/stdout, so be very careful about what's printed where.
# - The exported functions need to have external variables they require, to have been exported first.
# - You can't export bash arrays or maps to be used by external functions, only strings.
# - If you want to echo something, send it to stderr e.g. echo_stderr "My debug"
# - If you call another script, be sure it also doesn't output something you don't want.
# - Local assignments with sub-shells don't propagate errors e.g. local capture=$(false). Declare locals separately.
# - Just ask me (charlie) for guidance if you're suffering.
# - I remain convinced we don't need node for these kinds of things, and we can be more performant/expressive with bash.
# - We could perhaps make it less tricky to work with by leveraging more tempfiles and less stdin/stdout.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# entrypoint for docs
if [ -n "${DOCS_WORKING_DIR:-}" ]; then
  cd "$DOCS_WORKING_DIR"
fi

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export BB_HASH=${BB_HASH:-$(../../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}

# Set common flags for parallel.
export PARALLEL_FLAGS="-j${PARALLELISM:-16} --halt now,fail=1 --memsuspend $(memsuspend_limit)"

# Compute hash for a given contract.
# $1 is the contract name, $2 is the folder name (e.g. "contracts" or "examples")
function get_contract_hash {
  local contract_path=$(get_contract_path "$1" "$2")

  if [ "$2" = "examples" ]; then
    # Called from docs
    hash_str \
      $NOIR_HASH \
      $(cache_content_hash \
        ../avm-transpiler/.rebuild_patterns \
        ../barretenberg/cpp/.rebuild_patterns \
        ../barretenberg/ts/.rebuild_patterns \
        "^docs/examples/$contract_path/" \
        "^noir-projects/aztec-nr/" \
        "^noir-projects/noir-protocol-circuits/crates/types/")
  else
    # Called from noir-contracts
    hash_str \
      $NOIR_HASH \
      $(cache_content_hash \
        ../../avm-transpiler/.rebuild_patterns \
        ../../barretenberg/cpp/.rebuild_patterns \
        ../../barretenberg/ts/.rebuild_patterns \
        "^noir-projects/noir-contracts/contracts/$contract_path/" \
        "^noir-projects/noir-contracts/contracts/protocol/aztec_sublib/" \
        "^noir-projects/aztec-nr/" \
        "^noir-projects/noir-protocol-circuits/crates/types/")
  fi
}
export -f get_contract_hash

# Extract contract path from Nargo.toml based on argument
# Handle both formats: full path relative to contracts/ or just contract name
# E.g. for both "ecdsa_k_account_contract" and "account/ecdsa_k_account_contractor" returns
# "account/ecdsa_k_account_contractor"
#
# $1 is the contract input, $2 is the folder name (e.g. "contracts" or "examples")
# This is done to ensure that both paths can be provided as inputs to the script.
function get_contract_path {
  local input=$1
  local folder_name=$2
  local contract_path
  if [[ $input == *"/"* ]]; then
    # Full path provided (e.g. account/ecdsa_k_account_contract)
    contract_path=$input
  else
    # Just contract name provided (e.g. ecdsa_k_account_contract)
    contract_path=$(grep -oP "(?<=$folder_name/)[^\"]+/$input" Nargo.toml)
    if [ -z "$contract_path" ]; then
      echo "Contract $input not found in Nargo.toml" >&2
      exit 1
    fi
  fi
  echo "$contract_path"
}
export -f get_contract_path

# Stamps "dev" (DEV_VERSION) as the artifact's aztec_version - that is the expected version of a locally checked out
# monorepo. The real release version is applied at publish time by whichever path owns it:
# ci3/release_prep_package_json for npm packages, release-image/Dockerfile for the docker image.
function stamp_dev_aztec_version {
  local json_path=$1
  local tmp=$(mktemp)
  jq '.aztec_version = "dev"' "$json_path" > "$tmp"
  mv "$tmp" "$json_path"
}
export -f stamp_dev_aztec_version

# This compiles a noir contract, transpiles public functions, strips internal prefixes,
# and generates verification keys for private functions via 'bb aztec_process'.
# $1 is the input package name, $2 is the folder name (e.g. "contracts" or "examples")
# On exit its fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail

  local contract_path=$(get_contract_path "$1" "$2")
  local contract=$(grep -oP '(?<=^name = ")[^"]+' "$2/$contract_path/Nargo.toml")
  # Calculate filename because nargo...
  local contract_name=$(cat $2/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  local contract_hash=$(get_contract_hash $1 $2)
  if ! cache_download contract-$contract_hash.tar.gz; then
    $NARGO compile --package $contract --inliner-aggressiveness 0 --deny-warnings
    $BB aztec_process -i $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi
  # Stamp the version after the cache block so the field is always present, whether the artifact came from a fresh
  # compile or a cache hit.
  stamp_dev_aztec_version "$json_path"
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."
  local folder_name
  if [ -n "${DOCS_WORKING_DIR:-}" ]; then
    folder_name="examples"
  else
    folder_name="contracts"
  fi

  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p target
    local contracts=$(grep -oP "(?<=$folder_name/)[^\"]+" Nargo.toml)

    # If pinned contracts exist, extract them and skip their compilation.
    if [ -f pinned-protocol-contracts.tar.gz ]; then
      echo_stderr "Using pinned-protocol-contracts.tar.gz for pinned contracts."
      tar xzf pinned-protocol-contracts.tar.gz -C target
      contracts=$(echo "$contracts" | grep -vE "^protocol/")
    fi
  else
    local contracts="$@"
  fi
  set +e
  parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag compile {} $folder_name ::: ${contracts[@]}
  code=$?
  cat joblog.txt
  return $code
}

function test_cmds {
  local -A cache
  local folder_name
  if [ -n "${DOCS_WORKING_DIR:-}" ]; then
    folder_name="examples"
  else
    folder_name="contracts"
  fi

  # Test bb aztec_process command
  echo "$BB_HASH noir-projects/scripts/test_aztec_process.sh"

  i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    port=$((14730 + (i++ % ${NUM_TXES:-1})))
    [ -z "${cache[$package]:-}" ] && cache[$package]=$(get_contract_hash $package $folder_name)
    echo "${cache[$package]} noir-projects/scripts/run_test.sh noir-contracts $package $test $port"
  done
}

function test {
  # Starting txe servers with incrementing port numbers.
  # Base port is below the Linux ephemeral range (32768-60999) to avoid conflicts.
  local txe_base_port=14730
  export NUM_TXES=1
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    check_port $((txe_base_port + i)) || echo "WARNING: port $((txe_base_port + i)) is in use, TXE $i may fail to start"
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((txe_base_port + i)) yarn start) >/dev/null &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      local j=0
      local port=$((txe_base_port + i))
      while ! nc -z 127.0.0.1 $port &>/dev/null; do
        if [ $j == 60 ]; then
          echo "TXE $i failed to start on port $port after 60s." >&2
          check_port $port
          exit 1
        fi
        sleep 1
        j=$((j+1))
      done
  done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
  test_cmds | filter_test_cmds | parallelize
}

function format {
  $NARGO fmt
}

function pin-build {
  # Force a real build by removing any existing pinned archive.
  rm -f pinned-protocol-contracts.tar.gz
  local protocol_contracts=$(grep -oP '(?<=contracts/)[^"]+' Nargo.toml | grep "^protocol/")
  build $protocol_contracts
  local protocol_artifacts=$(jq -r '.[]' protocol_contracts.json | sed 's/$/.json/')
  echo_stderr "Creating pinned-protocol-contracts.tar.gz..."
  (cd target && tar czf ../pinned-protocol-contracts.tar.gz $protocol_artifacts)
  echo_stderr "Done. pinned-protocol-contracts.tar.gz created. Commit it to pin these artifacts."
}

case "$cmd" in
  "clean-keys")
    for artifact in target/*.json; do
      echo_stderr "Scrubbing vk from $artifact..."
      jq '.functions |= map(del(.verification_key))' "$artifact" > "${artifact}.tmp"
      mv "${artifact}.tmp" "$artifact"
    done
    ;;
  "")
    build
    ;;
  "compile")
    VERBOSE=${VERBOSE:-1} build "$@"
    ;;
  "pin-build")
    pin-build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
