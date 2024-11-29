#!/bin/bash
echo "HELL YA"
# Use ci3 script base.
source "$(git rev-parse --show-toplevel)/ci3/base/source"
if ! $ci3/cache/has_flag.bkup "$@"; then
  echo "Should not want to skip $@" >> "$ci3/cache/.test_faillures"
fi
# We never return true, as we don't want to run tests
exit 1
