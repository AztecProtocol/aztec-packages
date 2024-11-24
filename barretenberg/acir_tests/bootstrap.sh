#!/bin/bash
set -eu

# TODO: Move to build image.
if [ "${CI:-0}" -eq 1 ]; then
  npx -y playwright@1.49 install --with-deps
fi

# TODO: Move this to build image?
corepack enable
(cd headless-test && yarn)
(cd browser-test-app && yarn && yarn build)

if [ "${CI:-0}" -eq 1 ]; then
  COMPILE=1 ./run_acir_tests.sh

  # Serialize these two tests as otherwise servers will conflict. Can we just avoid the servers (or tweak ports)?
  function f0 {
    # Run UltraHonk recursive verification through bb.js on chrome testing multi-threaded browser support.
    BROWSER=chrome THREAD_MODEL=mt ./run_acir_tests_browser.sh verify_honk_proof
    # Run UltraHonk recursive verification through bb.js on chrome testing single-threaded browser support.
    BROWSER=chrome THREAD_MODEL=st ./run_acir_tests_browser.sh verify_honk_proof
  }

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
fi