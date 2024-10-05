#!/bin/bash

# Starts a test scenario where as many pieces as practical are
# just natively running - running on the same computer, no docker or k8s
# Usage: ./network_test.sh <test>
# Optional environment variables:
#   VALUES_FILE (default: "default.yaml")

set -eux

command -v yq || (echo "We need 'yq' installed to be able to query our rendered helm template network config" && exit 1)
command -v tmux || (echo "We need 'tmux' installed to be able to run our commands as one easily-managed session" && exit 1)

# Main positional parameter
TEST="$1"

VALUES_FILE="${VALUES_FILE:-default.yaml}"

# Path to the multi-YAML file
yaml_file="multi-yaml-file.yaml"

# The helm charts are our base truth - let's just make helm tell us what the values are and be selective about applying them!
# This is a good lightweight test of helm chart values before running a full helm scenario and more maintainable than a separate base truth
helm template spartan "$(git rev-parse --show-toplevel)/spartan/aztec-network/" --values "$(git rev-parse --show-toplevel)/spartan/aztec-network/values/$VALUES_FILE" > $yaml_file

# # Function to extract env variables, commands, and run them
# process_container() {
#   container_name=$1
#   echo "Processing container: $container_name"

#   # Extract and join the command array into a string, handle nulls
#   command=$(yq e -o=json ".spec.template.spec.containers[] | select(.name == \"$container_name\") | .command" $yaml_file | jq -r 'if . == null then "" else join(" ") end')

#   # Extract and join the args array into a string, handle nulls
#   args=$(yq e -o=json ".spec.template.spec.containers[] | select(.name == \"$container_name\") | .args" $yaml_file | jq -r 'if . == null then "" else join(" ") end')

#   # Extract environment variables
#   env_vars=$(yq e ".spec.template.spec.containers[] | select(.name == \"$container_name\") | .env[]? | .name + \"=\" + .value" $yaml_file)

#   # Set environment variables
#   echo "Exporting environment variables:"
#   if [ -n "$env_vars" ]; then
#     while IFS= read -r env_var; do
#       echo "export $env_var"
#       echo export $env_var
#     done <<< "$env_vars"
#   else
#     echo "No environment variables to export."
#   fi

#   # Run the command if it exists
#   if [ -n "$command" ]; then
#     echo "Running command for $container_name:"
#     full_command="$command $args"
#     echo "$full_command"
#     echo eval "$full_command"
#   else
#     echo "No command to run for container: $container_name"
#   fi

#   echo "Finished processing container: $container_name"
#   echo "----------------------------------------"
# }

# function filter_telemetry() {
#   # We do not desire telemetry for our native test.
#   grep -v otel-collector | grep -v prometheus | grep -v grafana | grep -v jaeger
# }

# # Extract all containers from the YAML file
# containers=$(yq e '.spec.template.spec.containers[].name' $yaml_file | filter_telemetry)
# echo $containers
# # # Loop through each container and process it
# # while IFS= read -r container; do
# #   process_container "$container"
# # done <<< "$containers"

# Name of the tmux session
tmux_session="native_network_test_session"

# Create a fresh tmux session
tmux kill-session -t $tmux_session || true
tmux new-session -d -s $tmux_session

# Function to process each resource by metadata.name
process_resource() {
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

  # Initialize pane index
  pane_index=0

  # Loop through each container in the resource
  while IFS= read -r container_name; do
    echo "  Processing container: $container_name"

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
    full_command="$command $args"
    # If there's no command, skip running
    if [ -z "$full_command" ]; then
      echo "    No command to run for container: $container_name"
      continue
    fi

    # Build the pane command
    pane_command="vim" #$env_exports $full_command; read -p 'Press Enter to exit...';"

    # If this is the first pane, send the command to the initial pane
    if [ $pane_index -eq 0 ]; then
      tmux send-keys -t $tmux_session "$pane_command" Enter
    else
      # Split the window to create a new pane and run the command
      tmux split-window -t $tmux_session -h
      tmux select-layout -t $tmux_session tiled
      tmux send-keys -t $tmux_session "$pane_command" Enter
    fi

    # Increment the pane index
    pane_index=$((pane_index + 1))

    echo "    Command sent to tmux pane for container: $container_name"

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

for resource_name in "${resource_names[@]}"; do
  process_resource "$resource_name"
done

# Attach to the tmux session
tmux attach-session -t $tmux_session