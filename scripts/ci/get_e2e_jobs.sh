#!/bin/bash
set -eu

# Enter repo root.
cd "$(dirname "$0")"/../..

BRANCH=$1
LABELS=$2

# Define the allow_list
allow_list=(
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
  "e2e-prover-full"
  "e2e-static-calls"
)

# Add labels from input to the allow_list
IFS=',' read -r -a input_labels <<< "$LABELS"
allow_list+=("${input_labels[@]}")

# Generate full list of targets, excluding specific entries
full_list=$(earthly ls ./yarn-project/end-to-end | grep -v '+base' | grep -v '+bench' | grep -v "+network" | grep -v 'devnet' | sed 's/+//')

# If branch is master or allow_list contains 'e2e-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "e2e-all" ]]; then
  # print as JSON list
  echo "$full_list" | jq -Rc 'split(" ")'
  exit 0
fi

# Filter the full_list to include only items in the allow_list
filtered_list=()
for item in $full_list; do
  for allowed in "${allow_list[@]}"; do
    if [[ "$item" == "$allowed" ]]; then
      filtered_list+=("$item")
    fi
  done
done

# Print the filtered list in JSON format
echo ${filtered_list[@]} | jq -Rc 'split(" ")'