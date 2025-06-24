---
id: "schnorr.SchnorrAccountContract"
title: "Class: SchnorrAccountContract"
sidebar_label: "SchnorrAccountContract"
custom_edit_url: null
---

[schnorr](../modules/schnorr.md).SchnorrAccountContract

Account contract that authenticates transactions using Schnorr signatures
verified against a Grumpkin public key stored in an immutable encrypted note.
Eagerly loads the contract artifact

## Hierarchy

- `SchnorrBaseAccountContract`

  ↳ **`SchnorrAccountContract`**

## Constructors

### constructor

• **new SchnorrAccountContract**(`signingPrivateKey`): [`SchnorrAccountContract`](schnorr.SchnorrAccountContract.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `signingPrivateKey` | `Fq` |

#### Returns

[`SchnorrAccountContract`](schnorr.SchnorrAccountContract.md)

#### Overrides

SchnorrBaseAccountContract.constructor

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

SchnorrBaseAccountContract.getAuthWitnessProvider

___

### getContractArtifact

▸ **getContractArtifact**(): `Promise`\<`ContractArtifact`\>

#### Returns

`Promise`\<`ContractArtifact`\>

#### Overrides

SchnorrBaseAccountContract.getContractArtifact

___

### getDeploymentFunctionAndArgs

▸ **getDeploymentFunctionAndArgs**(): `Promise`\<\{ `constructorArgs`: `Fr`[] ; `constructorName`: `string` = 'constructor' }\>

#### Returns

`Promise`\<\{ `constructorArgs`: `Fr`[] ; `constructorName`: `string` = 'constructor' }\>

#### Inherited from

SchnorrBaseAccountContract.getDeploymentFunctionAndArgs

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

SchnorrBaseAccountContract.getInterface
