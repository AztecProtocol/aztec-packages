#!/bin/bash

cleanup() {
    BG_PIDS=$(jobs -p)
    if [[ -n "$BG_PIDS" ]]; then
        kill $BG_PIDS 2>/dev/null
        wait $BG_PIDS 2>/dev/null
    fi
}
trap cleanup EXIT

(cd headless-test && yarn && npx playwright install && sudo npx playwright install-deps)
(cd browser-test-app && yarn && yarn build)

if [ "${CI:-0}" -eq 1 ]; then
  COMPILE=1 ./run_acir_tests.sh

  # Run UltraHonk recursive verification through bb.js on chrome testing multi-threaded browser support.
  COMPILE=1 HONK=true BROWSER=chrome THREAD_MODEL=mt ./run_acir_tests_browser.sh verify_honk_proof &
  # Run UltraHonk recursive verification through bb.js on chrome testing single-threaded browser support.
  HONK=true BROWSER=chrome THREAD_MODEL=st ./run_acir_tests_browser.sh verify_honk_proof &
  # Run ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  BIN=../ts/dest/node/main.js FLOW=prove_then_verify ./run_acir_tests.sh ecdsa_secp256r1_3x &
  # Run a single arbitrary test not involving recursion through bb.js for UltraHonk
  BIN=../ts/dest/node/main.js FLOW=prove_and_verify_ultra_honk ./run_acir_tests.sh 6_array assert_statement &
  # Run the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  BIN=../ts/dest/node/main.js FLOW=prove_then_verify_ultra_honk ./run_acir_tests.sh 6_array assert_statement &
  # Run a single arbitrary test not involving recursion through bb.js for MegaHonk
  BIN=../ts/dest/node/main.js FLOW=prove_and_verify_mega_honk ./run_acir_tests.sh 6_array &
  # Run fold_basic test through bb.js which runs ClientIVC on fold basic
  BIN=../ts/dest/node/main.js FLOW=fold_and_verify_program ./run_acir_tests.sh fold_basic &
  # Run 1_mul through bb.js build, all_cmds flow, to test all cli args.
  BIN=../ts/dest/node/main.js FLOW=all_cmds ./run_acir_tests.sh 1_mul &

  wait
fi