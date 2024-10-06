#!/bin/bash

# Starts a test scenario where as many pieces as practical are
# just natively running - running on the same computer, no docker or k8s
# Usage: ./network_test.sh <test>
# Optional environment variables:
#   INTERLEAVED (default: "false") should we just start all programs in the background?

set -eu

# Ensure dependencies are installed
command -v anvil >/dev/null || (echo "We need 'anvil' installed to be able to simulate ethereum" && exit 1)
command -v tmux >/dev/null || (echo "We need 'tmux' installed to be able to manage terminal sessions" && exit 1)

REPO=$(git rev-parse --show-toplevel)

if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js version 18 (exactly!)."
    exit 1
fi

NODE_VERSION=$(node --version | grep -oP 'v\K[0-9]+')
if ! [ "$NODE_VERSION" = 18 ] ; then
    echo "Expected node.js version at 18.x.x. You have version $(node --version)."
    exit 1
fi

cd "$REPO"/yarn-project/end-to-end/scripts/native-network
rm -f l1-contracts.env l2-contracts.env

function run_parallel() {
  if [ "${INTERLEAVED:-false}" = "false" ] ; then
    # Run in tmux for local debugging
    "$REPO"/scripts/tmux_split_args.sh native_network_test_session "$@"
  else
    # Run interleaved for CI
    "$REPO"/scripts/run_interleaved.sh "$@"
  fi
}

# We exit with the return code of the first command
# While the others are ran in the background, either in tmux or just interleaved
run_parallel ./test-transfer.sh \
  ./boot-node.sh \
 ./deploy-l1-contracts.sh \
 ./deploy-l2-contracts.sh \
 ./ethereum.sh \
 ./prover-node.sh \
 ./pxe.sh \
 ./transaction-bot.sh \
 "./validator.sh 8081"
