---
id: "contract.Contract"
title: "Class: Contract"
sidebar_label: "Contract"
custom_edit_url: null
---

[contract](../modules/contract.md).Contract

The Contract class represents a contract and provides utility methods for interacting with it.
It enables the creation of ContractFunctionInteraction instances for each function in the contract's ABI,
allowing users to call or send transactions to these functions. Additionally, the Contract class can be used
to attach the contract instance to a deployed contract on-chain through the PXE, which facilitates
interaction with Aztec's privacy protocol.

## Hierarchy

- [`ContractBase`](contract.ContractBase.md)

  ↳ **`Contract`**

## Constructors

### constructor

• **new Contract**(`instance`, `artifact`, `wallet`): [`Contract`](contract.Contract.md)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `instance` | `ContractInstanceWithAddress` | The deployed contract instance definition. |
| `artifact` | `ContractArtifact` | The Application Binary Interface for the contract. |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | The wallet used for interacting with this contract. |

#### Returns

[`Contract`](contract.Contract.md)

#### Inherited from

[ContractBase](contract.ContractBase.md).[constructor](contract.ContractBase.md#constructor)

## Properties

### artifact

• `Readonly` **artifact**: `ContractArtifact`

The Application Binary Interface for the contract.

#### Inherited from

[ContractBase](contract.ContractBase.md).[artifact](contract.ContractBase.md#artifact)

___

### instance

• `Readonly` **instance**: `ContractInstanceWithAddress`

The deployed contract instance definition.

#### Inherited from

[ContractBase](contract.ContractBase.md).[instance](contract.ContractBase.md#instance)

___

### methods

• **methods**: `Object` = `{}`

An object containing contract methods mapped to their respective names.

#### Index signature

▪ [name: `string`]: [`ContractMethod`](../modules/contract.md#contractmethod)

#### Inherited from

[ContractBase](contract.ContractBase.md).[methods](contract.ContractBase.md#methods)

___

### wallet

• `Protected` **wallet**: [`Wallet`](../modules/account.md#wallet)

The wallet used for interacting with this contract.

#### Inherited from

[ContractBase](contract.ContractBase.md).[wallet](contract.ContractBase.md#wallet)

## Accessors

### address

• `get` **address**(): `AztecAddress`

Address of the contract.

#### Returns

`AztecAddress`

#### Inherited from

ContractBase.address

___

### partialAddress

• `get` **partialAddress**(): `Fr`

Partial address of the contract.

#### Returns

`Fr`

#### Inherited from

ContractBase.partialAddress

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

#### Inherited from

[ContractBase](contract.ContractBase.md).[withWallet](contract.ContractBase.md#withwallet)

___

### at

▸ **at**(`address`, `artifact`, `wallet`): `Promise`\<[`Contract`](contract.Contract.md)\>

Creates a contract instance.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `AztecAddress` | The deployed contract's address. |
| `artifact` | `ContractArtifact` | Build artifact of the contract. |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | The wallet to use when interacting with the contract. |

#### Returns

`Promise`\<[`Contract`](contract.Contract.md)\>

A promise that resolves to a new Contract instance.

___

### deploy

▸ **deploy**(`wallet`, `artifact`, `args`, `constructorName?`): [`DeployMethod`](contract.DeployMethod.md)\<[`Contract`](contract.Contract.md)\>

Creates a tx to deploy a new instance of a contract.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | The wallet for executing the deployment. |
| `artifact` | `ContractArtifact` | Build artifact of the contract to deploy |
| `args` | `any`[] | Arguments for the constructor. |
| `constructorName?` | `string` | The name of the constructor function to call. |

#### Returns

[`DeployMethod`](contract.DeployMethod.md)\<[`Contract`](contract.Contract.md)\>

___

### deployWithPublicKeysHash

▸ **deployWithPublicKeysHash**(`publicKeysHash`, `wallet`, `artifact`, `args`, `constructorName?`): [`DeployMethod`](contract.DeployMethod.md)\<[`Contract`](contract.Contract.md)\>

Creates a tx to deploy a new instance of a contract using the specified public keys hash to derive the address.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `publicKeysHash` | `Fr` | Hash of public keys to use for deriving the address. |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | The wallet for executing the deployment. |
| `artifact` | `ContractArtifact` | Build artifact of the contract. |
| `args` | `any`[] | Arguments for the constructor. |
| `constructorName?` | `string` | The name of the constructor function to call. |

#### Returns

[`DeployMethod`](contract.DeployMethod.md)\<[`Contract`](contract.Contract.md)\>
