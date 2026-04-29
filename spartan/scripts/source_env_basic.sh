#!/usr/bin/env bash
# Source basic environment variables from a per-network YAML.
#
# Usage:
#   source_env_basic <name|absolute-path-to-yaml>
#
# Skips GCP secret resolution (this is the "basic" pass; secrets are fetched
# in source_network_env.sh).

spartan=$(git rev-parse --show-toplevel)/spartan

function resolve_yaml_file_path {
  local input="$1"
  if [[ "$input" = /* ]]; then
    echo "$input"
  else
    echo "$spartan/environments/networks/$input.yml"
  fi
}

function source_env_basic {
  local name="$1"
  local yaml_file
  yaml_file=$(resolve_yaml_file_path "$name")

  if [[ ! -f "$yaml_file" ]]; then
    echo "Network YAML not found: $yaml_file" >&2
    exit 1
  fi

  echo "Loading basic environment from YAML: $yaml_file"
  set -a
  # shellcheck disable=SC1090
  source <("$spartan/scripts/load_network_config.sh" "$name" --format=env --skip-secrets)
  set +a
}

# If script is run directly with an argument, source the env file
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "$1" ]]; then
  source_env_basic "$1"
fi
