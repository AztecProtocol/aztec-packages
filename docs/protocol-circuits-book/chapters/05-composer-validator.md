# Chapter 5: The Composer and Validator Pattern

## Overview

All protocol circuits in Aztec follow a consistent architectural pattern that separates **output generation** from **output validation**. This pattern, called "Composer + Validator," is fundamental to understanding how the circuits achieve both efficiency and security.

## The Problem

Zero-knowledge circuits have a fundamental tension:

1. **Complex computations** (sorting, filtering, aggregation) are expensive in constraints
2. **Security** requires that all outputs be provably correct
3. **Efficiency** demands minimal constraint counts for fast proving

How can we perform complex operations while keeping circuits efficient?

## The Solution: Unconstrained Generation + Constrained Validation

The insight is that it's often cheaper to:
1. Compute the answer without constraints (unconstrained)
2. Verify the answer is correct with constraints (constrained)

```
Traditional Approach:
  Input -> [Constrained Computation] -> Output
  (Many constraints for complex logic)

Composer + Validator Approach:
  Input -> [Unconstrained Composer] -> Output
                                         |
                                         v
                              [Constrained Validator]
                                         |
                                         v
                                 Verified Output
```

### Example: Sorting

**Traditional:** Implement a full sorting algorithm in constraints - O(n log n) comparisons, all constrained.

**Composer + Validator:**
1. **Composer** (unconstrained): Sort the array using any algorithm
2. **Validator** (constrained): Verify the output is sorted and contains the same elements

```
Input:  [5, 2, 8, 1, 9]

Unconstrained Composer:
  -> Sorts using quicksort (no constraints)
  -> Output: [1, 2, 5, 8, 9]

Constrained Validator:
  -> Check: output[i] <= output[i+1] for all i  (4 comparisons)
  -> Check: permutation of input equals output  (via accumulator)
  -> Total: O(n) constraints instead of O(n log n)
```

## Implementation in Protocol Circuits

### File Organization

Each circuit type has paired files:

```
components/
  private_kernel_circuit_output_composer.nr   <- Unconstrained
  private_kernel_circuit_output_validator.nr  <- Constrained
  
  reset_output_composer.nr                    <- Unconstrained
  reset_output_validator.nr                   <- Constrained
  
  tail_output_composer.nr                     <- Unconstrained
  tail_output_validator.nr                    <- Constrained
```

### Output Composer (Unconstrained)

The composer file contains functions marked `unconstrained`:

```rust
// In private_kernel_circuit_output_composer.nr

unconstrained fn compose_output(
    inputs: PrivateKernelCircuitInputs
) -> PrivateKernelCircuitPublicInputs {
    // Complex operations without constraints:
    // - Array manipulations
    // - Sorting
    // - Filtering
    // - Aggregation
    
    let mut output = PrivateKernelCircuitPublicInputs::empty();
    
    // ... build the output ...
    
    output
}
```

Key characteristics:
- Runs without generating constraints
- Can use any Rust/Noir constructs (loops, complex conditionals)
- Produces a "hint" (proposed output) for the validator
- If buggy, the validator will reject the output

### Output Validator (Constrained)

The validator file contains constrained functions:

```rust
// In private_kernel_circuit_output_validator.nr

fn validate_output(
    inputs: PrivateKernelCircuitInputs,
    output: PrivateKernelCircuitPublicInputs
) {
    // All assertions generate constraints:
    
    // Verify arrays were correctly propagated
    assert_array_prepended(
        inputs.previous_kernel.note_hashes,
        output.note_hashes
    );
    
    // Verify values were correctly computed
    assert_eq(
        output.fee_payer,
        expected_fee_payer
    );
}
```

Key characteristics:
- Every operation generates constraints
- Uses specialized validation functions (not generic sorting)
- Rejects invalid outputs (proof fails to generate)
- Auditors focus here for security review

## Validation Functions

The codebase provides many specialized validation functions:

### Array Operations

```rust
// Verify array B is array A with items prepended
assert_array_prepended(source, dest, length)

// Verify array B is array A with items appended
assert_array_appended(source, dest, prev_length, new_length)

// Verify array is sorted by counter
assert_sorted_by_counter(array, length)

// Verify array A and B are a permutation of each other
assert_permutation(array_a, array_b)
```

### Transformation Validation

```rust
// Verify each item was correctly transformed (e.g., siloed)
assert_transformed_array(source, dest, transform_fn)

// Verify sorting + transformation in one pass
assert_sorted_transformed_array(source, dest, sort_key, transform_fn)
```

### Split Validation (for TailToPublic)

```rust
// Verify an array was correctly split into two arrays
assert_split_sorted_transformed_arrays(
    source,
    dest_non_revertible,
    dest_revertible,
    split_counter
)
```

## Data Flow Diagram

```
                    Circuit Inputs
                         |
                         v
+---------------------------------------------+
|           OUTPUT COMPOSER (unconstrained)    |
|                                              |
|  1. Read inputs                              |
|  2. Perform complex transformations          |
|  3. Generate proposed output                 |
|                                              |
+---------------------------------------------+
                         |
                         v
                  Proposed Output
                         |
                         v
+---------------------------------------------+
|           OUTPUT VALIDATOR (constrained)     |
|                                              |
|  1. Receive inputs + proposed output         |
|  2. Verify all relationships hold            |
|  3. Assert correctness constraints           |
|                                              |
+---------------------------------------------+
                         |
                         v
              Verified Circuit Output
              (included in proof)
```

## Security Considerations

### For Auditors

The validator is the security-critical component. When reviewing:

1. **Check completeness**: Does the validator verify ALL aspects of the output?
2. **Check constraint coverage**: Is every output field constrained?
3. **Check edge cases**: Empty arrays, maximum sizes, boundary conditions
4. **Check transformation correctness**: Are siloing/hashing operations correct?

### Common Pitfalls

```rust
// BAD: Output field not validated
fn validate_output(inputs, output) {
    // Forgot to validate output.some_field
    // Prover could set it to anything!
}

// GOOD: All fields validated
fn validate_output(inputs, output) {
    validate_field_a(inputs, output.field_a);
    validate_field_b(inputs, output.field_b);
    validate_field_c(inputs, output.field_c);
}
```

### The Unconstrained Trust Boundary

Unconstrained code can produce ANY output. The validator must catch ALL invalid outputs:

```rust
unconstrained fn malicious_composer(inputs) {
    let mut output = legitimate_output(inputs);
    
    // Attacker tries to sneak in extra note hash
    output.note_hashes[999] = attacker_note_hash;
    
    output
}

fn validator(inputs, output) {
    // MUST catch this:
    // - Verify note_hashes length matches expected
    // - Verify all note_hashes came from valid sources
}
```

## Benefits of This Pattern

1. **Efficiency**: Complex operations don't add constraints
2. **Clarity**: Separation of concerns - "what" vs "is it correct"
3. **Maintainability**: Easier to modify composers without breaking validators
4. **Testability**: Validators can be tested with known-good and known-bad outputs
5. **Security**: Clear audit boundary (focus on validators)

## Real Code Example: Output Validator

Here's actual code from `private_kernel_circuit_output_validator.nr`:

```rust
/// Validates the output generated by `PrivateKernelCircuitOutputComposer`.
///
/// This validator runs in constrained mode, generating proof constraints
/// that ensure the output is correctly derived from the inputs.

pub struct PrivateKernelCircuitOutputValidator {
    output: PrivateKernelCircuitPublicInputs,
}

impl PrivateKernelCircuitOutputValidator {
    pub fn new(output: PrivateKernelCircuitPublicInputs) -> Self {
        PrivateKernelCircuitOutputValidator { output }
    }

    /// Called by the Inner circuit.
    pub fn validate_as_inner_call(
        self,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        private_call: PrivateCallData,
    ) {
        self.validate_aggregated_values(previous_kernel_public_inputs, private_call);
        self.validate_propagated_from_previous_kernel(previous_kernel_public_inputs);
        self.validate_propagated_from_private_call(
            private_call,
            previous_kernel_public_inputs
        );
    }
```

The validator has separate methods for different validation concerns.

### Aggregated Values Validation

```rust
fn validate_aggregated_values(
    self,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) {
    // min_revertible_side_effect_counter can only be set once.
    let propagated_min_revertible_counter = if previous_kernel
        .min_revertible_side_effect_counter != 0 {
        assert(
            private_call.public_inputs.min_revertible_side_effect_counter == 0,
            "cannot overwrite min_revertible_side_effect_counter",
        );
        previous_kernel.min_revertible_side_effect_counter
    } else {
        private_call.public_inputs.min_revertible_side_effect_counter
    };

    assert_eq(
        self.output.min_revertible_side_effect_counter,
        propagated_min_revertible_counter,
        "incorrect output min_revertible_side_effect_counter",
    );

    // fee_payer can only be set once.
    let propagated_fee_payer = if !previous_kernel.fee_payer.is_empty() {
        assert(!private_call.public_inputs.is_fee_payer, "cannot overwrite fee_payer");
        previous_kernel.fee_payer
    } else if private_call.public_inputs.is_fee_payer {
        private_call.public_inputs.call_context.contract_address
    } else {
        AztecAddress::zero()
    };
    assert_eq(self.output.fee_payer, propagated_fee_payer, "incorrect output fee_payer");
}
```

### Array Propagation Validation

```rust
fn validate_propagated_from_previous_kernel(
    self,
    previous_kernel: PrivateKernelCircuitPublicInputs,
) {
    // Constants must be unchanged
    assert_eq(self.output.constants, previous_kernel.constants, "mismatch constants");

    // All arrays must be prepended correctly
    assert_array_prepended(
        self.output.end.note_hashes,
        previous_kernel.end.note_hashes,
    );
    assert_array_prepended(
        self.output.end.nullifiers,
        previous_kernel.end.nullifiers,
    );
    assert_array_prepended(
        self.output.end.l2_to_l1_msgs,
        previous_kernel.end.l2_to_l1_msgs,
    );
    // ... more arrays ...

    // Private call stack excludes the top item (we just processed it)
    assert_array_prepended_up_to_some_length(
        self.output.end.private_call_stack,
        previous_kernel.end.private_call_stack,
        previous_kernel.end.private_call_stack.length - 1,
    );
}
```

### New Call Data Validation

```rust
fn validate_propagated_from_private_call(
    self,
    private_call: PrivateCallData,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
) {
    let contract_address = private_call.public_inputs.call_context.contract_address;
    
    // Note hashes: appended AND scoped with contract address
    assert_array_appended_and_scoped(
        self.output.end.note_hashes,
        private_call.public_inputs.note_hashes,
        previous_kernel_public_inputs.end.note_hashes.length,
        contract_address,
    );
    
    // Nullifiers: appended AND scoped
    assert_array_appended_and_scoped(
        self.output.end.nullifiers,
        private_call.public_inputs.nullifiers,
        previous_kernel_public_inputs.end.nullifiers.length,
        contract_address,
    );
    
    // Private call requests: appended in REVERSED order (LIFO stack)
    assert_array_appended_reversed(
        self.output.end.private_call_stack,
        private_call.public_inputs.private_call_requests,
        previous_kernel_public_inputs.end.private_call_stack.length - 1,
    );
}
```

**Key observations for auditors:**
1. Each array type has its own validation
2. Some arrays need scoping (note_hashes, nullifiers)
3. Call stack is reversed (LIFO behavior)
4. Length arithmetic must be correct

## Real Code Example: Array Append with Scoping

From `assert_array_appended.nr`:

```rust
/// Validates that source items are appended and scoped with contract address.
pub fn assert_array_appended_and_scoped<T, let N: u32, let M: u32>(
    dest: ClaimedLengthArray<Scoped<T>, N>,
    source: ClaimedLengthArray<T, M>,
    num_prepended_items: u32,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    source.for_each_i(|source_item, i| {
        let dest_item = dest.array[num_prepended_items + i];
        
        // Value must match
        assert_eq(dest_item.inner, source_item, 
            "source item does not append to dest");
        
        // Contract address must match
        assert_eq(dest_item.contract_address, contract_address,
            "propagated contract address does not match");
    });

    // Total length must be correct
    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}
```

This function validates three things:
1. Each source item appears at the correct position in dest
2. Each item is tagged with the correct contract address
3. The total length is exactly `previous_length + new_items`

\newpage
