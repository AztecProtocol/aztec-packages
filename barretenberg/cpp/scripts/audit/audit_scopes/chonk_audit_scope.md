# Chonk Audit Scope

Chonk is an RCG system designed for proving private smart contract execution on Aztec. It uses HyperNova folding to accumulate circuits with deferred PCS verification, combined with Goblin to defer non-native elliptic curve operations to a separate VM - Elliptic Curve Virtual Machine. The goal of the audit is to ensure that soundness and completeness of the protocol **assuming** the soundness of several building blocks audited separately -  Circuit Builders, Field, Bigfield, ECCVM, Translator, Biggroup, Transcript, DSL/ACIR, Sumcheck, and PCS.

---

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### HyperNova Components
1. `hypernova/hypernova_prover.cpp`
2. `hypernova/hypernova_prover.hpp`
3. `hypernova/hypernova_decider_prover.cpp`
4. `hypernova/hypernova_decider_prover.hpp`
5. `hypernova/hypernova_verifier.cpp`
6. `hypernova/hypernova_verifier.hpp`
7. `hypernova/hypernova_decider_verifier.cpp`
8. `hypernova/hypernova_decider_verifier.hpp`
9. `hypernova/types.hpp`

### Multilinear Batching Components
10. `multilinear_batching/multilinear_batching_prover.cpp`
11. `multilinear_batching/multilinear_batching_prover.hpp`
12. `multilinear_batching/multilinear_batching_proving_key.cpp`
13. `multilinear_batching/multilinear_batching_proving_key.hpp`
14. `multilinear_batching/multilinear_batching_claims.hpp`
15. `multilinear_batching/multilinear_batching_verifier.cpp`
16. `multilinear_batching/multilinear_batching_verifier.hpp`

### Goblin Components
17. `goblin/goblin.cpp`
18. `goblin/goblin.hpp`
19. `goblin/merge_prover.cpp`
20. `goblin/merge_prover.hpp`
21. `goblin/merge_verifier.cpp`
22. `goblin/merge_verifier.hpp`
23. `goblin/goblin_verifier.cpp`
24. `goblin/goblin_verifier.hpp`
25. `goblin/translation_evaluations.hpp`
26. `goblin/types.hpp`

### ECCVM and Translator VM
27. `eccvm/eccvm_verifier.cpp`
28. `eccvm/eccvm_verifier.hpp`
29. `translator_vm/translator_verifier.cpp`
30. `translator_vm/translator_verifier.hpp`

### Chonk Core
31. `chonk/chonk.cpp`
32. `chonk/chonk.hpp`
33. `chonk/private_execution_steps.cpp`
34. `chonk/chonk_proof.cpp`
35. `chonk/chonk_proof.hpp`
36. `chonk/chonk_verifier.cpp`
37. `chonk/chonk_verifier.hpp`

### Relations
38. `relations/databus_lookup_relation.hpp`
39. `relations/multilinear_batching/multilinear_batching_relation.hpp`

### Special Public Inputs
40. `special_public_inputs/special_public_inputs.hpp`

### Flavor
41. `flavor/multilinear_batching_flavor.hpp`
42. `flavor/multilinear_batching_recursive_flavor.hpp`

### ACIR Integration
43. `dsl/acir_format/hypernova_recursion_constraint.hpp`
44. `dsl/acir_format/hypernova_recursion_constraint.cpp`

---

## Critical Files

| File | Description |
|------|-------------|
| `hypernova/hypernova_verifier.*` | Verifies folding proof via sumcheck; binds VK hash to transcript |
| `hypernova/hypernova_decider_verifier.*` | Final accumulator verification before PCS opening |
| `multilinear_batching/multilinear_batching_verifier.*` | Batches polynomial claims with transcript-derived challenges |
| `goblin/merge_verifier.*` | `reduce_to_pairing_check()` - validates ECC op table degree/concatenation |
| `relations/databus_lookup_relation.hpp` | Log-derivative lookup ensuring read/write consistency across circuits |
| `relations/multilinear_batching/multilinear_batching_relation.hpp` | Relation for batched polynomial claim verification |
| `special_public_inputs/special_public_inputs.hpp` | `KernelIO`/`HidingKernelIO` - binds accumulators, ECC op tables, databus across circuits |
| `chonk/chonk.*` | Chonk state machine, `complete_kernel_circuit_logic()` |
| `chonk/private_execution_steps.cpp` | Main entry point, `accumulate()` orchestration |
| `chonk/chonk_proof.*` | Proof serialization/deserialization (field elements, msgpack) |
| `eccvm/eccvm_verifier.*` | `reduce_to_ipa_opening()` - verifies ECCVM execution, reduces to IPA |
| `translator_vm/translator_verifier.*` | `reduce_to_pairing_check()` - verifies BN254-Grumpkin consistency |
| `goblin/goblin_verifier.*` | Orchestrates (final) Merge → ECCVM → Translator; aggregates pairing points + IPA claim |
| `chonk/chonk_verifier.*` | Verifies MegaZK proof + Goblin proof; aggregates 4 pairing point sets |

In total ~3500 lines

---

## Test Files

| File | Focus |
|------|-------|
| `chonk/chonk.test.cpp` | Chonk orchestration, QUEUE_TYPE state machine, accumulation flow |
| `chonk/chonk_verifier.test.cpp` | Native and recursive verifier correctness, pairing aggregation |
| `chonk/chonk_transcript_invariants.test.cpp` | Transcript consistency, tampering detection, M_tail propagation |
| `hypernova/hypernova_verifier.test.cpp` | Folding proof verification, accumulator batching |
| `multilinear_batching/multilinear_batching_verifier.test.cpp` | Polynomial claim batching, eq consistency |
| `goblin/merge.test.cpp` | Merge protocol correctness, degree checks, PREPEND/APPEND modes |
| `goblin/goblin_recursive_verifier.test.cpp` | Goblin chain integration, failure detection (ECCVM, Translator) |
| `relations/databus_lookup_relation_consistency.test.cpp` | Databus lookup relation soundness |

---

## Automated Analysis

### Fuzzers
Differential fuzzing for cryptographic primitives and circuit components:
- **ECCVM**: `eccvm.fuzzer.cpp` - ECCVM execution
- **Stdlib components**: Field operations, bigfield, hash functions (SHA256, Blake2s, Blake3s, Keccak), AES128

### Boomerang Static Analyzer
In-circuit static analyzer that tracks variable flow through gates to detect potential soundness issues.

**Chonk-related tests**:
- `graph_description_goblin.test.cpp` - Analyzes Goblin recursive verifier circuits
- `graph_description_merge_recursive_verifier.test.cpp` - Analyzes Merge protocol recursive verification
- `graph_description_ultra_recursive_verifier.test.cpp` - Analyzes Ultra recursive verifier
- `graph_description_ipa_recursive.test.cpp` - Analyzes IPA recursive verification

---


## Documentation

| Component | Documentation | Key Topics |
|-----------|--------------|------------|
| **Chonk** | [README.md](README.md) | HyperNova folding, multilinear batching, databus, proof structure, verification architecture, soundness mechanisms |
| **Merge Protocol** | [MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md) | Concatenation identities, degree bounds, PREPEND/APPEND modes, Chonk integration |
| **Transcripts** | [transcript/README.md](../transcript/README.md) | Manifest structure, transcript isolation, origin tags, VK binding |
