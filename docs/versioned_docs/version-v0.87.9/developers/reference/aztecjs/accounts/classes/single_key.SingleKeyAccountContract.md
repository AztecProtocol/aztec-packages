---
id: "single_key.SingleKeyAccountContract"
title: "Class: SingleKeyAccountContract"
sidebar_label: "SingleKeyAccountContract"
custom_edit_url: null
---

[single\_key](../modules/single_key.md).SingleKeyAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against
the note encryption key, relying on a single private key for both encryption and authentication.
Eagerly loads the contract artifact

## Hierarchy

- `SingleKeyBaseAccountContract`

  ↳ **`SingleKeyAccountContract`**

## Constructors

### constructor

• **new SingleKeyAccountContract**(`signingPrivateKey`): [`SingleKeyAccountContract`](single_key.SingleKeyAccountContract.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `signingPrivateKey` | `Fq` |

#### Returns

[`SingleKeyAccountContract`](single_key.SingleKeyAccountContract.md)

#### Overrides

SingleKeyBaseAccountContract.constructor

## Methods

### getAuthWitnessProvider

▸ **getAuthWitnessProvider**(`account`): `AuthWitnessProvider`

#### Parameters

| Name | Type |
| :------ | :------ |
| `account` | `CompleteAddress` |

#### Returns

`AuthWitnessProvider`

#### Inherited from

SingleKeyBaseAccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Overrides

SingleKeyBaseAccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<`undefined`\>

#### Returns

`Promise`\<`undefined`\>

#### Inherited from

SingleKeyBaseAccountContract.getDeploymentFunctionAndArgs

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

#### Inherited from

SingleKeyBaseAccountContract.getInterface
