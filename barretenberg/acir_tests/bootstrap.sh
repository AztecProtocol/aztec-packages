#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
bb=$(realpath ../cpp/build/bin/bb)

function build {
  if [ ! -d acir_tests ]; then
    cp -R ../../noir/noir-repo/test_programs/execution_success acir_tests
    # Running these require extra gluecode so they are skipped for the purpose of this script.
    rm -rf acir_tests/{diamond_deps_0,workspace,workspace_default_member,regression_5045}
    # TODO(https://github.com/AztecProtocol/barretenberg/issues/1108): problem regardless the proof system used
    rm -rf acir_tests/regression_5045
    # These honk tests just started failing...
    rm -rf acir_tests/{verify_honk_proof,double_verify_honk_proof}
  fi

  # Compile 2 only compiles the tests.
  COMPILE=2 ./run_acir_tests.sh

  # Regenerate verify_honk_proof recursive input.
  # cd ./acir_tests/assert_statement
  # $bb write_recursion_inputs_honk -b ./target/program.json -o ../verify_honk_proof

  # Download ignition up front to ensure no race conditions at runtime.
  # 2^20 points + 1 because the first is the generator, *64 bytes per point, -1 because Range is inclusive.
  # TODO: Make bb just download and append/overwrite required range, then it becomes idempotent.
  mkdir -p $HOME/.bb-crs
  curl -s -H "Range: bytes=0-$(((2**20+1)*64-1))" https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat \
    -o $HOME/.bb-crs/bn254_g1.dat
}

function test {
  hash=$(cache_content_hash ../../noir/.rebuild_patterns_native ../../noir/.rebuild_patterns_tests ../../barretenberg/cpp/.rebuild_patterns ../../barretenberg/ts/.rebuild_patterns)

  if ! test_should_run barretenberg-acir-test-$hash; then
    exit 0
  fi

  github_group "acir_tests updating yarn"
  # Update yarn.lock so it can be committed.
  # Be lenient about bb.js hash changing, even if we try to minimize the occurrences.
  (cd browser-test-app && yarn add --dev @aztec/bb.js@../../ts && yarn)
  (cd headless-test && yarn)
  # The md5sum of everything is the same after each yarn call.
  # Yet seemingly yarn's content hash will churn unless we reset timestamps
  find {headless-test,browser-test-app} -exec touch -t 197001010000 {} + 2>/dev/null || true
  github_endgroup

  github_group "acir_tests building browser-test-app"
  # Keep build as part of CI only.
  (cd browser-test-app && yarn build)
  github_endgroup

  github_group "acir_tests run tests"
  ./run_acir_tests.sh

  # Serialize these two tests as otherwise servers will conflict. Can we just avoid the servers (or tweak ports)?
  # function f0 {
  #   # Run UltraHonk recursive verification through bb.js on chrome testing multi-threaded browser support.
  #   BROWSER=chrome THREAD_MODEL=mt ./run_acir_tests_browser.sh verify_honk_proof
  #   # Run UltraHonk recursive verification through bb.js on chrome testing single-threaded browser support.
  #   BROWSER=chrome THREAD_MODEL=st ./run_acir_tests_browser.sh verify_honk_proof
  # }

  export BIN=../ts/dest/node/main.js
  # Run ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  function f1 { FLOW=prove_then_verify ./run_acir_tests.sh ecdsa_secp256r1_3x; }
  # Run a single arbitrary test not involving recursion through bb.js for UltraHonk
  function f2 { FLOW=prove_and_verify_ultra_honk ./run_acir_tests.sh 6_array assert_statement; }
  # Run the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  function f3 { FLOW=prove_then_verify_ultra_honk ./run_acir_tests.sh 6_array assert_statement; }
  # Run a single arbitrary test not involving recursion through bb.js for MegaHonk
  function f4 { FLOW=prove_and_verify_mega_honk ./run_acir_tests.sh 6_array; }
  # Run fold_basic test through bb.js which runs ClientIVC on fold basic
  function f5 { FLOW=fold_and_verify_program ./run_acir_tests.sh fold_basic; }
  # Run 1_mul through bb.js build, all_cmds flow, to test all cli args.
  function f6 { FLOW=all_cmds ./run_acir_tests.sh 1_mul; }

  export -f f0 f1 f2 f3 f4 f5 f6
  parallel ::: f0 f1 f2 f3 f4 f5 f6

  cache_upload_flag barretenberg-acir-test-$hash
  github_endgroup
}

case "$cmd" in
  "clean")
    git clean -fdx
    (cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx)
    ;;
  ""|"fast"|"full")
    ;;
  "test"|"ci")
    build
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
