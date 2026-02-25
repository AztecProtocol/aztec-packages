#!/usr/bin/env bash
# Checks that ELF binaries don't require a glibc version newer than the specified maximum.
# This ensures release binaries work on older Linux distributions.
#
# Usage: check_glibc_compat.sh <max_glibc_version> <binary> [binary...]
# Example: check_glibc_compat.sh 2.28 build-zig-amd64-linux/bin/bb build-zig-arm64-linux/bin/bb
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <max_glibc_version> <binary> [binary...]"
  echo "Example: $0 2.28 build-zig-amd64-linux/bin/bb"
  exit 1
fi

MAX_VERSION="$1"
shift

# Compare two version strings. Returns 0 if $1 <= $2, 1 otherwise.
version_lte() {
  [ "$(printf '%s\n%s' "$1" "$2" | sort -V | head -n1)" = "$1" ]
}

exit_code=0

for binary in "$@"; do
  if [ ! -f "$binary" ]; then
    echo "WARNING: $binary not found, skipping"
    continue
  fi

  # Check if it's an ELF binary
  if ! file "$binary" | grep -q ELF; then
    echo "SKIP: $binary is not an ELF binary"
    continue
  fi

  # Extract all GLIBC version requirements from the binary
  glibc_versions=$(readelf -V "$binary" 2>/dev/null | grep -oP 'GLIBC_[0-9.]+' | sort -uV || true)

  if [ -z "$glibc_versions" ]; then
    echo "OK: $binary - no glibc version requirements (statically linked?)"
    continue
  fi

  # Find the maximum required glibc version
  max_required=$(echo "$glibc_versions" | sed 's/GLIBC_//' | sort -V | tail -1)

  if version_lte "$max_required" "$MAX_VERSION"; then
    echo "OK: $binary - max glibc required: $max_required (<= $MAX_VERSION)"
  else
    echo "FAIL: $binary - requires glibc $max_required (exceeds max $MAX_VERSION)"
    echo "  Required versions: $(echo "$glibc_versions" | tr '\n' ' ')"
    exit_code=1
  fi
done

if [ $exit_code -eq 0 ]; then
  echo ""
  echo "All binaries are compatible with glibc <= $MAX_VERSION"
else
  echo ""
  echo "ERROR: Some binaries require a glibc version newer than $MAX_VERSION"
  echo "This means they won't work on older Linux distributions."
  echo "Ensure all Linux release binaries are built with Zig targeting glibc $MAX_VERSION."
fi

exit $exit_code
