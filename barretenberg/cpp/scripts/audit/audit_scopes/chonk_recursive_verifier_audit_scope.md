# External Audit Scope: chonk_recursive_verifier

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### ACIR Integration
1. `dsl/acir_format/chonk_recursion_constraints.hpp`
2. `dsl/acir_format/chonk_recursion_constraints.cpp`

### ECCVM Recursive Verifier Relations
3. `stdlib/eccvm_verifier/ecc_bools_relation.cpp`
4. `stdlib/eccvm_verifier/ecc_lookup_relation.cpp`
5. `stdlib/eccvm_verifier/ecc_msm_relation.cpp`
6. `stdlib/eccvm_verifier/ecc_point_table_relation.cpp`
7. `stdlib/eccvm_verifier/ecc_set_relation.cpp`
8. `stdlib/eccvm_verifier/ecc_transcript_relation.cpp`
9. `stdlib/eccvm_verifier/ecc_wnaf_relation.cpp`

### ECCVM Recursive Flavor
10. `stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp`
11. `stdlib/eccvm_verifier/verifier_commitment_key.hpp`

### Translator Recursive Verifier Relations
12. `stdlib/translator_vm_verifier/translator_decomposition_relation_ultra.cpp`
13. `stdlib/translator_vm_verifier/translator_delta_range_constraint_relation.cpp`
14. `stdlib/translator_vm_verifier/translator_extra_relations.cpp`
15. `stdlib/translator_vm_verifier/translator_non_native_field_relation.cpp`
16. `stdlib/translator_vm_verifier/translator_permutation_relation.cpp`

### Translator Recursive Flavor
17. `stdlib/translator_vm_verifier/translator_recursive_flavor.hpp`

## Summary of Module

The Chonk recursive verifier implements in-circuit verification of Chonk proofs, which include ECCVM (Elliptic Curve Virtual Machine) and Translator proofs as part of the Goblin proving system. The recursive verifier arithmetizes the ECCVM and Translator verification logic using stdlib circuit types, enabling verification of these proofs within an Ultra circuit. The ECCVM relations (bools, lookup, msm, point_table, set, transcript, wnaf) and Translator relations (decomposition, delta_range_constraint, extra_relations, non_native_field, permutation) define the constraints that must be satisfied during recursive verification. The recursive flavors configure the circuit builder, commitment scheme, and verification key structure for in-circuit verification. The ACIR integration layer provides the interface for Noir programs to trigger Chonk recursive verification.

## Test Files
1. `dsl/acir_format/chonk_recursion_constraints.test.cpp`
2. `stdlib/eccvm_verifier/eccvm_recursive_verifier.test.cpp`

## Security Mechanisms
- Constraint system validation for ECCVM relations
- Recursive proof composition via Goblin
