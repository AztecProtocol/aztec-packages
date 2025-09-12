#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH="../cpp/srs_db"

export hash=$(cache_content_hash \
  ^barretenberg/sol/ \
  ../cpp/.rebuild_patterns
)


function test {
    echo_header "sol testing"
    test_cmds | filter_test_cmds | parallelize 64
}

function test_cmds {
    test_cmds_internal | awk "{ print \"$hash \" \$0 }"
}

function test_cmds_internal {
    echo "cd barretenberg/sol && forge test --no-match-contract Base"
}

function build_sol {
    echo_header "barretenberg/sol building sol"

    local artifact=barretenberg-sol-$hash.zst
    if ! cache_download $artifact; then

        rm -rf broadcast cache out
        forge install
        # Ensure libraries are at the correct version
        git submodule update --init --recursive ./lib

        forge fmt || true
        denoise "forge build"

        cache_upload $artifact out
    fi
}

function generate_vks {
    # Only run on a cache miss
    ./scripts/init_honk.sh
}

function build_code {
    # These steps are sequential
    generate_vks
    build_sol
}

export -f build_code generate_vks build_sol

function build {
  echo_header "barretenberg/sol building"
  build_code
}

function bench_cmds {
  echo "$hash barretenberg/sol/bootstrap.sh bench"
}

function bench {
  echo_header "barretenberg/sol gas benchmark"

  rm -rf bench-out && mkdir -p bench-out

  # Run forge test with gas report using JSON flag
  echo "Running gas report for verifier contracts..."
  # Do not include foundry std err messages in the output
  FORGE_GAS_REPORT=true forge test --no-match-contract Base --json 2>&1 | grep -v "non-empty stderr" > gas_report.json

  # Check if we got any output
  if [ ! -s gas_report.json ]; then
    echo "Error: No output from forge test"
    exit 1
  fi

  # Parse the JSON output to extract median gas values
  jq '[
    .[] |
    select(.functions."verify(bytes,bytes32[])" != null) |
    {
      name: (.contract | split(":")[1]),
      value: .functions."verify(bytes,bytes32[])".median,
      unit: "gas"
    }
  ]' gas_report.json > bench-out/verifier.bench.json.tmp

  # Clean up
  rm -f gas_report.json

  # Validate JSON and move to final location
  if jq . bench-out/verifier.bench.json.tmp >/dev/null 2>&1; then
    mv bench-out/verifier.bench.json.tmp bench-out/verifier.bench.json
    echo "Gas benchmark complete. Output written to bench-out/verifier.bench.json"

    # Display summary
    echo "Generated $(jq length bench-out/verifier.bench.json) benchmark entries"

    # Display gas report
    echo -e "\nGas Report:"
    jq -r '.[] | "\(.name): \(.value) gas"' bench-out/verifier.bench.json
  else
    echo "Error: Failed to generate valid JSON output"
    cat bench-out/verifier.bench.json.tmp
    rm -f bench-out/verifier.bench.json.tmp
    exit 1
  fi
}


case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    echo $hash
    ;;
  test|test_cmds)
    $cmd
    ;;
  "bench")
    bench
    ;;
  "bench_cmds")
    bench_cmds
    ;;
  "release")
    # noop
    exit 0
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
