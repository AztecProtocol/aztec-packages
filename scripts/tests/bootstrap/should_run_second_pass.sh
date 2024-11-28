#!/bin/bash
# Use ci3 script base.
source "$(git rev-parse --show-toplevel)/ci3/base/source"
if $ci3/cache/should_run.bkup "$@"; then
  echo "Should not want to run $@" >> "$ci3/cache/.test_faillures"
fi
# We never return true, as we don't want to run tests
exit 1
