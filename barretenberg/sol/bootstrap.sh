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
    test_cmds | filter_test_cmds | parallelise 64
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

        forge fmt
        forge build

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

    echo "Targets built, you are good to go!"
}

function bench_cmds {
  echo "$hash barretenberg/sol/bootstrap.sh bench"
}

function bench {
  echo_header "barretenberg/sol gas benchmark"

  rm -rf bench-out && mkdir -p bench-out

  # Run forge test with gas report (without JSON for now as it doesn't include gas data)
  echo "Running gas report for verifier contracts..."
  FORGE_GAS_REPORT=true forge test --no-match-contract Base > gas_report.txt 2>&1

  # Check if we got any output
  if [ ! -s gas_report.txt ]; then
    echo "Error: No output from forge test"
    exit 1
  fi

  # Parse the gas report table directly
  # We'll extract the test gas consumption from the output
  awk '
  BEGIN {
    print "[";
    first = 1;
    current_test = "";
  }

  # Detect test suite lines like "Ran 2 tests for test/honk/ECDSA.t.sol:EcdsaHonkTest"
  /^Ran [0-9]+ tests? for/ {
    match($0, /test\/honk\/([^.]+)\.t\.sol:([^[:space:]]+)/, arr);
    if (arr[1]) {
      current_test = arr[1];
    }
  }

  # Detect test result lines like "[PASS] testValidProof() (gas: 2003016)"
  /^\[PASS\].*\(gas: [0-9]+\)/ {
    # Extract test name and gas value
    match($0, /\[PASS\] ([^ ]+).*\(gas: ([0-9]+)\)/, arr);
    if (arr[1] && arr[2] && current_test != "") {
      if (!first) print ",";
      first = 0;

      # Clean up test name
      test_name = arr[1];
      gsub(/\(\)$/, "", test_name);
      gsub(/\([^)]+\)$/, "", test_name);  # Remove parameters
      gsub(/^test/, "", test_name);

      printf "  {\n";
      printf "    \"name\": \"%s_%s\",\n", current_test, test_name;
      printf "    \"value\": %s,\n", arr[2];
      printf "    \"unit\": \"gas\"\n";
      printf "  }";
    }
  }

  END {
    print "\n]";
  }
  ' gas_report.txt > bench-out/verifier.bench.json.tmp

  # Clean up
  rm -f gas_report.txt

  # Skip the JSON parsing fallback since we're already doing text parsing
  if false; then
    echo "This block is skipped"
  fi

  # Validate JSON and move to final location
  if jq . bench-out/verifier.bench.json.tmp >/dev/null 2>&1; then
    mv bench-out/verifier.bench.json.tmp bench-out/verifier.bench.json
    echo "Gas benchmark complete. Output written to bench-out/verifier.bench.json"

    # Display summary
    echo "Generated $(jq length bench-out/verifier.bench.json) benchmark entries"
  else
    echo "Error: Failed to generate valid JSON output"
    cat bench-out/verifier.bench.json.tmp
    rm -f bench-out/verifier.bench.json.tmp
    exit 1
  fi

  # Clean up
  rm -f gas_report.tmp
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
