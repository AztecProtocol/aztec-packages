# Private Kernel Circuit - Reset

<!-- Mike review: formatting suggestions similar to the initial kernel section :) -->
<!-- Will we have various sizes of reset circuit? We should mention that in here. We might also need to mention how the verification keys of these reset circuits will be stored and checked -->
<!-- In fact, will we have various sizes of kernel and rollup circuit? We perhaps ought to be more exact with our plans for variable-sizes. -->

## Requirements

A **reset** circuit is designed to abstain from processing individual private function calls. Instead, it injects the outcomes of an initial, inner, or another reset private kernel circuit, scrutinizes the public inputs, and clears the verifiable data within its scope. A reset circuit can be executed either preceding the tail private kernel circuit, or as a means to "reset" public inputs at any point between two private kernels, allowing data to accumulate seamlessly in subsequent iterations.

There are 2 variations of reset circuits:

<!-- TODO: read requests in app or not is still being debated, very slowly -->
<!-- TODO: possibly a reset circuit to sha256-hash logs, if logs are pushed to the data bus? Note: if there's room in the data bus at the end of all kernel iterations, then the logs can instead be kept in the data bus, and then hashed by the sequencer in the rollup circuit woooh! -->

- [Read Request Reset Private Kernel Circuit](#read-request-reset-private-kernel-circuit).
- [Nullifier Key Validation Request Reset Private Kernel Circuit](#nullifier-key-validation-request-reset-private-kernel-circuit). <!-- Perhaps consider giving these requests a more generic name. `ParentSecretKeyValidationRequest`? Outgoing viewing keys will also use this pattern. -->
- [Transient Note Reset Private Kernel Circuit](#transient-note-reset-private-kernel-circuit).

The incorporation of these circuits not only enhances the modularity and repeatability of the "reset" process but also diminishes the overall workload. Rather than conducting resource-intensive computations such as membership checks in each iteration, these tasks are only performed as necessary within the reset circuits.

### Read Request Reset Private Kernel Circuit.

<!-- Ideally this circuit would be executed _after_ squashing, so that there are fewer reads to perform. Would that be possible? -->

This reset circuit conducts verification on some or all accumulated read requests and subsequently removes them from the [`read_request_contexts`](./private-kernel-initial.mdx/#readrequestcontext) in the [`transient_accumulated_data`](./private-kernel-initial.mdx#transientaccumulateddata) within the [`public_inputs`](./private-kernel-initial.mdx#publicinputs) of the [`previous_kernel`](#previouskernel).

A read request can pertain to one of two note types:

- A settled note: generated in a prior successful transaction and included in the note hash tree.
- A pending note: created in the current transaction, not yet part of the note hash tree.

1. To clear read requests for settled notes, the circuit performs membership checks for the targeted read requests using the [hints](#hints-for-read-request-reset-private-kernel-circuit) provided via `private_inputs`.

   For each `persistent_read_index` at index `i` in `persistent_read_indices`:

   1. If the `persistent_read_index` equals the length of the _read_request_contexts_ array, there is no read request to be verified. Skip the rest.
   2. Locate the `read_request`: `read_request_contexts[persistent_read_index]`
   3. Perform a membership check on the note being read. Where:
      - The leaf corresponds to the hash of the note: `read_request.note_hash`
      - The index and sibling path are in: `read_request_membership_witnesses[i]`.
      - The root is the `note_hash_tree_root` in the [block_header](./private-function.md#header) within [`public_inputs`](#public-inputs)[`.constant_data`](./private-kernel-initial.mdx#constantdata).

   > Following the above process, at most `N` read requests will be cleared, where `N` is the length of the `persistent_read_indices` array. It's worth noting that there can be multiple versions of this reset circuit, each with a different value of `N`.

2. To clear read requests for pending notes, the circuit ensures that the notes were created before the corresponding read operation, utilizing the [hints](#hints-for-read-request-reset-private-kernel-circuit) provided via `private_inputs`

   For each `transient_read_index` at index `i` in `transient_read_indices`:

   1. If the `transient_read_index` equals the length of the _read_request_contexts_ array, there is no read request to be verified. Skip the rest.
   2. Locate the `read_request`: `read_request_contexts[transient_read_index]`
   3. Locate the `note_hash` being read: `note_hash_contexts[pending_note_indices[i]]`
   4. Verify the following:
      - `read_request.note_hash == note_hash.value`
      - `read_request.contract_address == note_hash.contract_address`
      - `read_request.counter > note_hash.counter`
      - `(read_request.counter < note_hash.nullifier_counter) | (note_hash.nullifier_counter == 0)`

   > Given that a reset circuit can execute between two private kernel circuits, there's a possibility that a note is created in a nested execution and hasn't been added to the `public_inputs`. In such cases, the read request cannot be verified in the current reset circuit and must be processed in another reset circuit after the note has been included in the `public_inputs`.

3. This circuit then ensures that the read requests that haven't been verified should remain in the [transient_accumulated_data](./private-kernel-initial.mdx#transientaccumulateddata) within its `public_inputs`.

   For each `read_request` at index `i` in the `read_request_contexts` within the `private_inputs`, find its `status` at `read_request_statuses[i]`:

   - If `status.state == persistent`, `i == persistent_read_indices[status.index]`.
   - If `status.state == transient`, `i == transient_read_indices[status.index]`.
   - If `status.state == nada`, `read_request == public_inputs.transient_accumulated_data.read_request_contexts[status.index]`.

### Nullifier Key Validation Request Reset Private Kernel Circuit.

This reset circuit validates the correct derivation of nullifier secret keys used in private functions, and subsequently removes them from the `nullifier_key_validation_request_contexts` in the [`transient_accumulated_data`](./private-kernel-initial.mdx#transientaccumulateddata) within the `public_inputs` of the [`previous_kernel`](#previouskernel).

Initialize `requests_kept` to `0`.

For each `request` at index `i` in `nullifier_key_validation_request_contexts`, locate the `master_secret_key` at `master_nullifier_secret_keys[i]`, provided as [hints](#hints-for-nullifier-key-validation-request-reset-private-kernel-circuit) through `private_inputs`.

1. If `master_secret_key == 0`, ensure the request remain within the `public_inputs`.:

   - `public_inputs.transient_accumulated_data.nullifier_key_validation_request_contexts[requests_kept] == request`
   - Increase `requests_kept` by 1: `requests_kept += 1`

2. Else:
   - Verify that the public key is associated with the `master_secret_key`:
     `request.public_key == master_secret_key * G`
   - Verify that the secret key was correctly derived for the contract:
     `request.secret_key == hash(master_secret_key, request.contract_address)`

### Transient Note Reset Private Kernel Circuit.

In the event that a pending note is nullified within the same transaction, its note hash, nullifier, and all encrypted note preimage hashes can be removed from the public inputs. This not only avoids redundant data being broadcasted, but also frees up space for additional note hashes and nullifiers in the subsequent iterations.

1. Ensure that each note hash is either propagated to the `public_inputs` or nullified in the same transaction.

   Initialize both `notes_kept` and `notes_removed` to `0`.

   For each `note_hash` at index `i` in `note_hash_contexts` within the `private_inputs`, find the index of its nullifer at `transient_nullifier_indices[i]`, provided as [hints](#hints-for-transient-note-reset-private-kernel-circuit):

   - If `transient_nullifier_indices[i] == nullifier_contexts.len()`:
     - Verify that the `note_hash` remains within the [transient_accumulated_data](./private-kernel-initial.mdx#transientaccumulateddata) in the `public_inputs`:
       `note_hash == public_inputs.transient_accumulated_data.note_hash_contexts[notes_kept]`
     - Increment `notes_kept` by 1: `notes_kept += 1`
   - Else, locate the `nullifier` at `nullifier_contexts[transient_nullifier_indices[i]]`:

     - Verify that the nullifier is associated with the note:
       - `nullifier.contract_address == note_hash.contract_address`
       - `nullifier.note_hash_counter == note_hash.counter`
       - `nullifier.counter == note_hash.nullifier_counter`
     - Increment `notes_removed` by 1: `notes_removed += 1`
     - Ensure that an empty `note_hash` is appended to the end of `note_hash_contexts` in the `public_inputs`:
       - `public_inputs.transient_accumulated_data.note_hash_contexts[N - notes_removed].is_empty() == true`
       - Where `N` is the length of `note_hash_contexts`.

     > Note that the check `nullifier.counter > note_hash.counter` is not necessary as the `nullifier_counter` is assured to be greater than the counter of the note hash when [propagated](./private-kernel-initial.mdx#verifying-the-transient-accumulated-data) from either the initial or inner private kernel circuits.

2. Ensure that nullifiers not associated with note hashes removed in the previous step are retained within the [transient_accumulated_data](./private-kernel-initial.mdx#transientaccumulateddata) in the `public_inputs`.

   Initialize both `nullifiers_kept` and `nullifiers_removed` to `0`.

   For each `nullifier` at index `i` in the `nullifier_contexts` within the `private_inputs`, find the index of its corresponding transient nullifier at `nullifier_index_hints[i]`, provided as [hints](#hints-for-transient-note-reset-private-kernel-circuit):

   - If `nullifier_index_hints[i] == transient_nullifier_indices.len()`:
     - Verify that the `nullifier` remains within the [`transient_accumulated_data`](./private-kernel-initial.mdx#transientaccumulateddata) in the `public_inputs`:
       `nullifier == public_inputs.transient_accumulated_data.nullifier_contexts[nullifiers_kept]`
     - Increment `nullifiers_kept` by 1: `nullifiers_kept += 1`
   - Else, compute `transient_nullifier_index` as `transient_nullifier_indices[nullifier_index_hints[i]]`:
     - Verify that: `transient_nullifier_index == i`
     - Increment `nullifiers_removed` by 1: `nullifiers_removed += 1`
     - Ensure that an empty `nullifier` is appended to the end of `nullifier_contexts` in the `public_inputs`:
       - `public_inputs.transient_accumulated_data.nullifier_contexts[N - nullifiers_removed].is_empty() == true`
       - Where `N` is the length of `nullifer_contexts`.

   After these steps, ensure that all nullifiers associated with transient note hashes have been identified and removed:

   `nullifiers_removed == notes_removed`

3. Ensure that `encrypted_note_preimage_hashes` not associated with note hashes removed in the previous step are retained within the `[transient_accumulated_data](./private-kernel-initial.mdx#transientaccumulateddata)` in the `public_inputs`.

   Initialize both `hashes_kept` and `hashes_removed` to `0`.

   For each `preimage_hash` at index `i` in the `encrypted_note_preimage_hash_contexts` within the `private_inputs`, find the `index_hint` of its corresponding hash within `public_inputs` at `encrypted_note_preimage_hash_index_hints[i]`, provided as [hints](#hints-for-transient-note-reset-private-kernel-circuit):

   - If `index_hint == encrypted_note_preimage_hash_contexts.len()`:
     - Ensure that the associated note hash is removed:
       - Locate the `note_hash` at `private_inputs.transient_accumulated_data.note_hash_contexts[log_note_hash_hints[i]]`.
       - Verify that the `preimage_hash` is associated with the `note_hash`:
         - `preimage_hash.note_hash_counter == note_hash.counter`
         - `preimage_hash.contract_address == note_hash.contract_address`
       - Confirm that the `note_hash` has a corresponding nullifier and has been removed in the first step of this section:
         - `transient_nullifier_indices[log_note_hash_hints[i]] != nullifier_contexts.len()`
     - Increment `hashes_removed` by 1: `hashes_removed += 1`
     - Ensure that an empty item is appended to the end of `encrypted_note_preimage_hash_contexts` in the `public_inputs`:
       - `encrypted_note_preimage_hash_contexts[N - hashes_removed].is_empty() == true`
       - Where `N` is the length of `encrypted_note_preimage_hash_contexts`.
   - Else, find the `mapped_preimage_hash` at `encrypted_note_preimage_hash_contexts[index_hint]` within `public_inputs`:
     - Verify that the context is aggregated to the `public_inputs` correctly:
       - `index_hint == hashes_kept`
       - `mapped_preimage_hash == preimage_hash`
     - Ensure that the associated note hash is retained in the `public_inputs`:
       - Locate the `note_hash` at `public_inputs.transient_accumulated_data.note_hash_contexts[log_note_hash_hints[i]]`.
       - Verify that the `preimage_hash` is associated with the `note_hash`:
         - `preimage_hash.note_hash_counter == note_hash.counter`
         - `preimage_hash.contract_address == note_hash.contract_address`
     - Increment `hashes_kept` by 1: `hashes_kept += 1`

> Note that this reset process may not necessarily be applied to all transient notes at a time. In cases where a note will be read in a yet-to-be-processed nested execution, the transient note hash and its nullifier must be retained in the `public_inputs`. The reset can only occur in a later reset circuit after all associated read requests have been verified and cleared.

### Common Verifications

Below are the verifications applicable to all reset circuits:

#### Verifying the previous kernel proof.

It verifies that the previous iteration was executed successfully with the given proof data, verification key, and public inputs, sourced from [private_inputs](#private-inputs).[previous_kernel](#previouskernel).

The preceding proof can be:

- [Initial private kernel proof](./private-kernel-initial.mdx).
- [Inner private kernel proof](./private-kernel-inner.mdx).
- Reset private kernel proof.

#### Verifying the accumulated data.

It ensures that the `accumulated_data` in the `[public_inputs](#public-inputs)` matches the `accumulated_data` in [private_inputs](#private-inputs).[previous_kernel](#previouskernel).[public_inputs](./private-kernel-initial.mdx#public-inputs).

#### Verifying the transient accumulated data.

The following must equal the corresponding arrays in [`private_inputs`](#private-inputs)[`.previous_kernel`](#previouskernel)[`.public_inputs`](./private-kernel-initial.mdx#public-inputs)[`.transient_accumulated_data`](./private-kernel-initial.mdx#transientaccumulateddata):

- `l2_to_l1_message_contexts`
- `private_call_requests`
- `public_call_requests`

The following must remain the same for [read request reset private kernel circuit](#read-request-reset-private-kernel-circuit):

- `note_hash_contexts`
- `nullifier_contexts`

The following must remain the same for [transient note reset private kernel circuit](#transient-note-reset-private-kernel-circuit):

- `read_request_contexts`

#### Verifying the constant data.

This section follows the same [process](./private-kernel-inner.mdx#verifying-the-constant-data) as outlined in the inner private kernel circuit.

## `PrivateInputs`

### `PreviousKernel`

The format aligns with the [`PreviousKernel`](./private-kernel-inner.mdx#previouskernel) of the inner private kernel circuit.

### _Hints_ for [Read Request Reset Private Kernel Circuit](#read-request-reset-private-kernel-circuit)

| Field                               | Type                                                                       | Description                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `transient_read_indices`            | `[field; N]`                                                               | Indices of the read requests for transient notes.                                        |
| `pending_note_indices`              | `[field; N]`                                                               | Indices of the note hash contexts for transient reads.                                   |
| `persistent_read_indices`           | `[field; M]`                                                               | Indices of the read requests for settled notes.                                          |
| `read_request_membership_witnesses` | [`[MembershipWitness; M]`](./private-kernel-initial.mdx#membershipwitness) | Membership witnesses for the persistent reads.                                           |
| `read_request_statuses`             | [`[ReadRequestStatus; C]`](#readrequeststatus)                             | Statuses of the read request contexts. `C` equals the length of `read_request_contexts`. |

> There can be multiple versions of the read request reset private kernel circuit, each with a different values of `N` and `M`.

#### `ReadRequestStatus`

| Field   | Type                              | Description                             |
| ------- | --------------------------------- | --------------------------------------- |
| `state` | `persistent \| transient \| nada` | State of the read request.              |
| `index` | `field`                           | Index of the hint for the read request. |

### _Hints_ for [Nullifier Key Validation Request Reset Private Kernel Circuit](#nullifier-key-validation-request-reset-private-kernel-circuit)

| Field                          | Type         | Description                                                                                                                |
| ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `master_nullifier_secret_keys` | `[field; C]` | Master nullifier secret keys for the nullifier keys. `C` equals the length of `nullifier_key_validation_request_contexts`. |

### _Hints_ for [Transient Note Reset Private Kernel Circuit](#transient-note-reset-private-kernel-circuit)

| Field                                      | Type         | Description                                                                                                                                             |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transient_nullifier_indices`              | `[field; C]` | Indices of the nullifiers for transient notes. `C` equals the length of `note_hash_contexts`.                                                           |
| `nullifier_index_hints`                    | `[field; C]` | Indices of the `transient_nullifier_indices` for transient nullifiers. `C` equals the length of `nullifier_contexts`.                                   |
| `encrypted_note_preimage_hash_index_hints` | `[field; C]` | Indices of the `encrypted_note_preimage_hash_contexts` for transient preimage hashes. `C` equals the length of `encrypted_note_preimage_hash_contexts`. |
| `log_note_hash_hints`                      | `[field; C]` | Indices of the `note_hash_contexts` for transient preimage hashes. `C` equals the length of `note_hash_contexts`.                                       |

## `PublicInputs`

The format aligns with the [`PublicInputs`](./private-kernel-initial.mdx#publicinputs) of the initial private kernel circuit.
