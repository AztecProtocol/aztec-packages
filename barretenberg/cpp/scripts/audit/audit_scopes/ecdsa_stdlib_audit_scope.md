# ECDSA Audit Scope: Module

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 05a381f8b31ae4648e480f1369e911b148216e8b

## Files to Audit
**Note:** all paths are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `dsl/acir_format/ecdsa_constraints.hpp`
2. `dsl/acir_format/ecdsa_constraints.cpp`
3. `stdlib/encryption/ecdsa/ecdsa.hpp`
4. `stdlib/encryption/ecdsa/ecdsa_impl.hpp`
5. `crypto/ecdsa/ecdsa.hpp`
6. `crypto/ecdsa/ecdsa_impl.hpp`
7. `crypto/hmac/hmac.hpp`
8. `crypto/hashers/hashers.hpp`


## Brief Summary of Module

The files 1. to 4. above contain our implementation of the ECDSA verification algorithm and its exposure to Noir. For more details about the algorithm see the documentation in `stdlib/encryption/ecdsa/ecdsa_impl.hpp`, while for details about the usage via Noir see the documentation in `dsl/acir_format/ecdsa_constraints.hpp` and `dsl/acir_format/ecdsa_constraints.cpp`

Files 3. and 4. implement ECDSA verification, while 1. and 2. expose usage of the algorithm to Noir.

Files 5. to 6. contain our native implementation of the ECDSA signature, verification, and recovery algorithms. See the documentation contained in the various files for references to the algorithms implemented.

File 7. contains our native implementation of HMAC and of deterministic nonce derivation following RFC6979, see links in the code.

File 8. exposes the hash functions Keccak, Sha256, and Blake2s as hashers to be used in ECDSA.


## Test Files
1. `dsl/acir_format/ecdsa_constraints.test.cpp`
2. `stdlib/encryption/ecdsa/ecdsa.test.cpp`
3. `stdlib/encryption/ecdsa/ecdsa_tests_data.hpp`
4. `crypto/hmac/hmac.test.cpp`
5. `crypto/ecdsa/ecdsa.test.cpp`

## Security Mechanisms

None
