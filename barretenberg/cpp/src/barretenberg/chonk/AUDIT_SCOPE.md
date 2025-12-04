# Chonk Audit Scope

This document outlines the components in scope for external audit, their documentation status, and identifies critical areas requiring attention.

## Overview

Chonk is Aztec's client-side proving system combining:
- **HyperNova folding** for efficient recursion
- **Goblin** for deferred EC operations (ECCVM + Translator)
- **Databus** for inter-circuit communication
- **MegaZK flavor** for zero-knowledge

### Audit Scope Notes

- **ECCVM** and **Translator** have **separate external audits** - excluded from this scope
- Focus is on Chonk-specific components: folding, merge protocol, databus, orchestration

---

## Components In Scope

### 1. HyperNova Folding

**Location**: `barretenberg/cpp/src/barretenberg/hypernova/`

**Purpose**: Fold multiple circuit instances into a single accumulator, deferring PCS verification to a final decider proof.

**Documentation Status**:
- [x] README.md in `chonk/` covers HyperNova at high level
- [ ] Standalone HyperNova documentation needed

**Key Files**:
| File | Audit Status Header | Description |
|------|---------------------|-------------|
| `hypernova_prover.hpp` | Yes | Main folding prover |
| `hypernova_prover.cpp` | | Implementation |
| `hypernova_verifier.hpp` | Yes | Folding verifier (native + recursive) |
| `hypernova_verifier.cpp` | | Implementation |
| `hypernova_decider_prover.hpp` | Yes | Final decider prover |
| `hypernova_decider_prover.cpp` | | Implementation |
| `hypernova_decider_verifier.hpp` | Yes | Final decider verifier |
| `hypernova_decider_verifier.cpp` | | Implementation |
| `types.hpp` | Yes | Type definitions |

**Dependencies**:
| Location | Description |
|----------|-------------|
| `multilinear_batching/` | Batching sumcheck for folding |
| `relations/multilinear_batching/` | Batching relation definitions |

**Critical Soundness Areas**:
- [ ] `instance_to_accumulator`: Sumcheck output → accumulator conversion
- [ ] `fold`: Accumulator + instance → new accumulator
- [ ] Batching challenges derived correctly from transcript
- [ ] Evaluation claims match committed polynomials
- [ ] Shifted vs unshifted polynomial handling

**Thin Areas**:
- MultilinearBatchingSumcheck relation (lines 54-56 in `multilinear_batching_relation.hpp`): Simple product relation - verify correctness

---

### 2. Multilinear Batching

**Location**: `barretenberg/cpp/src/barretenberg/multilinear_batching/`

**Purpose**: Reduce multiple evaluation claims at different points to a single claim via sumcheck.

**Documentation Status**:
- [ ] No standalone documentation
- [x] Covered in Chonk README "HyperNova Folding Details" section

**Key Files**:
| File | Description |
|------|-------------|
| `multilinear_batching_prover.hpp/cpp` | Batching prover |
| `multilinear_batching_verifier.hpp/cpp` | Batching verifier |
| `multilinear_batching_claims.hpp` | Claim structures |
| `multilinear_batching_proving_key.hpp` | Proving key |

**Relations** (`relations/multilinear_batching/`):
| File | Description |
|------|-------------|
| `multilinear_batching_relation.hpp` | Two relations: Accumulator and Instance |

**Critical Soundness Areas**:
- [ ] `MultilinearBatchingAccumulatorRelationImpl::accumulate` (line 54-55)
- [ ] `MultilinearBatchingInstanceRelationImpl::accumulate` (line 100-101)
- [ ] `compute_new_claim`: Challenge generation and batching
- [ ] `hash_with_origin_tagging`: Transcript binding for claims

---

### 3. Goblin / Merge Protocol

**Location**: `barretenberg/cpp/src/barretenberg/goblin/`

**Purpose**:
- Defer non-native EC operations to op queue
- Prove correct merging of op queue tables across circuits

**Documentation Status**:
- [x] `MERGE_PROTOCOL.md` - **Comprehensive** with ZK analysis
- [x] Code matches documentation well

**Key Files**:
| File | Description |
|------|-------------|
| `goblin.hpp/cpp` | Main orchestration |
| `merge_prover.hpp/cpp` | Merge proof construction |
| `merge_verifier.hpp/cpp` | Merge verification (native + recursive) |
| `types.hpp` | GoblinProof, ECCOpQueue types |
| `translation_evaluations.hpp` | Translation data structures |

**Critical Soundness Areas**:
- [ ] `MergeProver::construct_proof`: Degree check polynomial construction
- [ ] `MergeVerifier::verify_proof`:
  - `check_concatenation_identities`: $l_j + \kappa^\ell \cdot r_j = m_j$
  - `check_degree_identity`: Thakur degree check
- [ ] `compute_degree_check_polynomial`: Polynomial reversal for degree bound
- [ ] PREPEND vs APPEND mode handling
- [ ] `empty_ecc_op_tables()`: Point at infinity initialization

**ZK Analysis** (from MERGE_PROTOCOL.md):
- 6 random operations total (3 tail + 2 hiding + 1 valid random)
- 40 random coefficients, 32 observables → 8 degrees of freedom
- Rank analysis proves sufficient hiding

**Thin Areas**:
- Mode switching (PREPEND → APPEND) at hiding kernel boundary
- First circuit special case (`empty_ecc_op_tables`)

---

### 4. Databus

**Location**: Multiple locations

**Purpose**: Enable inter-circuit data passing via commitment equality checks instead of hashing.

**Documentation Status**:
- [x] Covered in Chonk README "Databus" section
- [ ] No standalone documentation for implementation

**Key Files**:
| Location | File | Description |
|----------|------|-------------|
| `stdlib_circuit_builders/` | `mega_circuit_builder.hpp` | Databus column definitions |
| `relations/` | `databus_lookup_relation.hpp` | Lookup relation |
| | `logderivative_library.hpp` | Log-derivative lookup mechanics |

**Columns**:
| Column | Purpose |
|--------|---------|
| `calldata` | Input from previous kernel's return data |
| `secondary_calldata` | Input from previous app's return data |
| `return_data` | Output for next circuit |

**Critical Soundness Areas**:
- [ ] Lookup relation: $\sum \frac{a_i}{b_i + i\beta + \gamma} - \frac{q_{busread,i}}{w_{1,i} + w_{2,i}\beta + \gamma} = 0$
- [ ] `read_tags` polynomial handling (binary check for `is_active`)
- [ ] Inverse polynomial correctness
- [ ] Inter-circuit consistency checks in `complete_kernel_circuit_logic`

**Thin Areas**:
- `read_counts` vs `read_tags` distinction
- Dynamic indexing security (witness index used for access)

---

### 5. Chonk Orchestration

**Location**: `barretenberg/cpp/src/barretenberg/chonk/`

**Purpose**: Orchestrate folding, Goblin, and proof generation for the full IVC flow.

**Documentation Status**:
- [x] `README.md` - **Comprehensive**

**Key Files**:
| File | Description |
|------|-------------|
| `chonk.hpp` | Main class definition |
| `chonk.cpp` | Implementation |
| `chonk.test.cpp` | Tests |
| `chonk_base.hpp` | Base class |
| `private_execution_steps.hpp/cpp` | Kernel completion logic |

**Critical Soundness Areas**:
- [ ] `accumulate`: Circuit ordering (app/kernel alternation)
- [ ] `complete_kernel_circuit_logic`: Recursive verification setup
- [ ] `perform_recursive_verification_and_databus_consistency_checks`
- [ ] `construct_proof`: Final proof assembly
- [ ] `verify`: Proof verification logic

**ZK Areas**:
- [ ] `hide_op_queue_content_in_tail`: 3 random non-ops prepended
- [ ] `hide_op_queue_content_in_hiding`: 2 random non-ops appended
- [ ] `hide_op_queue_accumulation_result`: 1 valid random ECC op

**Thin Areas**:
- QUEUE_TYPE state machine (OINK → HN → HN_TAIL → HN_FINAL)
- Transcript reset boundaries
- Public input extraction and propagation

---

### 6. Recursive Verifiers (stdlib)

**Location**: `barretenberg/cpp/src/barretenberg/stdlib/`

**Purpose**: In-circuit verification of proofs (for recursive composition).

**Key Subdirectories** (in scope):
| Directory | Description | Notes |
|-----------|-------------|-------|
| `chonk_verifier/` | Chonk recursive verifier | In scope |
| `goblin_verifier/` | Goblin recursive verifier | In scope |
| `honk_verifier/` | Honk recursive verifier | In scope |
| `eccvm_verifier/` | ECCVM recursive verifier | **Separate audit** |
| `translator_vm_verifier/` | Translator recursive verifier | **Separate audit** |

**Critical Soundness Areas**:
- [ ] Native ↔ recursive verifier consistency
- [ ] Transcript handling in-circuit
- [ ] Field element conversion (native ↔ stdlib types)
- [ ] `stdlib_from_native` conversions

---

## Components With Separate Audits (Interface Review In Scope)

**Note**: Several components have separate external audits for their internal logic. However, the **interfaces and linkage** between them and Chonk are **in scope** for the Chonk audit.

### Audit Status Summary

| Component | Internal Audit | Interface In Scope |
|-----------|---------------|-------------------|
| ECCVM | Separate external audit | Yes |
| Translator | Separate external audit | Yes |
| Sumcheck | Separate external audit | Yes |
| PCS (KZG, IPA, Shplemini) | Separate external audit | Yes |
| BigField | **Completed** | N/A |
| BigGroup | Separate external audit | Yes |
| Field (stdlib) | **Completed** | N/A |

### ECCVM Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/eccvm/`
- **Internal Logic**: Separate external audit
- **Key Interface**: `ECCVMVerifier_<Flavor>` (unified native/recursive verifier)

**In Scope for Chonk Audit**:

| Interface | Signature | Notes |
|-----------|-----------|-------|
| Constructor | `ECCVMVerifier_(transcript, proof)` | Extracts builder from proof for recursive |
| Verify | `verify_proof() -> OpeningClaim<Curve>` | Returns IPA opening claim |
| Translator Data | `get_translator_input_data() -> TranslatorInputData` | Contains `{x, v, accumulated_result}` |

**Critical Fields Passed to Translator**:
```cpp
struct TranslatorInputData {
    FF evaluation_challenge_x;      // Challenge for evaluating translation polynomials
    FF batching_challenge_v;        // Challenge for batching translation polynomials
    FF accumulated_result;          // ∑ mᵢ(x)⋅vⁱ - used by Translator relations
};
```

**Verification Flags** (native only):
- `sumcheck_verified` - Sumcheck passed
- `consistency_checked` - Commitment consistency verified
- `translation_masking_consistency_checked` - ZK masking correct

---

### Translator Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/translator_vm/`
- **Internal Logic**: Separate external audit
- **Key Interface**: `TranslatorVerifier`

**In Scope for Chonk Audit**:

| Interface | Signature | Notes |
|-----------|-----------|-------|
| Verify | `verify_proof(proof, x, v, accumulated_result, op_queue_commitments) -> bool` | Takes ECCVM output + Merge commitments |

**Critical: Commitment Linkage with Merge**:
```cpp
// In Goblin::verify():
bool translator_verified = translator_verifier.verify_proof(
    proof.translator_proof,
    translator_input.evaluation_challenge_x,     // From ECCVM
    translator_input.batching_challenge_v,       // From ECCVM
    translator_input.accumulated_result,         // From ECCVM
    merged_table_commitments);                   // From Merge (copy-constrained!)
```

---

### Merge Protocol Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/goblin/merge_verifier.hpp`
- **Key Interface**: `MergeVerifier_<Curve>` (unified native/recursive)

**In Scope for Chonk Audit**:

| Interface | Signature | Notes |
|-----------|-----------|-------|
| Constructor | `MergeVerifier_(settings, transcript)` | PREPEND or APPEND mode |
| Verify | `verify_proof(proof, input_commitments) -> VerificationResult` | Returns pairing points + merged commitments |

**Input Commitments Structure**:
```cpp
struct InputCommitments {
    TableCommitments t_commitments;       // Current subtable [t₁..t₄] from HyperNova
    TableCommitments T_prev_commitments;  // Previous merged [T_prev₁..T_prev₄] from kernel public inputs
};
```

**Verification Result Structure**:
```cpp
struct VerificationResult {
    PairingPoints pairing_points;           // For KZG batch verification
    TableCommitments merged_commitments;    // [M₁..M₄] - passed to Translator
    bool degree_check_passed;               // Thakur degree bound verified
    bool concatenation_check_passed;        // M = L + X^ℓ⋅R verified
};
```

---

### Goblin Orchestration Interface
- **Location**: `barretenberg/cpp/src/barretenberg/goblin/goblin.hpp`
- **Key Class**: `Goblin`

**Prove Flow**:
```cpp
GoblinProof Goblin::prove(MergeSettings settings) {
    prove_merge(transcript, settings);        // Adds to merge_verification_queue
    prove_eccvm();                            // Sets translation_batching_challenge_v, evaluation_challenge_x
    prove_translator();                       // Uses challenges from ECCVM
    return goblin_proof;
}
```

**Verify Flow** (`Goblin::verify`):
```cpp
bool verify(proof, merge_commitments, transcript, settings) {
    // 1. Verify Merge
    auto [merge_pairing_points, merged_table_commitments, degree_ok, concat_ok] =
        merge_verifier.verify_proof(proof.merge_proof, merge_commitments);

    // 2. Verify ECCVM + IPA
    ECCVMVerifier eccvm_verifier(transcript, proof.eccvm_proof);
    auto opening_claim = eccvm_verifier.verify_proof();
    bool ipa_verified = ECCVMFlavor::PCS::reduce_verify(..., opening_claim, ...);

    // 3. Verify Translator with ECCVM output + Merge commitments
    TranslatorInputData translator_input = eccvm_verifier.get_translator_input_data();
    bool translator_verified = translator_verifier.verify_proof(
        proof.translator_proof,
        translator_input.evaluation_challenge_x,
        translator_input.batching_challenge_v,
        translator_input.accumulated_result,
        merged_table_commitments);  // Critical: same commitments from Merge

    return merge_verified && eccvm_verified && translator_verified;
}
```

---

### Sumcheck Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/sumcheck/`
- **Internal Logic**: Separate external audit
- **In Scope for Chonk Audit**:
  - [ ] `SumcheckProver`/`SumcheckVerifier` interface usage in HyperNova
  - [ ] `SumcheckOutput` structure and challenge extraction
  - [ ] ZK Sumcheck (Libra) integration points
  - [ ] Round univariate handling

---

### BigGroup Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/stdlib/primitives/biggroup/`
- **Internal Logic**: Separate external audit
- **In Scope for Chonk Audit**:
  - [ ] EC point operations in recursive verifiers
  - [ ] Commitment batching (MSM operations)
  - [ ] Point validation in-circuit

---

### PCS Interface Points
- **Location**: `barretenberg/cpp/src/barretenberg/commitment_schemes/`
- **Internal Logic**: Separate external audit
- **In Scope for Chonk Audit**:
  - [ ] KZG usage in Merge protocol (Shplonk batching)
  - [ ] IPA claim flow: `ECCVMVerifier::verify_proof()` → `OpeningClaim` → IPA verify
  - [ ] Shplemini integration in HyperNova decider
  - [ ] ZK Shplemini (Gemini masking polynomial)
  - [ ] Opening claim batching correctness
  - [ ] Pairing point accumulation in recursive verifiers

---

### Critical Interface Linkages

| From | To | Data | Type |
|------|-----|------|------|
| HyperNova | Sumcheck | Relations, polynomials | Sumcheck protocol |
| HyperNova Decider | PCS (Shplemini) | Evaluation claims | Opening proof |
| Merge | PCS (Shplonk/KZG) | Batched openings | KZG verification |
| HyperNova | Goblin | `ecc_op_wires` commitments | Via transcript |
| Merge | Translator | `merged_table_commitments` | **Copy-constrained** |
| ECCVM | PCS (IPA) | `OpeningClaim<Curve>` | IPA proof |
| ECCVM | Translator | `TranslatorInputData{x, v, accumulated_result}` | Via `get_translator_input_data()` |
| Translator | Final Proof | `bool` verification status | Via `Goblin::verify` |
| Recursive Verifiers | BigGroup | EC operations | In-circuit |

---

### Interface Consistency Checks

**1. ECCVM → Translator Data Flow** (`goblin.cpp:101-132`):
```cpp
// ECCVM verifier extracts translator input
TranslatorInputData translator_input = eccvm_verifier.get_translator_input_data();

// Translator uses ECCVM output + Merge commitments
translator_verifier.verify_proof(proof,
    translator_input.evaluation_challenge_x,
    translator_input.batching_challenge_v,
    translator_input.accumulated_result,
    merged_table_commitments);  // From Merge
```
- [ ] `accumulated_result` computation correctness
- [ ] Challenge propagation (x, v) matches ECCVM internal state

**2. Merge → Translator Commitment Binding**:
```cpp
// merged_table_commitments from Merge passed directly to Translator
// These are the SAME [M_j] commitments - not re-committed
```
- [ ] No re-commitment between Merge and Translator
- [ ] Degree bound: `deg(M_j) < MINI_CIRCUIT_SIZE`

**3. Transcript Chaining** (shared `transcript` pointer):
```cpp
Goblin::Goblin(..., const std::shared_ptr<Transcript>& transcript)
// Same transcript used for: Merge → ECCVM → Translator
```
- [ ] Transcript continuity verified
- [ ] No independent sub-proof generation possible

**4. GoblinProof Structure**:
```cpp
struct GoblinProof {
    HonkProof merge_proof;
    HonkProof eccvm_proof;
    HonkProof ipa_proof;        // Separate from eccvm_proof
    HonkProof translator_proof;
};
```
- [ ] IPA proof correctly separated from ECCVM proof

---

## Critical Soundness Checks Summary

### Fiat-Shamir Transcript Security

| Component | Transcript Shared With | Risk |
|-----------|----------------------|------|
| HyperNova fold | Kernel/App pair | Reset per pair - verify boundary |
| Decider | Tail kernel transcript | Continuity check |
| Final proof | Hiding + Merge + ECCVM + Translator | All share one - verify chaining |

**Key Risk**: Independent sub-proof generation if transcript not properly chained.

### Zero-Knowledge Layers

| Layer | Mechanism | Randomness | Status |
|-------|-----------|------------|--------|
| Hiding kernel | MegaZKFlavor (Libra + ZK Shplemini) | Full | |
| Op queue (tail) | 3 random non-ops | 6 coefficients/poly | |
| Op queue (hiding) | 2 random non-ops | 4 coefficients/poly | |
| Accumulated result | 1 valid random ECC op | 128-bit | **Known limitation** |

### Accumulator Integrity

| Check | Location | Description |
|-------|----------|-------------|
| Batching challenges | `get_batching_challenges()` | From transcript |
| Evaluation claims | `sumcheck_output_to_accumulator` | Match polynomials |
| Shifted handling | Throughout | Correct offset |

---

## Known Limitations / Thin Areas

### 1. Accumulated Result Masking (128-bit)
- **Location**: Translator accumulated_result
- **Issue**: Only computational hiding, not statistical (128-bit vs 254-bit)
- **Severity**: Medium - documented known limitation
- **Mitigation**: Acceptable for current threat model

### 2. Databus Dynamic Indexing
- **Location**: `databus_lookup_relation.hpp`
- **Issue**: Witness-controlled index for databus access
- **Risk**: Potential out-of-bounds or aliasing attacks
- **Status**: Needs review

### 3. QUEUE_TYPE State Machine
- **Location**: `chonk.hpp`, `complete_kernel_circuit_logic`
- **Issue**: Complex state transitions (OINK→HN→HN_TAIL→HN_FINAL→MEGA)
- **Risk**: Incorrect state handling could break security properties
- **Status**: Needs careful audit of all transitions

### 4. First Circuit Initialization
- **Location**: `empty_ecc_op_tables()` in `special_public_inputs.hpp`
- **Issue**: Point at infinity as initial state
- **Risk**: Edge case handling
- **Status**: Needs verification

---

## Documentation Gaps

| Component | Gap | Priority |
|-----------|-----|----------|
| HyperNova | Standalone documentation | Medium |
| Multilinear Batching | Standalone documentation | Medium |
| Databus | Implementation details doc | Medium |
| Recursive Verifiers | Architecture overview | Low |

---

## Test Coverage

| Component | Unit Tests | Integration | Fuzz | Notes |
|-----------|------------|-------------|------|-------|
| Chonk | ✓ chonk.test.cpp | | | |
| HyperNova | ✓ hypernova_*.test.cpp | | | |
| Merge | | | | Needs dedicated tests |
| Databus | | | | Covered in circuit tests |
| Multilinear Batching | | | | Needs dedicated tests |

---

## Audit Recommendations

### Priority 1 (Critical) - Soundness
- [ ] HyperNova folding: accumulator batching correctness
- [ ] Multilinear batching relation soundness
- [ ] Merge protocol degree check (Thakur protocol)
- [ ] Databus lookup relation

### Priority 2 (High) - Security
- [ ] Transcript chaining across all components
- [ ] Public input propagation (ecc_op_tables)
- [ ] QUEUE_TYPE state machine correctness
- [ ] Recursive verifier ↔ native verifier consistency

### Priority 3 (Medium) - ZK/Edge Cases
- [ ] ZK masking completeness (all 6 random ops)
- [ ] First circuit initialization edge cases
- [ ] Mode switching (PREPEND→APPEND)
- [ ] Accumulated result 128-bit limitation acceptability

---

## Appendix: File-Level Audit Status

Files with `// === AUDIT STATUS ===` headers:
- `hypernova/hypernova_prover.hpp` - not started
- `hypernova/hypernova_verifier.hpp` - not started
- `hypernova/hypernova_decider_prover.hpp` - not started
- `hypernova/hypernova_decider_verifier.hpp` - not started
- `hypernova/types.hpp` - not started
- `relations/multilinear_batching/multilinear_batching_relation.hpp` - not started

---

*Last updated: December 2024*
*Status: Work in progress*
