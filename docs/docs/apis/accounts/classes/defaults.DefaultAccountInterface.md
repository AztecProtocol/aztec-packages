---
id: "defaults.DefaultAccountInterface"
title: "Class: DefaultAccountInterface"
sidebar_label: "DefaultAccountInterface"
custom_edit_url: null
---

[defaults](../modules/defaults.md).DefaultAccountInterface

Default implementation for an account interface. Requires that the account uses the default
entrypoint signature, which accept an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module

## Implements

- `AccountInterface`

## Constructors

### constructor

• **new DefaultAccountInterface**(`authWitnessProvider`, `address`, `publicKeysHash`, `nodeInfo`): [`DefaultAccountInterface`](defaults.DefaultAccountInterface.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `authWitnessProvider` | `AuthWitnessProvider` |
| `address` | `CompleteAddress` |
| `publicKeysHash` | `Fr` |
| `nodeInfo` | `Pick`\<`NodeInfo`, ``"chainId"`` \| ``"protocolVersion"``\> |

#### Returns

[`DefaultAccountInterface`](defaults.DefaultAccountInterface.md)

## Properties

### address

• `Private` **address**: `CompleteAddress`

___

### authWitnessProvider

• `Private` **authWitnessProvider**: `AuthWitnessProvider`

___

### chainId

• `Private` **chainId**: `Fr`

___

### entrypoint

• `Private` **entrypoint**: `EntrypointInterface`

___

### publicKeysHash

• `Private` **publicKeysHash**: `Fr`

___

### version

• `Private` **version**: `Fr`

## Methods

### createAuthWit

▸ **createAuthWit**(`messageHash`): `Promise`\<`AuthWitness`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `messageHash` | `Fr` |

#### Returns

`Promise`\<`AuthWitness`\>

#### Implementation of

AccountInterface.createAuthWit

___

### createTxExecutionRequest

▸ **createTxExecutionRequest**(`execution`): `Promise`\<`TxExecutionRequest`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `execution` | `ExecutionRequestInit` |

#### Returns

`Promise`\<`TxExecutionRequest`\>

#### Implementation of

AccountInterface.createTxExecutionRequest

___

### getAddress

▸ **getAddress**(): `AztecAddress`

#### Returns

`AztecAddress`

#### Implementation of

AccountInterface.getAddress

___

### getChainId

▸ **getChainId**(): `Fr`

#### Returns

`Fr`

#### Implementation of

AccountInterface.getChainId

___

### getCompleteAddress

▸ **getCompleteAddress**(): `CompleteAddress`

#### Returns

`CompleteAddress`

#### Implementation of

AccountInterface.getCompleteAddress

___

### getPublicKeysHash

▸ **getPublicKeysHash**(): `Fr`

#### Returns

`Fr`

#### Implementation of

AccountInterface.getPublicKeysHash

___

### getVersion

▸ **getVersion**(): `Fr`

#### Returns

`Fr`

#### Implementation of

AccountInterface.getVersion
