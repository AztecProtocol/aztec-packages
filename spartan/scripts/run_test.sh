#!/bin/bash
# This runs a network in KIND or locally.
# It's the script used by ./bootstrap.sh test-cmds.
source $(git rev-parse --show-toplevel)/ci3/source

# Isolate in docker to not overlap our network stack or KIND setup.
# For local debugging, it is recommended to not pass the -i (interleave flag)
# and not isolate, to have a nice tmux splits experience that can be iterated on easily (e.g. close a tab).

cmd=$1
shift
if [ "$cmd" = kind ]; then
  docker_isolate ./test_kind.sh "$@"
elif [ "$cmd" = local ]; then
  docker_isolate ../scripts/run_native_testnet.sh -i $@
fi
