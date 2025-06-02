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

▸ **getSchnorrAccount**(`pxe`, `secretKey`, `signingPrivateKey`, `salt?`): `Promise`\<`AccountManager`\>

Creates an Account Manager that relies on a Grumpkin signing key for authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPrivateKey` | `Fq` | Grumpkin key used for signing transactions. |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountManager`\>

An account manager initialized with the account contract and its deployment params

___

### getSchnorrAccountContractAddress

▸ **getSchnorrAccountContractAddress**(`secret`, `salt`, `signingPrivateKey?`): `Promise`\<`AztecAddress`\>

Compute the address of a schnorr account contract.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `secret` | `Fr` | A seed for deriving the signing key and public keys. |
| `salt` | `Fr` | The contract address salt. |
| `signingPrivateKey?` | `Fq` | A specific signing private key that's not derived from the secret. |

#### Returns

`Promise`\<`AztecAddress`\>

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

___

### getSchnorrWalletWithSecretKey

▸ **getSchnorrWalletWithSecretKey**(`pxe`, `secretKey`, `signingPrivateKey`, `salt`): `Promise`\<`AccountWalletWithSecretKey`\>

Gets a wallet for an already registered account using Schnorr signatures.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPrivateKey` | `Fq` | Grumpkin key used for signing transactions. |
| `salt` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountWalletWithSecretKey`\>

A wallet for this account that can be used to interact with a contract instance.
