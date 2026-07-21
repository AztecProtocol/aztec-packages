#!/bin/bash
# Wrapper for zig c++ that pins glibc 2.35 on Linux (Ubuntu 22.04+ compat)
# and uses native target on macOS.
# Use explicit architecture targets instead of 'native' to prevent zig from
# detecting host-specific CPU features (e.g. SVE on Graviton, AVX-512 on
# Sapphire Rapids) that would produce binaries incompatible with other machines.
# cmake's arch.cmake handles -march=skylake for x86; ARM gets baseline aarch64 (no SVE).
if [[ "$(uname -s)" == "Linux" ]]; then
  case "$(uname -m)" in
    aarch64|arm64) exec zig c++ -target aarch64-linux-gnu.2.35 "$@" ;;
    x86_64|amd64)  exec zig c++ -target x86_64-linux-gnu.2.35 "$@" ;;
    *)             echo "Error: unsupported architecture '$(uname -m)'" >&2; exit 1 ;;
  esac
else
  exec zig c++ "$@"
fi
