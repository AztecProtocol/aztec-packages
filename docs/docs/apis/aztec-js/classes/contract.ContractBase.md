---
id: "contract.ContractBase"
title: "Class: ContractBase"
sidebar_label: "ContractBase"
custom_edit_url: null
---

[contract](../modules/contract.md).ContractBase

Abstract implementation of a contract extended by the Contract class and generated contract types.

## Hierarchy

- **`ContractBase`**

  ↳ [`Contract`](contract.Contract.md)

## Constructors

### constructor

• **new ContractBase**(`instance`, `artifact`, `wallet`): [`ContractBase`](contract.ContractBase.md)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `instance` | `ContractInstanceWithAddress` | The deployed contract instance definition. |
| `artifact` | `ContractArtifact` | The Application Binary Interface for the contract. |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | The wallet used for interacting with this contract. |

#### Returns

[`ContractBase`](contract.ContractBase.md)

## Properties

### artifact

• `Readonly` **artifact**: `ContractArtifact`

The Application Binary Interface for the contract.

___

### instance

• `Readonly` **instance**: `ContractInstanceWithAddress`

The deployed contract instance definition.

___

### methods

• **methods**: `Object` = `{}`

An object containing contract methods mapped to their respective names.

#### Index signature

▪ [name: `string`]: [`ContractMethod`](../modules/contract.md#contractmethod)

___

### wallet

• `Protected` **wallet**: [`Wallet`](../modules/account.md#wallet)

The wallet used for interacting with this contract.

## Accessors

### address

• `get` **address**(): `AztecAddress`

Address of the contract.

#### Returns

`AztecAddress`

___

### partialAddress

• `get` **partialAddress**(): `Fr`

Partial address of the contract.

#### Returns

`Fr`

## Methods

### withWallet

▸ **withWallet**(`wallet`): `this`

Creates a new instance of the contract wrapper attached to a different wallet.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | Wallet to use for sending txs. |

#### Returns

`this`

A new contract instance.
