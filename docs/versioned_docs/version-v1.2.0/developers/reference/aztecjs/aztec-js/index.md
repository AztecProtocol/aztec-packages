---
id: "index"
title: "@aztec/aztec.js"
sidebar_label: "Table of Contents"
sidebar_position: 0.5
hide_table_of_contents: true
custom_edit_url: null
---

The `account` module provides utilities for managing accounts. The AccountManager class
allows to deploy and register a fresh account, or to obtain a `Wallet` instance out of an account
already deployed. Use the `@aztec/accounts` package to load default account implementations that rely
on ECDSA or Schnorr signatures.

## Interfaces

- [AccountContract](interfaces/AccountContract.md)
- [AccountInterface](interfaces/AccountInterface.md)

## Type Aliases

### Salt

Ƭ **Salt**: `Fr` \| `number` \| `bigint`

A contract deployment salt.

## Functions

### getAccountContractAddress

▸ **getAccountContractAddress**(`accountContract`, `secret`, `salt`): `Promise`\<`AztecAddress`\>

Compute the address of an account contract from secret and salt.

#### Parameters

| Name | Type |
| :------ | :------ |
| `accountContract` | [`AccountContract`](interfaces/AccountContract.md) |
| `secret` | `Fr` |
| `salt` | `Fr` |

#### Returns

`Promise`\<`AztecAddress`\>
