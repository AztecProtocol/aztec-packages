# Chonk Audit Scope

## Audit Focus

> **Primary objective**: Verify **SOUNDNESS** of the system.
> - Verifier logic (native + recursive)
> - Cross-component consistency
> - Interface correctness between separately-audited components


---

## Separately Audited Components

| Component | Audit Status | Interface In Scope |
|-----------|-------------|-------------------|
| ECCVM | Separate | Yes |
| Translator | Separate | Yes |
| Sumcheck | Separate | Yes |
| PCS (KZG, IPA, Shplemini) | Separate | Yes |
| Transcript | Separate | Yes |
| Poseidon | Separate | Yes |
| BigGroup | Separate | Yes |
| BigField | **Completed** | — |
| Field (stdlib) | **Completed** | — |

---

## Critical Verifier Files

### Tier 1: Verifier Soundness

| File | Description |
|------|-------------|
| `hypernova/hypernova_verifier.cpp` | Folding verification |
| `hypernova/hypernova_decider_verifier.cpp` | Final accumulator verification |
| `multilinear_batching/multilinear_batching_verifier.cpp` | Claim batching |
| `goblin/merge_verifier.cpp` | Degree/concatenation checks |
| `goblin/goblin.cpp` | `Goblin::verify` orchestration |
| `relations/databus_lookup_relation.hpp` | Databus soundness |
| `relations/multilinear_batching/multilinear_batching_relation.hpp` | Claim Batching relations |

### Tier 2: Consistency Logic

| File | Description |
|------|-------------|
| `chonk/chonk.cpp` | `verify`, `complete_kernel_circuit_logic` |
| `chonk/private_execution_steps.cpp` | IVC entry point, `accumulate()` orchestration |

### Tier 3: Recursive Verifiers

| File | Description |
|------|-------------|
| `stdlib/chonk_verifier/` | Chonk in-circuit verifier |
| `stdlib/goblin_verifier/` | Goblin in-circuit verifier |

---

## Critical: Special Public Inputs

Public inputs propagate commitments and hashes between circuits - they are the **glue** binding Chonk's cross-circuit consistency.

| File | Key Structures |
|------|----------------|
| `stdlib/special_public_inputs/special_public_inputs.hpp` | `KernelIO`, `HidingKernelIO`, `empty_ecc_op_tables()` |

| Field | Security Role |
|-------|---------------|
| `output_hn_accum_hash` | Binds folded accumulator to next kernel |
| `ecc_op_tables` | Propagates [M_tail] for Merge chain |
| `kernel_return_data` / `calldata` | Databus cross-circuit consistency |

| Function | Why It Matters |
|----------|----------------|
| `empty_ecc_op_tables()` | Constrains initial T_prev to point at infinity |
| `reconstruct_from_public()` | Extracts verified commitments from previous kernel |

**If broken**: prover could substitute accumulators, inject malicious T_prev, or forge databus data

---

## Soundness Checklist

### 1. HyperNova Folding (`hypernova/`) ✅ VERIFIED

**Unit tests**: `hypernova_verifier.test.cpp` (50-round manifest pinning, tampering detection)

- [x] `instance_to_accumulator`: Sumcheck → `sumcheck_output_to_accumulator()` conversion
- [x] `verify_folding_proof`: Sumcheck + `MultilinearBatchingVerifier.verify_proof()` for accumulator combination
- [x] Batching challenges from transcript: `get_batching_challenges()` → `transcript->get_challenges<FF>()`
- [x] Shifted vs unshifted: Separate batching for `get_unshifted()` and `get_shifted()` evaluations/commitments

### 2. Multilinear Batching (`multilinear_batching/`) ✅ VERIFIED

**Unit tests**: `multilinear_batching_prover.test.cpp`, `multilinear_batching_relation_consistency.test.cpp`

- [x] `compute_new_claim`: Challenge from transcript, batches commitments + evaluations correctly
- [x] `check_eq_consistency`: Verifies `eq_accumulator == VerifierEqPolynomial::eval(acc_challenges, r)` and same for instance
- [x] `MultilinearBatchingAccumulatorRelationImpl::accumulate`: Tested via `AccumulateMatchesDirectComputation`
- [x] `MultilinearBatchingInstanceRelationImpl::accumulate`: Same, plus 5 skip logic edge cases

### 3. Merge Protocol (`goblin/merge_verifier.cpp`) ✅ VERIFIED

See `SECURITY_ANALYSIS.md` §4 and `goblin/MERGE_PROTOCOL.md` for full analysis.

- [x] `check_concatenation_identities`: $l_j + \kappa^\ell \cdot r_j = m_j$
- [x] `check_degree_identity`: Thakur degree bound (zero-padding security)
- [x] PREPEND vs APPEND mode: T_prev initialization + propagation via public inputs

### 4. Databus (`relations/databus_lookup_relation.hpp`) ✅ VERIFIED

**Unit tests**: `databus_lookup_relation_consistency.test.cpp`, `biggroup.test.cpp`

*Relation arithmetic*:
- [x] Lookup relation arithmetic matches reference implementation
- [x] `read_tags` boolean constraint enforced (tag² - tag = 0)
- [x] Inverse correctness: I × read_term × write_term - inverse_exists = 0
- [x] Mismatched read/write terms detected by lookup subrelation
- [x] Inactive gates (selectors = 0) produce zero subrelations

*Point comparison* (`incomplete_assert_equal` and native `==`):
- [x] Handles identical points, both-at-infinity, infinity flag mismatch
- [x] Native `==` correctly returns true for both-at-infinity (regardless of x,y)
- [x] Known limitation: `incomplete_assert_equal` fails if both at infinity with different coords (completeness, not soundness)

*Commitment propagation* (`DataBusDepot`):
- [x] K_{i-1}.return_data → K_i.calldata verified via `incomplete_assert_equal`
- [x] A_i.return_data → K_i.secondary_calldata verified via `incomplete_assert_equal`
- [x] Default commitment used when no genuine commitment exists

*Dynamic indexing security*:
- [x] Prover-side bounds check: `BB_ASSERT_LT(read_idx, bus_vector.size())` at `mega_circuit_builder.cpp:269`
- [x] Cryptographic enforcement: log-derivative lookup ensures read_term matches a write_term
- [x] Out-of-bounds reads fail: no write_term exists for invalid index, sum doesn't balance
- [x] Fiat-Shamir binding: β,γ derived after commitments, preventing collision pre-computation

### 5. Chonk Orchestration (`chonk/`) ✅ VERIFIED

**Unit tests**: `chonk.test.cpp` (tampering detection, databus failure, proof component swapping), `chonk_transcript_manifest.test.cpp`

- [x] QUEUE_TYPE state machine: `get_queue_type()` transitions based on `num_circuits_accumulated`
- [x] `complete_kernel_circuit_logic`: Switch on QUEUE_TYPE, handles init/tail/hiding kernel logic
- [x] Public input propagation: `T_prev_commitments` → `kernel_output.ecc_op_tables`
- [x] First circuit: `empty_ecc_op_tables()` initializes T_prev to infinity points (line 133)

---

## Interface Consistency

### Goblin Chain ✅ VERIFIED

See `SECURITY_ANALYSIS.md` §6.

- [x] `merged_table_commitments` passed from Merge to Translator (not re-read from proof)
- [x] `accumulated_result` computed by ECCVM verifier, not claimed by prover
- [x] Shared transcript across Merge → ECCVM → Translator
- [x] Recursive verifiers fix VK as constants via `fix_witness()`

### Transcript Boundaries ✅ VERIFIED

See `SECURITY_ANALYSIS.md` §1.

- [x] All prover messages bound before challenges derived (manifest structure verified)
- [x] Transcript isolation between circuits (unique_transcript_index)
- [x] Single shared transcript in verification (count = 4)
- [x] Public inputs bound to transcript (`oink_prover.cpp:70-72`, `oink_verifier.cpp:69-72`)

---

## VK Consistency

VK authenticity is enforced cryptographically, not at the input layer:
- **VK hash**: Computed and bound to transcript in Oink phase (`oink_verifier.cpp:56-63`)
- **VK tree membership**: Noir circuits verify VK is in authorized Merkle tree (`vk_data.nr:33-43`)

**Note**: `private_execution_steps.cpp` does not validate VK consistency at input time—this is intentional since it's enforced during verification.

---

## Known Limitations

| Issue | Location | Severity |
|-------|----------|----------|
| Complex QUEUE_TYPE state machine | `chonk.hpp` | Needs careful review |
| Point at infinity initialization | `empty_ecc_op_tables()` | Edge case |
| Decompression bomb potential | `private_execution_steps.cpp` | DoS (robustness) |
| No empty input validation | `private_execution_steps.cpp` | Robustness |

## ZK Properties (Lower Priority)

| Layer | Mechanism |
|-------|-----------|
| Hiding kernel | MegaZKFlavor (Libra + ZK Shplemini) |
| Op queue | 3 tail + 2 hiding random non-ops |
| Accumulated result | 1 valid random ECC op (128-bit) |

---

## Documentation

| Component | Location |
|-----------|----------|
| Chonk | `README.md` |
| Merge Protocol | `goblin/MERGE_PROTOCOL.md` |
| Security Analysis | `SECURITY_ANALYSIS.md` |
