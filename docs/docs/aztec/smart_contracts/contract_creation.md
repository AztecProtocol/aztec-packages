---
title: Contract Deployment
sidebar_position: 0
tags: [contracts, protocol]
---

In the Aztec protocol, contracts are deployed as _instances_ of contract _classes_. The deployment process consists of two main steps: first registering the contract _class_ (if not already registered), and then creating a contract _instance_ that references this class.

## Contract Classes

A contract class is a collection of state variable declarations, and related unconstrained, private, and public functions. Contract classes don't have state, they just define code (storage structure and function logic). A contract class cannot be called; only a contract instance can be called.

### Key Benefits of Contract Classes

Contract classes simplify code reuse by making implementations a first-class citizen in the protocol. With a single class registration, multiple contract instances can be deployed that reference it, reducing deployment costs. Classes also facilitate upgradability by decoupling state from code, making it easier for an instance to switch to different code while retaining its state.

### Structure of a Contract Class

A contract class includes:

- `artifact_hash`: Hash of the contract artifact
- `private_functions`: List of individual private functions, including constructors
- `packed_public_bytecode`: Packed bytecode representation of the AVM bytecode for all public functions

The specification of the artifact hash is not enforced by the protocol. It should include commitments to unconstrained code and compilation metadata. It is intended to be used by clients to verify that an off-chain fetched artifact matches a registered class.

### Contract Class Registration

A contract class is registered by calling a private `register` function in a canonical `ContractClassRegisterer` contract, which emits a Registration Nullifier. This process guarantees that the public bytecode for a contract class is publicly available, which is required for deploying contract instances.

Contract class registration can be skipped if there are no public functions in the contract class, and the contract will still be usable privately. However, the contract class must be registered if it contains public functions, as these functions need to be publicly verifiable.

If you have a contract with public functions, you must either register the contract class to deploy or a contract, or skip the public deployment step, in which case only the private functions will be callable.

## Contract Instances

A deployed contract is effectively an instance of a contract class. It always references a contract class, which determines what code it executes when called. A contract instance has both private and public state, as well as an address that serves as its identifier.

### Structure of a Contract Instance

A contract instance includes:

- `version`: Version identifier, initially one
- `salt`: User-generated pseudorandom value for uniqueness
- `deployer`: Optional address of the contract deployer. Zero for universal deployment
- `contract_class_id`: Identifier of the contract class for this instance
- `initialization_hash`: Hash of the selector and arguments to the constructor
- `public_keys_hash`: Optional hash of public keys used for encryption and nullifying

### Instance Address

The address of a contract instance is computed as the hash of the elements in its structure. This computation is deterministic, allowing users to precompute the expected deployment address of their contract, including account contracts.

### Contract Initialization vs. Public Deployment

Aztec makes an important distinction between initialization and public deployment:

1. **Initialization**: A contract instance is considered Initialized once it emits an initialization nullifier, meaning it can only be initialized once. The default state for any address is to be uninitialized. A user who knows the preimage of the address can still issue a private call into a function in the contract, as long as that function doesn't assert that the contract has been initialized.
2. **Public Deployment**: A Contract Instance is considered to be publicly deployed when it has been broadcast to the network via a canonical `ContractInstanceDeployer` contract, which also emits a deployment nullifier. All public function calls to an undeployed address must fail, since the contract class for it is not known to the network.

### Initialization

Contract constructors are not enshrined in the protocol, but handled at the application circuit level. Constructors are methods used for initializing a contract, either private or public, and contract classes may declare more than a single constructor. They can be declared by the `#[initializer]` macro. You can read more about how to use them on the [Defining Initializer Functions](../../developers/guides/smart_contracts/writing_contracts/initializers.md) page.

A contract must ensure:

- It is initialized at most once
- It is initialized using the method and arguments defined in its address preimage
- It is initialized by its deployer (if non-zero)
- Functions dependent on initialization cannot be invoked until the contract is initialized

Functions in a contract may skip the initialization check.

## Verification of Executed Code

The protocol circuits, both private and public, are responsible for verifying that the code loaded for a given function execution matches the expected one. This includes checking that the `contract_class_id` of the called address is the expected one and that the function selector being executed is part of the `contract_class_id`.

## Genesis Contracts

The `ContractInstanceDeployer` and `ContractClassRegisterer` contracts exist from the genesis of the Aztec Network, as they are necessary for deploying other contracts to the network. Their nullifiers are pre-inserted into the genesis nullifier tree.

This modular approach to contract deployment creates a flexible system that supports diverse use cases, from public applications to private contract interactions, while maintaining the security and integrity of the Aztec protocol.

## Contract upgrades

### Original class id

A contract keeps track of the original contract class that it was deployed with, which is the "original" class id. It is this original class that is used when calculating and verifying the contract's [address](contract_creation#instance-address).
This variable remains unchanged even if a contract is upgraded.

### Current class id

When a contract is first deployed, its current class ID is set equal to its original class ID. The current class ID determines which code implementation the contract actually executes.

During an upgrade:

- The original class ID remains unchanged
- The current class ID is updated to refer to the new implementation
- All contract state/data is preserved

### How to upgrade

Contract upgrades in Aztec have to be performed by the contract that wishes to be upgraded calling the Contract instance deployer:

```noir
use dep::aztec::protocol_types::contract_class_id::ContractClassId;
use contract_instance_deployer::ContractInstanceDeployer;

#[private]
fn update_to(new_class_id: ContractClassId) {
    ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
        .update(new_class_id)
        .enqueue(&mut context);
}
```

The update function in the deployer is a public function, so you can enqueue it from a private function like the example or call it from a public function directly.
Note however that this update_to function is unsafe and would allow anyone to update the contract that implements it. Proper authorization systems must be in place to secure a contract from malicious upgrades.

Contract upgrades are implemented using a SharedMutable storage variable in the deployer protocol contract, since the upgrade applies to both public and private functions.
This means that they have a delay before entering into effect. The default delay is `3600` blocks but can be configured by the contract:

```noir
use dep::aztec::protocol_types::contract_class_id::ContractClassId;
use contract_instance_deployer::ContractInstanceDeployer;

#[private]
fn set_update_delay(new_delay: u32) {
   ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
      .set_update_delay(new_delay)
      .enqueue(&mut context);
}
```

Where new_delay is denominated in blocks. However, take into account that changing the update delay also has as delay the previous delay. So the first delay change will take 3600 blocks to take into effect.
It can't be set lower than 25 blocks.

When sending a transaction, the max_block_number of your TX will be the current block number you're simulating with + the minimum of the update delays that you're interacting with.
If your TX interacts with a contract that can be upgraded in 30 blocks and another one that can be upgraded in 300 blocks, the max_block_number will be current block + 30.
Note that this can be even lower if there is an upgrade pending in one of the contracts you're interacting with.
If the contract you interacted with will upgrade in 2 blocks, the max block number of your tx will be current + 1 blocks.
Other SharedMutable storage variables read in your tx might reduce this max_block_number further.

#### Upgrade Process

1. **Register New Implementation**

   - First, register the new contract class if it contains public functions
   - The new implementation must maintain state variable compatibility with the original contract

2. **Perform Upgrade**

   - Call the update function with the new contract class ID
   - The contract's original class ID remains unchanged
   - The current class ID is updated to the new implementation
   - All contract state and data are preserved

3. **Verify Upgrade**
   - After upgrade, the contract will execute functions from the new implementation
   - The contract's address remains the same since it's based on the original class ID
   - Existing state variables and their values are preserved

#### How to interact with an upgraded contract

The PXE stores the contract instances and classes in a local database. When a contract is updated, in order to interact with it we need to pass the new artifact to the PXE, since the protocol doesn't publish artifacts.
Consider this contract as an example:

```noir
#[aztec]
contract Updatable {
...

    #[private]
    fn update_to(new_class_id: ContractClassId) {
        ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS).update(new_class_id).enqueue(
            &mut context,
        );
    }
...
```

You'd upgrade it in aztec.js doing something similar to this:

```typescript
const contract = await UpdatableContract.deploy(wallet, ...args)
  .send()
  .deployed();
const updatedContractClassId = (
  await getContractClassFromArtifact(UpdatedContractArtifact)
).id;
await contract.methods.update_to(updatedContractClassId).send().wait();
```

Now, when the update has happened, calling at with the new contract artifact will automatically update the contract instance in the PXE if it's outdated:

```typescript
// 'at' will call PXE updateContract if outdated
const updatedContract = await UpdatedContract.at(address, wallet);
```

If you try to call `at` with a different contract that is not the current version, it'll fail

```typescript
// throws when trying to update the PXE instance to RandomContract
// since the current one is UpdatedContract
await RandomContract.at(address, wallet);
```

#### Security Considerations

1. **Access Control**

   - Implement proper access controls for upgrade functions
   - Consider customizing the upgrades delay for your needs using `set_update_delay`

2. **State Compatibility**

   - Ensure new implementation is compatible with existing state
   - Maintain the same storage layout to prevent data corruption

3. **Testing**

   - Test upgrades thoroughly in a development environment
   - Verify all existing functionality works with the new implementation

#### Example

```noir
contract Updatable {
    #[private]
    fn update_to(new_class_id: ContractClassId) {
        // TODO: Add access control
        assert(context.msg_sender() == owner, "Unauthorized");

        // Perform the upgrade
        ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
            .update(new_class_id)
            .enqueue(&mut context);
    }

    #[private]
    fn set_update_delay(new_delay: u32) {
        // TODO: Add access control
        ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
            .set_update_delay(new_delay)
            .enqueue(&mut context);
    }
}
```

## Further reading

To see how to deploy a contract in practice, check out the [dapp development tutorial](../../developers/tutorials/codealong/js_tutorials/simple_dapp/index.md).
