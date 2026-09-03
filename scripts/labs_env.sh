#!/usr/bin/env bash
# The environment the foundation drives the labs submodule with. Source it to export the
# variables, or run it with a command to exec that command under them from labs/:
#   scripts/labs_env.sh make yarn-project      (what the Makefile's LABS_MAKE does)
# - the inherited ci3 root is cleared, so labs' ci3 derives its own;
# - TEST_CMD_PREFIX makes collected test commands cd into labs/ and clear the root again,
#   since the foundation test engine runs them from this root;
# - TEST_CMD_SKIP drops the flavours that cannot run from here (labs-patches/test_cmd_skip): the
#   docker-compose based tests mount only the labs tree, where the use-local portals do not resolve,
#   and format_file_test needs prettier's import-sort plugin resolvable from the labs root.
labs_env_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
export TEST_CMD_PREFIX='cd labs && export root= ci3= && '
TEST_CMD_SKIP=$(cat "$labs_env_root/labs-patches/test_cmd_skip")
export TEST_CMD_SKIP
# Sourced: only the exports above. Executed with a command: run it from labs/.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ $# -gt 0 ] || { echo "usage: $0 <command> [args...]" >&2; exit 1; }
  cd "$labs_env_root/labs"
  exec env -u root -u ci3 "$@"
fi
