# External Audit Scope: translator_vm

Repository: https://github.com/AztecProtocol/aztec-packages-private

Commit hash: Most recent commit on branch 'next'

## Summary of Module

The Translator circuit is a component of the Goblin proving system that bridges the Mega and ECCVM circuits. When proving recursive circuits with Mega circuit builder (over BN254), we accumulate deferred elliptic curve operations in an EccOpQueue. Proving these ECC operations is delegated to the ECCVM circuit (over Grumpkin) where they can be performed more efficiently. The purpose of the Translator VM (over BN254) is to esbalish the equivalence of the representaiton of these operations across Mega and ECCVM. Specifically, it proves that the batched polynomial evaluation of ECC operations computed by the ECCVM (over the Grumpkin scalar field Fq) is consistent with the ECC op queue representation used in Mega circuits (over the BN254 scalar field Fr).

Since q > r, Fq elements cannot be represented natively in Fr. The Translator uses non-native field arithmetic: it decomposes values into 68-bit limbs, computes the accumulation relation in integers, and proves correctness modulo 2^272 (via limb arithmetic) and modulo r (natively). By the Chinese Remainder Theorem, since 2^272 * r exceeds the maximum possible value, correctness in integers (and thus mod q) follows.

## Files to Audit
**Note:** Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`
**Note:** The translator verifier (native and recursive) are not explicitly within scope for this audit.

### Core Translator VM
1. `translator_vm/translator_circuit_builder.cpp`
2. `translator_vm/translator_circuit_builder.hpp`
3. `translator_vm/translator_flavor.hpp`
4. `translator_vm/translator_prover.cpp`
5. `translator_vm/translator_prover.hpp`
6. `translator_vm/translator_proving_key.cpp`
7. `translator_vm/translator_proving_key.hpp`
8. `translator_vm/translator_selectors.hpp`

### Translator VM Relations
9. `relations/translator_vm/translator_decomposition_relation.hpp`
10. `relations/translator_vm/translator_decomposition_relation_1.cpp`
11. `relations/translator_vm/translator_decomposition_relation_2.cpp`
12. `relations/translator_vm/translator_decomposition_relation_impl.hpp`
13. `relations/translator_vm/translator_delta_range_constraint_relation.cpp`
14. `relations/translator_vm/translator_delta_range_constraint_relation.hpp`
15. `relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp`
16. `relations/translator_vm/translator_extra_relations.cpp`
17. `relations/translator_vm/translator_extra_relations.hpp`
18. `relations/translator_vm/translator_extra_relations_impl.hpp`
19. `relations/translator_vm/translator_non_native_field_relation.cpp`
20. `relations/translator_vm/translator_non_native_field_relation.hpp`
21. `relations/translator_vm/translator_non_native_field_relation_impl.hpp`
22. `relations/translator_vm/translator_permutation_relation.cpp`
23. `relations/translator_vm/translator_permutation_relation.hpp`
24. `relations/translator_vm/translator_permutation_relation_impl.hpp`

---

## Test Files

| File | Description |
|------|-------------|
| `circuit_checker/translator_circuit_checker.hpp` | Standalone circuit correctness checker |
| `circuit_checker/translator_circuit_checker.cpp` | Circuit checker implementation |
| `translator_vm/translator.test.cpp` | End-to-end translator prover/verifier tests |
| `translator_vm/translator_circuit_builder.test.cpp` | Circuit builder correctness tests |
| `translator_vm/translator_selectors.test.cpp` | Structured selector evaluation tests |
| `translator_vm/relation_correctness.test.cpp` | Relation-by-relation correctness checks |
| `translator_vm/relation_failure.test.cpp` | Negative tests: relations reject bad witnesses |
| `relations/translator_vm/translator_relation_consistency.test.cpp` | Relation degree/length consistency checks |

---

## Security Mechanisms

### Fuzzers
| File | Description |
|------|-------------|
| `translator_vm/translator.fuzzer.hpp` | Fuzzer header with shared setup |
| `translator_vm/translator_circuit_builder.fuzzer.cpp` | Fuzz circuit builder witness generation |
| `translator_vm/translator_composer.fuzzer.cpp` | Fuzz composer prove/verify flow |
| `translator_vm/translator_mini.fuzzer.cpp` | Lightweight fuzzer for fast iteration |

---

## Documentation
- `translator_vm/README.md` — Circuit design, non-native arithmetic, witness trace structure, concatenation optimization
- `translator_vm/RELATIONS.md` — Detailed relation specifications and constraint analysis
