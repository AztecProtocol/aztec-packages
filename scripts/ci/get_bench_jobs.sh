#!/bin/bash
set -eu

# Enter repo root.
cd $(dirname $0)/../..

BRANCH=$1
LABELS=$2

# Define the allow_list
allow_list=()

# Add labels from input to the allow_list
IFS=',' read -r -a input_labels <<< "$LABELS"
allow_list+=("${input_labels[@]}")

# Convert allow_list to items prepended with '+'
allow_list_plus=()
for item in "${allow_list[@]}"; do
  allow_list_plus+=("+$item")
done

# Generate full list of targets
full_list=$(earthly ls ./yarn-project/end-to-end | grep '+bench' | sed 's/+//' | jq -R . | jq -cs .)

# If branch is master or allow_list contains '+e2e-all', return full list
if [[ "$BRANCH" == "master" ]] || [[ " ${allow_list[@]} " =~ "bench-all" ]]; then
  echo "$full_list"
  exit 0
fi

# Filter full_list with only things inside allow_list_plus
filtered_list=$(echo "$full_list" | jq -c ".[] | select(. as \$i | $(printf 'contains(\"%s\") or ' "${allow_list_plus[@]}" | sed 's/ or $//'))" | jq -cs .)

# Print the filtered list
echo "$filtered_list"
