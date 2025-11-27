#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")/.."

# Run all Zig tests
zig build test
