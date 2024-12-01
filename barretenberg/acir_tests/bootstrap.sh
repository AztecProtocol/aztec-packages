#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

if [ "${1:-}" == "clean" ]; then
  git clean -fdx
  (cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx)
  exit 0
fi

HASH=$($ci3/cache/content_hash \
  ../../noir/.rebuild_patterns_native \
  ../../noir/.rebuild_patterns_tests \
  ../../barretenberg/cpp/.rebuild_patterns \
  ../../barretenberg/ts/.rebuild_patterns)

if ! $ci3/cache/should_run barretenberg-acir-test-$HASH; then
  exit 0
fi

$ci3/github/group "acir_tests updating yarn"
# Update yarn.lock so it can be committed.
# Be lenient about bb.js hash changing, even if we try to minimize the occurrences.
(cd browser-test-app && yarn add --dev @aztec/bb.js@../../ts && yarn)
(cd headless-test && yarn)
# The md5sum of everything is the same after each yarn call, yet seemingly yarn's content hash will churn unless we reset timestamps
find {headless-test,browser-test-app} -exec touch -t 197001010000 {} + 2>/dev/null || true
$ci3/github/endgroup

$ci3/github/group "acir_tests building browser-test-app"
# Keep build as part of tests only.
(cd browser-test-app && yarn build)
$ci3/github/endgroup

$ci3/github/group "acir_tests run tests"
# Download ignition up front to ensure no race conditions at runtime.
# 2^20 points + 1 because the first is the generator, *64 bytes per point, -1 because Range is inclusive.
mkdir -p $HOME/.bb-crs
curl -s -H "Range: bytes=0-$(((2**20+1)*64-1))" https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat \
  -o $HOME/.bb-crs/bn254_g1.dat

# Compile up front. Was seeing some failures when I just did COMPILE=1 on the script below.
# TODO: Understand why.
COMPILE=1 COMPILE_ONLY=1 ./run_acir_tests.sh

# TODO(ci3): Currently doing parity with CI
# ./run_acir_tests.sh

# Serialize these two tests as otherwise servers will conflict. Can we just avoid the servers (or tweak ports)?
function f0 {
  # Run UltraHonk recursive verification through bb.js on chrome testing multi-threaded browser support.
  BROWSER=chrome THREAD_MODEL=mt ./run_acir_tests_browser.sh verify_honk_proof
  # Run UltraHonk recursive verification through bb.js on chrome testing single-threaded browser support.
  BROWSER=chrome THREAD_MODEL=st ./run_acir_tests_browser.sh verify_honk_proof
}


########################################################################################################################
# bb.js tests
########################################################################################################################
# Helper function to run bb.js tests.
function bbjs_test() { BIN=../ts/dest/node/main.js ./run_acir_tests.sh "$@"; }
# Run UltraHonk recursive verification through bb.js on Chrome with multi-threading.
function f0 { BROWSER=chrome THREAD_MODEL=mt ./run_acir_tests_browser.sh verify_honk_proof; }
# Run ecdsa_secp256r1_3x through bb.js on node to check 256k support.
function f1 { FLOW=prove_then_verify bbjs_test ecdsa_secp256r1_3x; }
# Run a single arbitrary test not involving recursion through bb.js for UltraHonk.
function f2 { FLOW=prove_and_verify_ultra_honk bbjs_test 6_array assert_statement; }
# Run the prove-then-verify flow for UltraHonk.
function f3 { FLOW=prove_then_verify_ultra_honk bbjs_test 6_array assert_statement; }
# Run a single arbitrary test not involving recursion through bb.js for MegaHonk.
function f4 { FLOW=prove_and_verify_mega_honk bbjs_test 6_array; }
# Run fold_basic test through bb.js which runs ClientIVC on fold basic.
function f5 { FLOW=fold_and_verify_program bbjs_test fold_basic; }
# Run 1_mul through bb.js build, all_cmds flow, to test all CLI args.
function f6 { FLOW=all_cmds bbjs_test 1_mul; }

########################################################################################################################
# Solidity tests
########################################################################################################################
# Run Solidity-based tests in parallel for proof verification.
function f7 { cd sol-test && PARALLEL=1 FLOW=sol ./run_acir_tests.sh assert_statement double_verify_proof double_verify_nested_proof; }
# Run Honk-based Solidity tests.
function f8 { cd sol-test && PARALLEL=1 FLOW=honk_sol ./run_acir_tests.sh assert_statement 1_mul slices verify_honk_proof; }

########################################################################################################################
# Native Ultrahonk tests
########################################################################################################################
# Run UltraHonk proof generation and verification for all ACIR programs.
function f9 { FLOW=prove_then_verify_ultra_honk HONK=true ./run_acir_tests.sh; }
# Run recursive UltraHonk proofs.
function f10 { FLOW=prove_then_verify_ultra_honk HONK=true RECURSIVE=true ./run_acir_tests.sh assert_statement double_verify_honk_proof; }
# Construct and verify an UltraHonk proof for a single program.
function f11 { FLOW=prove_and_verify_ultra_honk ./run_acir_tests.sh pedersen_hash; }
# Construct and verify a MegaHonk proof on one non-recursive program.
function f12 { FLOW=prove_and_verify_ultra_honk_program ./run_acir_tests.sh merkle_insert; }
# Construct and separately verify a UltraHonk proof that recursively verifies a Honk proof.
function f13 { FLOW=prove_then_verify_ultra_honk ./run_acir_tests.sh verify_honk_proof; }
# Construct and verify a UltraHonk proof that recursively verifies a Honk proof.
function f14 { FLOW=prove_and_verify_ultra_honk ./run_acir_tests.sh verify_honk_proof; }

########################################################################################################################
# Native Megahonk tests
########################################################################################################################
# Construct and separately verify a MegaHonk proof for all acir programs
function f15() {
  FLOW=prove_then_verify_mega_honk ./run_acir_tests.sh
}
# Construct and verify a MegaHonk proof for a single arbitrary program
function f16() {
  FLOW=prove_and_verify_mega_honk ./run_acir_tests.sh 6_array
}
# Construct and verify a MegaHonk proof for all ACIR programs using the new witness stack workflow
function f17() {
  FLOW=prove_and_verify_mega_honk_program ./run_acir_tests.sh
}

########################################################################################################################
# Plonk tests
########################################################################################################################
function f18() {
  FLOW=prove_then_verify ./run_acir_tests.sh
}
function f19() {
  FLOW=prove_then_verify RECURSIVE=true ./run_acir_tests.sh assert_statement double_verify_proof
}
########################################################################################################################
# Parallel run
########################################################################################################################
TEST_FNS="f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12 f13 f14 f15 f16 f17 f18 f19"
export -f bbjs_test $TEST_FNS
parallel --memfree 4g ::: $TEST_FNS

$ci3/cache/upload_flag barretenberg-acir-test-$HASH
$ci3/github/endgroup
