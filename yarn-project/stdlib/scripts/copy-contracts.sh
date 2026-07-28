#! /bin/bash
set -euo pipefail
mkdir -p ./fixtures

cp "../../noir-projects/labs/noir-contracts/target/benchmarking_contract-Benchmarking.json" ./fixtures/Benchmarking.test.json
cp "../../noir-projects/labs/noir-contracts/target/test_contract-Test.json" ./fixtures/Test.test.json
cp "../../noir-projects/labs/noir-contracts/target/token_contract-Token.json" ./fixtures/Token.test.json

# Run bb aztec_process on the copied fixtures to embed precomputed hashes
# (artifactHash, privateFunctionsRoot, publicBytecodeCommitment, contractClassId,
# per-function verificationKeyHash and functionSelector).
# These allow TypeScript to skip expensive hash computations and also serve as cross-validation
# that the C++ and TypeScript implementations are equivalent.
bb=$(../../barretenberg/cpp/scripts/find-bb)
if [ ! -x "$bb" ]; then
  echo "Missing Barretenberg binary: $bb" >&2
  if [ "$(basename "$bb")" = "bb-avm" ]; then
    echo "bb-avm is required to post-process contract fixtures." >&2
    echo "Rebuild Barretenberg with AVM enabled." >&2
    echo "If using bootstrap, ensure AVM is not set to 0: AVM=1 ./bootstrap.sh build_native" >&2
  fi
  exit 1
fi
for fixture in ./fixtures/Benchmarking.test.json ./fixtures/Test.test.json ./fixtures/Token.test.json; do
  echo "Post-processing $fixture..."
  "$bb" aztec_process -i "$fixture" -o "$fixture"
done
