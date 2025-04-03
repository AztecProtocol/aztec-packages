---
id: "single_key"
title: "Module: single_key"
sidebar_label: "single_key"
sidebar_position: 0
custom_edit_url: null
---

The `@aztec/accounts/single_key` export provides a testing account contract implementation that uses a single Grumpkin key for both authentication and encryption.
It is not recommended to use this account type in production.

## Classes

- [SingleKeyAccountContract](../classes/single_key.SingleKeyAccountContract.md)

## Variables

### SchnorrSingleKeyAccountContractArtifact

• `Const` **SchnorrSingleKeyAccountContractArtifact**: `ContractArtifact`

## Functions

### getUnsafeSchnorrAccount

▸ **getUnsafeSchnorrAccount**(`pxe`, `secretKey`, `salt?`): `Promise`\<`AccountManager`\>

Creates an Account that uses the same Grumpkin key for encryption and authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys (in this case also used to get signing key). |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountManager`\>

An account manager initialized with the account contract and its deployment params

___

### getUnsafeSchnorrWallet

▸ **getUnsafeSchnorrWallet**(`pxe`, `address`, `signingPrivateKey`): `Promise`\<`AccountWallet`\>

Gets a wallet for an already registered account using Schnorr signatures with a single key for encryption and authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `address` | `AztecAddress` | Address for the account. |
| `signingPrivateKey` | `Fq` | Grumpkin key used for note encryption and signing transactions. |

#### Returns

`Promise`\<`AccountWallet`\>

A wallet for this account that can be used to interact with a contract instance.
