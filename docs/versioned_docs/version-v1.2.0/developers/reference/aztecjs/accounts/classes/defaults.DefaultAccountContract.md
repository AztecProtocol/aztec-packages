---
id: "defaults.DefaultAccountContract"
title: "Class: DefaultAccountContract"
sidebar_label: "DefaultAccountContract"
custom_edit_url: null
---

[defaults](../modules/defaults.md).DefaultAccountContract

Base class for implementing an account contract. Requires that the account uses the
default entrypoint method signature.

## Implements

- `AccountContract`

## Constructors

### constructor

• **new DefaultAccountContract**(): [`DefaultAccountContract`](defaults.DefaultAccountContract.md)

#### Returns

[`DefaultAccountContract`](defaults.DefaultAccountContract.md)

## Methods

### getAuthWitnessProvider

▸ **getAuthWitnessProvider**(`address`): `AuthWitnessProvider`

#### Parameters

| Name | Type |
| :------ | :------ |
| `address` | `CompleteAddress` |

#### Returns

`AuthWitnessProvider`

#### Implementation of

AccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Implementation of

AccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<`undefined` \| \{ `constructorArgs`: `any`[] ; `constructorName`: `string`  }\>

#### Returns

`Promise`\<`undefined` \| \{ `constructorArgs`: `any`[] ; `constructorName`: `string`  }\>

#### Implementation of

AccountContract.getDeploymentFunctionAndArgs

___

### getInterface

▸ **getInterface**(`address`, `nodeInfo`): `AccountInterface`

#### Parameters

| Name | Type |
| :------ | :------ |
| `address` | `CompleteAddress` |
| `nodeInfo` | `NodeInfo` |

#### Returns

`AccountInterface`

#### Implementation of

AccountContract.getInterface
