#!/bin/bash
set -eu

# Enter repo root.
cd "$(dirname "$0")"/../..

BRANCH=$1
LABELS=$2

# Function to parse YAML and extract test names
get_test_names() {
  yq e '.tests | keys | .[]' yarn-project/end-to-end/scripts/e2e_test_config.yml
}

# Read the full list from the YAML file
full_list=$(get_test_names)

# Define the jobs that will run on every PR
allow_list=(
  "e2e_2_pxes"
  "e2e_authwit"
  "e2e_avm_simulator"
  "e2e_block_building"
  "e2e_cross_chain_messaging"
  "e2e_deploy_contract"
  "e2e_fees"
  "e2e_fees_gas_estimation"
  "e2e_fees_private_payments"
  "e2e_max_block_number"
  "e2e_nested_contract"
  "e2e_ordering"
  "e2e_static_calls"
  "integration_l1_publisher"
  "e2e_cheat_codes"
  "e2e_prover_fake_proofs"
  "e2e_prover_coordination"
  "e2e_lending_contract"
  "kind_network_smoke"
)

# Add labels from input to the allow_list
IFS=',' read -r -a input_labels <<<"$LABELS"
allow_list+=("${input_labels[@]}")

# Generate full list of targets, excluding specific entries, on one line
test_list=$(echo "${full_list[@]}" | grep -v 'base' | grep -v 'bench' | grep -v "network" | grep -v 'devnet' | xargs echo)

# # If branch is master or allow_list contains 'e2e-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "e2e-all" ]]; then
  # print as JSON list
  echo "$test_list" | jq -Rc 'split(" ")'
  exit 0
fi

# # Filter the test_list to include only items in the allow_list
filtered_list=()
for item in $test_list; do
  for allowed in "${allow_list[@]}"; do
    if [[ "$item" == "$allowed" ]]; then
      filtered_list+=("$item")
    fi
  done
done

# # Print the filtered list in JSON format
echo ${filtered_list[@]} | jq -Rc 'split(" ")'
