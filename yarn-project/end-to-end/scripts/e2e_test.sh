#!/bin/bash

# Usage: ./e2e_test.sh <test> <...extra_args>
# Optional environment variables:
#   HARDWARE_CONCURRENCY (default: "")
#   FAKE_PROOFS (default: "")
#   COMPOSE_FILE (default: "./scripts/docker-compose.yml")

set -eu

# Main positional parameter
TEST="$1"
shift

# Default values for environment variables
HARDWARE_CONCURRENCY="${HARDWARE_CONCURRENCY:-}"
FAKE_PROOFS="${FAKE_PROOFS:-}"
COMPOSE_FILE="${COMPOSE_FILE:-./scripts/docker-compose.yml}"
AZTEC_DOCKER_TAG=$(git rev-parse HEAD)

# Install yq if not already installed
if ! command -v yq &>/dev/null; then
  wget https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64 -O - |
    tar xz && mv yq_linux_amd64 /usr/bin/yq
fi

# Function to load test configuration
load_test_config() {
  local test_name="$1"
  yq e ".tests.${test_name}" yarn-project/end-to-end/scripts/e2e_test_config.yml
}

# Check if Docker images exist
if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG"; then
  echo "Docker images not found. They need to be built with 'earthly ./yarn-project/+export-end-to-end' or otherwise tagged with aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG."
  exit 1
fi

# Function to run docker compose
run_docker_compose() {
  local test_name=$1
  shift

  # Compute project_name
  local project_name=$(echo "$test_name" | sed 's/\./_/g' | sed 's/\//_/g')

  # Determine CMD
  if docker compose >/dev/null 2>&1; then
    local CMD="docker compose"
  else
    local CMD="docker-compose"
  fi

  # Run docker compose
  $CMD -p "$project_name" -f "$COMPOSE_FILE" up --exit-code-from=end-to-end --force-recreate "$@"
}

# Load test configuration
test_config=$(load_test_config "$TEST")

# Check if the test uses docker compose
if [ "$(echo "$test_config" | yq e '.use_compose // false' -)" = "true" ]; then
  run_docker_compose "$TEST" "$@"
else
  # Set environment variables
  while IFS='=' read -r key value; do
    export "$key=$value"
  done < <(echo "$test_config" | yq e '.env // {} | to_entries | .[] | .key + "=" + .value' -)

  # Check for custom command
  custom_command=$(echo "$test_config" | yq e '.command // ""' -)
  env_args=$(echo "$test_config" | yq e '.env // {} | to_entries | .[] | "-e " + .key + "=" + .value' - | tr '\n' ' ')
  if [ -n "$custom_command" ]; then
    # Run the docker command
    docker run \
      -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" \
      -e FAKE_PROOFS="$FAKE_PROOFS" \
      $env_args \
      --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG \
      /bin/bash -c "$custom_command"
  else
    # Run the default docker command
    docker run \
      -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" \
      -e FAKE_PROOFS="$FAKE_PROOFS" \
      $env_args \
      --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG \
      "$TEST" "$@"
  fi
fi
