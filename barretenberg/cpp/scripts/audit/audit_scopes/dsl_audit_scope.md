# DSL Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 (22.12.2025)

## Files to Audit
**Note:** all paths are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `dsl/acir_format/acir_to_constraint_buf.hpp`
2. `dsl/acir_format/acir_to_constraint_buf.cpp`
3. `dsl/acir_format/acir_format.hpp`
4. `dsl/acir_format/acir_format.cpp`
5. `dsl/acir_format/arithmetic_constraints.hpp`
6. `dsl/acir_format/arithmetic_constraints.cpp`
7. `dsl/acir_format/round.hpp`
8. `dsl/acir_format/round.cpp`
9. `dsl/acir_format/utils.hpp`
10. `dsl/acir_format/utils.cpp`

## Brief Summary of Module

The DSL module is the interface between Noir and barretenberg. The code implemented in DSL takes the byte serialization of a Noir program and constructs a circuit out of it. The flow of information is as follows (see also `dsl/acir_format/README.md`):
1. Byte serialization is deserialized into an `AcirFormat` struct (handled by the code in `acir_to_constriant_buf`)
2. The `AcirFormat` struct is passed to the function `create_circuit` in `acir_format`, which constructs a circuit by adding the relevant constraints.

All constraints except arithmetic constraints work as follows:
1. Bytes deserialised into Barretenberg's internal representation (`acir_to_constraint_buf`)
2. Iterate through all instances of the given constraint and add the constraint to the circuit (`acir_format`)

Arithmetic constraints work slighly differently because we leverage the UltraHonk arithmetisation to efficiently encode expressions of the following form:
$
\sum_{i, j} c_{i,j} w_i w_j + \sum_i c_i w_i + c = 0
$ where $w_i$ are witnesses, $c_{i,j}, c_i$ are the coefficients of the equation, and $c$ is the constant term. For a detailed explanation of how we leverage the UltraHonk arithmetisation to encode arithmetic constraints see the documentation for the functions `acir_to_constraint_buf::split_into_mul_quad_gates` and `arithmetic_constraints::create_big_quad_constraint`.

The difference in how arithmetic constraints are handled is the reason why they are the only constraints that are part of this audit scope: to be sure that no bugs are present, the entire flow (from bytes to to constraints) has to be audited for arithmetic constraints.



## Test Files
1. `dsl/acir_format/acir_format.test.cpp`
2. `dsl/acir_format/arithmetic_constraints.test.cpp`

## Security mechanism

1. Fuzzer (`dsl/acir_format/acir_dsl.fuzzer.cpp`). **Note:** The fuzzer only tests basic cases.
