---
title: Contract Upgrades
sidebar_position: 2
tags: [contracts]
---

For familiarity we've used terminology like "deploying a contract instance of a contract class". When considering how it works with contract upgrades it helps to be more specific.

Each deployed contract holds its state, and refers to a class id for its code. Upgrading a contracts implementation is achieved by updating its "current class id" to the new class id, whilst retaining the "original class id" for reasons explained below.

## Original class id

A contract keeps track of the original contract class that it was deployed with, which is the "original" class id. It is this original class that is used when calculating and verifying the contract's [address](contract_creation#instance-address).
This variable remains unchanged even if a contract is upgraded.

## Current class id

When a contract is first deployed, its current class ID is set equal to its original class ID. The current class ID determines which code implementation the contract actually executes.

During an upgrade:

- The original class ID remains unchanged
- The current class ID is updated to refer to the new implementation
- All contract state/data is preserved

## How to upgrade

Contract upgrades in Aztec have to be performed by the contract that wishes to be upgraded calling the Contract instance deployer:

```rust
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

:::note
Recall that `#[private]` means calling this function preserves privacy, and it still CAN be called externally by anyone.
So the `update_to` function above allows anyone to update the contract that implements it. A more complete implementation should have a proper authorization systems to secure contracts from malicious upgrades.
:::

Contract upgrades are implemented using a SharedMutable storage variable in the deployer protocol contract, since the upgrade applies to both public and private functions.
This means that they have a delay before entering into effect. The default delay is `86400` seconds but can be configured by the contract:

```rust
use dep::aztec::protocol_types::contract_class_id::ContractClassId;
use contract_instance_deployer::ContractInstanceDeployer;

#[private]
fn set_update_delay(new_delay: u64) {
   ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
      .set_update_delay(new_delay)
      .enqueue(&mut context);
}
```

Where `new_delay` is denominated in blocks. However, take into account that changing the update delay also has as its delay that is the previous delay. So the first delay change will take 3600 blocks to take into effect.

:::info
The update delay cannot be set lower than `600` seconds
:::

When sending a transaction, the expiration timestamp of your tx will be the timestamp of the current block number you're simulating with + the minimum of the update delays that you're interacting with.
If your tx interacts with a contract that can be upgraded in 1000 seconds and another one that can be upgraded in 10000 seconds, the expiration timestamp (include_by_timestamp property on the tx) will be current block timestamp + 1000.
Note that this can be even lower if there is an upgrade pending in one of the contracts you're interacting with.
If the contract you interacted with will upgrade in 100 seconds, the expiration timestamp of your tx will be current block timestamp + 99 seconds.
Other SharedMutable storage variables read in your tx might reduce this expiration timestamp further.

:::note
Only deployed contract instances can upgrade or change its upgrade delay currently. This restriction might be lifted in the future.
:::

### Upgrade Process

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

### How to interact with an upgraded contract

The PXE stores the contract instances and classes in a local database. When a contract is updated, in order to interact with it we need to pass the new artifact to the PXE, since the protocol doesn't publish artifacts.
Consider this contract as an example:

```rust
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

Now, when the update has happened, calling `at` with the new contract artifact will automatically update the contract instance in the PXE if it's outdated:

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

### Security Considerations

1. **Access Control**

   - Implement proper access controls for upgrade functions
   - Consider customizing the upgrades delay for your needs using `set_update_delay`

2. **State Compatibility**

   - Ensure new implementation is compatible with existing state
   - Maintain the same storage layout to prevent data corruption

3. **Testing**

   - Test upgrades thoroughly in a development environment
   - Verify all existing functionality works with the new implementation

### Example

```rust
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
    fn set_update_delay(new_delay: u64) {
        // TODO: Add access control
        ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS)
            .set_update_delay(new_delay)
            .enqueue(&mut context);
    }
}
```
