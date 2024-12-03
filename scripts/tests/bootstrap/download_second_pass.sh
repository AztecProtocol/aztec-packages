#!/bin/bash
# Use ci3 script base.
echo "This file should not exist outside of bootstrap/test, this may have accidentally been committed if so!"
source "$(git rev-parse --show-toplevel)/ci3/source"
if ! cache_download.bkup "$@"; then
  echo "Should have found download $@" >> "$ci3/.test_failures"
  exit 1
fi
exit 0
