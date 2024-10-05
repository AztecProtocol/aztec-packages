#!/bin/bash

# Starts a test scenario where as many pieces as practical are
# just natively running - running on the same computer, no docker or k8s
# Usage: ./network_test.sh <test>
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")

set -eux

# Ensure dependencies are installed
command -v yq || (echo "We need 'yq' installed to be able to query our rendered helm template network config" && exit 1)
command -v tmux || (echo "We need 'tmux' installed to be able to manage terminal sessions" && exit 1)

# Main positional parameter
TEST="$1"
VALUES_FILE="${VALUES_FILE:-default.yaml}"

# Path to the multi-YAML file
yaml_file="multi-yaml-file.yaml"

# The helm charts are our base truth - let's just make helm tell us what the values are and be selective about applying them!
helm template spartan "$(git rev-parse --show-toplevel)/spartan/aztec-network/" \
  --values "$(git rev-parse --show-toplevel)/spartan/aztec-network/values/$VALUES_FILE" > "$yaml_file"

function extract_commands_by_helm_metadata_name() {
  resource_name=$1

  echo "Processing resource: $resource_name"

  # Check if the resource exists
  resource_exists=$(yq e "select(.metadata.name == \"$resource_name\") | .metadata.name" $yaml_file)

  if [ -z "$resource_exists" ]; then
    echo "Resource $resource_name not found in the YAML file."
    echo "----------------------------------------"
    return
  fi

  # Extract containers within this resource
  container_names=$(yq e "select(.metadata.name == \"$resource_name\") | .spec.template.spec.containers[].name" $yaml_file)

  if [ -z "$container_names" ]; then
    echo "Resource $resource_name does not have containers to process."
    echo "----------------------------------------"
    return
  fi

  # Loop through each container in the resource
  while IFS= read -r container_name; do
    # Extract and join the command array into a string, handle nulls
    command=$(yq e -o=json "select(.metadata.name == \"$resource_name\") | .spec.template.spec.containers[] | select(.name == \"$container_name\") | .command" $yaml_file | jq -r 'if . == null then "" else join(" ") end')

    # Extract and join the args array into a string, handle nulls
    args=$(yq e -o=json "select(.metadata.name == \"$resource_name\") | .spec.template.spec.containers[] | select(.name == \"$container_name\") | .args" $yaml_file | jq -r 'if . == null then "" else join(" ") end')

    # Extract environment variables
    env_vars=$(yq e "select(.metadata.name == \"$resource_name\") | .spec.template.spec.containers[] | select(.name == \"$container_name\") | .env[]? | .name + \"=\" + .value" $yaml_file)

    # Prepare environment variable exports
    env_exports=""
    if [ -n "$env_vars" ]; then
      while IFS= read -r env_var; do
        env_exports+="export $env_var; "
      done <<< "$env_vars"
    fi

    # Combine the command and args
    full_command="echo '$env_exports $command $args'"

    # Pipe the commands for tmux-splits-stdin (one command per line)
    echo "$full_command"
  done <<< "$container_names"

  echo "Finished processing resource: $resource_name"
  echo "----------------------------------------"
}

# List of resource names to process
resource_names=(
  "spartan-aztec-network-ethereum"
  "spartan-aztec-network-pxe"
  "spartan-aztec-network-bot"
  "spartan-aztec-network-boot-node"
  "spartan-aztec-network-prover-node"
  "spartan-aztec-network-validator"
)

# Queue all commands to tmux-splits-stdin
for resource_name in "${resource_names[@]}"; do
  extract_commands_by_helm_metadata_name "$resource_name"
done | "$(git rev-parse --show-toplevel)/scripts/tmux-splits-stdin "native_network_test_session"
