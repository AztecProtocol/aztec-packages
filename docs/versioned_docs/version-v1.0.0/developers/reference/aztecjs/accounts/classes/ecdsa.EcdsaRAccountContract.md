---
id: "ecdsa.EcdsaRAccountContract"
title: "Class: EcdsaRAccountContract"
sidebar_label: "EcdsaRAccountContract"
custom_edit_url: null
---

[ecdsa](../modules/ecdsa.md).EcdsaRAccountContract

Account contract that authenticates transactions using ECDSA signatures
verified against a secp256k1 public key stored in an immutable encrypted note.
Eagerly loads the contract artifact

## Hierarchy

- `EcdsaRBaseAccountContract`

  ↳ **`EcdsaRAccountContract`**

## Constructors

### constructor

• **new EcdsaRAccountContract**(`signingPrivateKey`): [`EcdsaRAccountContract`](ecdsa.EcdsaRAccountContract.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> |

#### Returns

[`EcdsaRAccountContract`](ecdsa.EcdsaRAccountContract.md)

#### Overrides

EcdsaRBaseAccountContract.constructor

## Methods

### getAuthWitnessProvider

▸ **getAuthWitnessProvider**(`_address`): `AuthWitnessProvider`

#### Parameters

| Name | Type |
| :------ | :------ |
| `_address` | `CompleteAddress` |

#### Returns

`AuthWitnessProvider`

#### Inherited from

EcdsaRBaseAccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Overrides

EcdsaRBaseAccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Returns

`Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Inherited from

EcdsaRBaseAccountContract.getDeploymentFunctionAndArgs

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

EcdsaRBaseAccountContract.getInterface
