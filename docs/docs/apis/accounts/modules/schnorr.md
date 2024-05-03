---
id: "schnorr"
title: "Module: schnorr"
sidebar_label: "schnorr"
sidebar_position: 0
custom_edit_url: null
---

The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
This is the suggested account contract type for most use cases within Aztec.

## Classes

- [SchnorrAccountContract](../classes/schnorr.SchnorrAccountContract.md)

## Variables

### SchnorrAccountContractArtifact

• `Const` **SchnorrAccountContractArtifact**: `ContractArtifact`

## Functions

### getSchnorrAccount

▸ **getSchnorrAccount**(`pxe`, `secretKey`, `signingPrivateKey`, `salt?`): `AccountManager`

Creates an Account Manager that relies on a Grumpkin signing key for authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPrivateKey` | `Fq` | Grumpkin key used for signing transactions. |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`AccountManager`

___

### getSchnorrWallet

▸ **getSchnorrWallet**(`pxe`, `address`, `signingPrivateKey`): `Promise`\<`AccountWallet`\>

Gets a wallet for an already registered account using Schnorr signatures.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `address` | `AztecAddress` | Address for the account. |
| `signingPrivateKey` | `Fq` | Grumpkin key used for signing transactions. |

#### Returns

`Promise`\<`AccountWallet`\>

A wallet for this account that can be used to interact with a contract instance.
