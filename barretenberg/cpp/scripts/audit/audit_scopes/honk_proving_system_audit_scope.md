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

### Circuit to Polynomial Conversion
12. `trace_to_polynomials/trace_to_polynomials.cpp`
13. `trace_to_polynomials/trace_to_polynomials.hpp`

### Ultra Honk Prover/Verifier
14. `ultra_honk/failure_test_utils.hpp`
15. `ultra_honk/oink_prover.cpp`
16. `ultra_honk/oink_prover.hpp`
17. `ultra_honk/oink_verifier.cpp`
18. `ultra_honk/oink_verifier.hpp`
19. `ultra_honk/prover_instance.cpp`
20. `ultra_honk/prover_instance.hpp`
21. `ultra_honk/ultra_prover.cpp`
22. `ultra_honk/ultra_prover.hpp`
23. `ultra_honk/ultra_verifier.cpp`
24. `ultra_honk/ultra_verifier.hpp`
25. `ultra_honk/verifier_instance.hpp`
26. `ultra_honk/witness_computation.cpp`
27. `ultra_honk/witness_computation.hpp`

## Summary of Module

The Honk proving system is Barretenberg's core SNARK proving system implementing Ultra and Mega arithmetization schemes with Sumcheck-based argument of knowledge. The module handles proof generation and verification for complex arithmetic circuits using the Sumcheck protocol, log-derivative lookup arguments for table lookups, and grand product permutation checks for copy constraints. The Oink protocol separates preprocessing rounds (wire commitments, sorted list accumulator) from the main proving phase. The trace_to_polynomials component converts execution traces from circuit builders into polynomial representations, populating wires, selectors, and permutation polynomials. The ultra_honk implementation provides the main prover and verifier logic, witness computation, and integration with polynomial commitment schemes (KZG and IPA).

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

## Security Mechanisms

