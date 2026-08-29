#!/usr/bin/env bash
# Collects test/bench commands from the labs submodule for this repo's test engine, the way
# the Makefile's LABS_MAKE does: runs the given labs command (relative to labs/) under
# scripts/labs_env.sh and adjusts the output with labs' prefix_test_cmds hook.
# Usage: scripts/labs_test_cmds.sh <command relative to labs/> [args...]
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
source "$root/scripts/labs_env.sh"
"$root/scripts/labs_env.sh" "$@" | "$root/labs/ci3/prefix_test_cmds"
