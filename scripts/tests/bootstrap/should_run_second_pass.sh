#!/bin/bash
# Use ci3 script base.
echo "This file should not exist outside of bootstrap/test, this may have accidentally been committed if so!"
source "$(git rev-parse --show-toplevel)/ci3/source"
if test_should_run.bkup "$@"; then
  echo "Should not want to run $@" >> "$ci3/.test_failures"
fi
# We never return true, as we don't want to run tests
exit 1
