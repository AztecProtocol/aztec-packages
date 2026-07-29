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

export BB=${BB:-../../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
export BB_HASH=${BB_HASH:-$(../../../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../../../noir/bootstrap.sh hash)}
# Below the Linux ephemeral range (32768-60999) to reduce accidental port conflicts.
DEFAULT_TXE_PORT=14730

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
        "^noir-projects/labs/aztec-nr/")
  else
    # Called from noir-contracts
    hash_str \
      $NOIR_HASH \
      $(cache_content_hash \
        ../../../avm-transpiler/.rebuild_patterns \
        ../../../barretenberg/cpp/.rebuild_patterns \
        ../../../barretenberg/ts/.rebuild_patterns \
        "^noir-projects/labs/noir-contracts/contracts/$contract_path/" \
        "^noir-projects/labs/aztec-nr/")
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
  cat "$tmp" > "$json_path"
  rm "$tmp"
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
    # Aztec private app circuits intentionally defer validation of some oracle outputs (including
    # note-read requests) to the private kernels. Noir's local underconstrained and Brillig coverage
    # checks cannot see those downstream constraints.
    #
    # beta.25 also recognizes constant fields in the fixed PrivateCircuitPublicInputs ABI and
    # reports them as ReturnConstant warnings. Those fields cannot be removed from the protocol ABI,
    # so allow that one diagnostic while continuing to reject every other compiler warning or bug.
    local diagnostics_file=$(mktemp)
    if ! $NARGO compile \
      --package $contract \
      --inliner-aggressiveness 0 \
      --skip-underconstrained-check \
      --skip-brillig-constraints-check \
      2>"$diagnostics_file"; then
      cat "$diagnostics_file" >&2
      rm "$diagnostics_file"
      return 1
    fi
    cat "$diagnostics_file" >&2

    local unexpected_diagnostics
    unexpected_diagnostics=$(grep -E '^(warning|bug):' "$diagnostics_file" \
      | grep -Fvx 'warning: Return variable contains a constant value' || true)
    rm "$diagnostics_file"
    if [ -n "$unexpected_diagnostics" ]; then
      echo_stderr "Unexpected Noir compiler diagnostics:"
      echo_stderr "$unexpected_diagnostics"
      return 1
    fi
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
    # test_token_contract is generated from canonical app/token_contract. Locally, regenerate it in
    # place so an edited Token is reflected in TestToken-based tests before you commit (the precommit
    # hook also regenerates it on commit). In CI we verify instead of regenerate: the committed copy
    # must already be in sync, and a CI build must not modify checked-in files. See gen_test_token.sh.
    if [ "$CI" -eq 1 ]; then
      ./scripts/gen_test_token.sh --check
    else
      ./scripts/gen_test_token.sh
    fi
  fi

  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p target
    local contracts=$(grep -oP "(?<=$folder_name/)[^\"]+" Nargo.toml)

    # If a pinned standard-contracts archive is present, extract it into target/ and skip
    # recompilation of those contracts. The archive pins the canonical standard-contract
    # artifacts so their deterministic addresses can never silently drift; when it is absent,
    # everything compiles fresh.
    if [ -f pinned-standard-contracts.tar.gz ]; then
      echo_stderr "Using pinned-standard-contracts.tar.gz for pinned standard contracts."
      tar xzf pinned-standard-contracts.tar.gz -C target
      contracts=$(echo "$contracts" | grep -vE "^standard/")
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
  local txe_port=${1:-$DEFAULT_TXE_PORT}
  local folder_name
  if [ -n "${DOCS_WORKING_DIR:-}" ]; then
    folder_name="examples"
  else
    folder_name="contracts"
  fi

  # Test bb aztec_process command
  echo "$BB_HASH noir-projects/labs/noir-contracts/scripts/test_aztec_process.sh"

  # Fairies want to run these tests on every PR
  if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
    $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
      echo "disabled-cache noir-projects/scripts/run_test.sh labs/noir-contracts $package $test $txe_port"
    done
  else
    local -A cache
    $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
      [ -z "${cache[$package]:-}" ] && cache[$package]=$(get_contract_hash $package $folder_name)
      echo "${cache[$package]} noir-projects/scripts/run_test.sh labs/noir-contracts $package $test $txe_port"
    done
  fi
}

function start_txe {
  local txe_port=$1
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT

  check_port "$txe_port" || echo "WARNING: port $txe_port is in use, TXE may fail to start"
  (cd $root/yarn-project/txe && UV_THREADPOOL_SIZE=8 LOG_LEVEL=silent TXE_PORT=$txe_port yarn start) >/dev/null &

  echo "Waiting for TXE to start..."
  local j=0
  while ! nc -z 127.0.0.1 "$txe_port" &>/dev/null; do
    if [ $j == 60 ]; then
      echo "TXE failed to start on port $txe_port after 60s." >&2
      check_port "$txe_port"
      exit 1
    fi
    sleep 1
    j=$((j+1))
  done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
}

function test {
  local txe_port=$DEFAULT_TXE_PORT
  start_txe "$txe_port"
  test_cmds "$txe_port" | filter_test_cmds | parallelize
}

function test-package {
  if [ "$#" -ne 1 ]; then
    echo_stderr "Usage: ./bootstrap.sh test-package <package>"
    return 1
  fi

  local package=$1
  local txe_port=$DEFAULT_TXE_PORT
  start_txe "$txe_port"

  $NARGO test \
    --silence-warnings \
    --skip-brillig-constraints-check \
    --oracle-resolver "http://127.0.0.1:$txe_port" \
    --package "$package"
}

function test-one {
  if [ "$#" -ne 2 ]; then
    echo_stderr "Usage: ./bootstrap.sh test-one <package> <exact_test_name>"
    return 1
  fi

  local package=$1
  local test_name=$2
  local txe_port=$DEFAULT_TXE_PORT
  start_txe "$txe_port"

  $root/noir-projects/scripts/run_test.sh labs/noir-contracts "$package" "$test_name" "$txe_port"
}

function format {
  $NARGO fmt
}

function bench_cmds {
  # Size every compiled contract artifact (total JSON size + public bytecode size). Reads the
  # artifacts produced by `build`, so it runs after the contracts are compiled. Keyed on the noir/bb
  # toolchain plus the contract sources (the same inputs as get_contract_hash, but covering all
  # contracts) so it re-runs whenever any artifact could change. Skipped in the docs/examples flow.
  [ -n "${DOCS_WORKING_DIR:-}" ] && return
  local hash=$(hash_str \
    $NOIR_HASH \
    $BB_HASH \
    $(cache_content_hash \
      ../../../avm-transpiler/.rebuild_patterns \
      ../../../barretenberg/cpp/.rebuild_patterns \
      ../../../barretenberg/ts/.rebuild_patterns \
      "^noir-projects/labs/noir-contracts/" \
      "^noir-projects/labs/aztec-nr/" \
      "^noir-projects/labs/noir-contracts/scripts/bench_artifact_sizes.sh"))
  echo "$hash noir-projects/labs/noir-contracts/scripts/bench_artifact_sizes.sh"
}

# Force-builds standard contracts and tar-balls their artifacts into pinned-standard-contracts.tar.gz.
#
# WARNING: re-pinning (running this, then committing the new tarball) moves the standard contracts'
# canonical deterministic addresses and class ids. Rebuilding changes the artifact hash and bytecode
# commitment, which changes the class id and the address derived from it. Those addresses are baked
# into every already-deployed network and published package, so a re-pin breaks compatibility with all
# of them and means the standard contracts must be redeployed at their new addresses on any network
# meant to run the new artifacts. It is only correct as part of a deliberate, coordinated redeploy.
# Mirrors the v4 `pin-build` mechanism that pins protocol contracts.
function pin-standard-build {
  rm -f pinned-standard-contracts.tar.gz
  local standard_contracts=$(grep -oP '(?<=contracts/)[^"]+' Nargo.toml | grep "^standard/")
  build $standard_contracts || { echo_stderr "Build failed; refusing to create tarball."; return 1; }
  local standard_artifacts=$(jq -r '.[]' standard_contracts.json | sed 's/$/.json/')
  for a in $standard_artifacts; do
    [ -f "target/$a" ] || { echo_stderr "Missing artifact target/$a; refusing to create tarball."; return 1; }
  done
  echo_stderr "Creating pinned-standard-contracts.tar.gz..."
  (cd target && tar czf ../pinned-standard-contracts.tar.gz $standard_artifacts)
  echo_stderr "Done. pinned-standard-contracts.tar.gz created. Commit it to pin these artifacts."
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
  "pin-standard-build")
    pin-standard-build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
