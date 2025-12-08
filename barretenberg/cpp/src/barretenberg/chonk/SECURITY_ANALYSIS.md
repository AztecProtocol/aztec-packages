# Chonk Security Analysis

## Overview

This document analyzes potential security vulnerabilities in the Chonk (Client Honk) IVC scheme. Chonk combines HyperNova folding with Goblin (ECCVM + Translator) for efficient client-side proving.

## Architecture Summary

The Chonk flow consists of:
1. **App/Kernel Alternation**: Circuits accumulated in App₀ → Kernel₀ → App₁ → Kernel₁ → ... → Reset → Tail → Hiding
2. **HyperNova Folding**: Each circuit is folded into an accumulator via sumcheck
3. **Goblin**: Handles ECC operations via ECCVM and Translator, with Merge protocol for op queue management
4. **Decider**: Final PCS opening proof after all folding is complete

---

## Test Coverage Summary

### Transcript Manifest Pinning Tests ✅

The following tests pin transcript structure to detect accidental changes:

| Test Location | Test Name | What's Pinned |
|--------------|-----------|---------------|
| `hypernova_verifier.test.cpp` | `Fold` | 50-round HyperNova folding manifest (Oink + main sumcheck + MLB sumcheck) |
| `hypernova_decider_verifier.test.cpp` | `NoTampering` | 5-round decider manifest (rho, Gemini, Shplonk, KZG) |
| `translator.test.cpp` | `TranscriptPinned` | 43-round Translator manifest |
| `chonk_transcript_manifest.test.cpp` | `TranscriptCountDuringAccumulationPinned` | Exact transcript count during 2-app IVC (14 total) |
| `chonk_transcript_manifest.test.cpp` | `ChonkRecursiveVerifierTranscriptCountPinned` | Exact transcript count during recursive verification (4 total) |

### Databus Lookup Relation Tests ✅

Unit tests verifying `DatabusLookupRelation` arithmetic correctness:

| Test Location | Test Name | What's Verified |
|--------------|-----------|-----------------|
| `databus_lookup_relation_consistency.test.cpp` | `RandomInputs` | Optimized implementation matches reference implementation |
| `databus_lookup_relation_consistency.test.cpp` | `BooleanReadTagsPass` | read_tag ∈ {0,1} satisfies boolean constraint |
| `databus_lookup_relation_consistency.test.cpp` | `NonBooleanReadTagsFail` | Non-boolean read_tags produce non-zero subrelation |
| `databus_lookup_relation_consistency.test.cpp` | `InactiveGates` | All subrelations zero when selectors inactive |
| `databus_lookup_relation_consistency.test.cpp` | `ValidInverseComputation` | Correct inverse I = 1/(read_term × write_term) satisfies relation |
| `databus_lookup_relation_consistency.test.cpp` | `MismatchedReadWriteTerms` | Lookup subrelation catches value/index mismatches |

### Transcript Count Breakdown

**IVC Accumulation (2 apps, 7 circuits)**: `[0, 3, 0, 3, 3, 3, 2]` = 14 transcripts
- App circuits (0, 2): 0 - use native HN folding prover
- Non-hiding kernels (1, 3, 4, 5): 3 each - `accumulation_recursive_transcript`, `PairingPoints::aggregate_multiple`, `hash_transcript`
- Hiding kernel (6): 2 - no `hash_transcript` (doesn't propagate accumulator)

**Recursive Verification**: 4 transcripts
- 1: `chonk_rec_verifier_transcript` (shared across MegaVerifier and GoblinVerifier)
- 3: `PairingPoints::aggregate()` calls for Fiat-Shamir recursion separators

---

## Vulnerability Areas Analysis

### 1. Transcript/Fiat-Shamir Binding ✅ VERIFIED

**Status**: Covered by manifest pinning tests

**Location**: `chonk.cpp:225, 285, 308`

**What's Tested**:
- Exact transcript count during accumulation is pinned (14 transcripts)
- Exact transcript count during recursive verification is pinned (4 transcripts)
- HyperNova folding transcript structure pinned (50 rounds)
- HyperNova decider transcript structure pinned (5 rounds)
- Translator transcript structure pinned (43 rounds)

**Verified Properties**:
- [x] All prover messages bound to transcript before challenges derived (verified via manifest structure)
- [x] Transcript isolation between circuits (verified via unique_transcript_index)
- [x] Single shared transcript in verification (verified via count = 4)

**Remaining Review Points**:
- [ ] Verify public inputs are bound to transcript

---

### 2. Accumulator Hash Propagation (MEDIUM-HIGH RISK)

**Location**: `chonk.cpp:117, 186-188, 309-310`

**Mechanism**:
- Each kernel outputs `output_hn_accum_hash` (hash of HN verifier accumulator) as public input
- Next kernel reconstructs previous accumulator and compares hash against public input

**Code Flow**:
```cpp
// In kernel K_i, verify K_{i-1}'s accumulator hash matches what K_{i-1} output
prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging("", *accumulation_recursive_transcript);
kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);
```

**Review Points**:
- [ ] Verify all accumulator components are included in hash
- [ ] Check for hash collision resistance under adversarial inputs
- [ ] Ensure transcript state is properly bound before hashing

---

### 3. Databus Consistency Checks ✅ VERIFIED

**Status**: Relation arithmetic and commitment propagation verified

**Location**: `chonk.cpp:173-175, 539-540`, `relations/databus_lookup_relation.hpp`, `stdlib/primitives/databus/databus.hpp`

**Mechanism**:
- Kernels verify that `kernel_return_data` from previous kernel matches `calldata` commitment of current circuit
- Uses `incomplete_assert_equal()` for recursive (in-circuit) verification
- Uses native `==` operator for native verification
- `DatabusLookupRelation` enforces log-derivative lookup with 9 subrelations (3 per bus column)

**Commitment Propagation Flow**:
```
K_{i-1}.return_data → K_i.calldata        (verified via incomplete_assert_equal at line 173)
A_i.return_data     → K_i.secondary_calldata  (verified via incomplete_assert_equal at line 174)
```
- `DataBusDepot` manages commitment state between circuits with set/get pattern and existence flags
- Default commitment (`G1 * DEFAULT_VALUE`) used when no genuine commitment exists

**What's Tested**:

*Relation arithmetic* (via `databus_lookup_relation_consistency.test.cpp`):
- [x] Relation arithmetic matches simple reference implementation
- [x] Boolean constraint on read_tags enforced (tag² - tag = 0)
- [x] Inverse correctness: I × read_term × write_term - inverse_exists = 0
- [x] Lookup subrelation detects value/index mismatches
- [x] Inactive gates produce zero subrelations

*Point comparison* (via `biggroup.test.cpp`):
- [x] `incomplete_assert_equal` handles identical points
- [x] `incomplete_assert_equal` handles both-at-infinity with same coords
- [x] `incomplete_assert_equal` detects different x coordinates
- [x] `incomplete_assert_equal` detects different y coordinates
- [x] `incomplete_assert_equal` detects infinity flag mismatch
- [x] Native `==` handles both-at-infinity (returns true regardless of x,y)
- [x] Native `==` handles one-at-infinity (returns false)

**Known Limitation** (completeness, not soundness):
- `incomplete_assert_equal` fails if both points are at infinity with different x,y coords
- Documented in `biggroup.hpp:265-267`: "not a problem in practice as we should never have multiple representations of the point at infinity in a circuit"

---

### 4. Merge Protocol and Table Commitment Linking ✅ PARTIALLY VERIFIED

**Location**: `chonk.cpp:204, 276-277, 527-534`, `goblin/MERGE_PROTOCOL.md`

**Mechanism**:
- ECC op table commitments (`t_commitments`) extracted from witness commitments
- `T_prev_commitments` passed between kernels via public inputs
- Merge verifier checks concatenation: T_new = T_prev || t (PREPEND) or T_prev || t (APPEND)
- APPEND mode used for hiding kernel to place random ops at table boundaries

**Constant shift_size for ZK** (verified via assertion in `chonk.cpp:531-534`):
- [x] Hiding kernel must have constant ultra ops count (`CONST_HIDING_KERNEL_ULTRA_OPS = 124` in `constants.hpp`)
- [x] `shift_size = (OP_QUEUE_SIZE - hiding_subtable_size) * NUM_ROWS_PER_OP` is constant
- [x] Assertion added: `BB_ASSERT_EQ(hiding_kernel_ultra_ops, CONST_HIDING_KERNEL_ULTRA_OPS, ...)`
- [x] Degree check ensures L polynomial is zero-padded up to shift_size

**Padding enforced to be zero**:
- [x] Merge degree check: `deg(L) < shift_size` via Thakur degree bound protocol
- [x] Translator zero constraints: `TranslatorZeroConstraintsRelation` enforces zeros outside minicircuit

**Review Points**:
- [ ] Verify initial T_prev cannot be manipulated
- [ ] Check that T_prev from public inputs cannot be forged

---

### 5. HyperNova Decider PCS Verification ✅ PARTIALLY VERIFIED

**Status**: Transcript structure verified

**Location**: `hypernova_decider_verifier.cpp:12-43`

**What's Tested**:
- Decider manifest pinned (5 rounds: rho, Gemini FOLDs, Gemini evals, Shplonk:Q, KZG:W)
- Tampering tests verify detection of modified accumulator/instance

**Remaining Review Points**:
- [ ] Verify batching challenges are derived correctly from transcript
- [ ] Check that all accumulated evaluations are properly bound

---

### 6. ZK Hiding Operations ✅ PARTIALLY VERIFIED

**Location**: `chonk.cpp:461-490`, `goblin/MERGE_PROTOCOL.md` (ZK Considerations)

**Mechanism**:
- `hide_op_queue_accumulation_result()`: Random mul+eq to hide translator accumulated_result
- `hide_op_queue_content_in_tail()`: 3 random ops at beginning of op queue
- `hide_op_queue_content_in_hiding()`: 2 random ops at end of op queue

**ZK Analysis** (from MERGE_PROTOCOL.md):
- [x] 6 random ops total: 3 at start (tail), 2 at end (hiding), 1 valid ECC op (accumulator)
- [x] Each UltraOp = 2 rows × 4 wires → 10 random coefficients per Mⱼ polynomial
- [x] Total: 40 random coefficients across 4 wire polynomials
- [x] Observables: ≤28 values (commitments + evaluations), rank 32 matrix → simulator exists
- [x] Constant shift_size in APPEND mode (verified via assertion) prevents size leakage

**Review Points**:
- [ ] Verify randomness source for hiding ops
- [ ] Check that random op values cannot be extracted from proof

---

### 7. Goblin Verification Chain (HIGH RISK)

**Location**: `goblin.cpp:107-145`

**Verification Order**:
1. Merge verification (checks table concatenation)
2. ECCVM verification (checks ECC operation correctness)
3. Translator verification (links ECCVM to BN254 curve)

**Critical Data Flow**:
```cpp
// Merge verifier outputs merged table commitments
auto [merge_pairing_points, merged_table_commitments, ...] = merge_verifier.verify_proof(...);

// ECCVM verifier extracts translator input
TranslatorInputData translator_input = eccvm_verifier.get_translator_input_data();

// Translator verifier uses both
bool translator_verified = translator_verifier.verify_proof(
    proof.translator_proof,
    translator_input.evaluation_challenge_x,
    translator_input.batching_challenge_v,
    translator_input.accumulated_result,
    merged_table_commitments);  // <-- Links merge to translator
```

**Review Points**:
- [ ] Verify merged_table_commitments are correctly passed to Translator
- [ ] Check accumulated_result consistency between ECCVM and Translator
- [ ] Ensure translation verification is complete

---

## Summary of Risk Levels

| Component | Risk Level | Status | Key Concern |
|-----------|------------|--------|-------------|
| Transcript Binding | Medium-High | ✅ VERIFIED | Structure pinned, count pinned |
| Accumulator Hash | Medium-High | ⚠️ NEEDS REVIEW | Hash completeness, collision resistance |
| Databus Consistency | Medium | ✅ VERIFIED | Relation + point comparison tested |
| Merge Table Linking | High | ✅ PARTIALLY | Constant ℓ asserted, T_prev forgery needs review |
| Decider PCS | Medium | ✅ PARTIALLY | Manifest pinned |
| ZK Hiding | Low-Medium | ✅ PARTIALLY | Constant ℓ verified, randomness source needs review |
| Goblin Chain | High | ⚠️ NEEDS REVIEW | Cross-component data integrity |

---

## Deep Dive: Critical Linking Points

### Goblin Chain Data Flow Analysis

The Goblin verification chain has three critical linking points where data must be consistent:

#### Link 1: Merge → Translator (merged_table_commitments)

**Data Flow**:
```
merge_verifier.verify_proof(merge_proof, {t_commitments, T_prev_commitments})
    └── Returns: merged_table_commitments[4] = [M_0, M_1, M_2, M_3]
            │
            ▼
translator_verifier.verify_proof(..., merged_table_commitments)
    └── Sets: commitments.op = merged_table_commitments[0]
              commitments.x_lo_y_hi = merged_table_commitments[1]
              commitments.x_hi_z_1 = merged_table_commitments[2]
              commitments.y_lo_z_2 = merged_table_commitments[3]
```

**Security Property**: The Translator uses the SAME commitments that Merge verified.
These commitments are NOT re-read from the Translator proof - they're passed directly.

**Mitigation**: In both native and recursive verification, `merged_table_commitments` is
returned from Merge verifier and immediately passed to Translator verifier within the
same function call. No opportunity for interception.

#### Link 2: ECCVM → Translator (accumulated_result)

**Data Flow**:
```
eccvm_verifier.verify_proof()
    └── Computes: accumulated_result = (op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term) / x
    └── Returns: opening_claim (for IPA verification)
            │
            ▼
eccvm_verifier.get_translator_input_data()
    └── Returns: TranslatorInputData {
            evaluation_challenge_x,
            batching_challenge_v,
            accumulated_result  // <-- Critical value
        }
            │
            ▼
translator_verifier.verify_proof(..., accumulated_result, ...)
    └── Uses: relation_parameters.accumulated_result = compute_four_limbs(accumulated_result)
```

**Binding Mechanism**: The shared transcript between ECCVM and Translator ensures:
- evaluation_challenge_x is bound to ECCVM transcript state
- batching_challenge_v is bound to ECCVM transcript state
- These challenges are then used in Translator verification

#### Link 3: Merge inputs (t_commitments, T_prev_commitments)

**Security Property**: The chain integrity depends on:
1. Initial T_prev being fixed (point at infinity)
2. Each T_prev being the output of the previous Merge
3. t_commitments coming from verified witness commitments

### Multilinear Batching eq Polynomial Check

**Location**: `multilinear_batching_verifier.cpp:166-183`

**Purpose**: Ensures the prover used the correct eq polynomials when batching
the accumulator and instance claims.

---

## Recommendations

1. ~~Formal specification needed for transcript state machine~~ → Transcript structure now pinned via tests
2. **Edge case testing** for databus with infinity points
3. **Invariant checks** for T_prev initialization and propagation
4. ~~Transcript audit to verify all messages bound before challenges~~ → Manifest pinning ensures structure
5. **End-to-end fuzzing** with adversarial proofs targeting linking points

---

## Files Reviewed

- `chonk/chonk.cpp` - Main Chonk implementation (constant ℓ assertion added)
- `chonk/chonk.hpp` - Chonk types and declarations
- `chonk/chonk_transcript_manifest.test.cpp` - Transcript count pinning tests
- `hypernova/hypernova_verifier.cpp` - Folding verification
- `hypernova/hypernova_verifier.test.cpp` - Folding manifest pinning
- `hypernova/hypernova_decider_verifier.cpp` - Final PCS verification
- `hypernova/hypernova_decider_verifier.test.cpp` - Decider manifest pinning
- `translator_vm/translator.test.cpp` - Translator manifest pinning
- `goblin/goblin.cpp` - Goblin orchestration
- `goblin/merge_verifier.hpp` - Merge protocol
- `goblin/merge_prover.cpp` - Merge prover (APPEND mode fixed offset)
- `goblin/MERGE_PROTOCOL.md` - Merge protocol documentation (ZK analysis)
- `multilinear_batching/multilinear_batching_claims.hpp` - Accumulator claim structure
- `stdlib/special_public_inputs/special_public_inputs.hpp` - KernelIO structure
- `relations/databus_lookup_relation.hpp` - Databus lookup relation implementation
- `relations/databus_lookup_relation_consistency.test.cpp` - Databus relation unit tests
- `relations/translator_vm/translator_extra_relations_impl.hpp` - Translator zero constraints
- `op_queue/ecc_ops_table.hpp` - Ultra ops table (fixed append offset)
- `constants.hpp` - CONST_HIDING_KERNEL_ULTRA_OPS (source of truth for hiding kernel ultra ops)
- `dsl/acir_format/gate_count_constants.hpp` - Re-exports CONST_HIDING_KERNEL_ULTRA_OPS for DSL

---

*Analysis conducted: 2025-12-04*
*Transcript pinning tests added: 2025-12-05*
*Databus relation unit tests added: 2025-12-08*
*CONST_HIDING_KERNEL_ULTRA_OPS global constant added: 2025-12-08*
