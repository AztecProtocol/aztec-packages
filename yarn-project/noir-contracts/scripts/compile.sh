#!/usr/bin/env bash
set -euo pipefail

# The wasm way. Commenting out for now as it's simpler to just use nargo.
# ./scripts/compile.sh $(./scripts/get_all_contracts.sh)

# TODO: Move this compilation phase out of yarn-project to own job, and ingest abis.
../../noir/target/release/nargo compile --silence-warnings
