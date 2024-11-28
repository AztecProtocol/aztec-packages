#!/bin/bash
# Use ci3 script base.
source "$(git rev-parse --show-toplevel)/ci3/base/source"
if ! $ci3/cache/download.bkup "$@"; then
  echo "Should have found download $@" >> "$ci3/cache/.test_faillures"
fi
# We never return true, as we don't want to run tests
exit 1
