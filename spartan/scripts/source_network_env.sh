#!/usr/bin/env bash

spartan=$(git rev-parse --show-toplevel)/spartan

function source_network_env {
  local env_file
  # Check if the argument is an absolute path
  if [[ "$1" = /* ]]; then
    env_file="$1"
  else
    env_file="$spartan/environments/$1.env"
  fi
  # Optionally source an env file passed as first argument
  if [[ -n "${env_file:-}" ]]; then
    if [[ -f "$env_file" ]]; then

      # Standard behavior for files without GCP secrets
      set -a
      # shellcheck disable=SC1090
      source "$env_file"
      set +a

      # Check if we need to process GCP secrets and if we have gcloud auth
      if grep -q "REPLACE_WITH_GCP_SECRET" "$env_file" && command -v gcloud &> /dev/null; then
        echo "Environment file contains GCP secret placeholders. Processing secrets..."

        # Process GCP secrets
        source $spartan/scripts/setup_gcp_secrets.sh "$env_file"

        echo "Successfully loaded environment with GCP secrets"
      fi
    else
      echo "Env file not found: $env_file" >&2
      exit 1
    fi
  fi
}

# If script is run directly with an argument, source the env file
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ -n "$1" ]]; then
  source_network_env "$1"
fi
