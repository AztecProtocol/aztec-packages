---
id: "account.AccountInterface"
title: "Interface: AccountInterface"
sidebar_label: "AccountInterface"
custom_edit_url: null
---

[account](../modules/account.md).AccountInterface

Handler for interfacing with an account. Knows how to create transaction execution
requests and authorize actions for its corresponding account.

## Hierarchy

- [`AuthWitnessProvider`](account.AuthWitnessProvider.md)

- `EntrypointInterface`

  ↳ **`AccountInterface`**

## Methods

### createAuthWit

▸ **createAuthWit**(`messageHashOrIntent`): `Promise`\<`AuthWitness`\>

Computes an authentication witness from either a message hash or an intent (caller and an action).
If a message hash is provided, it will create a witness for that directly.
Otherwise, it will compute the message hash using the caller and the action of the intent.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `messageHashOrIntent` | `Fr` \| `Buffer` \| \{ `action`: `FunctionCall` \| [`ContractFunctionInteraction`](../classes/contract.ContractFunctionInteraction.md) ; `caller`: `AztecAddress` ; `chainId?`: `Fr` ; `version?`: `Fr`  } | The message hash or the intent (caller and action) to approve |

#### Returns

`Promise`\<`AuthWitness`\>

The authentication witness

#### Inherited from

[AuthWitnessProvider](account.AuthWitnessProvider.md).[createAuthWit](account.AuthWitnessProvider.md#createauthwit)

___

### createTxExecutionRequest

▸ **createTxExecutionRequest**(`execution`): `Promise`\<`TxExecutionRequest`\>

Generates an execution request out of set of function calls.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `execution` | `ExecutionRequestInit` | The execution intents to be run. |

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

### getPublicKeysHash

▸ **getPublicKeysHash**(): `Fr`

Returns the public keys hash for this account.

#### Returns

`Fr`

___

### getVersion

▸ **getVersion**(): `Fr`

Returns the rollup version for this account

#### Returns

`Fr`
