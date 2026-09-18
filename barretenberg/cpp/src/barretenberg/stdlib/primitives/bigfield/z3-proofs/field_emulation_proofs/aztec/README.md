This module verifies the soundness of Aztec circuits. The proofs correspond to
the Aztec codebase at commit `480f49dad314ea4e753ff1e5180992a16926d2b3`.

The following properties were verified:

1. The `bigfield` invariants imply there is a well-defined integer in the range `[0, M)` which corresponds to the binary basis limbs modulo `2**T` and the prime basis limb modulo `n`.
2. The `create_big_add_gate()` constraints are correct.
3. The `create_big_mul_gate()` constraints are correct.
4. The `evaluate_non_native_field_multiplication()` constraints, along with the necessary range checks imply the expected expression is 0 modulo `2**T`.

This is done with a few caveats:
1. The arithmetic and auxiliary relations are encoded based on the documentation of the relations in the Aztec codebase.
2. The exact range checks applied by Aztec are more strict, and rely on accurately tracking a "maximum value" for each limb. Instead, we replace those bounds with their expected maximum value.
3. The bound checks on `evaluate_non_native_field_multiplication()` assume it is being called from `unsafe_evaluate_multiply_add()`, and are stricter than the inputs provided when invoking `unsafe_evaluate_multiple_multiply_add()`
