---
id: "ecdsa.EcdsaRSSHAccountContract"
title: "Class: EcdsaRSSHAccountContract"
sidebar_label: "EcdsaRSSHAccountContract"
custom_edit_url: null
---

[ecdsa](../modules/ecdsa.md).EcdsaRSSHAccountContract

Account contract that authenticates transactions using ECDSA signatures
verified against a secp256r1 public key stored in an immutable encrypted note.
Since this implementation relays signatures to an SSH agent, we provide the
public key here not for signature verification, but to identify actual identity
that will be used to sign authwitnesses.
Eagerly loads the contract artifact

## Hierarchy

- `EcdsaRSSHBaseAccountContract`

  ↳ **`EcdsaRSSHAccountContract`**

## Constructors

### constructor

• **new EcdsaRSSHAccountContract**(`signingPrivateKey`): [`EcdsaRSSHAccountContract`](ecdsa.EcdsaRSSHAccountContract.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> |

#### Returns

[`EcdsaRSSHAccountContract`](ecdsa.EcdsaRSSHAccountContract.md)

#### Overrides

EcdsaRSSHBaseAccountContract.constructor

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

EcdsaRSSHBaseAccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Overrides

EcdsaRSSHBaseAccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Returns

`Promise`\<\{ `constructorArgs`: `Buffer`\<`ArrayBufferLike`\>[] ; `constructorName`: `string` = 'constructor' }\>

#### Inherited from

EcdsaRSSHBaseAccountContract.getDeploymentFunctionAndArgs

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

EcdsaRSSHBaseAccountContract.getInterface
