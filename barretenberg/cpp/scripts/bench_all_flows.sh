#!/usr/bin/env bash
set -eu

# Script to benchmark all IVC flows and collect translator/eccvm proving times
FLOWS=(
    "deploy_ecdsar1+sponsored_fpc"
    "deploy_schnorr+sponsored_fpc"
    "ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"
    "ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc"
    "ecdsar1+token_bridge_claim_private+sponsored_fpc"
    "ecdsar1+transfer_0_recursions+private_fpc"
    "ecdsar1+transfer_0_recursions+sponsored_fpc"
    "ecdsar1+transfer_1_recursions+private_fpc"
    "ecdsar1+transfer_1_recursions+sponsored_fpc"
    "schnorr+deploy_tokenContract_with_registration+sponsored_fpc"
)

# Move to cpp directory
cd $(dirname $0)/..

RESULTS_FILE="benchmark_results_$(date +%Y%m%d_%H%M%S).txt"

echo "Starting remote benchmarks for all flows..." | tee "$RESULTS_FILE"
echo "Branch: $(git branch --show-current)" | tee -a "$RESULTS_FILE"
echo "Commit: $(git log --oneline -1)" | tee -a "$RESULTS_FILE"
echo "Remote instance: $BB_SSH_INSTANCE" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

for FLOW in "${FLOWS[@]}"; do
    echo "========================================" | tee -a "$RESULTS_FILE"
    echo "Benchmarking flow: $FLOW" | tee -a "$RESULTS_FILE"
    echo "========================================" | tee -a "$RESULTS_FILE"

    # Run the benchmark and capture output
    ./scripts/benchmark_example_ivc_flow_remote.sh bb "$FLOW" 2>&1 | tee -a "$RESULTS_FILE"

    echo "" | tee -a "$RESULTS_FILE"
done

echo "========================================" | tee -a "$RESULTS_FILE"
echo "All benchmarks completed!" | tee -a "$RESULTS_FILE"
echo "Results saved to: $RESULTS_FILE" | tee -a "$RESULTS_FILE"

# Extract translator and eccvm times if present in output
echo "" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "Summary of Translator and ECCVM times:" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
grep -E "(Translator|ECCVM|TranslatorProver|ECCVMProver)" "$RESULTS_FILE" || echo "No specific translator/eccvm timing data found in output" | tee -a "$RESULTS_FILE"
