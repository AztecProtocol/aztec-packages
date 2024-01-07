# Public Kernel Circuit - Inner

:::info Disclaimer
This is a draft. These requirements need to be considered by the wider team, and might change significantly before a mainnet release.
:::

## Requirements

In the public kernel iteration, the process involves taking a previous iteration and public call data, verifying their integrity, and preparing the necessary data for subsequent circuits to operate.

### Verification of the Previous Iteration

#### Verifying the previous kernel proof.

It verifies that the previous iteration was executed successfully with the given proof data, verification key, and public inputs.

The preceding proof can be:

- [Initial public kernel proof](./public-kernel-initial.md).
- Inner public kernel proof.

### Processing Public Function Call

#### Ensuring the function being called exists in the contract.

This section follows the same process as outlined in the [initial private kernel circuit](./private-kernel-initial.md#ensuring-the-function-being-called-exists-in-the-contract).

#### Ensuring the contract instance being called is deployed.

It verifies the public deployment of the contract instance by conducting a membership proof, where:

- The leaf is a nullifier emitting from the deployer contract, computed as _`hash(deployer_address, contract_address)`_, where:
  - _deployer_address_ is from _[private_inputs](#private-inputs).[public_call](#publiccalldata).[contract_data](../contract-deployment/instances.md#structure)_.
  - _contract_data_ is from _[private_inputs](#private-inputs).[public_call](#publiccalldata).[call_stack_item](#publiccallstackitem)_.
- The index and sibling path are provided in _contract_deployment_membership_witness_ through _[private_inputs](#private-inputs).[public_call](#publiccalldata)_.
- The root is the _nullifier_tree_root_ in the _[block_header](./private-function.md#blockheader)_ within _[public_inputs](#public-inputs).[constant_data](./private-kernel-initial.md#constantdata)_.

#### Ensuring the function is legitimate:

- It must be a public function.

#### Ensuring the current call matches the call request.

The top item in the previous iteration's public call requests must pertain to the current function call.

This circuit will pop the request from the stack, comparing the hash with that of the current function call.

The preimage of the hash is the concatenation of:

- Contract address.
- Function data.
- Public function circuit's public inputs.

#### Ensuring this function is called with the correct context.

1. If it is a standard call:

   - The storage contract address of the current iteration must be the same as its contract address.
   - The _msg_sender_ of the current iteration must be the same as the caller's contract address.

2. If it is a delegate call:

   - The caller context in the call request must not be empty. Specifically, the following values of the caller should not be zeros:
     - _msg_sender_.
     - Storage contract address.
   - The _msg_sender_ of the current iteration must equal the caller's _msg_sender_.
   - The storage contract address of the current iteration must equal the caller's storage contract address.
   - The storage contract address of the current iteration must NOT equal the contract address.

3. If it is an internal call:

   - The _msg_sender_ of the current iteration must equal the storage contract address.

#### Verifying the public function proof.

It verifies that the public function was executed with the provided proof data, verification key, and the public inputs of the VM circuit. The result of the execution is specified in the public inputs, which will be used in subsequent steps to enforce the conditions they must satisfy.

#### Verifying the public inputs of the public function circuit.

It ensures the function's intention by checking the following:

- The contract address for each non-empty item in the following arrays must equal the storage contract address of the current call:
  - Note hash contexts.
  - Nullifier contexts.
  - L2-to-L1 message contexts.
  - Read requests.
  - Update requests.
- The portal contract address for each non-empty L2-to-L1 message must equal the portal contract address of the current call.

> Ensuring the alignment of the contract addresses is crucial, as it is later used to silo the value and to establish associations with values within the same contract.

If it is a static call, it must ensure that the function does not induce any state changes by verifying that the following arrays are empty:

- Note hash contexts.
- Nullifier contexts.
- L2-to-L1 message contexts.
- Update requests.

#### Verifying the call requests.

For the public call requests initiated in the current function call, it ensures that for each request at index _i_:

- Its hash equals the value at index _i_ within the call request hashes array in public function circuit's public inputs.
- If the hash is not zero, its caller context must align with the call context of the current function call, including:
  - _msg_sender_
  - Storage contract address.

#### Verifying the counters.

It verifies that each relevant value is associated with a legitimate counter.

1. For the current call:

   - The _counter_end_ of the current call must be greater than its _counter_start_.
   - Both counters must match the ones defined in the top item in the previous iteration's public call requests.

2. For the public call requests:

   - The _counter_end_ of each request must be greater than its _counter_start_.
   - The _counter_start_ of the first request must be greater than the _counter_start_ of the current call.
   - The _counter_start_ of the second and subsequent requests must be greater than the _counter_end_ of the previous request.
   - The _counter_end_ of the last request must be less than the _counter_end_ of the current call.

3. For items in each ordered array created in the current call:

   - The counter of the first item much be greater than the _counter_start_ of the current call.
   - The counter of each subsequent item much be greater than the counter of the previous item.
   - The counter of the last item much be less than the _counter_end_ of the current call.

   The ordered arrays include:

   - Read requests.
   - Update requests.

### Validating Public Inputs

#### Verifying the accumulated data.

1. It ensures that the following values match those in the previous iteration's public inputs:

   - Note hashes.
   - Nullifiers.
   - L2-to-L1 messages.
   - **Encrypted** log hash.
   - **Encrypted** log length.
   - Old public data tree snapshot.
   - New public data tree snapshot.

2. It checks that the hash and the length for **unencrypted** logs are accumulated as follows:

   - New log hash = `hash(prev_hash, cur_hash)`
     - If either hash is zero, the new hash will be `prev_hash | cur_hash`
   - New log length = `prev_length + cur_length`

#### Verifying the transient accumulated data.

1. It verifies that the following values match the result of combining the values in the previous iteration's public inputs with those in the public function circuit's public inputs:

   - Note hash contexts.
   - Nullifier contexts.
   - L2-to-L1 message contexts.
   - Read requests.
   - Update requests.

2. For the newly added update requests from public function circuit's public inputs, this circuit also checks that each is associated with an override counter, provided as a hint via the private inputs. This override counter can be:

   - Zero: if the slot does not change later in the same transaction.
   - Greater than zero: if the slot is updated later in the same transaction.
     - It pertains to a subsequent update request altering the same slot. Therefor, the counter value must be greater than the counter of the update request.

   > Override counters are used in the [tail public kernel circuit](./public-kernel-tail.md) to ensure a read happens **before** the value is changed in a later update.

   > Zero serves as an indicator for an unchanged update, as this value can never act as the counter of an update request. It corresponds to the _counter_start_ of the first function call.

3. It verifies that the public call requests include:

   - All requests from the previous iteration's public inputs except for the top one.
   - All requests present in the public call data, appended to the above in **reverse** order.

#### Verifying the constant data.

It verifies that the constant data matches the one in the previous iteration's public inputs.

## Private Inputs

### _PreviousKernel_

The format aligns with the _[PreviousKernel](./private-kernel-tail.md#previouskernel)_ of the tail public kernel circuit.

### _PublicCallData_

Data that holds details about the current public function call.

| Field                                    | Type                                                                 | Description                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| _call_stack_item_                        | _[PublicCallStackItem](#publiccallstackitem)_                        | Information about the current public function call.                 |
| _proof_                                  | _Proof_                                                              | Proof of the public function circuit.                               |
| _vk_                                     | _VerificationKey_                                                    | Verification key of the public function circuit.                    |
| _bytecode_hash_                          | _field_                                                              | Hash of the function bytecode.                                      |
| _contract_data_                          | _[ContractInstance](../contract-deployment/instances.md#structure)_  | Data of the contract instance being called.                         |
| _contract_class_data_                    | _[ContractClassData](./private-kernel-initial.md#contractclassdata)_ | Data of the contract class.                                         |
| _function_leaf_membership_witness_       | _[MembershipWitness](./private-kernel-inner.md#membershipwitness)_   | Membership witness for the function being called.                   |
| _contract_deployment_membership_witness_ | _[MembershipWitness](./private-kernel-inner.md#membershipwitness)_   | Membership witness for the deployment of the contract being called. |

### _Hints_

Data that aids in the verifications carried out in this circuit or later iterations:

- Update requests override counters.

## Public Inputs

The format aligns with the _[Public Inputs](./public-kernel-tail.md#public-inputs)_ of the tail public kernel circuit.

## Types

### _PublicCallStackItem_

| Field              | Type                            | Description                                               |
| ------------------ | ------------------------------- | --------------------------------------------------------- |
| _contract_address_ | _AztecAddress_                  | Address of the contract on which the function is invoked. |
| _function_data_    | _[FunctionData](#functiondata)_ | Data of the function being called.                        |
| _public_inputs_    | _PublicFunctionPublicInputs_    | Public inputs of the public vm circuit.                   |
| _counter_start_    | _field_                         | Counter at which the function call was initiated.         |
| _counter_end_      | _field_                         | Counter at which the function call ended.                 |
