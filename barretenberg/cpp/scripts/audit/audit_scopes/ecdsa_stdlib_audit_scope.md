# ECDSA Audit Scope: Module

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

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

Files 5. to 6. contain our native implementation of:
- ECDSA signature algorithm
- ECDSA verification algorithm
- ECDSA public key recovery algorithm

#### HMAC
HMAC (Hash-based Message Authentication Code) is a cryptographic authentication mechanism. It is used within ECDSA for deterministic nonce generation (RFC 6979) to prevent vulnerabilities from weak random number generators.

File 7. contains our native implementation of HMAC and of deterministic nonce derivation following RFC6979, see links in the code.

#### Hashers
The hashers module provides uniform wrapper interfaces around different hash function implementations (SHA256, BLAKE2s, Keccak256). These wrappers allow ECDSA and other signature schemes to be templated on the hash function type, providing consistent `hash()` interfaces and metadata (BLOCK_SIZE, OUTPUT_SIZE) across different hash algorithms.


## Test Files
1. `dsl/acir_format/ecdsa_constraints.test.cpp`
2. `stdlib/encryption/ecdsa/ecdsa.test.cpp`
3. `stdlib/encryption/ecdsa/ecdsa_tests_data.hpp`
4. `crypto/hmac/hmac.test.cpp`
5. `crypto/ecdsa/ecdsa.test.cpp`
5. `crypto/ecdsa/hashers.test.cpp`

## Security Mechanisms

None
