#!/usr/bin/env bash
# Backward-compatible shim: both source_env_basic and source_network_env now
# live in source_network_env.sh. Kept so existing callers (bootstrap.sh, GHA,
# test_kind.sh, ...) that source this path continue to work.

source "$(dirname "${BASH_SOURCE[0]}")/source_network_env.sh"

if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "${1:-}" ]]; then
  source_env_basic "$1"
fi
