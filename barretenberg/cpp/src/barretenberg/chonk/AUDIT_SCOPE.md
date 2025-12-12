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

## Critical Files

| File | Description |
|------|-------------|
| `hypernova/hypernova_verifier.cpp` | Verifies folding proof via sumcheck; binds VK hash to transcript |
| `hypernova/hypernova_decider_verifier.cpp` | Final accumulator verification before PCS opening |
| `multilinear_batching/multilinear_batching_verifier.cpp` | Batches polynomial claims with transcript-derived challenges |
| `goblin/merge_verifier.cpp` | `reduce_to_pairing_check()` - validates ECC op table degree/concatenation |
| `goblin/goblin_verifier.cpp` | Orchestrates Merge → ECCVM → Translator; aggregates pairing points + IPA claim |
| `eccvm/eccvm_verifier.cpp` | `reduce_to_ipa_opening()` - verifies ECC VM execution, reduces to IPA |
| `translator_vm/translator_verifier.cpp` | `reduce_to_pairing_check()` - verifies field↔group correspondence |
| `relations/databus_lookup_relation.hpp` | Log-derivative lookup ensuring read/write consistency across circuits |
| `relations/multilinear_batching/multilinear_batching_relation.hpp` | Relation for batched polynomial claim verification |
| `special_public_inputs/special_public_inputs.hpp` | `KernelIO`/`HidingKernelIO` - binds accumulators, ECC op tables, databus across circuits |
| `chonk/chonk.cpp` | `verify()`, `complete_kernel_circuit_logic()` - IVC state machine |
| `chonk/private_execution_steps.cpp` | IVC entry point, `accumulate()` orchestration |
| `chonk_verifier.*` | Recursive Chonk verifier (in-circuit) |
| `goblin_verifier.*` | Recursive Goblin verifier (in-circuit) |

---

## Checklist

### HyperNova Folding ✅
[README: HyperNova Folding Details](README.md#hypernova-folding-details) | **Tests**: `hypernova_verifier.test.cpp`
- [x] Sumcheck → accumulator conversion, batching challenges from transcript, shifted/unshifted separation

### Multilinear Batching ✅
[README: Batching Claims into Accumulator](README.md#batching-claims-into-accumulator) | **Tests**: `multilinear_batching_*.test.cpp`
- [x] `compute_new_claim`, `check_eq_consistency`, relation accumulate functions

### Merge Protocol ✅
[MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md) | [README: Merge Protocol](README.md#merge-protocol)
- [x] Concatenation identities, degree bound, PREPEND/APPEND mode

### Databus ✅
[README: Databus](README.md#databus) | **Tests**: `databus_lookup_relation_consistency.test.cpp`

### Chonk Orchestration ✅
[README: Usage](README.md#usage) | **Tests**: `chonk.test.cpp`, `chonk_transcript_invariants.test.cpp`
- [x] Tampering tests: `*TamperingFailure`, `MTailPropagationConsistency`
- [x] QUEUE_TYPE handling, T_prev initialization ([MERGE_PROTOCOL: Merge Flow](../goblin/MERGE_PROTOCOL.md#merge-flow-through-chonk))

### Goblin Chain ✅
[README: Goblin](README.md#goblin-eccvm--translator) | [MERGE_PROTOCOL: Verification Flow](../goblin/MERGE_PROTOCOL.md#verification-flow-at-each-step)
- [x] Merge → ECCVM → Translator orchestration, `ReductionResult` aggregation
- [x] Data flow: `merged_table_commitments` passed (not re-read), `accumulated_result` computed by ECCVM

### Transcript Boundaries ✅
[transcript/README.md](../transcript/README.md)
- [x] Manifest structure, transcript isolation (`unique_transcript_index`), public inputs bound to transcript

### VK Binding ✅
- [x] VK hash first in transcript (`oink_verifier.cpp:56-57`), VK tree membership (`vk_data.nr:33-43`)
do
---


---

## Documentation

| Component | Location |
|-----------|----------|
| Chonk | `README.md` |
| Merge Protocol | `goblin/MERGE_PROTOCOL.md` |
