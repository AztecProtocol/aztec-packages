#!/bin/bash

# Usage: ./e2e_test.sh <test> <...extra_args>
# Optional environment variables:
#   HARDWARE_CONCURRENCY (default: "")
#   FAKE_PROOFS (default: "")
#   COMPOSE_FILE (default: "./scripts/docker-compose.yml")

set -eu

# go above this folder
cd $(dirname "${BASH_SOURCE[0]}")/..
# Main positional parameter
export TEST="$1"
shift

# Default values for environment variables
export HARDWARE_CONCURRENCY="${HARDWARE_CONCURRENCY:-}"
export FAKE_PROOFS="${FAKE_PROOFS:-}"
export COMPOSE_FILE="${COMPOSE_FILE:-./scripts/docker-compose.yml}"
export AZTEC_DOCKER_TAG=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}

# Function to load test configuration
load_test_config() {
  local test_name="$1"
  yq e ".tests.${test_name}" "scripts/e2e_test_config.yml"
}

# Check if Docker images exist
if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "Docker images not found. They need to be built with 'earthly ./yarn-project/+export-end-to-end' or otherwise tagged with aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG."
  exit 1
fi

# Load test configuration
test_config=$(load_test_config "$TEST")

# Determine the test path
test_path=$(echo "$test_config" | yq e '.test_path // ""' -)
if [ -z "$test_path" ]; then
  test_path="${TEST}"
fi

# Check for ignore_failures
ignore_failures=$(echo "$test_config" | yq e '.ignore_failures // false' -)
if [ "$ignore_failures" = "true" ]; then
  echo "Ignoring failures for test $TEST"
fi

# Check if the test uses docker compose
if [ "$(echo "$test_config" | yq e '.use_compose // false' -)" = "true" ]; then
  $(dirname "$0")/e2e_compose_test.sh "$test_path" "$@" || [ "$ignore_failures" = "true" ]
elif [ "$(echo "$test_config" | yq e '.with_alerts // false' -)" = "true" ]; then
  $(dirname "$0")/e2e_test_with_alerts.sh "$test_path" "$@" || [ "$ignore_failures" = "true" ]
else
  # Set environment variables
  while IFS='=' read -r key value; do
    export "$key=$value"
  done < <(echo "$test_config" | yq e '.env // {} | to_entries | .[] | .key + "=" + .value' -)

  # Check for custom command
  custom_command=$(echo "$test_config" | yq e '.command // ""' -)
  env_args=$(echo "$test_config" | yq e '.env // {} | to_entries | .[] | "-e " + .key + "=" + .value' - | tr '\n' ' ')
  if [ -n "$custom_command" ]; then
    /bin/bash -c "$custom_command" || [ "$ignore_failures" = "true" ]
  else
    set -x
    # Run the default docker command
    docker run \
      -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" \
      -e FAKE_PROOFS="$FAKE_PROOFS" \
      $env_args \
      --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG \
      "$test_path" "$@" || [ "$ignore_failures" = "true" ]
  fi
fi
