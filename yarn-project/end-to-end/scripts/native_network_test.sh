#!/usr/bin/env bash

# Usage: ./native_network_test.sh
# Starts a test scenario where as many pieces as practical are
# just natively running - running on the same computer, no docker or k8s
# The script exits when the first command used, the test command, exits.
# All scripts are in the native-network folder
# The will run in parallel either in tmux or just interleaved
# They will log to native-network/logs, where it is easier to debug errors further up the logs, while watching tmux helps catch issues live,
# or where things crash and need to be tweaked and restarted.
# Arguments:
#   Expects a list of scripts from the native-network folder.
# Optional environment variables:
#   INTERLEAVED (default: "false") should we just start all programs in the background?

set -eu

# Ensure dependencies are installed
command -v anvil >/dev/null || (echo "We need 'anvil' installed to be able to simulate ethereum" && exit 1)

REPO=$(git rev-parse --show-toplevel)

if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js version 18 (exactly!)."
    exit 1
fi

NODE_VERSION=$(node --version | grep -oP 'v\K[0-9]+')
if ! [ "$NODE_VERSION" = 22 ] ; then
    echo "Expected node.js version at 22.x.x. You have version $(node --version)."
    exit 1
fi

cd "$REPO"/yarn-project/end-to-end/scripts/native-network
rm -f state/*.env logs/*.log state/*.json

function run_parallel() {
  if [ "${INTERLEAVED:-false}" = "false" ] ; then
    command -v tmux >/dev/null || (echo "We need 'tmux' installed to be able to manage terminal sessions" && exit 1)
    # Run in tmux for local debugging
    "$REPO"/ci3/tmux_split native_network_test_session "$@"
  else
    # Run interleaved for CI
    "$REPO"/scripts/run_interleaved.sh "$@"
  fi
}

export K8S=false

# We exit with the return code of the first command
# While the others are ran in the background, either in tmux or just interleaved
run_parallel "$@"
