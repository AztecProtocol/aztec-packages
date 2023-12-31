#!/usr/bin/env bash
set -euo pipefail

# The wasm way. Commenting out for now as it's simpler to just use nargo.
# ./scripts/compile.sh $(./scripts/get_all_contracts.sh)

../../noir/target/release/nargo compile --silence-warnings

for F in $(find ./target -maxdepth 1 -type f ! -name 'debug_*'); do
  ./scripts/transform_json_abi.sh $F > ${F}.out && mv ${F}.out $F
done

