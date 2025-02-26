#! /bin/bash

set -e

REPO=$(git rev-parse --show-toplevel)

output_file="$REPO/yarn-project/p2p/bench-out/p2p-bench.json"
result="[]"

# Loop over each JSON file in bench-out
for file in "$REPO/yarn-project/p2p/bench-out"/*.json; do
  # Extract the base filename (without directory and .json extension)
  base=$(basename "$file" .json)
  # Skip if the file is the consolidated file
  if [[ "$base" == "p2p-bench" ]]; then
    continue
  fi

  # - name: "$base - <key>"
  # - unit: "ms"
  # - value: the value from the stats object
  file_entries=$(jq --arg fname "$base" 'if .stats then
      .stats | to_entries | map({name: ($fname + " - " + .key), unit: "ms", value: .value})
    else [] end' "$file")

  # Append the current file's entries to the overall result array.
  result=$(echo "$result" "$file_entries" | jq -s 'add')
done

# Write the consolidated array
echo "$result" > "$output_file"
echo "Consolidated benchmarks written to $output_file"
