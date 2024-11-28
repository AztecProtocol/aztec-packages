#!/bin/bash
# Mocked should_run script for CI=1_should_run_false
echo "$@" >> "$ci3/cache/should_run.list"
if "$ci3/cache/should_run.bkup" "$@"; then
  echo "Should not want to run $@" >> "$ci3/cache/should_run.failure"
fi
# We never return true, as we don't want to run tests
exit 1
