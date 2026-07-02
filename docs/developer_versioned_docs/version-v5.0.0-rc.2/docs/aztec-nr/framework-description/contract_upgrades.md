---
title: Contract Upgrades
sidebar_position: 14
tags: [contracts]
description: Understand contract upgrade patterns in Aztec and how to implement upgradeable contracts.
---

Each contract instance refers to a contract class ID for its code. Upgrading a contract's implementation involves updating its current class ID to a new class ID, while retaining the original class ID for address verification.

## Original class ID

A contract stores the original contract class it was instantiated with. This original class ID is used when calculating and verifying the contract's [address](../../foundational-topics/contract_creation#instance-address) and remains unchanged even if a contract is upgraded.

## Current class ID

When a contract is first deployed, its current class ID equals its original class ID. The current class ID determines which code implementation the contract executes.

During an upgrade:

- The original class ID remains unchanged
- The current class ID is updated to the new implementation
- All contract state and data are preserved

## How to upgrade

Contract upgrades must be initiated by the contract itself calling the `ContractInstanceRegistry`:

```rust
use aztec::protocol::{
    constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
    contract_class_id::ContractClassId,
};
use contract_instance_registry::ContractInstanceRegistry;

#[external("private")]
fn update_to(new_class_id: ContractClassId) {
    self.enqueue(
        ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .update(new_class_id)
    );
}
```

:::info
To use the `ContractInstanceRegistry`, add this dependency to your `Nargo.toml`:
```toml
contract_instance_registry = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v5.0.0-rc.2", directory="noir-projects/noir-contracts/contracts/protocol_interface/contract_instance_registry_interface" }
```
:::

The `update` function in the registry is a public function, so you can enqueue it from a private function (as shown above) or call it directly from a public function.

:::warning[Access Control]
The example `update_to` function above has no access control, meaning anyone could call it to upgrade your contract. Production contracts should implement proper authorization checks to secure against malicious upgrades.
:::

Contract upgrades use a `DelayedPublicMutable` storage variable in the `ContractInstanceRegistry`, applying to both public and private functions. Upgrades have a delay before taking effect. The default delay is `86400` seconds (one day) but can be configured:

```rust
#[external("private")]
fn set_update_delay(new_delay: u64) {
    self.enqueue(
        ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .set_update_delay(new_delay)
    );
}
```

The `new_delay` parameter is in seconds. Changing the update delay is also subject to the previous delay, so the first delay change takes `86400` seconds to take effect.

:::info
The minimum update delay is `600` seconds.
:::

### Transaction expiration

When sending a transaction, the expiration timestamp is calculated as the current block timestamp plus the minimum update delay of all contracts you interact with. For example:

- If you interact with contracts having delays of 1000 and 10000 seconds, expiration is current timestamp + 1000 seconds
- If a contract has a pending upgrade in 100 seconds, expiration would be current timestamp + 99 seconds

Other `DelayedPublicMutable` storage variables in your transaction may reduce the expiration timestamp further.

:::note
Only deployed contract instances can upgrade or change their upgrade delay. This restriction may be lifted in the future.
:::

### Upgrade process

1. **Register the new implementation**: Register the new contract class if it contains public functions. The new implementation must maintain state variable compatibility with the original contract.

2. **Perform the upgrade**: Call the update function with the new contract class ID. The contract's original class ID remains unchanged while the current class ID updates to the new implementation.

3. **Wait for the delay**: The upgrade takes effect after the configured delay period.

4. **Verify the upgrade**: After the delay, the contract executes functions from the new implementation. The contract address remains the same since it's based on the original class ID.

### Interacting with an upgraded contract

The PXE stores contract instances and classes locally. After a contract upgrades, you must register the new artifact with the wallet before interacting with it:

```typescript
import { getContractClassFromArtifact } from '@aztec/aztec.js/contracts';
import { publishContractClass } from '@aztec/aztec.js/deployment';

// Deploy the original contract (use .wait() to get both contract and instance)
const { contract, instance } = await UpdatableContract.deploy(wallet, ...args)
  .send({ from: accountAddress })
  .wait();

// Publish the new contract class (required before upgrading)
await (await publishContractClass(wallet, UpdatedContractArtifact))
  .send({ from: accountAddress })
  .wait();

// Get the new contract class ID
const updatedContractClassId = (
  await getContractClassFromArtifact(UpdatedContractArtifact)
).id;

// Trigger the upgrade
await contract.methods
  .update_to(updatedContractClassId)
  .send({ from: accountAddress })
  .wait();

// Wait for the upgrade delay to pass...

// Register the new artifact with the wallet
await wallet.registerContract(instance, UpdatedContract.artifact);

// Create a contract instance with the new artifact
const updatedContract = UpdatedContract.at(contract.address, wallet);
```

If you try to register a contract artifact that doesn't match the current contract class, the registration will fail.

### Security considerations

1. **Access control**: Implement proper access controls for upgrade functions. Consider using `set_update_delay` to customize the delay for your security requirements.

2. **State compatibility**: Ensure the new implementation is compatible with existing state. Maintain the same storage layout to prevent data corruption.

3. **Testing**: Test upgrades thoroughly in a development environment. Verify all existing functionality works with the new implementation.
