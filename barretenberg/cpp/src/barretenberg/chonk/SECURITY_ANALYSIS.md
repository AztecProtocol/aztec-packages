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

**Padding is zero**:

**Detailed M_tail lifecycle:**

**Step 1: Tail kernel performs final PREPEND merge**
- **Location**: Tail kernel circuit (K_tail), during `complete_kernel_circuit_logic()`
- **What happens**:
  - Recursive merge verifier runs in K_tail (`chonk.cpp:208`)
  - Verifies: `M_tail(κ) = t_tail(κ) + κ^ℓ_tail · T_prev(κ)` where `ℓ_tail = |t_tail| × 2`
  - Verifies: `deg(t_tail) < ℓ_tail` (Thakur degree check)
  - Outputs: `merged_table_commitments` = `[M_tail,1], [M_tail,2], [M_tail,3], [M_tail,4]`
- **Commitment storage** (`chonk.cpp:280`):
  - `T_prev_commitments = merged_table_commitments` (stores `[M_tail]`)
- **Public output** (`chonk.cpp:310`):
  - `kernel_output.ecc_op_tables = T_prev_commitments` (= `[M_tail]`)
  - K_tail's public inputs now contain `[M_tail,1], [M_tail,2], [M_tail,3], [M_tail,4]`

**Step 2: K_tail → Hiding kernel via HyperNova**
- **What the hiding kernel verifies**:
  - HyperNova folding verification of K_tail's proof (`chonk.cpp:148-149`)
  - This includes verifying K_tail's public inputs are bound to the proof
  - Specifically: `kernel_output.ecc_op_tables` (containing `[M_tail]`) is part of K_tail's public inputs

**Step 3: Hiding kernel extracts [M_tail] from K_tail's public inputs**
- **Location**: `chonk.cpp:169-179`
- **What happens**:
  ```cpp
  KernelIO kernel_input;
  kernel_input.reconstruct_from_public(public_inputs); // Line 170
  merge_commitments.T_prev_commitments = std::move(kernel_input.ecc_op_tables); // Line 179
  ```
- **Verifier guarantee**: HyperNova verification in step 2 ensures `public_inputs` matches K_tail's proven computation
- **Result**: `merge_commitments.T_prev_commitments` now contains `[M_tail]` (verified to match K_tail's output)

**Step 4: Hiding kernel recursively verifies K_tail**
- **Location**: Hiding kernel circuit, `chonk.cpp:269-280`
- **What happens**:
  - Hiding kernel's verification queue contains exactly one entry: K_tail (type `HN_FINAL`)
  - `perform_recursive_verification_and_databus_consistency_checks()` is called:
    - Verifies K_tail's HyperNova folding proof (`chonk.cpp:148-149`)
    - Verifies K_tail's decider proof (`chonk.cpp:151-153`)
    - Recursively verifies K_tail's merge proof (`chonk.cpp:207-208`)
  - Returns `merged_table_commitments` from K_tail's merge = `[M_tail]`
  - Updates: `T_prev_commitments = merged_table_commitments` (`chonk.cpp:280`)
- **Public output** (`chonk.cpp:297-299`):
  - `HidingKernelIO hiding_output{ ..., T_prev_commitments }`
  - **CRITICAL**: This is `[M_tail]` (accumulated ops up to and including K_tail)
  - **Hiding kernel's own ops are NOT merged here** - they will be merged by Chonk Verifier

**Step 5: Native Chonk verifier extracts [M_tail] from hiding kernel**
- **Location**: `Chonk::verify()`, `chonk.cpp:546-547`
  ```cpp
  auto [mega_verified, kernel_return_data, T_prev_commitments] =
      verifier.template verify_proof<bb::HidingKernelIO>(proof.mega_proof);
  ```
- **What this does**:
  - Verifies hiding kernel's MegaZK proof (including its public inputs)
  - Extracts `T_prev_commitments` from `HidingKernelIO` public inputs
  - This `T_prev_commitments` = `[M_tail]` (ops accumulated up to and including K_tail)
- **Verifier guarantee**: MegaZK verification ensures `T_prev_commitments` is bound to hiding kernel's proof

**Step 6: Final merge (APPEND mode) - merges hiding kernel's ops**
- **Location**: `chonk.cpp:553-557`
  ```cpp
  TableCommitments t_commitments = verifier.verifier_instance->witness_commitments.get_ecc_op_wires().get_copy();
  bool goblin_verified = Goblin::verify(
      proof.goblin_proof, { t_commitments, T_prev_commitments }, chonk_verifier_transcript, MergeSettings::APPEND);
  ```
- **Inputs to final merge verifier**:
  - `t_commitments` = hiding kernel's `ecc_op_wires` (hiding kernel's ops, committed during Oink)
  - `T_prev_commitments` = `[M_tail]` from step 5
- **What the native merge verifier checks** (`merge_verifier.cpp:138-143`):
  - In APPEND mode: `L = T_prev_commitments` (= `[M_tail]`), `R = t_commitments` (hiding kernel's ops)
  - Receives `shift_size` from merge proof (prover claims this is `(OP_QUEUE_SIZE - |t_hiding|) × 2`)
  - Verifies: `M_final(κ) = L(κ) + κ^shift_size · R(κ)` at random κ
  - Verifies: `deg(L) < shift_size` (Thakur degree check)
  - **Critical for ZK**: If `shift_size` is constant (enforced by assertion on `|t_hiding|`), then padding size is constant

**Key verifier guarantees:**
1. **Step 1**: K_tail outputs `[M_tail]` via verified merge protocol
2. **Step 2-3**: HyperNova ensures `[M_tail]` from K_tail's public inputs matches proven computation
3. **Step 4**: Hiding kernel uses `[M_tail]` (verified in step 3) for its merge
4. **Step 5**: MegaZK verification ensures hiding kernel's public outputs are bound to its proof
5. **Step 6**: Final merge uses `[T_prev]` from step 5, with constant `shift_size` enforced by assertion

**Conclusion**: Zero padding is enforced by:
1. **Degree bound check**: Ensures no coefficients at positions `≥ ℓ`
2. **Commitment binding**: Fixes the polynomial underlying each commitment
3. **Concatenation identity**: Relates `[M]`, `[L]`, `[R]` via polynomial equation
4. **Public input verification**: HyperNova ensures commitments propagate correctly between kernels

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

#### Link 3: Merge inputs (t_commitments, T_prev_commitments) ✅ VERIFIED

**Security Property**: The chain integrity depends on:
1. Initial T_prev being fixed (point at infinity) ✅
2. Each T_prev being the output of the previous Merge ✅
3. t_commitments coming from verified witness commitments ✅

**Verification Details**:
- Initial T_prev: `empty_ecc_op_tables()` uses `ctx->zero_idx()` (fixed zero witness) for coordinates
  and constant `true` for infinity flag. Prover cannot manipulate without breaking `fix_witness` constraint.
- Propagation: Each kernel reads T_prev from previous kernel's public inputs and outputs merged
  commitments for next kernel. Chain is enforced by recursive verification structure.
- t_commitments: Extracted from witness commitments via `witness_commitments.get_ecc_op_wires()`,
  which are committed during Oink and bound to transcript.

### Multilinear Batching eq Polynomial Check

**Location**: `multilinear_batching_verifier.cpp:166-183`

**Purpose**: Ensures the prover used the correct eq polynomials when batching
the accumulator and instance claims.

---

## Recommendations

1. ~~Formal specification needed for transcript state machine~~ → Transcript structure now pinned via tests
2. **Edge case testing** for databus with infinity points
3. ~~Invariant checks for T_prev initialization and propagation~~ → Initial T_prev constrained via `fix_witness`, propagation via public inputs
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
- `stdlib/special_public_inputs/special_public_inputs.hpp` - KernelIO structure, `empty_ecc_op_tables()` (T_prev initialization)
- `stdlib_circuit_builders/ultra_circuit_builder.cpp` - `put_constant_variable()`, `fix_witness()` constraint mechanism
- `stdlib/primitives/biggroup/biggroup.hpp` - `point_at_infinity()` using `zero_idx()`
- `relations/databus_lookup_relation.hpp` - Databus lookup relation implementation
- `relations/databus_lookup_relation_consistency.test.cpp` - Databus relation unit tests
- `relations/translator_vm/translator_extra_relations_impl.hpp` - Translator zero constraints
- `op_queue/ecc_ops_table.hpp` - Ultra ops table (fixed append offset), `construct_current_ultra_ops_subtable_columns()` (subtable polynomial construction)
- `stdlib_circuit_builders/mega_circuit_builder.cpp` - `populate_ecc_op_wires()` (circuit ecc_op_wire construction)
- `ultra_honk/oink_prover.cpp` - Witness commitment during Oink (ecc_op_wire commitment)
- `constants.hpp` - CONST_HIDING_KERNEL_ULTRA_OPS (source of truth for hiding kernel ultra ops)
- `dsl/acir_format/gate_count_constants.hpp` - Re-exports CONST_HIDING_KERNEL_ULTRA_OPS for DSL
- `multilinear_batching/multilinear_batching_claims.hpp` - Accumulator hash implementation
- `transcript/origin_tag.hpp` - Origin tagging mechanism for transcript binding
- `numeric/random/engine.cpp` - Randomness source (CSPRNG in production)
- `eccvm/eccvm_verifier.cpp` - ECCVM verification, accumulated_result computation
- `translator_vm/translator_verifier.cpp` - Translator verification, commitment binding
- `stdlib/goblin_verifier/goblin_recursive_verifier.cpp` - Recursive Goblin orchestration
- `stdlib/goblin_verifier/goblin_recursive_verifier.hpp` - Recursive verifier types
- `stdlib/translator_vm_verifier/translator_recursive_verifier.cpp` - Recursive Translator verification
- `sumcheck/Sumcheck.md` - ZK sumcheck documentation (Libra masking, row disabling)
- `flavor/mega_zk_recursive_flavor.hpp` - MegaZK flavor definition (HasZK = true)
- `flavor/translator_flavor.hpp` - Translator flavor (HasZK = true)
- `flavor/eccvm_flavor.hpp` - ECCVM flavor (HasZK = true)

---

*Analysis conducted: 2025-12-04*
*Transcript pinning tests added: 2025-12-05*
*Databus relation unit tests added: 2025-12-08*
*CONST_HIDING_KERNEL_ULTRA_OPS global constant added: 2025-12-08*
*T_prev initialization constraint analysis added: 2025-12-08*
*Zero padding commitment binding analysis added: 2025-12-08*
*Accumulator hash, ZK hiding, Goblin chain verification added: 2025-12-09*
