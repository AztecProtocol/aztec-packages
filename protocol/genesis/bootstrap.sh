#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# The package's content is committed, so there is nothing to build. Its staleness check runs from
# noir-projects/fnd, which has the protocol contract artifacts it is derived from.
function release {
  retry "deploy_npm ${REF_NAME#v}"
}

case "$cmd" in
  ""|build|test)
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
