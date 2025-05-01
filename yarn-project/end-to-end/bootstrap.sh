#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function test_cmds {
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  local prefix="$hash:ISOLATE=1"

  # Longest-running tests first
  if [ "$CI_FULL" -eq 1 ]; then
    echo "$prefix:TIMEOUT=15m:CPUS=16:MEM=96g:NAME=e2e_prover_full_real $run_test_script simple e2e_prover/full"
  else
    echo "$prefix:NAME=e2e_prover_full_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/full"
  fi
  echo "$prefix:TIMEOUT=15m:NAME=e2e_block_building $run_test_script simple e2e_block_building"

  local tests=(
    src/e2e_blacklist_token_contract/*.test.ts
    src/e2e_cross_chain_messaging/*.test.ts
    src/e2e_deploy_contract/*.test.ts
    src/e2e_fees/*.test.ts
    src/e2e_nested_contract/*.test.ts
    src/e2e_p2p/*.test.ts
    src/e2e_token_contract/*.test.ts
    src/public-testnet/*.test.ts
    # Block building has time extended above.
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

# Entrypoint for barretenberg benchmarks that rely on captured e2e inputs.
function generate_example_app_ivc_inputs {
  export CAPTURE_IVC_FOLDER=example-app-ivc-inputs-out
  export BENCHMARK_CONFIG=key_flows
  export ENV_VARS_TO_INJECT="BENCHMARK_CONFIG CAPTURE_IVC_FOLDER"
  rm -rf "$CAPTURE_IVC_FOLDER" && mkdir -p "$CAPTURE_IVC_FOLDER"
  if cache_download bb-client-ivc-captures-$hash.tar.gz; then
    return
  fi
  if [ -n "${DOWNLOAD_ONLY:-}" ]; then
    echo "Could not find ivc inputs cached!"
    exit 1
  fi
  # Running these again separately from tests is a bit of a hack,
  # but we need to ensure test caching does not get in the way.
  parallel --line-buffer --halt now,fail=1 'docker_isolate "scripts/run_test.sh simple {}"' ::: \
    client_flows/deployments \
    client_flows/bridging \
    client_flows/transfers \
    client_flows/amm

  cache_upload bb-client-ivc-captures-$hash.tar.gz $CAPTURE_IVC_FOLDER
}

function bench {
  rm -rf bench-out
  mkdir -p bench-out
  if cache_download yarn-project-bench-results-$hash.tar.gz; then
    return
  fi
  docker_isolate "BENCH_OUTPUT=$root/yarn-project/end-to-end/bench-out/yp-bench.json scripts/run_test.sh simple bench_build_block"
  generate_example_app_ivc_inputs
  # A bit pattern-breaking, but we need to generate our example app inputs here, then bb folder is the best
  # place to test them.
  ../../barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $(pwd)/example-app-ivc-inputs-out $(pwd)/bench-out
  cache_upload yarn-project-bench-results-$hash.tar.gz ./bench-out/yp-bench.json ./bench-out/ivc-bench.json
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  test|test_cmds|bench|generate_example_app_ivc_inputs)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
