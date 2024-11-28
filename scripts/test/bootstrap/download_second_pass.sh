#!/bin/bash
# Use ci3 script base.
source "$(git rev-parse --show-toplevel)/ci3/base/source"

# Mocked should_run script for CI=0 and CI=1_same_list
echo "$@" >> "$ci3/cache/should_run.list"
if ! "$ci3/cache/should_run.bkup" "$@"; then
  echo "Should not want to skip $@" >> "$ci3/cache/should_run.failure"
fi
# We never return true, as we don't want to run tests
exit 1
