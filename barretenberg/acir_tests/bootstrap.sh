#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH=$HOME/.bb-crs

tests_tar=barretenberg-acir-tests-$(cache_content_hash \
    ../../noir/.rebuild_patterns \
    ../../noir/.rebuild_patterns_tests).tar.gz

tests_hash=$(cache_content_hash \
    ../../noir/.rebuild_patterns \
    ../../noir/.rebuild_patterns_tests \
    ../../barretenberg/cpp/.rebuild_patterns \
    ../../barretenberg/ts/.rebuild_patterns)

function build_tests {
  github_group "acir_tests build"

  if ! cache_download $tests_tar; then
    rm -rf acir_tests
    cp -R ../../noir/noir-repo/test_programs/execution_success acir_tests
    # Running these requires extra gluecode so they're skipped.
    rm -rf acir_tests/{diamond_deps_0,workspace,workspace_default_member}
    # TODO(https://github.com/AztecProtocol/barretenberg/issues/1108): problem regardless the proof system used
    # TODO: Check if resolved. Move to .test_skip_patterns if not.
    rm -rf acir_tests/regression_5045

    # COMPILE=2 only compiles the test.
    denoise "parallel --joblog joblog.txt --line-buffered 'COMPILE=2 ./run_test.sh \$(basename {})' ::: ./acir_tests/*"

    cache_upload $tests_tar acir_tests
  fi

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

function test {
  github_group "acir_tests testing"
  # TODO: 64 is bit of a magic number for CI/mainframe. Needs to work on lower hardware.
  test_cmds | parallelise 64
  github_endgroup
}

function test_cmds {
  test_cmds_internal | awk "{ print \"$tests_hash \" \$0 }"
}

# Prints to stdout, one per line, the command to execute each individual test.
# Paths are all relative to the repository root.
function test_cmds_internal {
  local plonk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'verify_honk_proof|double_verify_honk_proof')
  local honk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'single_verify_proof|double_verify_proof|double_verify_nested_proof')

  local run_test=$(realpath --relative-to=$root ./run_test.sh)
  local run_test_browser=$(realpath --relative-to=$root ./run_test_browser.sh)
  local bbjs_bin="../ts/dest/node/main.js"

  # barretenberg-acir-tests-sol:
  echo FLOW=sol $run_test assert_statement
  echo FLOW=sol $run_test double_verify_proof
  echo FLOW=sol $run_test double_verify_nested_proof
  echo FLOW=sol_honk $run_test assert_statement
  echo FLOW=sol_honk $run_test 1_mul
  echo FLOW=sol_honk $run_test slices
  echo FLOW=sol_honk $run_test verify_honk_proof

  # barretenberg-acir-tests-bb.js:
  # Browser tests.
  echo BROWSER=chrome THREAD_MODEL=mt $run_test_browser verify_honk_proof
  echo BROWSER=chrome THREAD_MODEL=st $run_test_browser 1_mul
  echo BROWSER=webkit THREAD_MODEL=mt $run_test_browser verify_honk_proof
  echo BROWSER=webkit THREAD_MODEL=st $run_test_browser 1_mul
  # echo ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  echo BIN=$bbjs_bin FLOW=prove_then_verify $run_test ecdsa_secp256r1_3x
  # echo the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  echo BIN=$bbjs_bin SYS=ultra_honk FLOW=prove_then_verify $run_test 6_array
  # echo a single arbitrary test not involving recursion through bb.js for MegaHonk
  echo BIN=$bbjs_bin SYS=mega_honk FLOW=prove_and_verify $run_test 6_array
  # echo 1_mul through bb.js build, all_cmds flow, to test all cli args.
  echo BIN=$bbjs_bin FLOW=all_cmds $run_test 1_mul

  # barretenberg-acir-tests-bb:
  # Fold and verify an ACIR program stack using ClientIvc, recursively verify as part of the Tube circuit and produce and verify a Honk proof
  echo FLOW=prove_then_verify_tube $run_test 6_array
  # echo 1_mul through native bb build, all_cmds flow, to test all cli args.
  echo FLOW=all_cmds $run_test 1_mul

  # barretenberg-acir-tests-bb-ultra-plonk:
  # Exclude honk tests.
  for t in $plonk_tests; do
    echo FLOW=prove_then_verify $run_test $(basename $t)
  done
  echo FLOW=prove_then_verify RECURSIVE=true $run_test assert_statement
  echo FLOW=prove_then_verify RECURSIVE=true $run_test double_verify_proof

  # barretenberg-acir-tests-bb-ultra-honk:
  # Exclude plonk tests.
  for t in $honk_tests; do
    echo SYS=ultra_honk FLOW=prove_then_verify $run_test $(basename $t)
  done
  echo SYS=ultra_honk FLOW=prove_then_verify RECURSIVE=true $run_test assert_statement
  echo SYS=ultra_honk FLOW=prove_then_verify RECURSIVE=true $run_test double_verify_honk_proof
  echo SYS=ultra_honk FLOW=prove_and_verify_program $run_test merkle_insert

  # barretenberg-acir-tests-bb-client-ivc:
  echo FLOW=prove_then_verify_client_ivc $run_test 6_array
  echo FLOW=prove_then_verify_client_ivc $run_test databus
  echo FLOW=prove_then_verify_client_ivc $run_test databus_two_calldata
}

case "$cmd" in
  "clean")
    git clean -fdx
    (cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx)
    ;;
  ""|"fast"|"full")
    ;;
  "build-tests"|"ci")
    build_tests
    ;;
  "hash")
    echo $tests_hash
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac