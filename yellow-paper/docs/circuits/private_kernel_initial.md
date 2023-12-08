# Private Kernel Circuit - Initial

:::info Disclaimer
This is a draft. These requirements need to be considered by the wider team, and might change significantly before a mainnet release.
:::

## Requirements

In the **initial** kernel iteration, the process involves taking a transaction request and private call data, verifying their integrity, and preparing the necessary data for subsequent circuits to operate. This step is particularly beneficial due to its separation from the [inner private kernel circuit](./private_kernel_inner.md), as the first call lacks a "previous kernel" to process. Additionally, it executes tasks that are pertinent to a transaction and need only occur once.

### Key Responsibilities Specific to this Circuit:

#### Validating the correspondence of function call with caller's intent.

This entails ensuring that the following data from the private call aligns with the specifications in the transaction request:

- Contract address.
- [Function data](#function_data).
- Function arguments.

> Although it's not enforced in the protocol, it is customary to provide a signature signed over the transaction request and verify it in the first function call. This practice guarantees that only the party possessing the key(s) can authorize a transaction with the exact transaction request.

#### Verifying the legitimacy of the function as the entrypoint.

- It must be a private function.
- It must not be an internal function.

#### Ensuring the function call is the first call.

- It must not be a delegate call.
- It must not be a static call.

#### Ensuring transaction uniqueness.

- It must emit the hash of the transaction request as a nullifier.

This nullifier serves multiple purposes:

- Identifying a transaction.
- Preventing the signature of a transaction request from being reused in another transaction.
- Generating values that should be maintained within the transaction's scope. For example, it is utilized to compute the nonces for all the new note hashes in a transaction.

> Note that the final transaction data is not deterministic for a given transaction request. The production of new notes, the destruction of notes, and various other values are likely to change based on the time and conditions when a transaction is being composed. However, the intricacies of implementation should not be a concern for the entity initiating the transaction.

### Responsibilities for Processing the Private Function Call:

#### Ensuring the contract instance being called is deployed.

It proves that the nullifier representing the contract exists in the contract tree.

This nullifier is the contract address siloed with the address of a precompiled deployment contract.

#### Ensuring the function being called exists in the contract.

The contract address contains the contract class ID, which is a hash of the root of its function tree and additional values. This circuit leverages these characteristics to establish the validity of the function's association with the contract address.

Each leaf of the function tree is a hash representing a function. The preimage includes:

- Function data.
- Hash of the verification key.
- Hash of the function bytecode.

To ensure the function's existence, the circuit executes the following steps:

1. Computes the hash of the verification key.
2. Calculates the function leaf: `hash(...function_data, vk_hash, bytecode_hash)`
3. Derives the function tree root with the leaf and the specified sibling path.
4. Computes the contract class ID using the function tree root and additional information.
5. Generates the contract address using the contract class ID and other relevant details.
6. Validates that the contract address matches the address specified in the private call data.

#### Verifying the app private function proof.

It verifies that the private function was executed successfully with the provided proof data, verification key, and the public inputs of the app circuit.

#### Verifying the app circuit public inputs.

It ensures the app circuit's intention by checking the following:

- The contract address for each non-empty item in the following arrays must equal the current contract address:
  - Read requests.
  - New note hashes.
  - New nullifiers.
  - L2-to-L1 messages.
- The portal contract address for each non-empty L2-to-L1 message must equal the current portal contract address.
- If the new contracts array is not empty, the contract address must equal the precompiled deployment contract address.
- The historical data must match the one in the constant data.

> Ensuring the alignment of the contract addresses is crucial, as it is later used to silo the value and to establish associations with values within the same contract.

#### Verifying the call requests.

For both private and public call requests initiated in the current function call, it ensures that for each request at index _i_:

- Its hash equals the value at index _i_ within the call request hashes array in app circuit's public inputs.
- Its caller context is either empty or aligns with the call context of the current function call, including:
  - _msg_sender_
  - Storage contract address.

> It is important to note that the caller context in a call request may be empty for standard calls. This precaution is crucial to prevent information leakage, particularly as revealing the _msg_sender_ to the public could pose security risks when calling a public function.

#### Verifying the counters.

It verifies that each relevant value is associated with a legitimate counter.

For the current call:

- The _counter_start_ must be 0.
- The _counter_end_ must be greater than the _counter_start_.

For both private and public call requests:

- The _counter_end_ of each request must be greater than its _counter_start_.
- The _counter_start_ of the first request must be greater than the _counter_start_ of the current call.
- The _counter_start_ of the second and subsequent requests must be greater than the _counter_end_ of the previous request.
- The _counter_end_ of the last request must be less than the _counter_end_ of the current call.

For items in each ordered array created in the current call:

- The counter of the first item much be greater than the _counter_start_ of the current call.
- The counter of each subsequent item much be greater than the counter of the previous item.
- The counter of the last item much be less than the _counter_end_ of the current call.

The ordered arrays include:

- Read requests.
- New note hashes.
- New nullifiers.
- New contracts.

### Responsibilities for Validating the Public Inputs:

#### Verifying the accumulated data.

It verifies that the following values align with those in the app circuit's public inputs:

- Read requests.
- New note hashes.
- New nullifiers.
- L2-to-L1 messages.
- Private call requests.
- Public call requests.
- New contracts.
- Log hashes.
- Log lengths.

For the new note hashes, it also verifies that each is associated with a nullifier counter, which is provided as a hint via the private inputs. The nullifier counter can be:

- Zero: if the note is not nullified in the same transaction.
- Greater than zero: if the note is nullified in the same transaction.
  - This value must be greater than the counter of the note hash.

> Nullifier counters are used in the [reset private kernel circuit](./private_kernel_reset.md#verifying-read-requests) to ensure a read happens **before** a transient note is nullified.

> Zero can be used to indicate a non-existing transient nullifier, as this value can never serve as the counter of a nullifier. It corresponds to the _counter_start_ of the first function call.

Additionally, it ensures that the following arrays are empty:

- Public read requests.
- Public update requests.

#### Verifying the constant data.

It verifies that:

- The transaction context matches the one in the transaction request.

> The historical data must align with the data used in the app circuit, as verified [earlier](#verifying-the-app-circuit-public-inputs).

## Private Inputs

### Transaction Request

A transaction request represents the caller's intent. It contains:

- Sender's address.
- <a name="function_data">Function data</a>:

  - Function selector.
  - Function type (private/public/unconstrained).
  - A flag indicating whether the function is an internal function.

- Hash of the function arguments.
- <a name="transaction_context">Transaction context</a>:

  - A flag indicating whether it is a fee paying transaction.
  - A flag indicating whether it is a fee rebate transaction.
  - Chain ID.
  - Version of the transaction.

### Private Call Data

The private call data holds details about the current private function call and includes hints that aid in the verifications carried out in this circuit:

- Contract address.
- Function data.
- Private call requests.
- Public call requests.
- App circuit public inputs.
- Proof of the app circuit.
- Verification key.
- Hash of the function bytecode.
- Membership witness for the function leaf.
- Membership witness for the contract leaf.
- Transient note nullifier counters.

## Public Inputs

The structure of public inputs aligns with that of other kernel circuits.

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
- [Transaction context](#transaction_context).
