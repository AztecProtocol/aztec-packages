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
allow-list=(
  "e2e-2-pxes"
  "e2e-authwit"
  "e2e-avm-simulator"
  "e2e-block-building"
  "e2e-cross-chain-messaging"
  "e2e-deploy-contract"
  "e2e-fees"
  "e2e-fees-gas-estimation"
  "e2e-fees-private-payments"
  "e2e-max-block-number"
  "e2e-nested-contract"
  "e2e-ordering"
  "e2e-static-calls"
  "integration-l1-publisher"
  "e2e-cheat-codes"
  "e2e-prover-fake-proofs"
  "e2e-prover-coordination"
  "e2e-lending-contract"
  "kind-network-smoke"
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
