---
id: "account.AuthWitnessProvider"
title: "Interface: AuthWitnessProvider"
sidebar_label: "AuthWitnessProvider"
custom_edit_url: null
---

[account](../modules/account.md).AuthWitnessProvider

Creates authorization witnesses.

## Hierarchy

- **`AuthWitnessProvider`**

  ↳ [`AccountInterface`](account.AccountInterface.md)

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
