# Private Kernel Components

This directory contains the core components used by the private kernel circuits (Init, Inner, Reset, Tail, and TailToPublic).

## Architectural Pattern: Composer + Validator

The private kernel circuits follow a consistent architectural pattern that separates **output generation** from **output validation**:

### Output Composer (Unconstrained)

The `*_output_composer.nr` files contain unconstrained functions that generate the circuit's output. These functions:

- Run in unconstrained mode for efficiency (no constraint generation)
- Perform complex data transformations (sorting, filtering, aggregation)
- Produce a complete output structure that will be validated

Example: `PrivateKernelCircuitOutputComposer` generates the `PrivateKernelCircuitPublicInputs` by:

- Initializing constant data from the tx request
- Propagating and scoping side effects from private calls
- Accumulating validation requests

### Output Validator (Constrained)

The `*_output_validator.nr` files contain constrained functions that verify the composer's output is correct. These functions:

- Run in constrained mode (generate constraints that the prover must satisfy)
- Verify that arrays were correctly propagated/appended
- Check that values were correctly aggregated or transformed
- Ensure the output matches what it should be given the inputs

Example: `PrivateKernelCircuitOutputValidator` verifies:

- Initial values are correctly set from inputs
- Arrays from previous kernel are correctly prepended to output
- Arrays from private call are correctly appended (and scoped) to output
- Aggregated values (fee_payer, min_revertible_counter, etc.) are correct

### Why This Pattern?

1. **Efficiency**: Complex operations like sorting are expensive in constraints. By doing them unconstrained and only validating the result, we minimize proving costs.

2. **Clarity**: Separating "what to compute" from "how to verify it" makes the code easier to understand.

3. **Security**: The validator ensures that if the unconstrained composer is buggy or the output is manipulated, the proof will fail to verify.

### Data Flow

```
Inputs (tx_request, private_call, previous_kernel, etc.)
    │
    ▼
┌─────────────────────────────────┐
│  Output Composer (unconstrained) │
│  - Generates output hints        │
│  - Performs transformations      │
└─────────────────────────────────┘
    │
    ▼
Output (PrivateKernelCircuitPublicInputs)
    │
    ▼
┌─────────────────────────────────┐
│  Output Validator (constrained)  │
│  - Verifies output correctness   │
│  - Generates proof constraints   │
└─────────────────────────────────┘
    │
    ▼
Verified Output (same data, now proven correct)
```

## Input Validation

In addition to output validation, the circuits also validate their inputs:

### PrivateCallDataValidator

Validates the `PrivateCallData` structure, ensuring:

- The proof verifies correctly
- The contract address is correctly derived from the function being executed
- Side effect counters are unique and within bounds
- Call requests have correct msg_senders
- Static call restrictions are enforced

### Previous Kernel Validation

For Inner/Reset/Tail circuits, validates that:

- The previous kernel proof verifies
- The previous kernel's verification key is in the allowed set (vk tree membership)

## Component Overview

| Component                                    | Purpose                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| `private_call_data_validator.nr`             | Validates private call data for Init and Inner circuits |
| `previous_kernel_for_tail_validator.nr`      | Validates previous kernel state before Tail             |
| `private_kernel_circuit_output_composer.nr`  | Generates output for Init and Inner circuits            |
| `private_kernel_circuit_output_validator.nr` | Validates output for Init and Inner circuits            |
| `reset_output_composer.nr`                   | Generates output for Reset circuit                      |
| `reset_output_validator.nr`                  | Validates output for Reset circuit                      |
| `tail_output_composer.nr`                    | Generates output for Tail circuit                       |
| `tail_output_validator.nr`                   | Validates output for Tail circuit                       |
| `tail_to_public_output_composer.nr`          | Generates output for TailToPublic circuit               |
| `tail_to_public_output_validator.nr`         | Validates output for TailToPublic circuit               |
