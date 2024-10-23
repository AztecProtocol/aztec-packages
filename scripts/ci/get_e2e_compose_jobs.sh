#!/bin/bash
set -eu

# Enter repo root.
cd "$(dirname "$0")"/../..

BRANCH=$1
LABELS=$2

# Read the full list from the file
full_list=$(cat yarn-project/end-to-end/scripts/full_e2e_test_list)

# Define that need the compose_test script to run
compose_list=(
  e2e_sandbox_example
  uniswap_trade_on_l1_from_l2
  integration_l1_publisher
  e2e_browser
  pxe
  e2e_docs_examples
  guides/writing_an_account_contract
  guides/dapp_testing
  sample-dapp/ci/index.test.mjs
  sample-dapp/index.test.mjs
  guides/up_quick_start
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
