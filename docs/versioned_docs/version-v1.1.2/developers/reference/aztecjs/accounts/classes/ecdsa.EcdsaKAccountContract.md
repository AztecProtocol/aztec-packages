---
id: "ecdsa.EcdsaKAccountContract"
title: "Class: EcdsaKAccountContract"
sidebar_label: "EcdsaKAccountContract"
custom_edit_url: null
---

[ecdsa](../modules/ecdsa.md).EcdsaKAccountContract

Account contract that authenticates transactions using ECDSA signatures
verified against a secp256k1 public key stored in an immutable encrypted note.
Eagerly loads the contract artifact

## Hierarchy

- `EcdsaKBaseAccountContract`

  ↳ **`EcdsaKAccountContract`**

## Constructors

### constructor

• **new EcdsaKAccountContract**(`signingPrivateKey`): [`EcdsaKAccountContract`](ecdsa.EcdsaKAccountContract.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> |

#### Returns

[`EcdsaKAccountContract`](ecdsa.EcdsaKAccountContract.md)

#### Overrides

EcdsaKBaseAccountContract.constructor

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

EcdsaKBaseAccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Overrides

EcdsaKBaseAccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Returns

`Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Inherited from

EcdsaKBaseAccountContract.getDeploymentFunctionAndArgs

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

EcdsaKBaseAccountContract.getInterface
