#!/usr/bin/env bash
# Source full environment (including GCP secrets) from a per-network YAML.
#
# Usage:
#   source_network_env <name|absolute-path-to-yaml>

spartan=$(git rev-parse --show-toplevel)/spartan

function source_network_env {
  local name="$1"
  local yaml_file
  if [[ "$name" = /* ]]; then
    yaml_file="$name"
  else
    yaml_file="$spartan/environments/networks/$name.yml"
  fi

  if [[ ! -f "$yaml_file" ]]; then
    echo "Network YAML not found: $yaml_file" >&2
    exit 1
  fi

  echo "Loading network environment from YAML: $yaml_file"
  # The YAML loader handles GCP secret resolution internally if gcloud is on PATH.
  set -a
  # shellcheck disable=SC1090
  source <("$spartan/scripts/load_network_config.sh" "$name" --format=env)
  set +a
  echo "Successfully loaded YAML config $(basename "$yaml_file")"
}

# If script is run directly with an argument, source the env file
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "$1" ]]; then
  source_network_env "$1"
fi
