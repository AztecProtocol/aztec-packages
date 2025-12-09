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
- [ ] `check_eq_consistency`: Verifier eq polynomial check
- [ ] `MultilinearBatchingAccumulatorRelationImpl::accumulate`
- [ ] `MultilinearBatchingInstanceRelationImpl::accumulate`

### 3. Merge Protocol (`goblin/merge_verifier.cpp`)

- [ ] `check_concatenation_identities`: $l_j + \kappa^\ell \cdot r_j = m_j$
- [ ] `check_degree_identity`: Thakur degree bound
- [ ] PREPEND vs APPEND mode handling

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

### 5. Chonk Orchestration (`chonk/`)

- [ ] QUEUE_TYPE state machine: OINK → HN → HN_TAIL → HN_FINAL → MEGA
- [ ] `complete_kernel_circuit_logic` transitions
- [ ] Public input propagation (`ecc_op_tables`)
- [ ] First circuit: `empty_ecc_op_tables()` initialization

---

## Interface Consistency

### Goblin Chain

- [ ] `merged_table_commitments` passed from Merge to Translator (not re-read from proof)
- [ ] `TranslatorInputData` computed by ECCVM verifier, passed to Translator
- [ ] Shared transcript across Merge → ECCVM → Translator

### Transcript Boundaries

- [ ] Reset at each kernel/app pair for HyperNova folding
- [ ] Single shared transcript for final proof (Mega + Goblin)
- [ ] Challenge generation order matches prover/verifier

---

## Known Limitations

| Issue | Location | Severity |
|-------|----------|----------|
| 128-bit accumulated_result masking | Translator | Medium (documented) |
| Complex QUEUE_TYPE state machine | `chonk.hpp` | Needs careful review |
| Point at infinity initialization | `empty_ecc_op_tables()` | Edge case |

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
