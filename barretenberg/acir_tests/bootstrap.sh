#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH=$HOME/.bb-crs

function build {
  set -eu

  github_group "acir_tests build"

  rm -rf acir_tests
  cp -R ../../noir/noir-repo/test_programs/execution_success acir_tests
  # Running these requires extra gluecode so they're skipped.
  rm -rf acir_tests/{diamond_deps_0,workspace,workspace_default_member}
  # TODO(https://github.com/AztecProtocol/barretenberg/issues/1108): problem regardless the proof system used
  rm -rf acir_tests/regression_5045

  # COMPILE=2 only compiles the test.
  denoise "parallel --joblog joblog.txt --line-buffered 'COMPILE=2 ./run_test.sh \$(basename {})' ::: ./acir_tests/*"

  # TODO: This actually breaks things, but shouldn't. We want to do it here and not maintain manually.
  # Regenerate verify_honk_proof recursive input.
  # local bb=$(realpath ../cpp/build/bin/bb)
  # (cd ./acir_tests/assert_statement && \
  #   $bb write_recursion_inputs_honk -b ./target/program.json -o ../verify_honk_proof --recursive)

  # Update yarn.lock so it can be committed.
  # Be lenient about bb.js hash changing, even if we try to minimize the occurrences.
  denoise "cd browser-test-app && yarn add --dev @aztec/bb.js@../../ts && yarn"
  denoise "cd headless-test && yarn"
  denoise "cd sol-test && yarn"
  # The md5sum of everything is the same after each yarn call.
  # Yet seemingly yarn's content hash will churn unless we reset timestamps
  find {headless-test,browser-test-app} -exec touch -t 197001010000 {} + 2>/dev/null || true

  denoise "cd browser-test-app && yarn build"

  github_endgroup
}

function hash {
  cache_content_hash \
    ../../noir/.rebuild_patterns \
    ../../noir/.rebuild_patterns_tests \
    ../../barretenberg/cpp/.rebuild_patterns \
    ../../barretenberg/ts/.rebuild_patterns
}

function test {
  set -eu

  local hash=$(hash)
  test_should_run barretenberg-acir-tests-$hash || return 0

  github_group "acir_tests testing"

  # TODO: These are some magic numbers that fit our dev/ci environments. They ultimately need to work on lower hardware.
  export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-8}
  # local jobs=$(($(nproc) / HARDWARE_CONCURRENCY))
  local jobs=64

  # Create temporary file descriptor 3, and redirects anything written to it, to parallels stdin.
  exec 3> >(denoise parallel -j$jobs --tag --line-buffered --joblog joblog.txt)
  local pid=$!
  trap "kill -SIGTERM $pid 2>/dev/null || true" EXIT

  # Run function for syntactic simplicity.
  run() {
      echo "$*" >&3
  }

  local plonk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'verify_honk_proof|double_verify_honk_proof')
  local honk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'single_verify_proof|double_verify_proof|double_verify_nested_proof')

  # barretenberg-acir-tests-sol:
  run FLOW=sol ./run_test.sh assert_statement
  run FLOW=sol ./run_test.sh double_verify_proof
  run FLOW=sol ./run_test.sh double_verify_nested_proof
  run FLOW=sol_honk ./run_test.sh assert_statement
  run FLOW=sol_honk ./run_test.sh 1_mul
  run FLOW=sol_honk ./run_test.sh slices
  run FLOW=sol_honk ./run_test.sh verify_honk_proof

  # barretenberg-acir-tests-bb.js:
  # Browser tests.
  run BROWSER=chrome THREAD_MODEL=mt PORT=8080 ./run_test_browser.sh verify_honk_proof
  run BROWSER=chrome THREAD_MODEL=st PORT=8081 ./run_test_browser.sh 1_mul
  run BROWSER=webkit THREAD_MODEL=mt PORT=8082 ./run_test_browser.sh verify_honk_proof
  run BROWSER=webkit THREAD_MODEL=st PORT=8083 ./run_test_browser.sh 1_mul
  # Run ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  run BIN=../ts/dest/node/main.js FLOW=prove_then_verify ./run_test.sh ecdsa_secp256r1_3x
  # Run the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  run BIN=../ts/dest/node/main.js SYS=ultra_honk FLOW=prove_then_verify ./run_test.sh 6_array
  # Run a single arbitrary test not involving recursion through bb.js for MegaHonk
  run BIN=../ts/dest/node/main.js SYS=mega_honk FLOW=prove_and_verify ./run_test.sh 6_array
  # Run 1_mul through bb.js build, all_cmds flow, to test all cli args.
  run BIN=../ts/dest/node/main.js FLOW=all_cmds ./run_test.sh 1_mul

  # barretenberg-acir-tests-bb:
  # Fold and verify an ACIR program stack using ClientIvc, recursively verify as part of the Tube circuit and produce and verify a Honk proof
  run FLOW=prove_then_verify_tube ./run_test.sh 6_array
  # Run 1_mul through native bb build, all_cmds flow, to test all cli args.
  run FLOW=all_cmds ./run_test.sh 1_mul

  # barretenberg-acir-tests-bb-ultra-plonk:
  # Exclude honk tests.
  for t in $plonk_tests; do
    run FLOW=prove_then_verify ./run_test.sh $(basename $t)
  done
  run FLOW=prove_then_verify RECURSIVE=true ./run_test.sh assert_statement
  run FLOW=prove_then_verify RECURSIVE=true ./run_test.sh double_verify_proof

  # barretenberg-acir-tests-bb-ultra-honk:
  # Exclude plonk tests.
  for t in $honk_tests; do
    run SYS=ultra_honk FLOW=prove_then_verify ./run_test.sh $(basename $t)
  done
  run SYS=ultra_honk FLOW=prove_then_verify RECURSIVE=true ./run_test.sh assert_statement
  run SYS=ultra_honk FLOW=prove_then_verify RECURSIVE=true ./run_test.sh double_verify_honk_proof
  run SYS=ultra_honk FLOW=prove_and_verify_program ./run_test.sh merkle_insert

  # barretenberg-acir-tests-bb-client-ivc:
  run FLOW=prove_then_verify_client_ivc ./run_test.sh 6_array
  run FLOW=prove_then_verify_client_ivc ./run_test.sh databus
  run FLOW=prove_then_verify_client_ivc ./run_test.sh databus_two_calldata

  # Close parallels input file descriptor and wait for completion.
  exec 3>&-
  wait $pid

  cache_upload_flag barretenberg-acir-tests-$hash
  github_endgroup
}

export -f build test

case "$cmd" in
  "clean")
    git clean -fdx
    (cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx)
    ;;
  ""|"fast")
    ;;
  "full")
    build
    ;;
  "ci")
    build
    test
    ;;
  "hash")
    hash
    ;;
  "test")
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac