#!/bin/bash
set -eu

# Enter repo root.
cd "$(dirname "$0")"/../..

BRANCH=$1
LABELS=$2

# Define the allow_list
allow_list=()

# Add labels from input to the allow_list
IFS=',' read -r -a input_labels <<< "$LABELS"
allow_list+=("${input_labels[@]}")

# Generate full list of targets on one line
full_list=$(earthly ls ./yarn-project/end-to-end | grep '+bench' | sed 's/+//' | xargs echo)

echo "$full_list"
# If branch is master or allow_list contains 'bench-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "bench-all" ]]; then
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
