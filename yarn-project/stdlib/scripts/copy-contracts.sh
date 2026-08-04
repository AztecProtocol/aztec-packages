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
bb=../../labs-aztec-toolchain/bin/bb
if [ ! -x "$bb" ]; then
  echo "Missing Barretenberg binary: $bb" >&2
  echo "Provision the toolchain first: run ./labs-aztec-toolchain/bootstrap.sh from the repo root." >&2
  exit 1
fi
for fixture in ./fixtures/Benchmarking.test.json ./fixtures/Test.test.json ./fixtures/Token.test.json; do
  echo "Post-processing $fixture..."
  "$bb" aztec_process -i "$fixture" -o "$fixture"
done
