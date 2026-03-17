#!/bin/bash
# Wrapper for zig cc that pins glibc 2.35 on Linux (Ubuntu 22.04+ compat)
# and uses native target on macOS.
# On ARM64 Linux, use an explicit aarch64 target instead of 'native' to produce
# generic ARM64 code. This prevents CPU-specific instructions (e.g. SVE on Graviton)
# from being emitted, ensuring binaries work across all ARM64 machines including
# Apple Silicon in devcontainers.
if [[ "$(uname -s)" == "Linux" ]]; then
  case "$(uname -m)" in
    aarch64|arm64) exec zig cc -target aarch64-linux-gnu.2.35 "$@" ;;
    *)             exec zig cc -target native-linux-gnu.2.35 "$@" ;;
  esac
else
  exec zig cc "$@"
fi
