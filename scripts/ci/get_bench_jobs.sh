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

# Define the allow_list
allow_list=()

# Add labels from input to the allow_list
IFS=',' read -r -a input_labels <<< "$LABELS"
allow_list+=("${input_labels[@]}")

# Generate potential list of test targets on one line
test_list=$(get_test_names | grep 'bench' | xargs echo)

# If branch is master or allow_list contains 'bench-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "bench_all" ]]; then
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
