# Public Kernel Circuit - Iterative

:::info Disclaimer
This is a draft. These requirements need to be considered by the wider team, and might change significantly before a mainnet release.
:::

## Requirements

In the public kernel iteration, the process involves taking a previous iteration and public call data, verifying their integrity, and preparing the necessary data for subsequent circuits to operate.

### Responsibilities for Processing the Previous Iteration:

#### Verifying the previous kernel proof.

It verifies that the previous iteration was executed successfully with the given proof data, verification key, and public inputs.

The preceding proof can be:

- [Reset private kernel proof](./private_kernel_reset.md).
- Iterative public kernel proof.

### Responsibilities for Processing the Public Function Call:

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
6. Validates that the contract address matches the address specified in the call data.

#### Ensuring the function is legitimate:

- It must be a public function.

#### Ensuring the current call matches the call request.

The top item in the previous iteration's public call requests must pertain to the current function call.

This circuit will pop the request from the stack, comparing the hash with that of the current function call.

The preimage of the hash encompasses:

- Contract address.
- Function data.
- App circuit's public inputs.

#### Ensuring this function is called with the correct context.

If it is a standard call:

- The storage contract address of the current iteration must be the same as its contract address.
- The _msg_sender_ of the current iteration must be the same as the caller's contract address.

If it is a delegate call:

- The caller context in the call request must not be empty. Specifically, the following values of the caller should not be zeros:
  - _msg_sender_.
  - Storage contract address.
- The _msg_sender_ of the current iteration must equal the caller's _msg_sender_.
- The storage contract address of the current iteration must equal the caller's storage contract address.
- The storage contract address of the current iteration must NOT equal the contract address.

If it is an internal call:

- The _msg_sender_ of the current iteration must equal the storage contract address.

#### Verifying the app public function proof.

It verifies that the public function was executed with the provided proof data, verification key, and the public inputs of the VM circuit. The result of the execution is specified in the public inputs, which will be used in subsequent steps to enforce the conditions they must satisfy.

#### Verifying the app circuit public inputs.

It ensures the function's intention by checking the following:

- The contract address for each non-empty item in the following arrays must equal the storage contract address of the current call:
  - New note hashes.
  - New nullifiers.
  - L2-to-L1 messages.
  - Public read requests.
  - Public update requests.
- The portal contract address for each non-empty L2-to-L1 message must equal the portal contract address of the current call.

> Ensuring the alignment of the contract addresses is crucial, as it is later used to silo the value and to establish associations with values within the same contract.

If it is a static call, it must ensure that the function does not induce any state changes by verifying that the following arrays are empty:

- New note hashes.
- New nullifiers.
- L2-to-L1 messages.
- Public update requests.

#### Verifying the call requests.

For the public call requests initiated in the current function call, it ensures that for each request at index _i_:

- Its hash equals the value at index _i_ within the call request hashes array in app circuit's public inputs.
- If the hash is not zero, its caller context must align with the call context of the current function call, including:
  - _msg_sender_
  - Storage contract address.

#### Verifying the counters.

It verifies that each relevant value is associated with a legitimate counter.

For the current call:

- The _counter_end_ of the current call must be greater than its _counter_start_.
- Both counters must match the ones defined in the top item in the previous iteration's public call requests.

For the public call requests:

- The _counter_end_ of each request must be greater than its _counter_start_.
- The _counter_start_ of the first request must be greater than the _counter_start_ of the current call.
- The _counter_start_ of the second and subsequent requests must be greater than the _counter_end_ of the previous request.
- The _counter_end_ of the last request must be less than the _counter_end_ of the current call.

For items in each ordered array created in the current call:

- The counter of the first item much be greater than the _counter_start_ of the current call.
- The counter of each subsequent item much be greater than the counter of the previous item.
- The counter of the last item much be less than the _counter_end_ of the current call.

The ordered arrays include:

- Public read requests.
- Public update requests.

### Responsibilities for Validating the Public Inputs:

#### Verifying the accumulated data.

1. It ensures that the following values align with those in the previous iteration's public inputs:

- New contracts.
- Encrypted log hash.
- Encrypted log length.

2. It verifies that the following values match the result of combining the values in the previous iteration's public inputs with those in the app circuit's public inputs:

- New note hashes.
- New nullifiers.
- L2-to-L1 messages.
- Public read requests.
- Public update requests.

3. For the newly added public update requests from app circuits' public inputs, this circuit also checks that each is associated with an override counter, provided as a hint via the private inputs. This override counter can be:

- Zero: if the slot does not change later in the same transaction.
- Greater than zero: if the slot is updated later in the same transaction.
  - It pertains to a subsequent update request altering the same slot. Therefor, the counter value must be greater than the counter of the update request.

> Override counters are used in the [tail public kernel circuit](./public_kernel_tail.md) to ensure a read happens **before** the value is changed in a later update.

> Zero serves as an indicator for an unchanged update, as this value can never act as the counter of an update request. It corresponds to the _counter_start_ of the first function call.

4. It verifies that the public call requests include:

- All requests from the previous iteration's public inputs except for the top one.
- All requests present in the app circuit's public inputs.

5. It checks that the hash and the length for unencrypted logs are accumulated as follows:

- New log hash = `hash(prev_hash, cur_hash)`
  - If either hash is zero, the new hash will be `prev_hash | cur_hash`
- New log length = `prev_length + cur_length`

6. It ensures that the following arrays are empty:

- Read requests.
- Private call requests.

#### Verifying the constant data.

It verifies that the constant data matches the one in the previous iteration's public inputs.

## Private Inputs

### Previous Kernel

The data of the previous kernel iteration:

- Public inputs of the previous kernel proof.
- Proof of the kernel circuit. It could be one of the following kernel circuits:
  - Reset private kernel circuit.
  - Iterative public kernel circuit.
- Verification key of the kernel circuit.
- Membership witness for the verification key.

### Public Call Data

The call data holds details about the current public function call and includes hints that aid in the verifications carried out in this circuit:

- Contract address.
- Function data.
- Public call requests.
- App circuit public inputs.
- Proof of the app circuit.
- Verification key.
- Hash of the function bytecode.
- Membership witness for the function leaf.
- Membership witness for the contract leaf.
- Update requests override counters.

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
- Transaction context.
