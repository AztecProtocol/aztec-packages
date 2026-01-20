# External Audit Scope: Biggroup

Repository: https://github.com/AztecProtocol/aztec-packages

Commit hash: [553c5eb82901955c638b943065acd3e47fc918c0](https://github.com/AztecProtocol/aztec-packages/tree/553c5eb82901955c638b943065acd3e47fc918c0)

## Files to Audit

The following files are to be audited, located in the `stdlib/primitives/biggroup` module (in no particular order):

1. `stdlib/primitives/biggroup/biggroup.hpp`
2. `stdlib/primitives/biggroup/biggroup_impl.hpp`
3. `stdlib/primitives/biggroup/biggroup_nafs.hpp`
4. `stdlib/primitives/biggroup/biggroup_tables.hpp`
5. `stdlib/primitives/biggroup/biggroup_secp256k1.hpp`
6. `stdlib/primitives/biggroup/biggroup_edgecase_handling.hpp`
7. `stdlib_circuit_builders/plookup_tables/non_native_group_generator.cpp`
8. `stdlib_circuit_builders/plookup_tables/non_native_group_generator.hpp`

## Brief Summary of Module

The biggroup module implements elliptic-curve operations using UltraHonk arithmetisation in barretenberg. This is specifically implemented to work for three curves: bn254, secp256k1 and secp256r1 (see Note 1).

Please refer to the [biggroup README](https://github.com/AztecProtocol/aztec-packages/blob/553c5eb82901955c638b943065acd3e47fc918c0/barretenberg/cpp/src/barretenberg/stdlib/primitives/biggroup/README.md) for details on the specification and implementation details (see Note 2).

> Note 1: Our implementation can _technically_ work for other curves as well (so long as the base and scalar fields of the curve can be represented with our bigfield module) but we have not tested it for other curves.
>
> Note 2: The README uses Latex notation which doesn't render well on Github, you might need to use Markdown preview in VS code to render the file.

## Test Files

1. `stdlib/primitives/biggroup/biggroup.test.cpp`
2. `stdlib/primitives/biggroup/biggroup_secp256k1.test.cpp`
