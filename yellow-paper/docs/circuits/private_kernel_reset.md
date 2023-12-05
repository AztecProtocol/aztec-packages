# Private Kernel Circuit - Reset

:::info Disclaimer
This is a draft. These requirements need to be considered by the wider team, and might change significantly before a mainnet release.
:::

## Requirements

The **reset** circuit is designed to abstain from processing individual private function calls. Instead, it injects the outcomes of an initial or inner private kernel circuit, scrutinizes the public inputs, and resets the verified data within its scope. This circuit can be executed either preceding the tail circuit or as a means to "reset" public inputs, allowing data to accumulate seamlessly in subsequent iterations.

The incorporation of this circuit not only enhances the modularity and repeatability of the "reset" process but also diminishes the overall workload. Rather than conducting resource-intensive computations such as membership checks in each iteration, these tasks are only performed as necessary within the reset circuits.

### Verification of the Previous Iteration:

#### Verifying the previous kernel proof.

It verifies that the previous iteration was executed successfully with the given proof data, verification key, and public inputs.

The preceding proof can be:

- [Initial private kernel proof](./private_kernel_initial.md).
- [Inner private kernel proof](./private_kernel_inner.md).

### Responsibilities for Verifying and Resetting Data:

#### Verifying read requests.

A read request can pertain to one of two note types:

- A persistent note: generated in a prior successful transaction and included in the note hash tree.
- A transient note: created in the current transaction, not yet part of the note hash tree.

This distinction is indicated by a flag _is_transient_ in the read request.

For each non-empty read request in the previous kernel's public inputs, it can be cleared if it meets either of the following conditions:

1. When reading a persistent note, it requires a valid membership check, where:

- The leaf corresponds to the note hash being read.
- The sibling path is provided as a hint.
- The root matches the note hash tree root in the historical data.

2. When reading a transient note, it must have been created before the read operation:

- Locates the note hash within the new note hashes.
  - Its index in the new note hashes array is provided as a hint through private inputs.
- The note hash must equal the note hash of the read request.
- The contract address of the note hash must equal the contract address of the read request.
- The counter of the note hash must be less than the counter of the read request.
- The nullifier counter of the note hash must be zero or a value greater than the counter of the read request.

For reading a transient note created in a yet-to-be-processed nested execution:

- The index provided as a hint will be the length of the new note hashes array, indicating the transient note hasn't been added yet.
- The read request must be propagated to the public inputs.

> Given that a reset circuit can execute between two inner circuits, there's a possibility that a transient note is created in a nested execution and hasn't been added to the public inputs. In such cases, the read request cannot be verified in the current reset circuit and must be processed in another reset circuit after the transient note has been included in the public input.

#### Squashing transient note hashes and nullifiers.

In the event that a transient note is nullified within the same transaction, both its note hash and nullifier can be expunged from the public inputs. This not only avoids redundant data broadcasting but also frees up space for additional note hashes and nullifiers.

For each nullifier associated with a non-zero nullified note hash:

1. Finds its index in the new note hashes array using hints provided through private inputs. Proceeds no further if the index value equals the length of the new note hashes array.
2. Locates the note hash in the new note hashes array using the identified index.
3. The note hash must equal the nullified note hash associated with the nullifier.
4. The contract address of the note hash must equal the contract address of the nullifier.
5. The nullifier counter of the note hash must equal the counter of the nullifier.
   - The nullifier counter is assured to be greater than the counter of the note hash when propagated from the [initial](./private_kernel_initial.md#verifying-the-accumulated-data) or [inner](./private_kernel_inner.md#verifying-the-accumulated-data) private kernel circuits.
6. Sets both the note hash and the nullifier to zero.

> It is imperative to set the note hash and nullifier to zeros before processing the next nullifier. This precaution prevents two nullifiers from nullifying the same note. By clearing the values, the second nullifier will identify its corresponding note hash as having a zero value, and will fail to compare its nullified note hash with a zero hash.

> Note that an index hint can be set as the length of the note hash array to bypass the above process even when the corresponding nullifier is nullifying a transient note hash already present in the public inputs. The transient note hash must be retained in the public inputs for reading in a yet-to-be-processed nested execution.

### Responsibilities for Validating the Public Inputs:

#### Verifying the accumulated data.

The following must equal the result after verifying or squashing:

- Read requests.
- New note hashes.
- New nullifiers.

The following must be empty:

- Public read requests.
- Public update requests.

The following must equal the corresponding values in the previous kernel's public inputs:

- L2-to-L1 messages.
- Private call requests.
- Public call requests.
- New contracts.
- Log hashes.
- Log lengths.

#### Verifying the constant data.

It verifies that:

- The historical data matches the data in the app circuit's public inputs.
- The transaction context matches the one in the previous iteration's public inputs.

## Private Inputs

### Previous Kernel

The data of the previous kernel iteration:

- Public inputs of the previous kernel proof.
- Proof of the kernel circuit. It could be one of the following private kernel circuits:
  - Initial.
  - Inner.
- Verification key of the kernel circuit.
- Membership witness for the verification key.

### Hints

Data that aids in the verifications carried out in this circuit:

- Membership witnesses for persistent read requests.
- Indices of note hashes for transient read requests.
- Indices of note hashes for transient nullifiers.

## Public Inputs

The structure of public inputs aligns with that of other private kernel circuits.

### Accumulated Data

It contains the result from the current function call:

- Read requests.
- New note hashes.
- New nullifiers.
- L2-to-L1 messages.
- Private call requests.
- Public call requests.
- New contracts.
- Log hashes.
- Log lengths.
- Public read requests.
- Public update requests.

### Constant Data

These are constants that remain the same throughout the entire transaction:

- Historical data - representing the states of the block at which the transaction is constructed, including:
  - Hash of the global variables.
  - Roots of the trees:
    - Note hash tree.
    - Nullifier tree.
    - Contract tree.
    - L1-to-l2 message tree.
    - Public data tree.
- Transaction context.
