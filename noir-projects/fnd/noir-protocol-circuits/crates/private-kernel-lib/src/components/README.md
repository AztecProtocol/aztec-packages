# Private Kernel Components

This directory contains the core components used by the private kernel circuits: Init, Init-N, Inner, Inner-N, Reset, Reset-tail and Reset-tail-to-public. Init-N and Inner-N (N = 2 to 5) process N app calls in one proof.

## Architectural Pattern: Composer + Validator

The kernels separate **output generation** (a `...Composer`) from **output validation** (a `...Validator`). [`noir-protocol-circuits/README.md`](../../../../README.md#naming-conventions) defines both terms.

Unconstrained code computes the output cheaply; constrained validators check it, so a buggy or malicious composer makes proving fail. The exception is Init: its composer (`compose_output_for_init`) is fully constrained, so Init has no output validator.

Example: `PrivateKernelCircuitOutputComposer` generates the `PrivateKernelCircuitPublicInputs` by:

- Initializing constant data from the tx request (Init) or the previous kernel (Inner)
- Propagating and scoping side effects from private calls
- Accumulating validation requests

Example: `PrivateKernelCircuitOutputValidator` (Inner only) verifies:

- Arrays from previous kernel are correctly prepended to output
- Arrays from private call are correctly appended (and scoped) to output
- Aggregated values (fee_payer, min_revertible_counter, etc.) are correct

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

For Inner, Inner-N, Reset, Reset-tail and Reset-tail-to-public, validates that:

- The previous kernel proof verifies
- The previous kernel's verification key is in the allowed set (vk tree membership)

## Component Overview

| Component | Purpose |
| --- | --- |
| `private_call_data_validator.nr` | Validates private call data for Init, Init-N, Inner and Inner-N |
| `private_kernel_circuit_output_composer.nr` | Generates output for Init (constrained `compose_output_for_init`), Inner (unconstrained), and Init-N / Inner-N (unconstrained `compose_init_batch_n` / `compose_inner_batch_n`) |
| `private_kernel_circuit_output_validator.nr` | Validates output for Inner |
| `private_kernel_batch_validator.nr` | Validates output for Init-N and Inner-N, and derives which call request each app call was popped from |
| `gas_meter.nr` | Computes the gas a tx uses from its side effects; used by the tail composers and validators |
| `reset_output_composer.nr` | Generates output for the reset step (Reset, and the final reset inside Reset-tail and Reset-tail-to-public) |
| `reset_output_validator.nr` | Validates output for the reset step |
| `previous_kernel_for_tail_validator.nr` | Checks the final reset output before the tail step: empty validation requests, dense and trimmed arrays, fee payer, first nullifier, revertible counter |
| `tail_finalize.nr` | Runs the tail step of Reset-tail: composes and validates the rollup-bound output |
| `tail_output_composer.nr` | Generates output for the tail step of Reset-tail |
| `tail_output_validator.nr` | Validates output for the tail step of Reset-tail |
| `tail_to_public_finalize.nr` | Runs the tail step of Reset-tail-to-public: composes and validates the public-bound output |
| `tail_to_public_output_composer.nr` | Generates output for the tail step of Reset-tail-to-public |
| `tail_to_public_output_validator.nr` | Validates output for the tail step of Reset-tail-to-public |
