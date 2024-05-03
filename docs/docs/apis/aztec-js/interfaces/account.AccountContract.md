---
id: "account.AccountContract"
title: "Interface: AccountContract"
sidebar_label: "AccountContract"
custom_edit_url: null
---

[account](../modules/account.md).AccountContract

An account contract instance. Knows its artifact, deployment arguments, how to create
transaction execution requests out of function calls, and how to authorize actions.

## Methods

### getAuthWitnessProvider

▸ **getAuthWitnessProvider**(`address`): [`AuthWitnessProvider`](account.AuthWitnessProvider.md)

Returns the auth witness provider for the given address.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `CompleteAddress` | Address for which to create auth witnesses. |

#### Returns

[`AuthWitnessProvider`](account.AuthWitnessProvider.md)

___

### getContractArtifact

▸ **getContractArtifact**(): `ContractArtifact`

Returns the artifact of this account contract.

#### Returns

`ContractArtifact`

___

### getDeploymentArgs

▸ **getDeploymentArgs**(): `undefined` \| `any`[]

Returns the deployment arguments for this instance, or undefined if this contract does not require deployment.

#### Returns

`undefined` \| `any`[]

___

### getInterface

▸ **getInterface**(`address`, `publicKeysHash`, `nodeInfo`): [`AccountInterface`](account.AccountInterface.md)

Returns the account interface for this account contract given a deployment at the provided address.
The account interface is responsible for assembling tx requests given requested function calls, and
for creating signed auth witnesses given action identifiers (message hashes).

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `CompleteAddress` | Address where this account contract is deployed. |
| `publicKeysHash` | `Fr` | Hash of the public keys used to authorize actions. |
| `nodeInfo` | `NodeInfo` | Info on the chain where it is deployed. |

#### Returns

[`AccountInterface`](account.AccountInterface.md)

An account interface instance for creating tx requests and authorizing actions.
