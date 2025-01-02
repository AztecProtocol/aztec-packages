#!/bin/bash
echo "This file should not exist outside of bootstrap/test, this may have accidentally been committed if so!"
# Use ci3 script base.
source "$(git rev-parse --show-toplevel)/ci3/source"
if ! test_should_run.bkup "$@"; then
  echo "Should not want to skip $@" >> "$ci3/.test_failures"
  exit 1
fi
# In the first pass, we want to run each test
exit 0
