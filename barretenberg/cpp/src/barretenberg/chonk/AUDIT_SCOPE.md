# Chonk Audit Scope

## Audit Focus

> **Primary objective**: Verify **SOUNDNESS** of the system.
> - Verifier logic (native + recursive)
> - Cross-component consistency
> - Interface correctness between separately-audited components

**Note**: Prover bugs cause valid proofs to fail; verifier bugs allow invalid proofs to pass.

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
| `relations/databus_lookup_relation.hpp` | Lookup soundness |
| `relations/multilinear_batching/multilinear_batching_relation.hpp` | Batching relations |

### Tier 2: Consistency Logic

| File | Description |
|------|-------------|
| `chonk/chonk.cpp` | `verify`, `complete_kernel_circuit_logic` |
| `chonk/private_execution_steps.cpp` | Recursive verification setup |

### Tier 3: Recursive Verifiers

| File | Description |
|------|-------------|
| `stdlib/chonk_verifier/` | Chonk in-circuit verifier |
| `stdlib/goblin_verifier/` | Goblin in-circuit verifier |

---

## Soundness Checklist

### 1. HyperNova Folding (`hypernova/`)

- [ ] `instance_to_accumulator`: Sumcheck → accumulator conversion
- [ ] `verify_folding_proof`: Accumulator combination
- [ ] Batching challenges from transcript
- [ ] Shifted vs unshifted polynomial handling

### 2. Multilinear Batching (`multilinear_batching/`)

- [ ] `compute_new_claim`: Challenge generation
- [ ] `MultilinearBatchingAccumulatorRelationImpl::accumulate`
- [ ] `MultilinearBatchingInstanceRelationImpl::accumulate`

### 3. Merge Protocol (`goblin/merge_verifier.cpp`)

- [ ] `check_concatenation_identities`: $l_j + \kappa^\ell \cdot r_j = m_j$
- [ ] `check_degree_identity`: Thakur degree bound
- [ ] PREPEND vs APPEND mode handling

### 4. Databus (`relations/databus_lookup_relation.hpp`)

- [ ] Lookup relation: $\sum \frac{a_i}{b_i + i\beta + \gamma} - \frac{q_{busread,i}}{w_{1,i} + w_{2,i}\beta + \gamma} = 0$
- [ ] `read_tags` / `read_counts` handling
- [ ] Dynamic indexing security

### 5. Chonk Orchestration (`chonk/`)

- [ ] QUEUE_TYPE state machine: OINK → HN → HN_TAIL → HN_FINAL → MEGA
- [ ] `complete_kernel_circuit_logic` transitions
- [ ] Public input propagation (`ecc_op_tables`)
- [ ] First circuit: `empty_ecc_op_tables()` initialization

---

## Interface Consistency

### Goblin::verify Flow

```
Merge → ECCVM → Translator
  │        │         │
  │        └─────────┴── TranslatorInputData{x, v, accumulated_result}
  │
  └── merged_table_commitments ──► Translator (copy-constrained)
```

**Critical checks**:
- [ ] `merged_table_commitments` passed from Merge to Translator (same commitments)
- [ ] `TranslatorInputData` from `eccvm_verifier.get_translator_input_data()`
- [ ] Shared transcript prevents independent sub-proof generation

### Key Data Structures

```cpp
// ECCVM → Translator
struct TranslatorInputData {
    FF evaluation_challenge_x;
    FF batching_challenge_v;
    FF accumulated_result;
};

// Merge inputs/outputs
struct InputCommitments {
    TableCommitments t_commitments;       // From HyperNova
    TableCommitments T_prev_commitments;  // From kernel public inputs
};

struct VerificationResult {
    PairingPoints pairing_points;
    TableCommitments merged_commitments;  // → Translator
    bool degree_check_passed;
    bool concatenation_check_passed;
};
```

---

## Transcript Security

| Scope | Components | Risk |
|-------|------------|------|
| Per kernel/app pair | HyperNova fold | Reset boundary |
| Final proof | Merge + ECCVM + Translator | Must share transcript |

**Key risk**: Independent sub-proof generation if transcript not chained.

**Transcript interface checks** (Transcript/Poseidon audited separately):
- [ ] Challenge generation order matches prover/verifier
- [ ] `send_to_verifier` / `receive_from_prover` pairing
- [ ] Transcript sharing/reset boundaries

---

## Known Limitations

| Issue | Location | Severity |
|-------|----------|----------|
| 128-bit accumulated_result masking | Translator | Medium (documented) |
| Complex QUEUE_TYPE state machine | `chonk.hpp` | Needs careful review |
| Point at infinity initialization | `empty_ecc_op_tables()` | Edge case |

---

## ZK Properties (Lower Priority)

| Layer | Mechanism |
|-------|-----------|
| Hiding kernel | MegaZKFlavor (Libra + ZK Shplemini) |
| Op queue | 3 tail + 2 hiding random non-ops |
| Accumulated result | 1 valid random ECC op (128-bit) |

---

## Documentation

| Component | Status |
|-----------|--------|
| Chonk | ✓ `README.md` comprehensive |
| Merge | ✓ `MERGE_PROTOCOL.md` with ZK analysis |
| HyperNova | Covered in Chonk README |
| Databus | Covered in Chonk README |
