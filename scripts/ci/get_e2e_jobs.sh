#!/bin/bash
set -eu

# Enter repo root.
cd "$(dirname "$0")"/../..

BRANCH=$1
# support labels with hyphens for backwards compatibility:
LABELS=$(echo $2 | sed 's/-/_/g')

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
  "e2e_amm"
  "e2e_avm_simulator"
  "e2e_block_building"
  "e2e_cross_chain_messaging"
  "e2e_crowdfunding_and_claim"
  "e2e_deploy_contract"
  "e2e_epochs"
  "e2e_fees"
  "e2e_fees_failures"
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
  "guides_dapp_testing"
  "guides_sample_dapp"
  "guides_sample_dapp_ci"
  "guides_up_quick_start"
  "guides_writing_an_account_contract"
)

# Add labels from input to the allow_list, supports prefix matching
# E.g:
# e2e_p2p label will match e2e_p2p_gossip, e2e_p2p_rediscovery, e2e_p2p_reqresp etc.
# e2e_prover label will match e2e_prover_fake_proofs, e2e_prover_coordination etc.
IFS=',' read -r -a input_labels <<< "$LABELS"
expanded_allow_list=()

for label in "${input_labels[@]}"; do
  # For each input label, find all tests that start with this prefix
  matching_tests=$(echo "$full_list" | tr ' ' '\n' | grep "^${label}" || true)

  # If matching tests are found, add them to expanded_allow_list; otherwise, add the label itself
  if [ -n "$matching_tests" ]; then
    expanded_allow_list+=($matching_tests)
  else
    expanded_allow_list+=("$label")
  fi
done

# Add the input labels and expanded matches to allow_list
allow_list+=("${input_labels[@]}" "${expanded_allow_list[@]}")

# Generate full list of targets, excluding specific entries, on one line
test_list=$(echo "${full_list[@]}" | grep -v 'base' | grep -v 'bench' | grep -v "network" | grep -v 'devnet' | xargs echo)

# If branch is master or allow_list contains 'e2e-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "e2e_all" ]]; then
  # print as JSON list
  echo "$test_list" | jq -Rc 'split(" ")'
  exit 0
fi

# Filter the test_list to include only items in the allow_list
filtered_list=()
for item in $test_list; do
  for allowed in "${allow_list[@]}"; do
    if [[ "$item" == "$allowed" ]]; then
      filtered_list+=("$item")
    fi
  done
done

# Print the filtered list in JSON format
echo ${filtered_list[@]} | jq -Rc 'split(" ")'
