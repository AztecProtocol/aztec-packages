# Chonk Security Analysis

This document analyzes security properties of the Chonk IVC scheme.
See `README.md` for architecture overview.

---

## Test Coverage

### Transcript Pinning ✅

| Component | Test | Rounds/Count |
|-----------|------|--------------|
| HyperNova folding | `hypernova_verifier.test.cpp:Fold` | 50 rounds |
| HyperNova decider | `hypernova_decider_verifier.test.cpp:NoTampering` | 5 rounds |
| Translator | `translator.test.cpp:TranscriptPinned` | 43 rounds |
| IVC accumulation | `chonk_transcript_manifest.test.cpp` | 14 transcripts |
| Recursive verification | `chonk_transcript_manifest.test.cpp` | 4 transcripts |

### Databus Relation ✅

Tests in `databus_lookup_relation_consistency.test.cpp` verify: relation arithmetic, boolean constraints, inverse computation, and mismatch detection.

---

# Part 1: Soundness

## 1. Transcript/Fiat-Shamir Binding ✅ VERIFIED

**Location**: `chonk.cpp:225, 285, 308`

**Verified Properties**:
- [x] All prover messages bound to transcript before challenges derived (verified via manifest structure)
- [x] Transcript isolation between circuits (verified via unique_transcript_index)
- [x] Single shared transcript in verification (verified via count = 4)
- [x] Public inputs bound to transcript (`oink_prover.cpp:70-72`, `oink_verifier.cpp:69-72`)

---

## 2. Accumulator Hash Propagation ✅ VERIFIED

**Location**: `chonk.cpp:117, 186-188`, `multilinear_batching/multilinear_batching_claims.hpp:68-98`

**Mechanism**: Each kernel outputs `output_hn_accum_hash` as public input. Next kernel computes hash of its input accumulator and compares.

**Verified Properties**:
- [x] All accumulator components included in hash: challenge vector, evaluations (shifted/unshifted), commitments (shifted/unshifted)
- [x] Hash collision resistance: Poseidon2 (audited separately)
- [x] Origin tagging: Values tagged with transcript context before hashing

**Security**: The accumulator is computed by the verifier during folding (not read from proof). The hash binds this verifier-computed accumulator to public inputs.

---

## 3. Databus Consistency ✅ VERIFIED

**Location**: `chonk.cpp:173-175`, `relations/databus_lookup_relation.hpp`

**Mechanism**: Kernels verify `kernel_return_data` from previous kernel matches `calldata` commitment via `incomplete_assert_equal()`.

**Verified Properties**:
- [x] Relation arithmetic matches reference implementation
- [x] Boolean constraint on read_tags enforced
- [x] Lookup subrelation detects value/index mismatches
- [x] Point comparison handles infinity cases correctly

**Known Limitation** (completeness, not soundness): `incomplete_assert_equal` fails if both points at infinity with different coords.

---

## 4. Merge Protocol Soundness ✅ VERIFIED

**Location**: `chonk.cpp:204, 276-277`, `goblin/MERGE_PROTOCOL.md`

**Mechanism**: Merge verifier checks concatenation identity and degree bounds.

**Verified Properties**:
- [x] Initial T_prev constrained to point at infinity via `fix_witness`
- [x] T_prev propagation via public inputs between kernels
- [x] Degree check ensures polynomial is zero-padded

**Zero padding security**: See `README.md` [Appendix: Zero Padding Security]. Key guarantees:
1. Cumulative PREPEND degree checks bound $[M_{tail}]$ degree
2. Public input chain ensures correct $[M_{tail}]$ reaches final APPEND merge
3. Final degree check proves padding is zero

---

## 5. HyperNova Decider PCS ✅ VERIFIED

**Location**: `hypernova_decider_verifier.cpp:12-43`, `shplemini.hpp:231-288`, `gemini_impl.hpp:63-65`

**Verified Properties**:
- [x] Decider manifest pinned (5 rounds)
- [x] Tampering tests verify detection of modified accumulator
- [x] Batching challenges derived from transcript via Fiat-Shamir:
  - `rho` (Gemini batching) at `gemini_impl.hpp:63`, `shplemini.hpp:231`
  - `Gemini:r` (evaluation point) at `shplemini.hpp:238`
  - `Shplonk:nu` (Shplonk batching) at `shplemini.hpp:274`
  - `Shplonk:z` (opening point) at `shplemini.hpp:288`
- [x] Accumulated evaluations computed by verifier during folding (not claimed by prover), then verified by PCS
- [x] **Edge case (1 unshifted, 1 shifted claim)**: ρ properly separates claims
  - Prover: `A₀ = non_shifted × ρ⁰ + shifted.shifted() × ρ¹` (`gemini.hpp:188-197`)
  - Verifier: `batched_eval = non_shifted_eval × ρ⁰ + shifted_eval × ρ¹` (`claim_batcher.hpp:157-164`)
  - ρ derived before fold commitments sent, so prover cannot manipulate

---

## 6. Goblin Verification Chain ✅ VERIFIED

**Location**: `goblin.cpp:108-146`, `stdlib/goblin_verifier/goblin_recursive_verifier.cpp`

**Verification Order**: Merge → ECCVM → Translator

**Verified Properties**:
- [x] `merged_table_commitments` passed directly from Merge to Translator (not re-read from proof)
- [x] `accumulated_result` computed by ECCVM verifier, not claimed by prover
- [x] Single shared transcript binds all Fiat-Shamir challenges
- [x] Recursive verifiers fix VK as constants via `fix_witness()`

---

## Soundness Summary

| Component | Status | Key Property |
|-----------|--------|--------------|
| Transcript Binding | ✅ VERIFIED | Structure pinned, public inputs bound |
| Accumulator Hash | ✅ VERIFIED | All components hashed with origin tagging |
| Databus Consistency | ✅ VERIFIED | Relation arithmetic + point comparison tested |
| Merge Soundness | ✅ VERIFIED | Degree checks + T_prev initialization constrained |
| Decider PCS | ✅ VERIFIED | Challenges from transcript, evaluations verifier-computed |
| Goblin Chain | ✅ VERIFIED | Direct commitment passing, shared transcript |

---

# Part 2: Zero-Knowledge

## 1. Merge Protocol ZK ✅ VERIFIED

**Location**: `chonk.cpp:461-490`, `goblin/MERGE_PROTOCOL.md`

**Mechanism**:
- `hide_op_queue_accumulation_result()`: Random mul+eq to hide translator accumulated_result
- `hide_op_queue_content_in_tail()`: 3 random ops at beginning
- `hide_op_queue_content_in_hiding()`: 2 random ops at end

**Verified Properties**:
- [x] 6 random ops total → 40 random coefficients across 4 wire polynomials
- [x] Observables: ≤28 values → rank 32 matrix → simulator exists
- [x] Constant shift_size in APPEND mode prevents size leakage
- [x] Randomness from CSPRNG (`getrandom()` / `getentropy()`)

---

## 2. ZK Sumcheck (Libra) ⚠️ NEEDS SIMULATOR

**Location**: `sumcheck/Sumcheck.md`, `sumcheck/zk_sumcheck_data.hpp`

**Mechanism**: Libra masking adds polynomial G(x) × ρ to hide F(x) evaluations.

**Flavors with ZK**:
- `MegaZKFlavor::HasZK = true` (hiding kernel)
- `TranslatorFlavor::HasZK = true`
- `ECCVMFlavor::HasZK = true` (uses committed sumcheck)

**Remaining**:
- [ ] Formal ZK simulator for MegaZK
- [ ] Formal ZK simulator for Translator
- [ ] Formal ZK simulator for ECCVM

---

## ZK Summary

| Component | Status | Key Property |
|-----------|--------|--------------|
| Merge Protocol ZK | ✅ VERIFIED | Simulator exists, constant size |
| MegaZK (hiding kernel) | ⚠️ NEEDS SIMULATOR | Libra masking enabled |
| Translator ZK | ⚠️ NEEDS SIMULATOR | Libra masking enabled |
| ECCVM ZK | ⚠️ NEEDS SIMULATOR | Committed sumcheck + Libra |

---

## Recommendations

**Soundness** (all core properties verified):
1. Edge case testing for databus with infinity points
2. End-to-end fuzzing with adversarial proofs

**ZK** (needs formal analysis):
3. Formal ZK simulators for MegaZK, Translator, and ECCVM proof systems

---

## Key Files

| Area | Files |
|------|-------|
| Chonk | `chonk.cpp`, `chonk.hpp`, `chonk_transcript_manifest.test.cpp` |
| HyperNova | `hypernova_verifier.cpp`, `hypernova_decider_verifier.cpp` |
| Goblin | `goblin.cpp`, `merge_verifier.hpp`, `MERGE_PROTOCOL.md` |
| Databus | `databus_lookup_relation.hpp`, `databus_lookup_relation_consistency.test.cpp` |
| Recursive | `stdlib/goblin_verifier/`, `stdlib/translator_vm_verifier/` |

---

*Last updated: 2025-12-09*
