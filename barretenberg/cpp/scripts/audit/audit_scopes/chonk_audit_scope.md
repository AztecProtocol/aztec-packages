# Chonk Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

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
9. `hypernova/hypernova_batching_challenges.hpp`

### Multilinear Batching Components
10. `multilinear_batching/multilinear_batching_prover.cpp`
11. `multilinear_batching/multilinear_batching_prover.hpp`
12. `multilinear_batching/multilinear_batching_claims.hpp`
13. `multilinear_batching/multilinear_batching_verifier.cpp`
14. `multilinear_batching/multilinear_batching_verifier.hpp`

### Merge Protocol
15. `goblin/merge_prover.cpp`
16. `goblin/merge_prover.hpp`
17. `goblin/merge_verifier.cpp`
18. `goblin/merge_verifier.hpp`
19. `goblin/batch_merge_prover.cpp`
20. `goblin/batch_merge_prover.hpp`
21. `goblin/batch_merge_verifier.cpp`
22. `goblin/batch_merge_verifier.hpp`

### Chonk Core
23. `chonk/chonk.cpp`
24. `chonk/chonk.hpp`
25. `chonk/private_execution_steps.hpp`
26. `chonk/private_execution_steps.cpp`
27. `chonk/chonk_proof.cpp`
28. `chonk/chonk_proof.hpp`
29. `chonk/chonk_step_processor.cpp`
30. `chonk/chonk_step_processor.hpp`
31. `chonk/proof_compression.hpp`

### Batched Honk Translator
32. `chonk/batched_honk_translator/batched_honk_translator_prover.hpp`
33. `chonk/batched_honk_translator/batched_honk_translator_prover.cpp`

### Relations
34. `relations/multilinear_batching/multilinear_batching_relation.hpp`
35. `relations/databus_lookup_relation.hpp`

### Special Public Inputs
36. `special_public_inputs/special_public_inputs.hpp`
37. `stdlib/primitives/public_input_component/public_input_component.hpp`

### Flavor
38. `flavor/multilinear_batching_flavor.hpp`
39. `flavor/multilinear_batching_flavor.cpp`
40. `flavor/multilinear_batching_recursive_flavor.hpp`

### Databus
41. `stdlib/primitives/databus/databus.hpp`
42. `stdlib/primitives/databus/databus.cpp`
43. `dsl/acir_format/block_constraint.cpp` (only the databus parts: `CallData`/`ReturnData` handling. The RAM/ROM parts are covered by the RAM/ROM audit scope.)

### ACIR Integration
44. `dsl/acir_format/hypernova_recursion_constraint.hpp`
45. `dsl/acir_format/hypernova_recursion_constraint.cpp`
46. `dsl/acir_format/recursion_constraint.cpp` (only `process_hn_recursion_constraints()` method)
47. `dsl/acir_format/chonk_recursion_constraints.hpp`
48. `dsl/acir_format/chonk_recursion_constraints.cpp`
---

## Critical Files

| File | Description |
|------|-------------|
| `hypernova/hypernova_prover.*` | HyperNova folding prover |
| `hypernova/hypernova_verifier.*` | Verifies folding proof via sumcheck; binds VK hash to transcript |
| `hypernova/hypernova_decider_verifier.*` | Final accumulator verification before PCS opening |
| `multilinear_batching/multilinear_batching_prover.*` | Multilinear batching prover |
| `multilinear_batching/multilinear_batching_verifier.*` | Batches polynomial claims with transcript-derived challenges |
| `goblin/merge_prover.*` | Merge protocol prover for ECC op table concatenation |
| `goblin/merge_verifier.*` | `reduce_to_pairing_check()` - validates ECC op table degree/concatenation |
| `goblin/batch_merge_prover.*` | Batch merge protocol prover (delayed merge of ECC op tables across multiple circuits) |
| `goblin/batch_merge_verifier.*` | Unified batch verifier for the batch Goblin ECC op queue merge protocol |
| `relations/databus_lookup_relation.hpp` | Log-derivative lookup ensuring read/write consistency across circuits |
| `relations/multilinear_batching/multilinear_batching_relation.hpp` | Relation for batched polynomial claim verification |
| `special_public_inputs/special_public_inputs.hpp` | `KernelIO`/`HidingKernelIO` - binds accumulators, ECC op tables, databus across circuits |
| `chonk/chonk.*` | Chonk state machine, `complete_kernel_circuit_logic()` |
| `chonk/private_execution_steps.cpp` | Main entry point, `accumulate()` orchestration |
| `chonk/chonk_step_processor.*` | Per-step orchestration: VK policy/check/recompute, deserialization, proof emission |
| `chonk/chonk_proof.*` | Proof serialization/deserialization (field elements, msgpack) |

---

## Test Files

| File | Focus |
|------|-------|
| `chonk/chonk.test.cpp` | Chonk orchestration, QUEUE_TYPE state machine, accumulation flow |
| `hypernova/hypernova_prover.test.cpp` | HyperNova folding prover tests |
| `hypernova/hypernova_verifier.test.cpp` | Folding proof verification, accumulator batching |
| `relations/multilinear_batching/multilinear_batching_relation_consistency.test.cpp` | Polynomial claim batching, eq consistency |
| `relations/databus_lookup_relation_consistency.test.cpp` | Databus lookup relation soundness |
| `stdlib/primitives/databus/databus.test.cpp` | Databus read/write tests |
| `goblin/batch_merge.test.cpp` | Batch merge protocol correctness |

---

## Security Mechanisms

### Boomerang Static Analyzer
- `graph_description_merge_recursive_verifier.test.cpp` - Analyzes Merge protocol recursive verification

---


## Documentation

| Component | Documentation | Key Topics |
|-----------|--------------|------------|
| **Chonk** | [chonk/README.md](../../../src/barretenberg/chonk/README.md) | HyperNova folding, multilinear batching, databus, proof structure, batched verification architecture, soundness mechanisms |
| **Merge Protocol** | [MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md) | Concatenation identities, degree bounds, PREPEND/APPEND modes, Chonk integration |
| **Batched Honk Translator** | [README.md](batched_honk_translator/README.md) | Batched proving of Honk and Translator together |
| **Transcripts** | [transcript/README.md](../transcript/README.md) | Manifest structure, transcript isolation, origin tags, VK binding |
