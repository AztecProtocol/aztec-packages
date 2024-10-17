#!/bin/bash
function usage() {
  # Usage instructions
  echo "Usage: $0 {transfer|4epochs|smoke}. Set environment variable INTERLEAVED=true for CI-friendly execution."
}
if [ -z "$1" ]; then
  usage
  exit 1
fi

# Determine the top-level directory of the Git repository
TOP_LEVEL_DIR=$(git rev-parse --show-toplevel)

# Define the path to the native_network_test.sh script
NATIVE_NETWORK_TEST_SCRIPT="$TOP_LEVEL_DIR/yarn-project/end-to-end/scripts/native_network_test.sh"

# Handled ordered by ascending running time
case "$1" in
  smoke)
    # Simple smoke test. Does NOT need the prover node since an epoch does not pass.
    $NATIVE_NETWORK_TEST_SCRIPT \
      "./test.sh src/spartan/smoke.test.ts" \
      ./deploy-l1-contracts.sh \
      ./deploy-l2-contracts.sh \
      ./boot-node.sh \
      ./ethereum.sh \
      ./pxe.sh
    ;;
  transfer)
    # Simple 5-slot transfer test. Does NOT need the prover node since an epoch does not pass.
    $NATIVE_NETWORK_TEST_SCRIPT \
      "./test.sh src/spartan/transfer.test.ts" \
      ./deploy-l1-contracts.sh \
      ./deploy-l2-contracts.sh \
      ./boot-node.sh \
      ./ethereum.sh \
      ./pxe.sh
    ;;
  4epochs)
    # 4-epoch transfer test. DOES need the prover node since an epoch needs proofs (here, fake ones).
    $NATIVE_NETWORK_TEST_SCRIPT \
      "./test.sh src/spartan/4epochs.test.ts" \
      ./deploy-l1-contracts.sh \
      ./deploy-l2-contracts.sh \
      ./boot-node.sh \
      ./ethereum.sh \
      "./prover-node.sh false" \
      ./pxe.sh
    ;;
  *)
    # Invalid option handling
    echo "Invalid option: '$1'"
    usage
    exit 1
    ;;
esac
