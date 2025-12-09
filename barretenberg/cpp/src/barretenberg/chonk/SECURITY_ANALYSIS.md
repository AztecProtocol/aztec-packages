# Chonk Security Analysis

This document analyzes security properties and potential vulnerabilities in the Chonk IVC scheme.
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

### 2. Accumulator Hash Propagation ✅ VERIFIED

**Location**: `chonk.cpp:117, 186-188, 309-310`, `multilinear_batching/multilinear_batching_claims.hpp:68-98`

**Mechanism**:
- Each kernel outputs `output_hn_accum_hash` (hash of HN verifier accumulator) as public input
- Next kernel computes hash of its input accumulator and compares against public input from previous kernel

**Code Flow**:
```cpp
// In kernel K_i, verify K_{i-1}'s accumulator hash matches what K_{i-1} output
prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging("", *accumulation_recursive_transcript);
kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);
```

**Verified Properties**:
- [x] **All accumulator components included in hash** (`multilinear_batching_claims.hpp:82-91`):
  - `challenge` vector (evaluation point r = (r₀, r₁, ..., rₙ₋₁))
  - `non_shifted_evaluation` (claimed evaluation v_unshifted)
  - `shifted_evaluation` (claimed shifted evaluation v_shifted)
  - `non_shifted_commitment` ([p_unshifted])
  - `shifted_commitment` ([p_shifted])
  - These are ALL members of `MultilinearBatchingVerifierClaim`
- [x] **Hash collision resistance**: Uses Poseidon2 hash function (audited separately)
- [x] **Origin tagging**: Values tagged with transcript context before hashing
  - In DEBUG builds: Tags track value provenance (transcript_index, round_index)
  - Prevents cross-transcript mixing attacks

**Hash Implementation** (`multilinear_batching_claims.hpp:68-98`):
```cpp
FF hash_with_origin_tagging(...) const {
    for (const auto& element : challenge) { append_tagged(element); }
    append_tagged(non_shifted_evaluation);
    append_tagged(shifted_evaluation);
    append_tagged(non_shifted_commitment);
    append_tagged(shifted_commitment);
    return T::HashFunction::hash(claim_elements);
}
```

**Security**: The accumulator is computed by the verifier during folding verification (not read from proof). The hash binds this verifier-computed accumulator to public inputs, ensuring chain consistency.

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

**Padding enforced to be zero** (verifier checks):
- [x] Degree checks + Public inputs mechanism
**Initial T_prev constrained to point at infinity** (verified via code analysis):
- [x] For OINK (first app): `T_prev_commitments = empty_ecc_op_tables(circuit)` (`chonk.cpp:133`)
- [x] `empty_ecc_op_tables()` creates points at infinity using `ctx->zero_idx()` (`special_public_inputs.hpp:36-44`)
- [x] `zero_idx()` references the circuit's fixed zero witness, constrained via `fix_witness` during construction
- [x] `put_constant_variable(FF::zero())` creates the zero witness and calls `fix_witness(idx, 0)` (`ultra_circuit_builder.cpp:482`)
- [x] Infinity flag set to constant `true` (native bool, not a witness)
- [x] Prover cannot manipulate initial T_prev without breaking circuit constraints

**T_prev propagation between kernels**:
- [x] After first merge, `T_prev` comes from previous kernel's public inputs (`kernel_input.ecc_op_tables` at `chonk.cpp:179`)
- [x] Each kernel outputs merged commitments as public inputs for next kernel to consume

**Zero padding security**: See `README.md` [Appendix: Zero Padding Security] for the detailed M_tail lifecycle and soundness argument. Key guarantees:
1. Cumulative PREPEND degree checks throughout kernel chain bound $[M_{tail}]$ degree
2. Public input chain ensures correct $[M_{tail}]$ reaches the final APPEND merge
3. Final degree check proves padding is zero

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

### 6. Zero-Knowledge Properties ⚠️ PARTIALLY VERIFIED

**Overview**: Chonk ZK is achieved through multiple mechanisms across different proof systems:

| Component | ZK Mechanism | HasZK Flag | Status |
|-----------|--------------|------------|--------|
| Merge Protocol | Statistical hiding via random ops | N/A | ✅ VERIFIED |
| MegaZK (hiding kernel) | Libra masking + ZK sumcheck | `true` | ⚠️ NEEDS SIMULATOR |
| Translator | Libra masking + ZK sumcheck | `true` | ⚠️ NEEDS SIMULATOR |
| ECCVM | Committed sumcheck + Libra | `true` | ⚠️ NEEDS SIMULATOR |

---

#### 6.1 Merge Protocol ZK ✅ VERIFIED

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

**Randomness Source** ✅ VERIFIED (`numeric/random/engine.cpp:203-212`):
- [x] **Production**: `RandomEngine` uses `getrandom()` (Linux) or `getentropy()` (WASM)
- [x] **Debug mode** (`BBERG_DEBUG_LOG`): Uses `DebugEngine` with fixed seed (deterministic, for testing only)

---

#### 6.2 ZK Sumcheck (Libra) ⚠️ NEEDS SIMULATOR

**Location**: `sumcheck/Sumcheck.md`, `sumcheck/zk_sumcheck_data.hpp`

**Mechanism** (from Sumcheck.md):
- All ZK flavors use **Libra masking**: adds polynomial G(x) × ρ to hide F(x) evaluations
- **Row Disabling Polynomial**: cancels contribution of random witness padding rows
- Round univariates are masked: S'_{F,i} = S_{F,i} + ρ × libra_correction

**Flavor ZK Settings**:
- `MegaZKFlavor::HasZK = true` (hiding kernel)
- `TranslatorFlavor::HasZK = true`
- `ECCVMFlavor::HasZK = true`

**ECCVM Specific** (committed sumcheck):
- Round univariates are **committed** instead of sent in clear
- Reduces proof size (high individual degree = 22 vs 7 in Ultra)
- Commitments batched and verified via PCS

**Review Points**:
- [ ] Formal ZK simulator for MegaZK proof system
- [ ] Formal ZK simulator for Translator proof system
- [ ] Formal ZK simulator for ECCVM proof system
- [ ] Verify Libra masking provides statistical ZK

---

### 7. Goblin Verification Chain ✅ VERIFIED

**Location**:
- Native: `goblin.cpp:108-146`, `translator_vm/translator_verifier.cpp:60-168`, `eccvm/eccvm_verifier.cpp:244-257`
- Recursive: `stdlib/goblin_verifier/goblin_recursive_verifier.cpp`, `stdlib/translator_vm_verifier/translator_recursive_verifier.cpp`

**Verification Order** (same for native and recursive):
1. Merge verification (checks table concatenation)
2. ECCVM verification (checks ECC operation correctness)
3. Translator verification (links ECCVM to BN254 curve)

**Critical Data Flow** (shown for recursive verifier - `goblin_recursive_verifier.cpp:39-59`):
```cpp
// Merge verifier outputs merged table commitments
auto [merge_pairing_points, merged_table_commitments, ...] = merge_verifier.verify_proof(...);

// ECCVM verifier runs and extracts translator input
ECCVMRecursiveVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
auto opening_claim = eccvm_verifier.verify_proof();
auto translator_input = eccvm_verifier.get_translator_input_data();

// Translator verifier uses both
PairingPoints translator_pairing_points = translator_verifier.verify_proof(
    proof.translator_proof,
    translator_input.evaluation_challenge_x,
    translator_input.batching_challenge_v,
    translator_input.accumulated_result,
    merged_table_commitments);  // <-- Links merge to translator
```

**Verified Properties (Native + Recursive)**:

- [x] **merged_table_commitments correctly passed to Translator**:
  - Native: `goblin.cpp:135-139` and `translator_verifier.cpp:93-97`
  - Recursive: `goblin_recursive_verifier.cpp:59` and `translator_recursive_verifier.cpp:118-122`
  - Commitments are OUTPUT from Merge verifier, directly passed to Translator verifier
  - NOT re-read from Translator proof - passed within same function call
  ```cpp
  // translator_recursive_verifier.cpp:118-122
  // Set op queue wire commitments (provided by merge protocol, not from translator proof)
  commitments.op = op_queue_wire_commitments[0];
  commitments.x_lo_y_hi = op_queue_wire_commitments[1];
  commitments.x_hi_z_1 = op_queue_wire_commitments[2];
  commitments.y_lo_z_2 = op_queue_wire_commitments[3];
  ```

- [x] **accumulated_result consistency** (`eccvm_verifier.cpp:244-257`):
  - Same logic for native (`ECCVMVerifier`) and recursive (`ECCVMRecursiveVerifier`) - both are `ECCVMVerifier_<Flavor>` template instantiations
  - ECCVM verifier computes: `accumulated_result = (op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term) / x`
  - Passed via `get_translator_input_data()` to Translator verifier
  - Translator uses it in relation parameters (`translator_recursive_verifier.cpp:108-113`)

- [x] **Shared transcript binding**:
  - Native: `goblin.cpp:113,118,130`
  - Recursive: `goblin_recursive_verifier.cpp:40,46,51` - same `transcript` shared
  - All three verifiers (Merge, ECCVM, Translator) use the SAME shared transcript
  - ECCVM challenges depend on Merge proof elements
  - Translator challenges depend on ECCVM proof elements

- [x] **Recursive verifier VK binding** (`translator_recursive_verifier.cpp:30-31`):
  - VK and VK hash are fixed as constants: `key->fix_witness()`, `vk_hash.fix_witness()`
  - Prevents prover from manipulating verification key

**Security**: The Goblin chain is secure (both native and recursive) because:
1. Commitments flow directly between verifiers (no re-reading from proofs)
2. `accumulated_result` computed by ECCVM verifier, not claimed by prover
3. Single shared transcript binds all Fiat-Shamir challenges
4. Recursive verifiers fix VK as constants

---

## Summary of Risk Levels

| Component | Risk Level | Status | Key Concern |
|-----------|------------|--------|-------------|
| Transcript Binding | Medium-High | ✅ VERIFIED | Structure pinned, count pinned |
| Accumulator Hash | Medium-High | ✅ VERIFIED | All components hashed, Poseidon2, origin tagging |
| Databus Consistency | Medium | ✅ VERIFIED | Relation + point comparison tested |
| Merge Table Linking | High | ✅ VERIFIED | Constant ℓ asserted, T_prev initialization constrained |
| Decider PCS | Medium | ✅ PARTIALLY | Manifest pinned |
| ZK Properties | Medium | ⚠️ PARTIALLY | Merge ZK verified; MegaZK/Translator/ECCVM need simulators |
| Goblin Chain | High | ✅ VERIFIED | Direct commitment passing, shared transcript |

---

## Recommendations

1. **Edge case testing** for databus with infinity points
2. **End-to-end fuzzing** with adversarial proofs targeting Goblin linking points
3. **ZK simulators** for MegaZK, Translator, and ECCVM proof systems

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
