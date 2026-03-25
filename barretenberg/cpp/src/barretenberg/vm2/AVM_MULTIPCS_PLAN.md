# AVM Multipcs — Bench & Tuning Guide

## What it does

Groups `BATCH_SIZE` (BS) consecutive AVM polynomials into each commitment via on-the-fly interleaving.
Reduces witness commitment count from ~3012 (BS=1) to ~1506 (BS=2) to ~753 (BS=4).

BS is controlled by codegen: regenerate with `--batch-size N` and rebuild. No C++ changes needed.

## Current status

- **BS=2**: Prover + native verifier working. All `vm2_tests` pass.
- **Remaining work**: hardcoded VK regeneration, Noir proof length constant, recursive verifier, batched MSM for commitment rounds.

## Key constants (generated in `columns.hpp`)

| Constant | BS=1 | BS=2 | BS=4 |
|----------|------|------|------|
| `INTERLEAVING_BATCH_SIZE` | 1 | 2 | 4 |
| `INTERLEAVING_LOG_K` | 0 | 1 | 2 |
| Witness commitments | 3012 | ~1506 | ~753 |
| Gemini rounds | log₂(N) | log₂(N)+1 | log₂(N)+2 |
| SRS requirement | N | 2N | 4N |

Entity counts (current): precomputed=122, wire=2525, derived=452, shifted=363.
Wire and shifted are odd — last group in each section is zero-padded.

## How to benchmark

```bash
# Build
cd barretenberg/cpp
cmake --preset clang20-assert -DAVM=ON
cmake --build --preset clang20-assert --target vm2_tests

# Run verifier tests (prove + verify)
cd build && ./bin/vm2_tests --gtest_filter="*AvmVerifier*"

# Run full bulk test (from repo root)
yarn-project/end-to-end/scripts/run_test.sh simple e2e_block_building
```

## What to measure

1. **Commitment round time** — `prove/wire_commitments_round` and `prove/log_derivative_inverse_commitments_round`. Half as many commitments at BS=2, but each interleaved MSM touches the same total number of scalar-point pairs, so total MSM work is roughly unchanged. Savings come from reduced transcript hashing and fewer group additions.
2. **PCS round time** — `prove/pcs_rounds`. Gemini does LOG_K extra fold rounds. Each fold is over a polynomial of size `actual_trace * BS`. For small traces, negligible; for full 2²¹ traces, adds one fold at size 2²².
3. **Proof size** — Fewer commitments (2 FEs each) but more Gemini folds (2 FEs + 1 FE each). Net savings at BS=2: ~3012 fewer commitment FEs, +3 fold FEs ≈ 3009 FE reduction.
4. **Memory** — Temporary interleaved group polynomials are allocated per-group proportional to actual trace data (not max). Gemini fold allocations also scale with actual trace.
5. **Verifier time** — Lagrange combination is O(num_groups × BS), cheap. Shplemini/KZG pairing unchanged.

## Architecture (data flow)

```
Individual entity polys (size N each)
    │
    ├── Oink: commit_interleaved<BS>() per group → group commitments
    │
    ├── Sumcheck: operates on individual entities (unchanged)
    │
    └── PCS:
        ├── Prover: materialize interleaved groups → batch with short scalars → Gemini/Shplemini
        └── Verifier: Lagrange-combine evals → batch group commitments → Shplemini
```

## Tuning knobs

- **`INTERLEAVING_BATCH_SIZE`** (codegen `--batch-size`): Primary knob. 1=off, 2=halve commitments, 4=quarter. Higher BS means fewer commitments but larger PCS polynomials and SRS requirement.
- **`AVM_MAX_MSM_BATCH_SIZE`** (env var): Controls how many groups are batch-committed together. Currently commitment rounds are per-group (no batching). Adding `batch_commit_interleaved` would improve throughput.
- **SRS size**: Must be ≥ `actual_trace_size * BS`. The ProvingKey allocates SRS at `MAX_AVM_TRACE_SIZE * BS`. File CRS has 2²⁵ points, sufficient for BS≤16.

## Protocol details

**Interleaving**: Group poly `G(X) = f₀(X^BS) + X·f₁(X^BS) + ... + X^{BS-1}·f_{BS-1}(X^BS)`.

**Extended challenge**: `[interleaving_challenges || sumcheck_challenges]`. Interleaving challenges are the lowest-order multilinear variables (select position within group). Generated via Fiat-Shamir after sumcheck, before PCS.

**Lagrange combination**: Verifier combines BS individual sumcheck evaluations into one group evaluation: `E_g = Σⱼ L_j(u) · e_{g·BS+j}` where `L_j` is Lagrange basis over {0,1}^{LOG_K}.

**Section boundaries**: Entity counts not divisible by BS require per-section combining (precomputed, wire, derived separately) to avoid cross-section indexing errors.

**Shift exponent**: Shifted group polynomials have `start_index = BS`. PolynomialBatcher uses `shift_exponent = BS` (not 1). ClaimBatcher computes `r^{-BS}` scaling.

## Files changed (from merge-train/avm)

| File | What |
|------|------|
| `vm2/generated/columns.hpp` | Interleaving constants (codegen) |
| `vm2/constraining/flavor.hpp` | Group constants, proof length formula, VK type |
| `vm2/constraining/flavor.cpp` | SRS size = circuit_size × BS, Gemini round count |
| `vm2/constraining/prover.cpp` | Interleaved commit rounds, materialized PCS |
| `vm2/constraining/verifier.cpp` | Group commitments, Lagrange eval combining, extended challenge |
| `vm2/proving_helper.hpp/cpp` | VK with precomputed group commitments |
| `vm2/constraining/verifier.test.cpp` | Pass VK from prover to verifier |
