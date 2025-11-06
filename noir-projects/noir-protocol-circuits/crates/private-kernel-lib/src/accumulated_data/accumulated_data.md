# Accumulated Data

Accumulated data refers to the side effects and requests emitted from private functions that aggregate through the kernel circuits:

- `note_hashes`: Hash of the new notes being created
- `nullifiers`: Values being nullified
- `l2_to_l1_msgs`: Messages sent from L2 to L1
- `private_logs`: Private log fields and lengths
- `contract_class_logs_hashes`: Contract class log hashes
- `public_call_requests`: Requests to call public functions
- `private_call_stack`: Stack of private function calls to be executed

## Data Representation

The arrays are represented using `ClaimedLengthArray<T, N>`, which wraps a fixed-size array with a claimed length indicating how many items are actually "valid".

## Guarantees

All valid values emitted from private functions are guaranteed to:

1. **Be non-empty**:
   Although the values may initially be empty, the kernel circuits add the contract address to each item within the claimed length. This ensures that the resulting items are not empty.

2. **Have unique non-zero non-max counters**:
   This is ensured by `validate_incrementing_counters_within_range` in `PrivateCallDataValidator`, which verifies that each private call’s side effects have strictly increasing counters within the call’s counter range. And, since a private call’s counter range does not overlap with other calls (verified by `validate_incrementing_call_request_counters_within_range`), all counters are guaranteed to be unique and non-zero, non-max \*.

\* The `start_side_effect_counter` of the first `private_call_request` may be zero, and the `end_side_effect_counter` of the last call may be the max u32. Both are acceptable since the `private_call_stack` won't be processed by any of the functions that sort the array items assuming that the counters are non-zero or non-max.

## Accumulated Data Processing Through Kernel Circuits

### Init Circuit (`private_kernel_init.nr`)

All side effects and validation requests from the first private call are scoped with the contract address and appended to initially empty arrays. A protocol nullifier may be added if no nullifier hint is provided.

#### Validation functions used

In `PrivateKernelCircuitOutputValidator.validate_propagated_from_initial_private_call`:

- **`assert_array_appended_to_empty_dest_and_scoped`**: Validates that the following arrays from the private call are correctly appended to empty destination arrays and scoped with the contract address:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `scoped_key_validation_requests_and_generators`
  - `note_hashes`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
- **`assert_array_appended_and_scoped`**: Validates that `nullifiers` from the private call are appended after the protocol nullifier (if present) and scoped with the contract address
- **`assert_array_appended_to_empty_dest`**: Validates that `public_call_requests` are appended to empty destination array
- **`assert_array_appended_reversed_to_empty_dest`**: Validates that `private_call_requests` are appended in reversed order to the `private_call_stack`

#### Result

Accumulated data from the first call. Valid items are non-empty and have unique non-zero counters.

### Inner Circuit (`private_kernel_inner.nr`)

The top call request is popped from the `private_call_stack`. All previously accumulated data is prepended, and new data from the current private call is scoped with the contract address and appended.

#### Validation functions used

In `PrivateKernelCircuitOutputValidator.validate_propagated_from_previous_kernel`:

- **`assert_array_prepended`**: Validates that the following arrays from the previous kernel are prepended to the output:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `scoped_key_validation_requests_and_generators`
  - `note_hashes`
  - `nullifiers`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
  - `public_call_requests`
- **`assert_array_prepended_up_to_some_length`**: Validates that `private_call_stack` is prepended up to `length - 1` (excluding the top item that was popped)

In `PrivateKernelCircuitOutputValidator.validate_propagated_from_private_call`:

- **`assert_array_appended_and_scoped`**: Validates that the following arrays from the current private call are appended and scoped with the contract address:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `scoped_key_validation_requests_and_generators`
  - `note_hashes`
  - `nullifiers`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
- **`assert_array_appended`**: Validates that `public_call_requests` are appended
- **`assert_array_appended_reversed_up_to_some_length`**: Validates that `private_call_requests` are appended in reversed order to the `private_call_stack`

#### Result

Accumulated data from all calls so far. All valid items are non-empty and have unique non-zero counters.

### Reset Circuit (`private_kernel_reset.nr`)

Transient note_hash-nullifier pairs are squashed (removed). Optionally (in the final reset iteration), note_hashes, nullifiers, and private_logs are siloed, padded with dummy items, and sorted by counter. Validation requests are validated and removed or propagated.

#### Validation functions used

In `ResetOutputValidator` in the final reset iteration:

- **`assert_sorted_padded_transformed_array_capped_size`** (or `assert_sorted_padded_transformed_i_array_capped_size` for note hashes): When siloing and padding are performed, validates that:
  - Items from the "kept" (non-squashed) arrays are correctly transformed (siloed) and sorted by counter
  - Padded items with `counter = MAX_U32_VALUE` are correctly added
  - The output array has the correct length
  - Used for `note_hashes` (with siloing and uniquification), `nullifiers` (with siloing), and `private_logs` (with siloing)

#### Result

Squashed transient data, and optionally siloed/padded/sorted side effects.

If siloing is applied, all items within the claimed length will have a zero contract address. The siloed values themselves may be empty, meaning that valid items are no longer guaranteed to be non-empty. Items emitted from private functions still have unique, non-zero counters, but any newly added padded items will have a counter value of `MAX_U32_VALUE`. As a result, counters may no longer be unique once padding is applied.

### Tail Circuit (`private_kernel_tail.nr`)

The remaining data types (l2_to_l1_msgs, contract_class_logs_hashes) are sorted by counter and transformed to the final rollup format. All accumulated data is transformed to `PrivateToRollupAccumulatedData` by removing counters and, where applicable, contract addresses.

#### Validation functions used

In `TailOutputValidator`:

- `assert_dense_trimmed_array` (or `assert_trimmed_array` for `public_call_requests`): Validates that the items from the private kernel are dense and/or trimmed:
  - Items within the claimed length are not nullish.
  - Items beyond the claimed length are nullish.

For **already siloed and padded** data (`note_hashes`, `nullifiers`, `private_logs`):

- **`assert_transformed_array`**: Validates that the items from the previous kernel are correctly transformed to their final format

For **unsorted** data (`l2_to_l1_msgs`, `contract_class_logs_hashes`):

- **`assert_sorted_transformed_array`**: Validates that the items from the previous kernel are correctly sorted by counter and transformed to their final format:

#### Result

`PrivateToRollupKernelCircuitPublicInputs` ready for the rollup circuit.

- `note_hashes`: Transformed from `Scoped<Counted<NoteHash>>` to `Field`
- `nullifiers`: Transformed from `Scoped<Counted<Nullifier>>` to `Field`
- `private_logs`: Transformed from `Scoped<Counted<PrivateLogData>>` to `PrivateLog`
- `l2_to_l1_msgs`: Transformed from `Scoped<Counted<L2ToL1Message>>` to `Scoped<L2ToL1Message>`
- `contract_class_logs_hashes`: Transformed from `Scoped<Counted<LogHash>>` to `Scoped<LogHash>`

### Tail-to-Public Circuit (`private_kernel_tail_to_public.nr`)

All accumulated data is sorted by counter and then split into non-revertible and revertible arrays based on `min_revertible_side_effect_counter`. Each split array is transformed to the final public format and padded with empty items.

#### Validation functions used

In `TailToPublicOutputValidator`:

- `assert_dense_trimmed_array` (or `assert_trimmed_array` for `public_call_requests`): Validates that the items from the private kernel are dense and/or trimmed:
  - Items within the claimed length are not nullish.
  - Items beyond the claimed length are nullish.

For **already siloed and padded** data (`note_hashes`, `nullifiers`, `private_logs`):

- **`assert_split_transformed_arrays_from_sorted_padded_array`**: Validates that items in the sorted padded array from the previous kernel are:
  - Split into non-revertible and revertible arrays based on `min_revertible_side_effect_counter`
    - Items with `counter < min_revertible_side_effect_counter` go to `non_revertible_accumulated_data`
    - Items with `counter >= min_revertible_side_effect_counter` go to `revertible_accumulated_data`
  - Padded items (with `counter = MAX_U32_VALUE`) are distributed based on `num_padded_lt` hint
  - Transformed to their final format
  - Empty items are added to each array for padding

For **unsorted** data (`l2_to_l1_msgs`, `contract_class_logs_hashes`, `public_call_requests`):

- **`assert_split_sorted_transformed_arrays`**: Validates that items from the previous kernel are:
  - Sorted by counter
  - Split into non-revertible and revertible arrays based on `min_revertible_side_effect_counter`
    - Items with `counter < min_revertible_side_effect_counter` go to `non_revertible_accumulated_data`
    - Items with `counter >= min_revertible_side_effect_counter` go to `revertible_accumulated_data`
  - Transformed to their final format
  - Empty items are added to each array for padding

#### Result

`PrivateToPublicKernelCircuitPublicInputs` with split accumulated data ready for public execution.

- `note_hashes`: Transformed from `Scoped<Counted<NoteHash>>` to `Field`
- `nullifiers`: Transformed from `Scoped<Counted<Nullifier>>` to `Field`
- `private_logs`: Transformed from `Scoped<Counted<PrivateLogData>>` to `PrivateLog`
- `l2_to_l1_msgs`: Transformed from `Scoped<Counted<L2ToL1Message>>` to `Scoped<L2ToL1Message>`
- `contract_class_logs_hashes`: Transformed from `Scoped<Counted<LogHash>>` to `Scoped<LogHash>`
- `public_call_requests`: Transformed from `Counted<PublicCallRequest>` to `PublicCallRequest`

## Overview

| Circuit        | Data Transformation                         | Key Validation Functions                                                                                                                                                                      |
| -------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Init           | Scope with contract address and append      | `assert_array_appended_to_empty_dest_and_scoped`<br>`assert_array_appended_and_scoped`<br>`assert_array_appended_to_empty_dest`<br>`assert_array_appended_reversed_to_empty_dest`             |
| Inner          | Prepend previous + Append new (scoped)      | `assert_array_prepended`<br>`assert_array_prepended_up_to_some_length`<br>`assert_array_appended_and_scoped`<br>`assert_array_appended`<br>`assert_array_appended_reversed_up_to_some_length` |
| Reset          | Squash, optionally silo/pad/sort            | `assert_sorted_padded_transformed_array_capped_size`<br>`assert_sorted_padded_transformed_i_array_capped_size`                                                                                |
| Tail           | Sort and transform to rollup format         | `assert_sorted_transformed_array`                                                                                                                                                             |
| Tail-to-Public | Sort, split, and transform to public format | `assert_split_transformed_arrays_from_sorted_padded_array`<br>`assert_split_sorted_transformed_arrays`                                                                                        |
