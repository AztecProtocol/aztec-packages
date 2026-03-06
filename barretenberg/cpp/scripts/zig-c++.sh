#!/bin/bash
# Wrapper for zig c++ that pins glibc 2.35 on Linux (Ubuntu 22.04+ compat)
# and uses native target on macOS.
if [[ "$(uname -s)" == "Linux" ]]; then
  exec zig c++ -target native-linux-gnu.2.35 "$@"
else
  exec zig c++ "$@"
fi
