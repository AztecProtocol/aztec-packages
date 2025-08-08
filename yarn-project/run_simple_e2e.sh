#!/usr/bin/env bash
# Run only simple e2e tests with fake proofs sequentially

cd end-to-end

echo "Running simple e2e tests with fake proofs..."
export FAKE_PROOFS=1

# Run the simple tests directly
echo "Running prover test..."
./scripts/run_test.sh simple e2e_prover/full

echo "Running block building test..."
./scripts/run_test.sh simple e2e_block_building

echo "Running other simple e2e tests..."
for test_file in src/e2e_*.test.ts; do
    if [[ -f "$test_file" ]]; then
        echo "Running: $test_file"
        ./scripts/run_test.sh simple "$test_file"
    fi
done

echo "All simple e2e tests completed!"
