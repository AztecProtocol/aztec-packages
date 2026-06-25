#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)
bench_fixtures_dir=chonk-pinned-flows
default_avm_inputs_dump_dir=dumped-avm-circuit-inputs
ultrahonk_bench_dir=ultrahonk-bench-inputs

function build {
  cache_load_image consensys/web3signer:25.11.0
  cache_load_image postgres:16-alpine
}

# Helper function to extract test names from a test file
function extract_test_names {
  local test_file="$1"
  grep -oP "(it|test)\s*\(\s*['\"].*?['\"]" "$test_file" | \
    sed -E "s/(it|test)\s*\(\s*['\"](.+)['\"]/\2/"
}

# Helper to generate DUMP_AVM_INPUTS_TO_DIR env var setting for a test (empty if not dumping)
function set_dump_avm {
  [ -n "${DUMP_AVM_INPUTS_TO_DIR:-}" ] && echo "DUMP_AVM_INPUTS_TO_DIR=${DUMP_AVM_INPUTS_TO_DIR}/$1"
}

function test_cmds {
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  local prefix="$hash:ISOLATE=1:TIMEOUT=20m"

  if [ "$CI_FULL" -eq 1 ]; then
    echo "$prefix:TIMEOUT=20m:CPUS=16:MEM=96g:NAME=e2e_prover_full_real $run_test_script simple e2e_prover/full"
  else
    echo "$prefix:NAME=e2e_prover_full_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/full"
  fi
  echo "$prefix:TIMEOUT=25m:NAME=e2e_block_building $(set_dump_avm e2e_block_building) $run_test_script simple e2e_block_building"
  echo "$prefix:TIMEOUT=30m:NAME=e2e_avm_simulator $(set_dump_avm e2e_avm_simulator) $run_test_script simple src/e2e_avm_simulator.test.ts"



  local tests=(
    # List all standalone and nested tests, except for the ones listed above.
    src/e2e_!(prover)/*.test.ts
    src/e2e_p2p/reqresp/*.test.ts
    src/e2e_!(block_building|avm_simulator).test.ts
  )
  for test in "${tests[@]}"; do
    local name=${test#*e2e_}
    name=e2e_${name%.test.ts}

    # Per-test bash TIMEOUT overrides — keep in sync with the test file's jest.setTimeout.
    local test_prefix="$prefix"
    case "$name" in
      e2e_p2p/add_rollup)
        test_prefix="$prefix:TIMEOUT=20m"
        ;;
      e2e_cross_chain_messaging/l1_to_l2)
        test_prefix="$prefix:TIMEOUT=20m"
        ;;
    esac

    # Check if this is a .parallel.test.ts file
    if [[ "$test" == *.parallel.test.ts ]]; then
      # Extract individual test names and create a command for each
      while IFS= read -r test_name; do
        # Create a safe name for the individual test (replace spaces with underscores)
        local safe_test_name=$(echo "$test_name" | sed 's/ /_/g')
        local full_name="${name}_${safe_test_name}"
        echo "$test_prefix:NAME=$full_name $(set_dump_avm $full_name) $run_test_script simple $test \"$test_name\""
      done < <(extract_test_names "$test")
    else
      # Regular test file - run the whole file
      echo "$test_prefix:NAME=$name $(set_dump_avm $name) $run_test_script simple $test"
    fi
  done

  # compose-based tests (use running local network)
  tests=(
    src/composed/!(integration_proof_verification|e2e_persistence).test.ts
    src/guides/*.test.ts
  )
  for test in "${tests[@]}"; do
    # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
    echo "$hash:ONLY_TERM_PARENT=1:TIMEOUT=20m $run_test_script compose $test"
  done

  tests=(
    src/composed/web3signer/*.test.ts
  )
  for test in "${tests[@]}"; do
    # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
    echo "$hash:ONLY_TERM_PARENT=1:TIMEOUT=20m $run_test_script web3signer $test"
  done

  tests=(
    src/composed/ha/*.test.ts
  )
  for test in "${tests[@]}"; do
    # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
    echo "$hash:ONLY_TERM_PARENT=1:TIMEOUT=30m $run_test_script ha $test"
  done

  #echo "$hash:ONLY_TERM_PARENT=1 $run_test_script simple src/e2e_multi_validator/e2e_multi_validator_node.test.ts"
  #echo "$hash:ONLY_TERM_PARENT=1 $run_test_script web3signer src/composed/web3signer/integration_remote_signer.test.ts"
  #echo "$hash:ONLY_TERM_PARENT=1 $run_test_script web3signer src/e2e_multi_validator/e2e_multi_validator_node_key_store.test.ts"

  # compose-based tests with custom scripts
  for flow in ../cli-wallet/test/flows/*.sh; do
    # Note these scripts are ran directly by docker-compose.yml because it ends in '.sh'.
    # Set LOG_LEVEL=info for a better output experience. Deeper debugging should happen with other e2e tests.
    echo "$hash:ONLY_TERM_PARENT=1 LOG_LEVEL=info $run_test_script compose $flow"
  done
}

function test {
  echo_header "e2e tests"
  test_cmds | filter_test_cmds | parallelize
}

function bench_cmds {
  echo "$hash:ISOLATE=1:NAME=bench_build_block BENCH_OUTPUT=bench-out/build-block.bench.json yarn-project/end-to-end/scripts/run_test.sh simple bench_build_block"
  echo "$hash:ISOLATE=1:CPUS=8:NAME=tx_stats BB_IVC_CONCURRENCY=1 BB_NUM_IVC_VERIFIERS=8 BENCH_OUTPUT=bench-out/tx_stats.bench.json yarn-project/end-to-end/scripts/run_test.sh simple tx_stats_bench"
  echo "$hash:ISOLATE=1:NAME=node_rpc_perf BENCH_OUTPUT=bench-out/node_rpc_perf.bench.json yarn-project/end-to-end/scripts/run_test.sh simple node_rpc_perf"
  for client_flow in client_flows/bridging client_flows/deployments client_flows/amm client_flows/account_deployments client_flows/transfers client_flows/storage_proof; do
    echo "$hash:ISOLATE=1:CPUS=8:NAME=$client_flow BENCHMARK_CONFIG=key_flows LOG_LEVEL=error BENCH_OUTPUT=bench-out/ yarn-project/end-to-end/scripts/run_test.sh simple $client_flow"
  done
}

# Live-capture Chonk IVC inputs from the e2e stack into $bench_fixtures_dir.
# Slow: used only when explicitly refreshing the pinned tarball.
function build_bench_capture {
  export CAPTURE_IVC_FOLDER=${CAPTURE_IVC_FOLDER:-$bench_fixtures_dir}
  export BENCHMARK_CONFIG=key_flows
  export LOG_LEVEL=error
  export ENV_VARS_TO_INJECT="BENCHMARK_CONFIG CAPTURE_IVC_FOLDER LOG_LEVEL"
  rm -rf "$CAPTURE_IVC_FOLDER" && mkdir -p "$CAPTURE_IVC_FOLDER"
  parallel --tag --line-buffer --halt now,fail=1 'docker_isolate "scripts/run_test.sh simple {}"' ::: \
    client_flows/account_deployments \
    client_flows/deployments \
    client_flows/bridging \
    client_flows/transfers \
    client_flows/amm \
    client_flows/storage_proof
}

# Builds benchmark fixtures that are still owned by yarn-project.
# Chonk benchmark inputs are pinned and managed by barretenberg/cpp.
function build_bench {
  rm -rf bench-out && mkdir -p bench-out

  rm -rf "$ultrahonk_bench_dir" && mkdir -p "$ultrahonk_bench_dir"
  if ! cache_download "bb-ultrahonk-bench-inputs-$hash.tar.gz"; then
    export BASE_PARITY_BENCH_DIR="$(pwd)/$ultrahonk_bench_dir"
    yarn workspace @aztec/ivc-integration test src/base_parity_inputs.test.ts
    cache_upload "bb-ultrahonk-bench-inputs-$hash.tar.gz" "$ultrahonk_bench_dir"
  fi
}

function bench {
  rm -rf bench-out
  mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelize
}

# Runs e2e tests with AVM circuit inputs dumping enabled, then packages and uploads them
function test_and_collect_avm_inputs {
  echo_header "e2e tests with AVM circuit inputs dumping"

  # Fail if dump directory already exists to avoid mixing/overwriting results
  if [ -d "$default_avm_inputs_dump_dir" ]; then
    echo_stderr "Error: Dump directory '$default_avm_inputs_dump_dir' already exists. Failing instead of overwriting."
    exit 1
  fi
  mkdir -p "$default_avm_inputs_dump_dir"

  # Set base dir for dumping - test_cmds will append test name subdirs
  export DUMP_AVM_INPUTS_TO_DIR="$default_avm_inputs_dump_dir"

  # Run tests in parallel (like regular test command)
  test_cmds | filter_test_cmds | parallelize

  # Use AVM_INPUTS_HASH if set (computed before build in CI), otherwise fall back to $hash
  local avm_hash=${AVM_INPUTS_HASH:-$hash}
  local tarball_name="e2e-avm-circuit-inputs-$avm_hash.tar.gz"

  if [ -d "$default_avm_inputs_dump_dir" ] && [ "$(ls -A $default_avm_inputs_dump_dir 2>/dev/null)" ]; then
    echo_header "Packaging and uploading AVM circuit inputs"
    cache_upload "$tarball_name" "$default_avm_inputs_dump_dir"
  else
    echo_stderr "Warning: No AVM circuit inputs were dumped. Skipping upload."
  fi

  unset DUMP_AVM_INPUTS_TO_DIR
}

# Generates commands to run avm_check_circuit on all dumped AVM circuit inputs
function avm_check_circuit_cmds {
  local bb_avm="barretenberg/cpp/build/bin/bb-avm"
  # Commands run from repo root via parallelize, so use path from top
  local dump_dir_from_top="yarn-project/end-to-end/$default_avm_inputs_dump_dir"

  # Specify timeout and resources
  # WARNING: theoretically, transactions could need more CPU and MEM than we allocate by default.
  # In that case, they might start timing out. Multiple-blob transactions are large enough to exceed
  # 30s, so keep a little more headroom while still catching stuck check-circuit runs quickly.
  local prefix="$hash:ISOLATE=1:TIMEOUT=90s"

  # Find all .bin files in the dump directory (handles nested dirs)
  for input_file in "$default_avm_inputs_dump_dir"/*/*.bin "$default_avm_inputs_dump_dir"/*/*/*.bin; do
    # Skip if no matches (glob didn't expand)
    [ -e "$input_file" ] || continue

    # Extract test name and tx hash for the command name
    # e.g., dumped-avm-circuit-inputs/e2e_block_building/avm-circuit-inputs-tx-0x1234.bin
    # -> avm_cc_e2e_block_building_0x1234
    local rel_path="${input_file#$default_avm_inputs_dump_dir/}"
    local test_dir=$(dirname "$rel_path")
    local filename=$(basename "$input_file" .bin)
    # Extract just the tx hash part (remove "avm-circuit-inputs-tx-" prefix)
    local tx_hash="${filename#avm-circuit-inputs-tx-}"
    # Shorten hash for readability
    local short_hash="${tx_hash:0:10}"
    # Create safe name (replace / with _)
    local safe_test_dir="${test_dir//\//_}"
    local name="avm_cc_${safe_test_dir}_${short_hash}"

    # Use full path from repo root for the command (parallelize runs from there)
    local input_path="$dump_dir_from_top/$rel_path"
    echo "$prefix:NAME=$name $bb_avm avm_check_circuit -v --avm-inputs $input_path"
  done
}

# Downloads cached AVM circuit inputs and runs check-circuit on all of them
function avm_check_circuit {
  echo_header "AVM check-circuit on dumped inputs"

  # Use AVM_INPUTS_HASH if set (computed before build in CI), otherwise fall back to $hash
  local avm_hash=${AVM_INPUTS_HASH:-$hash}
  local tarball_name="e2e-avm-circuit-inputs-$avm_hash.tar.gz"

  # Download the cached tarball
  if ! cache_download "$tarball_name"; then
    echo_stderr "Error: Could not download AVM circuit inputs tarball '$tarball_name'"
    exit 1
  fi

  # Run check-circuit
  avm_check_circuit_cmds | parallelize
}

# Generates e2e test commands using contract artifacts from a prior release version.
# Only includes simple (jest-based) tests since compose/docker tests don't use the legacy jest resolver.
# Excludes prover, block_building, and epochs tests (not relevant for contract artifact compat; epochs
# tests are known-flaky and provide no additional backwards-compat coverage). Also excludes
# kernelless_simulation, which asserts on the exact number of nullifiers emitted and breaks whenever
# contracts add/remove nullifier emissions across versions (unrelated to the compat contract surface).
function compat_test_cmds {
  local version=${1:?version is required}
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  local prefix="$hash:ISOLATE=1"
  local compat_env="CONTRACT_ARTIFACTS_VERSION=$version"

  local tests=(
    src/e2e_!(prover|block_building|epochs)/*.test.ts
    src/e2e_p2p/reqresp/*.test.ts
    src/e2e_!(block_building|prover_*|kernelless_simulation).test.ts
  )
  for test in "${tests[@]}"; do
    local name=${test#*e2e_}
    name=e2e_${name%.test.ts}

    if [[ "$test" == *.parallel.test.ts ]]; then
      while IFS= read -r test_name; do
        local safe_test_name=$(echo "$test_name" | sed 's/ /_/g')
        local full_name="compat_${version}_${name}_${safe_test_name}"
        echo "$prefix:NAME=$full_name $compat_env $run_test_script simple $test \"$test_name\""
      done < <(extract_test_names "$test")
    else
      echo "$prefix:NAME=compat_${version}_${name} $compat_env $run_test_script simple $test"
    fi
  done
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
