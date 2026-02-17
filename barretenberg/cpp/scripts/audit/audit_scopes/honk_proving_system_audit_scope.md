# External Audit Scope: honk_proving_system

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Honk Infrastructure
1. `honk/composer/composer_lib.hpp`
2. `honk/composer/permutation_lib.hpp`
3. `honk/library/grand_product_delta.hpp`
4. `honk/library/grand_product_library.hpp`
5. `honk/proof_system/logderivative_library.hpp`
6. `honk/proof_system/types/proof.hpp`
7. `honk/types/circuit_type.hpp`
8. `honk/types/public_inputs_type.hpp`
9. `honk/utils/honk_key_gen.hpp`
10. `honk/utils/testing.cpp`
11. `honk/utils/testing.hpp`
12. `relations/relation_parameters.hpp`

### Circuit to Polynomial Conversion
13. `trace_to_polynomials/trace_to_polynomials.cpp`
14. `trace_to_polynomials/trace_to_polynomials.hpp`

### Flavor Definitions
15. `flavor/flavor.cpp`
16. `flavor/flavor.hpp`
17. `flavor/flavor_macros.hpp`
18. `flavor/mega_flavor.hpp`
19. `flavor/mega_recursive_flavor.hpp`
20. `flavor/mega_zk_flavor.hpp`
21. `flavor/mega_zk_recursive_flavor.hpp`
22. `flavor/relation_definitions.hpp`
23. `flavor/repeated_commitments_data.hpp`
24. `flavor/ultra_flavor.hpp`
25. `flavor/ultra_keccak_flavor.hpp`
26. `flavor/ultra_keccak_zk_flavor.hpp`
27. `flavor/ultra_recursive_flavor.hpp`
28. `flavor/ultra_rollup_flavor.hpp`
29. `flavor/ultra_rollup_recursive_flavor.hpp`
30. `flavor/ultra_zk_flavor.hpp`
31. `flavor/ultra_zk_recursive_flavor.hpp`

### Ultra Honk Prover/Verifier
32. `ultra_honk/oink_prover.cpp`
33. `ultra_honk/oink_prover.hpp`
34. `ultra_honk/oink_verifier.cpp`
35. `ultra_honk/oink_verifier.hpp`
36. `ultra_honk/prover_instance.cpp`
37. `ultra_honk/prover_instance.hpp`
38. `ultra_honk/ultra_prover.cpp`
39. `ultra_honk/ultra_prover.hpp`
40. `ultra_honk/ultra_verifier.cpp`
41. `ultra_honk/ultra_verifier.hpp`
42. `ultra_honk/verifier_instance.hpp`
43. `ultra_honk/witness_computation.cpp`
44. `ultra_honk/witness_computation.hpp`

### Stdlib Honk Verifier
45. `stdlib/honk_verifier/ipa_accumulator.hpp`
46. `stdlib/proof/proof.hpp`

### Public Input Components
47. `public_input_component/public_component_key.hpp`
48. `public_input_component/public_input_component.hpp`

### DSL/ACIR Recursion
49. `dsl/acir_format/recursion_constraint.hpp`
50. `dsl/acir_format/recursion_constraint.cpp`
51. `dsl/acir_format/recursion_constraint_output.hpp`
52. `dsl/acir_format/recursion_constraint_output.cpp`
53. `dsl/acir_format/honk_recursion_constraint.hpp`
54. `dsl/acir_format/honk_recursion_constraint.cpp`
53. `dsl/acir_format/mock_verifier_inputs.hpp`

## Summary of Module

The Honk proving system is Barretenberg's core SNARK proving system implementing Ultra and Mega arithmetization schemes with Sumcheck-based argument of knowledge. The module handles proof generation and verification for complex arithmetic circuits using the Sumcheck protocol, log-derivative lookup arguments for table lookups, and grand product permutation checks for copy constraints. The flavor definitions provide compile-time configuration for different proving system variants (Ultra, Mega, UltraRollup, UltraKeccak) including their recursive and zero-knowledge versions, specifying polynomial types, commitment schemes, and relation sets. The Oink protocol separates preprocessing rounds (wire commitments, sorted list accumulator) from the main proving phase. The trace_to_polynomials component converts execution traces from circuit builders into polynomial representations, populating wires, selectors, and permutation polynomials. The ultra_honk implementation provides the main prover and verifier logic, witness computation, and integration with polynomial commitment schemes (KZG and IPA).

## Test Files
1. `honk/relation_checker.cpp`
2. `honk/relation_checker.hpp`
3. `honk/composer/composer_lib.test.cpp`
4. `ultra_honk/ultra_honk.test.cpp`
5. `ultra_honk/mega_honk.test.cpp`
6. `ultra_honk/relation_correctness.test.cpp`
7. `ultra_honk/ultra_transcript.test.cpp`
8. `ultra_honk/mega_transcript.test.cpp`
9. `ultra_honk/databus.test.cpp`
10. `ultra_honk/sumcheck.test.cpp`
11. `ultra_honk/oink_prover.test.cpp`
12. `ultra_honk/permutation.test.cpp`
13. `ultra_honk/lookup.test.cpp`
14. `ultra_honk/rom_ram.test.cpp`
15. `ultra_honk/range_constraint.test.cpp`
16. `dsl/acir_format/honk_recursion_constraint.test.cpp`

## Security Mechanisms

