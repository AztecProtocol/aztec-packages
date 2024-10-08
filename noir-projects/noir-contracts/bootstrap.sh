#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

echo "Compiling contracts..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings

echo "Generating protocol contract vks..."
BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
vkDir="./target/keys"
mkdir -p $vkDir

protocol_contracts=$(jq -r '.[]' "./protocol_contracts.json")
for contract in $protocol_contracts; do
    artifactPath="./target/$contract.json"
    fnNames=$(jq -r '.functions[] | select(.custom_attributes | index("private")) | .name' "$artifactPath")
    for fnName in $fnNames; do
      BB_HASH=$BB_HASH node ../scripts/generate_vk_json.js "$artifactPath" "$vkDir" "$fnName"
    done
done

echo "Transpiling contracts..."
scripts/transpile.sh