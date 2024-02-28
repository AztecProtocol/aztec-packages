# Private Function Circuit

## Requirements

Private function circuits represent smart contract functions that can: privately read and modify leaves of the note hash tree and nullifier tree; perform computations on private data; and can be executed without revealing which function or contract has been executed.

The logic of each private function circuit is tailored to the needs of a particular application or scenario, but the public inputs of every private function circuit _must_ adhere to a specific format. This specific format (often referred to as the "public inputs ABI for private functions") ensures that the [private kernel circuits](./private-kernel-initial.mdx) can correctly interpret the actions of every private function circuit.

## Private Inputs

The private inputs of a private function circuit are customizable.

## Public Inputs

<!-- Mike review: Perhaps we could also do one big class diagram which shows how all the structs (for all circuits) interrelate (similar to Lasse's diagrams in the 'Rollup Circuits' section)? -->

<!-- Mike review:
- Elaborate on what the `counter`s are for (or link to a section which describes them).
- It would be nice to explain what's inside a call_stack_item_hash, or to link to a definition of the the private_call_stack_item and public_call_stack_item structs.
- It seems the L1->L2 messages tree doesn't exist anymore (according to the `../state/*` section of this paper. Perhaps it's been absorbed into the note hashes tree?). Consider updating the structs accordingly. EDIT: it should still exist.
- I think there's still some outstanding ugliness originating from the "where to read?" debate:
    - Read requests for notes are being output by private functions, but the `note_hash_tree_root` is also available - so which should be used by an app?
    - Read requests for the other trees aren't possible with the ABI, which implies all other reads would be have to be done inside the app circuit.
        - How feasible / ugly would it even be to enable the kernel circuit to process read requests of any historical data?
    - Is it possible to align the `BlockHeader` definition with the `Header` struct defined in `../rollup_circuits/base_rollup.md`?
    - I haven't read the kernel sections yet (I'll get there), but how does the kernel circuit link a note and nullifier together, to squash them both? There's no "pointer" from a nullifier to a note?
- TODO: consider whether we need a 'batched_call: bool` in the `CallContext`, and similarly whether we need a new call stack for pushing new batched call requests. (See the section `../calls/batched_calls.md` for some thinking that Palla has done on this subject.)
- TODO: Lasse has been considering whether `portal_contract_address` is unnecessary. He was pushing for L2 functions to be able to send a message to any L1 function. Catch up w/ Lasse.
- In addition to `msg_sender`, do we also need a `tx_origin`? I know this question often arises when considering how to spend escrowed notes if `msg.sender` is a non-human smart contract (which cannot possess nullifier secrets). In such cases, only `tx.origin` is a human capable of possessing secrets. Having said all that, there are patterns such as authwit and using 'secrets' instead of 'nullifier secrets' that have been proposed.
- Consider whether any types should be changed from `field`. (Presumably it would be less efficient to do so. Things like the preimage lengths could be something like a u32, for example).
- Consider whether args and return values should use the data bus, instead of being hashed.
- Consider whether logs should use the data bus, instead of being hashed. This would save sha256 computations on the client side. Instead, the entire data bus of logs could be forwarded to the sequencer who could sha256 them instead. Sometimes the data bus will need to be 'reset', in which case the user would need to call a special reset circuit to sha256-compress the logs.
- We'll need to add fields for requesting key derivation, using the user's master key(s). Done for nullifiers now. Still pending for outgoing viewing keys (we might be able to use the same interface for both and just rename it).
- Possibly mad suggestion: should the public inputs struct contain further nested structs: call_context, args_hash, return_values, read_requests, side_effects: { note_hashes, nullifiers, l2_to_l1_messages, logs: { unencrypted_log_hashes, encrypted_log_hashes, encrypted_note_preimage_hashes }, call_stacks: { private..., public... } }, block_header, globals: { chain_id, version }. It's up to you circuit writers :)

Some tweaks might be needed following this discussion: https://docs.google.com/spreadsheets/d/12Fk0oTvj-yHbdnAkMnu0ymsDqCOEXLdmAxdVB5T_Y3Q/edit#gid=0
-->

The public inputs of _every_ private function _must_ adhere to the following ABI:

| Field                               | Type                                                                    | Description                                                           |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `call_context`                      | [`CallContext`](#callcontext)                                           | Context of the call corresponding to this function execution.         |
| `args_hash`                         | `field`                                                                 | Hash of the function arguments.                                       |
| `return_values`                     | `[field; C]`                                                            | Return values of this function call.                                  |
| `read_requests`                     | [`[ReadRequest; C]`](#readrequest)                                      | Requests to read notes in the note hash tree.                         |
| `nullifier_key_validation_requests` | [`[NullifierKeyValidationRequest]; C]`](#nullifierkeyvalidationrequest) | Requests to validate nullifier keys used in this function call.       |
| `note_hashes`                       | [`[NoteHash; C]`](#notehash)                                            | New note hashes created in this function call.                        |
| `nullifiers`                        | [`[Nullifier; C]`](#nullifier)                                          | New nullifiers created in this function call.                         |
| `l2_to_l1_messages`                 | `[field; C]`                                                            | New L2 to L1 messages created in this function call.                  |
| `unencrypted_log_hashes`            | [`[UnencryptedLogHash; C]`](#unencryptedloghash)                        | Hashes of the unencrypted logs emitted in this function call.         |
| `encrypted_log_hashes`              | [`[EncryptedLogHash; C]`](#encryptedloghash)                            | Hashes of the encrypted logs emitted in this function call.           |
| `encrypted_note_preimage_hashes`    | [`[EncryptedNotePreimageHash]; C]`](#encryptednotepreimagehash)         | Hashes of the encrypted note preimages emitted in this function call. |
| `private_call_stack_item_hashes`    | `[field; C]`                                                            | Hashes of the private function calls initiated by this function.      |
| `public_call_stack_item_hashes`     | `[field; C]`                                                            | Hashes of the public function calls initiated by this function.       |
| `block_header`                      | [`BlockHeader`](#blockheader)                                           | Information about the trees used for the transaction.                 |
| `chain_id`                          | `field`                                                                 | Chain ID of the transaction.                                          |
| `version`                           | `field`                                                                 | Version of the transaction.                                           |

After generating a proof for a private function circuit, that proof (and associated public inputs) will be passed-into a private kernel circuit as private inputs. Private kernel circuits use the private function's proof, public inputs, and verification key, to verify the correct execution of the private function. Private kernel circuits then perform a number of checks and computations on the private function's public inputs.

> The above `C`s represent constants defined by the protocol. Each `C` might have a different value from the others.

<!--
TODO: use different values for each constant, instead of `C`, so that this document is as precise as possible.
-->

## Types

### `CallContext`

| Field                      | Type           | Description                                                                                                                                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `msg_sender`               | `AztecAddress` | Address of the caller contract.                                                                                                                                                           |
| `storage_contract_address` | `AztecAddress` | Address of the contract against which all state changes will be stored. (It is not called `contract_address`, because in the context of delegate calls, that would be an ambiguous name.) |
| `portal_contract_address`  | `AztecAddress` | Address of the portal contract to the storage contract.                                                                                                                                   |
| `is_delegate_call`         | `bool`         | A flag indicating whether the call is a [delegate call](../calls/delegate-calls.md).                                                                                                      |
| `is_static_call`           | `bool`         | A flag indicating whether the call is a [static call](../calls/static-calls.md).                                                                                                          |

### `ReadRequest`

| Field       | Type    | Description                            |
| ----------- | ------- | -------------------------------------- |
| `note_hash` | `field` | Hash of the note to be read.           |
| `counter`   | `field` | Counter at which the request was made. |

### `NullifierKeyValidationRequest`

<!-- These types might be wrong. The public key needs to be some encoding of a grumpkin point. The secret key needs to be an Fq field instead of an Fr field. -->

| Field        | Type    | Description                                                          |
| ------------ | ------- | -------------------------------------------------------------------- |
| `public_key` | `field` | Nullifier public key of an account.                                  |
| `secret_key` | `field` | Nullifier secret key of an account siloed with the contract address. |

### `NoteHash`

| Field     | Type    | Description                                 |
| --------- | ------- | ------------------------------------------- |
| `value`   | `field` | Hash of the note.                           |
| `counter` | `field` | Counter at which the note hash was created. |

### `Nullifier`

| Field               | Type    | Description                                                                                                              |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `value`             | `field` | Value of the nullifier.                                                                                                  |
| `counter`           | `field` | Counter at which the nullifier was created.                                                                              |
| `note_hash_counter` | `field` | Counter of the transient note the nullifier is created for. 0 if the nullifier does not associate with a transient note. |

### `UnencryptedLogHash`

<!-- Consider creating a LogHash class, that all three of the below classes can use, via class composition or via inheritance. The first 3 fields of each are the same. -->

| Field     | Type    | Description                            |
| --------- | ------- | -------------------------------------- |
| `hash`    | `field` | Hash of the unencrypted log.           |
| `length`  | `field` | Number of fields of the log preimage.  |
| `counter` | `field` | Counter at which the hash was emitted. |

### `EncryptedLogHash`

| Field        | Type    | Description                                  |
| ------------ | ------- | -------------------------------------------- |
| `hash`       | `field` | Hash of the encrypted log.                   |
| `length`     | `field` | Number of fields of the log preimage.        |
| `counter`    | `field` | Counter at which the hash was emitted.       |
| `randomness` | `field` | A random value to hide the contract address. |

### `EncryptedNotePreimageHash`

| Field               | Type    | Description                             |
| ------------------- | ------- | --------------------------------------- |
| `hash`              | `field` | Hash of the encrypted note preimage.    |
| `length`            | `field` | Number of fields of the note preimage.  |
| `counter`           | `field` | Counter at which the hash was emitted.  |
| `note_hash_counter` | `field` | Counter of the corresponding note hash. |

### `BlockHeader`

| Field                         | Type    | Description                                                                                     |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `note_hash_tree_root`         | `field` | Root of the note hash tree.                                                                     |
| `nullifier_tree_root`         | `field` | Root of the nullifier tree.                                                                     |
| `l1_to_l2_messages_tree_root` | `field` | Root of the l1-to-l2 messages tree.                                                             |
| `public_data_tree_root`       | `field` | Root of the public data tree.                                                                   |
| `archive_tree_root`           | `field` | Root of the state roots tree archived at the block prior to when the transaction was assembled. |
| `global_variables_hash`       | `field` | Hash of the previous global variables.                                                          |
