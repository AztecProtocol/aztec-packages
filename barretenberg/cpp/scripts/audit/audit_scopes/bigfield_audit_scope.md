# External Audit Scope: Bigfield

Repository: https://github.com/AztecProtocol/aztec-packages-private

Commit hash: Most recent commit on branch 'next'

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `stdlib/primitives/bigfield/bigfield.hpp`
2. `stdlib/primitives/bigfield/bigfield_impl.hpp`
3. `stdlib/primitives/bigfield/constants.hpp`

Relations: (wasn't explicitly in the SoW but was still audited)

4. `relations/non_native_field_relations.hpp`

## Summary of Module

The `bigfield` module implements non-native field arithmetic inside a circuit. It enables arithmetic operations on field elements from a different (larger) field than the native circuit field, which is essential for operations like

- Recursive verification of BN254-based proofs inside BN254 circuits, and
- ECDSA verification where we need to work with secp256k1/r1 field elements inside BN254-based circuits.

**Representation**: Each `bigfield` element is represented using:

- 4 binary basis limbs of 68 bits each (total 272 bits)
- A prime basis limb (the value mod native field modulus)
- Maximum value tracking for each limb to enable lazy reduction

The value is: `limb[0] + limb[1] * 2^68 + limb[2] * 2^136 + limb[3] * 2^204`

**Operations**: Implements full field arithmetic (+, -, \*, /) with:

- Lazy reduction to minimize expensive range checks
- Chinese Remainder Theorem (CRT) for efficient multiplication verification
- Optimized gate usage (4 gates for addition, custom gates for multiplication)

**CRT-based Multiplication**: To verify `a * b = r mod p`:

- Checks equation holds mod 2^272 (binary basis) via schoolbook multiplication
- Checks equation holds mod native field (prime basis) via single multiplication gate
- Ensures both sides are less than CRT modulus `M = 2^272 * n`

**Range Tracking**: The module tracks maximum values of limbs to:

- Determine when reduction is needed before overflow
- Compute appropriate range constraints for quotient/carry values
- Enable batching multiple operations before reduction

Please refer to the [bigfield README](https://github.com/AztecProtocol/aztec-packages-private/blob/d0ee94134b6cf290cf93cccf30354278d2bdff59/barretenberg/cpp/src/barretenberg/stdlib/primitives/bigfield/README.md) for detailed specification of the multiplication, addition, subtraction, and division algorithms.

> Note: The README uses LaTeX notation which doesn't render well on GitHub; you might need to use Markdown preview in VS Code to render the file.

## Test Files

1. `stdlib/primitives/bigfield/bigfield.test.cpp`
