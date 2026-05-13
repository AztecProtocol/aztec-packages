#!/usr/bin/env bash
# Source environment variables from a per-network YAML.
#
# Usage:
#   source_network_env <name|absolute-path-to-yaml>   # full pass (resolves GCP secrets)
#   source_env_basic   <name|absolute-path-to-yaml>   # skips GCP secret resolution
#
# Both functions delegate to load_network_config.sh; --skip-secrets is the only
# difference. load_network_config.sh validates the YAML path and skips secrets
# automatically when gcloud is not on PATH, so callers don't need to.

spartan=$(git rev-parse --show-toplevel)/spartan

# Internal: source `export KEY=VALUE` lines emitted by the loader.
function _source_loader_env {
  local name="$1"
  shift
  set -a
  # shellcheck disable=SC1090
  source <("$spartan/scripts/load_network_config.sh" "$name" --format=env "$@")
  set +a
}

function source_network_env {
  local name="$1"
  echo "Loading network environment from YAML: $name"
  _source_loader_env "$name"
  echo "Successfully loaded YAML config $name"
}

function source_env_basic {
  local name="$1"
  echo "Loading basic environment from YAML: $name"
  _source_loader_env "$name" --skip-secrets
}

# When invoked directly, default to the full (secret-resolving) pass.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "${1:-}" ]]; then
  source_network_env "$1"
fi
