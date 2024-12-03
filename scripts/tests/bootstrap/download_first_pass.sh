#!/bin/bash
# Use ci3 script base.
echo "This file should not exist outside of bootstrap/test, this may have accidentally been committed if so!"
source "$(git rev-parse --show-toplevel)/ci3/base/source"
if $ci3/cache/download.bkup "$@"; then
  echo "Should not have found download $@" >> "$ci3/cache/.test_faillures"
  exit 0
fi
exit 1
