#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

if [[ $(arch) == "arm64" && "$CI" -eq 1 ]]; then
  export DISABLE_AZTEC_VM=1
fi

hash=$(../bootstrap.sh hash)
bench_fixtures_dir=example-app-ivc-inputs-out

function test_cmds {
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  local prefix="$hash:ISOLATE=1"

  # Longest-running tests first
  # Can't run full prover tests on ARM because AVM is disabled.
  if [ "${DISABLE_AZTEC_VM:-0}" -eq 1 ]; then
    if [ "$CI_FULL" -eq 1 ]; then
      echo "$prefix:TIMEOUT=15m:CPUS=16:MEM=96g:NAME=e2e_prover_client_real $run_test_script simple e2e_prover/client"
    else
      echo "$prefix:NAME=e2e_prover_client_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/client"
    fi
  else
    if [ "$CI_FULL" -eq 1 ]; then
      echo "$prefix:TIMEOUT=15m:CPUS=16:MEM=96g:NAME=e2e_prover_full_real $run_test_script simple e2e_prover/full"
    else
      echo "$prefix:NAME=e2e_prover_full_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/full"
    fi
  fi
  echo "$prefix:TIMEOUT=15m:NAME=e2e_block_building $run_test_script simple e2e_block_building"

  local tests=(
    # List all standalone and nested tests, except for the ones listed above.
    src/e2e_!(prover)/*.test.ts
    src/e2e_!(block_building).test.ts
  )
  for test in "${tests[@]}"; do
    local name=${test#*e2e_}
    name=e2e_${name%.test.ts}
    echo "$prefix:NAME=$name $run_test_script simple $test"
  done

  # compose-based tests (use running sandbox)
  tests=(
    src/composed/!(integration_proof_verification|e2e_persistence).test.ts
    src/guides/*.test.ts
    src/sample-dapp/index
    src/sample-dapp/ci/index
  )
  for test in "${tests[@]}"; do
    # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
    echo "$hash:ONLY_TERM_PARENT=1 $run_test_script compose $test"
  done

  # TODO(AD): figure out workaround for mainframe subnet exhaustion
  if [ "$CI" -eq 1 ]; then
    # compose-based tests with custom scripts
    for flow in ../cli-wallet/test/flows/*.sh; do
      # Note these scripts are ran directly by docker-compose.yml because it ends in '.sh'.
      # Set LOG_LEVEL=info for a better output experience. Deeper debugging should happen with other e2e tests.
      echo "$hash:ONLY_TERM_PARENT=1 LOG_LEVEL=info $run_test_script compose $flow"
    done
  fi
}

function test {
  echo_header "e2e tests"
  test_cmds | filter_test_cmds | parallelise
}

function bench_cmds {
  echo "$hash:ISOLATE=1:NAME=bench_build_block BENCH_OUTPUT=bench-out/build-block.bench.json yarn-project/end-to-end/scripts/run_test.sh simple bench_build_block"

  for client_flow in client_flows/bridging client_flows/deployments client_flows/amm client_flows/account_deployments client_flows/transfers; do
    echo "$hash:ISOLATE=1:CPUS=8:NAME=$client_flow BENCHMARK_CONFIG=key_flows LOG_LEVEL=error BENCH_OUTPUT=bench-out/ yarn-project/end-to-end/scripts/run_test.sh simple $client_flow"
  done

  for dir in $bench_fixtures_dir/*; do
    for runtime in native wasm; do
      echo "$hash:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $runtime ../../yarn-project/end-to-end/$dir"
    done
  done
}

# Builds the benchmark fixtures.
function build_bench {
  export CAPTURE_IVC_FOLDER=$bench_fixtures_dir
  export BENCHMARK_CONFIG=key_flows
  export LOG_LEVEL=error
  export ENV_VARS_TO_INJECT="BENCHMARK_CONFIG CAPTURE_IVC_FOLDER LOG_LEVEL"
  rm -rf $CAPTURE_IVC_FOLDER && mkdir -p $CAPTURE_IVC_FOLDER
  rm -rf bench-out && mkdir -p bench-out
  if cache_download bb-client-ivc-captures-$hash.tar.gz; then
    return
  fi
  if [ -n "${DOWNLOAD_ONLY:-}" ]; then
    echo "Could not find ivc inputs cached!"
    exit 1
  fi
  parallel --tag --line-buffer --halt now,fail=1 'docker_isolate "scripts/run_test.sh simple {}"' ::: \
    client_flows/account_deployments \
    client_flows/deployments \
    client_flows/bridging \
    client_flows/transfers \
    client_flows/amm
  cache_upload bb-client-ivc-captures-$hash.tar.gz $CAPTURE_IVC_FOLDER
}

function bench {
  rm -rf bench-out
  mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelise
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  test|test_cmds|bench|bench_cmds|build_bench)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
