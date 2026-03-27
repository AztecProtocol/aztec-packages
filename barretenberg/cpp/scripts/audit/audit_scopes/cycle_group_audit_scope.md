# External Audit Scope: cycle_group

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `stdlib/primitives/group/cycle_group.hpp`
2. `stdlib/primitives/group/cycle_group.cpp`
3. `stdlib/primitives/group/cycle_scalar.hpp`
4. `stdlib/primitives/group/cycle_scalar.cpp`
5. `stdlib/primitives/group/straus_lookup_table.hpp`
6. `stdlib/primitives/group/straus_lookup_table.cpp`
7. `stdlib/primitives/group/straus_scalar_slice.hpp`
8. `stdlib/primitives/group/straus_scalar_slice.cpp`
9. `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp`
10. `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.cpp`
11. `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base_params.hpp`
12. `crypto/generators/generator_data.hpp`
13. `stdlib_circuit_builders/ultra_circuit_builder.cpp` (**limit to methods:** `create_ecc_add_gate()`, `create_ecc_dbl_gate()`)
14. `relations/elliptic_relation.hpp`
15. `dsl/acir_format/ec_operations.hpp`
16. `dsl/acir_format/ec_operations.cpp`
17. `dsl/acir_format/multi_scalar_mul.hpp`
18. `dsl/acir_format/multi_scalar_mul.cpp`
19. `dsl/acir_format/witness_constant.hpp`
20. `dsl/acir_format/witness_constant.cpp`

## Summary of Module

The `cycle_group` module provides implementations of in-circuit elliptic curve operations over the Grumpkin curve, the embedded curve for Barretenberg's BN254-based proving system. Grumpkin is a cofactor-1 curve defined over BN254's scalar field, making its base field operations native to the circuit.

For more details see [`src/barretenberg/stdlib/primitives/group/README.md`](https://github.com/AztecProtocol/aztec-packages-private/blob/a48c205d6dcd4338f5b83b4fda18bff6015be07b/barretenberg/cpp/src/barretenberg/stdlib/primitives/group/README.md)

## Test Files
1. `stdlib/primitives/group/cycle_group.test.cpp`
2. `stdlib/primitives/group/cycle_scalar.test.cpp`
3. `stdlib/primitives/group/straus_lookup_table.test.cpp`
4. `stdlib/primitives/group/straus_scalar_slice.test.cpp`
5. `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.test.cpp`
6. `stdlib/primitives/group/test_utils.hpp`
7. `dsl/acir_format/ec_operations.test.cpp`
8. `dsl/acir_format/multi_scalar_mul.test.cpp`
9. `circuit_checker/ultra_circuit_builder_elliptic.test.cpp`

## Security Mechanisms
1. Fuzzer: `stdlib/primitives/group/cycle_group.fuzzer.hpp`
