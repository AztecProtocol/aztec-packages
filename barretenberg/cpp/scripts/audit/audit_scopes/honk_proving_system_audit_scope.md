# External Audit Scope: honk_proving_system

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Honk Infrastructure
1. `honk/composer/composer_lib.hpp`
2. `honk/composer/permutation_lib.hpp`
3. `honk/library/grand_product_delta.hpp`
4. `honk/library/grand_product_library.hpp`
5. `honk/proof_system/logderivative_library.hpp`
6. `honk/proof_system/types/proof.hpp`
7. `common/type_traits.hpp`
8. `honk/types/public_inputs_type.hpp`
9. `honk/utils/honk_key_gen.hpp`
10. `relations/relation_parameters.hpp`

### Circuit to Polynomial Conversion
11. `trace_to_polynomials/trace_to_polynomials.cpp`
12. `trace_to_polynomials/trace_to_polynomials.hpp`

### Flavor Definitions
13. `flavor/flavor.cpp`
14. `flavor/flavor.hpp`
15. `flavor/flavor_macros.hpp`
16. `flavor/mega_flavor.hpp`
17. `flavor/mega_recursive_flavor.hpp`
18. `flavor/mega_zk_flavor.hpp`
19. `flavor/mega_zk_recursive_flavor.hpp`
20. `flavor/relation_definitions.hpp`
21. `flavor/repeated_commitments_data.hpp`
22. `flavor/ultra_flavor.hpp`
23. `flavor/ultra_keccak_flavor.hpp`
24. `flavor/ultra_keccak_zk_flavor.hpp`
25. `flavor/ultra_recursive_flavor.hpp`
26. `flavor/ultra_zk_flavor.hpp`
27. `flavor/ultra_zk_recursive_flavor.hpp`

### Ultra Honk Prover/Verifier
28. `ultra_honk/oink_prover.cpp`
29. `ultra_honk/oink_prover.hpp`
30. `ultra_honk/oink_verifier.cpp`
31. `ultra_honk/oink_verifier.hpp`
32. `ultra_honk/prover_instance.cpp`
33. `ultra_honk/prover_instance.hpp`
34. `ultra_honk/ultra_prover.cpp`
35. `ultra_honk/ultra_prover.hpp`
36. `ultra_honk/ultra_verifier.cpp`
37. `ultra_honk/ultra_verifier.hpp`
38. `ultra_honk/verifier_instance.hpp`

### Stdlib Honk Verifier
39. `stdlib/honk_verifier/ipa_accumulator.hpp`
40. `stdlib/honk_verifier/verifier_instance.cpp`
41. `stdlib/honk_verifier/ultra_verification_keys_comparator.hpp`
42. `stdlib/proof/proof.hpp`

### Public Input Components
43. `public_input_component/public_component_key.hpp`
44. `public_input_component/public_input_component.hpp`

### DSL/ACIR Recursion
45. `dsl/acir_format/recursion_constraint.hpp`
46. `dsl/acir_format/recursion_constraint.cpp`
47. `dsl/acir_format/recursion_constraint_output.hpp`
48. `dsl/acir_format/recursion_constraint_output.cpp`
49. `dsl/acir_format/honk_recursion_constraint.hpp`
50. `dsl/acir_format/honk_recursion_constraint.cpp`
51. `dsl/acir_format/mock_verifier_inputs.hpp`

## Summary of Module

The Honk proving system is Barretenberg's core SNARK proving system implementing Ultra and Mega arithmetization schemes with Sumcheck-based argument of knowledge. The module handles proof generation and verification for complex arithmetic circuits using the Sumcheck protocol, log-derivative lookup arguments for table lookups, and grand product permutation checks for copy constraints.

- **Flavors.** The flavor definitions provide compile-time configuration for different proving system variants (Ultra, Mega, UltraKeccak) including their recursive and zero-knowledge versions. They specify polynomial types, commitment schemes, and relation sets.
- **Oink and the Ultra prover/verifier.** The Oink protocol separates preprocessing rounds (wire commitments, sorted list accumulator) from the main proving phase. The ultra_honk implementation provides the main prover and verifier logic, witness computation, and integration with polynomial commitment schemes (KZG and IPA).
- **trace_to_polynomials.** Converts execution traces from circuit builders into polynomial representations, populating wires, selectors, and permutation polynomials.

## Test Files
1. `honk/relation_checker.cpp`
2. `honk/relation_checker.hpp`
3. `honk/composer/composer_lib.test.cpp`
4. `ultra_honk/ultra_honk.test.cpp`
5. `ultra_honk/mega_honk.test.cpp`
6. `ultra_honk/relation_correctness.test.cpp`
7. `ultra_honk/honk_transcript.test.cpp`
8. `ultra_honk/databus.test.cpp`
9. `ultra_honk/sumcheck.test.cpp`
10. `ultra_honk/oink_prover.test.cpp`
11. `ultra_honk/permutation.test.cpp`
12. `ultra_honk/lookup.test.cpp`
13. `ultra_honk/rom_ram.test.cpp`
14. `ultra_honk/range_constraint.test.cpp`
15. `dsl/acir_format/honk_recursion_constraint.test.cpp`
16. `stdlib/honk_verifier/honk_recursive_verifier.test.cpp`
17. `ultra_honk/zk_boundary.test.cpp`
18. `ultra_honk/failure_test_utils.hpp`

## Security Mechanisms

- **Boomerang value detection**: `RecursiveVerifierTest::GraphAnalysisOfRecursiveVerifier` in `stdlib/honk_verifier/honk_recursive_verifier.test.cpp` uses `StaticAnalyzer` to detect potentially unconstrained witnesses in the recursive verifier.

