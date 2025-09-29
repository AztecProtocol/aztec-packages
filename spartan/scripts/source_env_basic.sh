#!/usr/bin/env bash

spartan=$(git rev-parse --show-toplevel)/spartan

function resolve_env_file_path {
  local env_file_input="$1"
  if [[ "$env_file_input" = /* ]]; then
    echo "$env_file_input"
  else
    echo "$spartan/environments/$env_file_input.env"
  fi
}

function source_env_basic {
  local env_file="$1"
  local actual_env_file=$(resolve_env_file_path "$env_file")

  if [[ -f "$actual_env_file" ]]; then
    echo "Loading basic environment variables from $actual_env_file"
    set -a
    # shellcheck disable=SC1090
    source "$actual_env_file"
    set +a
  else
    echo "Env file not found: $actual_env_file" >&2
    exit 1
  fi
}

# If script is run directly with an argument, source the env file
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "$1" ]]; then
  source_env_basic "$1"
fi
