# ECDSA Audit Scope: Module

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 05a381f8b31ae4648e480f1369e911b148216e8b

## Files to Audit
**Note:** all paths are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `dsl/acir_format/ecdsa_constraints.hpp`
2. `dsl/acir_format/ecdsa_constraints.cpp`
3. `stdlib/encryption/ecdsa/ecdsa.hpp`
4. `stdlib/encryption/ecdsa/ecdsa_impl.hpp`

## Brief Summary of Module

The files above contain our implementation of the ECDSA verification algorithm and its exposure to Noir. For more details about the algorithm see the documentation in `stdlib/encryption/ecdsa/ecdsa_impl.hpp`, while for details about the usage via Noir see the documentation in `dsl/acir_format/ecdsa_constraints.hpp` and `dsl/acir_format/ecdsa_constraints.cpp`

Files 3. and 4. implement ECDSA verification, while 1. and 2. expose usage of the algorithm to Noir.

## Test Files
1. `dsl/acir_format/ecdsa_constraints.test.cpp`
2. `stdlib/encryption/ecdsa/ecdsa.test.cpp`
3. `stdlib/encryption/ecdsa/ecdsa_tests_data.hpp`

## Security Mechanisms

None
