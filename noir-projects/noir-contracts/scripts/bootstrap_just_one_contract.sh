#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

# Call example:
# `./scripts/bootstrap_just_one_contract.sh nft_contract NFT`

# Check if the filename argument is provided
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <contract-package-name> <contract-name> [command]"
  echo "The filename should be as per those spat out into the 'target/' dir, without json. E.g. 'nft_contract NFT'"
  exit 1
fi

CONTRACT_PACKAGE_NAME=$1
CONTRACT_NAME=$2
JSON_NAME="$CONTRACT_PACKAGE_NAME-$CONTRACT_NAME"

CMD=${3:-}  # Check for a 3rd arg that shouldn't be there.

# Handle the "clean" command
if [ -n "$CMD" ]; then
  echo "Unknown command: $CMD"
  exit 1
fi

# Ensure the target JSON file exists
if [ ! -f "../target/$JSON_NAME.json" ]; then
  echo "Error: File '../target/$JSON_NAME.json' not found."
  exit 1
fi

# Compile the contract
echo "Compiling contract..."
NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings --inliner-aggressiveness 0 --package $CONTRACT_PACKAGE_NAME

# Transpile the contract
echo "Transpiling contract..."
TRANSPILER=${TRANSPILER:-../../../avm-transpiler/target/release/avm-transpiler}
"$TRANSPILER" "../target/$JSON_NAME.json" "../target/$JSON_NAME.json"

# Strip aztec nr prefix
echo "Stripping aztec nr prefix..."
STRIP_AZTEC_NR_PREFIX=${STRIP_AZTEC_NR_PREFIX:-./strip_aztec_nr_prefix.sh}
$STRIP_AZTEC_NR_PREFIX "../target/$JSON_NAME.json"

# Generate verification keys for private functions
echo "Generating verification keys..."
BB=${BB:-../../../barretenberg/cpp/build/bin/bb}
BB_HASH=${BB_HASH:-$(cd ../../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo "Using BB hash $BB_HASH"

tempDir="../target/tmp"
mkdir -p "$tempDir"

json_path="../target/$JSON_NAME.json"
num_functions=$(jq '.functions | length' "$json_path")

for ((i=0; i<num_functions; i++)); do
  func=$(jq -c ".functions[$i]" "$json_path")
  name=$(echo "$func" | jq -r '.name')

  # Check if the function is private (not public and not unconstrained).
  is_public=$(echo "$func" | jq '(.custom_attributes | index("public") != null)')
  is_unconstrained=$(echo "$func" | jq '.is_unconstrained')

  if [ "$is_public" == "true" ] || [ "$is_unconstrained" == "true" ]; then
    echo "Skipping VK for $name (public or unconstrained)"
    continue
  fi

  echo "Generating VK for $name..."
  bytecode_b64=$(echo "$func" | jq -r '.bytecode')
  outdir=$(mktemp -d -p "$tempDir")
  echo "$bytecode_b64" | base64 -d | gunzip | "$BB" write_vk --scheme chonk -b - -o "$outdir" -v
  vk=$(cat "$outdir/vk" | base64 -w 0)

  # Update the function's verification_key in the JSON
  jq --arg vk "$vk" --argjson idx "$i" '.functions[$idx].verification_key = $vk' "$json_path" > "$json_path.tmp"
  mv "$json_path.tmp" "$json_path"
done

echo "Done."

