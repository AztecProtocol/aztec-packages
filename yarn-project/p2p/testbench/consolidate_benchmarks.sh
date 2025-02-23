#!/usr/bin/env bash
set -e

REPO=$(git rev-parse --show-toplevel)

# Create output directory if it doesn't exist
mkdir -p bench-out

# Create temporary file for storing entries
temp_file=$(mktemp)
entries_file=$(mktemp)

# Process each JSON file in bench-out directory
for file in $REPO/yarn-project/p2p/bench-out/*.json; do
    # Skip consolidated.json itself
    if [[ "$file" == "$REPO/yarn-project/p2p/bench-out/consolidated.json" ]]; then
        continue
    fi

    # Get filename without path and extension
    filename=$(basename "$file" .json)

    # Process each stat and create benchmark entries
    jq -r '.stats | to_entries[] | @json' "$file" | while read -r stat_json; do
        # Extract key and value using jq
        key=$(echo "$stat_json" | jq -r '.key')
        value=$(echo "$stat_json" | jq -r '.value')

        # Create benchmark entry
        jq -n \
            --arg name "$filename: $key" \
            --arg value "$value" \
            --arg unit "ms" \
            '{
                name: $name,
                unit: $unit,
                value: ($value | tonumber)
            }' >> "$entries_file"
    done
done

# Combine all entries
jq -s '.' "$entries_file" > "$temp_file"

# Format and consolidate
jq '.' "$temp_file" > "$REPO/yarn-project/p2p/bench-out/consolidated.json"

# Clean up
rm "$temp_file" "$entries_file"
