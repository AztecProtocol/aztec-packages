#! /bin/bash
set -euo pipefail
mkdir -p ./fixtures

cp "../../noir-projects/noir-contracts/target/benchmarking_contract-Benchmarking.json" ./fixtures/Benchmarking.test.json
cp "../../noir-projects/noir-contracts/target/test_contract-Test.json" ./fixtures/Test.test.json
cp "../../noir-projects/noir-contracts/target/token_contract-Token.json" ./fixtures/Token.test.json

# Run bb aztec_process on the copied fixtures to embed precomputed hashes
# (artifactHash, privateFunctionsRoot, publicBytecodeCommitment, contractClassId,
# per-function verificationKeyHash and functionSelector).
# These allow TypeScript to skip expensive hash computations and also serve as cross-validation
# that the C++ and TypeScript implementations are equivalent.
bb=$(../../barretenberg/cpp/scripts/find-bb)
for fixture in ./fixtures/Benchmarking.test.json ./fixtures/Test.test.json ./fixtures/Token.test.json; do
  echo "Post-processing $fixture..."
  $bb aztec_process -i "$fixture" -o "$fixture"
done
