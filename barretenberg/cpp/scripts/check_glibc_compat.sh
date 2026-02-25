#!/bin/bash
# Verify that ELF binaries require exactly the specified glibc version.
# Usage: check_glibc_compat.sh <expected_version> <binary> [binary...]
set -euo pipefail

expected="$1"; shift
exit_code=0

for binary in "$@"; do
  if [ ! -f "$binary" ]; then
    echo "WARNING: $binary not found, skipping"
    continue
  fi

  max_glibc=$(readelf -V "$binary" 2>/dev/null | grep -oP 'GLIBC_\K[0-9.]+' | sort -Vu | tail -1)

  if [ -z "$max_glibc" ]; then
    echo "OK: $binary - no glibc version requirements"
  elif [ "$max_glibc" = "$expected" ]; then
    echo "OK: $binary - max glibc: $max_glibc"
  else
    echo "FAIL: $binary - max glibc $max_glibc, expected exactly $expected"
    exit_code=1
  fi
done

exit $exit_code
