#!/usr/bin/env bash
# Tier-1 prover feasibility benchmark for a local machine (designed for Apple Silicon,
# runs anywhere). Replays the captured tx-to-root fixtures and scores the result
# against the mainnet checkpoint cadence (72s per checkpoint).
#
# Usage: mac_tier1_bench.sh <fixtures_dir> [bb_binary]
set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURES="${1:?usage: mac_tier1_bench.sh <fixtures_dir> [bb_binary]}"
BB="${2:-build/bin/bb}"
OUT=$(mktemp -d)

echo "== Tier-1 prover feasibility bench =="
echo "machine: $(uname -m) / $(sysctl -n machdep.cpu.brand_string 2>/dev/null || grep -m1 'model name' /proc/cpuinfo | cut -d: -f2)"
echo "note: first run downloads ~1GB of CRS to ~/.bb-crs"
echo

./scripts/replay_prover_bench.sh "$FIXTURES" -b "$BB" -o "$OUT"

echo
echo "== Tier-1 verdict (mainnet cadence: one checkpoint per 72s slot) =="
awk -F, '
  FNR == 1 { next }
  $3 == "FAILED" { failed++; next }
  {
    name = $2; sub(/^[0-9]+-/, "", name); sub(/-pid[0-9]+$/, "", name)
    wall[name] += $3; count[name]++
  }
  END {
    mean_cp   = wall["CheckpointRootSingleBlockRollupArtifact"] / count["CheckpointRootSingleBlockRollupArtifact"]
    mean_par  = (wall["ParityBaseArtifact"] + wall["ParityRootArtifact"])
    mean_blk  = wall["BlockRootSingleTxFirstRollupArtifact"] / count["BlockRootSingleTxFirstRollupArtifact"]
    mean_tx   = wall["PrivateTxBaseRollupArtifact"]
    mean_root = wall["RootRollupArtifact"] / 32  # amortized over the epoch

    # Steady-state work per checkpoint at ~1 private tx/block, 1 block/checkpoint.
    per_checkpoint = mean_par + mean_tx + mean_blk + mean_cp + mean_root
    printf "parity (base+root):        %6.1f s\n", mean_par
    printf "tx base (1 private tx):    %6.1f s\n", mean_tx
    printf "block root:                %6.1f s\n", mean_blk
    printf "checkpoint root:           %6.1f s\n", mean_cp
    printf "epoch root (amortized/32): %6.1f s\n", mean_root
    printf "TOTAL per checkpoint:      %6.1f s  (budget: 72 s)\n", per_checkpoint
    if (failed > 0) { printf "FAILED JOBS: %d — verdict invalid\n", failed; exit 1 }
    if (per_checkpoint < 50)      print "VERDICT: PASS — comfortable headroom for tier-1 duty"
    else if (per_checkpoint < 72) print "VERDICT: MARGINAL — keeps up at current load, no headroom for tx growth"
    else                          print "VERDICT: FAIL — cannot sustain checkpoint cadence"
  }
' "$OUT"/chain-1.csv
