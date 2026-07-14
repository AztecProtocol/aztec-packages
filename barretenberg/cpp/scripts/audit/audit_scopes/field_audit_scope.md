# External Audit Scope: field

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `stdlib/primitives/field/field.hpp`
2. `stdlib/primitives/field/field.cpp`

## Summary of Module

The `field_t` implements field elements inside a circuit, supporting both constant (compile-time known) values and witness (runtime) values.

### Key Features

**Representation**: Each `field_t` stores:
- `multiplicative_constant`: Scalar multiplier applied to the witness value
- `additive_constant`: Constant offset added to the scaled witness
- `witness_index`: Reference to the underlying witness variable (or `IS_CONSTANT` for constants)
- `context`: Pointer to the circuit builder

The effective value is: `multiplicative_constant * witness + additive_constant`

**Operations**: Implements full field arithmetic (+, -, *, /) with optimized gate generation:
- Addition/subtraction: Typically free (updates constants without adding gates)
- Multiplication: Uses `create_big_mul_gate` for witness products, optimized paths for constants
- Division: Implemented via multiplication by inverse with `assert_is_not_zero` check

**Normalization**: The `normalize()` method collapses a `field_t` with non-trivial constants into a single witness value, required before certain operations.

**Constraint Generation**: Methods like `assert_is_zero()`, `assert_is_not_zero()`, `assert_equal()` create arithmetic constraints ensuring values satisfy conditions at proof time.

## Test Files
1. `stdlib/primitives/field/field.test.cpp`

## Security Mechanisms
1. Fuzzer: `stdlib/primitives/field/field.fuzzer.hpp`
2. Fuzzer: `stdlib/primitives/field/field_ultra.fuzzer.cpp`
