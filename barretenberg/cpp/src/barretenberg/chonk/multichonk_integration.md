# MultiChonk Integration Plan

**Status**: Multi Mega Prover implemented ✅ | Chonk/IVC Integration in progress 🔧

**Goal**: Integrate MultiMegaFlavor (coefficient interleaving with batch=4) into the Chonk IVC system to reduce ECCVM operations per fold from 62 to ~18 (~3.7× improvement).

**Related**: See `multichonk.md` for theoretical foundation and benchmarks.

---

## Table of Contents

1. [Current State](#current-state)
2. [Integration Checklist](#integration-checklist)
3. [Technical Details](#technical-details)
4. [Testing Strategy](#testing-strategy)
5. [Performance Targets](#performance-targets)
6. [Known Issues](#known-issues)

---

## Current State

### ✅ Implemented Components

#### 1. MultiMegaFlavor (`flavor/multi_mega_flavor.hpp`)
- **Interleaving**: BATCH_SIZE=4, k=2 (2 extra Gemini rounds)
- **Witness commitments**: 9 interleaved (down from 24)
  - W₁: [w_l, w_r, w_o, ZERO] - shiftable
  - W₂: [ecc_op_wire_1..4] - unshiftable
  - W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
  - W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
  - W₅: [return_data_read_tags, ZERO, ZERO, ZERO]
  - W₆: [w_4, ZERO, ZERO, ZERO] - shiftable
  - W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
  - W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
  - W₉: [z_perm, ZERO, ZERO, ZERO] - shiftable
- **Precomputed commitments**: 8 interleaved (down from 31)
  - S₁: [q_m, q_c, q_l, q_r]
  - S₂: [q_o, q_4, q_busread, q_lookup]
  - S₃: [q_arith, q_delta_range, q_elliptic, q_memory]
  - S₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, ZERO]
  - S₅: [sigma_1, sigma_2, sigma_3, sigma_4]
  - S₆: [id_1, id_2, id_3, id_4]
  - S₇: [table_1, table_2, table_3, table_4]
  - S₈: [lagrange_first, lagrange_last, lagrange_ecc_op, databus_id]
- **Total**: 17 commitments (down from 55) = **69% reduction**

#### 2. MultiMegaOinkProver (`ultra_honk/multi_mega_oink_prover.cpp`)
- Implements 4 commitment rounds with interleaving
- `commit_interleaved_and_send<NUM_POLYS>()`: Commits to batches of 1-4 polynomials
- Properly handles zero-padding for incomplete batches (e.g., W₅, W₆, W₉)
- Stores `InterleavedCommitments` for use by main prover

#### 3. MultiMegaProver (`ultra_honk/multi_mega_prover.cpp`)
- **Batching**: `compute_interleaved_batched_polynomials(rho)`
  - Batches polynomials by chunk position: G₀, G₁, G₂, G₃
  - Constructs: F(X) = G₀(X⁴) + X·G₁(X⁴) + X²·G₂(X⁴) + X³·G₃(X⁴)
  - Handles shifted polynomials with first 4 coefficients = 0
- **PCS**: Uses Shplemini with SHIFT_EXPONENT=4
  - Prepends interleaving challenges (u₀, u₁) to sumcheck challenges
  - Full challenge vector: (u₀, u₁, u₂, ..., u_{log_n+1})
- **Commitment key**: Initialized to 4n SRS size

#### 4. MultiMegaVerifier (`ultra_honk/multi_mega_verifier.cpp`)
- **Lagrange basis**: Computes L₀=(1-u₀)(1-u₁), L₁=u₀(1-u₁), L₂=(1-u₀)u₁, L₃=u₀u₁
- **Evaluation batching**: F(u) = Σⱼ fⱼ(u) · Lⱼ(u₀, u₁)
- Reconstructs batched evaluations for all 17 commitments from individual polynomial evaluations
- Handles 3 shiftable commitments (W₁, W₆, W₉) separately

#### 5. Infrastructure
- **CommitmentKey**: `commit_interleaved<BATCH_SIZE>()` method
- **Pippenger MSM**: `pippenger_interleaved()` in `scalar_multiplication.cpp`
  - ~10% speedup vs separate chunked MSMs (see multichonk.md §10)
  - On-the-fly interleaving, ~3% overhead vs pre-materialized polynomial
- **Shplemini**: Extended to support `SHIFT_EXPONENT` parameter for k-bit left shifts

#### 6. Tests
- `ultra_honk/multi_mega_honk.test.cpp`:
  - `ProverManifestConsistency`: Validates transcript structure
  - `VerifierManifestConsistency`: Validates prover/verifier agreement
- Both tests passing with expected transcript format (9 witness + 8 precomputed commitments)

---

### 🔧 In Progress / TODO

See [Integration Checklist](#integration-checklist) below.

---

## Integration Checklist

### Phase 1: Multi Mega Standalone (Completed ✅)

- [x] Implement MultiMegaFlavor with INTERLEAVING_BATCH_SIZE=4
- [x] Implement MultiMegaOinkProver with 9 interleaved witness commitments
- [x] Implement MultiMegaProver with batched polynomial construction
- [x] Implement MultiMegaVerifier with Lagrange basis evaluation batching
- [x] Implement `pippenger_interleaved()` MSM
- [x] Extend Shplemini for SHIFT_EXPONENT parameter
- [x] Basic prover/verifier consistency tests

### Phase 2: Verification Key Integration (CRITICAL)

- [ ] **Verify NativeVerificationKey_ construction**
  - File: `flavor/flavor.hpp:173`
  - Confirm it creates 8 interleaved precomputed commitments when INTERLEAVING_BATCH_SIZE=4
  - Verify batching follows S₁-S₈ layout from multichonk.md
  - Check VK hash computation includes interleaved commitments
- [ ] **Test VK serialization/deserialization**
  - Verify VK can be serialized and deserialized correctly
  - Check compatibility with existing VK infrastructure

### Phase 3: Chonk/IVC Integration (CRITICAL)

#### 3.1 Chonk Flavor Update
- [ ] **Update Chonk to use MultiMegaFlavor**
  - File: `chonk/chonk.hpp:42`
  - Change: `using Flavor = MegaFlavor;` → `using Flavor = MultiMegaFlavor;`
  - Update all dependent type aliases
  - Verify MegaZKFlavor compatibility (or create MultiMegaZKFlavor if needed)

#### 3.2 Decider Prover Update
- [ ] **Replace UltraProver with MultiMegaProver**
  - File: `chonk/chonk.hpp:55`
  - Change: `using MegaProver = UltraProver_<Flavor>;` → `using MegaProver = MultiMegaProver;`
  - Update DeciderProver to use MultiMegaProver
  - File: `hypernova/hypernova_decider_prover.hpp`

#### 3.3 HyperNova Folding Updates
- [ ] **Update folding for degree-4n polynomials**
  - Files:
    - `hypernova/hypernova_prover.hpp`
    - `hypernova/hypernova_verifier.hpp`
  - ProverAccumulator must store degree-4n polynomials
  - Update `fold()` to handle INTERLEAVING_BATCH_SIZE
  - Update batching sumcheck to handle interleaved structure
    - Current: O(6n) for 6 columns
    - With interleaving: O(24n) for 24 "virtual" columns
  - Ensure commitment batching respects interleaving structure

#### 3.4 Recursive Folding Verifier
- [ ] **Update RecursiveFoldingVerifier**
  - Need to handle interleaved commitments in circuit
  - Update commitment reconstruction logic
  - Verify Lagrange basis computation in circuit

### Phase 4: ECCVM Consistency (HIGH PRIORITY)

- [ ] **ECCVM interface validation**
  - File: `goblin/goblin.hpp`
  - Verify ECC operation wires (W₂) are correctly propagated from Mega → ECCVM
  - W₂ commitment: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
  - Ensure ECCVM receives correct interleaved commitment
  - Test with mock circuits containing ECC operations

### Phase 5: Proof Length & Constants (HIGH PRIORITY)

- [ ] **Update C++ proof length**
  - File: `honk/proof_length.hpp`
  - Update for 17 commitments (8 precomputed + 9 witness)
  - Update for log(n) + 2 Gemini rounds
  - Update `RECURSIVE_PROOF_LENGTH` constant

- [ ] **Update Noir constants**
  - File: `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`
  - Update `RECURSIVE_PROOF_LENGTH`
  - Update `CHONK_PROOF_LENGTH`
  - Update `PAIRING_POINTS_SIZE` if changed

- [ ] **Regenerate TypeScript constants**
  ```bash
  cd yarn-project/constants
  yarn remake-constants
  ```

- [ ] **Update static asserts**
  - File: `dsl/acir_format/mock_verifier_inputs.test.cpp`
  - Update proof size assertions to match new lengths

### Phase 6: Testing (MEDIUM PRIORITY)

#### 6.1 Unit Tests
- [ ] **VK construction test**
  - Verify 8 interleaved precomputed commitments are created
  - Verify VK hash is stable
  - Verify VK comparison works

- [ ] **Folding test with interleaving**
  - Test HyperNova fold with MultiMega instances
  - Verify accumulator polynomials are degree-4n
  - Verify folding produces valid accumulator

#### 6.2 Integration Tests
- [ ] **Update IVC integration tests**
  ```bash
  yarn-project/scripts/run_test.sh ivc-integration/src/native_chonk_integration.test.ts
  ```
  - Update to use MultiMegaFlavor
  - Verify full IVC accumulation works
  - Test with multiple app/kernel circuits

- [ ] **VK consistency test**
  ```bash
  cd barretenberg/cpp/scripts
  ./test_chonk_standalone_vks_havent_changed.sh
  ```
  - Expected: VKs will change (due to interleaved commitments)
  - Validate changes are correct
  - Update pinned VKs:
    ```bash
    ./test_chonk_standalone_vks_havent_changed.sh --update_inputs
    ```

- [ ] **WASM Chonk test**
  ```bash
  yarn-project/scripts/run_test.sh ivc-integration/src/wasm_chonk_integration.test.ts
  ```

- [ ] **Browser Chonk test**
  ```bash
  yarn-project/scripts/run_test.sh ivc-integration/src/browser_chonk_integration.test.ts
  ```

#### 6.3 End-to-End Tests
- [ ] **Rollup IVC test**
  ```bash
  BB_VERBOSE=1 yarn-project/scripts/run_test.sh ivc-integration/src/rollup_ivc_integration.test.ts
  ```

- [ ] **Full prover test**
  ```bash
  yarn-project/end-to-end/scripts/run_test.sh simple e2e_prover/full
  ```
  - Note: Requires full build (AVM enabled)
  - Only run if explicitly requested by user

### Phase 7: Performance Validation (MEDIUM PRIORITY)

- [ ] **ECCVM proving time**
  ```bash
  cd barretenberg/cpp
  ./scripts/benchmark_remote.sh eccvm_tests
  ```
  - Expected: ~42% faster (1.73× speedup) vs current
  - Baseline: 1284 ms @ 2^15, 742 ms @ 2^14

- [ ] **Full IVC proof time**
  - Measure end-to-end Chonk proof with MultiMega
  - Compare against baseline MegaFlavor
  - Expected: ~44 fewer ECCVM ops per fold (62 → ~18)

- [ ] **MSM performance**
  - Verify interleaved MSM speedup (~10% vs chunked)
  - Run pippenger benchmarks:
    ```bash
    ./scripts/benchmark_remote.sh pippenger_bench
    ```

- [ ] **Proof size validation**
  - Measure actual proof sizes
  - Expected: ~25 KB smaller (1500 FEs → ~684 FEs)
  - Note: Largest savings come from future Translator elimination

- [ ] **Memory usage**
  - SRS: Should be 128 MB for 2^19 circuits (4× increase, acceptable)
  - Working memory: Should remain ~constant (Pippenger scratch reused 4×)

---

## Technical Details

### Polynomial Interleaving

**Univariate interpretation**:
```
F(X) = f₀(X⁴) + X·f₁(X⁴) + X²·f₂(X⁴) + X³·f₃(X⁴)
```

**Coefficient interleaving**: Coefficient at index 4i+j comes from f_j[i]

**Shifted polynomials**: For shiftable groups (W₁, W₆, W₉), f_j(0) = 0 for all j, so F is 4-left-shiftable.

### Batching Strategy

**Prover** (Multi Mega Prover):
1. Batch by chunk position: G_j = Σᵢ ρⁱ·f_{i,j} for j ∈ {0,1,2,3}
2. Interleave: F[4i+j] = G_j[i]
3. Run Shplemini with full_challenge = (u₀, u₁, u₂, ..., u_{log_n+1})

**Verifier** (Multi Mega Verifier):
1. Receive individual polynomial evaluations from sumcheck
2. Compute Lagrange basis: L_j(u₀, u₁)
3. Batch evaluations: F(u) = Σⱼ f_j(u) · L_j(u₀, u₁)

### Challenge Ordering (CRITICAL)

**Must match between prover and verifier**:
1. Sumcheck: Derive (u₂, ..., u_{log_n+1}) — claims f_i(u₂, ..., u_{log_n+1})
2. Interleaving: Derive (u₀, u₁) — for Lagrange basis
3. Gemini: Derive ρ (rho) — for polynomial batching
4. Gemini: Standard log(n)+2 rounds with (u₀, u₁, u₂, ..., u_{log_n+1})

### SRS Requirements

**Size**: 4n (4× increase due to interleaving)
- For 2^19 circuits: 32 MB → 128 MB (acceptable)
- For 2^20 circuits: 64 MB → 256 MB (acceptable)

**Context**: Peak memory during sumcheck is already ≥1 GB for 2^20 circuits, so +192 MB for SRS is negligible.

### Folding with Interleaving

**Accumulator polynomials**: Degree-4n instead of n
- Folding operations must handle 4× size
- Memory: Accumulator holds 4n-sized polynomials
- Batching sumcheck: O(6n) → O(24n) work (4× increase)

**Trade-off**: 4× batching sumcheck work for ~44 fewer ECCVM ops/fold (net win)

---

## Testing Strategy

### Level 1: Unit Tests (Fast, Local)
- MultiMega prover/verifier consistency
- VK construction and hashing
- Commitment interleaving correctness
- Lagrange basis computation

### Level 2: Integration Tests (Medium, Local)
- Single fold with MultiMega
- Multiple folds accumulation
- IVC with MultiMega flavor

### Level 3: End-to-End Tests (Slow, CI)
- Full rollup with MultiMega
- Full prover test
- Cross-compilation (WASM, browser)

### Level 4: Performance Tests (Remote Machine)
- ECCVM proving time
- Full IVC proof time
- MSM benchmarks
- Proof size measurement

---

## Performance Targets

### From multichonk.md Benchmarks

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Commitments/circuit | 55 | 15 | 72% reduction |
| ECCVM ops/fold | 62 | ~18 | 71% reduction |
| SRS size (2^19) | 32 MB | 128 MB | 4× increase |
| Batching sumcheck | O(6n) | O(24n) | 4× increase |
| Gemini rounds | log(n) | log(n)+2 | +2 rounds |
| MSM time (2^19) | 1040 ms | 932 ms | 10% faster |
| Proof size | 1500 FEs | ~684 FEs | 54% smaller |

### Acceptable Trade-offs

**Increased**:
- SRS memory: 4× (acceptable, still small vs total memory)
- Batching sumcheck: 4× (acceptable, offset by ECCVM savings)
- Gemini rounds: +2 (acceptable, paid once at end)

**Decreased**:
- ECCVM ops: ~71% (major win)
- Commitments: 72% (major win)
- MSM time: 10% (bonus)
- Proof size: 54% (bonus, mostly from future Translator elimination)

---

## Known Issues

### Issue 1: Repeated Commitments Deduplication
**Status**: Disabled for MultiMega
**Location**: `multi_mega_flavor.hpp:209`
```cpp
static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData();
```

**Reason**: Shifted commitments are at non-contiguous indices (8, 13, 16). Current `RepeatedCommitmentsData` assumes contiguous ranges.

**Impact**: MSM includes 3 shifted commitments separately (not deduplicated with unshifted). Minor performance penalty (~3 extra points in final MSM).

**TODO**: Extend `RepeatedCommitmentsData` to support non-contiguous ranges (low priority optimization).

### Issue 2: MegaZKFlavor Compatibility
**Status**: Unknown, needs investigation

**Question**: Does hiding kernel need a MultiMegaZKFlavor variant?

**Action**: Check if MegaZKFlavor (hiding kernel) needs interleaving update, or if it can continue using standard MegaZKFlavor.

### Issue 3: Translator Integration
**Status**: Future work (Phase 3 per multichonk.md)

**Current**: Translator proof separate (786 FEs)
**Future**: Hiding-translator circuit (~198K gates) eliminates separate proof

**Note**: Not blocking for initial MultiChonk integration.

---

## Open Questions (from multichonk.md §13)

1. **Merge → ECCVM consistency**: ✅ Should be straightforward, verify in testing
2. ~~**SRS constraints**~~: ✅ Resolved — 128 MB acceptable
3. **ZK masking**: For hiding kernel, needs investigation
4. **Variable batch sizes**: For inhomogeneous traces, future optimization
5. **Hiding-translator merge**: Phase 3 work, not blocking

---

## References

- **Theory**: `multichonk.md` — theoretical foundation, benchmarks, implementation details
- **Prover**: `ultra_honk/multi_mega_prover.cpp` — batched polynomial construction
- **Verifier**: `ultra_honk/multi_mega_verifier.cpp` — Lagrange basis evaluation batching
- **Flavor**: `flavor/multi_mega_flavor.hpp` — interleaving structure definition
- **Tests**: `ultra_honk/multi_mega_honk.test.cpp` — manifest consistency tests

---

## Version History

- **2024-XX-XX**: Initial document created
  - Multi Mega Prover implementation complete
  - Chonk/IVC integration pending
