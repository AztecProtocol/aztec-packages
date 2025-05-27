---
id: "AccountContract"
title: "Interface: AccountContract"
sidebar_label: "AccountContract"
sidebar_position: 0
custom_edit_url: null
---

An account contract instance. Knows its artifact, deployment arguments, how to create
transaction execution requests out of function calls, and how to authorize actions.

## Methods

### getAuthWitnessProvider

▸ **getAuthWitnessProvider**(`address`): `AuthWitnessProvider`

Returns the auth witness provider for the given address.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `CompleteAddress` | Address for which to create auth witnesses. |

#### Returns

`AuthWitnessProvider`

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

Returns the artifact of this account contract.

#### Returns

`Promise`\<`ContractArtifact`\>

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<`undefined` \| \{ `constructorArgs`: `any`[] ; `constructorName`: `string`  }\>

Returns the deployment function name and arguments for this instance, or undefined if this contract does not require deployment.

#### Returns

`Promise`\<`undefined` \| \{ `constructorArgs`: `any`[] ; `constructorName`: `string`  }\>

___

### getInterface

▸ **getInterface**(`address`, `nodeInfo`): [`AccountInterface`](AccountInterface.md)

Returns the account interface for this account contract given a deployment at the provided address.
The account interface is responsible for assembling tx requests given requested function calls, and
for creating signed auth witnesses given action identifiers (message hashes).

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `CompleteAddress` | Address where this account contract is deployed. |
| `nodeInfo` | `NodeInfo` | Info on the chain where it is deployed. |

#### Returns

[`AccountInterface`](AccountInterface.md)

An account interface instance for creating tx requests and authorizing actions.
