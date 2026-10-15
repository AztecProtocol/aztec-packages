# Accumulated Data

Accumulated data refers to the side effects and requests emitted from private functions that aggregate through the kernel circuits:

- `note_hashes`: Hash of the new notes being created
- `nullifiers`: Values being nullified
- `l2_to_l1_msgs`: Messages sent from L2 to L1
- `private_logs`: Private log fields and lengths
- `contract_class_logs_hashes`: Contract class log hashes
- `public_call_requests`: Requests to call public functions
- `private_call_stack`: Stack of private function calls to be executed

The validation requests (`note_hash_read_requests`, `nullifier_read_requests`, `scoped_key_validation_requests_and_separators`) travel through the same kernels in the same way.

Unless stated otherwise, the helper functions named below are in this directory (`private-kernel-lib/src/accumulated_data/`), and the components are in `private-kernel-lib/src/components/`.

## Overview

| Circuit | Data Transformation | Key Validation Functions |
| --- | --- | --- |
| Init | Append to empty arrays; scope side effects and key-validation requests (constrained composer) | `append_to_empty_dest`<br>`append_and_scope_to_empty_dest`<br>`append_and_scope_after_protocol_nullifier`<br>`append_reversed_to_empty_dest` |
| Inner | Prepend previous + append new (side effects and key-validation requests scoped) | `assert_array_prepended`<br>`assert_array_prepended_up_to_some_length`<br>`assert_array_appended`<br>`assert_array_appended_and_scoped`<br>`assert_array_appended_reversed` |
| Init-N, Inner-N | Prepend previous + append N calls | `assert_array_concat_appended`<br>`assert_array_concat_appended_and_scoped` |
| Reset | Squash transient data, validate requests | (no array helper from this table) |
| Reset-tail | Final reset (squash, silo, pad, sort), then sort the rest and transform to rollup format | `assert_sorted_padded_transformed_array_capped_size`<br>`assert_sorted_padded_transformed_i_array_capped_size`<br>`assert_dense_trimmed_array`<br>`assert_transformed_array`<br>`assert_sorted_transformed_array` |
| Reset-tail-to-public | Final reset (squash, silo, pad, sort), then sort, split and transform to public format | `assert_sorted_padded_transformed_array_capped_size`<br>`assert_sorted_padded_transformed_i_array_capped_size`<br>`assert_dense_trimmed_array`<br>`assert_split_transformed_arrays_from_sorted_padded_array`<br>`assert_split_sorted_transformed_arrays` |

## Data Representation

The arrays are represented using `ClaimedLengthArray<T, N>`, which wraps a fixed-size array with a claimed length indicating how many items are actually "valid".

## Guarantees

All valid values emitted from private functions are guaranteed to:

1. **Be non-empty**:
   Although the values may initially be empty, the kernel circuits add the contract address to each item within the claimed length. This ensures that the resulting items are not empty. Read requests are the exception: the app already scopes them, and the kernel appends them as-is.

2. **Have unique non-zero non-max counters**:
   `validate_unique_and_within_bounds_side_effect_counters` (`components/private_call_data_validator/validate_side_effect_counters.nr`), called by `PrivateCallDataValidator`, checks each private call. It uses a prover-supplied sorted list of the call's counters to prove that they are unique and lie strictly inside the call's counter range.
   It also checks that no side effect of the call uses a counter inside the range reserved by a nested call. So the ranges of different calls do not overlap.
   As a result, all counters in the tx are unique, non-zero and non-max \*.

\* The `start_side_effect_counter` of the first `private_call_request` may be zero, and the `end_side_effect_counter` of the last call may be the max u32. Both are acceptable since the `private_call_stack` won't be processed by any of the functions that sort the array items assuming that the counters are non-zero or non-max.

## Claimed lengths and padding

These diagrams show what is and is not validated about a claimed-length array at each step. `?` is an unvalidated value, `|` marks the claimed length, and `p` is a padding item.

### Copying an app's array

```text
Start with a side-effect array [T; M] from an app.

We don't validate that the LHS is non-empty,
to save constraints. We'll validate it in a later circuit.
                        |
                        |
                        |
                    ____|____    ___________ We don't validate that the RHS is empty,
                   |  |  |  |   |  |  |  |   we accept what the app tells us.
                   v  v  v  v   v  v  v  v
app:             [ a, b, c, d | ?, ?, ?, ?]
                   ^  ^  ^  ^ ^
                   |  |  |  | |____length - bounds-checked on entry; density deferred to the tail.
   assert_equal----|  |  |  | |
                   |  |  |  | |
                   v  v  v  v v
out hint:        [ a, b, c, d | ?, ?, ?, ?]
                                ^  ^  ^  ^
                                |__|__|__|__ We don't check that these are 0.
                                             The prover might have populated them with any data (through hints).
                                             We know the length is correct, so we can safely
                                             overwrite these in the next kernel iteration.
```

Assertions:
- `length` is equal in both arrays.
- The LHS values are equal (up to the length), noting that they could cheekily be 0s at this point.

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.

`validate_claimed_lengths` in `PrivateCallDataValidator` checks that each claimed length is within the array's bounds (Init and Inner). The tail checks density and RHS emptiness (`assert_dense_trimmed_array`).

### Appending an app's array to the previous kernel's array

```text
                                                LHS _any_ values
                                                (incl 0s)
                                                   |_    _________________ Not validated to be empty yet.
                                                  |  |  |  |  |  |  |  |
                                                  v  v  v  v  v  v  v  v
prev kernel: [ a, b, c, d| ?, ?, ?, ?]     app: [ e, f| ?, ?, ?, ?, ?, ?]
               ^  ^  ^  ^^                        ^  ^^
               |  |  |  ||___________             |  ||
               |  |  |  |   ________ |____________|  ||
               |  |  |  |  |   _____ | ______________||
               |  |  |  |  |  | _____|________________|
               |  |  |  |  |  ||     sum the lengths
               v  v  v  v  v  vv
out hint:    [ a, b, c, d, e, f| ?, ?]
```

Assertions:
- prev.length + app.length == out.length
- prev LHS values equal the out values, up to the prev.length.
- app LHS values equal the out values, between prev.length and out.length

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.

### Squashing, sorting and padding (final reset)

```text
prev kernel: [ a, b, c, d, e, f| ?, ?]
               ^  ^  ^  ^  ^  ^
               |  |  |  |  |  |
               |  |  X  |  X  |  squash
               |  |   __|     |
               |  |  |   _____|
               |  |  |  |
               v  v  v  v
"kept" hint: [ a, b, d, f| ?, ?, ?, ?]

Before sorting, we need to ensure there are no rogue nonempty values on the RHS,
so that they don't get sneakily sorted into the LHS.

             [ a, b, d, f| 0, 0, 0, 0] <--- assert RHS zero


sorted:      [ b, f, a, d| 0, 0, 0, 0] (sorted by counter; not shown here)


(siloed & made unique - neither steps are shown here)

padded after the sorted length (in this example to length 7),

then RHS asserted to be 0

out hint:    [ b, f, a, d, p, p, p| 0]
```

## Accumulated Data Processing Through Kernel Circuits

### Init Circuit (`private_kernel_init.nr`)

Init always inserts the protocol nullifier at index 0, then appends the call's nullifiers after it. Read requests are appended as-is, already scoped by the app; key-validation requests and side effects are scoped with the contract address by the kernel. All destination arrays start empty.

Init has no output validator. `PrivateKernelCircuitOutputComposer::compose_output_for_init` builds the output in constrained code.

#### Functions used

In `compose_output_for_init`, from `assert_array_appended.nr`:

- **`append_to_empty_dest`**: Appends to an empty destination array, without scoping:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `public_call_requests`
- **`append_and_scope_to_empty_dest`**: Appends to an empty destination array and scopes with the contract address:
  - `scoped_key_validation_requests_and_separators`
  - `note_hashes`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
- **`append_and_scope_after_protocol_nullifier`**: Appends `nullifiers` from index 1, after the protocol nullifier, and scopes them with the contract address
- **`append_reversed_to_empty_dest`**: Appends `private_call_requests` in reversed order to the `private_call_stack`

#### Result

Accumulated data from the first call. Valid items are non-empty and have unique non-zero counters.

### Inner Circuit (`private_kernel_inner.nr`)

The top call request is popped from the `private_call_stack`. All accumulated data from the previous kernel is prepended. New data from the current private call is appended: read requests as-is, and everything else (except `public_call_requests` and the call stack) scoped with the contract address.

The composer runs unconstrained. `PrivateKernelCircuitOutputValidator` checks its output.

#### Validation functions used

In `PrivateKernelCircuitOutputValidator.validate_propagated_from_previous_kernel`:

- **`assert_array_prepended`**: Validates that the following arrays from the previous kernel are prepended to the output:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `scoped_key_validation_requests_and_separators`
  - `note_hashes`
  - `nullifiers`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
  - `public_call_requests`
- **`assert_array_prepended_up_to_some_length`**: Validates that `private_call_stack` is prepended up to `length - 1` (excluding the top item that was popped)

In `PrivateKernelCircuitOutputValidator.validate_propagated_from_private_call`:

- **`assert_array_appended`**: Validates that the following arrays from the current private call are appended without scoping:
  - `note_hash_read_requests`
  - `nullifier_read_requests`
  - `public_call_requests`
- **`assert_array_appended_and_scoped`**: Validates that the following arrays from the current private call are appended and scoped with the contract address:
  - `scoped_key_validation_requests_and_separators`
  - `note_hashes`
  - `nullifiers`
  - `l2_to_l1_msgs`
  - `private_logs`
  - `contract_class_logs_hashes`
- **`assert_array_appended_reversed`**: Validates that `private_call_requests` are appended in reversed order to the `private_call_stack`

#### Result

Accumulated data from all calls so far. All valid items are non-empty and have unique non-zero counters.

### Batched Init and Inner Circuits (`private_kernel_init_n.nr`, `private_kernel_inner_n.nr`)

The crates `private-kernel-init-{2,3,4,5}` and `private-kernel-inner-{2,3,4,5}` process N private calls in one proof. Each call is popped either from the previous kernel's `private_call_stack` or from the `private_call_requests` of an earlier call in the same batch.

The unconstrained composers `compose_init_batch_n` and `compose_inner_batch_n` produce only the final output. The prover also supplies a hint giving, for each call, the source it was popped from (`simulate_pop_sequence`).

`PrivateKernelBatchValidator` (`components/private_kernel_batch_validator.nr`) checks the output against the inputs in one pass:

- **`assert_array_concat_appended`**: Validates that the previous arrays are prepended and that the N calls' arrays are appended in order, without scoping: `note_hash_read_requests`, `nullifier_read_requests`, `public_call_requests`.
- **`assert_array_concat_appended_and_scoped`**: The same, with each call's items scoped with that call's contract address: `scoped_key_validation_requests_and_separators`, `note_hashes`, `nullifiers`, `l2_to_l1_msgs`, `private_logs`, `contract_class_logs_hashes`.
- The `private_call_stack` is checked against the pop-source hints. The validator returns the popped call requests, and each call is then checked against its request.

For Init-N, the previous state is empty except for the protocol nullifier at index 0, which the validator also checks.

### Reset Circuit (`private_kernel_reset.nr`)

Transient note_hash-nullifier pairs are squashed (removed). Validation requests are validated and removed or propagated.

The `private-kernel-reset` circuit only squashes and validates requests. Siloing, padding and sorting run in the terminal reset of `reset-tail` / `reset-tail-to-public`.

#### Result

Squashed transient data. Items still have unique, non-zero counters.

### Reset-tail Circuit (`private_kernel_reset_tail.nr`)

This circuit runs the final reset and then the tail step, in one circuit.

**Final reset.** As for Reset, plus: note_hashes, nullifiers and private_logs are siloed, padded with dummy items, and sorted by counter.

In `ResetOutputValidator`:

- **`assert_sorted_padded_transformed_array_capped_size`** (or `assert_sorted_padded_transformed_i_array_capped_size` for note hashes): validates that:
  - Items from the "kept" (non-squashed) arrays are correctly transformed (siloed) and sorted by counter
  - Padded items with `counter = MAX_U32_VALUE` are correctly added
  - The output array has the correct length
  - Used for `note_hashes` (with siloing and uniquification), `nullifiers` (with siloing), and `private_logs` (with siloing)

After siloing, all items within the claimed length have a zero contract address. The siloed values themselves may be empty, so valid items are not guaranteed to be non-empty. Items emitted from private functions still have unique, non-zero counters, but any newly added padded items will have a counter value of `MAX_U32_VALUE`. As a result, counters are not guaranteed to be unique once padding is applied.

**Checks before the tail step.** `validate_previous_kernel_for_tail` (`components/previous_kernel_for_tail_validator.nr`) checks the reset output. Its `validate_accumulated_items` checks that the items are dense and/or trimmed:

- Items within the claimed length are not nullish (`assert_dense_trimmed_array` for `note_hashes` and `nullifiers`; `assert_dense_array` for the two log arrays).
- Items beyond the claimed length are nullish (`assert_dense_trimmed_array`, or `assert_trimmed_array` for `l2_to_l1_msgs` and the two log arrays).
- `public_call_requests` must be empty.

**Tail step** (`components/tail_finalize.nr`). The remaining data types (l2_to_l1_msgs, contract_class_logs_hashes) are sorted by counter and transformed to the final rollup format. All accumulated data is transformed to `PrivateToRollupAccumulatedData` by removing counters and, where applicable, contract addresses.

In `TailOutputValidator`:

For **already siloed and padded** data (`note_hashes`, `nullifiers`, `private_logs`):

- **`assert_transformed_array`**: Validates that the items from the previous kernel are correctly transformed to their final format

For **unsorted** data (`l2_to_l1_msgs`, `contract_class_logs_hashes`):

- **`assert_sorted_transformed_array`**: Validates that the items from the previous kernel are correctly sorted by counter and transformed to their final format

#### Result

`PrivateToRollupKernelCircuitPublicInputs` ready for the rollup circuit.

- `note_hashes`: Transformed from `Scoped<Counted<NoteHash>>` to `Field`
- `nullifiers`: Transformed from `Scoped<Counted<Nullifier>>` to `Field`
- `private_logs`: Transformed from `Scoped<Counted<PrivateLogData>>` to `PrivateLog`
- `l2_to_l1_msgs`: Transformed from `Scoped<Counted<L2ToL1Message>>` to `Scoped<L2ToL1Message>`
- `contract_class_logs_hashes`: Transformed from `Scoped<Counted<LogHash>>` to `Scoped<LogHash>`

### Reset-tail-to-public Circuit (`private_kernel_reset_tail_to_public.nr`)

This circuit runs the final reset (as for Reset-tail) and then the tail-to-public step, in one circuit. The checks before the tail step are the same as for Reset-tail, except that `public_call_requests` only need to be trimmed (`assert_trimmed_array`).

**Tail-to-public step** (`components/tail_to_public_finalize.nr`). All accumulated data is sorted by counter and then split into non-revertible and revertible arrays based on `min_revertible_side_effect_counter`. Each split array is transformed to the final public format and padded with empty items.

In `TailToPublicOutputValidator`:

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
