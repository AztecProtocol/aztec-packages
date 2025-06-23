---
id: "AccountInterface"
title: "Interface: AccountInterface"
sidebar_label: "AccountInterface"
sidebar_position: 0
custom_edit_url: null
---

Handler for interfacing with an account. Knows how to create transaction execution
requests and authorize actions for its corresponding account.

## Hierarchy

- `EntrypointInterface`

- `AuthWitnessProvider`

  ↳ **`AccountInterface`**

## Methods

### createAuthWit

▸ **createAuthWit**(`messageHash`): `Promise`\<`AuthWitness`\>

Computes an authentication witness from either a message hash

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `messageHash` | `Fr` \| `Buffer`\<`ArrayBufferLike`\> | The message hash to approve |

#### Returns

`Promise`\<`AuthWitness`\>

The authentication witness

#### Inherited from

AuthWitnessProvider.createAuthWit

___

### createTxExecutionRequest

▸ **createTxExecutionRequest**(`exec`, `fee`, `options`): `Promise`\<`TxExecutionRequest`\>

Generates an execution request out of set of function calls.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `exec` | `ExecutionPayload` | The execution intents to be run. |
| `fee` | `FeeOptions` | The fee options for the transaction. |
| `options` | `TxExecutionOptions` | Transaction nonce and whether the transaction is cancellable. |

#### Returns

`Promise`\<`TxExecutionRequest`\>

The authenticated transaction execution request.

#### Inherited from

EntrypointInterface.createTxExecutionRequest

___

### getAddress

▸ **getAddress**(): `AztecAddress`

Returns the address for this account.

#### Returns

`AztecAddress`

___

### getChainId

▸ **getChainId**(): `Fr`

Returns the chain id for this account

#### Returns

`Fr`

___

### getCompleteAddress

▸ **getCompleteAddress**(): `CompleteAddress`

Returns the complete address for this account.

#### Returns

`CompleteAddress`

___

### getVersion

▸ **getVersion**(): `Fr`

Returns the rollup version for this account

#### Returns

`Fr`
